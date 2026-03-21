from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import math
import networkx as nx

app = FastAPI()

# Enable CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Map and scale constants
MAP_WIDTH = 4096
MAP_HEIGHT = 2650

# Map scaling fix: make 1 map mile = 1 real mile
PIXEL_TO_KM = 0.01 / 2.49
KM_TO_MI = 0.621371

# D&D travel speeds (mph)
TRAVEL_MODES = {
    "walking": 3.41,  # 5 ft/sec
    "riding": 6,      # adjust as desired
    "flying": 30
}

# Euclidean distance helper
def distance(a, b):
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return math.hypot(dx, dy)

# Build grid of arbitrary "roads"
G = nx.Graph()
GRID_STEP = 200  # pixels between nodes
for x in range(0, MAP_WIDTH+1, GRID_STEP):
    for y in range(0, MAP_HEIGHT+1, GRID_STEP):
        node_name = f"{x}_{y}"
        G.add_node(node_name, x=x, y=y)

# Connect neighbors (4-way) for basic grid
for x in range(0, MAP_WIDTH+1, GRID_STEP):
    for y in range(0, MAP_HEIGHT+1, GRID_STEP):
        node_name = f"{x}_{y}"
        neighbors = [
            (x + GRID_STEP, y),
            (x, y + GRID_STEP),
            (x + GRID_STEP, y + GRID_STEP)  # diagonal connection
        ]
        for nx_, ny_ in neighbors:
            if nx_ <= MAP_WIDTH and ny_ <= MAP_HEIGHT:
                n_name = f"{nx_}_{ny_}"
                G.add_edge(node_name, n_name, weight=distance((x, y), (nx_, ny_)))

# Snap clicks to nearest node
def nearest_node(x, y):
    closest = None
    min_dist = float('inf')
    for n, data in G.nodes(data=True):
        nx_ = data['x']
        ny_ = data['y']
        d = distance((x, y), (nx_, ny_))
        if d < min_dist:
            closest = n
            min_dist = d
    return closest

# Route endpoint
@app.get("/route")
def route(
    sx: float = Query(...),
    sy: float = Query(...),
    ex: float = Query(...),
    ey: float = Query(...),
    mode: str = Query("walking")
):
    speed = TRAVEL_MODES.get(mode.lower(), 3.41)

    start_node = nearest_node(sx, sy)
    end_node = nearest_node(ex, ey)

    if start_node == end_node:
        path_coords = [(sx, sy)]
        total_dist_mi = 0
    else:
        try:
            path_nodes = nx.shortest_path(G, source=start_node, target=end_node, weight='weight')
            path_coords = [(G.nodes[n]['x'], G.nodes[n]['y']) for n in path_nodes]
            total_dist_pixels = sum(
                distance(path_coords[i], path_coords[i+1])
                for i in range(len(path_coords)-1)
            )
            total_dist_mi = total_dist_pixels * PIXEL_TO_KM * KM_TO_MI
        except nx.NetworkXNoPath:
            path_coords = [(sx, sy), (ex, ey)]
            total_dist_mi = distance((sx, sy), (ex, ey)) * PIXEL_TO_KM * KM_TO_MI

    time_hours = total_dist_mi / speed if total_dist_mi > 0 else 0

    return {
        "path": path_coords,
        "distance_mi": total_dist_mi,
        "time_hours": time_hours
    }
