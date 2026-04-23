import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './AnomalyDetectionPanel.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const SENSOR_OPTIONS = [
    { key: 'soil_moisture', label: 'Soil moisture', shortLabel: 'Moisture', unit: '%', color: '#34d399' },
    { key: 'temperature', label: 'Temperature', shortLabel: 'Temp', unit: '°C', color: '#38bdf8' },
    { key: 'humidity', label: 'Humidity', shortLabel: 'Humidity', unit: '%', color: '#a78bfa' },
    { key: 'light_lux', label: 'Light intensity', shortLabel: 'Light', unit: ' lux', color: '#fbbf24' },
];

function formatKpiMain(value, type) {
    if (value === null || value === undefined) return '—';
    if (type === 'int') return String(Math.round(Number(value)));
    if (type === 'pct') {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(1) : '—';
    }
    return String(value);
}

const AnomalyDetectionPanel = ({ location }) => {
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sensorKey, setSensorKey] = useState('soil_moisture');

    const fetchAnomalies = useCallback(async () => {
        try {
            const res = await axios.get(`http://localhost:5000/api/anomalies/${location}`, {
                params: { limit: 200 },
            });
            setPayload(res.data);
            setError(null);
            setLoading(false);
        } catch (err) {
            console.error('Anomaly API error:', err);
            setError('Could not load anomaly analysis. Is the backend running?');
            setLoading(false);
        }
    }, [location]);

    useEffect(() => {
        fetchAnomalies();
        const t = setInterval(fetchAnomalies, 10000);
        return () => clearInterval(t);
    }, [fetchAnomalies]);

    const summary = payload?.summary || {};
    const chart = payload?.chartData || { labels: [], series: {}, anomalyMask: [] };
    const meta = SENSOR_OPTIONS.find((s) => s.key === sensorKey) || SENSOR_OPTIONS[0];

    const series = chart.series?.[sensorKey] || [];
    const mask = chart.anomalyMask || [];

    const pointBg = useMemo(
        () =>
            series.map((v, i) => {
                if (v == null || !Number.isFinite(v)) return 'rgba(148, 163, 184, 0.25)';
                return mask[i] ? '#fb7185' : meta.color;
            }),
        [series, mask, meta.color]
    );

    const pointRadius = useMemo(
        () =>
            series.map((v, i) => {
                if (v == null || !Number.isFinite(v)) return 0;
                return mask[i] ? 7 : 3;
            }),
        [series, mask]
    );

    const chartConfig = useMemo(
        () => ({
            labels: chart.labels || [],
            datasets: [
                {
                    label: `${meta.label} (${(meta.unit || '').trim()})`,
                    data: series,
                    fill: true,
                    borderColor: meta.color,
                    borderWidth: 2,
                    backgroundColor: (() => {
                        const hex = meta.color;
                        if (hex.length === 7) return `${hex}18`;
                        return 'rgba(52, 211, 153, 0.12)';
                    })(),
                    tension: 0.32,
                    spanGaps: true,
                    pointBackgroundColor: pointBg,
                    pointBorderColor: 'rgba(15, 23, 42, 0.85)',
                    pointBorderWidth: 2,
                    pointRadius,
                    pointHoverRadius: 9,
                },
            ],
        }),
        [chart.labels, series, meta, pointBg, pointRadius]
    );

    const chartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: 'rgba(226, 232, 240, 0.9)',
                        font: { family: 'Outfit', size: 12, weight: '600' },
                        usePointStyle: true,
                        pointStyle: 'line',
                        boxWidth: 28,
                        padding: 16,
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    titleFont: { family: 'Outfit', size: 13, weight: '600' },
                    bodyFont: { family: 'Outfit', size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: 'rgba(52, 211, 153, 0.25)',
                    borderWidth: 1,
                    callbacks: {
                        afterLabel(ctx) {
                            const i = ctx.dataIndex;
                            if (mask[i]) return 'Statistical outlier (z-score and/or MAD vs prior window)';
                            return 'Within rolling baseline';
                        },
                    },
                },
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
                    ticks: {
                        color: 'rgba(148, 163, 184, 0.95)',
                        font: { family: 'Outfit', size: 11 },
                        padding: 8,
                    },
                    border: { display: false },
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(148, 163, 184, 0.9)',
                        font: { family: 'Outfit', size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12,
                    },
                    border: { display: false },
                },
            },
        }),
        [mask]
    );

    const kpis = useMemo(
        () => [
            {
                id: 'flagged',
                label: 'Flagged readings',
                main: formatKpiMain(summary.anomalyCount, 'int'),
                suffix: 'rows',
                accent: '#fb7185',
            },
            {
                id: 'rate',
                label: 'Anomaly rate',
                main: formatKpiMain(summary.anomalyRatePercent, 'pct'),
                suffix: '%',
                accent: '#fbbf24',
            },
            {
                id: 'points',
                label: 'Sample size',
                main: formatKpiMain(summary.totalReadings, 'int'),
                suffix: 'points',
                accent: '#38bdf8',
            },
            {
                id: 'window',
                label: 'Rolling window · min history',
                main: `${summary.windowSize ?? '—'} · ${summary.minHistory ?? '—'}`,
                suffix: '',
                accent: '#a78bfa',
            },
        ],
        [summary.anomalyCount, summary.anomalyRatePercent, summary.totalReadings, summary.windowSize, summary.minHistory]
    );

    if (loading && !payload) {
        return (
            <div className="anomaly-state">
                <div className="anomaly-state__spinner" aria-hidden />
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Loading anomaly models…</p>
                <p style={{ fontSize: '0.875rem', color: 'rgba(148, 163, 184, 0.9)' }}>Comparing each point to its rolling baseline</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="anomaly-state anomaly-state--error">
                <p style={{ fontWeight: 700, color: '#fecaca' }}>Unable to load data</p>
                <p style={{ fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.85)' }}>{error}</p>
            </div>
        );
    }

    if (!payload) return null;

    return (
        <div className="anomaly-page">
            <header className="anomaly-page__intro">
                <div>
                    <p className="anomaly-page__eyebrow">Operational intelligence</p>
                    <h2 className="anomaly-page__title">Rolling baseline analysis</h2>
                    <p className="anomaly-page__subtitle">
                        Each timestamp is scored against prior readings only. Multivariate flags appear when any channel
                        exceeds rolling z-score or robust MAD thresholds—separate from basic validity checks.
                    </p>
                </div>
                <div className="anomaly-page__meta">
                    <span className="anomaly-chip">{location}</span>
                    <span className="anomaly-chip anomaly-chip--muted">Refreshes every 10s</span>
                </div>
            </header>

            <section className="anomaly-kpi-grid" aria-label="Anomaly summary metrics">
                {kpis.map((k) => (
                    <article
                        key={k.id}
                        className="anomaly-kpi"
                        style={{ '--anomaly-kpi-accent': k.accent }}
                    >
                        <span className="anomaly-kpi__label">{k.label}</span>
                        <div className="anomaly-kpi__value">
                            {k.main}
                            {k.suffix ? <span>{k.suffix}</span> : null}
                        </div>
                    </article>
                ))}
            </section>

            <section className="anomaly-chart-card" aria-labelledby="anomaly-chart-heading">
                <div className="anomaly-chart-card__head">
                    <div>
                        <h3 id="anomaly-chart-heading">Time series</h3>
                        <p className="anomaly-chart-card__sub">
                            Select a channel. Red points mark timestamps where the row was flagged (any sensor may have
                            triggered the highlight).
                        </p>
                    </div>
                    <div className="anomaly-sensor-toggle" role="tablist" aria-label="Sensor channel">
                        {SENSOR_OPTIONS.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                role="tab"
                                aria-selected={sensorKey === s.key}
                                onClick={() => setSensorKey(s.key)}
                            >
                                {s.shortLabel}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="anomaly-chart-card__legend">
                    <span className="anomaly-legend-item">
                        <span className="anomaly-legend-dot anomaly-legend-dot--normal" aria-hidden />
                        Normal
                    </span>
                    <span className="anomaly-legend-item">
                        <span className="anomaly-legend-dot anomaly-legend-dot--outlier" aria-hidden />
                        Outlier timestamp
                    </span>
                </div>

                <div className="anomaly-chart-stage">
                    <Line data={chartConfig} options={chartOptions} />
                </div>

                {/* <footer className="anomaly-chart-card__foot">
                    <strong>Detection rule:</strong> row is anomalous if any of soil moisture, temperature, humidity, or
                    light exceeds <strong>|z| ≥ {summary.zThreshold}</strong> or <strong>|MAD-z| ≥ {summary.madThreshold}</strong>{' '}
                    versus the prior window. Chart color reflects the selected channel only; highlights still indicate a
                    multivariate flag at that time.
                </footer> */}
            </section>
        </div>
    );
};

export default AnomalyDetectionPanel;
