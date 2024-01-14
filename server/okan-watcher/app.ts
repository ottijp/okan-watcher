import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { decode } from './decoder'
import { RepositoryInterface, Repository } from './repository'

/**
 *
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return await new App().run(event.body || '')
}

export class App {
  repository: RepositoryInterface

  constructor(
    repository = new Repository(),
  ) {
    this.repository = repository
  }

  async run(rawMessage: string): Promise<APIGatewayProxyResult> {
    // decode request message
    const sensorData = decode(rawMessage)
    if (sensorData === null) {
      console.error('invalid message:', rawMessage)
      return { statusCode: 400, body: '' }
    }

    // store sensing data to storage
    try {
      await this.repository.save(sensorData)
      return { statusCode: 200, body: '' }
    }
    catch (e) {
      console.error('保存に失敗')
      console.error(e)
      return { statusCode: 500, body: '' }
    }
  }
}
