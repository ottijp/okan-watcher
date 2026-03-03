# Okan Watcher

サーバプログラムです．

## デプロイ

```bash
sam build
sam deploy --guided
```

## データ保存先

- センサーデータの保存先はDynamoDBです．

### SensorDeviceAliasTableへの登録方法

WebUIのデバイス名表示は`SensorDeviceAliasTable`を参照します．  
レコードは次の形式で登録します．

- `deviceAddress` (String): パーティションキー．センサーのアドレス
- `alias` (String): WebUIに表示する名前
- `updatedAt` (String, 任意): 更新日時（ISO 8601）

`DeviceAliasTableName`の出力値を使って登録する例です．

```bash
aws dynamodb put-item \
  --region ap-northeast-1 \
  --table-name <DeviceAliasTableName> \
  --item '{
    "deviceAddress": {"S":"00112233"},
    "alias": {"S":"玄関"},
    "updatedAt": {"S":"2026-03-03T12:00:00Z"}
  }'
```

### Lambda環境変数

- `BATTERY_DAILY_TABLE_NAME`: バッテリ日次テーブル名
- `OPEN_CLOSE_EVENTS_TABLE_NAME`: 開閉イベントテーブル名（`changed=true`のみ）
- `DEVICE_STATE_TABLE_NAME`: デバイス状態テーブル名
- `DEVICE_ALIAS_TABLE_NAME`: デバイス別名テーブル名（WebUI表示用）
- `BATTERY_TTL_DAYS`: バッテリ日次データTTL(日)．デフォルトは`3650`(10年)
- `EVENT_TTL_DAYS`: 開閉イベントTTL(日)．デフォルトは`1825`(5年)

## WebUI構成

- 配信: `S3 + CloudFront`
- API: `API Gateway + Lambda + DynamoDB`
- 認証: CloudFront FunctionでBasic認証
- ドメイン: CloudFront標準ドメイン（`*.cloudfront.net`）を利用

### 事前準備

事前準備は不要です．Basic認証情報とOrigin検証ヘッダはCloudFormationで自動生成されます．

### デプロイ時パラメータ

このテンプレートの追加パラメータ入力は不要です．`sam deploy --guided`でそのままデプロイできます．

### `/api/*`のアクセス制御

- `CloudFront Function`でBasic認証を検証します．
- さらにCloudFrontから`x-origin-verify`ヘッダを付与してAPI Gatewayへ転送します．
- `x-origin-verify`の値はCloudFormationがSecrets Managerへ自動生成します（出力: `WebUiOriginVerifySecretArn`）．
- API GatewayのLambda Authorizerが`x-origin-verify`と自動生成Secretの`originVerifyHeader`を照合します．
- これにより，CloudFrontを経由しない直接アクセスを拒否できます．

### 静的ファイルの配置

WebUIファイルは`webui/`にあります．デプロイ後，出力された`WebUiBucketName`へ同期します．

```bash
aws s3 sync webui/ s3://<WebUiBucketName>/ --delete
```

### アクセス先

CloudFormation出力の`WebUiUrl`からWebUIへアクセスできます．

### Basic認証情報の確認と変更

- 認証情報SecretのARNはCloudFormation出力`WebUiBasicAuthSecretArn`です．
- 生成される値は`username`と`password`です（初期usernameは`user`）．
- 現在値の確認は次のコマンドで行います．

```bash
aws secretsmanager get-secret-value \
  --region ap-northeast-1 \
  --secret-id <WebUiBasicAuthSecretArn> \
  --query SecretString \
  --output text
```

- 値を変更する場合はSecrets Managerの`username`/`password`を更新してください．
- 変更後は`sam deploy`を実行してCloudFront Functionへ反映してください．

## ライセンス

MIT
