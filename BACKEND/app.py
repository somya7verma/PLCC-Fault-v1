import base64
import threading
import time
from flask import Flask, jsonify, request
import serial
from flask_cors import CORS

from gmail_service import Create_Service
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

ARDUINO_PORT = 'COM9' 
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
    1: {'connected': False, 'fault': False, 'online': False, 'email_sent': False},
    2: {'connected': False, 'fault': False, 'online': False}
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
    """Update node statuses and send email only on new fault."""
    global last_serial_time
    last_serial_time = time.time()
    line = line.strip()

    with state_lock:
        prev_fault = nodes[1]['fault']
        prev_email_sent = nodes[1].get('email_sent', False)

        if line in ("OK", "STATUS:OK", "STATUS:RESET"):
            nodes[1].update({'connected': True, 'fault': False, 'online': True, 'email_sent': False})

        elif line in ("FAULT", "STATUS:FAULT"):
            nodes[1].update({'connected': False, 'fault': True, 'online': True})
            if not prev_fault or not prev_email_sent:
                send_gmail_alert("LV Feeder Fault", "There is breakage at LV feeder 1. Please attend immediately.\n\nThis is an automated message.\n Please do not reply.\n\n Pole Details: Lat 10.0200, Lng 76.3000\n Location: Popular Road, Near Punnakal Junction, Elamakarra")
                nodes[1]['email_sent'] = True

        elif line == "STATUS:WAIT_LINK":
            nodes[1].update({'connected': False, 'fault': False, 'online': False, 'email_sent': False})

        fault_present = nodes[1]['fault']
        nodes[2]['fault'] = fault_present
        nodes[2]['online'] = not fault_present
        nodes[2]['connected'] = nodes[2]['online']

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
    offline = (time.time() - last_serial_time) > 3
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
    return jsonify({"ok": False, "msg": "Serial port not open"}), 500

def serial_reader():
    if ser is None:
        print("Serial port not open, serial reader thread not started")
        return
    while True:
        try:
            line = ser.readline().decode(errors='ignore').strip()
            if line:
                print(f"Received: {line}")
                update_node_status(line)
        except:
            time.sleep(0.2)

if __name__ == "__main__":
    threading.Thread(target=serial_reader, daemon=True).start()
    app.run(host="0.0.0.0", port=5000)
