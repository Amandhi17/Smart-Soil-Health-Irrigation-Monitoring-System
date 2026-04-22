import React, { useEffect, useState } from 'react';
import axios from 'axios';

const CorrelationPanel = ({ location }) => {
    const [data, setData] = useState({
        sunlight: 0,
        temp: 0,
        moisture: 0,
        dryingSpeed: "Moderate",
        loading: true
    });

    const fetchData = async () => {
        try {
            const [lightRes, tempRes, moistRes] = await Promise.all([
                axios.get(`http://localhost:5000/api/temporal/light_lux/${location}`),
                axios.get(`http://localhost:5000/api/temporal/temperature/${location}`),
                axios.get(`http://localhost:5000/api/temporal/soil_moisture/${location}`)
            ]);

            const sunlight = lightRes.data.trend?.latest || 0;
            const temp = tempRes.data.trend?.latest || 0;
            const moisture = moistRes.data.trend?.latest || 0;

            // Calculate drying speed using basic heuristic on recent data
            const moistRaw = moistRes.data.rawData || [];
            let dryingSpeed = "Moderate";
            if (moistRaw.length >= 2) {
                // simple drop rate evaluation on last 3 elements
                const recent = moistRaw.slice(-3).map(xyz => xyz.value);
                const drop = recent[0] - recent[recent.length - 1]; // diff between 3-hours ago and now
                if (drop > 5) dryingSpeed = "Fast";
                else if (drop < -2) dryingSpeed = "Slow"; // actually gaining
            }

            setData({ sunlight, temp, moisture, dryingSpeed, loading: false });
        } catch (err) {
            console.error("Error fetching simple correlation data:", err);
            setData(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [location]);

    if (data.loading) {
        return <div className="card correlation-card pulse">Loading Weather Impacts...</div>;
    }

    const { sunlight, temp, moisture, dryingSpeed } = data;

    // Logic for indicators
    const sunLevel = sunlight > 80 ? "High" : (sunlight > 40 ? "Moderate" : "Low");
    const sunPercent = Math.min(100, Math.max(0, sunlight)); // assuming max 100 for UI scale

    let tempIndicator = "🟢 Cool";
    let tempColor = "#22c55e"; // green
    if (temp >= 30) {
        tempIndicator = "🔴 Hot";
        tempColor = "#ef4444"; // red
    } else if (temp >= 24) {
        tempIndicator = "🟡 Warm";
        tempColor = "#f59e0b"; // yellow
    }

    let moistIndicator = "🟡 Moderate";
    let moistColor = "#f59e0b";
    if (dryingSpeed === "Fast") {
        moistIndicator = "🔴 Fast";
        moistColor = "#ef4444";
    } else if (dryingSpeed === "Slow") {
        moistIndicator = "🟢 Slow";
        moistColor = "#22c55e";
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', gridColumn: 'span 4' }}>
            {/* Top Header */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Weather Impact on Soil
                </h3>
            </div>

            {/* Impact Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

                {/* Sunlight Impact */}
                <div className="card" style={{ background: 'var(--card-bg)', padding: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.3)', borderTop: '4px solid #f59e0b' }}>
                    <h4 style={{ color: '#f59e0b', fontSize: '1.1rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ☀️ Sunlight Impact
                    </h4>
                    <div style={{ marginBottom: '1.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: '#cbd5e1' }}>Sunlight Level</span>
                            <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{sunLevel}</span>
                        </div>
                        <div style={{ height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${sunPercent}%`, background: '#f59e0b', borderRadius: '8px' }}></div>
                        </div>
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#94a3b8', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Effect on Soil:</span>
                        {sunLevel === "High" ? "High sunlight dries the soil faster." : "Lower sunlight helps preserve soil moisture."}
                    </div>
                </div>

                {/* Temperature Impact */}
                <div className="card" style={{ background: 'var(--card-bg)', padding: '1.5rem', border: `1px solid ${tempColor}40`, borderTop: `4px solid ${tempColor}` }}>
                    <h4 style={{ color: tempColor, fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🌡 Temperature Impact
                    </h4>
                    <div style={{ marginBottom: '1rem', fontSize: '1.8rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {tempIndicator} <span style={{ fontSize: '1.2rem', color: '#cbd5e1', fontWeight: 'normal' }}>({temp}°C)</span>
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#94a3b8', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', marginTop: 'auto' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Effect on Soil:</span>
                        {temp >= 30 ? "High temperature increases soil drying." : "Cooler temperatures prevent rapid evaporation."}
                    </div>
                </div>

                {/* Moisture Loss */}
                <div className="card" style={{ background: 'var(--card-bg)', padding: '1.5rem', border: `1px solid ${moistColor}40`, borderTop: `4px solid ${moistColor}` }}>
                    <h4 style={{ color: moistColor, fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        💧 Soil Moisture Loss
                    </h4>
                    <div style={{ marginBottom: '0.8rem', color: '#cbd5e1', fontSize: '1.05rem' }}>
                        Current Moisture: <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{moisture}%</span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        {moistIndicator}
                    </div>
                </div>

            </div>

            {/* Smart Advice Panel */}
            <div className="card" style={{ background: 'rgba(52, 211, 153, 0.1)', padding: '2rem', border: '1px solid rgba(52, 211, 153, 0.3)', borderLeft: '8px solid #34d399', marginTop: '0.5rem' }}>
                <h4 style={{ color: '#34d399', fontSize: '1.3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🌱 Smart Advice
                </h4>
                <p style={{ color: '#f8fafc', fontSize: '1.15rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                    {temp >= 30 && sunlight > 60
                        ? "High temperature and strong sunlight are drying the soil quickly."
                        : "Current environmental factors are maintaining steady soil hydration."}
                </p>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Recommended Irrigation Time
                    </div>
                    <div style={{ color: '#34d399', fontSize: '1.4rem', fontWeight: 'bold' }}>
                        Early morning or evening.
                    </div>
                </div>
            </div>

        </div>
    );
};

export default CorrelationPanel;
