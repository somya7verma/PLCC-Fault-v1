import { useEffect, useRef } from 'react'

function PredictiveWarnings({ warnings }) {
    const audioRef = useRef(null)

    useEffect(() => {
        if (warnings.length > 0 && audioRef.current) {
            // Play warning sound
            audioRef.current.play().catch(() => { })
        }
    }, [warnings.length])

    if (warnings.length === 0) {
        return (
            <div className="warning-list">
                <div style={{
                    textAlign: 'center',
                    padding: '30px',
                    color: 'var(--status-ok)'
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
                    <div>All systems operating normally</div>
                </div>
            </div>
        )
    }

    return (
        <div className="warning-list">
            <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleDoAHLj/5K9SFwA=" preload="auto" />

            {warnings.map((warning, index) => (
                <div key={index} className={`warning-item ${warning.type}`}>
                    <span className="warning-icon">
                        {warning.type === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div>
                        <div className="warning-message">{warning.message}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {new Date(warning.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default PredictiveWarnings
