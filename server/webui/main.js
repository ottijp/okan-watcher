const { useCallback, useEffect, useMemo, useState } = React
const h = React.createElement

const formatStatus = (status) => {
  if (status === 'open') {
    return 'open'
  }

  if (status === 'closed') {
    return 'closed'
  }

  return '不明'
}

const formatBattery = (battery) => {
  if (battery === null || battery === undefined) {
    return '-'
  }

  return String(battery)
}

const formatTimestamp = (value) => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('ja-JP', { hour12: false })
}

const DeviceRow = ({ device }) => {
  const alias = device.alias || '(未設定)'
  const status = device.currentStatus || ''

  return h(
    'tr',
    null,
    h('td', null, alias),
    h('td', null, device.deviceAddress),
    h('td', null, h('span', { className: `status ${status}`.trim() }, formatStatus(status))),
    h('td', null, formatBattery(device.lastBattery)),
    h('td', null, formatTimestamp(device.lastSeenAt)),
  )
}

const App = () => {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/devices/status', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`status ${response.status}`)
      }

      const payload = await response.json()
      setDevices(Array.isArray(payload.devices) ? payload.devices : [])
      setLastUpdated(new Date().toLocaleString('ja-JP', { hour12: false }))
    }
    catch (e) {
      console.error(e)
      setError('データ取得に失敗しました．時間をおいて再試行してください．')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)

    return () => {
      clearInterval(timer)
    }
  }, [load])

  const rows = useMemo(() => {
    if (devices.length === 0) {
      return [
        h(
          'tr',
          { key: 'empty' },
          h('td', { colSpan: 5 }, 'データなし'),
        ),
      ]
    }

    return devices.map((device) => h(DeviceRow, { key: device.deviceAddress, device }))
  }, [devices])

  return h(
    'main',
    { className: 'container' },
    h(
      'header',
      { className: 'header' },
      h('h1', null, 'Okan Watcher'),
      h('button', { type: 'button', onClick: load, disabled: loading }, loading ? '更新中...' : '更新'),
    ),
    h('p', { className: 'meta' }, lastUpdated ? `最終更新: ${lastUpdated}` : '読み込み中...'),
    loading
      ? h(
          'div',
          { className: 'loading', role: 'status', 'aria-live': 'polite' },
          h('span', { className: 'spinner', 'aria-hidden': 'true' }),
          h('span', null, '読み込み中...'),
        )
      : null,
    h(
      'table',
      { className: 'status-table', 'aria-label': 'デバイス状態一覧' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'デバイス'),
          h('th', null, 'アドレス'),
          h('th', null, '状態'),
          h('th', null, 'バッテリ'),
          h('th', null, '最終受信'),
        ),
      ),
      h('tbody', null, rows),
    ),
    error ? h('p', { className: 'error' }, error) : null,
  )
}

const root = ReactDOM.createRoot(document.getElementById('app'))
root.render(h(App))
