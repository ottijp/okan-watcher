import { APIGatewayRequestAuthorizerEvent } from 'aws-lambda'

type PolicyEffect = 'Allow' | 'Deny'

type AuthorizerResponse = {
  principalId: string
  policyDocument: {
    Version: '2012-10-17'
    Statement: {
      Action: 'execute-api:Invoke'
      Effect: PolicyEffect
      Resource: string
    }[]
  }
}

/**
 * CloudFrontから注入される専用ヘッダを検証し，APIアクセス可否を判定する．
 */
export const lambdaHandler = async (event: APIGatewayRequestAuthorizerEvent): Promise<AuthorizerResponse> => {
  const expected = process.env.EXPECTED_ORIGIN_VERIFY_HEADER || ''
  const actual = findHeaderValue(event.headers || {}, 'x-origin-verify')
  const effect: PolicyEffect = expected !== '' && actual === expected ? 'Allow' : 'Deny'

  return {
    principalId: 'webui-origin',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: event.methodArn,
        },
      ],
    },
  }
}

const findHeaderValue = (headers: Record<string, string | undefined>, targetHeaderName: string): string => {
  const targetLower = targetHeaderName.toLowerCase()

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === targetLower) {
      return value || ''
    }
  }

  return ''
}
