import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = `http://${window.location.hostname}:5001/api`

function Admin({ socket }) {
    const [loggedIn, setLoggedIn] = useState(false)
    const [credentials, setCredentials] = useState({ username: '', password: '' })
    const [config, setConfig] = useState({
        email_recipients: [],
        mobile: '',
        serial_ports: '',
        email_template: '',
        telegram_token: '',
        telegram_chat_id: [],
        telegram_template: ''
    })
    const [newEmail, setNewEmail] = useState('')
    const [newTelegramChatId, setNewTelegramChatId] = useState('')
    const [faults, setFaults] = useState([])
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [emailLogs, setEmailLogs] = useState([])

    // UI Toggles
    const [showEmailConfig, setShowEmailConfig] = useState(false)
    const [showTelegramConfig, setShowTelegramConfig] = useState(false)

    useEffect(() => {
        if (loggedIn) {
            fetchConfig()
            fetchFaults()
        }
    }, [loggedIn])

    useEffect(() => {
        if (socket) {
            const handleProgress = (data) => {
                const timestamp = new Date().toLocaleTimeString()
                let logMsg = ''

                switch (data.type) {
                    case 'start': logMsg = `Starting alert process for ${data.total} recipients...`; break;
                    case 'sending': logMsg = `Email: Sending to ${data.recipient} (${data.current}/${data.total})...`; break;
                    case 'wait': logMsg = `Waiting ${data.seconds}s delay...`; break;
                    case 'sent': logMsg = `Email sent to ${data.recipient}`; break;
                    case 'failed': logMsg = `Email failed to ${data.recipient}`; break;
                    case 'telegram_start': logMsg = `Sending Telegram alert...`; break;
                    case 'telegram_success': logMsg = `Telegram sent to ${data.chat_id || 'recipient'}`; break;
                    case 'telegram_fail': logMsg = `Telegram failed for ${data.chat_id || 'recipient'}: ${data.error}`; break;
                    case 'complete': logMsg = `Alert process completed!`; break;
                    case 'error': logMsg = `Error: ${data.message}`; break;
                    default: logMsg = JSON.stringify(data);
                }

                setEmailLogs(prev => [`[${timestamp}] ${logMsg}`, ...prev])
            }

            socket.on('email_progress', handleProgress)
            return () => socket.off('email_progress', handleProgress)
        }
    }, [socket])

    const handleLogin = (e) => {
        e.preventDefault()
        if (credentials.username === 'admin' && credentials.password === 'admin123') {
            setLoggedIn(true)
        } else {
            setMessage('Invalid credentials')
        }
    }

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API_BASE}/config`)
            const data = await res.json()

            // Format email recipients
            if (!Array.isArray(data.email_recipients)) {
                try {
                    data.email_recipients = JSON.parse(data.email_recipients || '[]')
                } catch {
                    data.email_recipients = data.email_recipients ? [data.email_recipients] : []
                }
            }

            // Format telegram chat IDs
            if (!Array.isArray(data.telegram_chat_id)) {
                try {
                    data.telegram_chat_id = JSON.parse(data.telegram_chat_id || '[]')
                } catch {
                    data.telegram_chat_id = data.telegram_chat_id ? [data.telegram_chat_id] : []
                }
            }

            setConfig(data)
        } catch (e) { console.error(e) }
    }

    const fetchFaults = async () => {
        try {
            const res = await fetch(`${API_BASE}/faults`)
            setFaults((await res.json()).faults || [])
        } catch (e) { console.error(e) }
    }

    const updateConfig = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            await fetch(`${API_BASE}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })
            setMessage('Config updated!')
            setTimeout(() => setMessage(''), 3000)
        } catch (e) { setMessage('Update failed') }
        finally { setLoading(false) }
    }

    const addEmail = () => {
        if (newEmail && !config.email_recipients.includes(newEmail)) {
            setConfig({
                ...config,
                email_recipients: [...config.email_recipients, newEmail]
            })
            setNewEmail('')
        }
    }

    const removeEmail = (email) => {
        setConfig({
            ...config,
            email_recipients: config.email_recipients.filter(e => e !== email)
        })
    }

    const addTelegramChatId = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (newTelegramChatId) {
            const currentIds = Array.isArray(config.telegram_chat_id) ? config.telegram_chat_id :
                (config.telegram_chat_id ? [config.telegram_chat_id] : []);

            if (!currentIds.includes(newTelegramChatId)) {
                setConfig({ ...config, telegram_chat_id: [...currentIds, newTelegramChatId] });
                setNewTelegramChatId('');
            }
        }
    }

    const removeTelegramChatId = (id) => {
        setConfig({ ...config, telegram_chat_id: config.telegram_chat_id.filter(i => i !== id) })
    }

    const sendTestEmail = async () => {
        setEmailLogs([])
        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/test-email`, { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                setMessage(data.message)
            } else {
                setMessage(data.error)
                setEmailLogs(prev => [`❌ API Error: ${data.error}`, ...prev])
            }
        } catch (e) {
            setMessage('Test request failed')
            setEmailLogs(prev => [`❌ Request failed: ${e.message}`, ...prev])
        }
        finally { setLoading(false) }
    }

    const clearFaults = async () => {
        if (!confirm('Clear all fault history?')) return
        try {
            await fetch(`${API_BASE}/clear-faults`, { method: 'POST' })
            setFaults([])
        } catch (e) { console.error(e) }
    }

    const exportCSV = () => {
        window.open(`${API_BASE}/export-csv`, '_blank')
    }

    if (!loggedIn) {
        return (
            <div className="admin-container">
                <div className="admin-login card">
                    <h2>🔐 Admin Login</h2>
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label>Username</label>
                            <input type="text" value={credentials.username}
                                onChange={e => setCredentials({ ...credentials, username: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input type="password" value={credentials.password}
                                onChange={e => setCredentials({ ...credentials, password: e.target.value })} />
                        </div>
                        {message && <p style={{ color: 'var(--status-fault)' }}>{message}</p>}
                        <button type="submit" className="submit-btn">Login</button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="admin-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1>⚙️ Admin Panel</h1>
            </div>

            {/* Configuration */}
            <div className="card admin-section">
                <h3>Configuration</h3>
                <form onSubmit={updateConfig} className="config-form">

                    {/* Toggle Buttons */}
                    <div className="full-width" style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <button type="button" onClick={() => setShowEmailConfig(!showEmailConfig)}
                            style={{ flex: 1, padding: '10px', background: showEmailConfig ? 'var(--accent-blue)' : 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: showEmailConfig ? 'white' : 'var(--text-primary)' }}>
                            {showEmailConfig ? '▼ Configure Email' : '▶ Configure Email'}
                        </button>
                        <button type="button" onClick={() => setShowTelegramConfig(!showTelegramConfig)}
                            style={{ flex: 1, padding: '10px', background: showTelegramConfig ? 'var(--accent-blue)' : 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: showTelegramConfig ? 'white' : 'var(--text-primary)' }}>
                            {showTelegramConfig ? '▼ Configure Telegram Message' : '▶ Configure Telegram Message'}
                        </button>
                    </div>

                    {/* EMAIL SECTION */}
                    {showEmailConfig && (
                        <div className="full-width" style={{ gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', marginBottom: '15px' }}>
                            <h4 style={{ marginTop: 0 }}>📧 Email Settings</h4>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Recipients</label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                    <input
                                        type="email"
                                        placeholder="Add new email address"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    />
                                    <button type="button" onClick={addEmail} style={{
                                        background: 'var(--status-ok)', color: 'white', border: 'none', borderRadius: '8px', width: '40px', fontSize: '1.2rem', cursor: 'pointer'
                                    }}>+</button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {config.email_recipients.map((email, idx) => (
                                        <div key={idx} style={{
                                            background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px'
                                        }}>
                                            <span>{email}</span>
                                            <button type="button" onClick={() => removeEmail(email)} style={{
                                                background: 'none', border: 'none', color: 'var(--status-fault)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1
                                            }}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Email Template</label>
                                <textarea
                                    value={config.email_template || ''}
                                    onChange={e => setConfig({ ...config, email_template: e.target.value })}
                                    rows={6}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                                />
                            </div>
                        </div>
                    )}

                    {/* TELEGRAM SECTION */}
                    {showTelegramConfig && (
                        <div className="full-width" style={{ gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', marginBottom: '15px' }}>
                            <h4 style={{ marginTop: 0 }}>🤖 Telegram Settings</h4>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Chat IDs</label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="-100123456789"
                                        value={newTelegramChatId}
                                        onChange={e => setNewTelegramChatId(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && addTelegramChatId(e)}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    />
                                    <button type="button" onClick={addTelegramChatId} style={{
                                        background: 'var(--status-ok)', color: 'white', border: 'none', borderRadius: '8px', width: '40px', fontSize: '1.2rem', cursor: 'pointer'
                                    }}>+</button>

                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {Array.isArray(config.telegram_chat_id) && config.telegram_chat_id.map((id, idx) => (
                                        <div key={idx} style={{
                                            background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px'
                                        }}>
                                            <span>{id}</span>
                                            <button type="button" onClick={() => removeTelegramChatId(id)} style={{
                                                background: 'none', border: 'none', color: 'var(--status-fault)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1
                                            }}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Message Template</label>
                                <textarea
                                    value={config.telegram_template || ''}
                                    onChange={e => setConfig({ ...config, telegram_template: e.target.value })}
                                    rows={6}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                                />
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    Markdown supported. Placeholders: <code>{'{pole_id}'}</code>, <code>{'{voltage}'}</code>, <code>{'{status}'}</code>, <code>{'{time}'}</code>
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Serial Ports</label>
                        <input type="text" value={config.serial_ports || ''}
                            onChange={e => setConfig({ ...config, serial_ports: e.target.value })} />
                    </div>

                    <div className="full-width" style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px' }}>
                        <button type="submit" className="submit-btn" disabled={loading} style={{ flex: 2 }}>
                            {loading ? 'Updating...' : 'Save Configuration'}
                        </button>
                        <button type="button" onClick={sendTestEmail} className="submit-btn" style={{ flex: 1, background: 'var(--status-warning)' }} disabled={loading}>
                            🧪 Test Alert
                        </button>
                    </div>
                </form>
                {message && <p style={{ color: 'var(--status-ok)', marginTop: '12px', textAlign: 'center' }}>{message}</p>}

                {/* Logs */}
                {emailLogs.length > 0 && (
                    <div className="full-width" style={{ marginTop: '20px', background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h4 style={{ marginBottom: '8px' }}>📜 Alert Log</h4>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                            {emailLogs.map((log, i) => (
                                <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Fault History */}
            <div className="card admin-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Fault History ({faults.length})</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="export-btn" onClick={exportCSV}>📥 Export CSV</button>
                        <button className="export-btn" onClick={clearFaults} style={{ background: 'var(--status-fault)' }}>
                            🗑️ Clear All
                        </button>
                    </div>
                </div>
                <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                    <table className="fault-table">
                        <thead>
                            <tr><th>ID</th><th>Pole</th><th>Voltage</th><th>Type</th><th>Time</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            {faults.slice(0, 20).map(f => (
                                <tr key={f.id}>
                                    <td>F{f.id}</td>
                                    <td>P{f.pole_id}</td>
                                    <td>{f.voltage?.toFixed(1)}V</td>
                                    <td>{f.fault_type}</td>
                                    <td>{new Date(f.timestamp).toLocaleString()}</td>
                                    <td>{f.resolved ? '✓ Resolved' : '⚠ Active'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default Admin
