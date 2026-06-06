/**
 * ============================================================
 *  PLCC Fault Detection & Isolation System — SIH 2025
 *  Module  : Phase 2 — Base Station Receiver (Laptop Node)
 *  Board   : Arduino Uno + LoRa SX1278 (433 MHz)
 *  Author  : Team SHIELD
 *  Version : 2.0.0
 * ============================================================
 *
 *  Role:
 *    The base-station receiver acts as the RF-to-PC gateway.
 *    It:
 *      • Listens for LoRa uplink packets from all pole nodes.
 *      • Forwards received payloads to the PC over USB-Serial
 *        (9600 baud) for ingestion by the FastAPI/MQTT bridge.
 *      • Sends an ACK back to the originating pole after each
 *        valid packet.
 *      • Reads RSSI and SNR per packet for link-quality logging.
 *      • Relays downlink commands (TRIP / RESTORE / PING) from
 *        the PC to the addressed pole node.
 *
 *  Serial Input (from PC, newline-terminated):
 *    "TRIP:<pole_id>"     — e.g. "TRIP:P1"
 *    "RESTORE:<pole_id>"  — e.g. "RESTORE:P1"
 *    "PING:<pole_id>"     — e.g. "PING:P1"
 *
 *  Serial Output (to PC, newline-terminated):
 *    "RX|RSSI:<dBm>|SNR:<dB>|DATA:<json_payload>"
 *    "TX_CMD|CMD:<cmd>|POLE:<id>"
 *    "ERROR:<description>"
 *
 *  LoRa Config (must match pole nodes):
 *    Frequency   : 433 MHz
 *    SF          : 9
 *    BW          : 125 kHz
 *    CR          : 4/5
 *    CRC         : enabled
 *
 *  Wiring:
 *    LoRa NSS       → D10
 *    LoRa RST       → D9
 *    LoRa IRQ (DIO0)→ D2
 *    LoRa MOSI      → D11 (hardware SPI)
 *    LoRa MISO      → D12
 *    LoRa SCK       → D13
 *    Status LED     → D7  (HIGH = LoRa OK, blinks on RX)
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
#define LORA_FREQ   433E6

// ─── Status LED ──────────────────────────────────────────────
#define STATUS_LED  7

// ─── Globals ─────────────────────────────────────────────────
unsigned long rxCount = 0;

// ─────────────────────────────────────────────────────────────
/** Brief LED blink to signal packet activity. */
void blinkLED(int times = 1, int ms = 80) {
  for (int i = 0; i < times; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(ms);
    digitalWrite(STATUS_LED, LOW);
    if (i < times - 1) delay(ms);
  }
}

/** Send a LoRa downlink command and log it to serial. */
void sendCommand(const String& cmd) {
  LoRa.beginPacket();
  LoRa.print(cmd);
  LoRa.endPacket();
  LoRa.receive();   // Return to RX mode immediately

  Serial.print(F("TX_CMD|CMD:"));
  Serial.println(cmd);
  blinkLED(2, 50);
}

/** Handle a PC command string (format: "CMD:POLE_ID"). */
void handlePCCommand(const String& raw) {
  int sep = raw.indexOf(':');
  if (sep < 0) {
    Serial.print(F("ERROR:INVALID_COMMAND="));
    Serial.println(raw);
    return;
  }
  String cmd    = raw.substring(0, sep);
  String poleId = raw.substring(sep + 1);
  cmd.trim();
  poleId.trim();

  // Build LoRa command string
  // Pole nodes respond to bare "TRIP", "RESTORE", "PING" —
  // they self-identify.  We broadcast; the target pole
  // matches on its own ID in the payload if multiple nodes
  // are extended in future.
  if (cmd == F("TRIP") || cmd == F("RESTORE") || cmd == F("PING")) {
    Serial.print(F("TX_CMD|CMD="));
    Serial.print(cmd);
    Serial.print(F("|POLE="));
    Serial.println(poleId);
    sendCommand(cmd);
  } else {
    Serial.print(F("ERROR:UNKNOWN_CMD="));
    Serial.println(cmd);
  }
}

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  Serial.println(F("=============================================="));
  Serial.println(F(" PLCC SHIELD — Base Station RX Gateway       "));
  Serial.println(F(" Phase 2 | SIH 2025 | 433 MHz LoRa           "));
  Serial.println(F("=============================================="));

  // Initialise LoRa
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_IRQ);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println(F("ERROR: LoRa init failed — check wiring!"));
    // Rapid blink to signal error
    while (true) { blinkLED(5, 100); delay(300); }
  }

  // LoRa link-layer config — MUST match pole nodes
  LoRa.setSpreadingFactor(9);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);
  LoRa.enableCrc();

  LoRa.receive();   // Enter continuous receive mode

  digitalWrite(STATUS_LED, HIGH);   // Solid ON = radio ready

  Serial.println(F("LoRa OK — SF9 / 125kHz / CR4/5 / CRC ON"));
  Serial.println(F("Listening for pole uplinks..."));
  Serial.println(F("PC commands: TRIP:<id> | RESTORE:<id> | PING:<id>"));
}

// ─────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Check for incoming LoRa packet ───────────────────
  int pktSize = LoRa.parsePacket();
  if (pktSize > 0) {
    // Read payload
    String payload = "";
    while (LoRa.available()) {
      payload += (char)LoRa.read();
    }
    payload.trim();

    int    rssi = LoRa.packetRssi();
    float  snr  = LoRa.packetSnr();
    rxCount++;

    // Forward to PC with link-quality metadata
    Serial.print(F("RX|RSSI:"));
    Serial.print(rssi);
    Serial.print(F("|SNR:"));
    Serial.print(snr, 1);
    Serial.print(F("|CNT:"));
    Serial.print(rxCount);
    Serial.print(F("|DATA:"));
    Serial.println(payload);

    // Send ACK back to sender
    delay(10);  // Short guard time
    LoRa.beginPacket();
    LoRa.print(F("ACK"));
    LoRa.endPacket();
    LoRa.receive();   // Return to RX mode

    blinkLED(1, 80);  // Single blink = packet received
  }

  // ── 2. Check for PC downlink commands ───────────────────
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      handlePCCommand(cmd);
    }
  }
}
