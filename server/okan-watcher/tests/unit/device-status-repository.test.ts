import { BatchGetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { DeviceStatusRepository } from '../../device-status-repository'
import sinon from 'sinon'

describe('device status repository test', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('lists device statuses with aliases', async () => {
    const send = sinon.stub()

    send.onFirstCall().resolves({
      Items: [
        {
          deviceAddress: '00112233',
          stateKey: 'STATE#magnet',
          currentStatus: 'open',
          lastBattery: 1940,
          lastSeenAt: '2026-03-02T12:34:56.000Z',
          lastChangedAt: '2026-03-02T10:00:00.000Z',
        },
        {
          deviceAddress: '00aabbcc',
          stateKey: 'STATE#magnet',
          currentStatus: 'closed',
          lastBattery: 1880,
          lastSeenAt: '2026-03-02T13:34:56.000Z',
        },
      ],
    })
    send.onSecondCall().resolves({
      Responses: {
        aliases: [
          {
            deviceAddress: '00112233',
            alias: '玄関',
          },
        ],
      },
    })

    const repository = new DeviceStatusRepository('states', 'aliases', { send } as any)
    const statuses = await repository.listDeviceStatuses()

    expect(send.callCount).toEqual(2)
    expect(send.firstCall.args[0]).toBeInstanceOf(ScanCommand)
    expect(send.secondCall.args[0]).toBeInstanceOf(BatchGetCommand)
    expect(statuses).toEqual([
      {
        deviceAddress: '00112233',
        alias: '玄関',
        currentStatus: 'open',
        lastBattery: 1940,
        lastSeenAt: '2026-03-02T12:34:56.000Z',
        lastChangedAt: '2026-03-02T10:00:00.000Z',
      },
      {
        deviceAddress: '00aabbcc',
        alias: null,
        currentStatus: 'closed',
        lastBattery: 1880,
        lastSeenAt: '2026-03-02T13:34:56.000Z',
        lastChangedAt: null,
      },
    ])
  })

  it('returns empty array when no device states', async () => {
    const send = sinon.stub().resolves({ Items: [] })
    const repository = new DeviceStatusRepository('states', 'aliases', { send } as any)

    const statuses = await repository.listDeviceStatuses()

    expect(statuses).toEqual([])
    expect(send.callCount).toEqual(1)
    expect(send.firstCall.args[0]).toBeInstanceOf(ScanCommand)
  })

  it('throws if table names are not configured', async () => {
    const send = sinon.stub().resolves({})
    const repository = new DeviceStatusRepository('', '', { send } as any)

    await expect(repository.listDeviceStatuses()).rejects.toThrow()
    expect(send.called).toBeFalsy()
  })
})
