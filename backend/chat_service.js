const axios = require('axios');
const { getMergedSensorRowsForLocation } = require('./sensorFirebase');
const { buildAnomalyChatSummary } = require('./anomaly_service');

const SENSOR_LABELS = {
    soil_moisture: 'Soil Moisture',
    temperature: 'Temperature',
    humidity: 'Humidity',
    light_lux: 'Light Intensity'
};

const TAB_GUIDE = {
    dashboard: 'Dashboard: live sensor cards and the main trend chart.',
    temporal: 'Analysis: historical trends, averages, min/max values, and recent movement.',
    ml: 'Predictions: AI-based moisture forecast and irrigation recommendation.',
    correlation: 'Insights: relationships between sunlight, temperature, humidity, and moisture.',
    anomaly: 'Anomaly: multivariate outlier detection vs your recent baseline.',
    anomalies: 'Anomalies: statistical outlier view (rolling z-score + MAD) with charts.',
    alerts: 'Alerts: anomalies, cleaning issues, and warning conditions.'
};

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatValue(value, digits = 1) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function calculateCorrelation(xValues, yValues) {
    const n = Math.min(xValues.length, yValues.length);
    if (n < 2) return 0;

    const x = xValues.slice(0, n);
    const y = yValues.slice(0, n);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const sumX2 = x.reduce((acc, val) => acc + (val * val), 0);
    const sumY2 = y.reduce((acc, val) => acc + (val * val), 0);

    const denominator = Math.sqrt((n * sumX2 - (sumX ** 2)) * (n * sumY2 - (sumY ** 2)));
    if (!denominator) return 0;

    return ((n * sumXY) - (sumX * sumY)) / denominator;
}

function getSeries(records, key) {
    return records
        .map((record) => toNumber(record[key], Number.NaN))
        .filter((value) => Number.isFinite(value));
}

function summarizeSensor(records, key) {
    const values = getSeries(records, key);
    if (!values.length) {
        return {
            label: SENSOR_LABELS[key] || key,
            current: null,
            avg: null,
            min: null,
            max: null,
            delta: null,
            direction: 'unknown'
        };
    }

    const current = values[values.length - 1];
    const first = values[0];
    const delta = current - first;
    let direction = 'stable';
    if (delta > 2) direction = 'increasing';
    if (delta < -2) direction = 'decreasing';

    return {
        label: SENSOR_LABELS[key] || key,
        current: formatValue(current),
        avg: formatValue(average(values)),
        min: formatValue(Math.min(...values)),
        max: formatValue(Math.max(...values)),
        delta: formatValue(delta),
        direction
    };
}

function describeCorrelation(value, positiveSubject, negativeSubject) {
    const abs = Math.abs(value);
    const strength = abs >= 0.7 ? 'strong' : abs >= 0.4 ? 'moderate' : abs >= 0.2 ? 'weak' : 'very weak';
    const direction = value >= 0 ? 'positive' : 'negative';
    const effect = value >= 0 ? positiveSubject : negativeSubject;
    return `${strength} ${direction} relationship (${formatValue(value, 2)}). ${effect}`;
}

function getDashboardGuideMessage(currentTab, requestedTab) {
    const target = requestedTab || currentTab || 'dashboard';
    const guide = TAB_GUIDE[target] || TAB_GUIDE.dashboard;
    return `You are currently in **${target}**. ${guide}`;
}

async function fetchRecentRecords(db, location, limit = 200) {
    const { rows } = await getMergedSensorRowsForLocation(db, location, limit);
    return rows;
}

async function fetchRecentAlerts(db) {
    const snapshot = await db.ref('cleaning_alerts').limitToLast(5).once('value');
    return snapshot.val() ? Object.values(snapshot.val()) : [];
}

async function fetchPrediction(records) {
    const soilSeries = records
        .filter((record) => record.soil_moisture !== undefined)
        .map((record) => ({ value: toNumber(record.soil_moisture) }));

    if (!soilSeries.length) {
        return {
            currentMoisture: 0,
            predictedMoisture: 0,
            soilStatus: 'Unknown',
            recommendation: 'No prediction data available.'
        };
    }

    try {
        const response = await axios.post('http://localhost:5001/predict', { data: soilSeries }, { timeout: 2500 });
        return response.data;
    } catch (error) {
        return {
            currentMoisture: formatValue(toNumber(soilSeries[soilSeries.length - 1]?.value)),
            predictedMoisture: formatValue(toNumber(soilSeries[soilSeries.length - 1]?.value)),
            soilStatus: 'Prediction Offline',
            recommendation: 'Prediction service is currently unavailable.'
        };
    }
}

async function buildChatContext(db, location, currentTab) {
    const records = await fetchRecentRecords(db, location);
    const alerts = await fetchRecentAlerts(db);
    const prediction = await fetchPrediction(records);

    const soil = summarizeSensor(records, 'soil_moisture');
    const temperature = summarizeSensor(records, 'temperature');
    const humidity = summarizeSensor(records, 'humidity');
    const light = summarizeSensor(records, 'light_lux');

    const lightSeries = getSeries(records, 'light_lux');
    const soilSeries = getSeries(records, 'soil_moisture');
    const tempSeries = getSeries(records, 'temperature');
    const humiditySeries = getSeries(records, 'humidity');

    const correlations = {
        sunlightVsMoisture: formatValue(calculateCorrelation(lightSeries, soilSeries), 2),
        temperatureVsMoisture: formatValue(calculateCorrelation(tempSeries, soilSeries), 2),
        temperatureVsHumidity: formatValue(calculateCorrelation(tempSeries, humiditySeries), 2)
    };

    const influenceCandidates = [
        { factor: 'Sunlight', metric: Math.abs(correlations.sunlightVsMoisture), value: correlations.sunlightVsMoisture },
        { factor: 'Temperature', metric: Math.abs(correlations.temperatureVsMoisture), value: correlations.temperatureVsMoisture }
    ].sort((a, b) => b.metric - a.metric);

    const statisticalAnomalies = buildAnomalyChatSummary(records);

    return {
        location,
        currentTab,
        recordCount: records.length,
        latestTimestamp: records.length ? records[records.length - 1].timestamp : null,
        sensors: { soil, temperature, humidity, light },
        correlations,
        strongestMoistureDriver: influenceCandidates[0],
        prediction,
        statisticalAnomalies,
        alerts: alerts.map((alert) => ({
            type: alert.type || 'Alert',
            message: alert.message || 'Alert detected.',
            timestamp: alert.timestamp || null
        })),
        dashboardGuide: TAB_GUIDE,
        currentTabGuide: getDashboardGuideMessage(currentTab)
    };
}

function getIntent(message) {
    const msg = message.toLowerCase();

    if (
        /\b(anomalies|anomaly detection|statistical outlier|statistical anomaly)\b/i.test(msg) ||
        /\b(outliers?|unusual pattern)\b/i.test(msg) ||
        /\bunusual (but valid|reading)/i.test(msg) ||
        /\bwhy (was|is) this (reading )?flagged/i.test(msg) ||
        /\bwhy .*\b(flagged|outlier|anomal)/i.test(msg) ||
        /\b(reason|explain) .*\b(flagged|outlier|anomal)/i.test(msg) ||
        /\b(z-score|rolling mad|\bmad\b)\b/i.test(msg) ||
        /\bany anomalies?\b/i.test(msg) ||
        /show (me )?(the )?(recent )?(outliers?|anomalies?)/i.test(msg)
    ) {
        return 'statAnomaly';
    }
    if (/where|navigate|open|find|which tab|dashboard|show me/i.test(msg)) return 'guide';
    if (/alert|issue|problem|wrong|abnormal/i.test(msg)) return 'alerts';
    if (/influence|factor|affect|relationship|correlation|compare|comparison/i.test(msg)) return 'correlation';
    if (/\bwhy\b.*\b(moisture|humidity|temperature|light|sun|dry|wet|influence|factor|correlate)/i.test(msg)) {
        return 'correlation';
    }
    if (/should i|recommend|advice|decision|irrigate|pump|action|do now/i.test(msg)) return 'decision';
    if (/trend|history|change|past|over time|pattern/i.test(msg)) return 'trend';
    if (/current|now|latest|status|reading|today/i.test(msg)) return 'status';

    return 'general';
}

function buildFallbackResponse(message, context) {
    const intent = getIntent(message);
    const { soil, temperature, humidity, light } = context.sensors;
    const activeAlerts = context.alerts;
    const strongest = context.strongestMoistureDriver;

    if (context.recordCount === 0) {
        return {
            reply: 'I could not find recent sensor data for this device yet. Please check whether Firebase is receiving cleaned sensor readings, then refresh the dashboard.',
            suggestedTab: 'dashboard',
            followUps: [
                'Where can I see live readings?',
                'Why is there no data?',
                'Show me the alerts tab'
            ]
        };
    }

    if (intent === 'status') {
        const fmt = (v, suffix) => (v == null || Number.isNaN(Number(v)) ? '—' : `${v}${suffix}`);
        return {
            reply: `Current farm status for **${context.location}**: Soil moisture **${fmt(soil.current, '%')}**, temperature **${fmt(temperature.current, '°C')}**, humidity **${fmt(humidity.current, '%')}**, light **${fmt(light.current, ' lux')}**. Latest timestamp: **${context.latestTimestamp || '—'}**.`,
            suggestedTab: 'dashboard',
            followUps: [
                'Explain the moisture trend',
                'Are there any anomalies?',
                'Should I irrigate now?'
            ]
        };
    }

    if (intent === 'statAnomaly') {
        const s = context.statisticalAnomalies;
        const counts = s.perSensorAnomalyCounts || {};
        const parts = Object.entries(counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${SENSOR_LABELS[k] || k}: ${n}`)
            .join(', ');
        if (!s.totalReadings) {
            return {
                reply: 'There is not enough history in Firebase yet to run rolling z-score / MAD outlier detection.',
                suggestedTab: 'anomalies',
                followUps: ['Show current status', 'Open the Anomalies tab', 'Explain the trend']
            };
        }
        const asksLatestWhy =
            /\bwhy (was|is|did)\b/i.test(message) ||
            /\bwhy .*\b(flagged|outlier|anomal)/i.test(message) ||
            (/\bexplain\b/i.test(message) &&
                /\b(this (reading)?|latest|last (point|reading)|that point|flagged)\b/i.test(message));

        if (asksLatestWhy && s.totalReadings) {
            return {
                reply: s.latestIsAnomaly
                    ? `The latest reading was flagged because: **${s.latestReason}** (severity score **${s.latestScore ?? '—'}**). This compares the value to your **recent** history (rolling mean/std and robust median/MAD)—not to fixed min/max validation.`
                    : `The latest reading is **not** flagged as a statistical outlier. ${s.latestReason || 'It lies within the rolling envelope vs prior points.'}`,
                suggestedTab: 'anomalies',
                followUps: ['Are there any anomalies?', 'Open Alerts', 'What is the current status?']
            };
        }
        if (s.anomalyCount === 0) {
            return {
                reply: `Statistical check (rolling window vs recent mean & robust median): **no outliers** in the loaded series for **${context.location}** (${s.totalReadings} points). Latest point is **${s.latestIsAnomaly ? 'flagged' : 'normal'}**.`,
                suggestedTab: 'anomalies',
                followUps: ['What is the current status?', 'Why was this reading flagged?', 'Open Alerts']
            };
        }
        return {
            reply: `**${s.anomalyCount}** statistical outlier rows detected (${s.anomalyRatePercent}% of ${s.totalReadings} readings). Per-sensor contributions: ${parts || 'see Anomalies tab'}. Latest row: **${s.latestIsAnomaly ? 'flagged' : 'not flagged'}**${s.latestIsAnomaly ? ` — ${s.latestReason}` : ''}. Open **Anomalies** for the chart and full reasons.`,
            suggestedTab: 'anomalies',
            followUps: ['Why was this reading flagged?', 'Open Alerts', 'Explain the moisture trend']
        };
    }

    if (intent === 'trend') {
        const soilDirectionText = soil.direction === 'decreasing'
            ? `falling by about ${Math.abs(soil.delta)} points across the recent window`
            : soil.direction === 'increasing'
                ? `rising by about ${Math.abs(soil.delta)} points across the recent window`
                : 'remaining relatively stable';

        return {
            reply: `Trend summary: soil moisture is **${soilDirectionText}**, with an average of **${soil.avg}%** and a recent value of **${soil.current}%**. Temperature averaged **${temperature.avg}°C** and humidity averaged **${humidity.avg}%**. Open the **Analysis** tab to inspect the detailed historical chart.`,
            suggestedTab: 'temporal',
            followUps: [
                'Compare temperature and humidity',
                'What anomaly do you see?',
                'What caused the moisture change?'
            ]
        };
    }

    if (intent === 'alerts') {
        if (!activeAlerts.length) {
            return {
                reply: `I do not see recent cleaning or anomaly alerts. Based on the latest readings, the system looks stable, but you can still open the **Alerts** tab for continuous monitoring.`,
                suggestedTab: 'alerts',
                followUps: [
                    'Show me current status',
                    'Should I irrigate now?',
                    'Explain the trend'
                ]
            };
        }

        const alertLines = activeAlerts
            .slice(-3)
            .map((alert) => `• **${alert.type}**: ${alert.message}`)
            .join('\n');

        return {
            reply: `I found **${activeAlerts.length}** recent alert signals. The latest issues are:\n${alertLines}\nFor the full anomaly history and warning view, open the **Alerts** tab.`,
            suggestedTab: 'alerts',
            followUps: [
                'Why did this happen?',
                'How does it affect moisture?',
                'What action do you recommend?'
            ]
        };
    }

    if (intent === 'correlation') {
        const explanation = describeCorrelation(
            strongest.value,
            `${strongest.factor} tends to rise together with moisture changes in the same direction.`,
            `${strongest.factor} is associated with moisture moving in the opposite direction.`
        );

        return {
            reply: `The factor influencing soil moisture the most right now appears to be **${strongest.factor}**. Its correlation with moisture is **${strongest.value}**, which indicates a ${explanation} Also, temperature vs humidity is **${context.correlations.temperatureVsHumidity}**. Open **Insights** to see the comparison cards and explanation panel.`,
            suggestedTab: 'correlation',
            followUps: [
                'Compare all factors',
                'Explain this in simple words',
                'Should I irrigate based on this?'
            ]
        };
    }

    if (intent === 'decision') {
        return {
            reply: `Decision support summary: the current moisture is **${context.prediction.currentMoisture}%** and the predicted next value is **${context.prediction.predictedMoisture}%**. The AI recommendation is: **${context.prediction.recommendation}**. This recommendation is based on recent moisture movement, not just one single reading.`,
            suggestedTab: 'ml',
            followUps: [
                'Why did the model recommend that?',
                'Show me the prediction panel',
                'Explain the moisture trend'
            ]
        };
    }

    if (intent === 'guide') {
        let suggestedTab = 'dashboard';
        const lower = message.toLowerCase();
        if (lower.includes('prediction') || lower.includes('recommend')) suggestedTab = 'ml';
        if (lower.includes('alert')) suggestedTab = 'alerts';
        if (lower.includes('anomalies') || lower.includes('outlier')) suggestedTab = 'anomalies';
        if (lower.includes('trend') || lower.includes('history') || lower.includes('analysis')) suggestedTab = 'temporal';
        if (lower.includes('insight') || lower.includes('correlation') || lower.includes('factor')) suggestedTab = 'correlation';

        return {
            reply: `${getDashboardGuideMessage(context.currentTab, suggestedTab)} You can ask me to explain the chart, compare variables, or suggest the best next action based on the current visuals.`,
            suggestedTab,
            followUps: [
                'Show me live readings',
                'Open the prediction view',
                'Which factor influences moisture most?'
            ]
        };
    }

    const soilLine =
        soil.current == null || Number.isNaN(Number(soil.current))
            ? 'Soil moisture data is not available in the loaded window.'
            : `Soil moisture is **${soil.current}%**`;
    return {
        reply: `I can help with your dataset, dashboard navigation, trends, correlations, and irrigation timing. ${soilLine}. Prediction note: **${context.prediction.recommendation}**.`,
        suggestedTab: 'dashboard',
        followUps: [
            'What is the current status?',
            'Explain the trend',
            'What factor influences moisture most?'
        ]
    };
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch (nestedError) {
            return null;
        }
    }
}

function normalizeLLMResult(parsed) {
    if (!parsed || !parsed.reply) return null;

    return {
        reply: parsed.reply,
        suggestedTab: TAB_GUIDE[parsed.suggestedTab] ? parsed.suggestedTab : 'dashboard',
        followUps: Array.isArray(parsed.followUps) && parsed.followUps.length
            ? parsed.followUps.slice(0, 3)
            : ['Show current status', 'Explain the trend']
    };
}

function buildSystemPrompt() {
    return [
        'You are AgriSmart Assistant for an IoT smart agriculture dashboard.',
        'Use ONLY the provided dashboard context.',
        'Your job is to answer natural language questions about the dataset, guide users around the dashboard, explain trends/comparisons/anomalies, and support decision-making.',
        'Always mention concrete numbers from the context when possible.',
        'Keep the answer concise, clear, and practical for a student demo project.',
        'Return valid JSON with keys: reply, suggestedTab, followUps.',
        'suggestedTab must be one of: dashboard, temporal, ml, correlation, anomaly, anomalies, alerts.',
        'followUps must be an array of 2 or 3 short suggestions.'
    ].join(' ');
}

function buildUserPrompt(message, context) {
    return JSON.stringify({
        user_question: message,
        dashboard_context: context
    });
}

function buildGeminiSchema() {
    return {
        type: 'object',
        properties: {
            reply: {
                type: 'string',
                description: 'Main assistant answer for the dashboard user. Use short markdown where helpful.'
            },
            suggestedTab: {
                type: 'string',
                enum: ['dashboard', 'temporal', 'ml', 'correlation', 'anomaly', 'anomalies', 'alerts'],
                description: 'Best dashboard tab for the user to open next.'
            },
            followUps: {
                type: 'array',
                description: 'Two or three short follow-up suggestions.',
                minItems: 2,
                maxItems: 3,
                items: {
                    type: 'string'
                }
            }
        },
        required: ['reply', 'suggestedTab', 'followUps']
    };
}

async function callGeminiLLM(message, context) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';

    const prompt = [
        buildSystemPrompt(),
        'Answer using only the dashboard context below.',
        buildUserPrompt(message, context)
    ].join('\n\n');

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`,
        {
            contents: [
                {
                    parts: [
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
                responseJsonSchema: buildGeminiSchema()
            }
        },
        {
            headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        }
    );

    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    const content = parts.map((part) => part.text || '').join('').trim();
    return normalizeLLMResult(safeJsonParse(content));
}

async function callOpenAILikeLLM(message, context) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: buildSystemPrompt() },
                { role: 'user', content: buildUserPrompt(message, context) }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 12000
        }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    return normalizeLLMResult(safeJsonParse(content));
}

async function callOllamaLLM(message, context) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';

    const response = await axios.post(
        `${host}/api/chat`,
        {
            model,
            stream: false,
            format: 'json',
            messages: [
                { role: 'system', content: buildSystemPrompt() },
                { role: 'user', content: buildUserPrompt(message, context) }
            ]
        },
        {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 20000
        }
    );

    const content = response.data?.message?.content || response.data?.response || '';
    return normalizeLLMResult(safeJsonParse(content));
}

async function callLLM(message, context) {
    const provider = (process.env.LLM_PROVIDER || '').toLowerCase().trim();

    if (provider === 'gemini') {
        return callGeminiLLM(message, context);
    }

    if (provider === 'openai') {
        return callOpenAILikeLLM(message, context);
    }

    if (provider === 'ollama') {
        return callOllamaLLM(message, context);
    }

    if (process.env.GEMINI_API_KEY) {
        return callGeminiLLM(message, context);
    }

    if (process.env.OPENAI_API_KEY) {
        return callOpenAILikeLLM(message, context);
    }

    if (process.env.OLLAMA_MODEL || process.env.OLLAMA_HOST) {
        return callOllamaLLM(message, context);
    }

    return null;
}

function emptyChatContext(location, currentTab) {
    const blank = (label) => ({
        label,
        current: null,
        avg: null,
        min: null,
        max: null,
        delta: null,
        direction: 'unknown',
    });
    return {
        location,
        currentTab: currentTab || 'dashboard',
        recordCount: 0,
        latestTimestamp: null,
        sensors: {
            soil: blank('Soil Moisture'),
            temperature: blank('Temperature'),
            humidity: blank('Humidity'),
            light: blank('Light Intensity'),
        },
        correlations: { sunlightVsMoisture: 0, temperatureVsMoisture: 0, temperatureVsHumidity: 0 },
        strongestMoistureDriver: { factor: 'Sunlight', metric: 0, value: 0 },
        prediction: {
            currentMoisture: 0,
            predictedMoisture: 0,
            soilStatus: 'Unknown',
            recommendation: 'Could not load sensor context.',
        },
        statisticalAnomalies: {
            totalReadings: 0,
            anomalyCount: 0,
            anomalyRatePercent: 0,
            perSensorAnomalyCounts: {
                soil_moisture: 0,
                temperature: 0,
                humidity: 0,
                light_lux: 0,
            },
            latestIsAnomaly: false,
            latestScore: null,
            latestReason: null,
        },
        alerts: [],
        dashboardGuide: TAB_GUIDE,
        currentTabGuide: getDashboardGuideMessage(currentTab || 'dashboard'),
    };
}

async function generateChatResponse({ db, location, message, currentTab }) {
    let context;
    try {
        context = await buildChatContext(db, location, currentTab);
    } catch (error) {
        console.error('buildChatContext failed:', error.message);
        context = emptyChatContext(location, currentTab);
    }

    try {
        const llmResponse = await callLLM(message, context);
        if (llmResponse) {
            return llmResponse;
        }
    } catch (error) {
        console.error('LLM chat generation failed, switching to analytics fallback:', error.message);
    }

    return buildFallbackResponse(message, context);
}

module.exports = {
    generateChatResponse
};
