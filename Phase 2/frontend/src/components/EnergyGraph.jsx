import { useEffect, useRef } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

function EnergyGraph({ energy }) {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
    const hourlyData = energy.hourly_trend || Array(24).fill(0.1)

    const data = {
        labels: hours,
        datasets: [{
            label: 'Energy (kWh)',
            data: hourlyData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6
        }]
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 8
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(100, 100, 100, 0.1)' },
                ticks: {
                    color: 'var(--text-secondary)',
                    maxTicksLimit: 12
                }
            },
            y: {
                grid: { color: 'rgba(100, 100, 100, 0.1)' },
                ticks: { color: 'var(--text-secondary)' },
                beginAtZero: true
            }
        }
    }

    return (
        <div>
            <div style={{ height: '200px' }}>
                <Line data={data} options={options} />
            </div>

            <div className="energy-stats">
                <div className="energy-stat">
                    <div className="energy-value">{energy.daily_kwh?.toFixed(2) || '0.00'}</div>
                    <div className="energy-label">kWh Today</div>
                </div>
                <div className="energy-stat">
                    <div className="energy-value">₹{energy.cost?.toFixed(2) || '0.00'}</div>
                    <div className="energy-label">Cost Today</div>
                </div>
                <div className="energy-stat">
                    <div className="energy-value">₹{energy.cost_per_unit || 8}/unit</div>
                    <div className="energy-label">Rate</div>
                </div>
            </div>
        </div>
    )
}

export default EnergyGraph
