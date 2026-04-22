import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const GaugeChart = ({ value, min = 0, max = 100, label }) => {
    // Ensure value is within bounds
    const clampedValue = Math.max(min, Math.min(max, value));
    const remaining = max - clampedValue;

    const data = {
        datasets: [
            {
                data: [clampedValue, remaining],
                backgroundColor: [
                    '#38bdf8', // Accent color
                    'rgba(255, 255, 255, 0.05)', // Background track
                ],
                borderWidth: 0,
                circumference: 180,
                rotation: 270,
                cutout: '80%',
                borderRadius: 10,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
        },
    };

    return (
        <div className="gauge-container">
            <div className="gauge-chart-wrapper">
                <Doughnut data={data} options={options} />
                <div className="gauge-center-text">
                    <span className="gauge-value">{value.toFixed(1)}%</span>
                    <span className="gauge-label">{label}</span>
                </div>
            </div>
        </div>
    );
};

export default GaugeChart;
