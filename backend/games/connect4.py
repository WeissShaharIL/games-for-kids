import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

ROWS = 6
COLS = 7

class Connect4Game:
    def __init__(self):
        self.board        = [[""]*COLS for _ in range(ROWS)]  # board[row][col]
        self.current_turn = None
        self.winner       = None
        self.last_first   = None
        self.scores       = {"Ariel": 0, "Ella": 0}
        self.connections: dict[str, WebSocket] = {}

    def reset(self, first_player: str):
        self.board        = [[""]*COLS for _ in range(ROWS)]
        self.current_turn = first_player
        self.winner       = None
        self.last_first   = first_player

    def next_first(self) -> str:
        if self.last_first is None:
            return "Ariel"
        return "Ella" if self.last_first == "Ariel" else "Ariel"

    def symbol_for(self, player: str) -> str:
        return "X" if self.last_first == player else "O"

    def drop(self, col: int, symbol: str) -> int | None:
        """Drop a disc in col, return the row it landed on, or None if full."""
        for row in range(ROWS - 1, -1, -1):
            if self.board[row][col] == "":
                self.board[row][col] = symbol
                return row
        return None

    def check_winner(self, symbol: str) -> bool:
        b = self.board
        # Horizontal
        for r in range(ROWS):
            for c in range(COLS - 3):
                if all(b[r][c+i] == symbol for i in range(4)):
                    return True
        # Vertical
        for r in range(ROWS - 3):
            for c in range(COLS):
                if all(b[r+i][c] == symbol for i in range(4)):
                    return True
        # Diagonal down-right
        for r in range(ROWS - 3):
            for c in range(COLS - 3):
                if all(b[r+i][c+i] == symbol for i in range(4)):
                    return True
        # Diagonal down-left
        for r in range(ROWS - 3):
            for c in range(3, COLS):
                if all(b[r+i][c-i] == symbol for i in range(4)):
                    return True
        return False

    def is_draw(self) -> bool:
        return all(self.board[0][c] != "" for c in range(COLS))

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


game = Connect4Game()


async def broadcast(message: dict):
    disconnected = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            disconnected.append(player)
    for p in disconnected:
        game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def connect4_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket

    if len(game.connections) == 2 and game.current_turn is None:
        game.reset(game.next_first())

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "drop":
                col = data.get("col")
                if game.winner:                    continue
                if game.current_turn != player:    continue
                if not isinstance(col, int):       continue
                if not (0 <= col < COLS):          continue
                if len(game.connections) < 2:      continue

                symbol = game.symbol_for(player)
                row    = game.drop(col, symbol)
                if row is None:
                    continue  # column full

                if game.check_winner(symbol):
                    game.winner = player
                    game.scores[player] += 1
                elif game.is_draw():
                    game.winner = "draw"
                else:
                    other = "Ella" if player == "Ariel" else "Ariel"
                    game.current_turn = other

                await broadcast(game.state())

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