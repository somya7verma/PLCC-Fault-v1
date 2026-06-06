import { useState, useEffect } from 'react'

const API_BASE = `http://${window.location.hostname}:5001/api`

function RelayControls({ poles, onUpdate }) {
    const [loading, setLoading] = useState({})
    const [cooldowns, setCooldowns] = useState({}) // { poleId: { action, seconds } }
    const [error, setError] = useState(null)

    useEffect(() => {
        const interval = setInterval(() => {
            setCooldowns(prev => {
                const next = { ...prev }
                let changed = false
                Object.keys(next).forEach(id => {
                    if (next[id].seconds > 1) {
                        next[id] = { ...next[id], seconds: next[id].seconds - 1 }
                        changed = true
                    } else {
                        delete next[id]
                        changed = true
                    }
                })
                return changed ? next : prev
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const handleRelayAction = async (poleId, action) => {
        if (cooldowns[poleId]) return

        const key = `${poleId}-${action}`
        setLoading(prev => ({ ...prev, [key]: true }))
        setError(null)

        try {
            const res = await fetch(`${API_BASE}/relay/${poleId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            })

            if (res.ok) {
                setCooldowns(prev => ({
                    ...prev,
                    [poleId]: { action, seconds: 10 }
                }))
                onUpdate?.()
            } else {
                const data = await res.json().catch(() => ({}))
                setError(`Failed: ${data.error || res.statusText}`)
            }
        }finally {
            setLoading(prev => ({ ...prev, [key]: false }))
        }
    }

    const handleResetAll = async () => {
        if (Object.keys(cooldowns).length > 0) return

        setLoading(prev => ({ ...prev, 'all': true }))
        setError(null)

        try {
            const res = await fetch(`${API_BASE}/reset-all`, { method: 'POST' })
            if (res.ok) {
                setCooldowns({
                    1: { action: 'reset', seconds: 10 },
                    2: { action: 'reset', seconds: 10 },
                    'all': { action: 'reset', seconds: 10 }
                })
                onUpdate?.()
            } else {
                setError('Failed to reset all poles')
            }
        } catch (e) {
            setError(`Connection Error: ${e.message}`)
        } finally {
            setLoading(prev => ({ ...prev, 'all': false }))
        }
    }

    const displayPoles = poles.length > 0 ? poles : [{ id: 1, relay: 'closed' }, { id: 2, relay: 'closed' }]

    const renderButton = (poleId, action, label, emoji) => {
        const isCooldown = cooldowns[poleId]?.action === action
        const isLoading = loading[`${poleId}-${action}`]
        const isAnyCooldown = !!cooldowns[poleId]

        return (
            <button
                className={`relay-btn ${action}`}
                onClick={() => handleRelayAction(poleId, action)}
                disabled={isAnyCooldown || isLoading}
            >
                {(isLoading || isCooldown) ? <span className="spinner" /> : emoji}
                {label}
                {isCooldown && <span className="btn-countdown">({cooldowns[poleId].seconds}s)</span>}
            </button>
        )
    }

    return (
        <div className="relay-controls">
            {error && <div className="error-message" style={{ color: 'var(--status-fault)', textAlign: 'center', marginBottom: '15px', fontSize: '0.9rem' }}>⚠️ {error}</div>}

            {displayPoles.map(pole => (
                <div key={pole.id} className="relay-group">
                    <div className="relay-title">
                        🏗️ Pole {pole.id}
                        <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: pole.relay === 'closed' ? 'var(--status-ok)' : 'var(--status-fault)' }}>
                            ({pole.relay?.toUpperCase()})
                        </span>
                    </div>
                    <div className="relay-buttons">
                        {renderButton(pole.id, 'on', ' ON', '🟢')}
                        {renderButton(pole.id, 'off', ' OFF', '🔴')}
                        {renderButton(pole.id, 'reset', ' RESET', '🔄')}
                    </div>
                    {cooldowns[pole.id] && (
                        <div className="countdown-timer">⏳ System Cooldown: {cooldowns[pole.id].seconds}s</div>
                    )}
                </div>
            ))}

            <div className="network-reset">
                <button
                    className="relay-btn reset"
                    onClick={handleResetAll}
                    disabled={loading['all'] || Object.keys(cooldowns).length > 0}
                    style={{ width: '50%', maxWidth: 'none' }}
                >
                    {(loading['all'] || cooldowns['all']) ? <span className="spinner" /> : '🔄'}
                    RESET ALL
                    {cooldowns['all'] && <span className="btn-countdown">({cooldowns['all'].seconds}s)</span>}
                </button>
            </div>
        </div>
    )
}

export default RelayControls
