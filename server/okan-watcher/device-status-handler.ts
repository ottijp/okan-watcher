import { APIGatewayProxyResult } from 'aws-lambda'
import { DeviceStatusRepository, DeviceStatusRepositoryInterface } from './device-status-repository'

export const lambdaHandler = async (): Promise<APIGatewayProxyResult> => {
  return await new DeviceStatusApp().run()
}

export class DeviceStatusApp {
  repository: DeviceStatusRepositoryInterface

  constructor(
    repository = new DeviceStatusRepository(),
  ) {
    this.repository = repository
  }

  /**
   * デバイス状態一覧を返却する．
   * @returns API Gatewayレスポンス
   */
  async run(): Promise<APIGatewayProxyResult> {
    try {
      const devices = await this.repository.listDeviceStatuses()
      return {
        statusCode: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ devices }),
      }
    }
    catch (e) {
      console.error('デバイス状態の取得に失敗')
      console.error(e)
      return {
        statusCode: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ message: 'internal server error' }),
      }
    }
  }
}
