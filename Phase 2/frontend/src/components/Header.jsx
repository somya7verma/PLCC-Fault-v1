import { useState } from 'react'
import { Link } from 'react-router-dom'

function Header({ theme, toggleTheme }) {
    const [menuOpen, setMenuOpen] = useState(false)

    return (
        <header className="header">
            <Link to="/" className="header-logo" style={{ textDecoration: 'none' }}>
                <span>⚡</span>
                <div>
                    <div>SHIELD Admin Control</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>
                        Admin Command Center
                    </div>
                </div>
            </Link>

            <div className={`header-actions ${menuOpen ? 'active' : ''}`}>
                <button className="theme-toggle" onClick={() => {
                    toggleTheme();
                    if (window.innerWidth <= 768) setMenuOpen(false);
                }}>
                    {theme === 'dark' ? '☀️' : '🌙'}
                    <span> {theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <Link to="/admin" className="admin-btn" onClick={() => setMenuOpen(false)}>
                    ⚙️ Admin
                </Link>
            </div>

            <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
                {menuOpen ? '✕' : '☰'}
            </button>
        </header>
    )
}

export default Header
