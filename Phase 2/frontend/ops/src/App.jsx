import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const API_BASE = `http://localhost:5001/api`;
const socket = io('http://localhost:5001', { transports: ['websocket'] });

function App() {
    const [pin, setPin] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [poles, setPoles] = useState([]);
    const [messages, setMessages] = useState([]);
    const [chatMsg, setChatMsg] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);

    // Mock distance for sorting
    const poleDistances = { 1: 0.8, 2: 2.1 };

    useEffect(() => {
        if (isLoggedIn) {
            fetchPoles();
            fetchMessages();

            socket.on('poles_update', (data) => {
                // Filter: show if fault OR relay is open OR voltage abnormal (consistent with backend filter)
                const filtered = data.poles.filter(p => p.fault || p.relay === 'open' || p.voltage < 190 || p.voltage > 250);
                const sorted = filtered.sort((a, b) => (poleDistances[a.id] || 99) - (poleDistances[b.id] || 99));
                setPoles(sorted);
            });

            socket.on('new_chat', (msg) => {
                setMessages(prev => [...prev, msg]);
            });
        }

        return () => {
            socket.off('poles_update');
            socket.off('new_chat');
        };
    }, [isLoggedIn]);

    const fetchPoles = async () => {
        try {
            const res = await fetch(`${API_BASE}/ops/poles?pin=${pin}`);
            const data = await res.json();
            if (res.ok) {
                const sorted = data.sort((a, b) => (poleDistances[a.id] || 99) - (poleDistances[b.id] || 99));
                setPoles(sorted);
            }
        } catch (e) { console.error(e); }
    };

    const fetchMessages = async () => {
        try {
            const res = await fetch(`${API_BASE}/chat`);
            const data = await res.json();
            setMessages(data);
        } catch (e) { console.error(e); }
    }

    const handleToggleRelay = async (id, currentState) => {
        const action = currentState === 'open' ? 'on' : 'off';
        try {
            await fetch(`${API_BASE}/relay/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            // Result will come back through socket poles_update
        } catch (e) { console.error(e); }
    };

    const markResolved = async (id) => {
        try {
            await fetch(`${API_BASE}/relay/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset' })
            });
            alert(`Pole #${id} marked as RESOLVED`);
        } catch (e) { console.error(e); }
    }

    const sendMessage = async () => {
        if (!chatMsg.trim()) return;
        try {
            await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender: 'Lineman', text: chatMsg })
            });
            setChatMsg('');
        } catch (e) { console.error(e); }
    };

    if (!isLoggedIn) {
        return (
            <div className="login-container">
                <h1>🛠️ OPS Login</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Lineman Auth Required</p>
                <input
                    type="password"
                    className="pin-input"
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                        setPin(e.target.value);
                        if (e.target.value === '1234') setIsLoggedIn(true);
                    }}
                    maxLength={4}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hint: 1234</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <header className="app-header">
                <div style={{ fontWeight: 'bold' }}>🛡️ SHIELD Lineman Field App</div>
                <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem' }}>☰</button>
            </header>

            {menuOpen && (
                <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderBottom: '1px solid var(--border-color)', position: 'absolute', top: '60px', left: 0, right: 0, zIndex: 10 }}>
                    <p onClick={() => setIsLoggedIn(false)} style={{ cursor: 'pointer' }}>🚪 Logout</p>
                    <hr style={{ margin: '10px 0', opacity: '0.2' }} />
                    <p>📍 GPS Status: ACTIVE</p>
                </div>
            )}

            <main style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '15px' }}>
                    <h2 style={{ fontSize: '1.2rem' }}>Nearest Faults ({poles.length})</h2>
                </div>

                {poles.length === 0 && (
                    <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.6 }}>
                        ✅ No active faults or maintenance in your area.
                    </div>
                )}

                {poles.map(pole => (
                    <div key={pole.id} className="pole-card">
                        <div className="pole-header">
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Pole #{pole.id}</span>
                            <span style={{
                                background: pole.fault ? 'var(--status-fault)' : (pole.relay === 'open' ? 'var(--status-warning)' : 'var(--status-ok)'),
                                padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem'
                            }}>
                                {pole.fault ? '🔴 ISOLATED (FAULT)' : (pole.relay === 'open' ? '🟠 MAINTENANCE' : '🟢 ONLINE')}
                            </span>
                        </div>

                        <div className="pole-info">
                            <span>📍 {poleDistances[pole.id] || '?.?'}km away</span>
                            <span>⚡ {pole.voltage.toFixed(1)}V</span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <button
                                className={`control-btn btn-relay ${pole.relay === 'open' ? 'off' : ''}`}
                                onClick={() => handleToggleRelay(pole.id, pole.relay)}
                                style={{ flex: 1 }}
                            >
                                {pole.relay === 'open' ? '🔴 Relay Open' : '🟢 Relay Closed'}
                            </button>
                        </div>

                        <button
                            onClick={() => markResolved(pole.id)}
                            style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--status-ok)', background: 'transparent', color: 'var(--status-ok)', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            ✅ Mark Resolved
                        </button>
                    </div>
                ))}
            </main>

            {/* Integrated Chat Panel at bottom */}
            <div className="chat-section" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', height: '240px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '8px 15px', fontSize: '0.8rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', opacity: 0.7 }}>Team Communication</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {messages.map((m, i) => (
                        <div key={i} style={{
                            alignSelf: m.sender === 'Lineman' ? 'flex-end' : 'flex-start',
                            background: m.sender === 'Lineman' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                            padding: '6px 12px', borderRadius: '10px', fontSize: '0.85rem', maxWidth: '85%'
                        }}>
                            <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{m.sender} • {m.timestamp}</div>
                            {m.text}
                        </div>
                    ))}
                </div>
                <div style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="Type message..."
                        value={chatMsg}
                        onChange={(e) => setChatMsg(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', color: 'white' }}
                    />
                    <button onClick={sendMessage} style={{ background: 'var(--accent-blue)', border: 'none', color: 'white', padding: '0 15px', borderRadius: '8px' }}>Send</button>
                </div>
            </div>
        </div>
    )
}

export default App
