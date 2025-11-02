const map = L.map('kerala-map').setView([10.02, 76.2975], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const nodes = {
  1: L.circleMarker([10.02, 76.30], { radius: 8, color: 'green', fillColor: 'green', fillOpacity: 1 }).addTo(map).bindPopup("Node 1: OK"),
  2: L.circleMarker([10.021, 76.295], { radius: 8, color: 'green', fillColor: 'green', fillOpacity: 1 }).addTo(map).bindPopup("Node 2: OK")
};

async function refreshNodes() {
  try {
    const response = await fetch('http://localhost:5000/nodes');
    if (!response.ok) throw new Error("Failed to fetch nodes");
    const data = await response.json();

    const statusResp = await fetch('http://localhost:5000/status');
    const statusJson = await statusResp.json();

    if (!statusJson.backend_online) {
      for (let id in nodes) {
        nodes[id].setStyle({ color: 'lightgray', fillColor: 'lightgray', fillOpacity: 0.6 });
        nodes[id].bindPopup("Node: Offline");
      }
      updateAlert("OFFLINE - DEVICE NOT CONNECTED", "gray");
      hideResetButton();
      return;
    }

    let anyFault = false;
    let faultStartId = 3; 

    data.forEach(node => {
      if (!node.connected || node.fault) {
        faultStartId = Math.min(faultStartId, node.id);
        anyFault = true;
      }
    });

    data.forEach(node => {
      let color = 'green';
      if (!node.connected) color = 'red';
      else if (node.fault) color = 'orange';
      if (node.id >= faultStartId) color = 'red';

      if (nodes[node.id]) {
        nodes[node.id].setStyle({ color, fillColor: color, fillOpacity: 1 });
        nodes[node.id].bindPopup(`Node ${node.id}: ${color.toUpperCase()}`);
      }
    });

    updateAlert(anyFault ? '⚠️ FAULT DETECTED' : 'NO FAULT DETECTED', anyFault ? 'darkred' : '#32CD32');
    anyFault ? showResetButton() : hideResetButton();

  } catch (error) {
    for (let id in nodes) {
      nodes[id].setStyle({ color: 'lightgray', fillColor: 'lightgray', fillOpacity: 0.6 });
      nodes[id].bindPopup("Node: Offline");
    }
    updateAlert("OFFLINE - DEVICE NOT CONNECTED", "gray");
    hideResetButton();
  }
}

function updateAlert(message, color) {
  const el = document.getElementById('fault-status');
  el.textContent = message;
  el.style.color = color;
  el.style.backgroundColor = color === 'darkred' ? '#FFD700' : '';
}

function showResetButton() {
  document.getElementById('reset-container').style.display = 'block';
}

function hideResetButton() {
  document.getElementById('reset-container').style.display = 'none';
}

async function resetLine() {
  try {
    const res = await fetch('http://localhost:5000/reset', { method: 'POST' });
    const json = await res.json();
    alert(json.msg || 'Reset command sent');
  } catch (e) {
    alert('Reset failed: ' + e);
  }
}

setInterval(refreshNodes, 1000);
