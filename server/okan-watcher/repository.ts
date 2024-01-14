import { TimestreamWriteClient, WriteRecordsCommand, WriteRecordsRequest, _Record } from '@aws-sdk/client-timestream-write'
import MagnetSensorData from './measured-data'

export interface RepositoryInterface {
  save(data: MagnetSensorData): Promise<void>
}

export class Repository implements RepositoryInterface {
  /**
   * @throws ストレージへの保存に失敗した場合
   */
  async save(data: MagnetSensorData): Promise<void> {
    const writeClient = new TimestreamWriteClient()
    const currentTime = Date.now()

    const dimensions = [
      { Name: 'deviceAddress', Value: data.deviceAddress },
    ]
    const record: _Record = {
      Dimensions: dimensions,
      MeasureName: 'metrics',
      MeasureValues: [
        {
          Name: 'battery',
          Value: data.battery.toString(),
          Type: 'DOUBLE',
        },
        {
          Name: 'status',
          Value: data.status,
          Type: 'VARCHAR',
        },
        {
          Name: 'changed',
          Value: data.changed.toString(),
          Type: 'BOOLEAN',
        },
      ],
      MeasureValueType: 'MULTI',
      Time: currentTime.toString(),
    }

    const records = [record]

    const params: WriteRecordsRequest = {
      DatabaseName: process.env.DATABASE_NAME,
      TableName: process.env.TABLE_NAME,
      Records: records,
    }
    const command = new WriteRecordsCommand(params)
    await writeClient.send(command)
  }
}
