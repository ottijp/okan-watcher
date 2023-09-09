import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { decode } from './decoder'

/**
 *
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return await new App().run(event.body || '')
}

export class App {
  async run(rawMessage: string): Promise<APIGatewayProxyResult> {
    // decode request message
    const message = decode(rawMessage)
    if (message === null) {
      return { statusCode: 400, body: '' }
    }

    console.log(`data recieved: ${JSON.stringify(message)}`)
    return { statusCode: 200, body: '' }
  }
}
