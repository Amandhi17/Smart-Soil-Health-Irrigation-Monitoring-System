import React, { useState, useEffect } from 'react';
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
    Filler
} from 'chart.js';

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
        datasets: [{
            data: data,
            backgroundColor: `${color}88`,
            borderRadius: 2,
            borderSkipped: false,
        }]
    };
    const options = {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        maintainAspectRatio: false
    };
    return <div style={{ height: '35px', width: '100px' }}><Bar data={chartData} options={options} /></div>;
};

const DashboardHome = ({ location }) => {
    const [summary, setSummary] = useState(null);
    const [trendData, setTrendData] = useState([]);
    const [timeRange, setTimeRange] = useState('24h'); // 24h, 7d, 30d
    const [activeTrend, setActiveTrend] = useState('soil_moisture');
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [sumRes, alertsRes] = await Promise.all([
                    axios.get(`http://localhost:5000/api/dashboard-summary/${location}`),
                    axios.get(`http://localhost:5000/api/alerts`)
                ]);
                setSummary(sumRes.data);
                setAlerts(alertsRes.data);

                // Map timeRange string to hours
                const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
                const hours = hoursMap[timeRange] || 24;

                // Fetch trend based on selection and time range
                const trendRes = await axios.get(`http://localhost:5000/api/temporal/${activeTrend}/${location}?hours=${hours}`);
                setTrendData(trendRes.data.rawData || []);
            } catch (err) {
                console.error("Dashboard Fetch Error:", err);
            }
            setLoading(false);
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [location, activeTrend, timeRange]);

    if (loading || !summary) return <div className="loading pulse">Analyzing Gaden Vitals...</div>;

    const sensorConfig = {
        soil_moisture: { label: 'Soil Moisture', unit: '%', icon: '💧', color: '#38bdf8' },
        temperature: { label: 'Temperature', unit: '°C', icon: '🌡️', color: '#fb923c' },
        humidity: { label: 'Humidity', unit: '%', icon: '☁️', color: '#10b981' },
        light_lux: { label: 'Light Intensity', unit: ' lux', icon: '☀️', color: '#facc15' }
    };

    const mainChartData = {
        labels: trendData.map(d => {
            const date = new Date(d.timestamp);
            return timeRange === '24h'
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }),
        datasets: [{
            label: sensorConfig[activeTrend]?.label || 'Unknown',
            data: trendData.map(d => d.value),
            backgroundColor: `${sensorConfig[activeTrend]?.color || '#ffffff'}33`,
            borderColor: sensorConfig[activeTrend].color,
            borderWidth: 3,
            fill: true,
            tension: 0.4
        }]
    };

    return (
        <div className="advanced-dashboard">
            <div className="dashboard-header-text">
                <h2>Dashboard Overview</h2>
                <p>Monitor your garden's health and environmental conditions</p>
            </div>

            {/* Top ROW: 4 Tiles */}
            <div className="sensor-grid-tiles">
                {Object.entries(sensorConfig).map(([key, config]) => (
                    <div key={key} className="sensor-tile glass-panel" onClick={() => setActiveTrend(key)}>
                        <div className="tile-header">
                            <span className="tile-label">{config.label}</span>
                            <div className="tile-icon-bg" style={{ backgroundColor: `${config.color}22`, color: config.color }}>
                                {config.icon}
                            </div>
                        </div>
                        <div className="tile-body">
                            <div className="tile-main">
                                <span className="tile-value">{summary.sensors[key].current || '0'}{config.unit}</span>
                                <span className="tile-status" style={{ color: config.color }}> {summary.sensors[key].status || 'Optimal'}</span>
                            </div>
                            <Sparkline data={summary.sensors[key].trend || [0]} color={config.color} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Middle ROW: Chart & Plant Card */}
            <div className="dashboard-mid-section">
                <div className="main-trend-container glass-panel">
                    <div className="chart-header">
                        <div className="trend-selectors">
                            <button className={`trend-btn ${activeTrend === 'soil_moisture' ? 'active' : ''}`} onClick={() => setActiveTrend('soil_moisture')}>Soil Moisture Trend</button>
                            <button className={`trend-btn ${activeTrend === 'temperature' ? 'active' : ''}`} onClick={() => setActiveTrend('temperature')}>Temperature & Humidity</button>
                            <button className={`trend-btn ${activeTrend === 'light_lux' ? 'active' : ''}`} onClick={() => setActiveTrend('light_lux')}>Light Intensity</button>
                        </div>
                        <div className="time-selectors">
                            <button
                                className={`time-btn ${timeRange === '24h' ? 'active' : ''}`}
                                onClick={() => setTimeRange('24h')}
                            >
                                24 Hours
                            </button>
                            <button
                                className={`time-btn ${timeRange === '7d' ? 'active' : ''}`}
                                onClick={() => setTimeRange('7d')}
                            >
                                7 Days
                            </button>
                            <button
                                className={`time-btn ${timeRange === '30d' ? 'active' : ''}`}
                                onClick={() => setTimeRange('30d')}
                            >
                                30 Days
                            </button>
                        </div>
                    </div>
                    <div className="main-chart-wrapper">
                        <Bar data={mainChartData} options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa' }, beginAtZero: true },
                                x: { grid: { display: false }, ticks: { color: '#a1a1aa' } }
                            }
                        }} />
                    </div>
                </div>

                <div className="plant-status-card glass-panel">
                    <div className="plant-avatar">🌿</div>
                    <h3>Monstera Deliciosa</h3>
                    <p className="scientific-name">Swiss Cheese Plant</p>

                    <div className="plant-stats-list">
                        <div className="p-stat">
                            <span>Moisture Level</span>
                            <strong>{summary.sensors.soil_moisture.current}%</strong>
                        </div>
                        <div className="p-stat">
                            <span>Last Watered</span>
                            <strong>{summary.sensors.soil_moisture.current > 60 ? 'Today' : '2 days ago'}</strong>
                        </div>
                        <div className="p-stat">
                            <span>Recommended Watering</span>
                            <strong>{summary.ml.recommendation.split('.')[0]}</strong>
                        </div>
                    </div>

                    <div className="growth-progress">
                        <div className="progress-label">
                            <span>Plant Growth Progress</span>
                            <span>72%</span>
                        </div>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: '72%' }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom ROW: ML Predictions & Alerts */}
            <div className="dashboard-bottom-section">
                <div className="ml-predictions-grid glass-panel">
                    <h3>ML Predictions & Insights</h3>
                    <div className="ml-cards">
                        <div className="ml-insight-card">
                            <div className="ins-icon health">📈</div>
                            <div className="ins-info">
                                <label>Plant Health Status</label>
                                <strong>{summary.ml.status}</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon dryness">⏳</div>
                            <div className="ins-info">
                                <label>Soil Dryness Prediction</label>
                                <strong>Dry in 14 hours</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon water">💧</div>
                            <div className="ins-info">
                                <label>Watering Recommendation</label>
                                <strong>{summary.ml.recommendation}</strong>
                            </div>
                        </div>
                        <div className="ml-insight-card">
                            <div className="ins-icon light">☀️</div>
                            <div className="ins-info">
                                <label>Optimal Sunlight Suggestion</label>
                                <strong>Position is ideal</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="active-alerts-panel glass-panel">
                    <h3>Active Alerts</h3>
                    <div className="side-alerts-list">
                        {alerts.length > 0 ? alerts.map(alert => (
                            <div key={alert.id} className={`side-alert-item ${alert.severity}`}>
                                <div className="alt-icon">⚠️</div>
                                <div className="alt-content">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                        <strong>{alert.sensorId}</strong>
                                        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p>{alert.message}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="no-alerts-placeholder">All systems optimal ✅</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
