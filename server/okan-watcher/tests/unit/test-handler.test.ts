import { APIGatewayProxyResult } from 'aws-lambda'
import { lambdaHandler } from '../../app'
import { template as eventTemplate } from '../data/event'

describe('Unit test for app handler', function () {
  it('verifies successful response', async () => {
    const result: APIGatewayProxyResult = await lambdaHandler(eventTemplate)

    expect(result.statusCode).toEqual(200)
    expect(result.body).toEqual(
      JSON.stringify({
        message: 'hello world',
      }),
    )
  })
})
