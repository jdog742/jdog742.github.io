// gamelogic.js
//
// Pure game-rules layer for One Night Ultimate Werewolf.
//
// Nothing in this file touches the DOM, localStorage, or any global UI
// state. Every function takes plain data in and returns plain data out,
// so it can be unit-tested in isolation and, later, dropped wholesale
// into a server (the only place these rules can truly be trusted, since
// a client could otherwise just read its own hidden role out of memory).
//
// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
// gameState.cardSlots: { [playerName]: role, center1: role, center2: role, center3: role }
//   This is the CURRENT location of every card. It starts as a copy of the
//   deal and is mutated as night actions resolve (Robber/Troublemaker/Drunk
//   swap cards around in here).
//
// gameState.originalRoles: { [playerName]: role }
//   The role each player was originally dealt, before any swaps. Used to
//   decide which night action a player performs (you act based on the role
//   you woke up as, not whatever you ended up holding).
//
// submittedActions: { [playerName]: action }
//   Collected simultaneously from all clients before resolution. Only
//   roles with a choice need an entry (see ROLE_RESOLVERS below for the
//   shape each role expects). Roles with no choice can be omitted.
//
// resolveNight(...) returns:
//   {
//     finalBoard: { ...same shape as cardSlots, post-swap },
//     snapshots: { [playerName]: snapshot }
//   }
//   A "snapshot" is exactly what that player learned at the moment their
//   role resolved -- this is what the morning reveal/"your role" screen
//   should render for them. Its shape varies by role; see RESOLVERS.

// ---------------------------------------------------------------------------
// Role catalog
// ---------------------------------------------------------------------------

// Order in which roles resolve. Roles not in this list (Villager, Tanner)
// have no night action and never resolve.
const NIGHT_ORDER = [
    "Werewolf",
    "Minion",
    "Mason",
    "Seer",
    "Robber",
    "Troublemaker",
    "Drunk",
    "Insomniac",
  ];
  
  const CENTER_SLOTS = ["center1", "center2", "center3"];
  
  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------
  
  /**
   * Shuffle `selectedRoles` and deal one card to each player plus three to
   * the center. Returns the initial board state. Requires
   * selectedRoles.length === players.length + 3.
   */
  function dealCards(players, selectedRoles) {
    if (selectedRoles.length !== players.length + 3) {
      throw new Error(
        `Expected ${players.length + 3} roles for ${players.length} players, got ${selectedRoles.length}`
      );
    }
  
    const shuffled = shuffle(selectedRoles);
  
    const cardSlots = {};
    players.forEach((player, i) => {
      cardSlots[player] = shuffled[i];
    });
    CENTER_SLOTS.forEach((slot, i) => {
      cardSlots[slot] = shuffled[players.length + i];
    });
  
    return {
      players: [...players],
      selectedRoles: [...selectedRoles],
      cardSlots,
      originalRoles: { ...cardSlots }, // snapshot before any swaps happen
    };
  }
  
  function shuffle(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  
  // ---------------------------------------------------------------------------
  // Night resolution
  // ---------------------------------------------------------------------------
  
  /**
   * Resolve a full night: replay every role's action in NIGHT_ORDER against
   * one shared mutable board, recording each player's snapshot at the exact
   * moment their role resolves. Players act simultaneously from the UI's
   * point of view -- this function is what imposes order afterward.
   */
  function resolveNight(gameState, submittedActions = {}) {
    const board = { ...gameState.cardSlots };
    const snapshots = {};
  
    for (const role of NIGHT_ORDER) {
      const players = playersWithOriginalRole(gameState, role);
      if (players.length === 0) continue;
  
      const resolver = ROLE_RESOLVERS[role];
      for (const player of players) {
        snapshots[player] = resolver(board, player, submittedActions[player], gameState);
      }
    }
  
    // Players whose role never resolves (Villager, Tanner) still get a
    // snapshot, so the UI has one consistent shape to render for everyone.
    for (const player of gameState.players) {
      if (!snapshots[player]) {
        snapshots[player] = { type: "noAction", role: gameState.originalRoles[player] };
      }
    }
  
    return { finalBoard: board, snapshots };
  }
  
  function playersWithOriginalRole(gameState, role) {
    return gameState.players.filter((p) => gameState.originalRoles[p] === role);
  }
  
  // ---------------------------------------------------------------------------
  // Per-role resolvers
  //
  // Each resolver reads/mutates `board` and returns a snapshot describing
  // what that player learned. `action` is whatever that player submitted
  // (undefined for roles with no choice). `gameState` is passed through
  // read-only, for resolvers that need the original deal (e.g. to find
  // fellow Masons or Werewolves by their starting role rather than current
  // card, since a swapped-out Werewolf is still a Werewolf for team checks).
  // ---------------------------------------------------------------------------
  
  const ROLE_RESOLVERS = {
    Werewolf(board, player, _action, gameState) {
      const otherWolves = playersWithOriginalRole(gameState, "Werewolf").filter((p) => p !== player);
      return { type: "werewolves", players: otherWolves }; // [] => lone wolf
    },
  
    Minion(board, player, _action, gameState) {
      const wolves = playersWithOriginalRole(gameState, "Werewolf");
      return { type: "werewolves", players: wolves }; // [] => no werewolves in play
    },
  
    Mason(board, player, _action, gameState) {
      const otherMasons = playersWithOriginalRole(gameState, "Mason").filter((p) => p !== player);
      return { type: "masons", players: otherMasons }; // [] => lone mason
    },
  
    Seer(board, player, action) {
      if (!action) return { type: "seerNoAction" };
  
      if (action.type === "player") {
        return { type: "seerPlayer", target: action.target, role: board[action.target] };
      }
      if (action.type === "center") {
        const targets = action.targets.slice(0, 2);
        const roles = targets.map((slot) => board[slot]);
        return { type: "seerCenter", targets, roles };
      }
      return { type: "seerNoAction" };
    },
  
    Robber(board, player, action) {
      if (!action || !action.target) return { type: "yourCurrentRole", role: board[player] };
  
      const target = action.target;
      [board[player], board[target]] = [board[target], board[player]];
      return { type: "robbed", target, newRole: board[player] };
    },
  
    Troublemaker(board, player, action) {
      if (!action || !action.targets || action.targets.length !== 2) {
        return { type: "troublemakerNoAction" };
      }
  
      const [a, b] = action.targets;
      [board[a], board[b]] = [board[b], board[a]];
      // Troublemaker confirms the swap happened but never sees either role.
      return { type: "swapped", players: [a, b] };
    },
  
    Drunk(board, player, action) {
      const center = action && CENTER_SLOTS.includes(action.target) ? action.target : CENTER_SLOTS[0];
      [board[player], board[center]] = [board[center], board[player]];
      // Drunk never learns their new role -- that's the point of the role.
      return { type: "drunkSwapped", center };
    },
  
    Insomniac(board, player) {
      // Resolves last, so this reflects the true final state of their card.
      return { type: "yourCurrentRole", role: board[player] };
    },
  };
  
  // ---------------------------------------------------------------------------
  // Voting / win resolution
  // ---------------------------------------------------------------------------
  
  /**
   * votes: { [voterName]: votedForPlayerName }
   * Returns the player(s) with the most votes (ties possible -- ONUW allows
   * multiple simultaneous kills on a tie).
   */
  function tallyVotes(votes) {
    const counts = {};
    Object.values(votes).forEach((target) => {
      counts[target] = (counts[target] || 0) + 1;
    });
  
    const max = Math.max(0, ...Object.values(counts));
    const killed = Object.keys(counts).filter((player) => counts[player] === max);
  
    return { counts, killed, maxVotes: max };
  }
  
  /**
   * Resolve the win condition given final roles (post-swap) and who got
   * killed. Standard ONUW rules:
   *  - Tanner wins (alone) if killed, regardless of anything else.
   *  - If any Werewolf is killed, the Village team wins.
   *  - If no Werewolf is killed, the Werewolf team wins (this includes the
   *    case where there are zero Werewolves on the final board, e.g. all
   *    swapped away -- villagers win by default since no wolf can be hit).
   *  - A lone surviving Werewolf who is NOT killed still wins with the wolves.
   */
  function resolveWinners(finalBoard, players, killed) {
    const finalRoleOf = (player) => finalBoard[player];
    const isRole = (player, role) => finalRoleOf(player) === role;
  
    const tannerKilled = killed.some((p) => isRole(p, "Tanner"));
    if (tannerKilled) {
      return { winningTeam: "Tanner", reason: "tannerKilled", killed };
    }
  
    const werewolfKilled = killed.some((p) => isRole(p, "Werewolf"));
    const winningTeam = werewolfKilled ? "Village" : "Werewolf";
  
    return { winningTeam, reason: werewolfKilled ? "werewolfKilled" : "noWerewolfKilled", killed };
  }
  
  // ---------------------------------------------------------------------------
  // Action-collection helpers
  //
  // Tells the UI which roles need a choice before the night can resolve, so
  // it knows whether to render a picker or just an "okay, got it" state.
  // ---------------------------------------------------------------------------
  
  const ROLES_REQUIRING_ACTION = new Set(["Seer", "Robber", "Troublemaker", "Drunk"]);
  
  function roleRequiresAction(role) {
    return ROLES_REQUIRING_ACTION.has(role);
  }