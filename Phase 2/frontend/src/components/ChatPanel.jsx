import { useState, useEffect } from 'react'

const API_BASE = `http://localhost:5001/api`;

export default function ChatPanel({ socket }) {
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')

    useEffect(() => {
        fetchMessages()

        if (socket) {
            socket.on('new_chat', (msg) => {
                setMessages(prev => [...prev, msg])
            })
        }

        return () => {
            if (socket) socket.off('new_chat')
        }
    }, [socket])

    const fetchMessages = async () => {
        try {
            const res = await fetch(`${API_BASE}/chat`)
            const data = await res.json()
            setMessages(data)
        } catch (e) { console.error(e) }
    }

    const handleSend = async () => {
        if (!newMessage.trim()) return
        try {
            await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender: 'Admin', text: newMessage })
            })
            setNewMessage('')
        } catch (e) { console.error(e) }
    }

    return (
        <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '15px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            height: '400px',
            overflow: 'hidden'
        }}>
            <div style={{ padding: '15px', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                💬 Lineman Feed
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 && <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '20px' }}>No messages yet...</div>}
                {messages.map((m, i) => (
                    <div key={i} style={{
                        maxWidth: '80%',
                        alignSelf: m.sender === 'Admin' ? 'flex-end' : 'flex-start',
                        background: m.sender === 'Admin' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                        padding: '10px 15px',
                        borderRadius: '12px',
                        fontSize: '0.9rem'
                    }}>
                        <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>{m.sender} • {m.timestamp}</div>
                        <div>{m.text}</div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '15px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px' }}>
                <input
                    type="text"
                    placeholder="Reply to field team..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: 'white'
                    }}
                />
                <button
                    onClick={handleSend}
                    style={{
                        background: 'var(--accent-blue)',
                        border: 'none',
                        color: 'white',
                        padding: '0 15px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    )
}
