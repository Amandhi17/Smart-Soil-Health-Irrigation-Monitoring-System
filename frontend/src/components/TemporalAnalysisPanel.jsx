import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import NeedleGaugeChart from './NeedleGaugeChart';
import './TemporalAnalysisPanel.css';

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

function formatStat(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return Number(v).toFixed(1);
}

const TemporalAnalysisPanel = ({ location }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadTemporal = useCallback(
        async (showSpinner) => {
            if (showSpinner) setLoading(true);
            try {
                const response = await axios.get(`http://localhost:5000/api/temporal/soil_moisture/${location}`);
                setData(response.data);
                setError(null);
            } catch (err) {
                console.error('Error fetching temporal data:', err);
                if (showSpinner) {
                    setError('Could not load temporal data. Check that the backend is running.');
                }
            } finally {
                if (showSpinner) setLoading(false);
            }
        },
        [location]
    );

    useEffect(() => {
        loadTemporal(true);
        const interval = setInterval(() => loadTemporal(false), 5000);
        return () => clearInterval(interval);
    }, [loadTemporal]);

    const raw = data?.rawData || [];
    const trend = data?.trend;

    const chartData = useMemo(
        () => ({
            labels: raw.map((d) =>
                new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            ),
            datasets: [
                {
                    label: 'Soil moisture (%)',
                    data: raw.map((d) => d.value),
                    fill: true,
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.12)',
                    borderWidth: 2,
                    tension: 0.35,
                    pointBackgroundColor: '#6ee7b7',
                    pointBorderColor: 'rgba(15, 23, 42, 0.85)',
                    pointBorderWidth: 2,
                    pointRadius: raw.length > 60 ? 0 : 3,
                    pointHoverRadius: 7,
                },
            ],
        }),
        [raw]
    );

    const chartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    titleFont: { family: 'Outfit', size: 13, weight: '600' },
                    bodyFont: { family: 'Outfit', size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: 'rgba(52, 211, 153, 0.22)',
                    borderWidth: 1,
                },
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
                    ticks: { color: 'rgba(148, 163, 184, 0.95)', font: { family: 'Outfit', size: 11 } },
                    border: { display: false },
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(148, 163, 184, 0.88)',
                        font: { family: 'Outfit', size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 14,
                    },
                    border: { display: false },
                },
            },
        }),
        []
    );

    const kpis = useMemo(() => {
        if (!trend) return [];
        return [
            { label: 'Current', value: formatStat(trend.latest), unit: '%', accent: '#34d399' },
            { label: 'Average (24h)', value: formatStat(trend.avg), unit: '%', accent: '#38bdf8' },
            { label: 'Minimum', value: formatStat(trend.min), unit: '%', accent: '#fbbf24' },
            { label: 'Maximum', value: formatStat(trend.max), unit: '%', accent: '#fb7185' },
        ];
    }, [trend]);

    if (loading && !data) {
        return (
            <div className="temp-pro">
                <div className="temp-pro-state">
                    <div className="temp-pro-state__spinner" aria-hidden />
                    <p style={{ margin: 0, fontWeight: 700, color: '#ecfdf5' }}>Loading temporal analytics…</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(167, 243, 208, 0.82)' }}>
                        Fetching 24-hour soil moisture series
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="temp-pro">
                <div className="temp-pro-state temp-pro-state--error">
                    <p style={{ margin: 0, fontWeight: 800, color: '#fecaca' }}>Unable to load data</p>
                    <p style={{ margin: '0.5rem 0 0', color: 'rgba(226, 232, 240, 0.88)', maxWidth: '28rem' }}>{error}</p>
                    <button type="button" className="temp-pro-retry" onClick={() => loadTemporal(true)}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data || !trend) return null;

    const gaugeSize = 210;

    return (
        <div className="temp-pro">
            <header className="temp-pro__hero">
                <div>
                    <p className="temp-pro__eyebrow">Time-series intelligence</p>
                    <h2 className="temp-pro__title">Temporal analysis</h2>
                    <p className="temp-pro__lead">
                        Rolling 24-hour soil moisture statistics, a live gauge for the latest reading, and the full
                        intraday curve—ideal for spotting drift before it becomes a field problem.
                    </p>
                </div>
                <div className="temp-pro__badge">
                    <span className="temp-pro__badge-dot" aria-hidden />
                    {location} · 24h · refresh 5s
                </div>
            </header>

            <section className="temp-pro__kpis" aria-label="Moisture statistics">
                {kpis.map((k) => (
                    <article key={k.label} className="temp-pro-kpi" style={{ ['--temp-kpi-accent']: k.accent }}>
                        <span className="temp-pro-kpi__label">{k.label}</span>
                        <div className="temp-pro-kpi__value">
                            {k.value}
                            <span>{k.unit}</span>
                        </div>
                    </article>
                ))}
            </section>

            <section className="temp-pro__insight" aria-labelledby="temp-insight-title">
                <div className="temp-pro__insight-head">
                    <span className="temp-pro__insight-icon" aria-hidden>
                        💡
                    </span>
                    <h3 id="temp-insight-title" className="temp-pro__insight-title">
                        Farmer insight
                    </h3>
                </div>
                <p className="temp-pro__insight-body">
                    {trend.insight || 'Collecting enough points to summarize trend and confidence.'}
                </p>
            </section>

            <div className="temp-pro__viz">
                <div className="temp-pro-panel temp-pro-panel--gauge">
                    <h3 className="temp-pro-panel__title">Current condition</h3>
                    <div className="temp-pro-panel__body">
                        <NeedleGaugeChart value={Number(trend.latest) || 0} size={gaugeSize} />
                    </div>
                </div>

                <div className="temp-pro-panel">
                    <h3 className="temp-pro-panel__title">Moisture trend · last 24 hours</h3>
                    <div className="temp-pro-panel__chart">
                        <Line data={chartData} options={chartOptions} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TemporalAnalysisPanel;
