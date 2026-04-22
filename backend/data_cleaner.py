import firebase_admin
from firebase_admin import credentials, db
import json
import os
import time
from datetime import datetime

# Initialize Firebase
# Using the same service account as server.js
service_account_path = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')

if os.path.exists(service_account_path):
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://plantmonitoring-2fc3a-default-rtdb.firebaseio.com'
    })
    print("Firebase initialized successfully.")
else:
    print(f"Error: Service account file not found at {service_account_path}")
    exit(1)

def clean_data(event):
    """
    Listener for new sensor data.
    """
    print(f"🔔 Event received: path={event.path}, type={type(event.data)}")
    if event.data is None:
        return

    # event.data could be a single record (if child_added) or a dict of records
    # But since we use listen on the ref, we need to handle the structure
    
    # If it's the initial load, it might be a dictionary of all records
    if isinstance(event.data, dict) and event.path == "/":
        print(f"📦 Processing initial batch of {len(event.data)} records...")
        for key, value in event.data.items():
            process_record(key, value)
    elif event.path == "/":
        pass
    else:
        record_id = event.path.strip('/')
        print(f"📥 Processing updated record: {record_id}")
        process_record(record_id, event.data)

def process_record(record_id, record):
    """
    Validates a sensor record and routes it to cleaned_sensors or cleaning_alerts.
    """
    if not isinstance(record, dict):
        print(f"⚠️ Record {record_id} is not a dict: {type(record)}")
        return

    # Check if we already processed this
    if db.reference(f'cleaned_sensors/{record_id}').get():
        return
    if db.reference(f'cleaning_alerts/{record_id}').get():
        return

    print(f"🔍 Validating record {record_id}...")

    fields_to_check = {
        'soil_moisture': 'Soil Moisture',
        'temperature': 'Temperature',
        'humidity': 'Humidity',
        'light_lux': 'Sunlight'
    }

    is_valid = True
    reasons = []

    # Map possible alternative names
    record['soil_moisture'] = record.get('soil_moisture', record.get('soil'))
    record['temperature'] = record.get('temperature', record.get('tem'))
    record['light_lux'] = record.get('light_lux', record.get('light'))

    for field, label in fields_to_check.items():
        val = record.get(field)
        
        # Check for null
        if val is None:
            is_valid = False
            reasons.append(f"{label} is missing (null)")
        else:
            try:
                numeric_val = float(val)
                # Check for negative
                if numeric_val < 0:
                    is_valid = False
                    reasons.append(f"{label} has negative value: {numeric_val}")
                
                # Optional: Check for unrealistic high values (e.g. moisture > 100)
                if field in ['soil_moisture', 'humidity'] and numeric_val > 100:
                    is_valid = False
                    reasons.append(f"{label} is out of range (>100%): {numeric_val}")
            except (ValueError, TypeError):
                is_valid = False
                reasons.append(f"{label} has non-numeric value: {val}")

    if is_valid:
        # Move to cleaned_sensors
        print(f"✅ Record {record_id} is VALID. Moving to cleaned_sensors.")
        db.reference(f'cleaned_sensors/{record_id}').set(record)
    else:
        # Move to cleaning_alerts
        alert_msg = " | ".join(reasons)
        print(f"❌ Record {record_id} is INVALID: {alert_msg}")
        
        alert_record = {
            'id': record_id,
            'original_record': record,
            'reasons': reasons,
            'message': f"Data Cleaning Alert: {alert_msg}",
            'timestamp': record.get('timestamp', datetime.now().isoformat()),
            'severity': 'critical',
            'type': 'Data Quality Alert',
            'sensorId': 'Multi-Sensor Pipeline',
            'location': record.get('device_id', 'Unknown Location'),
            'value': 'N/A'
        }
        db.reference(f'cleaning_alerts/{record_id}').set(alert_record)

if __name__ == "__main__":
    print(" Data Cleaning Pipeline started. Listening for changes in /sensors...")
    
    # Listen to the /sensors node
    sensors_ref = db.reference('sensors')
    
    # Note: firebase-admin's listen() runs in a background thread
    listener = sensors_ref.listen(clean_data)
    
    try:
        # Keep the main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping pipeline...")
        listener.close()
