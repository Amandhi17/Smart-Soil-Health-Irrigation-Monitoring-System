import React, { useEffect, useState } from 'react';
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
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import StatsCard from './StatsCard';
import NeedleGaugeChart from './NeedleGaugeChart';

// Register Chart.js components
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

const TemporalAnalysisPanel = ({ location }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        try {
            const response = await axios.get(`http://localhost:5000/api/temporal/soil_moisture/${location}`);
            setData(response.data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching temporal data:", err);
            setError("Failed to fetch temporal data. Is the backend running?");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // 5 sec auto-update
        return () => clearInterval(interval);
    }, [location]);

    if (loading && !data) return <div className="loading pulse">Loading Temporal Analytics...</div>;
    if (error) return <div className="loading" style={{ color: 'var(--danger)' }}>{error}</div>;
    if (!data) return null;

    const chartData = {
        labels: data.rawData.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        datasets: [
            {
                label: 'Soil Moisture (%)',
                data: data.rawData.map(d => d.value),
                fill: true,
                borderColor: '#10b981', // Emerald green for agriculture
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                tension: 0.4,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverRadius: 6,
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { family: 'Outfit', size: 14 },
                bodyFont: { family: 'Outfit', size: 14 },
                padding: 12,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
            }
        }
    };

    return (
        <div className="stats-grid">
            <StatsCard label="Current" value={data.trend.latest} unit="%" color="#10b981" />
            <StatsCard label="Average (24h)" value={data.trend.avg} unit="%" color="#38bdf8" />
            <StatsCard label="Minimum" value={data.trend.min} unit="%" color="#f59e0b" />
            <StatsCard label="Maximum" value={data.trend.max} unit="%" color="#f43f5e" />

            <div className="card insight-card" style={{ gridColumn: '1 / -1', background: 'rgba(16, 185, 129, 0.1)', borderLeft: '4px solid #10b981' }}>
                <h3 className="card-title" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>💡</span> Farmer Insight
                </h3>
                <p style={{ fontSize: '1.1rem', marginTop: '10px', lineHeight: '1.5', color: '#e2e8f0' }}>
                    {data.trend.insight || "Collecting data to provide insights..."}
                </p>
            </div>

            <div className="card gauge-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h3 className="card-title">Current Condition</h3>
                <div style={{ padding: '2rem 1rem 0 1rem' }}>
                    <NeedleGaugeChart value={data.trend.latest} size={220} />
                </div>
            </div>

            <div className="card chart-container" style={{ gridColumn: 'span 3' }}>
                <h3 className="card-title">Temporal Trend (24h)</h3>
                <Line data={chartData} options={options} />
            </div>
        </div>
    );
};

export default TemporalAnalysisPanel;
