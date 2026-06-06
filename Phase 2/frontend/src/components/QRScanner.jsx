import { useState, useRef, useEffect } from 'react'
import jsQR from 'jsqr'

function QRScanner({ onScan, scannedPole }) {
    const [scanning, setScanning] = useState(false)
    const [result, setResult] = useState(null)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const streamRef = useRef(null)

    const startScanning = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play()
            }
            setScanning(true)
            requestAnimationFrame(scanFrame)
        } catch (err) {
            alert('Camera access denied. Please enable camera permissions.')
        }
    }

    const stopScanning = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }
        setScanning(false)
    }

    const scanFrame = () => {
        if (!scanning || !videoRef.current || !canvasRef.current) return

        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0)

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height)

            if (code) {
                const poleMatch = code.data.match(/pole[_\s]?(\d+)/i)
                if (poleMatch) {
                    const poleId = parseInt(poleMatch[1])
                    setResult(`Pole ${poleId} Detected!`)
                    onScan?.(poleId)
                    stopScanning()
                    return
                }
            }
        }

        if (scanning) requestAnimationFrame(scanFrame)
    }

    useEffect(() => {
        return () => stopScanning()
    }, [])

    return (
        <div className="qr-scanner">
            {!scanning ? (
                <>
                    <button className="qr-btn" onClick={startScanning}>
                        📷 Scan Pole QR Code
                    </button>
                    {scannedPole && (
                        <div className="qr-result">
                            ✓ Pole {scannedPole.id} - {scannedPole.voltage?.toFixed(1)}V -
                            {scannedPole.fault ? ' FAULT' : ' OK'}
                        </div>
                    )}
                </>
            ) : (
                <div className="qr-overlay">
                    <video ref={videoRef} className="qr-video" playsInline />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <p style={{ color: 'white', marginTop: '16px' }}>
                        Point camera at pole QR code
                    </p>
                    <button className="qr-close" onClick={stopScanning}>
                        ✕ Cancel
                    </button>
                </div>
            )}
        </div>
    )
}

export default QRScanner
