import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import './DashboardHome.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const Sparkline = ({ data, color }) => {
    const chartData = {
        labels: data.map((_, i) => i),
        datasets: [
            {
                data,
                backgroundColor: `${color}55`,
                borderRadius: 4,
                borderSkipped: false,
            },
        ],
    };
    const options = {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        maintainAspectRatio: false,
    };
    return (
        <div className="dash-pro-spark">
            <Bar data={chartData} options={options} />
        </div>
    );
};

const sensorConfig = {
    soil_moisture: { label: 'Soil moisture', unit: '%', icon: '💧', color: '#38bdf8' },
    temperature: { label: 'Temperature', unit: '°C', icon: '🌡️', color: '#fb923c' },
    humidity: { label: 'Humidity', unit: '%', icon: '☁️', color: '#34d399' },
    light_lux: { label: 'Light intensity', unit: ' lux', icon: '☀️', color: '#facc15' },
};

const DashboardHome = ({ location }) => {
    const [summary, setSummary] = useState(null);
    const [trendData, setTrendData] = useState([]);
    const [timeRange, setTimeRange] = useState('24h');
    const [activeTrend, setActiveTrend] = useState('soil_moisture');
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [sumRes, alertsRes] = await Promise.all([
                    axios.get(`http://localhost:5000/api/dashboard-summary/${location}`),
                    axios.get(`http://localhost:5000/api/alerts`, { params: { location } }),
                ]);
                setSummary(sumRes.data);
                setAlerts(alertsRes.data);

                const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
                const hours = hoursMap[timeRange] || 24;
                const trendRes = await axios.get(
                    `http://localhost:5000/api/temporal/${activeTrend}/${location}?hours=${hours}`
                );
                setTrendData(trendRes.data.rawData || []);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            }
            setLoading(false);
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [location, activeTrend, timeRange]);

    const formatReading = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
        return Number(val).toFixed(1);
    };

    const activeColor = sensorConfig[activeTrend]?.color || '#34d399';

    const mainChartData = useMemo(
        () => ({
            labels: trendData.map((d) => {
                const date = new Date(d.timestamp);
                return timeRange === '24h'
                    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                      });
            }),
            datasets: [
                {
                    label: sensorConfig[activeTrend]?.label || 'Series',
                    data: trendData.map((d) => d.value),
                    borderColor: activeColor,
                    backgroundColor: `${activeColor}22`,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: trendData.length > 48 ? 0 : 3,
                    pointHoverRadius: 6,
                },
            ],
        }),
        [trendData, activeTrend, timeRange, activeColor]
    );

    const mainChartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleFont: { family: 'Outfit', size: 13, weight: '600' },
                    bodyFont: { family: 'Outfit', size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: 'rgba(52, 211, 153, 0.2)',
                    borderWidth: 1,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
                    ticks: { color: 'rgba(148, 163, 184, 0.95)', font: { family: 'Outfit', size: 11 } },
                    border: { display: false },
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(148, 163, 184, 0.85)',
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

    if (loading || !summary) {
        return (
            <div className="dash-pro-loading">
                <div className="dash-pro-loading__spinner" aria-hidden />
                <p style={{ margin: 0, fontWeight: 700, color: '#ecfdf5' }}>Syncing live sensor data…</p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(167, 243, 208, 0.8)' }}>
                    Building your farm control overview
                </p>
            </div>
        );
    }

    return (
        <div className="advanced-dashboard dash-pro">
            <header className="dash-pro__hero">
                <p className="dash-pro__eyebrow">Live operations</p>
                <h2 className="dash-pro__title">Dashboard overview</h2>
                <p className="dash-pro__lead">
                    Monitor soil, microclimate, and light in one place. Select a metric below to drive the main trend
                    chart.
                </p>
                <div className="dash-pro__banners">
                    {summary.dataSource && summary.dataSource.includes('any_device') && summary.inferredDevice && (
                        <p className="dash-pro-banner dash-pro-banner--warn">
                            Showing Firebase data for device <strong>{summary.inferredDevice}</strong> (no rows matched{' '}
                            <code>{location}</code>). Align <code>device_id</code> on the device with{' '}
                            <code>App.jsx</code>.
                        </p>
                    )}
                    {summary.dataSource === 'sensors' && (
                        <p className="dash-pro-banner dash-pro-banner--info">
                            Live path: <code>/sensors</code>. Run <code>data_cleaner.py</code> to populate{' '}
                            <code>/cleaned_sensors</code> for validated streams.
                        </p>
                    )}
                    {summary.dataSource === 'none' && (
                        <p className="dash-pro-banner dash-pro-banner--error">
                            No documents under <code>sensors</code> or <code>cleaned_sensors</code>.
                        </p>
                    )}
                </div>
            </header>

            <div className="sensor-grid-tiles">
                {Object.entries(sensorConfig).map(([key, config]) => (
                    <button
                        key={key}
                        type="button"
                        className={`sensor-tile glass-panel dash-pro-tile${activeTrend === key ? ' dash-pro-tile--active' : ''}`}
                        onClick={() => setActiveTrend(key)}
                        style={{
                            ['--dash-tile-accent']: `linear-gradient(90deg, ${config.color}, ${config.color}aa)`,
                        }}
                    >
                        <div className="tile-header">
                            <span className="tile-label">{config.label}</span>
                            <div className="tile-icon-bg" style={{ backgroundColor: `${config.color}22`, color: config.color }}>
                                {config.icon}
                            </div>
                        </div>
                        <div className="tile-body">
                            <div className="tile-main">
                                <span className="tile-value">
                                    {formatReading(summary.sensors[key].current)}
                                    {config.unit}
                                </span>
                                <span className="tile-status" style={{ color: config.color }}>
                                    {summary.sensors[key].status || 'Healthy'}
                                </span>
                            </div>
                            <Sparkline data={summary.sensors[key].trend || [0]} color={config.color} />
                        </div>
                    </button>
                ))}
            </div>

            <div className="dashboard-mid-section">
                <div className="main-trend-container glass-panel">
                    <div className="chart-header">
                        <div className="trend-selectors" role="tablist" aria-label="Trend metric">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTrend === 'soil_moisture'}
                                className={`trend-btn${activeTrend === 'soil_moisture' ? ' active' : ''}`}
                                onClick={() => setActiveTrend('soil_moisture')}
                            >
                                Soil moisture
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTrend === 'temperature'}
                                className={`trend-btn${activeTrend === 'temperature' ? ' active' : ''}`}
                                onClick={() => setActiveTrend('temperature')}
                            >
                                Temperature
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTrend === 'humidity'}
                                className={`trend-btn${activeTrend === 'humidity' ? ' active' : ''}`}
                                onClick={() => setActiveTrend('humidity')}
                            >
                                Humidity
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTrend === 'light_lux'}
                                className={`trend-btn${activeTrend === 'light_lux' ? ' active' : ''}`}
                                onClick={() => setActiveTrend('light_lux')}
                            >
                                Light intensity
                            </button>
                        </div>
                        <div className="time-selectors" role="group" aria-label="Time range">
                            <button
                                type="button"
                                className={`time-btn${timeRange === '24h' ? ' active' : ''}`}
                                onClick={() => setTimeRange('24h')}
                            >
                                24 hours
                            </button>
                            <button
                                type="button"
                                className={`time-btn${timeRange === '7d' ? ' active' : ''}`}
                                onClick={() => setTimeRange('7d')}
                            >
                                7 days
                            </button>
                            <button
                                type="button"
                                className={`time-btn${timeRange === '30d' ? ' active' : ''}`}
                                onClick={() => setTimeRange('30d')}
                            >
                                30 days
                            </button>
                        </div>
                    </div>
                    <div className="main-chart-wrapper">
                        <Line data={mainChartData} options={mainChartOptions} />
                    </div>
                </div>

                <div className="plant-status-card glass-panel">
                    <div className="plant-avatar" aria-hidden>
                        🌿
                    </div>
                    <h3>Monstera deliciosa</h3>
                    <p className="scientific-name">Swiss cheese plant</p>

                    <div className="plant-stats-list">
                        <div className="p-stat">
                            <span>Moisture level</span>
                            <strong>{formatReading(summary.sensors.soil_moisture.current)}%</strong>
                        </div>
                        <div className="p-stat">
                            <span>Last watered</span>
                            <strong>{Number(summary.sensors.soil_moisture.current) > 60 ? 'Today' : '2 days ago'}</strong>
                        </div>
                        <div className="p-stat">
                            <span>Watering note</span>
                            <strong>{String(summary.ml.recommendation || '').split('.')[0]}</strong>
                        </div>
                    </div>

                    <div className="growth-progress">
                        <div className="progress-label">
                            <span>Plant growth progress</span>
                            <span>72%</span>
                        </div>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: '72%' }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="dashboard-bottom-section">
                <div className="ml-predictions-grid glass-panel">
                    <h3>ML predictions &amp; insights</h3>
                    <div className="ml-cards">
                        <div className="ml-insight-card">
                            <div className="ins-icon health">📈</div>
                            <div className="ins-info">
                                <label>Plant health status</label>
                                <strong>{summary.ml.status}</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon dryness">⏳</div>
                            <div className="ins-info">
                                <label>Soil dryness (heuristic)</label>
                                <strong>Dry in ~14 hours</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon water">💧</div>
                            <div className="ins-info">
                                <label>Watering recommendation</label>
                                <strong>{summary.ml.recommendation}</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon light">☀️</div>
                            <div className="ins-info">
                                <label>Light exposure</label>
                                <strong>Position looks reasonable</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="active-alerts-panel glass-panel">
                    <h3>Active alerts</h3>
                    <div className="side-alerts-list">
                        {alerts.length > 0 ? (
                            alerts.map((alert) => (
                                <div key={alert.id} className={`side-alert-item ${alert.severity || 'info'}`}>
                                    <div className="alt-icon" aria-hidden>
                                        ⚠️
                                    </div>
                                    <div className="alt-content">
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                width: '100%',
                                                gap: '0.5rem',
                                            }}
                                        >
                                            <strong>{alert.sensorId || alert.type}</strong>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.65, flexShrink: 0 }}>
                                                {new Date(alert.timestamp).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>
                                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', lineHeight: 1.45 }}>
                                            {alert.message}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-alerts-placeholder">All clear — no active alerts</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
