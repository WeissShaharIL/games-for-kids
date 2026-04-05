import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME   = "4 in a Row 🔴"
ROWS        = 6
COLS        = 7
MAX_PLAYERS = 2


class Connect4Game:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.board        = [['' for _ in range(COLS)] for _ in range(ROWS)]
        self.current_turn = None
        self.winner       = None
        self.scores       = {}
        self.symbols      = {}
        self.first_player = None

    def reset(self):
        self.board  = [['' for _ in range(COLS)] for _ in range(ROWS)]
        self.winner = None
        if self.first_player:
            players = list(self.connections.keys())
            other   = next((p for p in players if p != self.first_player), self.first_player)
            self.first_player = other
            self.current_turn = other

    def start(self):
        players = list(self.connections.keys())
        self.symbols      = {players[0]: "🔴", players[1]: "🟡"}
        self.first_player = players[0]
        self.current_turn = players[0]
        self.board        = [['' for _ in range(COLS)] for _ in range(ROWS)]
        self.winner       = None

    def drop(self, col: int, symbol: str) -> int | None:
        for row in range(ROWS - 1, -1, -1):
            if not self.board[row][col]:
                self.board[row][col] = symbol; return row
        return None

    def check_winner(self, symbol: str) -> bool:
        b = self.board
        for r in range(ROWS):
            for c in range(COLS):
                if c+3 < COLS and all(b[r][c+i]==symbol for i in range(4)): return True
                if r+3 < ROWS and all(b[r+i][c]==symbol for i in range(4)): return True
                if r+3 < ROWS and c+3 < COLS and all(b[r+i][c+i]==symbol for i in range(4)): return True
                if r+3 < ROWS and c-3 >= 0   and all(b[r+i][c-i]==symbol for i in range(4)): return True
        return False

    def state(self):
        return {"type":"state","board":self.board,"symbols":self.symbols,"current_turn":self.current_turn,
                "winner":self.winner,"scores":self.scores,"connected":list(self.connections.keys())}


game = Connect4Game()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try: await ws.send_text(json.dumps(msg))
        except Exception: dead.append(p)
    for p in dead: game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def connect4_ws(websocket: WebSocket, player: str):
    if len(game.connections) >= MAX_PLAYERS and player not in game.connections:
        await websocket.close(code=4001); return

    await websocket.accept()
    game.connections[player] = websocket
    if player not in game.scores: game.scores[player] = 0
    registry.set_game(player, GAME_NAME)

    if len(game.connections) == 2:
        game.start()
        for p in game.connections: registry.clear_game(p)

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "drop":
                col = data.get("col")
                if (game.current_turn == player and not game.winner
                        and isinstance(col, int) and 0 <= col < COLS
                        and len(game.connections) == 2):
                    symbol = game.symbols.get(player)
                    if symbol:
                        row = game.drop(col, symbol)
                        if row is not None:
                            if game.check_winner(symbol):
                                game.winner = player
                                game.scores[player] = game.scores.get(player, 0) + 1
                            elif all(game.board[0][c] for c in range(COLS)):
                                game.winner = "draw"
                            else:
                                players = list(game.connections.keys())
                                other   = next(p for p in players if p != player)
                                game.current_turn = other
                            await broadcast(game.state())

            elif data.get("type") == "rematch":
                game.reset(); await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        game.board = [['' for _ in range(COLS)] for _ in range(ROWS)]
        game.winner = None; game.current_turn = None; game.symbols = {}; game.first_player = None
        await broadcast({**game.state(), "message": f"{player} disconnected."})