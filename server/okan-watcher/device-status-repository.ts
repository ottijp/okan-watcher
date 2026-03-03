import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, BatchGetCommandInput, DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { DeviceStatusRecord } from './device-status-model'

export interface DeviceStatusRepositoryInterface {
  /**
   * デバイスの最新状態一覧を取得する．
   * 状態テーブルと別名テーブルを結合してWebUI向けの形式に整形する．
   * @throws テーブル名設定不備またはDynamoDB取得失敗時
   */
  listDeviceStatuses(): Promise<DeviceStatusRecord[]>
}

type DeviceStateItem = {
  deviceAddress: string
  stateKey: string
  currentStatus?: 'open' | 'closed'
  lastBattery?: number
  lastSeenAt?: string
  lastChangedAt?: string
}

type DeviceAliasItem = {
  deviceAddress: string
  alias?: string
}

export class DeviceStatusRepository implements DeviceStatusRepositoryInterface {
  private readonly deviceStateTableName: string
  private readonly deviceAliasTableName: string
  private readonly readClient: DynamoDBDocumentClient

  constructor(
    deviceStateTableName = process.env.DEVICE_STATE_TABLE_NAME || '',
    deviceAliasTableName = process.env.DEVICE_ALIAS_TABLE_NAME || '',
    readClient = DynamoDBDocumentClient.from(new DynamoDBClient()),
  ) {
    this.deviceStateTableName = deviceStateTableName
    this.deviceAliasTableName = deviceAliasTableName
    this.readClient = readClient
  }

  /**
   * デバイス状態を取得し，別名を結合して返却する．
   * 返却順は alias 昇順，alias同値時は deviceAddress 昇順である．
   */
  async listDeviceStatuses(): Promise<DeviceStatusRecord[]> {
    if (this.deviceStateTableName === '' || this.deviceAliasTableName === '') {
      throw new Error('DynamoDB table names are not configured')
    }

    const stateItems = await this.scanStateItems()
    if (stateItems.length === 0) {
      return []
    }

    const aliasesByDevice = await this.loadAliasesByDevice(stateItems.map((item) => item.deviceAddress))

    const records = stateItems.map((item) => {
      return {
        deviceAddress: item.deviceAddress,
        alias: aliasesByDevice.get(item.deviceAddress) || null,
        currentStatus: item.currentStatus || null,
        lastBattery: item.lastBattery ?? null,
        lastSeenAt: item.lastSeenAt || null,
        lastChangedAt: item.lastChangedAt || null,
      }
    })

    return records.sort((a, b) => {
      // alias未設定は末尾へ寄せるため，最大側のプレースホルダ文字を使う．
      const aliasA = a.alias || '\uffff'
      const aliasB = b.alias || '\uffff'
      const aliasCompare = aliasA.localeCompare(aliasB, 'ja')
      if (aliasCompare !== 0) {
        return aliasCompare
      }

      return a.deviceAddress.localeCompare(b.deviceAddress)
    })
  }

  /**
   * 状態テーブルから磁気センサ状態のみを全件取得する．
   * Scan結果がページ分割されるため，LastEvaluatedKeyをExclusiveStartKeyへ渡して継続取得する．
   */
  private async scanStateItems(): Promise<DeviceStateItem[]> {
    const stateItems: DeviceStateItem[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined

    do {
      const params: ScanCommandInput = {
        TableName: this.deviceStateTableName,
        FilterExpression: 'stateKey = :stateKey',
        ExpressionAttributeValues: {
          ':stateKey': 'STATE#magnet',
        },
        ProjectionExpression: 'deviceAddress, stateKey, currentStatus, lastBattery, lastSeenAt, lastChangedAt',
        ExclusiveStartKey: exclusiveStartKey,
      }
      const response = await this.readClient.send(new ScanCommand(params))
      const items = (response.Items || []) as DeviceStateItem[]
      stateItems.push(...items)
      // LastEvaluatedKey が存在する間は，次ページの開始キーとして再指定する．
      exclusiveStartKey = response.LastEvaluatedKey
    }
    while (exclusiveStartKey)

    return stateItems
  }

  /**
   * デバイスアドレス配列から，deviceAddress => alias の対応Mapを構築する．
   * BatchGetItemの上限（100キー）に合わせて分割取得する．
   */
  private async loadAliasesByDevice(deviceAddresses: string[]): Promise<Map<string, string>> {
    const aliasesByDevice = new Map<string, string>()

    for (const chunk of this.chunk(deviceAddresses, 100)) {
      const params: BatchGetCommandInput = {
        RequestItems: {
          [this.deviceAliasTableName]: {
            Keys: chunk.map((deviceAddress) => ({ deviceAddress })),
            ProjectionExpression: 'deviceAddress, alias',
          },
        },
      }

      const response = await this.readClient.send(new BatchGetCommand(params))
      const rawItems = response.Responses?.[this.deviceAliasTableName] || []
      const aliasItems = rawItems as DeviceAliasItem[]

      for (const item of aliasItems) {
        // 空文字は未設定として扱う．
        if (item.alias && item.alias !== '') {
          aliasesByDevice.set(item.deviceAddress, item.alias)
        }
      }
    }

    return aliasesByDevice
  }

  /**
   * 配列を固定長で分割する．
   */
  private chunk<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []

    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize))
    }

    return chunks
  }
}
