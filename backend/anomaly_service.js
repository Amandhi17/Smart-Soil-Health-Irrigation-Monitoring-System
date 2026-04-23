/**
 * Statistical anomaly detection for IoT multivariate series.
 *
 * This is NOT data validation (null / type / impossible range). Each point is
 * compared to a rolling history of the same sensor using:
 *   - z-score vs window mean & sample standard deviation
 *   - robust modified z-score using median and MAD (Median Absolute Deviation)
 *
 * A value can be numerically valid yet flagged if it is far from recent behavior.
 */

const SENSOR_KEYS = ['soil_moisture', 'temperature', 'humidity', 'light_lux'];

const DEFAULTS = {
    windowSize: 36,
    minHistory: 10,
    zThreshold: 3.0,
    madThreshold: 3.5,
};

function median(sortedOrArr) {
    const arr = Array.isArray(sortedOrArr) ? [...sortedOrArr].sort((a, b) => a - b) : [];
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function sampleStd(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
}

function madScore(histVals, x) {
    const med = median(histVals);
    const devs = histVals.map((v) => Math.abs(v - med));
    const madVal = median(devs);
    const denom = madVal < 1e-9 ? 1e-9 : madVal;
    return 0.6745 * (x - med) / denom;
}

function pickSensorValues(row) {
    const o = {};
    for (const k of SENSOR_KEYS) {
        if (row[k] !== undefined && row[k] !== null && Number.isFinite(Number(row[k]))) {
            o[k] = Number(row[k]);
        }
    }
    return o;
}

/**
 * Score each reading against prior window (exclusive of current index).
 * @param {object[]} rows oldest → newest, normalized numeric fields
 * @param {object} opts windowSize, minHistory, zThreshold, madThreshold
 */
function scoreSeries(rows, opts = {}) {
    const windowSize = opts.windowSize ?? DEFAULTS.windowSize;
    const minHistory = opts.minHistory ?? DEFAULTS.minHistory;
    const zThreshold = opts.zThreshold ?? DEFAULTS.zThreshold;
    const madThresh = opts.madThreshold ?? DEFAULTS.madThreshold;

    const perPoint = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const start = Math.max(0, i - windowSize);
        const history = rows.slice(start, i);

        const values = pickSensorValues(row);
        const flags = {};
        const zScores = {};
        const madScores = {};
        const reasons = [];
        let maxAbs = 0;

        if (history.length < minHistory) {
            perPoint.push({
                index: i,
                timestamp: row.timestamp || null,
                device_id: row.device_id || null,
                values,
                flags: Object.fromEntries(SENSOR_KEYS.map((k) => [k, false])),
                zScores: {},
                madScores: {},
                isAnomaly: false,
                score: 0,
                reason: `Baseline building: need ${minHistory} prior readings (have ${history.length}).`,
            });
            continue;
        }

        for (const key of SENSOR_KEYS) {
            const x = values[key];
            if (!Number.isFinite(x)) {
                flags[key] = false;
                continue;
            }
            const histVals = history
                .map((r) => Number(r[key]))
                .filter((v) => Number.isFinite(v));
            if (histVals.length < minHistory) {
                flags[key] = false;
                continue;
            }

            const m = mean(histVals);
            const s = sampleStd(histVals);
            const z = s < 1e-9 ? 0 : (x - m) / s;
            const rz = madScore(histVals, x);

            zScores[key] = Number(z.toFixed(4));
            madScores[key] = Number(rz.toFixed(4));

            const zFlag = Math.abs(z) >= zThreshold;
            const madFlag = Math.abs(rz) >= madThresh;
            flags[key] = zFlag || madFlag;

            if (flags[key]) {
                maxAbs = Math.max(maxAbs, Math.abs(z), Math.abs(rz));
                const bits = [];
                if (zFlag) bits.push(`z=${z.toFixed(2)} (threshold ±${zThreshold})`);
                if (madFlag) bits.push(`MAD-z=${rz.toFixed(2)} (threshold ±${madThresh})`);
                reasons.push(`${key}: ${bits.join('; ')}`);
            }
        }

        const isAnomaly = Object.values(flags).some(Boolean);
        perPoint.push({
            index: i,
            timestamp: row.timestamp || null,
            device_id: row.device_id || null,
            values,
            flags,
            zScores,
            madScores,
            isAnomaly,
            score: Number(maxAbs.toFixed(3)),
            reason: isAnomaly ? reasons.join(' | ') : 'Within rolling statistical envelope.',
        });
    }

    return perPoint;
}

function perSensorCounts(anomalyPoints) {
    const counts = Object.fromEntries(SENSOR_KEYS.map((k) => [k, 0]));
    for (const p of anomalyPoints) {
        if (!p.isAnomaly) continue;
        for (const k of SENSOR_KEYS) {
            if (p.flags[k]) counts[k] += 1;
        }
    }
    return counts;
}

function buildChartData(rows, perPoint) {
    const labels = rows.map((r, i) => {
        const t = r.timestamp ? new Date(r.timestamp) : null;
        return t && !Number.isNaN(t.getTime())
            ? t.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : `#${i}`;
    });

    const series = {};
    for (const k of SENSOR_KEYS) {
        series[k] = rows.map((r) => (Number.isFinite(Number(r[k])) ? Number(r[k]) : null));
    }

    const anomalyMask = perPoint.map((p) => p.isAnomaly);

    return { labels, series, anomalyMask };
}

function buildExplanation(summary, methodLabel) {
    return [
        `${methodLabel}: each reading is compared only to its own past window (not fixed global limits).`,
        `Totals: ${summary.anomalyCount} flagged points out of ${summary.totalReadings} (${summary.anomalyRatePercent}% rate).`,
        'Per-sensor counts count how often that channel contributed to a multivariate outlier row.',
        'Z-score flags sudden shifts vs recent mean; MAD flags shifts vs robust median — valid numbers can still trigger.',
    ].join(' ');
}

/**
 * Full payload for GET /api/anomalies/:location
 */
function buildAnomaliesApiResponse(rows, location, queryOpts = {}) {
    const opts = {
        windowSize: Math.min(120, Math.max(8, parseInt(queryOpts.window, 10) || DEFAULTS.windowSize)),
        minHistory: Math.min(50, Math.max(5, parseInt(queryOpts.minHistory, 10) || DEFAULTS.minHistory)),
        zThreshold: parseFloat(queryOpts.zThreshold) || DEFAULTS.zThreshold,
        madThreshold: parseFloat(queryOpts.madThreshold) || DEFAULTS.madThreshold,
    };

    const perPoint = scoreSeries(rows, opts);
    const anomalies = perPoint.filter((p) => p.isAnomaly);
    const totalReadings = perPoint.length;
    const anomalyCount = anomalies.length;
    const anomalyRate = totalReadings ? anomalyCount / totalReadings : 0;
    const perSensor = perSensorCounts(perPoint);

    const recentAnomalies = [...anomalies].reverse().slice(0, 40);

    const method =
        'rolling_window_z_score_and_median_mad (per-channel vs prior window; multivariate row flags if any channel fires)';

    const summary = {
        totalReadings,
        anomalyCount,
        anomalyRate,
        anomalyRatePercent: Number((anomalyRate * 100).toFixed(2)),
        perSensorAnomalyCounts: perSensor,
        windowSize: opts.windowSize,
        minHistory: opts.minHistory,
        zThreshold: opts.zThreshold,
        madThreshold: opts.madThreshold,
    };

    const chartData = buildChartData(rows, perPoint);

    return {
        location,
        method,
        parameters: opts,
        summary,
        recentAnomalies,
        perPointScores: perPoint,
        chartData,
        explanation: buildExplanation(summary, method),
    };
}

/**
 * Compact object for chat context (avoid huge payloads).
 */
function buildAnomalyChatSummary(rows, opts) {
    if (!rows || !rows.length) {
        return {
            totalReadings: 0,
            anomalyCount: 0,
            anomalyRatePercent: 0,
            perSensorAnomalyCounts: Object.fromEntries(SENSOR_KEYS.map((k) => [k, 0])),
            latestIsAnomaly: false,
            latestScore: null,
            latestReason: null,
            recentOutlierCount: 0,
        };
    }
    const perPoint = scoreSeries(rows, { ...DEFAULTS, ...opts });
    const anomalies = perPoint.filter((p) => p.isAnomaly);
    const last = perPoint[perPoint.length - 1];
    return {
        totalReadings: perPoint.length,
        anomalyCount: anomalies.length,
        anomalyRatePercent: Number(((anomalies.length / perPoint.length) * 100).toFixed(2)),
        perSensorAnomalyCounts: perSensorCounts(perPoint),
        latestIsAnomaly: last.isAnomaly,
        latestScore: last.score,
        latestReason: last.reason,
        recentOutlierCount: Math.min(5, anomalies.length),
    };
}

/**
 * Build alert-like objects for the Alerts API (statistical only).
 */
function buildStatisticalAnomalyAlerts(rows, location, limit = 5) {
    if (!rows || !rows.length) return [];
    const perPoint = scoreSeries(rows, DEFAULTS);
    const flagged = perPoint.filter((p) => p.isAnomaly).slice(-limit);
    return flagged.map((p, idx) => {
        const sev = p.score >= 6 ? 'critical' : p.score >= 4 ? 'warning' : 'moderate';
        return {
            id: `stat-anomaly-${p.timestamp || idx}-${idx}`,
            type: 'Statistical anomaly',
            severity: sev,
            message: p.reason,
            timestamp: p.timestamp || new Date().toISOString(),
            sensorId: 'Rolling z-score / MAD',
            location: p.device_id || location,
            value: String(p.score),
            unit: 'score',
            anomalyScore: p.score,
            flags: p.flags,
        };
    });
}

module.exports = {
    SENSOR_KEYS,
    scoreSeries,
    buildAnomaliesApiResponse,
    buildAnomalyChatSummary,
    buildStatisticalAnomalyAlerts,
    DEFAULTS,
};
