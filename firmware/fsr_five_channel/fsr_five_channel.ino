#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiUdp.h>

#if __has_include("device_config.h")
#include "device_config.h"
#else
#error "Create device_config.h from device_config.h.example and configure local credentials."
#endif

static_assert(sizeof(SONGXIAN_DEVICE_TOKEN) > 12, "Device token must contain at least 12 characters.");
static_assert(sizeof(SONGXIAN_SETUP_PASSWORD) >= 9 && sizeof(SONGXIAN_SETUP_PASSWORD) <= 64,
              "Setup password must contain 8 to 63 characters.");

namespace {
constexpr uint8_t kFsrPins[] = {4, 5, 6, 7, 8};
constexpr size_t kFsrCount = sizeof(kFsrPins) / sizeof(kFsrPins[0]);
constexpr uint8_t kBootPin = 0;
constexpr uint8_t kRgbLedPin = 9;
constexpr unsigned long kBaudRate = 115200;
constexpr unsigned long kSampleIntervalMs = 20;
constexpr unsigned long kConnectionTimeoutMs = 15000;
constexpr unsigned long kBootLongPressMs = 5000;
constexpr uint16_t kBeaconPort = 4210;
constexpr uint16_t kDefaultServerPort = 3001;
constexpr size_t kBatchSize = 5;
constexpr char kLayoutVersion[] = "layout-cushion2-v1";
constexpr char kDeviceIdPrefix[] = "songxian-cushion";

enum class Status { kConnecting, kConnected, kConfig, kError };

struct Sample {
  uint32_t sequence;
  uint32_t timeMs;
  uint16_t raw[kFsrCount];
};

Preferences preferences;
WebServer configServer(80);
WiFiUDP discovery;
Sample batch[kBatchSize];
size_t batchCount = 0;
uint32_t sampleSequence = 0;
uint32_t frameSequence = 0;
uint32_t bootId = 0;
unsigned long lastSampleAt = 0;
unsigned long connectionStartedAt = 0;
unsigned long bootPressedAt = 0;
unsigned long lastLedAt = 0;
bool ledToggle = false;
bool configMode = false;
bool discoveryStarted = false;
String wifiSsid;
String wifiPassword;
String manualServerHost;
String serverHost;
uint16_t serverPort = kDefaultServerPort;
String deviceId;
Status status = Status::kConnecting;

void setRgb(uint8_t red, uint8_t green, uint8_t blue) {
  rgbLedWrite(kRgbLedPin, red, green, blue);
}

void updateStatusLed() {
  const unsigned long now = millis();
  if (status == Status::kConnected) {
    setRgb(0, 18, 0);
    return;
  }
  const unsigned long interval = status == Status::kConfig ? 250 : 650;
  if (now - lastLedAt < interval) return;
  lastLedAt = now;
  ledToggle = !ledToggle;
  if (!ledToggle) {
    setRgb(0, 0, 0);
  } else if (status == Status::kConfig) {
    setRgb(0, 0, 24);
  } else if (status == Status::kError) {
    setRgb(24, 0, 0);
  } else {
    setRgb(20, 10, 0);
  }
}

String htmlEscape(const String& input) {
  String output = input;
  output.replace("&", "&amp;");
  output.replace("\"", "&quot;");
  output.replace("<", "&lt;");
  output.replace(">", "&gt;");
  return output;
}

String setupPage(const String& message = "") {
  String page;
  page.reserve(2600);
  page += F("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>");
  page += F("<meta name='viewport' content='width=device-width,initial-scale=1'>");
  page += F("<title>松弦坐垫配网</title><style>body{margin:0;background:#f4f0e7;color:#1e2522;font-family:system-ui,sans-serif}");
  page += F("main{max-width:480px;margin:auto;padding:36px 22px}h1{font-family:serif;font-size:32px}p{color:#5f655f;line-height:1.7}");
  page += F("label{display:block;margin:20px 0 7px;font-weight:700}input{box-sizing:border-box;width:100%;height:52px;padding:0 14px;border:1px solid #cfc9bc;border-radius:14px;font-size:16px;background:#fffdf8}");
  page += F("button{width:100%;height:54px;margin-top:26px;border:0;border-radius:27px;background:#344f43;color:white;font-size:16px;font-weight:700}.note{font-size:13px}.msg{color:#9a433b}</style></head><body><main>");
  page += F("<p>五点压力坐垫</p><h1>连接现场 Wi-Fi</h1>");
  page += F("<p>电脑、演示手机和坐垫需要连接同一个网络。保存后坐垫会自动重启。</p>");
  if (message.length()) page += "<p class='msg'>" + htmlEscape(message) + "</p>";
  page += F("<form method='post' action='/save'><label for='ssid'>Wi-Fi 名称</label><input id='ssid' name='ssid' required value='");
  page += htmlEscape(wifiSsid);
  page += F("'><label for='password'>Wi-Fi 密码</label><input id='password' name='password' type='password' placeholder='不修改可留空'>");
  page += F("<label for='host'>电脑 IP（可选）</label><input id='host' name='host' inputmode='decimal' placeholder='服务器地址（留空自动发现）' value='");
  page += htmlEscape(manualServerHost);
  page += F("'><p class='note'>留空时坐垫会自动发现电脑；若现场 Wi-Fi 拦截广播，再手动填写。</p><button type='submit'>保存并连接</button></form>");
  page += F("</main></body></html>");
  return page;
}

void beginConfigurationMode() {
  if (configMode) return;
  configMode = true;
  status = Status::kConfig;
  discovery.stop();
  discoveryStarted = false;
  WiFi.disconnect(true, false);
  delay(100);
  WiFi.mode(WIFI_AP);
  const String apName = String("Cushion-Setup-") + deviceId.substring(deviceId.length() - 4);
  WiFi.softAP(apName.c_str(), SONGXIAN_SETUP_PASSWORD);
  configServer.on("/", HTTP_GET, []() { configServer.send(200, "text/html; charset=utf-8", setupPage()); });
  configServer.on("/save", HTTP_POST, []() {
    const String nextSsid = configServer.arg("ssid");
    if (!nextSsid.length()) {
      configServer.send(400, "text/html; charset=utf-8", setupPage("Wi-Fi 名称不能为空。"));
      return;
    }
    wifiSsid = nextSsid;
    const String nextPassword = configServer.arg("password");
    if (nextPassword.length()) wifiPassword = nextPassword;
    manualServerHost = configServer.arg("host");
    manualServerHost.trim();
    preferences.putString("ssid", wifiSsid);
    preferences.putString("password", wifiPassword);
    preferences.putString("server", manualServerHost);
    configServer.send(200, "text/html; charset=utf-8", F("<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'><style>body{font-family:system-ui;padding:40px;background:#f4f0e7;color:#1e2522}</style><h1>已经保存</h1><p>坐垫正在重启并连接新网络，可以关闭此页面。</p>"));
    delay(600);
    ESP.restart();
  });
  configServer.onNotFound([]() {
    configServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
    configServer.send(302, "text/plain", "");
  });
  configServer.begin();
  Serial.println("Configuration mode active.");
}

void beginStationConnection() {
  if (!wifiSsid.length()) {
    beginConfigurationMode();
    return;
  }
  configMode = false;
  status = Status::kConnecting;
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  connectionStartedAt = millis();
}

void handleBootButton() {
  if (digitalRead(kBootPin) == LOW) {
    if (bootPressedAt == 0) bootPressedAt = millis();
    if (!configMode && millis() - bootPressedAt >= kBootLongPressMs) beginConfigurationMode();
  } else {
    bootPressedAt = 0;
  }
}

void handleConnection() {
  if (configMode) {
    configServer.handleClient();
    return;
  }
  if (WiFi.status() == WL_CONNECTED) {
    if (status != Status::kConnected) {
      status = Status::kConnected;
      Serial.println("Wi-Fi connected.");
      if (!manualServerHost.length()) {
        discovery.begin(kBeaconPort);
        discoveryStarted = true;
      } else {
        serverHost = manualServerHost;
      }
    }
    return;
  }
  status = Status::kConnecting;
  if (millis() - connectionStartedAt >= kConnectionTimeoutMs) beginConfigurationMode();
}

void discoverServer() {
  if (!discoveryStarted || serverHost.length()) return;
  const int packetSize = discovery.parsePacket();
  if (packetSize <= 0) return;
  char packet[64] = {};
  const int length = discovery.read(packet, sizeof(packet) - 1);
  if (length <= 0) return;
  packet[length] = '\0';
  const String message(packet);
  if (!message.startsWith("SONGXIAN_SERVER_V1|")) return;
  const int announcedPort = message.substring(19).toInt();
  serverHost = discovery.remoteIP().toString();
  serverPort = announcedPort > 0 ? announcedPort : kDefaultServerPort;
  Serial.println("Server discovered.");
}

String buildBatchJson() {
  String body;
  body.reserve(900);
  body += F("{\"protocol\":1,\"deviceId\":\"");
  body += deviceId;
  body += F("\",\"bootId\":\"");
  body += String(bootId, HEX);
  body += F("\",\"frameSeq\":");
  body += frameSequence;
  body += F(",\"layoutVersion\":\"");
  body += kLayoutVersion;
  body += F("\",\"sampleHz\":50,\"channels\":[\"S_L\",\"S_R\",\"B_L\",\"B_R\",\"P_C\"],\"samples\":[");
  for (size_t sampleIndex = 0; sampleIndex < batchCount; ++sampleIndex) {
    if (sampleIndex) body += ',';
    body += F("{\"seq\":");
    body += batch[sampleIndex].sequence;
    body += F(",\"tMs\":");
    body += batch[sampleIndex].timeMs;
    body += F(",\"raw\":[");
    for (size_t channelIndex = 0; channelIndex < kFsrCount; ++channelIndex) {
      if (channelIndex) body += ',';
      body += batch[sampleIndex].raw[channelIndex];
    }
    body += F("]}");
  }
  body += F("]}");
  return body;
}

bool uploadBatch() {
  if (WiFi.status() != WL_CONNECTED || !serverHost.length() || batchCount == 0) return false;
  WiFiClient client;
  HTTPClient http;
  const String url = String("http://") + serverHost + ':' + serverPort + "/api/v1/device/frames";
  http.setConnectTimeout(600);
  http.setTimeout(800);
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", SONGXIAN_DEVICE_TOKEN);
  const int code = http.POST(buildBatchJson());
  http.end();
  if (code >= 200 && code < 300) return true;
  Serial.printf("Upload failed: HTTP %d\n", code);
  return false;
}

void sampleSensors() {
  const unsigned long now = millis();
  if (now - lastSampleAt < kSampleIntervalMs) return;
  lastSampleAt = now;
  Sample& sample = batch[batchCount];
  sample.sequence = sampleSequence++;
  sample.timeMs = now;
  Serial.print(now);
  for (size_t index = 0; index < kFsrCount; ++index) {
    sample.raw[index] = static_cast<uint16_t>(analogRead(kFsrPins[index]));
    Serial.printf(",%u", sample.raw[index]);
  }
  Serial.println();
  batchCount += 1;
  if (batchCount < kBatchSize) return;
  frameSequence += 1;
  uploadBatch();
  batchCount = 0;
}
}  // namespace

void setup() {
  Serial.begin(kBaudRate);
  pinMode(kBootPin, INPUT_PULLUP);
  analogReadResolution(12);
  for (size_t index = 0; index < kFsrCount; ++index) {
    analogSetPinAttenuation(kFsrPins[index], ADC_11db);
  }
  preferences.begin("songxian", false);
  wifiSsid = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  manualServerHost = preferences.getString("server", "");
  const uint64_t mac = ESP.getEfuseMac();
  char identity[40];
  snprintf(identity, sizeof(identity), "%s-%04X", kDeviceIdPrefix, static_cast<uint16_t>(mac));
  deviceId = identity;
  bootId = esp_random();
  delay(350);
  Serial.println("time_ms,S_L_raw,S_R_raw,B_L_raw,B_R_raw,P_C_raw");
  beginStationConnection();
}

void loop() {
  handleBootButton();
  handleConnection();
  updateStatusLed();
  if (!configMode && WiFi.status() == WL_CONNECTED) {
    discoverServer();
    sampleSensors();
  }
  delay(1);
}
