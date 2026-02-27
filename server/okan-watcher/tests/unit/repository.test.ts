import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import MagnetSensorData from '../../measured-data'
import { Repository } from '../../repository'
import sinon from 'sinon'

describe('repository test', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('saves changed open event to state, daily battery, and open-close events', async () => {
    const send = sinon.stub().resolves({})
    const now = new Date('2026-02-27T10:00:00.000Z')
    sinon.useFakeTimers(now)
    const repository = new Repository('battery-table', 'events-table', 'state-table', 3650, 1825, { send } as any)

    await repository.save(new MagnetSensorData('00112233', 1940, 'open', true))

    expect(send.calledOnce).toBeTruthy()
    const command = send.firstCall.args[0] as TransactWriteCommand
    const expectedRecordedAt = '2026-02-27T10:00:00.000Z'
    const expectedSampleDate = '2026-02-27'
    const expectedJstHour = '19'
    const expectedBatteryTtl = Math.floor((now.getTime() + 3650 * 24 * 60 * 60 * 1000) / 1000)
    const expectedEventTtl = Math.floor((now.getTime() + 1825 * 24 * 60 * 60 * 1000) / 1000)

    expect(command.input.TransactItems?.length).toEqual(3)
    expect(command.input.TransactItems?.[0].Update?.TableName).toEqual('state-table')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).toContain('currentStatus = :status')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).toContain('lastChangedAt = :recordedAt')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).toContain('lastOpenAt = :recordedAt')
    expect(command.input.TransactItems?.[0].Update?.ExpressionAttributeValues).toEqual({
      ':status': 'open',
      ':recordedAt': expectedRecordedAt,
      ':battery': 1940,
      ':updatedAt': expectedRecordedAt,
    })

    expect(command.input.TransactItems?.[1].Update?.TableName).toEqual('battery-table')
    expect(command.input.TransactItems?.[1].Update?.Key).toEqual({
      deviceAddress: '00112233',
      sampleDate: expectedSampleDate,
    })
    expect(command.input.TransactItems?.[1].Update?.ExpressionAttributeValues).toEqual({
      ':battery': 1940,
      ':recordedAt': expectedRecordedAt,
      ':updatedAt': expectedRecordedAt,
      ':ttlEpochSec': expectedBatteryTtl,
    })

    expect(command.input.TransactItems?.[2].Put?.TableName).toEqual('events-table')
    expect(command.input.TransactItems?.[2].Put?.Item).toEqual({
      deviceAddress: '00112233',
      changedAt: expectedRecordedAt,
      status: 'open',
      jstDate: expectedSampleDate,
      jstHour: expectedJstHour,
      ttlEpochSec: expectedEventTtl,
    })
  })

  it('saves periodic event to state and daily battery without open-close event record', async () => {
    const send = sinon.stub().resolves({})
    sinon.useFakeTimers(new Date('2026-02-27T10:00:00.000Z'))
    const repository = new Repository('battery-table', 'events-table', 'state-table', 3650, 1825, { send } as any)

    await repository.save(new MagnetSensorData('00112233', 1930, 'closed', false))

    const command = send.firstCall.args[0] as TransactWriteCommand
    expect(command.input.TransactItems?.length).toEqual(2)
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).toContain('currentStatus = :status')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).not.toContain('lastChangedAt = :recordedAt')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).not.toContain('lastOpenAt = :recordedAt')
    expect(command.input.TransactItems?.[0].Update?.UpdateExpression).not.toContain('lastClosedAt = :recordedAt')
    expect(command.input.TransactItems?.[1].Update?.TableName).toEqual('battery-table')
    expect(command.input.TransactItems?.[1].Update?.Key).toEqual({
      deviceAddress: '00112233',
      sampleDate: '2026-02-27',
    })
  })

  it('uses JST date and hour for open-close event records', async () => {
    const send = sinon.stub().resolves({})
    const now = new Date('2026-02-27T23:30:00.000Z')
    sinon.useFakeTimers(now)
    const repository = new Repository('battery-table', 'events-table', 'state-table', 3650, 1825, { send } as any)

    await repository.save(new MagnetSensorData('00112233', 1920, 'closed', true))

    const command = send.firstCall.args[0] as TransactWriteCommand
    expect(command.input.TransactItems?.[1].Update?.Key).toEqual({
      deviceAddress: '00112233',
      sampleDate: '2026-02-28',
    })
    expect(command.input.TransactItems?.[2].Put?.Item).toMatchObject({
      jstDate: '2026-02-28',
      jstHour: '08',
    })
  })

  it('throws if table names are not configured', async () => {
    const send = sinon.stub().resolves({})
    const repository = new Repository('', '', '', 3650, 1825, { send } as any)

    await expect(repository.save(new MagnetSensorData('00112233', 1900, 'open', true))).rejects.toThrow()
    expect(send.called).toBeFalsy()
  })
})
