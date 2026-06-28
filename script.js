// script.js

const DEFAULT_PLAYERS = ["Alice", "Bob", "Charlie", "Rob", "Tom", "Sam", "Dad", "Jack"];
const ALL_ROLES = [
  "Drunk", "Insomniac", "Mason", "Mason", "Minion", "Robber",
  "Seer", "Tanner", "Troublemaker", "Villager", "Villager", "Villager",
  "Werewolf", "Werewolf"
];

const TABLE_VIEW_PADDING = 24;
const TABLE_MIN_SCALE = 0.75;
const TABLE_MAX_SCALE = 3;
const DEFAULT_TABLE_SIZE = { width: 460, height: 360 };

let gameState = null;
let currentPlayer = "Alice"; // TODO: wire to actual session player once multiplayer/auth exists
let savedTableLayout = loadJSON("tableLayout", null);
let editingTableLayout = null;
let tableInteractionLocked = false;
let currentNightSelection = []; // Stores the data-slots of the cards tapped by the user

// ---------------------------------------------------------------------------
// Small storage helpers
// ---------------------------------------------------------------------------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getTableSize() {
  return loadJSON("tableSettings", DEFAULT_TABLE_SIZE);
}

// ---------------------------------------------------------------------------
// Table zoom/pan controller
//
// One small reusable controller replaces the previous pair of parallel,
// drifted implementations (layout editor vs. night view). It wraps Panzoom,
// handles fit-to-viewport sizing, wheel-zoom, and the lock toggle.
// ---------------------------------------------------------------------------
function createTableZoom({ viewportId, contentId, boardId, lockButtonId, fitToViewport }) {
  const viewport = document.getElementById(viewportId);
  const content = document.getElementById(contentId);
  const lockButton = document.getElementById(lockButtonId);

  if (!viewport || !content || typeof Panzoom === "undefined") return null;

  const panzoom = Panzoom(content, {
    maxScale: TABLE_MAX_SCALE,
    minScale: TABLE_MIN_SCALE,
    canvas: true,
    excludeClass: "panzoom-exclude"
  });

  viewport.addEventListener("wheel", (event) => {
    if (tableInteractionLocked) return;
    panzoom.zoomWithWheel(event);
  }, { passive: false });

  // Keep at least a sliver of the board on-screen, however far the user has
  // panned or zoomed, so the table can never be dragged fully out of view.
  viewport.addEventListener("panzoompan", (event) => {
    const clamped = clampPanToViewport(event.detail.x, event.detail.y, event.detail.scale);
    if (clamped.x !== event.detail.x || clamped.y !== event.detail.y) {
      panzoom.pan(clamped.x, clamped.y, { animate: false });
    }
  });

  lockButton?.addEventListener("click", () => setTableInteractionLocked(!tableInteractionLocked));

  function clampPanToViewport(x, y, scale) {
    const board = document.getElementById(boardId);
    if (!board) return { x, y };

    const boardWidth = board.offsetWidth * scale;
    const boardHeight = board.offsetHeight * scale;
    const minVisible = 80; // px of the board that must stay on-screen on each axis

    const minX = minVisible - boardWidth;
    const maxX = viewport.clientWidth - minVisible;
    const minY = minVisible - boardHeight;
    const maxY = viewport.clientHeight - minVisible;

    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  }

  function getFitScale() {
    const board = document.getElementById(boardId);
    if (!board) return 1;

    const availableWidth = viewport.clientWidth - TABLE_VIEW_PADDING * 2;
    const availableHeight = viewport.clientHeight - TABLE_VIEW_PADDING * 2;

    const fitX = availableWidth / board.offsetWidth;
    const fitY = availableHeight / board.offsetHeight;

    return Math.max(TABLE_MIN_SCALE, Math.min(1, fitX, fitY));
  }

  function fit({ force = false } = {}) {
    const fitScale = fitToViewport ? getFitScale() : 1;
    const currentScale = panzoom.getScale?.() ?? fitScale;
    const currentPan = panzoom.getPan?.() ?? { x: TABLE_VIEW_PADDING, y: TABLE_VIEW_PADDING };

    const nextScale = force ? fitScale : Math.min(currentScale, fitScale);
    const clampedPan = clampPanToViewport(
      currentPan.x ?? TABLE_VIEW_PADDING,
      currentPan.y ?? TABLE_VIEW_PADDING,
      nextScale
    );

    panzoom.zoom(nextScale, { animate: false });
    panzoom.pan(clampedPan.x, clampedPan.y, { animate: false });
  }

  function applyLock(locked) {
    panzoom.setOptions?.({ disablePan: locked, disableZoom: locked });
    if (lockButton) {
      lockButton.textContent = locked ? "🔒" : "🔓";
      lockButton.classList.toggle("locked", locked);
      lockButton.setAttribute("aria-label", locked ? "Unlock table" : "Lock table");
      lockButton.setAttribute("aria-pressed", String(locked));
    }
  }

  requestAnimationFrame(() => {
    fit({ force: true });
    panzoom.pan(TABLE_VIEW_PADDING, TABLE_VIEW_PADDING, { animate: false });
  });

  return { panzoom, fit, applyLock };
}

let layoutZoom = null;
let nightZoom = null;

function setTableInteractionLocked(locked) {
  tableInteractionLocked = locked;
  layoutZoom?.applyLock(locked);
  nightZoom?.applyLock(locked);
  document.body.classList.toggle("table-locked", locked);
}

// ---------------------------------------------------------------------------
// Player-token dragging on the layout editor
//
// Replaces interact.js: the drag math here is a handful of pointer-event
// listeners, which doesn't justify pulling in a whole library.
// ---------------------------------------------------------------------------
function makeDraggable(el, onMove) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  el.addEventListener("pointerdown", (event) => {
    if (tableInteractionLocked) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    el.classList.add("dragging");
    el.setPointerCapture(event.pointerId);
  });

  el.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    onMove(dx, dy);
  });

  const stop = (event) => {
    dragging = false;
    el.classList.remove("dragging");
    if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
  };

  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}

// ---------------------------------------------------------------------------
// Shared player-card rendering (night board + layout editor)
// ---------------------------------------------------------------------------
function createPlayerCardElement(player, pos, { draggable }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.slot = player;
  button.dataset.player = player;
  button.className = draggable
    ? "table-card layout-player-token panzoom-exclude"
    : "table-card player-card-slot";

  applyCardPosition(button, pos);

  button.innerHTML = `
    <span>${player}</span>
    <img src="CardBack.jpg" alt="${player}'s card">
  `;

  if (draggable) {
    button.addEventListener("dblclick", () => {
      pos.rotation = (pos.rotation || 0) + 90;
      applyCardPosition(button, pos);
    });

    makeDraggable(button, (dx, dy) => {
      const board = document.getElementById("layoutEditorBoard");
      if (!board) return;
      const rect = board.getBoundingClientRect();

      pos.x = clamp(pos.x + (dx / rect.width) * 100, 5, 95);
      pos.y = clamp(pos.y + (dy / rect.height) * 100, 5, 95);
      applyCardPosition(button, pos);
    });
  }

  return button;
}

function applyCardPosition(el, pos) {
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;
  el.style.transform = `translate(-50%, -50%) rotate(${pos.rotation || 0}deg)`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Initialize UI
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Populate Players
  const playerList = document.getElementById("playerList");
  DEFAULT_PLAYERS.forEach(player => {
    const li = document.createElement("li");
    li.textContent = player;
    playerList.appendChild(li);
  });

  // Populate Roles
  const rolesContainer = document.getElementById("rolesContainer");
  rolesContainer.innerHTML = ALL_ROLES.map(role => `
    <label class="role">
        <input type="checkbox" name="roles" value="${role}" hidden>
        <img src="${role}.jpg" alt="${role} icon">
    </label>
  `).join("");

  const numberOfRoles = DEFAULT_PLAYERS.length + 3;
  document.getElementById("numberofroles").textContent = `Select ${numberOfRoles} roles`;

  initTableSizeControls();

// Global Navigation Click Handler
  document.addEventListener("click", (event) => {
    
    // 1. Check for card taps during the night phase
    const cardButton = event.target.closest(".table-card");
    if (cardButton && document.getElementById("screen-night").classList.contains("active") && !nightResult) {
        handleCardTapForAction(cardButton);
        return; // Stop processing further
    }

    // 2. Check for the submit action button explicitly
    if (event.target.id === "submitNightAction") {
        submitNightAction();
        return; // Execute and stop processing
    }

    // 3. Handle all screen transitions
    const target = event.target.closest("[data-next]");
    if (!target) return;

    const nextScreen = target.dataset.next;

    if (nextScreen === "screen-table-layout") renderLayoutEditor();
    if (target.id === "saveTableLayout") saveCurrentTableLayout();
    if (target.id === "startGame") {
      const selectedRoles = document.querySelectorAll('input[name="roles"]:checked').length;
      if (selectedRoles !== numberOfRoles) {
        return alert(`You need exactly ${numberOfRoles} roles. You selected ${selectedRoles}.`);
      }
      startNewGame();
      renderNightScreen();
      renderTableLayout();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!nightZoom) {
            nightZoom = createTableZoom({
              viewportId: "nightTableZoom",
              contentId: "nightPanzoomContent",
              boardId: "nightTableBoard",
              lockButtonId: "toggleNightTableLock",
              fitToViewport: false
            });
          }
        });
      });
    }

    // Handle screen transitions
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(nextScreen)?.classList.add("active");

    if (nextScreen === "screen-table-layout") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!layoutZoom) {
            layoutZoom = createTableZoom({
              viewportId: "layoutTableZoom",
              contentId: "layoutPanzoomContent",
              boardId: "layoutEditorBoard",
              lockButtonId: "toggleTableLock",
              fitToViewport: true
            });
          } else {
            layoutZoom.fit();
          }
        });
      });
    }
  });

  document.getElementById("resetTableLayout")?.addEventListener("click", resetTableLayout);
});

// ---------------------------------------------------------------------------
// Table size controls (replaces Alpine.js for two range inputs)
// ---------------------------------------------------------------------------
function initTableSizeControls() {
  const widthInput = document.getElementById("tableWidthInput");
  const heightInput = document.getElementById("tableHeightInput");
  const widthLabel = document.getElementById("tableWidthLabel");
  const heightLabel = document.getElementById("tableHeightLabel");
  const board = document.getElementById("layoutEditorBoard");
  if (!widthInput || !heightInput || !board) return;

  const size = getTableSize();
  widthInput.value = size.width;
  heightInput.value = size.height;

  function apply() {
    const width = Number(widthInput.value);
    const height = Number(heightInput.value);

    board.style.width = `${width}px`;
    board.style.minWidth = `${width}px`;
    board.style.height = `${height}px`;

    if (widthLabel) widthLabel.textContent = `${width}px`;
    if (heightLabel) heightLabel.textContent = `${height}px`;

    saveJSON("tableSettings", { width, height });
    layoutZoom?.fit(); // re-fit the viewport whenever the board is resized
  }

  widthInput.addEventListener("input", apply);
  heightInput.addEventListener("input", apply);
  apply();
}

// ---------------------------------------------------------------------------
// Game logic glue
//
// The actual rules (dealing, night resolution, voting, win conditions) live
// in gamelogic.js as pure functions with no DOM access. Everything here is
// just wiring: reading form input, calling into gamelogic.js, and rendering
// whatever comes back.
// ---------------------------------------------------------------------------

// Per-player chosen night action, collected before resolveNight() runs.
// { [playerName]: action } -- see gamelogic.js ROLE_RESOLVERS for the shape
// each role expects. Reset at the start of every game.
let nightActions = {};

// Result of resolveNight(): { finalBoard, snapshots }. Holds what each
// player actually saw, computed once for the whole table.
let nightResult = null;

function startNewGame() {
  currentNightSelection = [];
  const players = [...DEFAULT_PLAYERS];
  const selectedRoles = Array.from(document.querySelectorAll('input[name="roles"]:checked')).map(r => r.value);

  gameState = dealCards(players, selectedRoles);
  nightActions = {};
  nightResult = null;
}

/**
 * Renders the night-action picker (if currentPlayer's original role needs
 * one) and the "what did I see" panel (once the night has been resolved).
 * Call this once on entering screen-night, and again after resolveNight().
 */
function renderNightScreen() {
  if (!gameState) return;

  const myRole = gameState.originalRoles[currentPlayer];
  const actionContainer = document.getElementById("nightActionContainer");
  const submitButton = document.getElementById("submitNightAction");

  if (!nightResult) {
    // Still collecting actions: show a picker for roles that need one,
    // or a simple acknowledgement for roles that don't.
    if (actionContainer) {
      actionContainer.innerHTML = roleRequiresAction(myRole)
        ? renderActionPicker(myRole)
        : `<p class="hint">No action needed for ${myRole}. Wait for everyone else, then submit.</p>`;
    }
    if (submitButton) submitButton.disabled = false;
    showYourRole(myRole); // show the role they woke up as, before anything resolves
    return;
  }

  // Night has resolved: show this player's snapshot instead.
  if (actionContainer) actionContainer.innerHTML = "";
  if (submitButton) submitButton.disabled = true;
  renderSnapshot(nightResult.snapshots[currentPlayer]);
}

function renderActionPicker(role) {
  if (role === "Seer") return `<p class="hint">Tap one player, or two center cards.</p>`;
  if (role === "Robber") return `<p class="hint">Tap a player to swap roles with.</p>`;
  if (role === "Troublemaker") return `<p class="hint">Tap two other players to swap them.</p>`;
  if (role === "Drunk") return `<p class="hint">Tap a center card to swap with.</p>`;
  return "";
}

function handleCardTapForAction(card) {
  const myRole = gameState.originalRoles[currentPlayer];
  if (!roleRequiresAction(myRole)) return;
  const slot = card.dataset.slot;

  // Deselect if already selected
  if (currentNightSelection.includes(slot)) {
    currentNightSelection = currentNightSelection.filter(s => s !== slot);
    card.classList.remove("selected");
    return;
  }

  // Role-specific validation and selection
  if (myRole === "Seer") {
    const isCenter = slot.startsWith("center");
    if (isCenter) {
      currentNightSelection = currentNightSelection.filter(s => s.startsWith("center"));
      if (currentNightSelection.length >= 2) {
        const first = currentNightSelection.shift();
        document.querySelector(`[data-slot="${first}"]`).classList.remove("selected");
      }
      currentNightSelection.push(slot);
      card.classList.add("selected");
    } else {
      if (slot === currentPlayer) return;
      currentNightSelection.forEach(s => document.querySelector(`[data-slot="${s}"]`)?.classList.remove("selected"));
      currentNightSelection = [slot];
      card.classList.add("selected");
    }
  } else if (myRole === "Robber") {
    if (slot.startsWith("center") || slot === currentPlayer) return;
    currentNightSelection.forEach(s => document.querySelector(`[data-slot="${s}"]`)?.classList.remove("selected"));
    currentNightSelection = [slot];
    card.classList.add("selected");
  } else if (myRole === "Troublemaker") {
    if (slot.startsWith("center") || slot === currentPlayer) return;
    if (currentNightSelection.length >= 2) {
      const first = currentNightSelection.shift();
      document.querySelector(`[data-slot="${first}"]`)?.classList.remove("selected");
    }
    currentNightSelection.push(slot);
    card.classList.add("selected");
  } else if (myRole === "Drunk") {
    if (!slot.startsWith("center")) return;
    currentNightSelection.forEach(s => document.querySelector(`[data-slot="${s}"]`)?.classList.remove("selected"));
    currentNightSelection = [slot];
    card.classList.add("selected");
  }
}

function collectActionFromSelection(role) {
  if (role === "Seer") {
    if (currentNightSelection.length === 1 && !currentNightSelection[0].startsWith("center")) {
      return { type: "player", target: currentNightSelection[0] };
    }
    if (currentNightSelection.length > 0 && currentNightSelection[0].startsWith("center")) {
      return { type: "center", targets: currentNightSelection };
    }
  }
  if (role === "Robber" && currentNightSelection.length === 1) {
    return { target: currentNightSelection[0] };
  }
  if (role === "Troublemaker" && currentNightSelection.length === 2) {
    return { targets: currentNightSelection };
  }
  if (role === "Drunk" && currentNightSelection.length === 1) {
    return { target: currentNightSelection[0] };
  }
  return undefined;
}

function submitNightAction() {
  const myRole = gameState.originalRoles[currentPlayer];
  const action = collectActionFromSelection(myRole);

  alert("Action captured: " + JSON.stringify(action));
  if (roleRequiresAction(myRole) && !action) {
    return alert("Make a valid choice by tapping cards before submitting.");
  }

  nightActions[currentPlayer] = action;
  nightResult = resolveNight(gameState, nightActions);
  
  // Clear visual selection
  document.querySelectorAll(".table-card.selected").forEach(el => el.classList.remove("selected"));
  currentNightSelection = [];
  
  renderNightScreen();
}

function showYourRole(role) {
  const img = document.getElementById("yourRoleImage");
  const nameEl = document.getElementById("yourRoleName");
  if (img && role) {
    img.src = `${role}.jpg`;
    img.style.display = "block";
  }
  if (nameEl) nameEl.textContent = role;
}

/** Renders the per-role "what did I learn" snapshot from gamelogic.js. */
function renderSnapshot(snapshot) {
  const panel = document.getElementById("nightActionContainer");
  if (!panel || !snapshot) return;

  const lines = {
    werewolves: () =>
      snapshot.players.length
        ? `You see: ${snapshot.players.join(", ")}`
        : `You see no other werewolves. You're alone out here.`,
    masons: () =>
      snapshot.players.length
        ? `Your fellow Mason: ${snapshot.players.join(", ")}`
        : `You see no other Mason. You're the only one.`,
    seerPlayer: () => `You looked at ${snapshot.target}'s card: ${snapshot.role}`,
    seerCenter: () =>
      `You looked at ${snapshot.targets.join(" & ")}: ${snapshot.roles.join(", ")}`,
    seerNoAction: () => `You didn't choose anything to look at.`,
    robbed: () => `You swapped with ${snapshot.target}. Your new role: ${snapshot.newRole}`,
    troublemakerNoAction: () => `You didn't swap anyone.`,
    swapped: () => `You swapped ${snapshot.players[0]} and ${snapshot.players[1]}'s cards (without looking).`,
    drunkSwapped: () => `You swapped your card with ${snapshot.center}, face-down. You don't know what you are now.`,
    yourCurrentRole: () => `Your current role: ${snapshot.role}`,
    noAction: () => `You have no night action. Your role: ${snapshot.role}`,
  };

  panel.innerHTML = `<p>${(lines[snapshot.type] || (() => ""))()}</p>`;
}

// ---------------------------------------------------------------------------
// Table layout rendering
// ---------------------------------------------------------------------------
function renderTableLayout() {
  const layer = document.getElementById("playerCardLayout");
  const board = document.getElementById("nightTableBoard");
  if (!layer || !gameState) return;

  // Sync night board size with saved settings
  const size = getTableSize();
  board.style.width = `${size.width}px`;
  board.style.height = `${size.height}px`;

  layer.innerHTML = "";
  const positionMap = getCurrentPositionMap(gameState.players);

  gameState.players.forEach(player => {
    layer.appendChild(createPlayerCardElement(player, positionMap[player], { draggable: false }));
  });
}

function renderLayoutEditor() {
  editingTableLayout = JSON.parse(JSON.stringify(getCurrentPositionMap(DEFAULT_PLAYERS)));

  const layer = document.getElementById("layoutEditorPlayers");
  if (!layer) return;
  layer.innerHTML = "";

  DEFAULT_PLAYERS.forEach(player => {
    layer.appendChild(createPlayerCardElement(player, editingTableLayout[player], { draggable: true }));
  });
}

// ---------------------------------------------------------------------------
// Geometry / saving
// ---------------------------------------------------------------------------
function getRectanglePositions(playerCount) {
  const positions = [];
  const leftX = 12, rightX = 88, topY = 14, bottomY = 86;
  const base = Math.floor(playerCount / 4), remainder = playerCount % 4;
  let t = base + (remainder >= 3 ? 1 : 0), r = base + (remainder >= 2 ? 1 : 0);
  let b = base + (remainder >= 1 ? 1 : 0), l = base;

  if (playerCount === 1) return [{ x: 50, y: topY, rotation: 0 }];
  if (playerCount === 2) return [{ x: 40, y: topY, rotation: 0 }, { x: 60, y: topY, rotation: 0 }];

  const addLine = (count, startX, endX, startY, endY, rot) => {
    for (let i = 0; i < count; i++) {
      const pct = (i + 1) / (count + 1);
      positions.push({ x: startX + (endX - startX) * pct, y: startY + (endY - startY) * pct, rotation: rot });
    }
  };

  addLine(t, leftX, rightX, topY, topY, 0);     // Top
  addLine(r, rightX, rightX, topY, bottomY, 90); // Right
  addLine(b, rightX, leftX, bottomY, bottomY, 0); // Bottom
  addLine(l, leftX, leftX, bottomY, topY, 90);   // Left

  return positions;
}

function getCurrentPositionMap(players) {
  const generatedMap = {};
  const defaultPos = getRectanglePositions(players.length);

  players.forEach((player, index) => {
    generatedMap[player] = (savedTableLayout && savedTableLayout[player]) || defaultPos[index];
  });
  return generatedMap;
}

function saveCurrentTableLayout() {
  if (!editingTableLayout) return;
  savedTableLayout = JSON.parse(JSON.stringify(editingTableLayout));
  saveJSON("tableLayout", savedTableLayout);
}

function resetTableLayout() {
  savedTableLayout = null;
  localStorage.removeItem("tableLayout");
  renderLayoutEditor();
}