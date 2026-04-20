import React, { useState, useEffect } from 'react';
import axios from 'axios';
import NeedleGaugeChart from './NeedleGaugeChart';

const MLPredictionPanel = ({ location }) => {
    const [prediction, setPrediction] = useState(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState(null);

    const fetchPrediction = async () => {
        try {
            const res = await axios.get(`http://localhost:5000/api/ml/${location}`);
            setPrediction(res.data);
            setLoading(false);
            setError(null);
        } catch (err) {
            console.error("Error fetching ML prediction:", err);
            setError("Failed to connect to Machine Learning service. Please ensure the backend and ML service are running.");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrediction();
        const interval = setInterval(fetchPrediction, 5000);
        return () => clearInterval(interval);
    }, [location]);

    if (loading && !prediction) {
        return <div className="card ml-card pulse" style={{ padding: '2rem', textAlign: 'center' }}>Loading AI Predictions...</div>;
    }

    if (error) {
        return (
            <div className="card ml-card" style={{ padding: '3rem', textAlign: 'center', borderColor: 'var(--danger)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                <h3 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>ML Service Unavailable</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
                <button
                    onClick={fetchPrediction}
                    style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    if (!prediction) return null;

    const { soilStatus, recommendation, severity, icon = "🌱" } = prediction;
    const currentMoisture = parseFloat(prediction.currentMoisture) || 0;
    const predictedMoisture = parseFloat(prediction.predictedMoisture) || 0;

    let statusColor = "#ef4444"; // Dry Red (danger)
    let statusBg = "rgba(239, 68, 68, 0.1)";
    if (soilStatus === "Optimal Health" || severity === "success" || severity === "info") {
        statusColor = "#10b981"; // Emerald Green
        statusBg = "rgba(16, 185, 129, 0.1)";
    }
    if (soilStatus === "Moderate Stress" || severity === "warning") {
        statusColor = "#f59e0b"; // Yellow Warning
        statusBg = "rgba(245, 158, 11, 0.1)";
    }

    // Determine gauge color based on predicted dryness
    const getGaugeColor = (val) => {
        if (val < 40) return "#ef4444"; // Red for danger/dry
        if (val < 60) return "#f59e0b"; // Yellow for moderate
        return "#10b981"; // Green for healthy
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', minHeight: '70vh', gridColumn: 'span 4' }}>

            {/* Top Row: Key Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', flex: 1 }}>

                {/* Current Moisture Card */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', padding: '3rem 2rem', border: '1px solid var(--glass-border)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>Current Moisture</p>
                    <div style={{ padding: '2rem 1rem 0 1rem' }}>
                        <NeedleGaugeChart value={currentMoisture} size={220} />
                    </div>
                </div>

                {/* Soil Health Card */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', padding: '3rem 2rem', border: '1px solid var(--glass-border)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2rem' }}>Soil Health</p>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', background: statusBg, border: `2px solid ${statusColor}`, color: statusColor, padding: '1.5rem', borderRadius: '24px', fontWeight: 700, fontSize: '1.5rem', boxShadow: `0 0 30px ${statusBg}`, textAlign: 'center', width: '100%' }}>
                        <span style={{ fontSize: '3rem', lineHeight: 1 }}>{icon}</span>
                        <span>{soilStatus}</span>
                    </div>
                </div>

                {/* Prediction Gauge Card */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--card-bg)', padding: '3rem 2rem', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3rem', textAlign: 'center' }}>Prediction (Next 3h)</p>

                    <div style={{ padding: '2rem 1rem 0 1rem' }}>
                        <NeedleGaugeChart value={predictedMoisture} size={220} />
                    </div>
                </div>

            </div>

            {/* Bottom Row: Recommendation Banner */}
            <div className="card" style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderLeft: '8px solid #34d399', padding: '3rem 4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h4 style={{ color: '#34d399', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Automated AI Action Plan</h4>
                    <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>💧 {recommendation}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Best Irrigation Window</div>
                    <div style={{ fontSize: '1.6rem', color: 'var(--accent-color)', fontWeight: 600 }}>6:00 AM – 8:00 AM or Evening</div>
                </div>
            </div>

        </div>
    );
};

export default MLPredictionPanel;
