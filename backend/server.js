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

        // Fetch last 100 recent readings globally from cleaned data
        const snapshot = await db.ref('cleaned_sensors')
            .limitToLast(100)
            .once('value');

        const allData = [];
        snapshot.forEach(snap => {
            const val = snap.val();
            if (val.device_id === location || !val.device_id) {
                allData.push(val);
            }
        });

        // Collect the latest reading per sensor type and its trend. Per-sensor
        // status comes from the ML classifier (not hard-coded thresholds) using
        // the most recent multivariate reading.
        const latestAll = allData.length > 0 ? allData[allData.length - 1] : null;

        sensors.forEach(sType => {
            const matches = allData.filter(d => d[sType] !== undefined);
            const latest = matches.length > 0 ? Number(matches[matches.length - 1][sType]) : null;
            const trend = matches.slice(-10).map(m => Number(m[sType]));
            summary[sType] = { current: latest, trend };
        });

        // Ask the ML service to classify the latest multivariate reading.
        let mlStatus = { status: "Analyzing", recommendation: "...", severity: "info" };
        let anomaly = { is_anomaly: false, anomaly_score: 0, cluster: null };
        if (latestAll && summary.soil_moisture.current !== null) {
            const payload = {
                moisture:    Number(summary.soil_moisture.current),
                temperature: Number(summary.temperature.current ?? 25),
                humidity:    Number(summary.humidity.current ?? 55),
                light_lux:   Number(summary.light_lux.current ?? 20000)
            };
            try {
                const [clsRes, anoRes] = await Promise.all([
                    axios.post('http://localhost:5001/classify', payload, { timeout: 2000 }),
                    axios.post('http://localhost:5001/anomaly',  payload, { timeout: 2000 })
                ]);
                mlStatus = clsRes.data;
                anomaly = anoRes.data;
            } catch (e) {
                console.error("ML service call failed:", e.message);
                mlStatus = { status: "Analysis Offline", recommendation: "Please check ML service connectivity.", severity: "warning" };
            }
        }

        // Attach the classifier's status to each sensor so the UI shows the
        // same model-derived verdict everywhere.
        sensors.forEach(sType => {
            summary[sType].status = summary[sType].current === null ? "No Data" : mlStatus.status;
        });

        res.json({
            location,
            sensors: summary,
            ml: mlStatus,
            anomaly,
            timestamp: new Date().toISOString()
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
        const ref = db.ref('cleaned_sensors');
        const startTime = new Date(Date.now() - durationHours * 60 * 60 * 1000).toISOString();

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Firebase request timed out")), 5000)
        );

        const snapshotPromise = ref.limitToLast(100).once('value');

        const snapshot = await Promise.race([snapshotPromise, timeoutPromise]);

        const data = [];
        snapshot.forEach(snap => {
            const d = snap.val();
            // Match against real property names. Lenient device_id check.
            if ((d.device_id === location || !d.device_id) && d[sensorType] !== undefined) {
                data.push({
                    sensorType: sensorType,
                    location: d.device_id || location,
                    value: Number(d[sensorType]),
                    timestamp: d.timestamp
                });
            }
        });

        if (data.length === 0) {
            console.warn(`No real data found for ${sensorType} at ${location}.`);
            return []; // No mock data
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
        // ... (Existing Alerts logic remains same, replacing outer scope up to listen)
        if (!db) return res.json([]);

        // Fetch standard sensor alerts (from latest cleaned data)
        const sensorSnapshot = await db.ref('cleaned_sensors').orderByChild('timestamp').limitToLast(1).once('value');
        const activeAlerts = [];

        // Fetch Data Cleaning Alerts
        const cleaningSnapshot = await db.ref('cleaning_alerts').limitToLast(10).once('value');
        const cleaningAlerts = cleaningSnapshot.val() ? Object.values(cleaningSnapshot.val()) : [];

        // Add cleaning alerts to the list
        cleaningAlerts.forEach(alert => {
            activeAlerts.push({
                ...alert,
                id: alert.id || Math.random().toString(36).substr(2, 9)
            });
        });

        for (const snap of Object.values(sensorSnapshot.val() || {})) {
            const d = snap;
            if (d.soil_moisture !== undefined && typeof d.soil_moisture === 'number') {
                const moisture = d.soil_moisture;

                let smartStatus = "Analyzing...";
                let smartRecommend = "Processing...";
                let smartSeverity = "info";

                try {
                    // Call Python ML service for Smart Classification
                    const pyRes = await axios.post('http://localhost:5001/classify', { moisture }, { timeout: 2000 });
                    smartStatus = pyRes.data.status;
                    smartRecommend = pyRes.data.recommendation;
                    smartSeverity = pyRes.data.severity;
                } catch (pyErr) {
                    console.error("Python classification failed:", pyErr.message);
                    // Do not crash the server on ML failure
                    smartStatus = "Classification Unavailable";
                    smartRecommend = "Service is temporarily offline.";
                    smartSeverity = "warning";
                }

                activeAlerts.push({
                    id: Math.random().toString(36).substr(2, 9),
                    sensorId: 'Soil Moisture',
                    value: moisture,
                    unit: '%',
                    location: d.device_id || 'Unknown Location',
                    timestamp: d.timestamp || new Date().toISOString(),
                    type: smartStatus,
                    message: smartRecommend,
                    severity: smartSeverity
                });
            }
        }

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

        const ref = db.ref('cleaned_sensors');
        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const snapshot = await ref.orderByChild('timestamp').startAt(startTime).once('value');

        const sunlight = [];
        const moisture = [];
        const temperature = [];

        snapshot.forEach(snap => {
            const d = snap.val();
            // Using correct fields based on real Firebase data. Lenient device_id.
            if (d.device_id === location || !d.device_id) {
                if (d.light_lux !== undefined) sunlight.push(Number(d.light_lux));
                if (d.soil_moisture !== undefined) moisture.push(Number(d.soil_moisture));
                if (d.temperature !== undefined) temperature.push(Number(d.temperature));
            }
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

// Anomaly detection for the latest multivariate reading at a location.
app.get('/api/anomaly/:location', async (req, res) => {
    try {
        const { location } = req.params;
        if (!db) return res.json({ is_anomaly: false, anomaly_score: 0, cluster: null });

        const snapshot = await db.ref('cleaned_sensors').limitToLast(50).once('value');
        let latest = null;
        snapshot.forEach(snap => {
            const d = snap.val();
            if ((d.device_id === location || !d.device_id) && d.soil_moisture !== undefined) {
                latest = d;
            }
        });
        if (!latest) return res.json({ is_anomaly: false, anomaly_score: 0, cluster: null });

        const pyRes = await axios.post('http://localhost:5001/anomaly', {
            moisture:    Number(latest.soil_moisture ?? 0),
            temperature: Number(latest.temperature  ?? 25),
            humidity:    Number(latest.humidity     ?? 55),
            light_lux:   Number(latest.light_lux    ?? 20000)
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
