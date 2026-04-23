import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import NeedleGaugeChart from './NeedleGaugeChart';
import './MLPredictionPanel.css';

function IconSpark() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12 2l2.2 6.8h7.1l-5.7 4.1 2.2 6.8L12 17.6 6.2 19.7l2.2-6.8L2.7 8.8h7.1L12 2z"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinejoin="round"
                fill="rgba(52, 211, 153, 0.18)"
            />
        </svg>
    );
}

function IconDroplet() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12 21a7 7 0 0 0 4-12l-4-6-4 6a7 7 0 0 0 4 12Z"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinejoin="round"
                fill="rgba(56, 189, 248, 0.15)"
            />
        </svg>
    );
}

/** Map API strings to UI tier so "GREEN" / "Green" use correct colors */
function getSoilHealthPresentation(soilStatus, severity) {
    const raw = String(soilStatus || '').trim();
    const lower = raw.toLowerCase();

    const isGood =
        severity === 'success' ||
        severity === 'info' ||
        /optimal|green|healthy|good|fine|ok|adequate|sufficient/i.test(raw);
    const isWarn =
        severity === 'warning' || /moderate|yellow|stress|caution|watch|fair/i.test(raw);
    const isBad =
        severity === 'critical' ||
        severity === 'error' ||
        /dry|red|critical|poor|severe|low\s*moist|urgent/i.test(raw);

    let tier = 'neutral';
    if (isGood) tier = 'good';
    else if (isWarn) tier = 'warn';
    else if (isBad) tier = 'bad';

    const hints = {
        good: 'Within comfortable range for most crops',
        warn: 'Monitor closely and plan irrigation if trend continues',
        bad: 'Irrigation or soil check may be needed soon',
        neutral: 'Based on the latest model classification',
    };

    return {
        tier,
        displayStatus: raw || 'Unknown',
        hint: hints[tier],
    };
}

function healthStyleVars(tier) {
    if (tier === 'good') {
        return {
            '--ml-health-bg': 'rgba(16, 185, 129, 0.12)',
            '--ml-health-border': 'rgba(52, 211, 153, 0.35)',
            '--ml-health-text': '#d1fae5',
            '--ml-health-hint': 'rgba(209, 250, 229, 0.78)',
        };
    }
    if (tier === 'warn') {
        return {
            '--ml-health-bg': 'rgba(245, 158, 11, 0.1)',
            '--ml-health-border': 'rgba(251, 191, 36, 0.4)',
            '--ml-health-text': '#fde68a',
            '--ml-health-hint': 'rgba(254, 243, 199, 0.85)',
        };
    }
    if (tier === 'bad') {
        return {
            '--ml-health-bg': 'rgba(239, 68, 68, 0.1)',
            '--ml-health-border': 'rgba(248, 113, 113, 0.4)',
            '--ml-health-text': '#fecaca',
            '--ml-health-hint': 'rgba(254, 226, 226, 0.82)',
        };
    }
    return {
        '--ml-health-bg': 'rgba(148, 163, 184, 0.08)',
        '--ml-health-border': 'rgba(148, 163, 184, 0.25)',
        '--ml-health-text': '#e2e8f0',
        '--ml-health-hint': 'rgba(226, 232, 240, 0.7)',
    };
}

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
            console.error('Error fetching ML prediction:', err);
            setError('Could not reach the ML service. Start the Python service on port 5001 and try again.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrediction();
        const interval = setInterval(fetchPrediction, 5000);
        return () => clearInterval(interval);
    }, [location]);

    const health = useMemo(
        () => (prediction ? getSoilHealthPresentation(prediction.soilStatus, prediction.severity) : null),
        [prediction]
    );

    const healthVars = useMemo(() => (health ? healthStyleVars(health.tier) : {}), [health]);

    if (loading && !prediction) {
        return (
            <div className="ml-panel">
                <div className="ml-panel-state">
                    <div className="ml-panel-state__spinner" aria-hidden />
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Running irrigation model…</p>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'rgba(167, 243, 208, 0.85)', maxWidth: '28rem' }}>
                        Fetching moisture forecast and recommendation from the ML service.
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="ml-panel">
                <div className="ml-panel-state ml-panel-state--error">
                    <p style={{ fontWeight: 800, color: '#fecaca', margin: 0, fontSize: '1.15rem' }}>ML service unavailable</p>
                    <p style={{ margin: '0.75rem 0 0', color: 'rgba(226, 232, 240, 0.88)', maxWidth: '32rem', lineHeight: 1.55 }}>
                        {error}
                    </p>
                    <button type="button" className="ml-retry" onClick={fetchPrediction}>
                        Retry connection
                    </button>
                </div>
            </div>
        );
    }

    if (!prediction || !health) return null;

    const { recommendation, icon = '🌱' } = prediction;
    const currentMoisture = parseFloat(prediction.currentMoisture) || 0;
    const predictedMoisture = parseFloat(prediction.predictedMoisture) || 0;

    const gaugeSize = typeof window !== 'undefined' && window.innerWidth < 600 ? 180 : 210;

    return (
        <div className="ml-panel">
            <header className="ml-panel__hero">
                <div>
                    <p className="ml-panel__eyebrow">Machine learning</p>
                    <h2 className="ml-panel__title">
                        <span className="ml-panel__title-icon" aria-hidden>
                            <IconSpark />
                        </span>
                        Smart irrigation recommendations
                    </h2>
                    <p className="ml-panel__subtitle">
                        Live moisture readout, soil health label from the classifier, and a short-horizon moisture
                        forecast—combined into a single action-oriented summary.
                    </p>
                </div>
                <div className="ml-panel__badge">
                    <span className="ml-panel__badge-dot" aria-hidden />
                    {location} · refresh 5s
                </div>
            </header>

            <div className="ml-panel__metrics">
                <article
                    className="ml-metric-card"
                    style={{ '--ml-card-accent': 'linear-gradient(90deg, #34d399, #6ee7b7)' }}
                >
                    <p className="ml-metric-card__label">Current moisture</p>
                    <div className="ml-metric-card__body">
                        <div className="ml-metric-card__gauge-wrap">
                            <NeedleGaugeChart value={currentMoisture} size={gaugeSize} />
                        </div>
                    </div>
                </article>

                <article
                    className="ml-metric-card"
                    style={{ '--ml-card-accent': 'linear-gradient(90deg, #a78bfa, #818cf8)' }}
                >
                    <p className="ml-metric-card__label">Soil health</p>
                    <div className="ml-metric-card__body">
                        <div className="ml-health" style={healthVars}>
                            <div className="ml-health__icon" aria-hidden>
                                {icon}
                            </div>
                            <p className="ml-health__status">{health.displayStatus}</p>
                            <p className="ml-health__hint">{health.hint}</p>
                        </div>
                    </div>
                </article>

                <article
                    className="ml-metric-card"
                    style={{ '--ml-card-accent': 'linear-gradient(90deg, #38bdf8, #22d3ee)' }}
                >
                    <p className="ml-metric-card__label">Prediction · next 3h</p>
                    <div className="ml-metric-card__body">
                        <div className="ml-metric-card__gauge-wrap">
                            <NeedleGaugeChart value={predictedMoisture} size={gaugeSize} />
                        </div>
                    </div>
                </article>
            </div>

            <section className="ml-action" aria-labelledby="ml-action-heading">
                <div>
                    <p id="ml-action-heading" className="ml-action__eyebrow">
                        Automated AI action plan
                    </p>
                    <div className="ml-action__row">
                        <div className="ml-action__icon" aria-hidden>
                            <IconDroplet />
                        </div>
                        <p className="ml-action__text">{recommendation}</p>
                    </div>
                </div>
                <aside className="ml-action__aside">
                    <p className="ml-action__aside-label">Best irrigation window</p>
                    <p className="ml-action__aside-value">6:00 AM – 8:00 AM or evening</p>
                </aside>
            </section>
        </div>
    );
};

export default MLPredictionPanel;
