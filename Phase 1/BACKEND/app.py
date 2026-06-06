import base64
import threading
import time
from flask import Flask, jsonify, request
import serial
from flask_cors import CORS

from gmail_service import Create_Service
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

ARDUINO_PORT = 'COM16' 
BAUD_RATE = 9600
ALERT_EMAIL = 'somya2006acc@gmail.com'

app = Flask(__name__)
CORS(app)

try:
    ser = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
except serial.SerialException as e:
    print(f"Error opening serial port {ARDUINO_PORT}: {e}")
    ser = None

state_lock = threading.Lock()
last_serial_time = time.time()

nodes = {
    1: {'connected': True, 'fault': False, 'online': True, 'email_sent': False},
    2: {'connected': True, 'fault': False, 'online': True}
}

faults = []

def send_gmail_alert(subject, body):
    try:
        service = Create_Service('client_secret.json', 'gmail', 'v1', ['https://mail.google.com/'])
        mimeMessage = MIMEMultipart()
        mimeMessage['to'] = ALERT_EMAIL
        mimeMessage['subject'] = subject
        mimeMessage.attach(MIMEText(body, 'plain'))
        raw_string = base64.urlsafe_b64encode(mimeMessage.as_bytes()).decode()
        service.users().messages().send(userId='me', body={'raw': raw_string}).execute()
        print("Alert email sent.")
    except Exception as e:
        print("Failed to send alert email:", e)

def update_node_status(line):
    """Update node statuses based on Bluetooth communication."""
    global last_serial_time
    last_serial_time = time.time()
    line = line.strip()

    with state_lock:
        # Pole 1 is the Master.
        nodes[1].update({'connected': True, 'fault': False, 'online': True})

        if "BT_STATE Pin7=1" in line or "✅ BT CONNECTED" in line or "STATUS:OK" in line or "BT=1" in line:
            nodes[2].update({'online': True, 'connected': True, 'fault': False})
            if "RELAY=ENABLED" in line or "✅ BT CONNECTED" in line or "STATUS:OK" in line:
                nodes[1].update({'fault': False})
        
        if "BT_STATE Pin7=0" in line or "🔴 BT DISCONNECTED" in line or "SHOW_RESET_BUTTON:1" in line or "BT=0" in line:
            nodes[2].update({'online': False, 'connected': False})
            nodes[1].update({'fault': True})
        
        if "RELAY=DISABLED" in line or "🔴 BT DISCONNECTED" in line:
            nodes[1].update({'fault': True})
            
        if "SHOW_RESET_BUTTON:0" in line or "STATUS:OK" in line:
            nodes[1].update({'fault': False})

        # Parse Slave voltage data passed through Master
        if "VOLTAGE:1" in line:
            nodes[2].update({'connected': True, 'fault': False, 'online': True})
        elif "VOLTAGE:0" in line:
            if not nodes[2]['fault']:
                send_gmail_alert("LV Feeder Fault", "There is breakage at LV feeder 2. Please attend immediately.\n\nPole Details: Lat 10.021, Lng 76.295\nLocation: Popular Road, Near Punnakal Junction, Elamakarra")
            nodes[2].update({'connected': True, 'fault': True, 'online': True})
            nodes[1].update({'fault': True}) # Chain fault to master relay

@app.route("/nodes")
def get_nodes():
    with state_lock:
        data = [
            {"id": 1, "connected": nodes[1]['connected'], "fault": nodes[1]['fault'], "online": nodes[1]['online'], "lat": 10.02, "lng": 76.30},
            {"id": 2, "connected": nodes[2]['connected'], "fault": nodes[2]['fault'], "online": nodes[2]['online'], "lat": 10.021, "lng": 76.295}
        ]
    return jsonify(data)

@app.route("/status")
def status():
    offline = (time.time() - last_serial_time) > 10
    with state_lock:
        return jsonify({
            "backend_online": not offline,
            "any_fault": nodes[1]['fault'] or nodes[2]['fault']
        })

@app.route("/faults")
def faults_route():
    with state_lock:
        return jsonify(faults)

@app.route("/reset", methods=["POST"])
def reset():
    if ser:
        try:
            ser.write(b"RESET\n")
            return jsonify({"ok": True, "msg": "RESET command sent"})
        except Exception as e:
            return jsonify({"ok": False, "msg": str(e)}), 500
    else:
        with state_lock:
            nodes[1].update({'fault': False})
            nodes[2].update({'fault': False})
        return jsonify({"ok": True, "msg": "SIMULATION RESET - States Cleared"})
def serial_reader():
    global ser, last_serial_time
    while True:
        # If serial port is not open, try to reconnect
        if ser is None or not ser.is_open:
            try:
                ser = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
                print(f"Serial port {ARDUINO_PORT} connected successfully.")
            except serial.SerialException as e:
                print(f"Waiting for serial port {ARDUINO_PORT}... ({e})")
                time.sleep(3)
                continue

        try:
            line = ser.readline().decode(errors='ignore').strip()
            # Keep last_serial_time alive as long as the port is open,
            # even when no data is received (empty reads are normal).
            last_serial_time = time.time()
            if line:
                print(f"Received: {line}")
                update_node_status(line)
        except Exception as e:
            print(f"Serial reader error: {e}")
            try:
                ser.close()
            except Exception:
                pass
            ser = None
            time.sleep(1)

import random

def simulation_loop():
    """Simulates serial data when hardware is not connected."""
    print("Simulation Mode Active")
    while True:
        # Occasionally simulate a fault
        voltage = "1" if random.random() > 0.1 else "0"
        line = f"POLE2,VOLTAGE:{voltage}"
        update_node_status(line)
        time.sleep(2)

if __name__ == "__main__":
    # Serial reader thread handles connection and auto-reconnection
    threading.Thread(target=serial_reader, daemon=True).start()
    
    app.run(host="0.0.0.0", port=5000)

