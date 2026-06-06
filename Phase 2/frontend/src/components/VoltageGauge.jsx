import { useEffect, useRef } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip)

function VoltageGauge({ voltage, status }) {
    const percentage = Math.min(100, (voltage / 280) * 100)

    const getColor = () => {
        if (status === 'fault') return '#ef4444'
        if (status === 'warning') return '#eab308'
        return '#22c55e'
    }


    const data = {
        datasets: [{
            data: [percentage, 100 - percentage],
            backgroundColor: [getColor(), 'rgba(100, 100, 100, 0.2)'],
            borderWidth: 0,
            cutout: '75%',
            rotation: -90,
            circumference: 180
        }]
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: { enabled: false }
        }
    }

    return (
        <div className="gauge-container">
            <Doughnut data={data} options={options} />
            <div style={{
                position: 'absolute',
                bottom: '30%',
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center'
            }}>
                <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: getColor()
                }}>
                    {voltage.toFixed(1)}V
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    0-280V Range
                </div>
            </div>
        </div>
    )
}

export default VoltageGauge
