import { isRight } from 'fp-ts/lib/Either'
import * as t from 'io-ts'

const Message = t.type({
  type: t.string,
  src_address: t.string,
  battery: t.number,
  pole: t.number,
  changed: t.boolean,
})

export const decode = (rawMessage: string): Message | null => {
  let jsonMessage

  try {
    jsonMessage = JSON.parse(rawMessage)
  }
  catch {
    console.error('not JSON string:', rawMessage)
    return null
  }

  const response = Message.decode(jsonMessage)
  if (!isRight(response)) {
    console.error('invalid format:', jsonMessage)
    return null
  }

  return {
    type: response.right.type,
    src_address: response.right.src_address,
    battery: response.right.battery,
    pole: response.right.pole,
    changed: response.right.changed,
  }
}

export type Message = t.TypeOf<typeof Message>
