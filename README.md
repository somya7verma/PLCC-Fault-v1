# ⚡ PLCC-Based AI-Driven Fault Detection & Isolation System for LV Overhead Distribution

<div align="center">

![SIH 2025](https://img.shields.io/badge/SIH-2025-orange?style=for-the-badge&logo=lightning&logoColor=white)
![Category](https://img.shields.io/badge/Category-Hardware-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Arduino%20%7C%20FastAPI%20%7C%20React-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-red?style=for-the-badge)

**Smart India Hackathon 2025 | Hardware Category**

*An end-to-end real-time fault detection, classification, and isolation platform for Low-Voltage overhead power distribution lines — powered by edge intelligence, PLCC signalling, and cloud-connected dashboards.*

</div>

---

## 📌 Overview

Traditional low-voltage (LV) distribution networks rely on manual patrolling and time-consuming fault localisation, leading to prolonged outages and safety risks. **SHIELD** (Smart Hardware Intelligence for Electrical Line Detection) eliminates this by deploying a network of intelligent edge nodes at every distribution pole, enabling:

- **Automatic fault detection** within seconds of occurrence
- **Precise fault localisation** down to the individual pole segment
- **Remote relay isolation** to contain fault propagation
- **Predictive analytics** on historical power quality data
- **Real-time dashboard** for operators with full situational awareness

The system uses **Power Line Carrier Communication (PLCC)** principles alongside **433 MHz LoRa radio** for resilient, dual-path data delivery — ensuring communication even when the power line itself is faulted.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD / LOCAL SERVER                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  FastAPI Backend  ←→  MQTT Broker  ←→  SQLite / InfluxDB│   │
│  └────────────────────┬─────────────────────────────────────┘   │
│                       │  WebSocket / REST                        │
│  ┌────────────────────▼─────────────────────────────────────┐   │
│  │       React Dashboard  (Ops | Admin | Public Views)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────────┘
                        │  USB Serial / Wi-Fi
         ┌──────────────▼──────────────┐
         │   Base Station (laptop_rx)  │
         │   Arduino Uno + LoRa RX     │
         │   RF-to-PC Gateway          │
         └──────────────┬──────────────┘
                        │  LoRa 433 MHz (SF9, 125kHz, CRC)
         ┌──────────────▼──────────────────────────────┐
         │              FIELD NETWORK                   │
         │                                              │
         │  ┌──────────────┐     ┌──────────────┐      │
         │  │  Pole 1 Node │ ~~~ │  Pole 2 Node │ ...  │
         │  │  Arduino Uno │     │  Arduino Uno │      │
         │  │  ZMPT101B    │     │  ZMPT101B    │      │
         │  │  SCT-013     │     │  SCT-013     │      │
         │  │  LoRa TX     │     │  LoRa TX     │      │
         │  │  Relay       │     │  Relay       │      │
         │  │  RGB LED     │     │  RGB LED     │      │
         │  └──────────────┘     └──────────────┘      │
         └──────────────────────────────────────────────┘
```

---

## 🗂️ Repository Structure

```
PLCC-Fault-v1/
│
├── Arduino files/
│   └── ZMPT101B/
│       └── ZMPT101B.ino          # AC voltage sensor calibration & test
│
├── Phase 1/                      # Bluetooth-based 2-pole prototype
│   ├── BACKEND/                  # FastAPI + Gmail alerts backend
│   │   ├── app.py                # Main API server
│   │   └── gmail_utils.py        # Email notification service
│   ├── FRONTEND/                 # React-based operator dashboard
│   ├── pole_a/
│   │   └── pole_a.ino            # Pole A — Master / Upstream node
│   └── pole_b/
│       └── pole_b.ino            # Pole B — Slave / Downstream node
│
├── Phase 2/                      # LoRa-based multi-pole system (active)
│   ├── backend/                  # FastAPI + MQTT + SQLite backend
│   │   └── app.py                # Full production API server
│   ├── frontend/                 # React + Vite dashboard (multi-view)
│   │   └── src/
│   └── hardware/
│       └── 1-pole-calibration/
│           ├── README.md         # Hardware setup & pinout guide
│           ├── pole1_tx/
│           │   └── pole1_tx.ino  # Pole edge node (LoRa TX + sensors)
│           └── laptop_rx/
│               └── laptop_rx.ino # Base station gateway (LoRa RX)
│
└── README.md                     # ← You are here
```

---

## 🔧 Hardware Components

### Per Pole Node
| Component | Model | Purpose |
|-----------|-------|---------|
| Microcontroller | Arduino Uno (ATmega328P) | Edge computation & control |
| Voltage Sensor | ZMPT101B | AC mains RMS voltage measurement |
| Current Sensor | SCT-013-030 (30A) | AC current / overcurrent detection |
| Radio Module | SX1278 LoRa 433 MHz | Long-range wireless data uplink |
| Relay Module | 5V Single-channel (Active HIGH) | Section isolation on fault |
| Status Indicator | RGB LED (Common Cathode) | Visual fault indication |
| Bluetooth (Phase 1) | HC-05 | Short-range pole-to-pole comms |

### Base Station
| Component | Purpose |
|-----------|---------|
| Arduino Uno + LoRa SX1278 | RF-to-PC gateway |
| PC / Raspberry Pi | FastAPI backend + MQTT broker |

---

## ⚡ Fault Detection Logic

### Fault Classification Table

| Code | Condition | Action |
|------|-----------|--------|
| `NORMAL` | 170 V ≤ V ≤ 250 V, I ≤ 15 A | Green LED, relay closed |
| `OPEN` | V < 5 V | Blue LED, relay trips, alert sent |
| `UNDER_V` | 5 V ≤ V < 170 V | Red LED, relay trips, alert sent |
| `OVER_V` | V > 250 V | Red LED, relay trips, alert sent |
| `OVER_I` | I > 15 A | Red LED, relay trips (overcurrent) |
| `BT_LOSS` | HC-05 STATE = LOW | Red LED, relay trips (link lost) |
| `NO_ACK` | LoRa ACK timeout (2 s) | Warning logged, relay maintained |

### Detection Pipeline

```
Sensor Sample (500 pts)
        │
        ▼
  Peak-to-Peak → Vrms = (Vpp/2) × 0.7071
        │
        ▼
  Apply Calibration Factor (170.5×)
        │
        ▼
  Classify → NORMAL / OPEN / UNDER_V / OVER_V / OVER_I
        │
        ├─── NORMAL ──→ Send V:xxx|STATUS:NORMAL via LoRa (every 5s)
        │
        └─── FAULT  ──→ Trip Relay → Set LED Red → Send alert payload
                              │
                              ▼
                     FastAPI receives via MQTT
                              │
                              ▼
                     Dashboard alert + Gmail notification
```

---

## 📡 Communication Protocols

### LoRa Uplink Payload (Pole → Base Station)
```json
{"id":"P1","v":231.4,"i":4.82,"s":1115.3,"f":"NORMAL","seq":142}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Pole node identifier |
| `v` | float | AC RMS voltage (V) |
| `i` | float | AC RMS current (A) |
| `s` | float | Apparent power (VA) |
| `f` | string | Fault code |
| `seq` | int | Packet sequence number |

### Serial Heartbeat (to PC, every 1 second)
```
HEARTBEAT|BT=1|RELAY=ON|V=231.4|STATUS=NORMAL
```

### LoRa Downlink Commands (Base Station → Pole)
| Command | Effect |
|---------|--------|
| `TRIP` | Opens relay (isolates section) |
| `RESTORE` | Closes relay (restores section) |
| `PING` | Health check — pole responds `PONG\|P1` |

### PC → Base Station Serial Commands
```
TRIP:P1       → Sends TRIP to Pole 1
RESTORE:P1    → Sends RESTORE to Pole 1
PING:P1       → Health check
```

---

## 🚀 Getting Started

### Prerequisites
- Arduino IDE 1.8+ or Arduino IDE 2.x
- Python 3.9+ (for backend)
- Node.js 18+ (for frontend)
- MQTT Broker (Mosquitto recommended)

### Arduino Libraries Required
```
LoRa          by Sandeep Mistry    (v0.8.0+)   [Phase 2]
SoftwareSerial                     (built-in)   [Phase 1]
SPI                                (built-in)   [Phase 2]
```

Install via Arduino IDE → **Sketch → Include Library → Manage Libraries**.

---

### 1. Flash the Hardware

#### Phase 2 (LoRa — Recommended)

**Pole Node (`pole1_tx.ino`)**
1. Open `Phase 2/hardware/1-pole-calibration/pole1_tx/pole1_tx.ino`
2. Wire hardware per the pinout table below
3. Upload to Arduino Uno at the pole site
4. Open Serial Monitor (9600 baud) to verify

**Base Station (`laptop_rx.ino`)**
1. Open `Phase 2/hardware/1-pole-calibration/laptop_rx/laptop_rx.ino`
2. Wire LoRa module to laptop Arduino
3. Upload and keep connected via USB
4. Verify `LoRa OK` message in Serial Monitor

#### Phase 1 (Bluetooth — Legacy)

Flash `Phase 1/pole_a/pole_a.ino` to the master Arduino and  
`Phase 1/pole_b/pole_b.ino` to the slave Arduino.

---

### 2. Pinout Reference

#### Phase 2 — Pole Node
| Component | Arduino Pin |
|-----------|-------------|
| ZMPT101B OUT | A0 |
| SCT-013 OUT | A1 (+ 33 Ω burden resistor to GND) |
| LoRa NSS | D10 |
| LoRa RST | D9 |
| LoRa IRQ | D2 |
| LoRa MOSI | D11 |
| LoRa MISO | D12 |
| LoRa SCK | D13 |
| Relay IN | D7 |
| RGB Red | D4 |
| RGB Green | D5 |
| RGB Blue | D6 |

#### Phase 2 — Base Station
| Component | Arduino Pin |
|-----------|-------------|
| LoRa NSS | D10 |
| LoRa RST | D9 |
| LoRa IRQ | D2 |
| LoRa MOSI | D11 |
| LoRa MISO | D12 |
| LoRa SCK | D13 |
| Status LED | D7 |

---

### 3. Run the Backend

```bash
cd Phase\ 2/backend
pip install -r requirements.txt          # FastAPI, paho-mqtt, etc.
python app.py
```

Backend runs on `http://localhost:8000` with:
- `GET  /api/poles`          — Live pole status
- `GET  /api/faults`         — Fault event history
- `POST /api/relay/{pole_id}` — Send TRIP / RESTORE command
- `WS   /ws/live`            — WebSocket live feed

---

### 4. Run the Frontend Dashboard

```bash
cd Phase\ 2/frontend
npm install
npm run dev
```

Dashboard available at `http://localhost:5173`

**Views:**
| View | URL | Access |
|------|-----|--------|
| Operator (Ops) | `/ops` | Field engineers |
| Admin | `/admin` | System administrators |
| Public | `/` | General awareness |

---

### 5. ZMPT101B Calibration

> ⚠️ **Safety Warning**: Never connect the ZMPT101B directly to 230V mains without proper isolation and insulated wiring. Always verify with a multimeter first.

1. Flash `Arduino files/ZMPT101B/ZMPT101B.ino`
2. Open Serial Monitor at 9600 baud
3. With mains connected, adjust the onboard potentiometer until the reading matches your multimeter (should be ~230V)
4. Note the effective calibration factor — update `CALIBRATION_FACTOR` in all `.ino` files

---

## 📊 Dashboard Features

- **Real-time voltage & current graphs** per pole (WebSocket-fed)
- **Colour-coded pole status map** (Green / Red / Blue per fault)
- **Fault event log** with timestamp, pole ID, and fault code
- **One-click relay control** (TRIP / RESTORE from browser)
- **Email alert dispatch** via Gmail API on critical faults
- **Predictive fault indicators** based on rolling voltage trend
- **Outage duration timer** per faulted section
- **Responsive design** — works on mobile for field engineers

---

## 🔬 Predictive Techniques Applied

| Technique | Application |
|-----------|-------------|
| Rolling RMS averaging | Noise-resilient voltage estimation |
| Peak-to-peak sampling (N=500) | AC waveform characterisation |
| Threshold hysteresis | Prevents relay chattering on borderline values |
| Sequence numbering | Detects packet loss and LoRa link degradation |
| RSSI/SNR trending | Predicts impending LoRa link failures |
| Historical fault frequency | Identifies recurring fault-prone segments |

---

## 👥 Team

**Team SHIELD** — SIH 2025 Hardware Category

> Built with ❤️ for India's power distribution reliability.

---

## 📄 License

This project is licensed under the MIT License.  
© 2025 Team SHIELD | Smart India Hackathon
