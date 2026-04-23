import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './AlertsPanel.css';

function severityBadgeLabel(severity) {
    switch (severity) {
        case 'critical':
            return 'Critical';
        case 'warning':
            return 'Warning';
        case 'moderate':
            return 'Moderate';
        case 'success':
            return 'Healthy';
        case 'info':
            return 'Info';
        default:
            return 'Alert';
    }
}

function categoryLabel(alert) {
    if (alert.type === 'Statistical anomaly') return 'Statistical outliers (z-score / MAD)';
    if (alert.type === 'Data Quality Alert') return 'Data quality';
    if (alert.type === 'Connectivity') return 'Connectivity';
    return 'Soil classification';
}

function formatCompositeScore(alert) {
    const raw = alert.anomalyScore ?? alert.value;
    const s = Number(raw);
    if (!Number.isFinite(s)) return '—';
    if (Math.abs(s) >= 1e6) return s.toExponential(2);
    return s.toFixed(2);
}

function formatFooterLine(alert) {
    if (alert.type === 'Statistical anomaly') {
        const score = formatCompositeScore(alert);
        const loc = alert.location || '—';
        return (
            <>
                <strong>Rolling model</strong> (z-score / MAD) · composite score <strong>{score}</strong> ·{' '}
                <strong>{loc}</strong>
            </>
        );
    }
    const unit = alert.unit != null && alert.unit !== '' ? ` ${alert.unit}` : '';
    return (
        <>
            Sensor <strong>{alert.sensorId || '—'}</strong> · <strong>{alert.location || '—'}</strong> · reading{' '}
            <strong>
                {alert.value}
                {unit}
            </strong>
        </>
    );
}

const AlertsPanel = ({ location = 'ESP32_Plant_01' }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAlerts = useCallback(
        async (showLoading = false) => {
            if (showLoading) setLoading(true);
            try {
                const res = await axios.get('http://localhost:5000/api/alerts', {
                    params: { location },
                });
                const filteredAlerts = (res.data || []).filter((a) => a.type !== 'Data Quality Alert');
                setAlerts(filteredAlerts);
                setError(null);
            } catch (err) {
                console.error('Error fetching alerts:', err);
                if (showLoading) {
                    setError('Could not load alerts. Is the backend running?');
                }
            } finally {
                if (showLoading) setLoading(false);
            }
        },
        [location]
    );

    useEffect(() => {
        fetchAlerts(true);
        const interval = setInterval(() => fetchAlerts(false), 5000);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    const getAlertIcon = (severity) => {
        switch (severity) {
            case 'critical':
                return '🚨';
            case 'warning':
                return '⚠️';
            case 'moderate':
                return '⏳';
            case 'success':
                return '✅';
            default:
                return 'ℹ️';
        }
    };

    const itemClassName = (alert) => {
        const sev = alert.severity || 'info';
        const classes = ['alert-item', sev];
        if (sev === 'success' || (/healthy|optimal|good/i.test(String(alert.type)) && sev === 'info')) {
            classes.push('success');
        }
        return classes.join(' ');
    };

    if (loading && alerts.length === 0) {
        return (
            <div className="card alerts-card alerts-pro">
                <div className="alerts-pro-loading">
                    <div className="alerts-pro-loading__spinner" aria-hidden />
                    <p style={{ margin: 0, fontWeight: 700, color: '#ecfdf5' }}>Loading alerts…</p>
                </div>
            </div>
        );
    }

    if (error && alerts.length === 0) {
        return (
            <div className="card alerts-card alerts-pro">
                <div className="alerts-pro-loading" style={{ borderColor: 'rgba(248,113,113,0.35)' }}>
                    <p style={{ margin: 0, fontWeight: 800, color: '#fecaca' }}>{error}</p>
                    <button type="button" className="alerts-pro-retry" onClick={() => fetchAlerts(true)}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="card alerts-card alerts-pro">
            <header className="alerts-pro__hero">
                <div>
                    <p className="alerts-pro__eyebrow">Operations center</p>
                    <h2 className="alerts-pro__title">System status &amp; alerts</h2>
                    <p className="alerts-pro__lead">
                        Live feed from classification, connectivity checks, and statistical anomaly detection. Data
                        quality notices are filtered from this list.
                    </p>
                </div>
                <div className="alerts-pro__meta">
                    <span className="alerts-pro__pill">
                        Device <strong>{location}</strong>
                    </span>
                    <span className="alerts-pro__pill">Refresh · 5s</span>
                </div>
            </header>

            <div className="alerts-list">
                {alerts.length === 0 ? (
                    <div className="no-alerts">
                        <div className="no-alerts-icon" aria-hidden>
                            🛡️
                        </div>
                        <p>All clear — no active alerts for this device.</p>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div key={alert.id} className={itemClassName(alert)}>
                            <div className="alert-icon" aria-hidden>
                                {getAlertIcon(alert.severity)}
                            </div>
                            <div className="alert-content">
                                <div className="alert-header">
                                    <span className="alert-type-badge">{severityBadgeLabel(alert.severity)}</span>
                                    <time className="alert-time" dateTime={alert.timestamp}>
                                        {new Date(alert.timestamp).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                        })}
                                    </time>
                                </div>
                                <p className="alerts-pro__category">{categoryLabel(alert)}</p>
                                <h3 className="alerts-pro__headline">{alert.type}</h3>

                                <div className="alerts-pro__plan">
                                    <p className="alerts-pro__plan-label">Action plan</p>
                                    <p className="alerts-pro__plan-body">{alert.message}</p>
                                </div>

                                <p className="alerts-pro__foot">{formatFooterLine(alert)}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AlertsPanel;
