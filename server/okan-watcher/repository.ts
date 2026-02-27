import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import MagnetSensorData from './measured-data'

export interface RepositoryInterface {
  /**
   * @param data ストレージに保存する計測データ
   * @throws ストレージへの保存に失敗した場合
   */
  save(data: MagnetSensorData): Promise<void>
}

type StateUpdate = {
  updateExpression: string
  expressionAttributeValues: Record<string, string | number>
}

export class Repository implements RepositoryInterface {
  private readonly batteryDailyTableName: string
  private readonly openCloseEventsTableName: string
  private readonly deviceStateTableName: string
  private readonly batteryTtlDays: number
  private readonly eventTtlDays: number
  private readonly writeClient: DynamoDBDocumentClient

  constructor(
    batteryDailyTableName = process.env.BATTERY_DAILY_TABLE_NAME || '',
    openCloseEventsTableName = process.env.OPEN_CLOSE_EVENTS_TABLE_NAME || '',
    deviceStateTableName = process.env.DEVICE_STATE_TABLE_NAME || '',
    batteryTtlDays = parseInt(process.env.BATTERY_TTL_DAYS || '3650', 10),
    eventTtlDays = parseInt(process.env.EVENT_TTL_DAYS || '1825', 10),
    writeClient = DynamoDBDocumentClient.from(new DynamoDBClient()),
  ) {
    this.batteryDailyTableName = batteryDailyTableName
    this.openCloseEventsTableName = openCloseEventsTableName
    this.deviceStateTableName = deviceStateTableName
    this.batteryTtlDays = isNaN(batteryTtlDays) ? 3650 : batteryTtlDays
    this.eventTtlDays = isNaN(eventTtlDays) ? 1825 : eventTtlDays
    this.writeClient = writeClient
  }

  /**
   * @throws ストレージへの保存に失敗した場合
   */
  async save(data: MagnetSensorData): Promise<void> {
    if (this.batteryDailyTableName === '' || this.openCloseEventsTableName === '' || this.deviceStateTableName === '') {
      throw new Error('DynamoDB table names are not configured')
    }

    const now = new Date()
    const recordedAt = now.toISOString()
    const sampleDate = this.toJstDate(now)
    const jstHour = this.toJstHour(now)
    const batteryTtlEpochSec = Math.floor((now.getTime() + this.batteryTtlDays * 24 * 60 * 60 * 1000) / 1000)
    const eventTtlEpochSec = Math.floor((now.getTime() + this.eventTtlDays * 24 * 60 * 60 * 1000) / 1000)
    const stateUpdate = this.buildStateUpdate(data.status, data.changed, recordedAt, data.battery)

    const transactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Update: {
          TableName: this.deviceStateTableName,
          Key: {
            deviceAddress: data.deviceAddress,
            stateKey: 'STATE#magnet',
          },
          UpdateExpression: stateUpdate.updateExpression,
          ExpressionAttributeValues: stateUpdate.expressionAttributeValues,
        },
      },
      {
        Update: {
          TableName: this.batteryDailyTableName,
          Key: {
            deviceAddress: data.deviceAddress,
            sampleDate,
          },
          UpdateExpression: 'SET lastBattery = :battery, sampledAt = :recordedAt, updatedAt = :updatedAt, ttlEpochSec = :ttlEpochSec',
          ExpressionAttributeValues: {
            ':battery': data.battery,
            ':recordedAt': recordedAt,
            ':updatedAt': recordedAt,
            ':ttlEpochSec': batteryTtlEpochSec,
          },
        },
      },
    ]

    if (data.changed) {
      transactItems.push({
        Put: {
          TableName: this.openCloseEventsTableName,
          Item: {
            deviceAddress: data.deviceAddress,
            changedAt: recordedAt,
            status: data.status,
            jstDate: sampleDate,
            jstHour,
            ttlEpochSec: eventTtlEpochSec,
          },
        },
      })
    }

    const params: TransactWriteCommandInput = {
      TransactItems: transactItems,
    }
    await this.writeClient.send(new TransactWriteCommand(params))
  }

  private buildStateUpdate(status: 'open' | 'closed', changed: boolean, recordedAt: string, battery: number): StateUpdate {
    const setExpressions = [
      'currentStatus = :status',
      'lastSeenAt = :recordedAt',
      'lastBattery = :battery',
      'updatedAt = :updatedAt',
    ]
    const expressionAttributeValues: Record<string, string | number> = {
      ':status': status,
      ':recordedAt': recordedAt,
      ':battery': battery,
      ':updatedAt': recordedAt,
    }

    if (changed) {
      setExpressions.push('lastChangedAt = :recordedAt')
      if (status === 'open') {
        setExpressions.push('lastOpenAt = :recordedAt')
      }
      else {
        setExpressions.push('lastClosedAt = :recordedAt')
      }
    }

    return {
      updateExpression: `SET ${setExpressions.join(', ')}`,
      expressionAttributeValues,
    }
  }

  private toJstDate(date: Date): string {
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000)
    return jstDate.toISOString().slice(0, 10)
  }

  private toJstHour(date: Date): string {
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000)
    return jstDate.toISOString().slice(11, 13)
  }
}
