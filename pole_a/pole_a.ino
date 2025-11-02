#include <SoftwareSerial.h>

// Pin definitions
#define BT_RX 2
#define BT_TX 3
#define VOLTAGE_SWITCH 4
#define STATUS_LED 13

SoftwareSerial bluetooth(BT_RX, BT_TX);

int lastVoltageState = -1;
unsigned long lastTransmission = 0;
const unsigned long TRANSMISSION_INTERVAL = 2000; // 2 seconds

void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);
  
  pinMode(VOLTAGE_SWITCH, INPUT_PULLUP);
  pinMode(STATUS_LED, OUTPUT);
  
  Serial.println("Pole 2 Slave Started");
  Serial.println("Connecting to Pole 1...");
  
  // Initial connection indicator
  for(int i = 0; i < 5; i++) {
    digitalWrite(STATUS_LED, HIGH);
    delay(200);
    digitalWrite(STATUS_LED, LOW);
    delay(200);
  }
  
  delay(2000);
}

void loop() {
  // Read voltage state (switch position)
  int currentVoltageState = digitalRead(VOLTAGE_SWITCH);
  
  // Send data every 2 seconds or when state changes
  if ((millis() - lastTransmission > TRANSMISSION_INTERVAL) || 
      (currentVoltageState != lastVoltageState)) {
    
    sendVoltageStatus(currentVoltageState);
    lastVoltageState = currentVoltageState;
    lastTransmission = millis();
    
    // Update status LED
    if (currentVoltageState == HIGH) {  // Switch open = voltage present
      digitalWrite(STATUS_LED, HIGH);
      Serial.println("Voltage OK");
    } else {  // Switch closed = no voltage (fault simulation)
      digitalWrite(STATUS_LED, LOW);
      Serial.println("Voltage FAULT");
    }
  }
  
  delay(100);
}

void sendVoltageStatus(int voltageState) {
  String message = "POLE2,VOLTAGE:";
  
  if (voltageState == HIGH) {
    message += "1";  // Voltage present
  } else {
    message += "0";  // No voltage (fault)
  }
  
  bluetooth.println(message);
  Serial.println("Sent: " + message);
}
