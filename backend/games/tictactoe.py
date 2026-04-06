import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()
GAME_NAME = "Tic Tac Toe ⭕"

class TicTacToeGame:
    def __init__(self):
        self.board        = [""] * 9
        self.current_turn = None
        self.winner       = None
        self.last_first   = None
        self.scores:      dict[str, int] = {}
        self.connections: dict[str, WebSocket] = {}

    def reset(self, first_player: str):
        self.board        = [""] * 9
        self.current_turn = first_player
        self.winner       = None
        self.last_first   = first_player

    def next_first(self) -> str:
        players = list(self.connections.keys())
        if not self.last_first or self.last_first not in players:
            return players[0]
        # alternate
        idx = players.index(self.last_first)
        return players[(idx + 1) % len(players)]

    def symbol_for(self, player: str) -> str:
        players = list(self.connections.keys())
        return "X" if players and player == players[0] else "O"

    def check_winner(self) -> str | None:
        b = self.board
        lines = [(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]
        for a, b2, c in lines:
            if b[a] and b[a] == b[b2] == b[c]:
                return b[a]
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
    dead = []
    for player, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(player)
    for p in dead:
        game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def tictactoe_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    game.scores.setdefault(player, 0)
    registry.set_game(player, GAME_NAME)

    if len(game.connections) == 2 and game.current_turn is None:
        game.reset(game.next_first())
        for p in game.connections:
            registry.clear_game(p)

    await broadcast(game.state())

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "move":
                idx = data.get("index")
                if (game.current_turn == player and not game.winner
                        and isinstance(idx, int) and 0 <= idx < 9
                        and not game.board[idx]
                        and len(game.connections) == 2):
                    game.board[idx] = game.symbol_for(player)
                    result = game.check_winner()
                    if result:
                        game.winner = result
                        if result != "draw":
                            # find which player has this symbol
                            for p, ws in game.connections.items():
                                if game.symbol_for(p) == result:
                                    game.scores[p] = game.scores.get(p, 0) + 1
                    else:
                        players = list(game.connections.keys())
                        game.current_turn = next(p for p in players if p != player)
                    await broadcast(game.state())

            elif data.get("type") == "rematch":
                if game.winner:
                    game.reset(game.next_first())
                    for p in game.connections:
                        registry.clear_game(p)
                    await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.current_turn == player:
            game.winner = None
            game.current_turn = None
        await broadcast({**game.state(), "message": f"{player} disconnected."})