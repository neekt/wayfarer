console.log("App loaded");

// --- Map setup ---
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.1,
    zoomDelta: 0.1
});

// --- Fit Map Button (will attach below zoom controls) ---
const fitButton = L.DomUtil.create('button', 'leaflet-control-fit-button');
fitButton.innerHTML = "Fit Map to View";
fitButton.style.display = 'block';
fitButton.style.marginTop = '5px';
fitButton.style.padding = '4px 8px';
fitButton.style.fontSize = '12px';
fitButton.style.cursor = 'pointer';
fitButton.style.borderRadius = '4px';
fitButton.style.border = '1px solid #ccc';
fitButton.style.background = 'white';
fitButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';

// Prevent clicks on this button from reaching the map
L.DomEvent.disableClickPropagation(fitButton);
L.DomEvent.on(fitButton, 'click', (e) => {
    if (mapOverlay) {
        map.fitBounds(mapOverlay.getBounds());
    }
});

// --- Scale Control (miles) ---
const scaleControl = L.control.scale({
    position: 'bottomleft', // bottom-left corner
    metric: false,          // disable metric (meters/kilometers)
    imperial: true          // enable imperial (miles/feet)
});
scaleControl.addTo(map);

// --- Attach Fit Map button below zoom controls ---
const zoomControlContainer = document.querySelector('.leaflet-control-zoom');
if (zoomControlContainer) {
    zoomControlContainer.appendChild(fitButton);
}

// --- Calibration instruction box ---
const instructionDiv = L.DomUtil.create('div', 'instruction-box');
instructionDiv.style.position = 'absolute';
instructionDiv.style.bottom = '10px';
instructionDiv.style.left = '50%';
instructionDiv.style.transform = 'translateX(-50%)';
instructionDiv.style.background = 'white';
instructionDiv.style.padding = '8px 12px';
instructionDiv.style.borderRadius = '8px';
instructionDiv.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
instructionDiv.style.fontFamily = 'sans-serif';
instructionDiv.style.fontSize = '13px';
instructionDiv.style.zIndex = 1000;
instructionDiv.style.pointerEvents = 'none'; // allow clicks to pass through
instructionDiv.style.display = 'none';       // hidden by default
map.getContainer().appendChild(instructionDiv);

// --- Helper functions to show/hide instructions ---
function showInstruction(text) {
    instructionDiv.innerHTML = text;
    instructionDiv.style.display = 'block';
}

function hideInstruction() {
    instructionDiv.style.display = 'none';
}

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
let campfireMarkers = [];

// Undo/redo stacks
let undoStack = [];
let redoStack = [];

// Calibration state
let calibrationPoints = [];
let calibrationMarkers = [];
let PIXELS_PER_MILE = 1 / 2.49;

// Map state
let currentMapImage = 'sword-coast.webp';
let mapOverlay = null;

// Persist routes per map
let savedRoutes = {}; // { "mapFileName": { markers: [...], cumulativePath: [...], totalDistance, lastPoint } }

// --- Travel Speeds ---
const TRAVEL_SPEEDS = {
    walking_verySlow: 1,
    walking_slow: 2,
    walking_normal: 3,
    walking_fast: 4,
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
    div.style.background = 'white';
    div.style.padding = '10px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    div.style.fontFamily = 'sans-serif';
    div.style.fontSize = '13px';
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
                <option value="silverymoon.webp">Silverymoon</option>
                <option value="waterdeep.webp">Waterdeep</option>
            </optgroup>
        </select>
        <br/>
        <label>Travel Speed:</label>
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
        <label>Navigation Mode:</label>
        <select id="routingModeSelect">
            <option value="waypoints">Waypoints</option>
            <option value="paths">Paths</option>
        </select>
        <br/>
        <label>Hours travelled per day :</label>
        <select id="hoursPerDaySelect">
            ${Array.from({length:23}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join('')}
            <option value="unlimited" selected>Unlimited</option>
        </select>
        <br/>
        <button id="clearRoute">Clear route</button>
        <button id="undoBtn">Undo</button>
        <button id="redoBtn">Redo</button>
        <br/>
        <button id="toggleWaypointsBtn">Hide waypoints</button>
        <br/>
        <button id="calibrateBtn">Calibrate Distance</button>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
};
controlsDiv.addTo(map);

// --- Clear All Function ---
function clearAll() {
    // Clear routing
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;

    cumulativePath = [];
    totalDistance = 0;
    lastPoint = null;

    if (infoPopup) map.closePopup(infoPopup);

    // Clear calibration markers
    calibrationMarkers.forEach(m => map.removeLayer(m));
    calibrationMarkers = [];
    calibrationPoints = [];
    
    // Clear campfires
    campfireMarkers.forEach(m => map.removeLayer(m));
    campfireMarkers = [];
}

// --- Event Listeners ---
document.getElementById('modeSelect').addEventListener('change', e => travelMode = e.target.value);

document.getElementById('routingModeSelect').addEventListener('change', e => {
    const newMode = e.target.value;
    clearAll();
    routingMode = newMode;
});

document.getElementById('clearRoute').addEventListener('click', e => {
    L.DomEvent.stopPropagation(e);
    clearAll();
    // Save empty state for current map
    savedRoutes[currentMapImage] = { markers: [], cumulativePath: [], totalDistance: 0, lastPoint: null };
    undoStack = [];
    redoStack = [];
});

// Undo/Redo
document.getElementById('undoBtn').addEventListener('click', e => {
    if (markers.length === 0) return;
    const lastMarker = markers.pop();
    if (lastMarker) map.removeLayer(lastMarker);

    // Save to redo stack
    redoStack.push({
        marker: lastMarker,
        cumulativePath: cumulativePath.pop(),
        lastPoint: lastPoint
    });

    // Update lastPoint
    lastPoint = cumulativePath.length > 0 ? [cumulativePath[cumulativePath.length-1][1], cumulativePath[cumulativePath.length-1][0]] : null;

    if (routeLine) map.removeLayer(routeLine);
    routeLine = cumulativePath.length > 0 ? L.polyline(cumulativePath, {color:'blue', weight:3, opacity:0.7}).addTo(map) : null;
    
    // Update stop points
    updateCampfires();
});

document.getElementById('redoBtn').addEventListener('click', e => {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    const m = L.marker([action.lastPoint[1], action.lastPoint[0]]).addTo(map);
    markers.push(m);
    cumulativePath.push(action.cumulativePath);
    lastPoint = action.lastPoint;

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(cumulativePath, {color:'blue', weight:3, opacity:0.7}).addTo(map);
});

let calibrationActive = false; // track if calibration is in progress

document.getElementById('calibrateBtn').addEventListener('click', () => {
    calibrationPoints = [];
    calibrationActive = true;
    showInstruction("Calibration: Select two points on the map to set the distance.");
});

// --- Toggle waypoints visibility ---
let waypointsVisible = true; // track state

document.getElementById('toggleWaypointsBtn').addEventListener('click', () => {
    waypointsVisible = !waypointsVisible;

    // Show or hide all waypoint markers
    markers.forEach(m => {
        if (waypointsVisible) {
            m.addTo(map);
        } else {
            map.removeLayer(m);
        }
    });

    // Update button text
    document.getElementById('toggleWaypointsBtn').textContent = waypointsVisible ? "Hide waypoints" : "Show waypoints";
});

// Hours/day travelled listener
document.getElementById('hoursPerDaySelect').addEventListener('change', e => {
    const val = e.target.value;
    hoursPerDay = (val === "unlimited") ? "unlimited" : parseInt(val);

    // If there is a current route, update the total time popup
    if (cumulativePath.length > 0 && lastPoint) {
        const speed = TRAVEL_SPEEDS[travelMode] ?? 3; // current speed
        const totalTimeMinutes = Math.round((totalDistance / speed) * 60);

        // Update or recreate the popup at the last point
        if (infoPopup) map.closePopup(infoPopup);
        infoPopup = L.popup({closeOnClick:true, autoClose:true})
            .setLatLng([lastPoint[1], lastPoint[0]])
            .setContent(`
                <b>Mode:</b> ${travelMode.replace(/([A-Z])/g, ' $1').replace('_', ' ').trim()} (${speed} mph)<br>
                <b>Total Distance:</b> ${totalDistance.toFixed(2)} miles<br>
                <b>Total Time:</b> ${formatTime(totalTimeMinutes)}
            `)
            .openOn(map);
            
        updateCampfires();
    }
});

// --- Map Selector ---
document.getElementById('mapSelect').addEventListener('change', e => {
    const selectedMap = e.target.value;
    loadMap(selectedMap);
});

// --- Load Map ---
function loadMap(imageFile) {
    // Persist current route
    if (markers.length > 0 || cumulativePath.length > 0) {
        savedRoutes[currentMapImage] = {
            markers: markers.map(m => m.getLatLng()),
            cumulativePath: cumulativePath.slice(),
            totalDistance,
            lastPoint: lastPoint ? lastPoint.slice() : null
        };
    }

    clearAll(); // clear old map markers

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

        PIXELS_PER_MILE = MAP_SCALES[imageFile] ?? PIXELS_PER_MILE;
        console.log(`PIXELS_PER_MILE set to ${PIXELS_PER_MILE}`);

        setupClicks(bounds);

        // Restore route if exists
        if (savedRoutes[currentMapImage]) {
            const route = savedRoutes[currentMapImage];
            route.cumulativePath.forEach(([lat,lng]) => {
                const marker = L.marker([lat,lng]).addTo(map);
                markers.push(marker);
            });
            cumulativePath = route.cumulativePath.slice();
            totalDistance = route.totalDistance;
            lastPoint = route.lastPoint ? route.lastPoint.slice() : null;
            if (cumulativePath.length > 0) {
                routeLine = L.polyline(cumulativePath, {color:'blue', weight:3, opacity:0.7}).addTo(map);
            }
        }
    };
    img.src = imageUrl;
}

function updateCampfires() {
    // Remove previous campfires
    campfireMarkers.forEach(m => map.removeLayer(m));
    campfireMarkers = [];

    if (!cumulativePath.length || hoursPerDay === "unlimited") return;

    const speed = TRAVEL_SPEEDS[travelMode] ?? 3;
    const distancePerDay = speed * hoursPerDay; // miles/day

    // First, count total stops
    let accumulatedDistance = 0;
    let nextCampfireAt = distancePerDay;
    let totalStops = 0;

    for (let i = 1; i < cumulativePath.length; i++) {
        const [lat1, lng1] = cumulativePath[i-1];
        const [lat2, lng2] = cumulativePath[i];

        const dx = lng2 - lng1;
        const dy = lat2 - lat1;
        const segmentDistance = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_MILE;

        accumulatedDistance += segmentDistance;

        while (accumulatedDistance >= nextCampfireAt) {
            totalStops++;
            nextCampfireAt += distancePerDay;
        }
    }

    // Now actually add the campfires with tooltips
    accumulatedDistance = 0;
    nextCampfireAt = distancePerDay;
    let stopCount = 1;

    for (let i = 1; i < cumulativePath.length; i++) {
        const [lat1, lng1] = cumulativePath[i-1];
        const [lat2, lng2] = cumulativePath[i];

        const dx = lng2 - lng1;
        const dy = lat2 - lat1;
        const segmentDistance = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_MILE;

        accumulatedDistance += segmentDistance;

        while (accumulatedDistance >= nextCampfireAt) {
            const t = (nextCampfireAt - (accumulatedDistance - segmentDistance)) / segmentDistance;
            const lat = lat1 + (lat2 - lat1) * t;
            const lng = lng1 + (lng2 - lng1) * t;

            const fireIcon = L.divIcon({
                className: '',
                html: `<span style="font-family:sans-serif; font-size:16px; line-height:1;">\u25B2</span>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                interactive: true
            });

            const marker = L.marker([lat, lng], {icon: fireIcon}).addTo(map);

            // Tooltip with "Stop x of total"
            marker.bindTooltip(`Stop ${stopCount} of ${totalStops}`, {permanent: false, direction: 'top', offset: [0, -10]});

            campfireMarkers.push(marker);

            nextCampfireAt += distancePerDay;
            stopCount++;
        }
    }
}

// --- Click Handler ---
function setupClicks(bounds) {
    map.off('click'); // remove previous click listeners
    map.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // --- Calibration Mode ---
        if (calibrationActive) {
            calibrationPoints.push([lng, lat]);
            const marker = L.marker([lat, lng]).addTo(map);
            calibrationMarkers.push(marker);

            if (calibrationPoints.length === 1) {
                // First point clicked
                showInstruction("Calibration: Select a second point on the map to set the distance.");
                return;
            }

            if (calibrationPoints.length === 2) {
                // Draw dashed line between the two points
                const line = L.polyline(
                    [
                        [calibrationPoints[0][1], calibrationPoints[0][0]],
                        [calibrationPoints[1][1], calibrationPoints[1][0]]
                    ],
                    { color: 'red', weight: 2, dashArray: '6, 6' }
                ).addTo(map);
                calibrationMarkers.push(line);

                // Wait a tick so the second marker and line render
                setTimeout(() => {
                    const dx = calibrationPoints[1][0] - calibrationPoints[0][0];
                    const dy = calibrationPoints[1][1] - calibrationPoints[0][1];
                    const pixelDistance = Math.sqrt(dx*dx + dy*dy);

                    // Prompt user for distance
                    const actualMiles = parseFloat(prompt(
                        `Enter distance between the two points (miles):`
                    ));

                    if (!isNaN(actualMiles) && actualMiles > 0) {
                        PIXELS_PER_MILE = pixelDistance / actualMiles;
                        showInstruction(`Updated pixels/mile ratio: ${PIXELS_PER_MILE.toFixed(4)}`);
                        setTimeout(hideInstruction, 3000); // hide after 3s
                    } else {
                        showInstruction("Invalid distance. Calibration canceled.");
                        setTimeout(hideInstruction, 3000);
                    }

                    // Clean up markers and line
                    calibrationPoints = [];
                    calibrationMarkers.forEach(m => map.removeLayer(m));
                    calibrationMarkers = [];
                    calibrationActive = false;
                }, 50);
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
                undoStack.push({ marker: marker, cumulativePath: [lat, lng], lastPoint: lastPoint.slice() });
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
                
                updateCampfires();

                const speed = TRAVEL_SPEEDS[travelMode] ?? 3;
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
                    
                updateCampfires();

                // Save action for undo
                undoStack.push({ marker: marker, cumulativePath: [lat,lng], lastPoint: lastPoint.slice() });
                redoStack = []; // clear redo on new action

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
