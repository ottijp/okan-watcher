import { APIGatewayRequestAuthorizerEvent } from 'aws-lambda'
import { lambdaHandler } from '../../webui-origin-authorizer'

describe('webui origin authorizer test', () => {
  const originalHeader = process.env.EXPECTED_ORIGIN_VERIFY_HEADER

  afterEach(() => {
    process.env.EXPECTED_ORIGIN_VERIFY_HEADER = originalHeader
  })

  const buildEvent = (headers: Record<string, string>): APIGatewayRequestAuthorizerEvent => {
    return {
      type: 'REQUEST',
      methodArn: 'arn:aws:execute-api:ap-northeast-1:111122223333:example/Prod/GET/api/devices/status',
      resource: '/api/devices/status',
      path: '/api/devices/status',
      httpMethod: 'GET',
      headers,
      multiValueHeaders: {},
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
    }
  }

  it('allows when header matches expected value', async () => {
    process.env.EXPECTED_ORIGIN_VERIFY_HEADER = 'token-123'

    const result = await lambdaHandler(buildEvent({ 'x-origin-verify': 'token-123' }))

    expect(result.policyDocument.Statement[0].Effect).toEqual('Allow')
  })

  it('denies when header does not match expected value', async () => {
    process.env.EXPECTED_ORIGIN_VERIFY_HEADER = 'token-123'

    const result = await lambdaHandler(buildEvent({ 'x-origin-verify': 'wrong' }))

    expect(result.policyDocument.Statement[0].Effect).toEqual('Deny')
  })

  it('allows case-insensitive header key', async () => {
    process.env.EXPECTED_ORIGIN_VERIFY_HEADER = 'token-123'

    const result = await lambdaHandler(buildEvent({ 'X-Origin-Verify': 'token-123' }))

    expect(result.policyDocument.Statement[0].Effect).toEqual('Allow')
  })
})
