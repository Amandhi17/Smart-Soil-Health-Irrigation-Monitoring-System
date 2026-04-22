import React from 'react';

const NeedleGaugeChart = ({ value = 0, size = 220 }) => {
    // Clamp value between 0 and 100
    const clampedValue = Math.max(0, Math.min(100, value));

    const radius = size / 2 - 20;
    const cx = size / 2;
    const cy = size / 2;

    // Calculate rotation for needle (-90 to +90 degrees representing 0-100%)
    const rotation = -90 + (clampedValue / 100) * 180;

    // Angle calculations (0 to 180 standard circle from bottom up)
    // Let's divide 180 into 3 sections: 60 degrees each.
    // Red: 0 to 60 deg
    // Yellow: 60 to 120 deg
    // Green: 120 to 180 deg
    const cos60 = Math.cos(Math.PI / 180 * 60);
    const sin60 = Math.sin(Math.PI / 180 * 60);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: cy + 50 }}>
            <svg width={size} height={cy} viewBox={`0 0 ${size} ${cy}`} style={{ overflow: 'visible' }}>
                {/* Background Arcs */}
                <path
                    d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx - radius * cos60} ${cy - radius * sin60}`}
                    fill="none" stroke="#ef4444" strokeWidth="20" strokeLinecap="round"
                />
                <path
                    d={`M ${cx - radius * cos60} ${cy - radius * sin60} A ${radius} ${radius} 0 0 1 ${cx + radius * cos60} ${cy - radius * sin60}`}
                    fill="none" stroke="#f59e0b" strokeWidth="20"
                />
                <path
                    d={`M ${cx + radius * cos60} ${cy - radius * sin60} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                    fill="none" stroke="#10b981" strokeWidth="20" strokeLinecap="round"
                />

                {/* Needle */}
                <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                    <polygon points={`${cx - 5},${cy} ${cx + 5},${cy} ${cx},${cy - radius + 15}`} fill="#f8fafc" />
                    <circle cx={cx} cy={cy} r="10" fill="#f8fafc" />
                </g>
            </svg>
            <div style={{ marginTop: '1.2rem', textAlign: 'center' }}>
                <span style={{ color: '#f8fafc', fontSize: '1.8rem', fontWeight: 'bold' }}>
                    {clampedValue.toFixed(1)}%
                </span>
            </div>
        </div>
    );
};

export default NeedleGaugeChart;
