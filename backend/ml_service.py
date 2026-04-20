from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np

app = Flask(__name__)
CORS(app)

def classify_soil(moisture):
    """
    State-of-the-art soil health classification.
    Returns: (status, severity, icon)
    """
    if moisture >= 70:
        return "Optimal Health", "info", "✅"
    if moisture >= 55:
        return "Healthy Growth", "moderate", "🌿"
    if moisture >= 40:
        return "Warning: Decreasing moisture", "warning", "⚠️"
    if moisture >= 25:
        return "Mild Water Stress", "critical", "📉"
    return "Critical: Extreme Dryness", "critical", "🚨"

def get_recommendation(status, moisture):
    """
    Provides specific actionable advice for the farmer.
    """
    if "Optimal" in status:
        return "Soil is perfectly hydrated. No intervention needed."
    if "Healthy" in status:
        return "Conditions are good. Monitor every 4 hours."
    if "Decreasing" in status:
        return "Soil is starting to dry. Consider scheduling irrigation for the next window."
    if "Mild Water Stress" in status:
        return "Plant is under stress. Immediate light irrigation recommended."
    return "URGENT ACTION: Start full irrigation cycle immediately to prevent crop loss!"

def predict_moisture(data):
    """
    Predict next moisture level based on linear trend of historical data.
    """
    if not data or len(data) < 2:
        return data[0]['value'] if data and len(data) > 0 else 0
    
    values = [d['value'] for d in data]
    first = values[0]
    last = values[-1]
    
    # Calculate simple drop rate per data point
    drop_rate = (first - last) / len(values)
    
    # Predict next 3 'steps' (hours equivalent in existing logic)
    predicted = last - (drop_rate * 3)
    return round(float(predicted), 1)

def irrigation_advice(predicted):
    """
    Provide farmer-friendly advice based on predicted moisture.
    """
    if predicted < 40:
        return "Start irrigation immediately"
    if predicted < 50:
        return "Irrigation recommended within 2 hours"
    return "No irrigation needed"

@app.route('/predict', methods=['POST'])
def predict():
    try:
        req_data = request.get_json() or {}
        sensor_data = req_data.get('data', [])
        
        if not sensor_data:
            return jsonify({
                "currentMoisture": 0,
                "predictedMoisture": 0,
                "soilStatus": "Unknown",
                "recommendation": "No data"
            })

        try:
            current = float(sensor_data[-1].get('value', 0))
        except (ValueError, TypeError):
            current = 0
        predicted = predict_moisture(sensor_data)
        status, severity, icon = classify_soil(current)
        advice = irrigation_advice(predicted)

        return jsonify({
            "currentMoisture": round(float(current), 1),
            "predictedMoisture": predicted,
            "soilStatus": status,
            "severity": severity,
            "icon": icon,
            "recommendation": advice
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/classify', methods=['POST'])
def classify():
    """
    Real-time classification for Smart Alerts.
    """
    try:
        req_data = request.get_json() or {}
        moisture_val = req_data.get('moisture')
        if moisture_val is None:
             moisture_val = 0
        moisture = float(moisture_val)
        
        status, severity, icon = classify_soil(moisture)
        recommendation = get_recommendation(status, moisture)

        return jsonify({
            "status": status,
            "severity": severity,
            "icon": icon,
            "recommendation": recommendation,
            "currentMoisture": moisture
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    # Running on 5001 to avoid conflict with Node.js on 5000
    app.run(port=5001, debug=True)
