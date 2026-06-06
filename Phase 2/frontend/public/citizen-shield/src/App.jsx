import { useState, useEffect } from 'react'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const API_BASE = `http://localhost:5001/api`;

function App() {
    const [poles, setPoles] = useState([]);
    const [countdown, setCountdown] = useState(10);
    const [outageTime, setOutageTime] = useState({ h: 0, m: 0, s: 0 });

    const anyFault = poles.some(p => p.fault);
    const anyMaintenance = poles.some(p => p.relay === 'open');
    const displayPoles = [...poles];
    while (displayPoles.length < 4) {
        const id = displayPoles.length + 1;
        displayPoles.push({ id, voltage: 0, status: 'PLANNED', fault: false, mock: true });
    }

    const fetchData = async () => {
        try {
            const res = await fetch(`${API_BASE}/public/poles`);
            const data = await res.json();
            setPoles(data);
            setCountdown(10);
        } catch (e) {
            console.error("Failed to fetch poles", e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    fetchData();
                    return 10;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Outage timer only runs when there is an active fault
    useEffect(() => {
        let outageInterval;
        if (anyFault) {
            outageInterval = setInterval(() => {
                setOutageTime(prev => {
                    let ns = prev.s + 1;
                    let nm = prev.m;
                    let nh = prev.h;
                    if (ns >= 60) { ns = 0; nm += 1; }
                    if (nm >= 60) { nm = 0; nh += 1; }
                    return { h: nh, m: nm, s: ns };
                });
            }, 1000);
        } else {
            // Reset timer when lines are stable
            setOutageTime({ h: 0, m: 0, s: 0 });
        }
        return () => clearInterval(outageInterval);
    }, [anyFault]);

    const getStatusColor = (pole) => {
        if (pole.fault) return 'var(--status-fault)';
        if (pole.voltage < 200) return 'var(--status-warning)';
        return 'var(--status-ok)';
    };

    const chartData = {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [
            {
                label: 'Voltage (V)',
                data: Array.from({ length: 24 }, () => 218 + Math.random() * 4),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                tension: 0.4,
            },
        ],
    };

    return (
        <div className="container">
            <header className="citizen-header">
                <h1>⚡ SHIELD Citizen Power Status</h1>
                <p>Real-time community power monitoring</p>
            </header>

            <main>
                <div className="poles-grid">
                    {displayPoles.map((pole) => (
                        <div key={pole.id} className="pole-card">
                            <div className="pole-id">Pole {pole.id}</div>
                            <div className="pole-voltage" style={{ color: getStatusColor(pole) }}>
                                {pole.mock ? '---' : `${pole.voltage.toFixed(1)}V`}
                            </div>
                            <div className="pole-status">
                                <span className="status-dot" style={{ backgroundColor: getStatusColor(pole) }}></span>
                                {pole.mock ? 'PLANNED' : (pole.fault ? 'OFFLINE' : 'NORMAL')}
                            </div>
                        </div>
                    ))}
                </div>

                {(anyFault || anyMaintenance) && (
                    <div className="timer-section">
                        <div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                {anyMaintenance ? '⚙️ Maintenance Status' : 'Current Outage Duration'}
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {anyMaintenance ? 'System Offline for Maintenance' : `${outageTime.h}h ${outageTime.m}m ${outageTime.s}s ⏱️`}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Expected Restore</div>
                            <div style={{ fontSize: '1.2rem', color: 'var(--status-warning)' }}>~30 mins</div>
                        </div>
                    </div>
                )}

                {!anyFault && !anyMaintenance && (
                    <div className="timer-section" style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'var(--status-ok)' }}>
                        <div style={{ color: 'var(--status-ok)', fontWeight: 'bold' }}>✅ All lines stable. No scheduled maintenance.</div>
                    </div>
                )}

                <div className="graph-section">
                    <h3 style={{ marginBottom: '15px' }}>Voltage History (Last 24h)</h3>
                    <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                </div>

                <a href="https://wa.me/yournumber" className="whatsapp-btn">
                    Get Instant WhatsApp Alerts →
                </a>

                <div className="refresh-indicator">
                    Auto-refreshing in {countdown}s...
                </div>
            </main>
        </div>
    )
}

export default App
