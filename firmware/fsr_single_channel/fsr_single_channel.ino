#include <Arduino.h>

namespace {
constexpr uint8_t kFsrPin = 8;
constexpr unsigned long kBaudRate = 115200;
constexpr unsigned long kSampleIntervalMs = 100;
}  // namespace

void setup() {
  Serial.begin(kBaudRate);

  analogReadResolution(12);
  analogSetPinAttenuation(kFsrPin, ADC_11db);

  delay(1000);
  Serial.println("time_ms,raw,millivolts");
}

void loop() {
  const unsigned long now = millis();
  const int raw = analogRead(kFsrPin);
  const uint32_t millivolts = analogReadMilliVolts(kFsrPin);

  Serial.printf("%lu,%d,%lu\n", now, raw, static_cast<unsigned long>(millivolts));
  delay(kSampleIntervalMs);
}
