# Okan Watcher

サーバプログラムです．

## デプロイ

```
sam build
sam deploy --guided
```

## データ保存先

- センサーデータの保存先はDynamoDBです．

### Lambda環境変数

- `BATTERY_DAILY_TABLE_NAME`: バッテリ日次テーブル名
- `OPEN_CLOSE_EVENTS_TABLE_NAME`: 開閉イベントテーブル名（`changed=true`のみ）
- `DEVICE_STATE_TABLE_NAME`: デバイス状態テーブル名
- `BATTERY_TTL_DAYS`: バッテリ日次データTTL(日)．デフォルトは`3650`(10年)
- `EVENT_TTL_DAYS`: 開閉イベントTTL(日)．デフォルトは`1825`(5年)

## ライセンス

MIT
