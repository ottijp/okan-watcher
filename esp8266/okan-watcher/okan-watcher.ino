#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

#define STX 0x02
#define ETX 0x03
#define UART_BAUD_RATE 19200

#define WIFI_LED 4

#define API_URL "your-api-url"
#define API_KEY "your-api-key"

// TWELITEから受信したメッセージバッファ
String tweliteMessage = "";

void setup() {
  pinMode(WIFI_LED, OUTPUT);
  digitalWrite(WIFI_LED, LOW);
  
  Serial.begin(UART_BAUD_RATE);
  Serial.println();

  // Wi-Fiへ接続
  Serial.printf("Connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi connected");
  Serial.printf("IP address: %s\n", WiFi.localIP());
  digitalWrite(WIFI_LED, HIGH);
}

void loop() {
  // TWELITEからメッセージを受信し，メッセージ単位にサーバへアップロードする
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == STX) {
      tweliteMessage = "";
    }
    else if (inChar == ETX) {
      Serial.printf("message received: %s\n", tweliteMessage);
      String json = buildJson(tweliteMessage);
      if (json == String("")) {
        Serial.println("Error: failed to build json");
        break;
      }
      Serial.println(json);
      upload(json);
      tweliteMessage = "";
    }
    else {
      tweliteMessage += inChar;
    }
  }
}

// TWELITEから受信したメッセージからサーバにアップロードするJSONを構築する
String buildJson(String tweMessage) {

  if (tweMessage.length() != 16) {
    Serial.printf("Error: invalid message size: %d\n", tweMessage.length());
    return "";
  }

  char tweMessageBuf[17];
  tweMessage.toCharArray(tweMessageBuf, 16);

  // TWELITEメッセージの文字列をパースして数値化
  unsigned int battery = 0;
  unsigned int pole = 0;
  unsigned int isPeriodic = 0;
  sscanf(tweMessage.substring(8, 12).c_str(), "%04X", &battery);
  sscanf(tweMessage.substring(12, 14).c_str(), "%02X", &pole);
  sscanf(tweMessage.substring(14, 16).c_str(), "%02X", &isPeriodic);

  // サーバアップロード用のJSONを構築
  char json[256];
  StaticJsonDocument<256> doc;
  doc["type"] = "magnet";
  doc["src_address"] = tweMessage.substring(0,8);
  doc["battery"] = battery;
  doc["pole"] = pole;
  doc["changed"] = isPeriodic == 1 ? true : false;
  serializeJson(doc, json, sizeof(json));

  return String(json);
}

// サーバへJSONデータをアップロードする
void upload(String json) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Error: wi-fi is not connect");
    return;
  }

  std::unique_ptr<BearSSL::WiFiClientSecure>client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient https;

  // サーバに接続
  Serial.println("[HTTPS] begin...");
  if (!https.begin(*client, API_URL)) {
    Serial.printf("[HTTPS] Unable to connect\n");
    return;
  }

  // POSTリクエストを送信
  Serial.println("[HTTPS] POST...");
  https.addHeader("Content-Type", "application/json");
  https.addHeader("x-api-key", API_KEY);
  int httpCode = https.POST(json);

  // 応答が受信できない場合はエラー
  if (httpCode <= 0) {
    Serial.printf("[HTTPS] POST... failed, error: %s\n", https.errorToString(httpCode).c_str());
    https.end();
    return;
  }

  // レスポンスコードとレスポンスボディを出力
  Serial.printf("[HTTPS] POST... code: %d\n", httpCode);
  if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
    String payload = https.getString();
    Serial.println(payload);
  }

  https.end();
}
