export default class MagnetSensorData {
  deviceAddress: string
  battery: number
  status: 'open' | 'closed'
  changed: boolean

  constructor(
    deviceAddress: string,
    battery: number,
    status: 'open' | 'closed',
    changed: boolean,
  ) {
    this.deviceAddress = deviceAddress
    this.battery = battery
    this.status = status
    this.changed = changed
  }
}
