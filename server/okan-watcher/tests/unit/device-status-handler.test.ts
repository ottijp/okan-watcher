import { APIGatewayProxyResult } from 'aws-lambda'
import { DeviceStatusApp } from '../../device-status-handler'
import sinon from 'sinon'

describe('device status app test', () => {
  const repositoryMock = {
    listDeviceStatuses: async () => {
      return []
    },
  }
  let repositoryMockList

  beforeEach(() => {
    repositoryMockList = sinon.stub(repositoryMock, 'listDeviceStatuses').resolves([
      {
        deviceAddress: '00112233',
        alias: '玄関',
        currentStatus: 'open',
        lastBattery: 1940,
        lastSeenAt: '2026-03-02T12:34:56.000Z',
        lastChangedAt: '2026-03-02T10:00:00.000Z',
      },
    ])
  })

  afterEach(() => {
    sinon.restore()
  })

  it('returns device status list', async () => {
    const result: APIGatewayProxyResult = await new DeviceStatusApp(repositoryMock).run()

    expect(repositoryMockList.calledOnce).toBeTruthy()
    expect(result.statusCode).toEqual(200)
    expect(JSON.parse(result.body)).toEqual({
      devices: [
        {
          deviceAddress: '00112233',
          alias: '玄関',
          currentStatus: 'open',
          lastBattery: 1940,
          lastSeenAt: '2026-03-02T12:34:56.000Z',
          lastChangedAt: '2026-03-02T10:00:00.000Z',
        },
      ],
    })
  })

  it('returns internal server error on repository error', async () => {
    repositoryMockList.rejects(new Error('load error'))

    const result: APIGatewayProxyResult = await new DeviceStatusApp(repositoryMock).run()

    expect(repositoryMockList.calledOnce).toBeTruthy()
    expect(result.statusCode).toEqual(500)
    expect(JSON.parse(result.body)).toEqual({ message: 'internal server error' })
  })
})
