/**
 * WebUIに返却するデバイス状態レコードである．
 */
export type DeviceStatusRecord = {
  deviceAddress: string
  alias: string | null
  currentStatus: 'open' | 'closed' | null
  lastBattery: number | null
  lastSeenAt: string | null
  lastChangedAt: string | null
}
