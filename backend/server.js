const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const { generateChatResponse } = require('./chat_service');

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Function to start the ML Service
function startMLService() {
    console.log("Starting Python ML Service...");
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const mlServicePath = path.join(__dirname, 'ml_service.py');
    
    const mlProcess = spawn(pythonExecutable, [mlServicePath], {
        stdio: 'inherit'
    });

    mlProcess.on('error', (err) => {
        console.error('Failed to start ML Service:', err);
    });

    mlProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`ML Service exited with code ${code}. Restarting in 5s...`);
            setTimeout(startMLService, 5000);
        }
    });

    // Ensure the ML service is killed when the Node process exits
    process.on('SIGINT', () => {
        mlProcess.kill();
        process.exit();
    });
    process.on('SIGTERM', () => {
        mlProcess.kill();
        process.exit();
    });
}

// Firebase Initialization
let isMockMode = false;
try {
    // If we are in a local dev environment without a service account JSON, 
    // we should default to Mock Mode for the demonstration to avoid hangs.
    const fs = require('fs');
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://plantmonitoring-2fc3a-default-rtdb.firebaseio.com"
        });
        console.log("Firebase initialized with Service Account.");
    } else {
        console.warn("Service account file not found. Switching to MOCK MODE for demonstration.");
        isMockMode = true;
    }
} catch (error) {
    console.error("Firebase initialization failed:", error.message);
    isMockMode = true;
}

// JWT Middleware
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ error: "Invalid token." });
    }
};

const db = !isMockMode ? admin.database() : null;
const { getMergedSensorRowsForLocation } = require('./sensorFirebase');
const {
    buildAnomaliesApiResponse,
    buildStatisticalAnomalyAlerts,
} = require('./anomaly_service');

// --- AUTH ENDPOINTS ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { fullName, farmName, email, password } = req.body;
    if (!db) return res.status(503).json({ error: "Backend database not connected. Please check server logs." });

    try {
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
        if (snapshot.exists()) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserRef = usersRef.push();
        await newUserRef.set({
            fullName,
            farmName,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!db) return res.status(500).json({ error: "Database not connected" });

    try {
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

        if (!snapshot.exists()) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const userData = Object.values(snapshot.val())[0];
        const isMatch = await bcrypt.compare(password, userData.password);

        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign(
            { email: userData.email, fullName: userData.fullName },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                fullName: userData.fullName,
                farmName: userData.farmName,
                email: userData.email
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Dashboard Summary
app.get('/api/dashboard-summary/:location', async (req, res) => {
    const { location } = req.params;
    if (!db) return res.status(503).json({ error: "Database not connected" });

    try {
        const sensors = ['soil_moisture', 'temperature', 'humidity', 'light_lux'];
        const summary = {};

        const { rows: allData, source: dataSource, inferredDevice } = await getMergedSensorRowsForLocation(
            db,
            location,
            120
        );

        const latestAll = allData.length > 0 ? allData[allData.length - 1] : null;

        sensors.forEach((sType) => {
            const matches = allData.filter(
                (d) => d[sType] !== undefined && Number.isFinite(Number(d[sType]))
            );
            const latest = matches.length > 0 ? Number(matches[matches.length - 1][sType]) : null;
            const trend = matches.slice(-10).map((m) => Number(m[sType]));
            summary[sType] = { current: latest, trend };
        });

        let mlStatus = { status: "Analyzing", recommendation: "...", severity: "info" };
        let anomaly = { is_anomaly: false, anomaly_score: 0, cluster: null };
        if (latestAll && summary.soil_moisture.current !== null) {
            const payload = {
                moisture: Number(summary.soil_moisture.current),
                temperature: Number(summary.temperature.current ?? 25),
                humidity: Number(summary.humidity.current ?? 55),
                light_lux: Number(summary.light_lux.current ?? 20000),
            };
            try {
                const [clsRes, anoRes] = await Promise.all([
                    axios.post('http://localhost:5001/classify', payload, { timeout: 2000 }),
                    axios.post('http://localhost:5001/anomaly', payload, { timeout: 2000 }),
                ]);
                mlStatus = clsRes.data;
                anomaly = anoRes.data;
            } catch (e) {
                console.error("ML service call failed:", e.message);
                mlStatus = {
                    status: "Analysis Offline",
                    recommendation: "Please check ML service connectivity.",
                    severity: "warning",
                };
            }
        } else {
            mlStatus = {
                status: "No Data",
                recommendation:
                    "No Firebase rows matched this device id. If your ESP uses a different device_id, either align it with the dashboard or rely on any-device fallback (see inferredDevice).",
                severity: "warning",
            };
        }

        sensors.forEach((sType) => {
            summary[sType].status = summary[sType].current === null ? "No Data" : mlStatus.status;
        });

        res.json({
            location,
            sensors: summary,
            ml: mlStatus,
            anomaly,
            dataSource,
            inferredDevice,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- END AUTH ENDPOINTS ---

// Removed saveAlert function as we will use real-time alerts calculation

/**
 * Step 1: Pull Data from Firebase
 */
async function getSensorData(sensorType, location, durationHours = 24) {
    if (isMockMode || !db) {
        console.log(`Generating MOCK DATA for ${sensorType} at ${location}`);
        return generateMockData(sensorType, location);
    }
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Firebase request timed out")), 8000)
        );

        const mergedPromise = getMergedSensorRowsForLocation(db, location, 200);
        const { rows: merged } = await Promise.race([mergedPromise, timeoutPromise]);

        const startMs = Date.now() - durationHours * 60 * 60 * 1000;
        const data = [];
        for (const d of merged) {
            const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
            if (Number.isFinite(ts) && ts < startMs) continue;
            const v = d[sensorType];
            if (v === undefined || v === null) continue;
            const num = Number(v);
            if (!Number.isFinite(num)) continue;
            data.push({
                sensorType,
                location: d.device_id || location,
                value: num,
                timestamp: d.timestamp,
            });
        }

        if (data.length === 0) {
            console.warn(`No real data found for ${sensorType} at ${location} (merged cleaned_sensors + sensors).`);
            return [];
        }

        return data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
        console.error("Firebase error or timeout:", error.message);
        return [];
    }
}

/**
 * Helper: Generate Mock Data
 */
function generateMockData(sensorType, location) {
    const data = [];
    const now = Date.now();
    for (let i = 0; i < 24; i++) {
        data.push({
            sensorType,
            location,
            value: Math.floor(Math.random() * (70 - 30 + 1)) + 30,
            timestamp: new Date(now - (24 - i) * 60 * 60 * 1000).toISOString()
        });
    }
    return data;
}

/**
 * Step 2: Temporal Analysis - descriptive stats only.
 * Status / recommendation come from the ML classifier, not threshold rules.
 */
function temporalAnalysis(data) {
    if (!data || data.length === 0) {
        return { avg: 0, min: 0, max: 0, latest: 0, slope: 0 };
    }

    const values = data.map(d => d.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = values[values.length - 1];

    // Least-squares slope (per step) as a pure descriptive measure of trend.
    const n = values.length;
    const xs = values.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = avg;
    const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (values[i] - meanY), 0);
    const den = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
    const slope = den === 0 ? 0 : num / den;

    return {
        avg: Number(avg.toFixed(1)),
        min: Number(min.toFixed(1)),
        max: Number(max.toFixed(1)),
        latest: Number(latest.toFixed(1)),
        slope: Number(slope.toFixed(3))
    };
}

/**
 * Helper: Calculate Pearson Correlation
 */
function calculateCorrelation(xValues, yValues) {
    const n = Math.min(xValues.length, yValues.length);
    if (n === 0) return 0;

    const x = xValues.slice(0, n);
    const y = yValues.slice(0, n);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const sumX2 = x.reduce((acc, val) => acc + val * val, 0);
    const sumY2 = y.reduce((acc, val) => acc + val * val, 0);

    const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    if (denominator === 0) return 0;
    return ((n * sumXY) - (sumX * sumY)) / denominator;
}

/**
 * Step 3: API Endpoints
 */
app.get('/api/temporal/:sensorType/:location', async (req, res) => {
    const { sensorType, location } = req.params;
    const hours = parseInt(req.query.hours) || 24;
    try {
        const data = await getSensorData(sensorType, location, hours);
        const trend = temporalAnalysis(data);

        // Ask the ML classifier to describe the latest reading. For
        // soil_moisture we forward the value; for other sensors we still
        // pass it through so the model's recommendation is grounded.
        if (data.length > 0) {
            try {
                const pyRes = await axios.post('http://localhost:5001/classify', {
                    moisture: sensorType === 'soil_moisture' ? trend.latest : trend.latest
                }, { timeout: 2000 });
                trend.insight = `${pyRes.data.status}: ${pyRes.data.recommendation} (model confidence ${(pyRes.data.confidence * 100).toFixed(0)}%)`;
                trend.mlStatus = pyRes.data.status;
                trend.mlSeverity = pyRes.data.severity;
            } catch (e) {
                console.error("Temporal classify fail:", e.message);
            }
        }

        res.json({ trend, rawData: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        if (!db) return res.json([]);

        const location = String(req.query.location || 'ESP32_Plant_01').trim();
        const activeAlerts = [];

        const cleaningSnapshot = await db.ref('cleaning_alerts').limitToLast(10).once('value');
        const cleaningAlerts = cleaningSnapshot.val() ? Object.values(cleaningSnapshot.val()) : [];

        cleaningAlerts.forEach((alert) => {
            activeAlerts.push({
                ...alert,
                id: alert.id || Math.random().toString(36).substr(2, 9),
            });
        });

        const { rows: mergedRows } = await getMergedSensorRowsForLocation(db, location, 100);
        const latest = mergedRows.length > 0 ? mergedRows[mergedRows.length - 1] : null;
        const moistureNum = latest != null ? Number(latest.soil_moisture) : NaN;

        if (latest && Number.isFinite(moistureNum)) {
            const moisture = moistureNum;
            let smartStatus = "Analyzing...";
            let smartRecommend = "Processing...";
            let smartSeverity = "info";

            try {
                const pyRes = await axios.post('http://localhost:5001/classify', { moisture }, { timeout: 2000 });
                smartStatus = pyRes.data.status;
                smartRecommend = pyRes.data.recommendation;
                smartSeverity = pyRes.data.severity;
            } catch (pyErr) {
                console.error("Python classification failed:", pyErr.message);
                smartStatus = "Classification Unavailable";
                smartRecommend = "Service is temporarily offline.";
                smartSeverity = "warning";
            }

            activeAlerts.push({
                id: Math.random().toString(36).substr(2, 9),
                sensorId: 'Soil Moisture',
                value: moisture,
                unit: '%',
                location: latest.device_id || location,
                timestamp: latest.timestamp || new Date().toISOString(),
                type: smartStatus,
                message: smartRecommend,
                severity: smartSeverity,
            });
        } else if (mergedRows.length === 0) {
            activeAlerts.push({
                id: 'no-sensor-rows',
                type: 'Connectivity',
                severity: 'warning',
                message: `No Firebase readings for "${location}". Check /sensors or /cleaned_sensors and device_id.`,
                timestamp: new Date().toISOString(),
                sensorId: 'Data pipeline',
                location,
                value: '',
                unit: '',
            });
        }

        const { rows: statRows } = await getMergedSensorRowsForLocation(db, location, 200);
        const statAlerts = buildStatisticalAnomalyAlerts(statRows, location, 6);
        statAlerts.forEach((a) => activeAlerts.push(a));

        res.json(activeAlerts);
    } catch (error) {
        console.error("Error fetching alerts:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/correlation/:location', async (req, res) => {
    try {
        const location = req.params.location;
        if (!db) return res.json({ sunlightMoistureCorr: 0, tempMoistureCorr: 0 });

        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { rows: merged } = await getMergedSensorRowsForLocation(db, location, 200);

        const sunlight = [];
        const moisture = [];
        const temperature = [];

        merged.forEach((d) => {
            if (String(d.timestamp || '') < startTime) return;
            if (d.light_lux !== undefined && Number.isFinite(Number(d.light_lux))) sunlight.push(Number(d.light_lux));
            if (d.soil_moisture !== undefined && Number.isFinite(Number(d.soil_moisture))) moisture.push(Number(d.soil_moisture));
            if (d.temperature !== undefined && Number.isFinite(Number(d.temperature))) temperature.push(Number(d.temperature));
        });

        const minLength = Math.min(sunlight.length, moisture.length, temperature.length);
        if (minLength === 0) {
            return res.json({ sunlightMoistureCorr: 0, tempMoistureCorr: 0 });
        }

        const sunlightMoistureCorr = calculateCorrelation(sunlight.slice(0, minLength), moisture.slice(0, minLength));
        const tempMoistureCorr = calculateCorrelation(temperature.slice(0, minLength), moisture.slice(0, minLength));

        res.json({ sunlightMoistureCorr, tempMoistureCorr });
    } catch (error) {
        console.error("Error calculating correlation:", error);
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/ml/:location', async (req, res) => {
    try {
        const data = await getSensorData("soil_moisture", req.params.location);
        if (!data || data.length === 0) {
            return res.json({
                currentMoisture: 0,
                predictedMoisture: 0,
                soilStatus: "Unknown",
                recommendation: "No data"
            });
        }

        // Call the Python ML Service
        const pythonServiceUrl = 'http://localhost:5001/predict';
        const response = await axios.post(pythonServiceUrl, { data }, { timeout: 2000 });

        res.json(response.data);
    } catch (error) {
        console.error("Error communicating with ML service:", error.message);
        res.status(503).json({
            error: "Machine Learning service error",
            currentMoisture: 0,
            predictedMoisture: 0,
            soilStatus: "Service Offline",
            recommendation: "Automated analysis unavailable. Please ensure ML service is running."
        });
    }
});

/**
 * Statistical anomalies (rolling z-score + MAD) — chart-ready, separate from ML /api/anomaly.
 */
app.get('/api/anomalies/:location', async (req, res) => {
    try {
        const { location } = req.params;
        if (!db) {
            return res.status(503).json({
                error: 'Database not connected',
                summary: { totalReadings: 0, anomalyCount: 0, anomalyRate: 0, anomalyRatePercent: 0 },
            });
        }

        const limit = Math.min(500, Math.max(30, parseInt(req.query.limit, 10) || 200));
        const { rows } = await getMergedSensorRowsForLocation(db, location, limit);
        const payload = buildAnomaliesApiResponse(rows, location, req.query);
        res.json(payload);
    } catch (e) {
        console.error('/api/anomalies error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Anomaly detection for the latest multivariate reading at a location.
app.get('/api/anomaly/:location', async (req, res) => {
    try {
        const { location } = req.params;
        if (!db) return res.json({ is_anomaly: false, anomaly_score: 0, cluster: null });

        const { rows } = await getMergedSensorRowsForLocation(db, location, 120);
        const withSoil = rows.filter(
            (d) => d.soil_moisture !== undefined && Number.isFinite(Number(d.soil_moisture))
        );
        if (withSoil.length === 0) {
            return res.json({ is_anomaly: false, anomaly_score: 0, cluster: null });
        }
        const latest = withSoil[withSoil.length - 1];

        const pyRes = await axios.post('http://localhost:5001/anomaly', {
            moisture: Number(latest.soil_moisture ?? 0),
            temperature: Number(latest.temperature ?? 25),
            humidity: Number(latest.humidity ?? 55),
            light_lux: Number(latest.light_lux ?? 20000),
        }, { timeout: 2000 });
        res.json(pyRes.data);
    } catch (e) {
        console.error("Anomaly endpoint error:", e.message);
        res.status(503).json({ error: "Anomaly service unavailable" });
    }
});

// Model evaluation metrics (accuracy, precision/recall/F1, MAE/RMSE/R2,
// anomaly detection rate, silhouette score) proxied from the ML service.
app.get('/api/ml-metrics', async (_req, res) => {
    try {
        const pyRes = await axios.get('http://localhost:5001/metrics', { timeout: 2000 });
        res.json(pyRes.data);
    } catch (e) {
        console.error("Metrics endpoint error:", e.message);
        res.status(503).json({ error: "Metrics service unavailable" });
    }
});

app.post('/api/chat', authMiddleware, async (req, res) => {
    const { message, location, currentTab } = req.body;
    if (!db) return res.status(503).json({ error: "Database not connected" });

    try {
        const chatResponse = await generateChatResponse({
            db,
            location,
            message,
            currentTab: currentTab || 'dashboard'
        });

        res.json(chatResponse);
    } catch (error) {
        console.error("Chat API error:", error);
        res.status(500).json({ error: "Failed to process chat message" });
    }
});
// ----------------------------

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startMLService();
});
