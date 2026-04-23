import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import './CorrelationPanel.css';

function formatR(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toFixed(2);
}

const CorrelationPanel = ({ location }) => {
    const [sunlight, setSunlight] = useState(0);
    const [temp, setTemp] = useState(0);
    const [moisture, setMoisture] = useState(0);
    const [dryingSpeed, setDryingSpeed] = useState('Moderate');
    const [sunlightMoistureCorr, setSunlightMoistureCorr] = useState(null);
    const [tempMoistureCorr, setTempMoistureCorr] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = useCallback(
        async (showSpinner) => {
            if (showSpinner) setLoading(true);
            try {
                const [lightRes, tempRes, moistRes, corrRes] = await Promise.all([
                    axios.get(`http://localhost:5000/api/temporal/light_lux/${location}`),
                    axios.get(`http://localhost:5000/api/temporal/temperature/${location}`),
                    axios.get(`http://localhost:5000/api/temporal/soil_moisture/${location}`),
                    axios.get(`http://localhost:5000/api/correlation/${location}`).catch(() => ({ data: {} })),
                ]);

                const s = lightRes.data.trend?.latest || 0;
                const t = tempRes.data.trend?.latest || 0;
                const m = moistRes.data.trend?.latest || 0;

                const moistRaw = moistRes.data.rawData || [];
                let dry = 'Moderate';
                if (moistRaw.length >= 2) {
                    const recent = moistRaw.slice(-3).map((x) => x.value);
                    const drop = recent[0] - recent[recent.length - 1];
                    if (drop > 5) dry = 'Fast';
                    else if (drop < -2) dry = 'Slow';
                }

                setSunlight(s);
                setTemp(t);
                setMoisture(m);
                setDryingSpeed(dry);
                setSunlightMoistureCorr(
                    corrRes.data?.sunlightMoistureCorr !== undefined ? corrRes.data.sunlightMoistureCorr : null
                );
                setTempMoistureCorr(corrRes.data?.tempMoistureCorr !== undefined ? corrRes.data.tempMoistureCorr : null);
                setError(null);
            } catch (err) {
                console.error('Correlation panel fetch error:', err);
                if (showSpinner) {
                    setError('Could not load environmental data. Check that the backend is running.');
                }
            } finally {
                if (showSpinner) setLoading(false);
            }
        },
        [location]
    );

    useEffect(() => {
        loadData(true);
        const interval = setInterval(() => loadData(false), 5000);
        return () => clearInterval(interval);
    }, [loadData]);

    /** Lux scaled to 0–100 for bar (typical bright day ~80k) */
    const sunMeterPct = Math.min(100, Math.max(0, (Number(sunlight) / 80000) * 100));

    const sunLevel = useMemo(() => {
        if (sunMeterPct >= 50) return 'High';
        if (sunMeterPct >= 12) return 'Moderate';
        return 'Low';
    }, [sunMeterPct]);

    const tempBand = useMemo(() => {
        if (temp >= 30) return { key: 'hot', label: 'Hot', pill: 'corr-pill--hot' };
        if (temp >= 24) return { key: 'warm', label: 'Warm', pill: 'corr-pill--warm' };
        return { key: 'cool', label: 'Cool', pill: 'corr-pill--cool' };
    }, [temp]);

    const dryBand = useMemo(() => {
        if (dryingSpeed === 'Fast') return { label: 'Fast drying', pill: 'corr-pill--dry-fast' };
        if (dryingSpeed === 'Slow') return { label: 'Slow drying', pill: 'corr-pill--dry-slow' };
        return { label: 'Moderate', pill: 'corr-pill--dry-mod' };
    }, [dryingSpeed]);

    const smartBody = useMemo(() => {
        if (temp >= 30 && sunLevel === 'High') {
            return 'High temperature and strong sunlight are increasing evaporation and drying the soil profile more quickly than average.';
        }
        return 'Current environmental factors are supporting relatively steady soil hydration. Continue monitoring if weather shifts.';
    }, [temp, sunLevel]);

    if (loading) {
        return (
            <div className="corr-pro">
                <div className="corr-pro-state">
                    <div className="corr-pro-state__spinner" aria-hidden />
                    <p style={{ margin: 0, fontWeight: 700, color: '#fefce8' }}>Loading correlation insights…</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(226, 232, 240, 0.8)' }}>
                        Merging live readings with 24h correlation coefficients
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="corr-pro">
                <div className="corr-pro-state">
                    <p style={{ margin: 0, fontWeight: 800, color: '#fecaca' }}>Unable to load</p>
                    <p style={{ margin: '0.5rem 0 0', color: 'rgba(226, 232, 240, 0.88)', maxWidth: '28rem' }}>{error}</p>
                    <button type="button" className="corr-retry" onClick={() => loadData(true)}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="corr-pro">
            <header className="corr-pro__hero">
                <div>
                    <p className="corr-pro__eyebrow">Multivariate context</p>
                    <h2 className="corr-pro__title">Weather impact on soil</h2>
                    <p className="corr-pro__lead">
                        Live light, temperature, and moisture readings—paired with simple heuristics and 24-hour Pearson
                        correlations vs moisture where data allows.
                    </p>
                </div>
                <div className="corr-pro__badge">
                    <span className="corr-pro__badge-dot" aria-hidden />
                    {location} · refresh 5s
                </div>
            </header>

            <p className="corr-pro__section-title">Environmental drivers</p>
            <div className="corr-pro__grid">
                <article className="corr-impact" style={{ ['--corr-accent']: '#fbbf24' }}>
                    <div className="corr-impact__head">
                        <span className="corr-impact__icon" aria-hidden>
                            ☀️
                        </span>
                        <h3 className="corr-impact__name">Sunlight</h3>
                    </div>
                    <div className="corr-meter">
                        <div className="corr-meter__row">
                            <span>Relative intensity (scaled)</span>
                            <strong>{sunLevel}</strong>
                        </div>
                        <div className="corr-meter__track" aria-hidden>
                            <div className="corr-meter__fill" style={{ width: `${sunMeterPct}%` }} />
                        </div>
                    </div>
                    <div className="corr-foot">
                        <span className="corr-foot__label">Effect on soil</span>
                        {sunLevel === 'High'
                            ? 'Strong light increases surface drying; shade or mulch can slow moisture loss.'
                            : 'Lower apparent light levels correlate with slower surface drying under typical greenhouse conditions.'}
                        {sunlightMoistureCorr != null && (
                            <div className="corr-coeff">
                                24h light ↔ moisture correlation: <strong>{formatR(sunlightMoistureCorr)}</strong> (Pearson,
                                same-length window)
                            </div>
                        )}
                    </div>
                </article>

                <article className="corr-impact" style={{ ['--corr-accent']: temp >= 30 ? '#f87171' : temp >= 24 ? '#fbbf24' : '#4ade80' }}>
                    <div className="corr-impact__head">
                        <span className="corr-impact__icon" aria-hidden>
                            🌡️
                        </span>
                        <h3 className="corr-impact__name">Temperature</h3>
                    </div>
                    <div className="corr-stat-row">
                        <span className={`corr-pill ${tempBand.pill}`}>{tempBand.label}</span>
                        <strong>{Number(temp).toFixed(1)}°C</strong>
                    </div>
                    <div className="corr-foot">
                        <span className="corr-foot__label">Effect on soil</span>
                        {temp >= 30
                            ? 'Elevated temperature accelerates evaporation from soil and leaves.'
                            : 'Cooler air temperatures generally reduce instantaneous evaporation demand on the root zone.'}
                        {tempMoistureCorr != null && (
                            <div className="corr-coeff">
                                24h temp ↔ moisture correlation: <strong>{formatR(tempMoistureCorr)}</strong>
                            </div>
                        )}
                    </div>
                </article>

                <article className="corr-impact" style={{ ['--corr-accent']: dryingSpeed === 'Fast' ? '#f87171' : dryingSpeed === 'Slow' ? '#4ade80' : '#fbbf24' }}>
                    <div className="corr-impact__head">
                        <span className="corr-impact__icon" aria-hidden>
                            💧
                        </span>
                        <h3 className="corr-impact__name">Moisture dynamics</h3>
                    </div>
                    <div className="corr-stat-row">
                        <span>Current moisture</span>
                        <strong>{Number(moisture).toFixed(1)}%</strong>
                    </div>
                    <div style={{ marginTop: '0.25rem' }}>
                        <span className={`corr-pill ${dryBand.pill}`}>{dryBand.label}</span>
                    </div>
                    <div className="corr-foot">
                        <span className="corr-foot__label">Effect on soil</span>
                        {dryingSpeed === 'Fast' && 'Recent points show a brisk downward moisture trend—confirm irrigation timing.'}
                        {dryingSpeed === 'Slow' && 'Moisture is holding or recovering in the recent window.'}
                        {dryingSpeed === 'Moderate' && 'Moisture change rate is within a typical band for this crop profile.'}
                    </div>
                </article>
            </div>

            <section className="corr-advice" aria-labelledby="corr-advice-title">
                <div className="corr-advice__head">
                    <span className="corr-advice__icon" aria-hidden>
                        🌱
                    </span>
                    <h3 id="corr-advice-title" className="corr-advice__title">
                        Smart advice
                    </h3>
                </div>
                <p className="corr-advice__body">{smartBody}</p>
                <div className="corr-advice__cta">
                    <p className="corr-advice__cta-label">Recommended irrigation window</p>
                    <p className="corr-advice__cta-value">Early morning or evening</p>
                </div>
            </section>
        </div>
    );
};

export default CorrelationPanel;
