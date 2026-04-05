import os
import uuid
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from games.tictactoe  import router as tictactoe_router
from games.connect4   import router as connect4_router
from games.snake      import router as snake_router
from games.spinner    import router as spinner_router
from games.balloons   import router as balloons_router
from games.shooter    import router as shooter_router
from games.airhockey  import router as airhockey_router
from games.lego       import router as lego_router
from games.mountain   import router as mountain_router
import online as registry

load_dotenv()

PLAYERS_CONFIG: list[dict] = []
PINS: dict[str, str] = {}

i = 1
while True:
    val = os.getenv(f"PLAYER_{i}")
    if not val:
        break
    parts = val.strip().split(":")
    if len(parts) >= 6:
        name, pin, color, light, bg, emoji = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        PLAYERS_CONFIG.append({"name": name, "color": color, "light": light, "bg": bg, "emoji": emoji})
        PINS[pin] = name
    i += 1

if not PLAYERS_CONFIG:
    defaults = [
        ("Ariel", os.getenv("PIN_ARIEL", "1111"), "#16a34a", "#dcfce7", "#f0fdf4", "🦁"),
        ("Ella",  os.getenv("PIN_ELLA",  "2222"), "#db2777", "#fce7f3", "#fdf2f8", "🦋"),
    ]
    for name, pin, color, light, bg, emoji in defaults:
        PLAYERS_CONFIG.append({"name": name, "color": color, "light": light, "bg": bg, "emoji": emoji})
        PINS[pin] = name

# ── Session persistence ────────────────────────────────────────────────────────
SESSIONS_FILE = Path("/tmp/gfk_sessions.json")

def _load_sessions() -> dict:
    try:
        if SESSIONS_FILE.exists():
            return json.loads(SESSIONS_FILE.read_text())
    except Exception:
        pass
    return {}

def _save_sessions(sessions: dict):
    try:
        SESSIONS_FILE.write_text(json.dumps(sessions))
    except Exception:
        pass

# Load sessions on startup — survives Docker restarts if /tmp is preserved,
# but more importantly survives uvicorn reloads (dev mode)
active_sessions: dict[str, str] = _load_sessions()

# Re-register all persisted sessions into the online registry
for name in active_sessions:
    registry.register(name)

app = FastAPI(title="Kids Game Hub")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/players")
async def get_players():
    return {"players": PLAYERS_CONFIG}

@app.post("/auth")
async def auth(payload: dict):
    pin  = str(payload.get("pin", ""))
    name = PINS.get(pin)
    if not name:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    if name in active_sessions:
        raise HTTPException(status_code=409, detail=f"{name} is already logged in on another device")
    token = str(uuid.uuid4())
    active_sessions[name] = token
    _save_sessions(active_sessions)
    registry.register(name)
    return {"player": name, "token": token}

@app.post("/resume")
async def resume(payload: dict):
    """Called on page refresh — validates the session is still active."""
    name  = payload.get("player", "")
    token = payload.get("token", "")
    if active_sessions.get(name) == token:
        registry.register(name)  # re-register in case of restart
        return {"ok": True, "player": name, "token": token}
    raise HTTPException(status_code=401, detail="Session expired")

@app.post("/logout")
async def logout(payload: dict):
    name  = payload.get("player", "")
    token = payload.get("token", "")
    if name and active_sessions.get(name) == token:
        active_sessions.pop(name, None)
        _save_sessions(active_sessions)
        registry.unregister(name)
    return {"ok": True}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/online")
async def online():
    return {"online": registry.get_online(), "waiting": registry.get_status()}

app.include_router(tictactoe_router, prefix="/tictactoe")
app.include_router(connect4_router,  prefix="/connect4")
app.include_router(snake_router,     prefix="/snake")
app.include_router(spinner_router,   prefix="/spinner")
app.include_router(balloons_router,  prefix="/balloons")
app.include_router(shooter_router,   prefix="/shooter")
app.include_router(airhockey_router, prefix="/airhockey")
app.include_router(lego_router,      prefix="/lego")
app.include_router(mountain_router,  prefix="/mountain")