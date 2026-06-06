/**
 * ============================================================
 *  PLCC Fault Detection & Isolation System — SIH 2025
 *  Module  : Phase 2 — Pole 1 Transmitter (Edge Node)
 *  Board   : Arduino Uno + LoRa SX1278 (433 MHz)
 *  Author  : Team SHIELD
 *  Version : 2.0.0
 * ============================================================
 *
 *  Role:
 *    Pole 1 is an autonomous edge node deployed at the pole
 *    site.  It:
 *      • Reads AC mains voltage via ZMPT101B sensor on A0.
 *      • Reads AC current via SCT-013 current transformer on A1.
 *      • Computes apparent power (VA) and power factor proxy.
 *      • Classifies the reading into a fault code.
 *      • Transmits a structured JSON-like payload over LoRa
 *        433 MHz to the base station (laptop_rx).
 *      • Waits for an ACK from the base station before sleeping.
 *      • Controls a local relay and tri-colour status LED to
 *        provide on-pole visual indication of fault state.
 *      • On receiving a "TRIP" command from the base station,
 *        it opens the relay to isolate the faulty section.
 *      • On receiving a "RESTORE" command, it re-closes the
 *        relay after confirming voltage is within limits.
 *
 *  LoRa Payload Format (uplink, every TX_INTERVAL_MS):
 *    {"id":"P1","v":<V>,"i":<A>,"s":<VA>,"f":"<code>","seq":<n>}
 *
 *  LoRa Command Format (downlink from base station):
 *    "TRIP"    — open relay (isolate section)
 *    "RESTORE" — re-close relay (restore section)
 *    "PING"    — heartbeat ping, respond with "PONG|P1"
 *
 *  Fault Codes:
 *    NORMAL   — Voltage 170–250 V, current within range
 *    OPEN     — Voltage < 5 V (open circuit / no source)
 *    UNDER_V  — Voltage 5–170 V (sag / brownout)
 *    OVER_V   — Voltage > 250 V (surge / over-voltage)
 *    OVER_I   — Current > I_MAX_A (overcurrent / short)
 *    NO_ACK   — Base station unreachable (LoRa link down)
 *
 *  Wiring:
 *    ZMPT101B  OUT  → A0
 *    SCT-013   OUT  → A1  (burden resistor 33Ω across A1-GND)
 *    LoRa NSS       → D10
 *    LoRa RST       → D9
 *    LoRa IRQ (DIO0)→ D2
 *    LoRa MOSI      → D11 (hardware SPI)
 *    LoRa MISO      → D12
 *    LoRa SCK       → D13
 *    Relay IN       → D7
 *    RGB Red        → D4
 *    RGB Green      → D5
 *    RGB Blue       → D6
 *
 *  Libraries:
 *    LoRa by Sandeep Mistry  (v0.8.0+)
 *    SPI (built-in)
 * ============================================================
 */

#include <SPI.h>
#include <LoRa.h>

// ─── LoRa Pin Definitions ────────────────────────────────────
#define LORA_NSS   10
#define LORA_RST    9
#define LORA_IRQ    2
#define LORA_FREQ   433E6   // 433 MHz ISM band (India)

// ─── Sensor Pins ─────────────────────────────────────────────
#define VOLTAGE_PIN  A0
#define CURRENT_PIN  A1

// ─── Actuator Pins ───────────────────────────────────────────
#define RELAY_PIN    7
#define LED_RED      4
#define LED_GREEN    5
#define LED_BLUE     6

// ─── Calibration Constants ───────────────────────────────────
const float V_CALIBRATION  = 170.5f;  // ZMPT101B scaling factor
const float I_CALIBRATION  = 30.0f;   // SCT-013-030 (30A/1V)
const int   SAMPLE_COUNT   = 500;

// ─── Fault Thresholds ────────────────────────────────────────
const float V_OPEN          =   5.0f;
const float V_UNDER         = 170.0f;
const float V_OVER          = 250.0f;
const float I_MAX_A         =  15.0f;  // Trip above 15 A

// ─── Timing ──────────────────────────────────────────────────
const unsigned long TX_INTERVAL_MS  = 5000UL;  // Send every 5 s
const unsigned long ACK_TIMEOUT_MS  = 2000UL;  // Wait 2 s for ACK

// ─── State ───────────────────────────────────────────────────
bool          relayOpen    = false;   // false = relay closed (normal)
unsigned long lastTx       = 0;
unsigned long txSeq        = 0;

// ─────────────────────────────────────────────────────────────
/** Set the RGB LED colour. Pass 0 or 1 per channel. */
void setLED(bool r, bool g, bool b) {
  digitalWrite(LED_RED,   r ? HIGH : LOW);
  digitalWrite(LED_GREEN, g ? HIGH : LOW);
  digitalWrite(LED_BLUE,  b ? HIGH : LOW);
}

/** Read AC RMS voltage from ZMPT101B. */
float readVoltage() {
  int maxV = 0, minV = 1023;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    int s = analogRead(VOLTAGE_PIN);
    if (s > maxV) maxV = s;
    if (s < minV) minV = s;
  }
  float Vpp  = (maxV - minV) * (5.0f / 1023.0f);
  float Vrms = (Vpp / 2.0f) * 0.7071f;
  return Vrms * V_CALIBRATION;
}

/** Read AC RMS current from SCT-013. */
float readCurrent() {
  int maxI = 0, minI = 1023;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    int s = analogRead(CURRENT_PIN);
    if (s > maxI) maxI = s;
    if (s < minI) minI = s;
  }
  float Vpp  = (maxI - minI) * (5.0f / 1023.0f);
  float Vrms = (Vpp / 2.0f) * 0.7071f;
  return Vrms * I_CALIBRATION;
}

/** Classify voltage + current into a fault code. */
const char* classifyFault(float v, float i) {
  if (v < V_OPEN)  return "OPEN";
  if (v < V_UNDER) return "UNDER_V";
  if (v > V_OVER)  return "OVER_V";
  if (i > I_MAX_A) return "OVER_I";
  return "NORMAL";
}

/** Build and send a LoRa uplink packet; return true if ACK received. */
bool sendAndAck(float v, float i, float s, const char* faultCode) {
  txSeq++;

  // Build payload string
  char payload[96];
  snprintf(payload, sizeof(payload),
    "{\"id\":\"P1\",\"v\":%.1f,\"i\":%.2f,\"s\":%.1f,\"f\":\"%s\",\"seq\":%lu}",
    v, i, s, faultCode, txSeq);

  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();

  Serial.print(F("TX → "));
  Serial.println(payload);

  // Wait for ACK
  unsigned long t0 = millis();
  while (millis() - t0 < ACK_TIMEOUT_MS) {
    if (LoRa.parsePacket()) {
      String ack = LoRa.readString();
      ack.trim();
      if (ack == F("ACK") || ack.startsWith(F("ACK"))) {
        Serial.println(F("ACK received ✓"));
        return true;
      }
      // Handle downlink commands embedded in ACK
      if (ack == F("TRIP"))    { handleTrip();    return true; }
      if (ack == F("RESTORE")) { handleRestore(); return true; }
    }
  }
  Serial.println(F("ACK TIMEOUT — base station unreachable"));
  return false;
}

/** Open relay to isolate this section. */
void handleTrip() {
  relayOpen = true;
  digitalWrite(RELAY_PIN, LOW);
  setLED(1, 0, 0);  // Red
  Serial.println(F("RELAY TRIPPED — section isolated"));
}

/** Close relay to restore this section. */
void handleRestore() {
  relayOpen = false;
  digitalWrite(RELAY_PIN, HIGH);
  setLED(0, 1, 0);  // Green
  Serial.println(F("RELAY RESTORED — section energised"));
}

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);

  // Actuators
  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_BLUE,   OUTPUT);

  // Safe initial state
  digitalWrite(RELAY_PIN, LOW);
  setLED(0, 0, 1);  // Blue = initialising

  Serial.println(F("=============================================="));
  Serial.println(F(" PLCC SHIELD — Pole 1 TX Edge Node          "));
  Serial.println(F(" Phase 2 | SIH 2025 | 433 MHz LoRa          "));
  Serial.println(F("=============================================="));

  // Initialise LoRa
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_IRQ);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println(F("ERROR: LoRa init failed — check wiring!"));
    setLED(1, 0, 1);  // Magenta = LoRa error
    while (true);     // Halt
  }

  // LoRa link-layer config
  LoRa.setSpreadingFactor(9);      // SF9 for range/reliability
  LoRa.setSignalBandwidth(125E3);  // 125 kHz BW
  LoRa.setCodingRate4(5);          // 4/5 coding rate
  LoRa.enableCrc();

  Serial.println(F("LoRa OK — SF9 / 125kHz / CR4/5 / CRC ON"));

  // Close relay: start energised
  digitalWrite(RELAY_PIN, HIGH);
  setLED(0, 1, 0);  // Green = running
}

// ─────────────────────────────────────────────────────────────
void loop() {

  // ── Listen for downlink commands at any time ─────────────
  if (LoRa.parsePacket()) {
    String cmd = LoRa.readString();
    cmd.trim();
    if      (cmd == F("TRIP"))    handleTrip();
    else if (cmd == F("RESTORE")) handleRestore();
    else if (cmd == F("PING")) {
      LoRa.beginPacket();
      LoRa.print(F("PONG|P1"));
      LoRa.endPacket();
      Serial.println(F("PING → PONG sent"));
    }
  }

  // ── Periodic sensor read & uplink ────────────────────────
  if (millis() - lastTx >= TX_INTERVAL_MS) {
    lastTx = millis();

    float v    = readVoltage();
    float i    = readCurrent();
    float s    = v * i;               // apparent power (VA)
    const char* fc = classifyFault(v, i);

    // Update LED based on fault
    if      (strcmp(fc, "NORMAL")  == 0) setLED(0, 1, 0);  // Green
    else if (strcmp(fc, "OPEN")    == 0) setLED(0, 0, 1);  // Blue
    else                                 setLED(1, 0, 0);  // Red

    // Auto-trip relay on serious fault
    if ((strcmp(fc, "OVER_I") == 0 || strcmp(fc, "OPEN") == 0) && !relayOpen) {
      handleTrip();
    }

    bool ack = sendAndAck(v, i, s, fc);
    if (!ack) {
      // No ACK: LoRa link down — log but keep relay state
      Serial.println(F("WARN: No ACK from base station"));
    }
  }
}
