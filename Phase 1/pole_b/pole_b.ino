/**
 * ============================================================
 *  PLCC Fault Detection & Isolation System — SIH 2025
 *  Module  : Phase 1 — Pole B (Slave Node / Downstream)
 *  Board   : Arduino Uno
 *  Author  : Team SHIELD
 *  Version : 1.3.0
 * ============================================================
 *
 *  Role:
 *    Pole B is the DOWNSTREAM SLAVE in the two-pole distribution
 *    segment.  It:
 *      • Continuously reads its ZMPT101B voltage sensor (A0).
 *      • Sends structured voltage reports to Pole A (master)
 *        over the HC-05 Bluetooth link every second.
 *      • Manages its own local relay and status LED.
 *      • Implements fault isolation: trips relay on local
 *        voltage anomaly or on command received from Pole A.
 *      • Implements a 5-second grace window on reset (same
 *        protocol as Pole A for symmetry).
 *
 *  Serial Protocol (9600 baud):
 *    Outbound to Pole A via BT:
 *      "VOLTAGE:1"  — mains present and normal
 *      "VOLTAGE:0"  — voltage fault detected
 *      "V:<value>|STATUS:<code>"  — full reading (extended mode)
 *
 *    USB-Serial debug output:
 *      "HEARTBEAT|RELAY=<ON/OFF>|V=<volts>|STATUS=<code>"
 *
 *  Fault Codes:
 *    OPEN      — Voltage < 5V   (open circuit)
 *    UNDER_V   — Voltage < 170V (sag/dip)
 *    OVER_V    — Voltage > 250V (surge)
 *    BT_LOSS   — HC-05 STATE pin LOW
 *    NORMAL    — All OK
 *
 *  Wiring:
 *    HC-05 RX  → D2 (SoftwareSerial TX)
 *    HC-05 TX  → D3 (SoftwareSerial RX)
 *    HC-05 STATE → D7
 *    ZMPT101B OUT → A0
 *    Relay IN  → D8
 *    Status LED → D13
 *
 *  Libraries: SoftwareSerial (built-in)
 * ============================================================
 */

#include <SoftwareSerial.h>

// ─── Pin Definitions ────────────────────────────────────────
#define BT_RX        2
#define BT_TX        3
#define BT_STATE     7
#define RELAY_PIN    8
#define STATUS_LED   13
#define VOLTAGE_PIN  A0

// ─── Calibration ────────────────────────────────────────────
const float CALIBRATION_FACTOR = 170.5f;
const int   SAMPLE_COUNT       = 500;
const float V_OPEN             =   5.0f;
const float V_UNDER            = 170.0f;
const float V_OVER             = 250.0f;

// ─── Timing ─────────────────────────────────────────────────
const unsigned long HEARTBEAT_INTERVAL_MS = 1000UL;
const unsigned long REPORT_INTERVAL_MS    = 1000UL;
const unsigned long RESET_WINDOW_MS       = 5000UL;

// ─── State ──────────────────────────────────────────────────
SoftwareSerial bluetooth(BT_RX, BT_TX);

bool          faultTripped   = true;
bool          inResetWindow  = false;
unsigned long resetStartTime = 0;
unsigned long lastHeartbeat  = 0;
unsigned long lastReport     = 0;

// ─────────────────────────────────────────────────────────────
/** Read AC RMS voltage from ZMPT101B. */
float readACVoltage(int pin) {
  int maxADC = 0, minADC = 1023;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    int v = analogRead(pin);
    if (v > maxADC) maxADC = v;
    if (v < minADC) minADC = v;
  }
  float Vpp  = (maxADC - minADC) * (5.0f / 1023.0f);
  float Vrms = (Vpp / 2.0f) * 0.7071f;
  return Vrms * CALIBRATION_FACTOR;
}

/** Classify voltage → fault code string. */
const char* classifyVoltage(float v) {
  if (v < V_OPEN)  return "OPEN";
  if (v < V_UNDER) return "UNDER_V";
  if (v > V_OVER)  return "OVER_V";
  return "NORMAL";
}

void tripFault(const char* reason) {
  faultTripped = true;
  digitalWrite(RELAY_PIN,  LOW);
  digitalWrite(STATUS_LED, LOW);
  Serial.print(F("FAULT|REASON="));
  Serial.println(reason);
  Serial.println(F("SHOW_RESET_BUTTON:1"));
  // Notify master
  bluetooth.println(F("VOLTAGE:0"));
}

void restoreNormal() {
  faultTripped = false;
  digitalWrite(RELAY_PIN,  HIGH);
  digitalWrite(STATUS_LED, HIGH);
  Serial.println(F("STATUS:OK"));
  Serial.println(F("SHOW_RESET_BUTTON:0"));
  bluetooth.println(F("VOLTAGE:1"));
}

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);

  pinMode(BT_STATE,    INPUT);
  pinMode(RELAY_PIN,   OUTPUT);
  pinMode(STATUS_LED,  OUTPUT);
  pinMode(VOLTAGE_PIN, INPUT);

  digitalWrite(RELAY_PIN,  LOW);
  digitalWrite(STATUS_LED, LOW);

  Serial.println(F("=============================================="));
  Serial.println(F(" PLCC SHIELD — Pole B (Slave / Downstream)  "));
  Serial.println(F(" Phase 1 | SIH 2025                         "));
  Serial.println(F("=============================================="));
  Serial.println(F("SHOW_RESET_BUTTON:1"));
}

// ─────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Handle PC Commands ───────────────────────────────
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == F("RESET")) {
      inResetWindow  = true;
      resetStartTime = millis();
      digitalWrite(RELAY_PIN,  HIGH);
      digitalWrite(STATUS_LED, HIGH);
      Serial.println(F("CMD:RESET_RECEIVED|WINDOW=5s"));
      Serial.println(F("SHOW_RESET_BUTTON:0"));
    }
  }

  int btState = digitalRead(BT_STATE);

  // ── 2. Handle Reset Grace Window ────────────────────────
  if (inResetWindow) {
    if (btState == HIGH) {
      inResetWindow = false;
      restoreNormal();
    } else if (millis() - resetStartTime > RESET_WINDOW_MS) {
      inResetWindow = false;
      tripFault("RESET_TIMEOUT_NO_BT");
    }

  // ── 3. Normal Monitoring ────────────────────────────────
  } else {
    if (btState == LOW) {
      if (!faultTripped) tripFault("BT_LOSS");
    } else {
      if (faultTripped)  restoreNormal();
    }
  }

  // ── 4. Read local voltage & detect fault ────────────────
  float localV      = readACVoltage(VOLTAGE_PIN);
  const char* vCode = classifyVoltage(localV);

  if ((strcmp(vCode, "NORMAL") != 0) && !faultTripped && !inResetWindow) {
    tripFault(vCode);
  }

  // ── 5. Periodic voltage report to Pole A (master) ───────
  if (millis() - lastReport >= REPORT_INTERVAL_MS) {
    lastReport = millis();
    // Short binary status for Pole A relay logic
    bluetooth.println((strcmp(vCode, "NORMAL") == 0) ? F("VOLTAGE:1") : F("VOLTAGE:0"));
    // Extended reading
    bluetooth.print(F("V:"));
    bluetooth.print(localV, 1);
    bluetooth.print(F("|STATUS:"));
    bluetooth.println(vCode);
  }

  // ── 6. USB Heartbeat ────────────────────────────────────
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = millis();
    Serial.print(F("HEARTBEAT|BT="));
    Serial.print(btState);
    Serial.print(F("|RELAY="));
    Serial.print(digitalRead(RELAY_PIN) ? F("ON") : F("OFF"));
    Serial.print(F("|V="));
    Serial.print(localV, 1);
    Serial.print(F("|STATUS="));
    Serial.println(vCode);

    if (faultTripped && !inResetWindow) {
      Serial.println(F("SHOW_RESET_BUTTON:1"));
    }
  }

  delay(100);
}
