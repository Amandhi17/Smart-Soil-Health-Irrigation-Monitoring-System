import React from 'react';

const StatsCard = ({ label, value, unit, color }) => {
    return (
        <div className="card stats-card">
            <span className="label">{label}</span>
            <div className="value" style={{ color: color || 'var(--accent-color)' }}>
                {typeof value === 'number' ? value.toFixed(1) : value}
                <span className="unit">{unit}</span>
            </div>
        </div>
    );
};

export default StatsCard;
