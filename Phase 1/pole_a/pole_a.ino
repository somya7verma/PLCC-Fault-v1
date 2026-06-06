/**
 * ============================================================
 *  PLCC Fault Detection & Isolation System — SIH 2025
 *  Module  : Phase 1 — Pole A (Master Node / Upstream)
 *  Board   : Arduino Uno
 *  Author  : Team SHIELD
 *  Version : 1.3.0
 * ============================================================
 *
 *  Role:
 *    Pole A is the UPSTREAM MASTER in the two-pole distribution
 *    segment under test.  It:
 *      • Monitors the HC-05 Bluetooth link to Pole B (slave).
 *      • Reads its own ZMPT101B voltage on A0.
 *      • Relays combined status to the PC dashboard over USB-Serial
 *        using a structured, MQTT-bridge-parseable format.
 *      • Controls a local relay (load isolation) and status LED.
 *      • Accepts RESET commands from the PC dashboard.
 *      • Implements a 5-second grace window on reset to confirm
 *        Bluetooth link re-establishment before restoring power.
 *
 *  Serial Protocol (9600 baud, newline-terminated):
 *    Outbound  → "HEARTBEAT|BT=<0/1>|RELAY=<ON/OFF>|V=<volts>|STATUS=<code>"
 *    Inbound   ← "RESET"  (restores relay if BT reconnects within 5 s)
 *
 *  Fault Codes:
 *    OPEN      — Voltage < 5V   (open circuit / no source)
 *    UNDER_V   — Voltage < 170V (voltage sag / partial fault)
 *    OVER_V    — Voltage > 250V (over-voltage surge)
 *    BT_LOSS   — HC-05 STATE pin LOW (communication link broken)
 *    NORMAL    — All parameters within acceptable range
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
#define BT_RX        2    // SoftwareSerial: connects to HC-05 TX
#define BT_TX        3    // SoftwareSerial: connects to HC-05 RX
#define BT_STATE     7    // HC-05 STATE → HIGH when connected
#define RELAY_PIN    8    // Active HIGH relay module
#define STATUS_LED   13   // Onboard LED as status indicator
#define VOLTAGE_PIN  A0   // ZMPT101B analog output

// ─── Calibration ────────────────────────────────────────────
const float CALIBRATION_FACTOR = 170.5f;
const int   SAMPLE_COUNT       = 500;
const float V_OPEN             =   5.0f;
const float V_UNDER            = 170.0f;
const float V_OVER             = 250.0f;

// ─── Timing ─────────────────────────────────────────────────
const unsigned long HEARTBEAT_INTERVAL_MS = 1000UL;
const unsigned long RESET_WINDOW_MS       = 5000UL;

// ─── State ──────────────────────────────────────────────────
SoftwareSerial bluetooth(BT_RX, BT_TX);

bool          faultTripped    = true;   // Start safe: relay OFF
bool          inResetWindow   = false;
unsigned long resetStartTime  = 0;
unsigned long lastHeartbeat   = 0;

// ─────────────────────────────────────────────────────────────
/** Read AC RMS voltage from ZMPT101B on the given analog pin. */
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

/** Classify voltage into a fault code string. */
const char* classifyVoltage(float v) {
  if (v < V_OPEN)  return "OPEN";
  if (v < V_UNDER) return "UNDER_V";
  if (v > V_OVER)  return "OVER_V";
  return "NORMAL";
}

/** Trip the relay and record fault state. */
void tripFault(const char* reason) {
  faultTripped = true;
  digitalWrite(RELAY_PIN,  LOW);
  digitalWrite(STATUS_LED, LOW);
  Serial.print(F("FAULT|REASON="));
  Serial.println(reason);
  Serial.println(F("SHOW_RESET_BUTTON:1"));
}

/** Restore normal operation (relay ON). */
void restoreNormal() {
  faultTripped = false;
  digitalWrite(RELAY_PIN,  HIGH);
  digitalWrite(STATUS_LED, HIGH);
  Serial.println(F("STATUS:OK"));
  Serial.println(F("SHOW_RESET_BUTTON:0"));
}

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);

  pinMode(BT_STATE,   INPUT);
  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  pinMode(VOLTAGE_PIN, INPUT);

  // Start with relay OFF for safety
  digitalWrite(RELAY_PIN,  LOW);
  digitalWrite(STATUS_LED, LOW);

  Serial.println(F("=============================================="));
  Serial.println(F(" PLCC SHIELD — Pole A (Master / Upstream)   "));
  Serial.println(F(" Phase 1 | SIH 2025                         "));
  Serial.println(F("=============================================="));
  Serial.println(F("SHOW_RESET_BUTTON:1"));
}

// ─────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Handle incoming PC / dashboard commands ──────────
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == F("RESET")) {
      inResetWindow    = true;
      resetStartTime   = millis();
      // Tentatively restore relay — will be pulled back if BT
      // does not confirm within RESET_WINDOW_MS
      digitalWrite(RELAY_PIN,  HIGH);
      digitalWrite(STATUS_LED, HIGH);
      Serial.println(F("CMD:RESET_RECEIVED|WINDOW=5s"));
      Serial.println(F("SHOW_RESET_BUTTON:0"));
    }
  }

  int btState = digitalRead(BT_STATE);

  // ── 2. Handle 5-second reset grace window ───────────────
  if (inResetWindow) {
    if (btState == HIGH) {
      // BT confirmed → reset successful
      inResetWindow = false;
      restoreNormal();
    } else if (millis() - resetStartTime > RESET_WINDOW_MS) {
      // Timeout: BT never reconnected → re-trip
      inResetWindow = false;
      tripFault("RESET_TIMEOUT_NO_BT");
    }

  // ── 3. Normal steady-state monitoring ───────────────────
  } else {
    if (btState == LOW) {
      if (!faultTripped) {
        tripFault("BT_LOSS");
      }
    } else {
      if (faultTripped) {
        restoreNormal();
      }
    }
  }

  // ── 4. Parse Pole B Bluetooth data ──────────────────────
  if (bluetooth.available()) {
    String data = bluetooth.readStringUntil('\n');
    data.trim();

    // Pole B sends "VOLTAGE:0" on fault, "VOLTAGE:1" on normal
    if (data.indexOf(F("VOLTAGE:0")) != -1 && !inResetWindow) {
      tripFault("POLE_B_VOLTAGE_FAULT");
    } else if (data.indexOf(F("VOLTAGE:1")) != -1) {
      if (btState == HIGH && faultTripped) {
        restoreNormal();
      }
    }
  }

  // ── 5. Read local voltage ────────────────────────────────
  float localV      = readACVoltage(VOLTAGE_PIN);
  const char* vCode = classifyVoltage(localV);

  // Trip on local voltage fault (only if not already tripped)
  if ((strcmp(vCode, "NORMAL") != 0) && !faultTripped && !inResetWindow) {
    tripFault(vCode);
  }

  // ── 6. Periodic heartbeat to dashboard ──────────────────
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

    // Remind dashboard of reset button if needed
    if (faultTripped && !inResetWindow) {
      Serial.println(F("SHOW_RESET_BUTTON:1"));
    }
  }

  delay(100);
}
