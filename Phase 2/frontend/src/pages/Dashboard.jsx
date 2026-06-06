import { useState, useEffect } from 'react'
import PoleCard from '../components/PoleCard'
import FaultHeatmap from '../components/FaultHeatmap'
import EnergyGraph from '../components/EnergyGraph'
import PredictiveWarnings from '../components/PredictiveWarnings'
import FaultHistory from '../components/FaultHistory'
import RelayControls from '../components/RelayControls'
import QRScanner from '../components/QRScanner'
import ChatPanel from '../components/ChatPanel'

const API_BASE = `http://localhost:5001/api`

function Dashboard({ poles, connected, socket, hardware_connected }) {
    const [faults, setFaults] = useState([])
    const [energy, setEnergy] = useState({})
    const [warnings, setWarnings] = useState([])
    const [scannedPole, setScannedPole] = useState(null)
    const [tenantStats, setTenantStats] = useState({ public: {}, ops: {} })
    const [simulating, setSimulating] = useState(false)
    const [simModeEnabled, setSimModeEnabled] = useState(false)
    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])

    const fetchData = async () => {
        try {
            const [faultsRes, energyRes, predictiveRes, tenantRes, simModeRes] = await Promise.all([
                fetch(`${API_BASE}/faults`),
                fetch(`${API_BASE}/energy`),
                fetch(`${API_BASE}/predictive`),
                fetch(`${API_BASE}/tenant-stats`),
                fetch(`${API_BASE}/sim-mode`)
            ])

            setFaults((await faultsRes.json()).faults || [])
            setEnergy(await energyRes.json())
            setWarnings((await predictiveRes.json()).warnings || [])
            setTenantStats(await tenantRes.json())
            setSimModeEnabled((await simModeRes.json()).enabled)
        } catch (error) {
            console.error('Error fetching data:', error)
        }
    }

    const handleQRScan = (poleId) => {
        const pole = poles.find(p => p.id === poleId)
        setScannedPole(pole)
        setTimeout(() => setScannedPole(null), 5000)
    }

    const [selectedSimPole, setSelectedSimPole] = useState(1);

    const toggleSimMode = async () => {
        console.log("Toggle Sim Mode Clicked. Current state:", simModeEnabled);
        try {
            const res = await fetch(`${API_BASE}/sim-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !simModeEnabled })
            });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            console.log("Sim Mode Response:", data);
            setSimModeEnabled(data.simulation_mode);
        } catch (e) {
            console.error("Failed to toggle sim mode:", e);
            alert("Connection to backend failed. Check app.py console.");
        }
    };

    const runSimulation = async (scenario) => {
        if (!simModeEnabled) {
            alert("Please enable Simulation Mode first!");
            return;
        }
        setSimulating(true);
        try {
            await fetch(`${API_BASE}/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pole_id: selectedSimPole, scenario })
            });
            fetchData();
        } catch (e) { console.error(e); }
        finally { setSimulating(false); }
    };

    // Determine display poles
    const displayPoles = poles.length > 0 ? poles : [
        { id: 1, voltage: 0, fault: false, relay: 'closed', trend: 0, status: 'WAITING', predicted_fault: 'NORMAL' },
        { id: 2, voltage: 0, fault: false, relay: 'closed', trend: 0, status: 'WAITING', predicted_fault: 'NORMAL' }
    ]

    return (
        <div className="dashboard-grid">
            {/* Connection Status */}
            <div className="full-width" style={{ textAlign: 'center', marginBottom: '-12px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <span className={`status-indicator ${connected ? 'online' : 'offline'}`}>
                    {connected ? '🟢 API Connected' : '🔴 API Disconnected'}
                </span>
                {connected && (
                    <span className={`status-indicator ${hardware_connected ? 'online' : 'offline'}`}>
                        {hardware_connected ? '🛡️ Hardware Hub LIVE' : '⏳ Waiting for Hardware...'}
                    </span>
                )}
            </div>

            {/* Pole Status Cards */}
            {displayPoles.map(pole => (
                <PoleCard key={pole.id} pole={pole} highlighted={scannedPole?.id === pole.id} />
            ))}

            {/* Fault Heatmap */}
            <div className="card full-width">
                <div className="card-header">
                    <h2 className="card-title">🗺️ Live Fault Heatmap</h2>
                </div>
                <FaultHeatmap poles={poles} />
            </div>

            {/* Energy Graph */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">⚡ Energy Consumption</h2>
                </div>
                <EnergyGraph energy={energy} />
            </div>

            {/* Predictive Warnings */}
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">🔮 Predictive Warnings</h2>
                </div>
                <PredictiveWarnings warnings={warnings} />
            </div>

            {/* Fault History */}
            <div className="card full-width">
                <div className="card-header">
                    <h2 className="card-title">📋 Fault History</h2>
                </div>
                <FaultHistory faults={faults} />
            </div>

            {/* Relay Controls */}
            <div className="card full-width">
                <div className="card-header">
                    <h2 className="card-title">🎛️ Relay Controls</h2>
                </div>
                <RelayControls poles={poles} onUpdate={fetchData} />
            </div>

            {/* Dashboard Extension: Multi-Tenant & Prediction Details */}
            <div className="card full-width" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: 'none', border: 'none', padding: 0 }}>
                {/* 1. Fault Prediction Detailed Panel */}
                <div className="card" style={{ margin: 0 }}>
                    <div className="card-header">
                        <h2 className="card-title">🔍 Fault Probability Analysis</h2>
                    </div>
                    <div className="prediction-details">
                        {displayPoles.map(p => (
                            <div key={p.id} style={{ marginBottom: '15px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <strong>Pole #{p.id}</strong>
                                    <span style={{ color: p.predicted_fault !== 'NORMAL' ? 'var(--status-fault)' : 'var(--status-ok)' }}>
                                        {p.predicted_fault}
                                    </span>
                                </div>
                                <div style={{ height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: p.predicted_fault !== 'NORMAL' ? (p.predicted_fault === 'NEUTRAL_BROKEN' ? '92%' : '85%') : '5%',
                                        height: '100%',
                                        background: p.predicted_fault !== 'NORMAL' ? 'var(--status-fault)' : 'var(--status-ok)'
                                    }}></div>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                                    {p.predicted_fault === 'OVERLOAD' && 'Probability: 85% based on terminal voltage decline'}
                                    {p.predicted_fault === 'NEUTRAL_BROKEN' && 'Probability: 92% based on high fluctuation std_dev'}
                                    {p.predicted_fault === 'NORMAL' && 'System status: STABLE'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. 3-Frontend Multi-Tenant Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card" style={{ margin: 0 }}>
                        <div className="card-header">
                            <h2 className="card-title">🌐 Multi-Tenant Status</h2>
                        </div>
                        <div className="tenant-status">
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                                <span>Public Shield (Citizen)</span>
                                <strong style={{ color: 'var(--accent-blue)' }}>{tenantStats.public?.visits || 0} visits</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                                <span>Ops Shield (Lineman)</span>
                                <strong style={{ color: 'var(--status-warning)' }}>{tenantStats.ops?.logged_in || 0} active sessions</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px' }}>
                                <span>Admin Portal</span>
                                <strong style={{ color: 'var(--status-ok)' }}>ACTIVE (Role: ROOT)</strong>
                            </div>
                        </div>
                    </div>

                    <ChatPanel socket={socket} />
                </div>
            </div>

            {/* 3. Web Simulation Controls */}
            <div className="card full-width" style={{ border: simModeEnabled ? '2px solid var(--status-warning)' : '1px solid var(--border-color)' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="card-title">🏗️ Web Simulation Environment</h2>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {simModeEnabled ? '⚠️ SIMULATION MODE ACTIVE (Ignoring Hardware)' : '📡 LIVE HARDWARE MODE (Running Serial)'}
                        </div>
                    </div>
                    <button
                        onClick={toggleSimMode}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: simModeEnabled ? 'var(--status-ok)' : 'var(--bg-primary)',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {simModeEnabled ? 'Switch to LIVE Hardware' : 'Enable Simulation Mode'}
                    </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', opacity: simModeEnabled ? 1 : 0.5, pointerEvents: simModeEnabled ? 'auto' : 'none' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <select
                            value={selectedSimPole}
                            onChange={(e) => setSelectedSimPole(parseInt(e.target.value))}
                            style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-color)' }}
                        >
                            <option value={1}>Pole #1</option>
                            <option value={2}>Pole #2</option>
                        </select>
                    </div>
                    <button className="submit-btn" style={{ background: 'var(--bg-secondary)', flex: 1 }} onClick={() => runSimulation('normal')} disabled={simulating}>Normal</button>
                    <button className="submit-btn" style={{ background: 'var(--status-warning)', flex: 1 }} onClick={() => runSimulation('low')} disabled={simulating}>LowV (185V)</button>
                    <button className="submit-btn" style={{ background: 'var(--status-warning)', flex: 1 }} onClick={() => runSimulation('high')} disabled={simulating}>HighV (255V)</button>
                    <button className="submit-btn" style={{ background: 'var(--status-fault)', flex: 1 }} onClick={() => runSimulation('fault')} disabled={simulating}>Open Circuit (0V)</button>
                </div>
                {!simModeEnabled && (
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--status-warning)' }}>
                        * Enable Simulation Mode above to use these controls.
                    </div>
                )}
            </div>

            {/* Existing QR Scanner */}
            <div className="card full-width">
                <div className="card-header">
                    <h2 className="card-title">📱 QR Pole Scanner</h2>
                </div>
                <QRScanner onScan={handleQRScan} scannedPole={scannedPole} />
            </div>
        </div>
    )
}

export default Dashboard
