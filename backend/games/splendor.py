import json
import random
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import online as registry

router    = APIRouter()
GAME_NAME = "Splendor \u2728"

# ── Gem colors ────────────────────────────────────────────────────────────────
GEMS    = ["white", "blue", "green", "red", "black"]
ALL_GEMS = GEMS + ["gold"]

GEM_EMOJI = {
    "white": "\u25cb", "blue": "\u25c6", "green": "\u2665",
    "red": "\u2665",   "black": "\u25a0", "gold": "\u2605"
}

# ── Full card database ─────────────────────────────────────────────────────────
# Each card: (tier, bonus_gem, vp, cost: {white,blue,green,red,black})
RAW_CARDS = [
    # ── TIER 1 (40 cards) ──
    (1,"black",0,{"blue":1,"green":1,"red":1,"white":1}),
    (1,"black",0,{"blue":1,"red":2}),
    (1,"black",0,{"blue":2,"green":2}),
    (1,"black",0,{"red":2,"white":1}),
    (1,"black",0,{"black":3}),
    (1,"black",0,{"blue":1,"green":2,"white":1}),
    (1,"black",0,{"green":1,"red":1,"white":2}),
    (1,"black",1,{"blue":2,"green":1,"red":1,"white":1}),
    (1,"blue", 0,{"white":1,"red":1,"black":1,"green":1}),
    (1,"blue", 0,{"white":1,"black":2}),
    (1,"blue", 0,{"white":2,"red":2}),
    (1,"blue", 0,{"green":2,"black":1}),
    (1,"blue", 0,{"blue":3}),
    (1,"blue", 0,{"white":1,"red":1,"black":2}),
    (1,"blue", 0,{"white":2,"green":1,"black":1}),
    (1,"blue", 1,{"white":1,"green":1,"red":2,"black":1}),
    (1,"green",0,{"white":1,"blue":1,"red":1,"black":1}),
    (1,"green",0,{"blue":1,"white":2}),
    (1,"green",0,{"blue":2,"black":2}),
    (1,"green",0,{"white":1,"blue":2}),
    (1,"green",0,{"green":3}),
    (1,"green",0,{"blue":1,"white":2,"black":1}),
    (1,"green",0,{"blue":2,"red":1,"white":1}),
    (1,"green",1,{"blue":3,"green":1,"red":1}),
    (1,"red",  0,{"white":1,"blue":1,"green":1,"black":1}),
    (1,"red",  0,{"green":1,"black":2}),
    (1,"red",  0,{"green":2,"white":2}),
    (1,"red",  0,{"blue":1,"green":2}),
    (1,"red",  0,{"red":3}),
    (1,"red",  0,{"green":2,"blue":1,"black":1}),
    (1,"red",  0,{"green":1,"white":1,"blue":1,"red":1}),
    (1,"red",  1,{"green":2,"red":1,"white":1,"black":1}),
    (1,"white",0,{"blue":1,"green":1,"red":1,"black":1}),
    (1,"white",0,{"red":1,"green":2}),
    (1,"white",0,{"red":2,"black":2}),
    (1,"white",0,{"black":2,"red":1}),
    (1,"white",0,{"white":3}),
    (1,"white",0,{"black":2,"red":1,"green":1}),
    (1,"white",0,{"black":1,"red":2,"green":1}),
    (1,"white",1,{"red":2,"black":2,"white":1}),
    # ── TIER 2 (30 cards) ──
    (2,"black",1,{"red":2,"white":3}),
    (2,"black",1,{"blue":3,"green":2,"white":3}),
    (2,"black",2,{"blue":1,"green":4}),
    (2,"black",2,{"green":5,"blue":1}),
    (2,"black",2,{"blue":3,"black":2,"white":2}),
    (2,"black",3,{"black":6}),
    (2,"blue", 1,{"white":2,"black":3}),
    (2,"blue", 1,{"red":3,"white":2,"black":3}),
    (2,"blue", 2,{"black":1,"white":4}),
    (2,"blue", 2,{"white":5,"green":1}),
    (2,"blue", 2,{"red":2,"white":2,"black":3}),
    (2,"blue", 3,{"blue":6}),
    (2,"green",1,{"blue":2,"black":3}),
    (2,"green",1,{"blue":3,"black":2,"red":3}),
    (2,"green",2,{"blue":4,"red":1}),
    (2,"green",2,{"blue":5,"black":1}),
    (2,"green",2,{"blue":2,"green":2,"red":3}),
    (2,"green",3,{"green":6}),
    (2,"red",  1,{"green":3,"blue":2}),
    (2,"red",  1,{"white":2,"green":3,"red":3}),
    (2,"red",  2,{"green":4,"blue":1}),
    (2,"red",  2,{"red":5,"white":1}),
    (2,"red",  2,{"green":3,"red":2,"blue":2}),
    (2,"red",  3,{"red":6}),
    (2,"white",1,{"green":2,"red":3}),
    (2,"white",1,{"green":2,"red":3,"black":2}),
    (2,"white",2,{"red":4,"black":1}),
    (2,"white",2,{"black":5,"red":1}),
    (2,"white",2,{"black":3,"white":2,"red":2}),
    (2,"white",3,{"white":6}),
    # ── TIER 3 (20 cards) ──
    (3,"black",3,{"black":3,"red":3,"white":3,"blue":5}),
    (3,"black",4,{"blue":3,"green":3,"red":3,"white":3}),
    (3,"black",4,{"green":7}),
    (3,"black",5,{"blue":3,"green":7}),
    (3,"black",5,{"red":7,"black":3}),
    (3,"blue", 3,{"white":3,"black":3,"green":3,"red":5}),
    (3,"blue", 4,{"white":3,"black":3,"green":3,"red":3}),
    (3,"blue", 4,{"red":7}),
    (3,"blue", 5,{"white":3,"red":7}),
    (3,"blue", 5,{"black":7,"green":3}),
    (3,"green",3,{"white":3,"blue":3,"black":3,"green":5}),
    (3,"green",4,{"white":3,"blue":3,"red":3,"black":3}),
    (3,"green",4,{"black":7}),
    (3,"green",5,{"white":7,"blue":3}),
    (3,"green",5,{"blue":7,"red":3}),
    (3,"red",  3,{"blue":3,"green":3,"white":3,"black":5}),
    (3,"red",  4,{"white":3,"blue":3,"green":3,"black":3}),
    (3,"red",  4,{"white":7}),
    (3,"red",  5,{"green":7,"white":3}),
    (3,"red",  5,{"white":7,"black":3}),
    (3,"white",3,{"white":5,"blue":3,"green":3,"black":3}),
    (3,"white",4,{"blue":3,"green":3,"red":3,"black":3}),
    (3,"white",4,{"blue":7}),
    (3,"white",5,{"black":7,"red":3}),
    (3,"white",5,{"green":7,"blue":3}),
]

# ── Nobles (10 total, pick 3 per game) ────────────────────────────────────────
RAW_NOBLES = [
    {"vp": 3, "req": {"white": 4, "green": 4}},
    {"vp": 3, "req": {"white": 3, "blue": 3, "black": 3}},
    {"vp": 3, "req": {"blue": 4, "green": 4}},
    {"vp": 3, "req": {"blue": 3, "green": 3, "red": 3}},
    {"vp": 3, "req": {"green": 4, "red": 4}},
    {"vp": 3, "req": {"white": 4, "red": 4}},
    {"vp": 3, "req": {"white": 3, "red": 3, "black": 3}},
    {"vp": 3, "req": {"red": 4, "black": 4}},
    {"vp": 3, "req": {"blue": 4, "black": 4}},
    {"vp": 3, "req": {"white": 4, "blue": 4}},
]

def make_card(idx, tier, bonus, vp, cost):
    return {"id": idx, "tier": tier, "bonus": bonus, "vp": vp,
            "cost": {g: cost.get(g, 0) for g in GEMS}}

def empty_gems():
    return {g: 0 for g in ALL_GEMS}

def empty_gems_no_gold():
    return {g: 0 for g in GEMS}


class SplendorGame:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.phase   = "lobby"   # lobby | playing | result
        self.host    = None
        self.players: list[str] = []
        self.turn_idx = 0
        self.bank     = {}
        self.decks:   dict[int, list] = {1: [], 2: [], 3: []}
        self.board:   dict[int, list] = {1: [], 2: [], 3: []}
        self.nobles:  list = []
        self.hands:   dict[str, dict] = {}
        self.winner   = None
        self.final_round = False
        self.final_round_trigger = None
        self.discard_player = None   # player who must discard gems
        self.discard_count  = 0      # how many to discard

    def _init_player(self, name):
        self.hands[name] = {
            "gems":     empty_gems(),
            "cards":    [],       # bought cards
            "reserved": [],       # reserved cards (max 3)
            "nobles":   [],
            "vp":       0,
        }

    def _card_bonus(self, name):
        """Permanent gem bonuses from bought cards."""
        bonus = empty_gems_no_gold()
        for c in self.hands[name]["cards"]:
            bonus[c["bonus"]] += 1
        return bonus

    def _gem_count(self, name):
        return sum(self.hands[name]["gems"].values())

    def setup(self):
        n = len(self.players)
        # Bank gems
        per_gem = 4 if n == 2 else (5 if n == 3 else 7)
        self.bank = {g: per_gem for g in GEMS}
        self.bank["gold"] = 5

        # Build decks
        all_cards = [make_card(i, *c) for i, c in enumerate(RAW_CARDS)]
        for tier in [1, 2, 3]:
            tier_cards = [c for c in all_cards if c["tier"] == tier]
            random.shuffle(tier_cards)
            self.decks[tier] = tier_cards

        # Deal 4 cards per tier to board
        for tier in [1, 2, 3]:
            self.board[tier] = []
            for _ in range(4):
                if self.decks[tier]:
                    self.board[tier].append(self.decks[tier].pop())

        # Pick nobles
        nobles = RAW_NOBLES[:]
        random.shuffle(nobles)
        self.nobles = [{"id": i, **n} for i, n in enumerate(nobles[:n + 1])]

        # Init player hands
        for p in self.players:
            self._init_player(p)

        self.turn_idx = 0
        self.phase = "playing"
        self.winner = None
        self.final_round = False
        self.final_round_trigger = None
        self.discard_player = None
        self.discard_count  = 0

    @property
    def current_player(self):
        if not self.players:
            return None
        return self.players[self.turn_idx % len(self.players)]

    def _fill_board(self, tier):
        while len(self.board[tier]) < 4 and self.decks[tier]:
            self.board[tier].append(self.decks[tier].pop())

    def _check_nobles(self, name):
        """Award any noble the player qualifies for."""
        bonus = self._card_bonus(name)
        for noble in self.nobles[:]:
            if all(bonus.get(g, 0) >= v for g, v in noble["req"].items()):
                if noble not in self.hands[name]["nobles"]:
                    self.hands[name]["nobles"].append(noble)
                    self.hands[name]["vp"] += noble["vp"]
                    self.nobles.remove(noble)

    def _total_vp(self, name):
        return self.hands[name]["vp"]

    def _next_turn(self):
        self.turn_idx = (self.turn_idx + 1) % len(self.players)
        # Check if final round complete
        if self.final_round and self.players[self.turn_idx] == self.final_round_trigger:
            # Game over — find winner
            scores = {p: self._total_vp(p) for p in self.players}
            max_vp = max(scores.values())
            winners = [p for p, vp in scores.items() if vp == max_vp]
            # Tiebreak: fewest cards
            if len(winners) > 1:
                min_cards = min(len(self.hands[p]["cards"]) for p in winners)
                winners = [p for p in winners if len(self.hands[p]["cards"]) == min_cards]
            self.winner = winners[0]
            self.phase = "result"

    def action_take_gems(self, player, gems: dict) -> str:
        """Take up to 3 different gems OR 2 same (if >=4 available)."""
        if player != self.current_player:
            return "Not your turn"
        gem_list = [g for g, v in gems.items() for _ in range(v)]
        total = len(gem_list)
        if total == 0:
            return "Pick at least 1 gem"
        if total > 3:
            return "Too many gems"
        # 2 same
        if total == 2 and len(set(gem_list)) == 1:
            g = gem_list[0]
            if self.bank.get(g, 0) < 4:
                return f"Need 4 {g} gems in bank"
            self.bank[g] -= 2
            self.hands[player]["gems"][g] += 2
        elif total <= 3 and len(set(gem_list)) == total:
            # 1-3 different
            for g in gem_list:
                if self.bank.get(g, 0) <= 0:
                    return f"No {g} gems in bank"
                self.bank[g] -= 1
                self.hands[player]["gems"][g] += 1
        else:
            return "Invalid gem selection"
        # If player now has >10 gems they must discard down to 10
        over = self._gem_count(player) - 10
        if over > 0:
            self.discard_player = player
            self.discard_count  = over
            return "discard"
        self._check_nobles(player)
        self._advance_final(player)
        self._next_turn()
        return "ok"

    def action_discard_gems(self, player, gems: dict) -> str:
        """Player discards gems after taking too many (must discard exactly discard_count)."""
        if player != self.discard_player:
            return "Not your turn to discard"
        total = sum(gems.values())
        if total != self.discard_count:
            return f"Must discard exactly {self.discard_count} gems"
        for g, v in gems.items():
            if v < 0:
                return "Invalid discard"
            if self.hands[player]["gems"].get(g, 0) < v:
                return f"Not enough {g} to discard"
        # Apply discard
        for g, v in gems.items():
            self.hands[player]["gems"][g] -= v
            self.bank[g] = self.bank.get(g, 0) + v
        self.discard_player = None
        self.discard_count  = 0
        self._check_nobles(player)
        self._advance_final(player)
        self._next_turn()
        return "ok"

    def action_buy_card(self, player, card_id: int, from_reserve: bool = False, payment: dict = None) -> str:
        if player != self.current_player:
            return "Not your turn"
        # Find card
        card = None
        tier = None
        board_idx = None
        if from_reserve:
            for i, c in enumerate(self.hands[player]["reserved"]):
                if c["id"] == card_id:
                    card = c
                    board_idx = i
                    break
        else:
            for t in [1, 2, 3]:
                for i, c in enumerate(self.board[t]):
                    if c["id"] == card_id:
                        card = c
                        tier = t
                        board_idx = i
                        break
        if card is None:
            return "Card not found"
        # Calculate cost after bonuses
        bonus = self._card_bonus(player)
        cost = {}
        for g in GEMS:
            needed = max(0, card["cost"][g] - bonus.get(g, 0))
            cost[g] = needed
        hand_gems = self.hands[player]["gems"]

        if payment:
            # Validate explicit payment from client
            gold_used = payment.get("gold", 0)
            for g in GEMS:
                gem_pay = payment.get(g, 0)
                if gem_pay > hand_gems.get(g, 0):
                    return f"Not enough {g}"
                covered = gem_pay + bonus.get(g, 0)
                if covered < card["cost"][g]:
                    gold_used += card["cost"][g] - covered
            if gold_used > hand_gems.get("gold", 0):
                return "Not enough gold"
            # Apply payment
            for g in GEMS:
                gem_pay = min(payment.get(g, 0), hand_gems.get(g, 0))
                hand_gems[g] -= gem_pay
                self.bank[g] += gem_pay
            gold_actually_needed = 0
            for g in GEMS:
                covered = (payment.get(g, 0) + bonus.get(g, 0))
                gold_actually_needed += max(0, card["cost"][g] - covered)
            hand_gems["gold"] -= gold_actually_needed
            self.bank["gold"] += gold_actually_needed
        else:
            # Auto-calculate payment
            gold_needed = 0
            for g in GEMS:
                deficit = max(0, cost[g] - hand_gems.get(g, 0))
                gold_needed += deficit
            if gold_needed > hand_gems.get("gold", 0):
                return "Cannot afford"
            for g in GEMS:
                pay = min(cost[g], hand_gems.get(g, 0))
                hand_gems[g] -= pay
                self.bank[g] += pay
                deficit = cost[g] - pay
                if deficit > 0:
                    hand_gems["gold"] -= deficit
                    self.bank["gold"] += deficit
        # Add card
        self.hands[player]["cards"].append(card)
        self.hands[player]["vp"] += card["vp"]
        # Remove from board/reserve
        if from_reserve:
            self.hands[player]["reserved"].pop(board_idx)
        else:
            self.board[tier].pop(board_idx)
            self._fill_board(tier)
        self._check_nobles(player)
        self._advance_final(player)
        self._next_turn()
        return "ok"

    def action_reserve_card(self, player, card_id: int, tier: int = None) -> str:
        if player != self.current_player:
            return "Not your turn"
        if len(self.hands[player]["reserved"]) >= 3:
            return "Already have 3 reserved"
        card = None
        board_tier = None
        board_idx = None
        # Check board
        for t in [1, 2, 3]:
            for i, c in enumerate(self.board[t]):
                if c["id"] == card_id:
                    card = c
                    board_tier = t
                    board_idx = i
                    break
        # Check top of deck (card_id == -1, -2, -3 for tier 1,2,3)
        if card is None and card_id < 0:
            t = abs(card_id)
            if t in [1, 2, 3] and self.decks[t]:
                card = self.decks[t].pop()
                board_tier = None
        if card is None:
            return "Card not found"
        # Reserve
        self.hands[player]["reserved"].append(card)
        if board_tier is not None:
            self.board[board_tier].pop(board_idx)
            self._fill_board(board_tier)
        # Give gold if available
        if self.bank["gold"] > 0:
            self.bank["gold"] -= 1
            self.hands[player]["gems"]["gold"] += 1
        # If player now has >10 gems they must discard down to 10
        over = self._gem_count(player) - 10
        if over > 0:
            self.discard_player = player
            self.discard_count  = over
            return "discard"
        self._advance_final(player)
        self._next_turn()
        return "ok"

    def _advance_final(self, player):
        if self._total_vp(player) >= 15 and not self.final_round:
            self.final_round = True
            self.final_round_trigger = player

    def state(self, viewer=None, last_action=None) -> dict:
        hands_view = {}
        for p, h in self.hands.items():
            hands_view[p] = {
                "gems":     h["gems"],
                "cards":    h["cards"],
                "reserved": h["reserved"] if p == viewer else [{"hidden": True} for _ in h["reserved"]],
                "nobles":   h["nobles"],
                "vp":       h["vp"],
                "bonus":    self._card_bonus(p),
                "gem_count": self._gem_count(p),
            }
        return {
            "phase":        self.phase,
            "host":         self.host,
            "players":      self.players,
            "connected":    list(self.connections.keys()),
            "current":      self.current_player,
            "bank":         self.bank,
            "board":        {str(t): self.board[t] for t in [1, 2, 3]},
            "deck_counts":  {str(t): len(self.decks[t]) for t in [1, 2, 3]},
            "nobles":       self.nobles,
            "hands":        hands_view,
            "winner":       self.winner,
            "final_round":  self.final_round,
            "final_trigger": self.final_round_trigger,
            "last_action":   last_action,
            "discard_player": self.discard_player,
            "discard_count":  self.discard_count,
        }


game = SplendorGame()


async def broadcast(last_action=None):
    dead = []
    for name, ws in game.connections.items():
        try:
            await ws.send_text(json.dumps(game.state(viewer=name, last_action=last_action)))
        except Exception:
            dead.append(name)
    for p in dead:
        game.connections.pop(p, None)


@router.websocket("/ws/{player}")
async def splendor_ws(websocket: WebSocket, player: str):
    await websocket.accept()
    game.connections[player] = websocket
    registry.set_game(player, GAME_NAME)

    if game.host is None:
        game.host = player
    if player not in game.players:
        game.players.append(player)
    if player not in game.hands:
        game.hands[player] = {
            "gems": empty_gems(), "cards": [], "reserved": [],
            "nobles": [], "vp": 0,
        }

    await broadcast()

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            t    = data.get("type")

            if t == "start" and player == game.host and game.phase == "lobby":
                if len(game.players) >= 2:
                    game.setup()
                    await broadcast()

            elif t == "discard_gems" and game.phase == "playing":
                gems = data.get("gems", {})
                err  = game.action_discard_gems(player, gems)
                if err != "ok":
                    await websocket.send_text(json.dumps({"error": err}))
                else:
                    await broadcast(last_action={
                        "type": "discard_gems",
                        "player": player,
                        "gems": gems,
                    })

            elif t == "take_gems" and game.phase == "playing":
                gems = data.get("gems", {})
                err  = game.action_take_gems(player, gems)
                if err not in ("ok", "discard"):
                    await websocket.send_text(json.dumps({"error": err}))
                else:
                    await broadcast(last_action={
                        "type": "take_gems",
                        "player": player,
                        "gems": gems,
                    })

            elif t == "buy_card" and game.phase == "playing":
                card_id = data["card_id"]
                from_reserve = data.get("from_reserve", False)
                # find card before buying for animation info
                card_info = None
                for tier in [1,2,3]:
                    for c in game.board[tier]:
                        if c["id"] == card_id:
                            card_info = {"id": c["id"], "bonus": c["bonus"], "tier": c["tier"]}
                            break
                if not card_info:
                    for c in game.hands.get(player, {}).get("reserved", []):
                        if c["id"] == card_id:
                            card_info = {"id": c["id"], "bonus": c["bonus"], "tier": c["tier"]}
                            break
                err = game.action_buy_card(player, card_id, from_reserve=from_reserve, payment=data.get("payment"))
                if err != "ok":
                    await websocket.send_text(json.dumps({"error": err}))
                else:
                    await broadcast(last_action={
                        "type": "buy_card",
                        "player": player,
                        "card": card_info,
                        "from_reserve": from_reserve,
                    })

            elif t == "reserve_card" and game.phase == "playing":
                card_id = data["card_id"]
                # find card info before reserving
                card_info = None
                for tier in [1,2,3]:
                    for c in game.board[tier]:
                        if c["id"] == card_id:
                            card_info = {"id": c["id"], "bonus": c["bonus"], "tier": c["tier"]}
                            break
                err = game.action_reserve_card(player, card_id)
                if err not in ("ok", "discard"):
                    await websocket.send_text(json.dumps({"error": err}))
                else:
                    await broadcast(last_action={
                        "type": "reserve_card",
                        "player": player,
                        "card": card_info,
                    })

            elif t == "restart" and player == game.host:
                game.phase    = "lobby"
                game.players  = list(game.connections.keys())
                game.hands    = {}
                game.winner   = None
                game.host     = player
                for p in game.players:
                    game.hands[p] = {
                        "gems": empty_gems(), "cards": [], "reserved": [],
                        "nobles": [], "vp": 0,
                    }
                await broadcast()

    except WebSocketDisconnect:
        game.connections.pop(player, None)
        registry.clear_game(player)
        if game.host == player:
            game.host = next(iter(game.connections), None)
        if player in game.players and game.phase == "lobby":
            game.players.remove(player)
        await broadcast()