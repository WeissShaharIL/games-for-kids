import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router = APIRouter()

GAME_NAME = "Tic Tac Toe ⭕"

class TicTacToeGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.board        = [''] * 9
        self.symbols      = {}
        self.current_turn = None
        self.winner       = None
        self.scores       = {"Ariel": 0, "Ella": 0}
        self.first_player = None

    def reset(self):
        self.board        = [''] * 9
        self.winner       = None
        if self.first_player:
            other = "Ella" if self.first_player == "Ariel" else "Ariel"
            self.first_player = other
            self.current_turn = other

    def check_winner(self):
        b = self.board
        lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
        for line in lines:
            if b[line[0]] and b[line[0]] == b[line[1]] == b[line[2]]:
                return b[line[0]]
        if all(b):
            return 'draw'
        return None

    def state(self):
        return {
            "type":         "state",
            "board":        self.board,
            "symbols":      self.symbols,
            "current_turn": self.current_turn,
            "winner":       self.winner,
            "scores":       self.scores,
            "connected":    list(self.connections.keys()),
        }


game = TicTacToeGame()


async def broadcast(msg: dict):
    dead = []
    for p, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            dead.append(p)
    for p in dead:
        game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def tictactoe_ws(websocket: WebSocket, player: str):
    if player not in ("Ariel", "Ella"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)

    if len(game.connections) == 2:
        players = list(game.connections.keys())
        game.symbols      = {players[0]: "X", players[1]: "O"}
        game.first_player = players[0]
        game.current_turn = players[0]
        game.reset()
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
                        and isinstance(idx, int) and 0 <= idx < 9 and not game.board[idx]):
                    game.board[idx] = game.symbols[player]
                    result = game.check_winner()
                    if result:
                        game.winner = result
                        if result != "draw":
                            winner_player = next(p for p, s in game.symbols.items() if s == result)
                            game.scores[winner_player] += 1
                    else:
                        other = "Ella" if player == "Ariel" else "Ariel"
                        game.current_turn = other
                    await broadcast(game.state())

            elif data.get("type") == "rematch":
                game.reset()
                await broadcast(game.state())

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        game.board        = [''] * 9
        game.winner       = None
        game.current_turn = None
        await broadcast({**game.state(), "message": f"{player} disconnected."})