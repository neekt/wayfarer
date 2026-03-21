console.log("App loaded");

// --- Map setup ---
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.1,
    zoomDelta: 0.1
});

// --- State ---
let travelMode = "walking_normal";
let routingMode = "waypoints";
let hoursPerDay = "unlimited"; // default

// Routing state
let markers = [];
let routeLine = null;
let cumulativePath = [];
let totalDistance = 0;
let lastPoint = null;
let infoPopup = null;

// Calibration state
let calibrationPoints = [];
let calibrationMarkers = [];
let PIXELS_PER_MILE = 1 / 2.49;

// Map state
let currentMapImage = 'sword-coast.webp';
let mapOverlay = null;

// --- Travel Speeds ---
const TRAVEL_SPEEDS = {
    // Walking tiers
    walking_verySlow: 1,
    walking_slow: 2,
    walking_normal: 3,
    walking_fast: 4,

    // Other modes
    rowboat: 0.6,
    keelboat: 2.8,
    sailingShip: 2.0,
    warship: 3.9,
    longship: 4.5,
    galley: 4.5,
    dragonGriffon: 3.9,
    construct: 9.1
};

// --- Map scales (pixels per mile) ---
const MAP_SCALES = {
    "sword-coast.webp": 3.6577,
    "calimport.webp": 410.1317,
    "neverwinter.webp": 323.5021
};

// --- Format time ---
function formatTime(totalMinutes) {
    const totalHours = totalMinutes / 60;
    const multiplier = (hoursPerDay === "unlimited") ? 1 : (24 / hoursPerDay);
    const elapsedHours = totalHours * multiplier;
    let minutes = Math.round(elapsedHours * 60);

    const years = Math.floor(minutes / (60*24*365));
    minutes -= years * 60*24*365;
    const months = Math.floor(minutes / (60*24*30));
    minutes -= months * 60*24*30;
    const weeks = Math.floor(minutes / (60*24*7));
    minutes -= weeks * 60*24*7;
    const days = Math.floor(minutes / (60*24));
    minutes -= days * 60*24;
    const hours = Math.floor(minutes / 60);
    minutes = minutes % 60;

    const parts = [];
    if (years) parts.push(`${years} year${years>1?"s":""}`);
    if (months) parts.push(`${months} month${months>1?"s":""}`);
    if (weeks) parts.push(`${weeks} week${weeks>1?"s":""}`);
    if (days) parts.push(`${days} day${days>1?"s":""}`);
    if (hours) parts.push(`${hours} hour${hours>1?"s":""}`);
    if (minutes) parts.push(`${minutes} minute${minutes>1?"s":""}`);

    return parts.join(' and ');
}

// --- Controls ---
const controlsDiv = L.control({ position: 'topright' });
controlsDiv.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'controls-container');
    div.innerHTML = `
        <label>Map:</label>
        <select id="mapSelect">
            <optgroup label="Regions">
                <option value="calimshan.webp">Calimshan</option>
                <option value="faerun.webp">Faerun</option>
                <option value="sword-coast.webp" selected>Sword Coast</option>
            </optgroup>
            <optgroup label="Cities">
                <option value="baldurs-gate.webp">Baldur's Gate</option>
                <option value="calimport-1.webp">Calimport (1)</option>
                <option value="calimport-2.webp">Calimport (2)</option>
                <option value="luskan.webp">Luskan</option>
                <option value="neverwinter.webp">Neverwinter</option>
                <option value="silverymoon.wepb">Silverymoon</option>
                <option value="waterdeep.webp">Waterdeep</option>
            </optgroup>
        </select>
        <br/>
        <label>Travel Mode:</label>
        <select id="modeSelect">
            <optgroup label="Walking">
                <option value="walking_verySlow">Very Slow (1 mph)</option>
                <option value="walking_slow">Slow (2 mph)</option>
                <option value="walking_normal" selected>Normal (3 mph)</option>
                <option value="walking_fast">Fast (4 mph)</option>
            </optgroup>

            <optgroup label="Other">
                <option value="rowboat">Rowboat (0.6 mph)</option>
                <option value="keelboat">Keelboat (2.8 mph)</option>
                <option value="sailingShip">Sailing ship (2.0 mph)</option>
                <option value="warship">Warship (3.9 mph)</option>
                <option value="longship">Longship (4.5 mph)</option>
                <option value="galley">Galley (4.5 mph)</option>
                <option value="dragonGriffon">Dragon/Griffon (3.9 mph)</option>
                <option value="construct">Construct (9.1 mph)</option>
            </optgroup>
        </select>
        <br/>
        <label>Routing Mode:</label>
        <select id="routingModeSelect">
            <option value="waypoints">Waypoints</option>
            <option value="paths">Paths</option>
            <option value="calibrate">Calibrate distance</option>
        </select>
        <br/>
        <label>Hours/day travelled:</label>
        <select id="hoursPerDaySelect">
            ${Array.from({length:23}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join('')}
            <option value="unlimited" selected>Unlimited</option>
        </select>
        <br/>
        <button id="clearRoute">Clear route</button>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
};
controlsDiv.addTo(map);

// --- Event Listeners ---
document.getElementById('modeSelect').addEventListener('change', e => travelMode = e.target.value);

document.getElementById('routingModeSelect').addEventListener('change', e => {
    const newMode = e.target.value;

    // Clear routing
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
    cumulativePath = [];
    totalDistance = 0;
    lastPoint = null;

    // Clear calibration
    calibrationMarkers.forEach(m => map.removeLayer(m));
    calibrationMarkers = [];
    calibrationPoints = [];

    if (infoPopup) map.closePopup(infoPopup);

    routingMode = newMode;
});

document.getElementById('clearRoute').addEventListener('click', e => {
    L.DomEvent.stopPropagation(e);

    // Clear routing
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
    cumulativePath = [];
    totalDistance = 0;
    lastPoint = null;
    if (infoPopup) map.closePopup(infoPopup);

    // Clear calibration
    calibrationMarkers.forEach(m => map.removeLayer(m));
    calibrationMarkers = [];
    calibrationPoints = [];
});

// Hours/day travelled listener
document.getElementById('hoursPerDaySelect').addEventListener('change', e => {
    const val = e.target.value;
    hoursPerDay = (val === "unlimited") ? "unlimited" : parseInt(val);
});

// --- Map Selector ---
document.getElementById('mapSelect').addEventListener('change', e => {
    const selectedMap = e.target.value;
    loadMap(selectedMap);
});

// --- Load Map ---
function loadMap(imageFile) {
    currentMapImage = imageFile;

    // Remove previous overlay
    if (mapOverlay) map.removeLayer(mapOverlay);

    const imageUrl = `/map/${currentMapImage}`;
    const img = new Image();
    img.onload = function() {
        const width = img.width;
        const height = img.height;
        console.log(`Loaded map: ${currentMapImage} (${width} x ${height})`);

        const bounds = [[0,0],[height,width]];
        mapOverlay = L.imageOverlay(imageUrl, bounds).addTo(map);
        map.fitBounds(bounds);
        map.setMaxBounds(bounds);

        // Apply pre-set PIXELS_PER_MILE
        PIXELS_PER_MILE = MAP_SCALES[imageFile] ?? PIXELS_PER_MILE;
        console.log(`PIXELS_PER_MILE set to ${PIXELS_PER_MILE}`);

        setupClicks(bounds);
    };
    img.src = imageUrl;
}

// --- Click Handler ---
function setupClicks(bounds) {
    map.off('click'); // remove previous click listeners
    map.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // --- Calibration Mode ---
        if (routingMode === "calibrate") {
            calibrationPoints.push([lng, lat]);
            const marker = L.marker([lat, lng]).addTo(map);
            calibrationMarkers.push(marker);

            if (calibrationPoints.length === 2) {
                const dx = calibrationPoints[1][0] - calibrationPoints[0][0];
                const dy = calibrationPoints[1][1] - calibrationPoints[0][1];
                const pixelDistance = Math.sqrt(dx*dx + dy*dy);

                // Show current ratio in prompt
                const currentRatio = PIXELS_PER_MILE.toFixed(4);
                const actualMiles = parseFloat(prompt(
                    `Current pixels/mile ratio: ${currentRatio}\n` +
                    `Enter actual distance between the two points (miles):`
                ));

                if (!isNaN(actualMiles) && actualMiles > 0) {
                    PIXELS_PER_MILE = pixelDistance / actualMiles;
                    alert(`Updated pixels/mile ratio: ${PIXELS_PER_MILE.toFixed(4)}`);
                } else {
                    alert("Invalid distance. Calibration canceled.");
                }

                calibrationPoints = [];
                routingMode = "waypoints";
            }
            return; // exit early
        }

        // --- Routing Mode ---
        if (routingMode === "waypoints" || routingMode === "paths") {
            if (lastPoint === null) {
                lastPoint = [lng, lat];
                const marker = L.marker([lat, lng]).addTo(map);
                markers.push(marker);
                cumulativePath.push([lat, lng]);
                return;
            }

            const marker = L.marker([lat, lng]).addTo(map);
            markers.push(marker);

            try {
                let latlngs = [];
                let segmentDistance = 0;

                if (routingMode === "waypoints") {
                    latlngs = [[lastPoint[1], lastPoint[0]], [lat, lng]];
                    const dx = lng - lastPoint[0];
                    const dy = lat - lastPoint[1];
                    segmentDistance = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_MILE;
                } else if (routingMode === "paths") {
                    const url = `http://localhost:8000/route?sx=${lastPoint[0]}&sy=${lastPoint[1]}&ex=${lng}&ey=${lat}&mode=${travelMode}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    latlngs = data.path.map(p => [p[1], p[0]]);
                    segmentDistance = data.distance_mi ?? 0;
                }

                cumulativePath = cumulativePath.concat(latlngs);
                totalDistance += segmentDistance;

                if (routeLine) map.removeLayer(routeLine);
                routeLine = L.polyline(cumulativePath, {color:'blue', weight:3, opacity:0.7}).addTo(map);

                const speed = TRAVEL_SPEEDS[travelMode] ?? 3; // default 3 mph
                const totalTimeMinutes = Math.round((totalDistance / speed) * 60);

                if (infoPopup) map.closePopup(infoPopup);
                infoPopup = L.popup({closeOnClick:true, autoClose:true})
                    .setLatLng([lat, lng])
                    .setContent(`
                        <b>Mode:</b> ${travelMode.replace(/([A-Z])/g, ' $1').replace('_', ' ').trim()} (${speed} mph)<br>
                        <b>Total Distance:</b> ${totalDistance.toFixed(2)} miles<br>
                        <b>Total Time:</b> ${formatTime(totalTimeMinutes)}
                    `)
                    .openOn(map);

            } catch(err) {
                console.error("Routing error:", err);
                alert("Error calling backend. Check console.");
            }

            lastPoint = [lng, lat];
        }
    });
}

// --- Initial map load ---
loadMap(currentMapImage);
