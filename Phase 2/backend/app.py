"""
Phase 2: 220V AC Power Line Fault Detection System
Flask Backend with Serial Communication, WebSocket, and REST APIs
"""

from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import sqlite3
import serial
import threading
import time
import random
from datetime import datetime, timedelta
import json
import gmail_utils
import requests
import math

app = Flask(__name__)
app.config['SECRET_KEY'] = 'shield-phase2-secret-key'

# Permissive CORS for local development environments
CORS(app, origins=[
    'https://public-shield.vercel.app',
    'https://admin-shield.vercel.app', 
    'https://ops-shield.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://10.195.207.235:3000'
], resources={r"/*": {"origins": "*"}}, supports_credentials=True)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

from functools import wraps
def jwt_required():
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Simple placeholder for JWT auth
            auth_header = request.headers.get('Authorization')
            if not auth_header:
                return jsonify({"error": "Missing Authorization Header"}), 401
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Serial port configuration
SERIAL_PORTS = {
    'pole1': 'COM3',
    'pole2': 'COM4',
    'lcd': 'COM5'
}

# Global state
SIMULATION_MODE = False
SERIAL_HUB_CONNECTED = False
LAST_SERIAL_DATA_TIME = 0
poles_data = {
    1: {'id': 1, 'voltage': 0.0, 'fault': False, 'relay': 'closed', 'trend': 0.0, 'timestamp': None, 'status': 'WAITING FOR HARDWARE', 'predicted_fault': 'NORMAL', 'last_pred': 0},
    2: {'id': 2, 'voltage': 0.0, 'fault': False, 'relay': 'closed', 'trend': 0.0, 'timestamp': None, 'status': 'WAITING FOR HARDWARE', 'predicted_fault': 'NORMAL', 'last_pred': 0}
}
chat_messages = []

# Pole coordinates for heatmap
POLE_COORDINATES = {
    1: [10.02, 76.30],
    2: [10.021, 76.295]
}

# Serial connections
serial_connections = {}

# Energy tracking
energy_data = {
    'hourly_kwh': [0.0] * 24,
    'daily_kwh': 0.0,
    'cost_per_unit': 8.0
}

# Predictive warnings
predictive_warnings = []

# Email Cooldown
LAST_EMAIL_SENT = {
    1: None,
    2: None
}
EMAIL_COOLDOWN_SECONDS = 600  # 10 minutes

TELEGRAM_TOKEN = '8538039994:AAFUp8XAE_BFwSa9JHshgGVnt5UkPGod9gc'.strip()
DASHBOARD_URL = 'http://10.195.207.235:3000'


DEFAULT_EMAIL_TEMPLATE = """
SYSTEM ALERT: POWER LINE FAULT DETECTED

Pole ID: {pole_id}
Fault Type: {fault_type}
Voltage: {voltage}V
Status: {status}
Time: {time}

Please dispatch maintenance team immediately.

- The Shield Detection System
"""

DEFAULT_TELEGRAM_TEMPLATE = """
SYSTEM ALERT: POWER LINE FAULT DETECTED

FAULT POLE {pole_id}
Type: {fault_type}
Voltage: {voltage}V
Status: {status}
Time: {time}

Access Dashboard (Mobile): http://10.195.207.235:3000
Please dispatch maintenance team immediately.
"""

# Database setup
def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS poles
                 (id INTEGER PRIMARY KEY, voltage REAL, fault INTEGER, 
                  relay TEXT, trend REAL, timestamp TEXT)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS faults_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, pole_id INTEGER, 
                  voltage REAL, fault_type TEXT, timestamp TEXT, resolved INTEGER DEFAULT 0,
                  duration_seconds INTEGER DEFAULT 0)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS voltage_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pole_id INTEGER,
                    voltage REAL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT
                 )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS config
                 (id INTEGER PRIMARY KEY, email_recipients TEXT, mobile TEXT, 
                  serial_ports TEXT, email_template TEXT, 
                  telegram_token TEXT, telegram_chat_id TEXT, telegram_template TEXT)''')
    
    c.execute('SELECT COUNT(*) FROM config')
    if c.fetchone()[0] == 0:
        default_emails = json.dumps(['admin@company.com'])
        c.execute('''INSERT INTO config 
                     (id, email_recipients, mobile, serial_ports, email_template, 
                      telegram_token, telegram_chat_id, telegram_template) 
                     VALUES (1, ?, ?, ?, ?, ?, ?, ?)''',
                  (default_emails, '+91XXXXXXXXXX', 'COM3,COM4,COM5', DEFAULT_EMAIL_TEMPLATE, 
                   '', '', DEFAULT_TELEGRAM_TEMPLATE))
    else:
        # DB Migration
        columns = [i[1] for i in c.execute('PRAGMA table_info(config)')]
        if 'email_template' not in columns:
            print("Migrating: Adding email_template...")
            c.execute('ALTER TABLE config ADD COLUMN email_template TEXT')
            c.execute('UPDATE config SET email_template = ? WHERE id = 1', (DEFAULT_EMAIL_TEMPLATE,))
        
        if 'telegram_token' not in columns:
            print("Migrating: Adding Telegram fields...")
            c.execute('ALTER TABLE config ADD COLUMN telegram_token TEXT')
            c.execute('ALTER TABLE config ADD COLUMN telegram_chat_id TEXT')
            c.execute('ALTER TABLE config ADD COLUMN telegram_template TEXT')
            c.execute('UPDATE config SET telegram_template = ? WHERE id = 1', (DEFAULT_TELEGRAM_TEMPLATE,))
            
    # Force update for this fix (Apply new template to DB on every restart)
    c.execute('UPDATE config SET telegram_template = ? WHERE id = 1', (DEFAULT_TELEGRAM_TEMPLATE,))
            
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def get_config():
    conn = get_db_connection()
    config = conn.execute('SELECT * FROM config WHERE id = 1').fetchone()
    conn.close()
    return dict(config) if config else {}

def get_email_recipients():
    config = get_config()
    try:
        return json.loads(config.get('email_recipients', '[]'))
    except:
        return []

def get_email_template():
    return get_config().get('email_template', DEFAULT_EMAIL_TEMPLATE)

def get_telegram_config():
    config = get_config()
    chat_ids_raw = config.get('telegram_chat_id', '[]')
    try:
        chat_ids = json.loads(chat_ids_raw)
        if not isinstance(chat_ids, list):
            chat_ids = [str(chat_ids)] if chat_ids else []
    except:
        chat_ids = [chat_ids_raw] if chat_ids_raw else []
        
    return {
        'token': config.get('telegram_token', '').strip() or TELEGRAM_TOKEN,
        'chat_ids': chat_ids,
        'template': config.get('telegram_template', DEFAULT_TELEGRAM_TEMPLATE)
    }

# Serial communication
def init_serial():
    global serial_connections
    for name, port in SERIAL_PORTS.items():
        try:
            serial_connections[name] = serial.Serial(port, 9600, timeout=1)
            print(f"✓ Connected to {port} ({name})")
        except Exception as e:
            serial_connections[name] = None

def parse_lora_data(data_string):
    try:
        parts = data_string.strip().split(',')
        if len(parts) >= 4:
            return {
                'id': int(parts[0]),
                'voltage': float(parts[1]),
                'fault': parts[2].upper() == 'FAULT',
                'relay': parts[3].lower()
            }
    except:
        pass
    return None

def process_email_sending_background(recipients, subject, email_body, tg_config, tg_message, delay=3, is_test=False):
    """Background task to send emails sequentially and triggers Telegram alert"""
    try:
        # TELEGRAM ALERTS
        if tg_config['token'] and tg_config['chat_ids']:
            socketio.emit('email_progress', {'type': 'telegram_start'})
            for chat_id in tg_config['chat_ids']:
                try:
                    url = f"https://api.telegram.org/bot{tg_config['token']}/sendMessage"
                    payload = {
                        'chat_id': chat_id,
                        'text': tg_message,
                        'disable_web_page_preview': True
                    }
                    resp = requests.post(url, json=payload)
                    
                    if resp.status_code == 200:
                        socketio.emit('email_progress', {'type': 'telegram_success', 'chat_id': chat_id})
                        print(f"✓ Telegram alert sent to {chat_id}")
                    else:
                        socketio.emit('email_progress', {'type': 'telegram_fail', 'error': resp.text, 'chat_id': chat_id})
                        print(f"Telegram failed for {chat_id}: {resp.text}")
                except Exception as e:
                    socketio.emit('email_progress', {'type': 'telegram_fail', 'error': str(e), 'chat_id': chat_id})
                    print(f"Telegram connection error for {chat_id}: {e}")

        # EMAIL ALERTS
        service = gmail_utils.get_gmail_service()
        if not service:
            socketio.emit('email_progress', {'type': 'error', 'message': 'Failed to connect to Gmail'})
            return

        total = len(recipients)
        if total > 0:
            socketio.emit('email_progress', {'type': 'start', 'total': total, 'is_test': is_test})
            
            for i, email in enumerate(recipients):
                socketio.emit('email_progress', {'type': 'sending', 'recipient': email, 'current': i+1, 'total': total})
                res = gmail_utils.send_single_email(service, email, subject, email_body)
                
                if res:
                    socketio.emit('email_progress', {'type': 'sent', 'recipient': email})
                else:
                    socketio.emit('email_progress', {'type': 'failed', 'recipient': email})
            
            socketio.emit('email_progress', {'type': 'complete', 'total': total})
        
    except Exception as e:
        print(f"Alert process error: {e}")
        socketio.emit('email_progress', {'type': 'error', 'message': str(e)})

def send_fault_email(pole_id, voltage, fault_type):
    global LAST_EMAIL_SENT
    
    now = datetime.now()
    last_sent = LAST_EMAIL_SENT.get(pole_id)
    
    if last_sent and (now - last_sent).total_seconds() < EMAIL_COOLDOWN_SECONDS:
        print(f"Skipping alert for Pole {pole_id} (Cooldown active)")
        return

    recipients = get_email_recipients()
    tg_config = get_telegram_config()
    
    # Prepare contents
    is_fault = poles_data.get(pole_id, {}).get('fault', False)
    context = {
        'pole_id': pole_id, 
        'fault_type': fault_type,
        'voltage': f"{voltage:.1f}", 
        'status': '🔴 FAULT' if is_fault else '🟢 NORMAL', 
        'time': now.strftime('%H:%M %p')
    }
    
    email_template = get_email_template()
    tg_template = tg_config['template']
    
    email_body = email_template.format(**context)
    tg_message = tg_template.format(**context)
    
    subject = f"⚠️ CRITICAL FAULT ALERT: Pole {pole_id}"
    
    print(f"Triggering alerts for Pole {pole_id}...")
    threading.Thread(target=process_email_sending_background, 
                     args=(recipients, subject, email_body, tg_config, tg_message, 0, False)).start()
    
    LAST_EMAIL_SENT[pole_id] = now

def read_serial_data():
    global poles_data, predictive_warnings, SERIAL_HUB_CONNECTED, LAST_SERIAL_DATA_TIME
    voltage_history = {1: [], 2: []}
    
    print("\n" + "="*40)
    print("⏳ WAITING FOR ARDUINO DATA...")
    print("="*40 + "\n")
    
    while True:
        data_received_this_loop = False
        try:
            for pole_name in ['pole1', 'pole2']:
                if serial_connections.get(pole_name):
                    try:
                        if serial_connections[pole_name].in_waiting:
                            line = serial_connections[pole_name].readline().decode('utf-8').strip()
                            if line:
                                parsed = parse_lora_data(line)
                                if parsed:
                                    data_received = True
                                    pole_id = parsed['id']
                                    old_voltage = poles_data[pole_id]['voltage']
                                    
                                    # If simulation mode is OFF, update from serial
                                    if not SIMULATION_MODE:
                                        poles_data[pole_id].update({
                                            'voltage': parsed['voltage'],
                                            'fault': parsed['fault'],
                                            'relay': parsed['relay'],
                                            'trend': parsed['voltage'] - old_voltage,
                                            'timestamp': datetime.now().isoformat(),
                                            'status': 'ONLINE'
                                        })
                                    else:
                                        # Only update relay status and trend from serial if in simulation
                                        poles_data[pole_id].update({
                                            'relay': parsed['relay'],
                                            'trend': poles_data[pole_id]['voltage'] - old_voltage,
                                            'status': 'SIMULATING'
                                        })
                                    
                                    voltage_history[pole_id].append(parsed['voltage'])
                                    if len(voltage_history[pole_id]) > 30:
                                        voltage_history[pole_id].pop(0)
                                    
                                    if parsed['fault']:
                                        log_fault(pole_id, parsed['voltage'], 'VOLTAGE_FAULT')
                                        # Only send alerts if hardware is actually talking to us in LIVE mode
                                        if not SIMULATION_MODE:
                                            send_fault_email(pole_id, parsed['voltage'], 'LORA_HARDWARE_FAULT')
                                    
                                    data_received_this_loop = True
                                    log_voltage_reading(pole_id, parsed['voltage'], 'FAULTY' if parsed['fault'] else 'NORMAL')
                                    
                                    # Periodic Prediction (Every 5 minutes)
                                    now_ts = time.time()
                                    if now_ts - poles_data[pole_id].get('last_pred', 0) > 300:
                                        prediction = predict_fault(pole_id)
                                        poles_data[pole_id]['predicted_fault'] = prediction
                                        poles_data[pole_id]['last_pred'] = now_ts
                                        print(f"🔮 Prediction for Pole {pole_id}: {prediction}")
                                        
                    except Exception as e:
                        print(f"Error reading {pole_name}: {e}")
            
            # Update Hardware Connection Status
            if data_received_this_loop:
                SERIAL_HUB_CONNECTED = True
                LAST_SERIAL_DATA_TIME = time.time()
            elif time.time() - LAST_SERIAL_DATA_TIME > 5: # 5 second timeout
                SERIAL_HUB_CONNECTED = False
            
            if data_received_this_loop:
                generate_predictions(voltage_history)
                update_energy_data()
            
            socketio.emit('poles_update', {
                'poles': list(poles_data.values()),
                'timestamp': datetime.now().isoformat(),
                'hardware_connected': SERIAL_HUB_CONNECTED
            })
            
        except Exception as e:
            print(f"Serial loop error: {e}")
        
        time.sleep(0.1)

def generate_predictions(voltage_history):
    global predictive_warnings
    predictive_warnings = []
    
    for pole_id in [1, 2]:
        history = voltage_history.get(pole_id, [])
        if len(history) >= 5:
            recent = history[-5:]
            trend = (recent[-1] - recent[0]) / len(recent)
            
            if trend < -0.2:
                minutes_to_fault = abs(recent[-1] / trend) if trend != 0 else 999
                predictive_warnings.append({
                    'type': 'warning',
                    'pole_id': pole_id,
                    'message': f'Pole {pole_id}: Voltage dropping {abs(trend):.1f}V/reading → Fault in ~{minutes_to_fault:.0f} mins',
                    'timestamp': datetime.now().isoformat()
                })
            
            conn = get_db_connection()
            two_hours_ago = (datetime.now() - timedelta(hours=2)).isoformat()
            faults = conn.execute(
                'SELECT COUNT(*) FROM faults_history WHERE pole_id = ? AND timestamp > ?',
                (pole_id, two_hours_ago)
            ).fetchone()[0]
            conn.close()
            
            if faults >= 3:
                predictive_warnings.append({
                    'type': 'info',
                    'pole_id': pole_id,
                    'message': f'Pole {pole_id}: {faults} faults in 2hrs → Loose connection likely',
                    'timestamp': datetime.now().isoformat()
                })

def log_fault(pole_id, voltage, fault_type):
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO faults_history (pole_id, voltage, fault_type, timestamp) VALUES (?, ?, ?, ?)',
        (pole_id, voltage, fault_type, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

def update_energy_data():
    global energy_data
    total_power = sum(p['voltage'] for p in poles_data.values() if not p['fault'])
    current_kwh = (total_power / 1000) * (1 / 3600) 
    current_hour = datetime.now().hour
    energy_data['hourly_kwh'][current_hour] += current_kwh
    energy_data['daily_kwh'] = sum(energy_data['hourly_kwh'])

# Helper Functions for New Routes
def get_all_poles():
    poles_with_coords = []
    for pole in poles_data.values():
        pole_copy = dict(pole)
        pole_copy['coordinates'] = POLE_COORDINATES.get(pole['id'], [0, 0])
        pole_copy['public'] = True  # Defaulting all poles to public for now
        poles_with_coords.append(pole_copy)
    return poles_with_coords

def get_fault_predictions():
    return predictive_warnings

def get_system_stats():
    conn = get_db_connection()
    total_faults = conn.execute('SELECT COUNT(*) FROM faults_history').fetchone()[0]
    active_faults = conn.execute('SELECT COUNT(*) FROM faults_history WHERE resolved = 0').fetchone()[0]
    conn.close()
    
    return {
        'total_faults': total_faults,
        'active_faults': active_faults,
        'uptime_hours': 24, # Mock
        'daily_kwh': round(energy_data['daily_kwh'], 2)
    }

def get_nearby_poles():
    """Only show poles with faults or abnormal voltage to linemen"""
    all_poles = get_all_poles()
    return [p for p in all_poles if p['fault'] or p['voltage'] < 190 or p['voltage'] > 250]

# REST API Endpoints
@app.route('/')
def index():
    return jsonify({
        'status': 'online',
        'name': 'THE SHIELD - Phase 2 AC Fault Detection',
        'endpoints': [
            '/', '/api/poles', '/api/faults', '/api/relay/<id>', 
            '/api/config', '/api/energy', '/api/predictive',
            '/api/public/poles', '/api/admin/poles', '/api/ops/poles'
        ]
    })

# --- NEW ENHANCED ROUTES ---

@app.route('/api/public/poles')
def public_poles():
    """Citizens - No auth"""
    return jsonify([p for p in get_all_poles() if p.get('public', True)])

@app.route('/api/admin/poles') 
@jwt_required()
def admin_poles():
    """Full access - Dedicated Admin Dashboard"""
    return jsonify({
        'poles': get_all_poles(),
        'predictions': get_fault_predictions(),
        'system_stats': get_system_stats()
    })

@app.route('/api/ops/poles')
def ops_poles():
    """Lineman - Simple PIN auth"""
    pin = request.args.get('pin', '')
    if pin != '1234': return jsonify({'error': 'Invalid PIN'}), 401
    return jsonify(get_nearby_poles())

@app.route('/api/tenant-stats')
def tenant_stats():
    """Multi-tenant usage statistics (Mockup)"""
    return jsonify({
        'public': {
            'visits': 1247 + random.randint(-10, 50),
            'active_subscribers': 156
        },
        'ops': {
            'logged_in': 8,
            'resolved_today': 12
        }
    })

@app.route('/api/sim-mode', methods=['GET', 'POST'])
def sim_mode():
    global SIMULATION_MODE, poles_data
    if request.method == 'POST':
        data = request.get_json()
        new_mode = data.get('enabled', False)
        
        # Transition from SIM to LIVE: Reset data to wait for hardware
        if SIMULATION_MODE and not new_mode:
            print("🔄 Transitioning to LIVE mode: Resetting pole states")
            for pid in poles_data:
                poles_data[pid].update({
                    'voltage': 0.0,
                    'fault': False,
                    'status': 'WAITING FOR HARDWARE',
                    'timestamp': datetime.now().isoformat()
                })
        
        SIMULATION_MODE = new_mode
        print(f"🔄 Simulation Mode Toggled: {SIMULATION_MODE}")
        
        # Immediate sync
        socketio.emit('poles_update', {
            'poles': list(poles_data.values()),
            'timestamp': datetime.now().isoformat(),
            'hardware_connected': SERIAL_HUB_CONNECTED
        })
        
        return jsonify({'success': True, 'simulation_mode': SIMULATION_MODE})
    return jsonify({'enabled': SIMULATION_MODE})

@app.route('/api/simulate', methods=['POST'])
def simulate():
    """Web Simulation Controls"""
    if not SIMULATION_MODE:
        return jsonify({'error': 'Simulation mode is not enabled. Enable it first.'}), 400
        
    data = request.get_json()
    pole_id = data.get('pole_id', 1)
    scenario = data.get('scenario', 'normal') # low, high, fault, normal
    
    if pole_id not in poles_data:
        return jsonify({'error': 'Invalid pole ID'}), 400
        
    if scenario == 'low':
        poles_data[pole_id]['voltage'] = 185.0
        poles_data[pole_id]['fault'] = True
        log_fault(pole_id, 185.0, 'LOW_VOLTAGE_FAULT')
        send_fault_email(pole_id, 185.0, 'LOW_VOLTAGE_FAULT')
    elif scenario == 'high':
        poles_data[pole_id]['voltage'] = 255.0
        poles_data[pole_id]['fault'] = True
        log_fault(pole_id, 255.0, 'HIGH_VOLTAGE_FAULT')
        send_fault_email(pole_id, 255.0, 'HIGH_VOLTAGE_FAULT')
    elif scenario == 'fault':
        poles_data[pole_id]['voltage'] = 0.0
        poles_data[pole_id]['fault'] = True
        log_fault(pole_id, 0.0, 'Open Circuit')
        send_fault_email(pole_id, 0.0, 'Open Circuit')
    else: # normal
        poles_data[pole_id]['voltage'] = 220.0 + random.uniform(-5, 5)
        poles_data[pole_id]['fault'] = False
        
    poles_data[pole_id]['status'] = 'SIMULATED'
    poles_data[pole_id]['timestamp'] = datetime.now().isoformat()
    
    if scenario == 'fault':
        send_fault_email(pole_id, poles_data[pole_id]['voltage'], 'SIMULATED_FAULT')
    
    # Trigger socket update immediately
    socketio.emit('poles_update', {
        'poles': list(poles_data.values()),
        'timestamp': datetime.now().isoformat()
    })
        
    return jsonify({'success': True, 'new_state': poles_data[pole_id]})

# ---------------------------

@app.route('/api/poles', methods=['GET'])
def get_poles():
    poles_with_coords = []
    for pole in poles_data.values():
        pole_copy = dict(pole)
        pole_copy['coordinates'] = POLE_COORDINATES.get(pole['id'], [0, 0])
        poles_with_coords.append(pole_copy)
    
    return jsonify({
        'poles': poles_with_coords,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/faults', methods=['GET'])
def get_faults():
    conn = get_db_connection()
    faults = conn.execute(
        'SELECT * FROM faults_history ORDER BY timestamp DESC LIMIT 100'
    ).fetchall()
    conn.close()
    return jsonify({'faults': [dict(f) for f in faults]})

# --- VOLTAGE PATTERN ANALYSIS HELPERS ---

def get_voltage_history(pole_id, hours=6):
    conn = get_db_connection()
    cutoff = (datetime.now() - timedelta(hours=hours)).strftime('%Y-%m-%d %H:%M:%S')
    history = conn.execute(
        'SELECT voltage, timestamp FROM voltage_history WHERE pole_id = ? AND timestamp > ? ORDER BY timestamp ASC',
        (pole_id, cutoff)
    ).fetchall()
    conn.close()
    return [dict(h) for h in history]

def avg(data):
    return sum(data) / len(data) if data else 0

def std_dev(data):
    if not data: return 0
    mu = avg(data)
    return math.sqrt(sum((x - mu) ** 2 for x in data) / len(data))

def rapid_drop(history):
    if len(history) < 2: return False
    return (history[-2]['voltage'] - history[-1]['voltage']) > 30

def slow_drop(history, minutes=5):
    if len(history) < 2: return False
    # Check drop over the specified time window
    start_val = history[0]['voltage']
    end_val = history[-1]['voltage']
    return (start_val - end_val) > 10

def steady_high(history):
    if not history: return False
    voltages = [h['voltage'] for h in history]
    return avg(voltages) > 250

def predict_fault(pole_id):
    history_objs = get_voltage_history(pole_id, hours=6)
    if not history_objs: return "NORMAL"
    
    voltages = [h['voltage'] for h in history_objs]
    
    # Apply logic rules
    if avg(voltages) < 195: return "TRANSFORMER_FAIL"
    if std_dev(voltages) > 10: return "NEUTRAL_BROKEN"
    if rapid_drop(history_objs): return "SHORT_CIRCUIT"
    if slow_drop(history_objs, minutes=5): return "OVERLOAD"
    if steady_high(history_objs): return "OVER_VOLTAGE"
    
    return "NORMAL"

def log_voltage_reading(pole_id, voltage, status):
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO voltage_history (pole_id, voltage, status) VALUES (?, ?, ?)',
        (pole_id, voltage, status)
    )
    conn.commit()
    conn.close()

# ----------------------------------------

@app.route('/api/relay/<int:pole_id>', methods=['POST'])
def control_relay(pole_id):
    data = request.get_json()
    action = data.get('action', '').lower()
    
    if pole_id not in poles_data:
        return jsonify({'error': 'Invalid pole ID'}), 400
    
    if action == 'on':
        poles_data[pole_id]['relay'] = 'closed'
        poles_data[pole_id]['fault'] = False
    elif action == 'off':
        poles_data[pole_id]['relay'] = 'open'
    elif action == 'reset':
        poles_data[pole_id]['relay'] = 'closed'
        poles_data[pole_id]['fault'] = False
        conn = get_db_connection()
        conn.execute('UPDATE faults_history SET resolved = 1 WHERE pole_id = ? AND resolved = 0', (pole_id,))
        conn.commit()
        conn.close()
    
    # Sync all frontends
    socketio.emit('poles_update', {
        'poles': list(poles_data.values()),
        'timestamp': datetime.now().isoformat(),
        'hardware_connected': SERIAL_HUB_CONNECTED
    })
    
    return jsonify({
        'success': True,
        'pole_id': pole_id,
        'action': action,
        'new_state': poles_data[pole_id]
    })

@app.route('/api/config', methods=['GET', 'POST'])
def config():
    conn = get_db_connection()
    
    if request.method == 'GET':
        config = conn.execute('SELECT * FROM config WHERE id = 1').fetchone()
        conn.close()
        config_dict = dict(config) if config else {}
        try:
            config_dict['email_recipients'] = json.loads(config_dict.get('email_recipients', '[]'))
        except:
            config_dict['email_recipients'] = [config_dict.get('email_recipients', '')]
        return jsonify(config_dict)
    
    elif request.method == 'POST':
        data = request.get_json()
        recipients = json.dumps(data.get('email_recipients', []))
        telegram_chat_ids = json.dumps(data.get('telegram_chat_id', []))
        
        conn.execute(
            '''UPDATE config SET 
               email_recipients = ?, mobile = ?, serial_ports = ?, email_template = ?,
               telegram_token = ?, telegram_chat_id = ?, telegram_template = ?
               WHERE id = 1''',
            (recipients, data.get('mobile'), data.get('serial_ports'), data.get('email_template'),
             data.get('telegram_token'), telegram_chat_ids, data.get('telegram_template'))
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})

@app.route('/api/energy', methods=['GET'])
def get_energy():
    daily_cost = energy_data['daily_kwh'] * energy_data['cost_per_unit']
    return jsonify({
        'daily_kwh': round(energy_data['daily_kwh'], 2),
        'cost': round(daily_cost, 2),
        'cost_per_unit': energy_data['cost_per_unit'],
        'hourly_trend': [round(h, 3) for h in energy_data['hourly_kwh']],
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/predictive', methods=['GET'])
def get_predictive():
    return jsonify({'warnings': predictive_warnings})

@app.route('/api/chat', methods=['GET', 'POST'])
def chat():
    global chat_messages
    if request.method == 'POST':
        data = request.get_json()
        msg = {
            'sender': data.get('sender', 'Lineman'),
            'text': data.get('text', ''),
            'timestamp': datetime.now().strftime('%H:%M')
        }
        chat_messages.append(msg)
        if len(chat_messages) > 50: chat_messages.pop(0)
        # Broadcast via socket
        socketio.emit('new_chat', msg)
        return jsonify({'success': True})
    return jsonify(chat_messages)

@app.route('/api/reset-all', methods=['POST'])
def reset_all():
    global poles_data
    for pole_id in poles_data:
        poles_data[pole_id]['relay'] = 'closed'
        poles_data[pole_id]['fault'] = False
    send_to_lcd("ALL POLES RESET")
    return jsonify({'success': True, 'message': 'All poles reset'})

@app.route('/api/clear-faults', methods=['POST'])
def clear_faults():
    conn = get_db_connection()
    conn.execute('DELETE FROM faults_history')
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/export-csv', methods=['GET'])
def export_csv():
    conn = get_db_connection()
    faults = conn.execute('SELECT * FROM faults_history ORDER BY timestamp DESC').fetchall()
    conn.close()
    csv_content = "ID,Pole ID,Voltage,Fault Type,Timestamp,Resolved\n"
    for f in faults:
        csv_content += f"{f['id']},{f['pole_id']},{f['voltage']},{f['fault_type']},{f['timestamp']},{f['resolved']}\n"
    return csv_content, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=faults_history.csv'
    }

@app.route('/api/test-email', methods=['POST'])
def test_email():
    recipients = get_email_recipients()
    tg_config = get_telegram_config()
        
    try:
        # CONTEXT
        context = {
            'pole_id': 1, 'voltage': '0.0', 'fault_type': 'TEST_DIAGNOSTIC',
            'status': 'TEST_ALERT', 'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # PREPARE CONTENT
        email_template = get_email_template()
        tg_template = tg_config['template']
        
        email_body = email_template.format(**context)
        tg_message = tg_template.format(**context)
        subject = "TEST FAULT ALERT: System Verification"
        
        # SEND
        threading.Thread(target=process_email_sending_background, 
                         args=(recipients, subject, email_body, tg_config, tg_message, 0, True)).start()
        
        return jsonify({
            'success': True, 
            'message': f'Triggering alerts: {len(recipients)} emails + Telegram...'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# WebSocket events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected")
    emit('poles_update', {'poles': list(poles_data.values()), 'timestamp': datetime.now().isoformat()})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected")

@socketio.on('request_update')
def handle_request_update():
    emit('poles_update', {'poles': list(poles_data.values()), 'timestamp': datetime.now().isoformat()})

if __name__ == '__main__':
    print("=" * 60)
    print("⚡ THE SHIELD - Phase 2 AC Fault Detection System")
    print("=" * 60)
    print("\n📦 Initializing database...")
    init_db()
    print("✓ Database ready")
    print("\n🔌 Initializing serial connections...")
    init_serial()
    print("\n🚀 Starting background data thread (REAL MODE ONLY)...")
    serial_thread = threading.Thread(target=read_serial_data, daemon=True)
    serial_thread.start()
    print("\n" + "=" * 60)
    print("🌐 Server starting on http://0.0.0.0:5001")
    print("📡 WebSocket available at ws://localhost:5001")
    print("=" * 60 + "\n")
    socketio.run(app, host='0.0.0.0', port=5001, debug=False)
