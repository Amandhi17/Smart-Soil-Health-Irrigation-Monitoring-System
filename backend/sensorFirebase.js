/**
 * Shared RTDB reads: normalize field names / numbers, match device loosely,
 * prefer cleaned_sensors then sensors, and fall back to "any device" so real
 * data in Firebase is never hidden behind a mismatched device_id string.
 */

function firstFiniteNumber(...candidates) {
    for (const v of candidates) {
        if (v === undefined || v === null || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

function pickDeviceId(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const v =
        raw.device_id ??
        raw.deviceId ??
        raw.device ??
        raw.farm_id ??
        raw.farmId ??
        raw.location_id ??
        raw.locationId ??
        raw.location;
    if (v == null || v === '') return '';
    return String(v).trim();
}

function sensorRecordMatchesLocation(d, location) {
    if (!location || String(location).trim() === '*') return true;
    const did = pickDeviceId(d);
    if (!did) return true;
    return did.toLowerCase() === String(location).trim().toLowerCase();
}

function normalizeSensorReading(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const soil = firstFiniteNumber(raw.soil_moisture, raw.soil);
    const temperature = firstFiniteNumber(raw.temperature, raw.tem, raw.temp);
    const humidity = firstFiniteNumber(raw.humidity);
    const light_lux = firstFiniteNumber(raw.light_lux, raw.light);
    const out = { ...raw };
    if (soil !== undefined) out.soil_moisture = soil;
    if (temperature !== undefined) out.temperature = temperature;
    if (humidity !== undefined) out.humidity = humidity;
    if (light_lux !== undefined) out.light_lux = light_lux;
    const did = pickDeviceId(raw);
    if (did) out.device_id = did;
    if (!out.timestamp) out.timestamp = raw.time || new Date().toISOString();
    return out;
}

async function fetchNormalizedRows(db, refPath, location, limit, matchLocation) {
    const snapshot = await db.ref(refPath).limitToLast(limit).once('value');
    const rows = [];
    snapshot.forEach((snap) => {
        const n = normalizeSensorReading(snap.val());
        if (!n) return;
        if (matchLocation !== false && !sensorRecordMatchesLocation(n, location)) return;
        rows.push(n);
    });
    return rows.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

async function tryMergedPair(db, location, limit, matchLocation) {
    const cleaned = await fetchNormalizedRows(db, 'cleaned_sensors', location, limit, matchLocation);
    if (cleaned.length > 0) {
        return {
            rows: cleaned,
            source: matchLocation === false ? 'cleaned_sensors_any_device' : 'cleaned_sensors',
        };
    }
    const live = await fetchNormalizedRows(db, 'sensors', location, limit, matchLocation);
    return {
        rows: live,
        source:
            live.length === 0
                ? 'none'
                : matchLocation === false
                    ? 'sensors_any_device'
                    : 'sensors',
    };
}

/**
 * @returns {{ rows: object[], source: string, inferredDevice: string|null }}
 */
async function getMergedSensorRowsForLocation(db, location, limit = 150) {
    if (!db) return { rows: [], source: 'none', inferredDevice: null };

    let { rows, source } = await tryMergedPair(db, location, limit, true);
    if (rows.length === 0) {
        const any = await tryMergedPair(db, location, limit, false);
        if (any.rows.length > 0) {
            const inferred = pickDeviceId(any.rows[any.rows.length - 1]) || null;
            return { rows: any.rows, source: any.source, inferredDevice: inferred };
        }
    }
    return { rows, source: rows.length ? source : 'none', inferredDevice: null };
}

module.exports = {
    getMergedSensorRowsForLocation,
    normalizeSensorReading,
    pickDeviceId,
    sensorRecordMatchesLocation,
};
