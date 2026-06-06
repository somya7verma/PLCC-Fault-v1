import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom icons
const createIcon = (color) => L.divIcon({
    className: 'custom-marker',
    html: `<div style="
    width: 30px;
    height: 30px;
    background: ${color};
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 12px;
  ">⚡</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
})

const okIcon = createIcon('#22c55e')
const warningIcon = createIcon('#eab308')
const faultIcon = createIcon('#ef4444')

function FaultHeatmap({ poles }) {
    const defaultPoles = [
        { id: 1, coordinates: [10.02, 76.30], voltage: 11.8, fault: false },
        { id: 2, coordinates: [10.021, 76.295], voltage: 11.5, fault: false }
    ]

    const displayPoles = poles.length > 0 ? poles : defaultPoles
    const center = [10.0205, 76.2975]

    const getIcon = (pole) => {
        if (pole.fault) return faultIcon
        if (pole.voltage < 10) return warningIcon
        return okIcon
    }

    const getStatus = (pole) => {
        if (pole.fault) return 'FAULT'
        if (pole.voltage < 10) return 'WARNING'
        return 'OK'
    }

    return (
        <div className="map-container">
            <MapContainer
                center={center}
                zoom={16}
                style={{ height: '100%', width: '100%', borderRadius: '12px' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {displayPoles.map(pole => (
                    <Marker
                        key={pole.id}
                        position={pole.coordinates || [10.02 + (pole.id * 0.001), 76.30 - (pole.id * 0.005)]}
                        icon={getIcon(pole)}
                    >
                        <Popup>
                            <div style={{ textAlign: 'center', minWidth: '150px' }}>
                                <strong style={{ fontSize: '1.1rem' }}>Pole {pole.id}</strong>
                                <hr style={{ margin: '8px 0', opacity: 0.3 }} />
                                <div style={{
                                    padding: '8px',
                                    borderRadius: '8px',
                                    background: pole.fault ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                    color: pole.fault ? '#ef4444' : '#22c55e',
                                    fontWeight: 'bold'
                                }}>
                                    {getStatus(pole)}
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    <strong>{pole.voltage?.toFixed(1) || 0}V</strong>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                                    Relay: {pole.relay || 'closed'}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    )
}

export default FaultHeatmap
