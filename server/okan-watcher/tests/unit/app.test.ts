import { APIGatewayProxyResult } from 'aws-lambda'
import { App } from '../../app'
import sinon from 'sinon'

describe('App test', () => {
  const repositoryMock = {
    save: async () => {
      return
    },
  }
  let repositoryMockSave

  beforeEach(() => {
    repositoryMockSave = sinon.stub(repositoryMock, 'save').resolves()
  })

  afterEach(() => {
    sinon.restore()
  })

  it('data is saved', async () => {
    const result: APIGatewayProxyResult = await new App(repositoryMock).run(JSON.stringify({
      type: 'magnet',
      src_address: '00112233',
      battery: 42,
      pole: 1,
      changed: true,
    }))
    expect(repositoryMockSave.calledOnceWith({
      deviceAddress: '00112233',
      battery: 42,
      status: 'closed',
      changed: true,
    })).toBeTruthy()
    expect(result.statusCode).toEqual(200)
  })

  it('error on saving data', async () => {
    repositoryMockSave.rejects(new Error('save error'))
    const result: APIGatewayProxyResult = await new App(repositoryMock).run(JSON.stringify({
      type: 'magnet',
      src_address: '00112233',
      battery: 42,
      pole: 1,
      changed: true,
    }))
    expect(repositoryMockSave.called).toBeTruthy()
    expect(result.statusCode).toEqual(500)
  })

  it('error on invalid message format', async () => {
    const result: APIGatewayProxyResult = await new App(repositoryMock).run('this is not JSON')
    expect(repositoryMockSave.called).toBeFalsy()
    expect(result.statusCode).toEqual(400)
  })
})
