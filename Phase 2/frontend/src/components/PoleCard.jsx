import VoltageGauge from './VoltageGauge'

function PoleCard({ pole, highlighted }) {
    const { id, voltage, fault, relay, trend, status: poleStatus } = pole

    const getStatus = () => {
        if (poleStatus === 'WAITING') return 'waiting'
        if (fault) return 'fault'
        if (voltage < 8) return 'fault'
        if (voltage < 10) return 'warning'
        return 'ok'
    }

    const status = getStatus()

    const getStatusText = () => {
        if (status === 'waiting') return '⚪ WAITING FOR DATA'
        if (fault) return '🔴 FAULT - Relay Open'
        if (status === 'warning') return '🟡 WARNING - Low Voltage'
        return '🟢 OK - Normal Operation'
    }

    return (
        <div
            className={`card pole-card ${highlighted ? 'highlighted' : ''}`}
            style={highlighted ? {
                boxShadow: '0 0 30px rgba(59, 130, 246, 0.5)',
                borderColor: '#3b82f6'
            } : {}}
        >
            <h2 className="card-title" style={{ marginBottom: '20px' }}>
                🏗️ Pole {id} Status
            </h2>

            <div className="pole-status">
                {/* Traffic Light */}
                <div className="traffic-light">
                    <div className={`light red ${status === 'fault' ? 'active blink' : ''}`} />
                    <div className={`light yellow ${status === 'warning' ? 'active' : ''}`} />
                    <div className={`light green ${status === 'ok' ? 'active' : ''}`} />
                </div>

                {/* Voltage Gauge */}
                <VoltageGauge voltage={voltage} status={status} />
            </div>

            {/* Voltage Display */}
            <div className="voltage-display">
                <span className="voltage-value">{voltage.toFixed(1)}</span>
                <span className="voltage-unit">V</span>

                {status !== 'waiting' && <div className={`voltage-trend ${trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : ''}`}>
                    {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
                    {Math.abs(trend).toFixed(2)}V/update
                </div>}
            </div>

            {/* Status Badge */}
            <div className={`status-badge status-${status}`} style={status === 'waiting' ? { border: '1px solid #666', color: '#888' } : {}}>
                {getStatusText()}
            </div>

            {/* Relay Status */}
            <div style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Relay: <strong style={{ textTransform: 'uppercase' }}>{relay}</strong>
            </div>

            {/* Fault Timer */}
            {status === 'fault' && (
                <div className="countdown-timer" style={{ marginTop: '8px' }}>
                    ⏳ Auto-isolation active
                </div>
            )}
        </div>
    )
}

export default PoleCard
