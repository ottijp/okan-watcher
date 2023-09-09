import { decode } from '../../decoder'

describe('decoder test', () => {
  it('success decoding', async () => {
    const message = {
      type: 'magnet',
      src_address: '00112233',
      battery: 42,
      pole: 1,
      changed: true,
    }
    const result = decode(JSON.stringify(message))
    expect(result).toEqual(message)
  })

  it('return null for non-JSON string', async () => {
    const result = decode('this is not JSON')
    expect(result).toBeNull()
  })

  it('return null for invalid format', async () => {
    const message = {
      type: 'magnet',
      src_address: '00112233',
      battery: 42,
      pole: 1,
      // "changed" doesn't exist
    }
    const result = decode(JSON.stringify(message))
    expect(result).toBeNull()
  })
})
