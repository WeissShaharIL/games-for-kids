import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME = "LEGO Builder 🧱"


class LegoGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.bricks: list[dict] = []
        self.next_id = 0

    def add_brick(self, brick: dict) -> dict:
        brick["id"] = self.next_id; self.next_id += 1
        self.bricks.append(brick); return brick

    def delete_brick(self, brick_id: int) -> bool:
        for i, b in enumerate(self.bricks):
            if b["id"] == brick_id: self.bricks.pop(i); return True
        return False

    def clear(self): self.bricks = []

    def state(self) -> dict:
        return {"type": "state", "bricks": self.bricks, "connected": list(self.connections.keys())}


game = LegoGame()


async def broadcast(msg: dict):
    dead = []
    for player, ws in game.connections.items():
        try: await ws.send_text(json.dumps(msg))
        except Exception: dead.append(player)
    for p in dead: game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def lego_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)
    await websocket.send_text(json.dumps(game.state()))

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            if data.get("type") == "add":
                game.add_brick({"col": int(data["col"]), "row": int(data["row"]),
                                "w": int(data["w"]), "h": int(data["h"]),
                                "color": data["color"], "placedBy": player})
                await broadcast(game.state())
            elif data.get("type") == "delete":
                if game.delete_brick(int(data["id"])): await broadcast(game.state())
            elif data.get("type") == "clear":
                game.clear(); await broadcast(game.state())
    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        await broadcast({**game.state(), "message": f"{player} disconnected."})