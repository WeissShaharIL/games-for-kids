import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# ── Game state ────────────────────────────────────────────────────────────────
class TicTacToeGame:
    def __init__(self):
        self.board        = [""] * 9
        self.current_turn = None        # "Ariel" | "Ella"
        self.winner       = None        # "Ariel" | "Ella" | "draw" | None
        self.last_first   = None        # who went first last game
        self.scores       = {"Ariel": 0, "Ella": 0}
        self.connections: dict[str, WebSocket] = {}

    def reset(self, first_player: str):
        self.board        = [""] * 9
        self.current_turn = first_player
        self.winner       = None
        self.last_first   = first_player

    def next_first(self) -> str:
        if self.last_first is None:
            return "Ariel"
        return "Ella" if self.last_first == "Ariel" else "Ariel"

    def symbol_for(self, player: str) -> str:
        return "X" if self.last_first == player else "O"

    def check_winner(self) -> str | None:
        b = self.board
        lines = [
            (0,1,2),(3,4,5),(6,7,8),
            (0,3,6),(1,4,7),(2,5,8),
            (0,4,8),(2,4,6),
        ]
        for a, b2, c in lines:
            if b[a] and b[a] == b[b2] == b[c]:
                return b[a]  # "X" or "O"
        if all(b):
            return "draw"
        return None

    def state(self) -> dict:
        connected = list(self.connections.keys())
        return {
            "type":         "state",
            "board":        self.board,
            "current_turn": self.current_turn,
            "winner":       self.winner,
            "scores":       self.scores,
            "last_first":   self.last_first,
            "connected":    connected,
            "symbols":      {p: self.symbol_for(p) for p in connected},
        }


game = TicTacToeGame()


async def broadcast(message: dict):
    disconnected = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            disconnected.append(player)
    for p in disconnected:
        game.connections.pop(p, None)


# ── WebSocket route ───────────────────────────────────────────────────────────
@router.websocket("/ws/{player}")
async def tictactoe_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket

    # Start game when both players are connected
    if len(game.connections) == 2 and game.current_turn is None:
        game.reset(game.next_first())

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            # ── Move ──────────────────────────────────────────────────────────
            if data.get("type") == "move":
                index = data.get("index")
                if game.winner:                    continue
                if game.current_turn != player:    continue
                if not isinstance(index, int):     continue
                if not (0 <= index <= 8):          continue
                if game.board[index]:              continue
                if len(game.connections) < 2:      continue

                game.board[index] = game.symbol_for(player)

                result = game.check_winner()
                if result == "draw":
                    game.winner = "draw"
                elif result:
                    game.winner = player
                    game.scores[player] += 1
                else:
                    other = "Ella" if player == "Ariel" else "Ariel"
                    game.current_turn = other

                await broadcast(game.state())

            # ── Rematch ───────────────────────────────────────────────────────
            elif data.get("type") == "rematch":
                if len(game.connections) == 2:
                    game.reset(game.next_first())
                    await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        game.current_turn = None
        await broadcast({
            **game.state(),
            "message": f"{player} disconnected. Waiting...",
        })