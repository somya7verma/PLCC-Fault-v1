# SHIELD Hardware Phase 1: 1-Pole Calibration Setup

## Devices
1. **Laptop Arduino Uno**: 1x LoRa RX + 1x HC-05 + 16x2 LCD (I2C)
2. **Pole1 Arduino Uno**: 1x ZMPT101B + 1x LoRa TX + 1x Relay + 1x RGB LED

## Rules
- Pole1 sends voltage ONLY when LoRa link OK with laptop.
- Laptop receives voltage → Shows on Serial + LCD.
- Relay/LED OFF until LoRa connected.
- ZMPT101B calibrated for 220V India mains.
- Serial monitor output for debugging.

## Pinouts

### Laptop Uno
| Component | Pin | Description |
|-----------|-----|-------------|
| LoRa NSS  | D2  | LoRa Chip Select |
| LoRa RST  | D3  | LoRa Reset |
| LoRa IRQ  | D5  | LoRa Interrupt |
| HC-05 RX  | D6  | Bluetooth RX |
| HC-05 TX  | D7  | Bluetooth TX |
| LCD SDA   | A4  | I2C Data |
| LCD SCL   | A5  | I2C Clock |
| SPI SCK   | D13 | Shared SPI |
| SPI MOSI  | D11 | Shared SPI |
| SPI MISO  | D12 | Shared SPI |

### Pole1 Uno
| Component | Pin | Description |
|-----------|-----|-------------|
| ZMPT101B  | A0  | Analog Output |
| LoRa NSS  | D2  | LoRa Chip Select |
| LoRa IRQ  | D6  | LoRa Interrupt |
| Relay IN  | D7  | Relay Control |
| RGB Red   | D8  | Red Component |
| RGB Green | D9  | Green Component |
| RGB Blue  | D10 | Blue Component |
| SPI SCK   | D13 | Shared SPI |
| SPI MOSI  | D11 | Shared SPI |
| SPI MISO  | D12 | Shared SPI |

## Setup Instructions
1. **Libraries**:
   - `LoRa` by Sandeep Mistry
   - `LiquidCrystal I2C` by Frank de Brabander
2. **Calibration**:
   - Use a multimeter to verify 220V AC.
   - Adjust the ZMPT101B onboard potentiometer until the readings match.
3. **Safety**:
   - **CAUTION**: 220V mains is dangerous. Use insulated wires and verify with a multimeter before connecting to the Arduino.

## Test Sequence
1. Wire without 220V → Check LoRa link in Serial monitor.
2. Add ZMPT101B → 220V test (Multimeter first!).
3. Verify Laptop LCD shows Pole1 voltage → Relay ON → Green LED.
