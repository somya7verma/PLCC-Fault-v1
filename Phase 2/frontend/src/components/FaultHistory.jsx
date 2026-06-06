function FaultHistory({ faults }) {
    const recentFaults = faults.slice(0, 10)

    if (recentFaults.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
                <div>No fault history recorded</div>
            </div>
        )
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="fault-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Pole</th>
                        <th>Voltage</th>
                        <th>Type</th>
                        <th>Time</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {recentFaults.map(fault => (
                        <tr key={fault.id}>
                            <td>F{fault.id}</td>
                            <td>Pole {fault.pole_id}</td>
                            <td>{fault.voltage?.toFixed(1)}V</td>
                            <td>{fault.fault_type}</td>
                            <td>{new Date(fault.timestamp).toLocaleString()}</td>
                            <td>
                                <span className={`status-badge ${fault.resolved ? 'status-ok' : 'status-fault'}`}
                                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                                    {fault.resolved ? '✓ Resolved' : '⚠ Active'}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default FaultHistory
