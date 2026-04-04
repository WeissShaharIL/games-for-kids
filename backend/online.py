# online.py - shared registry of connected players and their current game

online_users: set[str]       = set()
user_games:   dict[str, str] = {}   # player -> game name they're waiting in

def register(player: str):
    online_users.add(player)

def unregister(player: str):
    online_users.discard(player)
    user_games.pop(player, None)

def set_game(player: str, game: str):
    user_games[player] = game

def clear_game(player: str):
    user_games.pop(player, None)

def get_online() -> list[str]:
    return sorted(online_users)

def get_status() -> dict:
    return dict(user_games)