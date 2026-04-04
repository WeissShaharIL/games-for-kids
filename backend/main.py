import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from games.tictactoe import router as tictactoe_router
from games.connect4   import router as connect4_router

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
PIN_ARIEL = os.getenv("PIN_ARIEL", "1111")
PIN_ELLA  = os.getenv("PIN_ELLA",  "2222")

PINS = {
    PIN_ARIEL: "Ariel",
    PIN_ELLA:  "Ella",
}

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Kids Game Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/auth")
async def auth(payload: dict):
    pin  = str(payload.get("pin", ""))
    name = PINS.get(pin)
    if not name:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    return {"player": name}

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}

# ── Games ─────────────────────────────────────────────────────────────────────
# To add a new game:
#   1. Create backend/games/<game>.py with a FastAPI router
#   2. Import and include it here
app.include_router(tictactoe_router, prefix="/tictactoe")
app.include_router(connect4_router,  prefix="/connect4")