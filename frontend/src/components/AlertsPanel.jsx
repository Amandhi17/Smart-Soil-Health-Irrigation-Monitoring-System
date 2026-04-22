import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AlertsPanel = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/alerts');
            const filteredAlerts = res.data.filter(alert => alert.type !== 'Data Quality Alert');
            setAlerts(filteredAlerts);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching alerts:", err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 5000); // 5 sec refresh
        return () => clearInterval(interval);
    }, []);

    if (loading && alerts.length === 0) return <div className="alerts-loading">Loading alerts...</div>;

    const getAlertIcon = (severity) => {
        switch (severity) {
            case 'critical': return '🚨';
            case 'warning': return '⚠️';
            case 'moderate': return '⏳';
            default: return 'ℹ️';
        }
    };

    return (
        <div className="card alerts-card">
            <h3 className="card-title">System Status & Alerts</h3>
            <div className="alerts-list">
                {alerts.length === 0 ? (
                    <div className="no-alerts">
                        <div className="no-alerts-icon">🛡️</div>
                        <p>All systems are healthy. No active concerns.</p>
                    </div>
                ) : (
                    alerts.map(alert => (
                        <div key={alert.id} className={`alert-item ${alert.severity || 'info'}`}>
                            <div className="alert-icon">
                                {getAlertIcon(alert.severity)}
                            </div>
                            <div className="alert-content">
                                <div className="alert-header">
                                    <span className="alert-type-badge">{alert.type}</span>
                                    <span className="alert-time">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                                    {alert.type === 'Data Quality Alert' ? 'Data Quality' : 'Soil Classification'}
                                </div>
                                <div className="alert-message" style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.2rem' }}>{alert.type}</div>

                                <div style={{ margin: '1rem 0', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Action Plan</div>
                                    <div className="alert-recommendation" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{alert.message}</div>
                                </div>

                                <p className="alert-body" style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                                    Sensor <strong>{alert.sensorId}</strong> at {alert.location} reading: <strong>{alert.value}{alert.unit}</strong>.
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;
