import { isRight } from 'fp-ts/lib/Either'
import MagnetSensorData from './measured-data'
import * as t from 'io-ts'

const RawMessage = t.type({
  type: t.literal('magnet'),
  src_address: t.string,
  battery: t.number,
  pole: t.number,
  changed: t.boolean,
})

export const decode = (rawMessage: string): MagnetSensorData | null => {
  let jsonMessage

  try {
    jsonMessage = JSON.parse(rawMessage)
  }
  catch {
    return null
  }

  const response = RawMessage.decode(jsonMessage)
  if (!isRight(response)) {
    return null
  }

  const status = response.right.pole == 0 ? 'open' : 'closed'

  return {
    deviceAddress: response.right.src_address,
    battery: response.right.battery,
    status,
    changed: response.right.changed,
  }
}
