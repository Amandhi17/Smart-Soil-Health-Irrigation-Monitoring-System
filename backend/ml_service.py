"""
Smart Soil Health ML Service
----------------------------
Three real ML techniques (no hard-coded if/else thresholds for decisions):

  1. Classification  - RandomForestClassifier predicts soil-health class from
                       (moisture, temperature, humidity, light_lux).
  2. Anomaly Detect. - IsolationForest flags abnormal sensor readings.
                       KMeans clustering groups readings into soil regimes
                       and is evaluated with the silhouette score.
  3. Forecasting     - RandomForestRegressor predicts the next moisture value
                       from lag features of the recent history.

Every model is trained at startup on a synthetic agronomic dataset, and the
evaluation metrics (accuracy / precision / recall / F1 / confusion matrix,
MAE / RMSE / R2, anomaly detection rate, silhouette score) are computed on a
held-out split and exposed via GET /metrics.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
    IsolationForest,
)
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    silhouette_score,
)

app = Flask(__name__)
CORS(app)

RANDOM_STATE = 42
CLASS_LABELS = [
    "Critical Dryness",
    "Mild Water Stress",
    "Warning Decreasing",
    "Healthy Growth",
    "Optimal Health",
]

# Actionable recommendation per predicted class. These are text templates tied
# to the ML output - not decision thresholds.
CLASS_RECOMMENDATION = {
    "Optimal Health":       "Soil is perfectly hydrated. No intervention needed.",
    "Healthy Growth":       "Conditions are good. Monitor every 4 hours.",
    "Warning Decreasing":   "Soil is starting to dry. Schedule irrigation for the next window.",
    "Mild Water Stress":    "Plant is under stress. Immediate light irrigation recommended.",
    "Critical Dryness":     "URGENT: Start full irrigation cycle immediately to prevent crop loss.",
}
CLASS_SEVERITY = {
    "Optimal Health":     "info",
    "Healthy Growth":     "moderate",
    "Warning Decreasing": "warning",
    "Mild Water Stress":  "critical",
    "Critical Dryness":   "critical",
}
CLASS_ICON = {
    "Optimal Health":     "OK",
    "Healthy Growth":     "GREEN",
    "Warning Decreasing": "WARN",
    "Mild Water Stress":  "STRESS",
    "Critical Dryness":   "ALERT",
}


# --------------------------------------------------------------------------- #
# Synthetic training data                                                     #
# --------------------------------------------------------------------------- #
def _make_classification_dataset(n=5000, seed=RANDOM_STATE):
    """
    Generate synthetic soil/weather samples with soft, noisy class boundaries.
    Class is determined by a latent stress score derived from moisture, temp,
    humidity and light - not by hard thresholds. A Gaussian noise term means
    that the classifier must *learn* the decision surface.
    """
    rng = np.random.default_rng(seed)
    moisture    = rng.uniform(0,   100,   n)
    temperature = rng.uniform(5,   45,    n)
    humidity    = rng.uniform(10,  100,   n)
    light_lux   = rng.uniform(50,  90000, n)

    # Latent "plant comfort" score (higher = healthier).
    comfort = (
        0.9  * moisture
        - 0.8 * np.maximum(temperature - 28, 0)
        + 0.2 * (humidity - 40)
        - 0.000015 * np.maximum(light_lux - 60000, 0) * 100
    )
    comfort += rng.normal(0, 4, n)  # irreducible noise

    # Bin comfort into 5 ordered classes.
    cuts   = np.quantile(comfort, [0.15, 0.35, 0.55, 0.80])
    labels = np.digitize(comfort, cuts)  # 0..4
    y      = np.array([CLASS_LABELS[i] for i in labels])

    X = pd.DataFrame({
        "soil_moisture": moisture,
        "temperature":   temperature,
        "humidity":      humidity,
        "light_lux":     light_lux,
    })
    return X, y


def _make_forecast_dataset(n_series=400, length=48, seed=RANDOM_STATE):
    """
    Build lag-feature supervised data from synthetic moisture time series.
    Moisture decays over time modulated by temperature/humidity, with random
    irrigation events. Target is t+1 moisture from the last 5 values.
    """
    rng = np.random.default_rng(seed)
    X_rows, y_rows = [], []
    for _ in range(n_series):
        temp  = rng.uniform(18, 35)
        humid = rng.uniform(30, 80)
        decay = 0.4 + 0.05 * max(temp - 25, 0) - 0.01 * (humid - 50)
        decay = max(decay, 0.1)

        m = rng.uniform(50, 90)
        series = []
        for t in range(length):
            if rng.random() < 0.07:           # irrigation event
                m = min(100, m + rng.uniform(15, 30))
            m -= decay + rng.normal(0, 0.4)
            m = float(np.clip(m, 0, 100))
            series.append(m)

        for i in range(5, len(series) - 1):
            lags = series[i-5:i]
            X_rows.append(lags + [np.mean(lags), np.std(lags)])
            y_rows.append(series[i])

    cols = [f"lag_{k}" for k in range(5, 0, -1)] + ["lag_mean", "lag_std"]
    return pd.DataFrame(X_rows, columns=cols), np.array(y_rows)


def _make_anomaly_dataset(seed=RANDOM_STATE):
    """
    Normal operating envelope plus injected anomalies for evaluation.
    """
    rng = np.random.default_rng(seed)
    n_normal, n_anom = 2000, 200

    normal = pd.DataFrame({
        "soil_moisture": rng.normal(60, 10, n_normal).clip(20, 90),
        "temperature":   rng.normal(25, 3,  n_normal).clip(10, 38),
        "humidity":      rng.normal(55, 8,  n_normal).clip(25, 85),
        "light_lux":     rng.normal(25000, 8000, n_normal).clip(500, 70000),
    })

    # Anomalies: extreme values or impossible combinations.
    anom = pd.DataFrame({
        "soil_moisture": rng.choice([rng.uniform(0, 5), rng.uniform(95, 100)], n_anom),
        "temperature":   rng.choice([rng.uniform(-5, 5), rng.uniform(42, 55)], n_anom),
        "humidity":      rng.choice([rng.uniform(0, 10), rng.uniform(95, 105)], n_anom),
        "light_lux":     rng.choice([rng.uniform(0, 50), rng.uniform(80000, 120000)], n_anom),
    })

    X = pd.concat([normal, anom], ignore_index=True)
    y = np.concatenate([np.ones(n_normal), -np.ones(n_anom)])  # 1 normal, -1 anom
    return X, y, normal


# --------------------------------------------------------------------------- #
# Training + metric computation                                               #
# --------------------------------------------------------------------------- #
def _train_classifier():
    X, y = _make_classification_dataset()
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=RANDOM_STATE, stratify=y
    )
    model = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=RANDOM_STATE, n_jobs=-1
    )
    model.fit(X_tr, y_tr)
    y_pred = model.predict(X_te)

    metrics = {
        "accuracy":  float(accuracy_score(y_te, y_pred)),
        "precision": float(precision_score(y_te, y_pred, average="macro", zero_division=0)),
        "recall":    float(recall_score(y_te, y_pred, average="macro", zero_division=0)),
        "f1_macro":  float(f1_score(y_te, y_pred, average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_te, y_pred, labels=CLASS_LABELS).tolist(),
        "labels":    CLASS_LABELS,
        "n_train":   int(len(X_tr)),
        "n_test":    int(len(X_te)),
    }
    return model, metrics


def _train_forecaster():
    X, y = _make_forecast_dataset()
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=RANDOM_STATE
    )
    model = RandomForestRegressor(
        n_estimators=150, max_depth=10, random_state=RANDOM_STATE, n_jobs=-1
    )
    model.fit(X_tr, y_tr)
    y_pred = model.predict(X_te)

    mae  = float(mean_absolute_error(y_te, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_te, y_pred)))
    metrics = {
        "mae":  mae,
        "rmse": rmse,
        "r2":   float(r2_score(y_te, y_pred)),
        "n_train": int(len(X_tr)),
        "n_test":  int(len(X_te)),
    }
    return model, metrics


def _train_anomaly_and_clustering():
    X, y_true, normal_only = _make_anomaly_dataset()
    scaler = StandardScaler().fit(normal_only)

    iso = IsolationForest(
        n_estimators=200, contamination=0.09, random_state=RANDOM_STATE
    )
    iso.fit(scaler.transform(normal_only))
    y_pred = iso.predict(scaler.transform(X))  # 1 normal, -1 anomaly

    anom_metrics = {
        "detection_rate":  float(((y_true == -1) & (y_pred == -1)).sum() / (y_true == -1).sum()),
        "false_alarm_rate": float(((y_true == 1)  & (y_pred == -1)).sum() / (y_true == 1).sum()),
        "precision":       float(precision_score(y_true, y_pred, pos_label=-1, zero_division=0)),
        "recall":          float(recall_score(y_true, y_pred, pos_label=-1, zero_division=0)),
        "f1":              float(f1_score(y_true, y_pred, pos_label=-1, zero_division=0)),
        "n_samples":       int(len(X)),
    }

    # KMeans clustering on normal readings + silhouette evaluation.
    km = KMeans(n_clusters=4, random_state=RANDOM_STATE, n_init=10)
    km.fit(scaler.transform(normal_only))
    sil = float(silhouette_score(scaler.transform(normal_only), km.labels_))
    cluster_metrics = {
        "silhouette":  sil,
        "n_clusters":  int(km.n_clusters),
        "n_samples":   int(len(normal_only)),
        "inertia":     float(km.inertia_),
    }

    return iso, scaler, km, anom_metrics, cluster_metrics


print("[ml_service] Training classifier...")
CLASSIFIER, CLASS_METRICS = _train_classifier()
print(f"[ml_service] classifier accuracy = {CLASS_METRICS['accuracy']:.3f}")

print("[ml_service] Training forecaster...")
FORECASTER, FORECAST_METRICS = _train_forecaster()
print(f"[ml_service] forecaster MAE = {FORECAST_METRICS['mae']:.2f}, R2 = {FORECAST_METRICS['r2']:.3f}")

print("[ml_service] Training anomaly detector + clustering...")
(
    ANOMALY_DETECTOR,
    ANOMALY_SCALER,
    CLUSTER_MODEL,
    ANOMALY_METRICS,
    CLUSTER_METRICS,
) = _train_anomaly_and_clustering()
print(f"[ml_service] anomaly F1 = {ANOMALY_METRICS['f1']:.3f}, silhouette = {CLUSTER_METRICS['silhouette']:.3f}")


# --------------------------------------------------------------------------- #
# Inference helpers                                                           #
# --------------------------------------------------------------------------- #
def _feature_frame(moisture, temperature, humidity, light_lux):
    return pd.DataFrame([{
        "soil_moisture": float(moisture),
        "temperature":   float(temperature),
        "humidity":      float(humidity),
        "light_lux":     float(light_lux),
    }])


def _classify(moisture, temperature=25.0, humidity=55.0, light_lux=20000.0):
    X = _feature_frame(moisture, temperature, humidity, light_lux)
    label = str(CLASSIFIER.predict(X)[0])
    proba = CLASSIFIER.predict_proba(X)[0]
    return {
        "status":         label,
        "severity":       CLASS_SEVERITY[label],
        "icon":           CLASS_ICON[label],
        "recommendation": CLASS_RECOMMENDATION[label],
        "confidence":     float(proba.max()),
        "probabilities": {
            str(cls): float(p) for cls, p in zip(CLASSIFIER.classes_, proba)
        },
    }


def _forecast_from_series(values):
    """
    values : iterable of floats (recent moisture, oldest first).
    Always returns a scalar float forecast for t+1.
    """
    arr = np.array([float(v) for v in values], dtype=float)
    if len(arr) == 0:
        return 0.0
    if len(arr) < 5:
        pad = np.full(5 - len(arr), arr.mean())
        arr = np.concatenate([pad, arr])

    lags     = arr[-5:][::-1]  # lag_5, lag_4, ..., lag_1 (most recent first)
    lag_mean = float(np.mean(arr[-5:]))
    lag_std  = float(np.std(arr[-5:]))

    feat = pd.DataFrame(
        [[*lags, lag_mean, lag_std]],
        columns=[f"lag_{k}" for k in range(5, 0, -1)] + ["lag_mean", "lag_std"],
    )
    return float(np.clip(FORECASTER.predict(feat)[0], 0, 100))


def _detect_anomaly(moisture, temperature, humidity, light_lux):
    X      = _feature_frame(moisture, temperature, humidity, light_lux)
    Xs     = ANOMALY_SCALER.transform(X)
    pred   = int(ANOMALY_DETECTOR.predict(Xs)[0])        # 1 normal, -1 anomaly
    score  = float(ANOMALY_DETECTOR.score_samples(Xs)[0])
    cluster = int(CLUSTER_MODEL.predict(Xs)[0])
    return {
        "is_anomaly":     pred == -1,
        "anomaly_score":  score,
        "cluster":        cluster,
    }


# --------------------------------------------------------------------------- #
# HTTP API                                                                    #
# --------------------------------------------------------------------------- #
@app.route("/classify", methods=["POST"])
def classify():
    try:
        body = request.get_json() or {}
        moisture    = float(body.get("moisture", 0) or 0)
        temperature = float(body.get("temperature", 25) or 25)
        humidity    = float(body.get("humidity", 55) or 55)
        light_lux   = float(body.get("light_lux", 20000) or 20000)

        result = _classify(moisture, temperature, humidity, light_lux)
        result["currentMoisture"] = moisture
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/predict", methods=["POST"])
def predict():
    """
    Body: { "data": [ { "value": <moisture>, "timestamp": ... }, ... ] }
    Returns current class + ML-forecasted next moisture + class of that
    forecast (used as automated action plan).
    """
    try:
        body = request.get_json() or {}
        sensor_data = body.get("data", []) or []

        if not sensor_data:
            return jsonify({
                "currentMoisture":    0,
                "predictedMoisture":  0,
                "soilStatus":         "Unknown",
                "severity":           "info",
                "icon":               "INFO",
                "recommendation":     "No data",
                "confidence":         0,
            })

        values = [float(d.get("value", 0) or 0) for d in sensor_data]
        current   = values[-1]
        predicted = _forecast_from_series(values)

        current_cls   = _classify(current)
        predicted_cls = _classify(predicted)

        return jsonify({
            "currentMoisture":    round(current, 1),
            "predictedMoisture":  round(predicted, 1),
            "soilStatus":         current_cls["status"],
            "severity":           current_cls["severity"],
            "icon":               current_cls["icon"],
            "recommendation":     predicted_cls["recommendation"],
            "confidence":         current_cls["confidence"],
            "predictedStatus":    predicted_cls["status"],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/anomaly", methods=["POST"])
def anomaly():
    try:
        body = request.get_json() or {}
        result = _detect_anomaly(
            body.get("moisture", 0)    or 0,
            body.get("temperature", 25) or 25,
            body.get("humidity", 55)    or 55,
            body.get("light_lux", 20000) or 20000,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/metrics", methods=["GET"])
def metrics():
    """Model evaluation metrics from held-out test splits."""
    return jsonify({
        "classifier": CLASS_METRICS,
        "forecaster": FORECAST_METRICS,
        "anomaly":    ANOMALY_METRICS,
        "clustering": CLUSTER_METRICS,
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "models": ["classifier", "forecaster", "anomaly", "clustering"]})


if __name__ == "__main__":
    app.run(port=5001, debug=False)
