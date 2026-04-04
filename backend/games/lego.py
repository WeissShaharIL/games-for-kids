import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class LegoGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.bricks: list[dict] = []
        self.next_id = 0

    def add_brick(self, brick: dict) -> dict:
        brick["id"] = self.next_id
        self.next_id += 1
        self.bricks.append(brick)
        return brick

    def move_brick(self, brick_id: int, x: float, y: float) -> bool:
        for b in self.bricks:
            if b["id"] == brick_id:
                b["x"] = x
                b["y"] = y
                return True
        return False

    def rotate_brick(self, brick_id: int) -> bool:
        for b in self.bricks:
            if b["id"] == brick_id:
                b["rotation"] = (b.get("rotation", 0) + 90) % 360
                return True
        return False

    def delete_brick(self, brick_id: int) -> bool:
        for i, b in enumerate(self.bricks):
            if b["id"] == brick_id:
                self.bricks.pop(i)
                return True
        return False

    def clear(self):
        self.bricks = []

    def state(self) -> dict:
        return {
            "type":      "state",
            "bricks":    self.bricks,
            "connected": list(self.connections.keys()),
        }


game = LegoGame()


async def broadcast(msg: dict):
    dead = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def lego_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    await websocket.send_text(json.dumps(game.state()))

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "add":
                brick = game.add_brick({
                    "x":        data["x"],
                    "y":        data["y"],
                    "w":        data["w"],
                    "h":        data["h"],
                    "color":    data["color"],
                    "rotation": data.get("rotation", 0),
                    "placedBy": player,
                })
                await broadcast(game.state())

            elif data.get("type") == "move":
                if game.move_brick(data["id"], data["x"], data["y"]):
                    await broadcast(game.state())

            elif data.get("type") == "rotate":
                if game.rotate_brick(data["id"]):
                    await broadcast(game.state())

            elif data.get("type") == "delete":
                if game.delete_brick(data["id"]):
                    await broadcast(game.state())

            elif data.get("type") == "clear":
                game.clear()
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        await broadcast({**game.state(), "message": f"{player} disconnected."})