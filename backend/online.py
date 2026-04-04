# online.py - shared registry of currently connected players
# Each game imports this and calls register/unregister on connect/disconnect

online_users: set[str] = set()

def register(player: str):
    online_users.add(player)

def unregister(player: str):
    online_users.discard(player)

def get_online() -> list[str]:
    return sorted(online_users)