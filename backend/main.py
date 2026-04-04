import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from games.tictactoe import router as tictactoe_router
from games.connect4   import router as connect4_router
from games.snake      import router as snake_router
from games.spinner    import router as spinner_router

load_dotenv()

PIN_ARIEL = os.getenv("PIN_ARIEL", "1111")
PIN_ELLA  = os.getenv("PIN_ELLA",  "2222")

PINS = {
    PIN_ARIEL: "Ariel",
    PIN_ELLA:  "Ella",
}

app = FastAPI(title="Kids Game Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/auth")
async def auth(payload: dict):
    pin  = str(payload.get("pin", ""))
    name = PINS.get(pin)
    if not name:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    return {"player": name}

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(tictactoe_router, prefix="/tictactoe")
app.include_router(connect4_router,  prefix="/connect4")
app.include_router(snake_router,     prefix="/snake")
app.include_router(spinner_router,   prefix="/spinner")