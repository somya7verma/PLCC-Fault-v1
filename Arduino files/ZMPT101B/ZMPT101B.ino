/**
 * ============================================================
 *  PLCC Fault Detection & Isolation System — SIH 2025
 *  Module  : ZMPT101B AC Voltage Sensor — Calibration & Test
 *  Board   : Arduino Uno / Nano
 *  Author  : Team SHIELD
 *  Version : 2.1.0
 * ============================================================
 *
 *  Description:
 *    Reads AC mains voltage using the ZMPT101B transformer-based
 *    voltage sensor. Samples 1000 ADC readings per cycle to find
 *    peak-to-peak amplitude, converts to true RMS, applies a
 *    calibration factor, and classifies the reading into:
 *      - NORMAL  : 200V – 250V (acceptable Indian mains range)
 *      - OVER_V  : > 250V      (over-voltage condition)
 *      - UNDER_V : < 170V      (under-voltage / sag condition)
 *      - OPEN    : < 5V        (open-circuit / no voltage)
 *
 *  Serial Output (9600 baud) — MQTT-bridge parseable:
 *    V:<value>|STATUS:<fault_code>|COUNT:<sample_no>
 *
 *  Hardware:
 *    ZMPT101B OUT → A0
 *    Onboard potentiometer → tune until reading ≈ 230V on mains
 *
 *  Libraries: None (pure Arduino)
 * ============================================================
 */

// ─── Pin Definitions ────────────────────────────────────────
#define SENSOR_PIN   A0

// ─── Calibration ────────────────────────────────────────────
// Adjust this value so that the reading matches a known multimeter
// reading on 230V Indian AC mains.  Typical range: 155 – 185.
const float CALIBRATION_FACTOR = 170.5f;

// ─── Fault Thresholds (Volts) ────────────────────────────────
const float V_OPEN    =   5.0f;   // Below this → open circuit
const float V_UNDER   = 170.0f;   // Below this → under-voltage
const float V_OVER    = 250.0f;   // Above this → over-voltage

// ─── Sampling ────────────────────────────────────────────────
const int   SAMPLE_COUNT  = 1000;
const float ADC_VREF      = 5.0f;
const float ADC_RESOLUTION = 1023.0f;

// ─── Globals ─────────────────────────────────────────────────
unsigned long sampleNumber = 0;

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  analogReference(DEFAULT);   // 5 V reference

  Serial.println(F("=============================================="));
  Serial.println(F(" PLCC SHIELD — ZMPT101B Calibration Module  "));
  Serial.println(F("=============================================="));
  Serial.println(F(" Format: V:<volts>|STATUS:<code>|COUNT:<n>   "));
  Serial.println(F("=============================================="));
  delay(500);
}

// ─────────────────────────────────────────────────────────────
void loop() {
  // ── 1. Acquire peak-to-peak over SAMPLE_COUNT readings ──
  int maxADC = 0;
  int minADC = ADC_RESOLUTION;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    int raw = analogRead(SENSOR_PIN);
    if (raw > maxADC) maxADC = raw;
    if (raw < minADC) minADC = raw;
  }

  // ── 2. Convert ADC counts → peak-to-peak voltage ────────
  float Vpp  = (maxADC - minADC) * (ADC_VREF / ADC_RESOLUTION);

  // ── 3. Peak-to-peak → Vrms (sine wave) ──────────────────
  float Vrms = (Vpp / 2.0f) * 0.7071f;

  // ── 4. Apply calibration factor ─────────────────────────
  float Vac  = Vrms * CALIBRATION_FACTOR;

  // ── 5. Classify fault condition ──────────────────────────
  const char* status;
  if      (Vac < V_OPEN)  status = "OPEN";
  else if (Vac < V_UNDER) status = "UNDER_V";
  else if (Vac > V_OVER)  status = "OVER_V";
  else                    status = "NORMAL";

  // ── 6. Emit structured serial line (MQTT-bridge ready) ──
  sampleNumber++;
  Serial.print(F("V:"));
  Serial.print(Vac, 1);
  Serial.print(F("|STATUS:"));
  Serial.print(status);
  Serial.print(F("|COUNT:"));
  Serial.println(sampleNumber);

  // ── 7. Human-readable debug ──────────────────────────────
  Serial.print(F("  [DEBUG] ADC pp="));
  Serial.print(maxADC - minADC);
  Serial.print(F("  Vpp="));
  Serial.print(Vpp, 3);
  Serial.print(F("V  Vrms="));
  Serial.print(Vrms, 3);
  Serial.println(F("V"));

  delay(1000);
}
