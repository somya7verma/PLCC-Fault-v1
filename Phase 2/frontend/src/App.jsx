import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { io } from 'socket.io-client'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import './index.css'

// WebSocket connection
const socket = io(`http://${window.location.hostname}:5001`, {
  transports: ['websocket', 'polling']
})

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })
  const [poles, setPoles] = useState([])
  const [connected, setConnected] = useState(false)
  const [hardwareConnected, setHardwareConnected] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    socket.on('connect', () => {
      console.log('WebSocket connected')
      setConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setConnected(false)
    })

    socket.on('poles_update', (data) => {
      setPoles(data.poles)
      setHardwareConnected(data.hardware_connected)
    })

    socket.on('connect_error', (err) => {
      console.error('Conn Error:', err)
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('poles_update')
    }
  }, [])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return (
    <Router>
      <div className="app">
        <Header theme={theme} toggleTheme={toggleTheme} />
        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={<Dashboard poles={poles} connected={connected} socket={socket} hardware_connected={hardwareConnected} />}
            />
            <Route path="/admin" element={<Admin socket={socket} />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
