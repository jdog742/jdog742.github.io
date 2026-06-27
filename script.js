// script.js

const DEFAULT_PLAYERS = ["Alice", "Bob", "Charlie", "Rob", "Tom", "Sam", "Dad", "Jack"];
const ALL_ROLES = [
  "Drunk", "Insomniac", "Mason", "Mason", "Minion", "Robber", 
  "Seer", "Tanner", "Troublemaker", "Villager", "Villager", "Villager", 
  "Werewolf", "Werewolf"
];

let gameState = null;
let currentPlayer = "Alice";
let savedTableLayout = JSON.parse(localStorage.getItem("tableLayout") || "null");
let editingTableLayout = null;
let tableInteractionLocked = false;

const TABLE_GRID_SIZE = 5; // Grid snapping size in percent

// --- Alpine.js Store for Table Config ---
document.addEventListener('alpine:init', () => {
  Alpine.data('tableConfig', () => ({
    width: JSON.parse(localStorage.getItem("tableSettings") || "{}").width || 460,
    height: JSON.parse(localStorage.getItem("tableSettings") || "{}").height || 360,
    saveAndZoom() {
      localStorage.setItem("tableSettings", JSON.stringify({ width: this.width, height: this.height }));
      // REMOVED: requestAnimationFrame(() => updateTableZoom());
      // Now, resizing the table will not force a re-fit of the zoom.
    }
  }));
});

// --- Initialize UI ---
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
  ALL_ROLES.forEach(role => {
    rolesContainer.innerHTML += `
      <label class="role">
          <input type="checkbox" name="roles" value="${role}" hidden>
          <img src="${role}.jpg" alt="${role} icon">
      </label>
    `;
  });

  const numberOfRoles = DEFAULT_PLAYERS.length + 3;
  document.getElementById("numberofroles").textContent = `Select ${numberOfRoles} roles`;

  // Global Navigation Click Handler
  document.addEventListener("click", (event) => {
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
      gameState = dealCards();
      showYourRole();
      renderTableLayout();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initNightTableZoom();
        });
      });
    }

    // Handle Screen transitions
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(nextScreen)?.classList.add("active");

    if (nextScreen === "screen-table-layout") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initOrUpdateTableZoom();
        });
      });
    }
  });

  // Reset button
  document.getElementById("resetTableLayout")?.addEventListener("click", resetTableLayout);
  document.getElementById("toggleTableLock")?.addEventListener("click", toggleTableInteractionLock);
  document.getElementById("toggleNightTableLock")?.addEventListener("click", toggleTableInteractionLock);


});


// --- Panzoom Logic ---
let tablePanzoom = null;

const TABLE_VIEW_PADDING = 24;
const TABLE_MIN_SCALE = .75;
const TABLE_MAX_SCALE = 3;

function getLayoutFitScale() {
  const viewport = document.getElementById("layoutTableZoom");
  const board = document.getElementById("layoutEditorBoard");

  if (!viewport || !board) return 1;

  const availableWidth = viewport.clientWidth - TABLE_VIEW_PADDING * 2;
  const availableHeight = viewport.clientHeight - TABLE_VIEW_PADDING * 2;

  const fitX = availableWidth / board.offsetWidth;
  const fitY = availableHeight / board.offsetHeight;

  return Math.max(
    TABLE_MIN_SCALE,
    Math.min(1, fitX, fitY)
  );
}

function fitLayoutTableToViewport({ force = false } = {}) {
  if (!tablePanzoom) return;

  const fitScale = getLayoutFitScale();

  const currentScale =
    typeof tablePanzoom.getScale === "function"
      ? tablePanzoom.getScale()
      : fitScale;

  const currentPan =
    typeof tablePanzoom.getPan === "function"
      ? tablePanzoom.getPan()
      : { x: TABLE_VIEW_PADDING, y: TABLE_VIEW_PADDING };

  const nextScale = force
    ? fitScale
    : Math.min(currentScale, fitScale);

  tablePanzoom.zoom(nextScale, { animate: false });
  tablePanzoom.pan(
    currentPan?.x ?? TABLE_VIEW_PADDING,
    currentPan?.y ?? TABLE_VIEW_PADDING,
    { animate: false }
  );
}

function initOrUpdateTableZoom() {
  const viewport = document.getElementById("layoutTableZoom");
  const content = document.getElementById("layoutPanzoomContent");

  if (!viewport || !content || typeof Panzoom === "undefined") return;

  if (!tablePanzoom) {
    tablePanzoom = Panzoom(content, {
      maxScale: TABLE_MAX_SCALE,
      minScale: TABLE_MIN_SCALE,
      canvas: true,
      
      // Important: do not let Panzoom steal pointer events from draggable cards.
      
      excludeClass: "panzoom-exclude"
    });

    viewport.addEventListener("wheel", (event) => {
      if (tableInteractionLocked) {
        return;
      }
    
      tablePanzoom.zoomWithWheel(event);
    }, {
      passive: false
    });

    requestAnimationFrame(() => {
      fitLayoutTableToViewport({ force: true });
      tablePanzoom.pan(TABLE_VIEW_PADDING, TABLE_VIEW_PADDING, {
        animate: false
      });
    });
  } else {
    requestAnimationFrame(() => {
      fitLayoutTableToViewport();
    });
  }
}

function updateTableZoom() {
  if (!tablePanzoom) return;

  requestAnimationFrame(() => {
    fitLayoutTableToViewport();
  });
}

let nightPanzoom = null;

function initNightTableZoom() {
  const viewport = document.getElementById("nightTableZoom");
  const content = document.getElementById("nightPanzoomContent");

  if (!viewport || !content || typeof Panzoom === "undefined") return;

  if (!nightPanzoom) {
    nightPanzoom = Panzoom(content, {
      maxScale: TABLE_MAX_SCALE,
      minScale: TABLE_MIN_SCALE,
      canvas: true,
      disablePan: tableInteractionLocked,
      disableZoom: tableInteractionLocked
    });

    viewport.addEventListener("wheel", (event) => {
      if (tableInteractionLocked) {
        return;
      }
    
      nightPanzoom.zoomWithWheel(event);
    }, {
      passive: false
    });

    requestAnimationFrame(() => {
      nightPanzoom.zoom(1, { animate: false });
      nightPanzoom.pan(TABLE_VIEW_PADDING, TABLE_VIEW_PADDING, {
        animate: false
      });
    });
  }
}

function setTableInteractionLocked(locked) {
  tableInteractionLocked = locked;

  if (tablePanzoom && typeof tablePanzoom.setOptions === "function") {
    tablePanzoom.setOptions({
      disablePan: locked,
      disableZoom: locked
    });
  }

  if (nightPanzoom && typeof nightPanzoom.setOptions === "function") {
    nightPanzoom.setOptions({
      disablePan: locked,
      disableZoom: locked
    });
  }

  document.body.classList.toggle("table-locked", locked);

  const icon = locked ? "🔒" : "🔓";
  const label = locked ? "Unlock table" : "Lock table";

  [toggleTableLock, toggleNightTableLock].forEach((button) => {
    if (!button) return;

    button.textContent = icon;
    button.classList.toggle("locked", locked);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(locked));
  });
}

function toggleTableInteractionLock() {
  setTableInteractionLocked(!tableInteractionLocked);
}

function getTableBound() {
  const content = document.getElementById("layoutPanzoomContent"); // Or nightPanzoom's content
  const viewport = document.getElementById("layoutTableZoom");     // Or nightPanzoom's viewport
  
  if (!content || !viewport) return {};

  return {
    left: 0,
    right: viewport.clientWidth - content.offsetWidth,
    top: 0,
    bottom: viewport.clientHeight - content.offsetHeight,
  };
}

// --- Game Logic ---
function dealCards() {
  const players = [...DEFAULT_PLAYERS];
  const selectedRoles = Array.from(document.querySelectorAll('input[name="roles"]:checked')).map(r => r.value);
  const shuffledRoles = [...selectedRoles].sort(() => Math.random() - 0.5);

  const cardSlots = {}, originalRoles = {};
  players.forEach((player, i) => {
    cardSlots[player] = originalRoles[player] = shuffledRoles[i];
  });
  cardSlots.center1 = shuffledRoles[players.length];
  cardSlots.center2 = shuffledRoles[players.length + 1];
  cardSlots.center3 = shuffledRoles[players.length + 2];

  return { players, selectedRoles, cardSlots, originalRoles };
}

function showYourRole() {
  const role = gameState.originalRoles[currentPlayer];
  const img = document.getElementById("yourRoleImage");
  if (img && role) {
    img.src = `${role}.jpg`;
    img.style.display = "block";
    document.getElementById("yourRoleName").textContent = role;
  }
}


// --- Table Layout Rendering ---
function renderTableLayout() {
  const layout = document.getElementById("playerCardLayout");
  const board = document.getElementById("nightTableBoard");
  if (!layout || !gameState) return;

  // Sync Night board size with Alpine/Localstorage settings
  const settings = JSON.parse(localStorage.getItem("tableSettings") || '{"width":460,"height":360}');
  board.style.width = settings.width + "px";
  board.style.height = settings.height + "px";

  layout.innerHTML = "";
  const positionMap = getCurrentPositionMap(gameState.players);

  gameState.players.forEach((player) => {
    const pos = positionMap[player];
    layout.innerHTML += `
      <button class="table-card player-card-slot" data-slot="${player}" 
              style="left: ${pos.x}%; top: ${pos.y}%; transform: translate(-50%, -50%) rotate(${pos.rotation || 0}deg)">
        <span>${player}</span>
        <img src="CardBack.jpg" alt="${player}'s card">
      </button>`;
  });
}

function renderLayoutEditor() {
  editingTableLayout = JSON.parse(JSON.stringify(getCurrentPositionMap(DEFAULT_PLAYERS)));
  drawLayoutEditorPlayers();
}

function drawLayoutEditorPlayers() {
  const layer = document.getElementById("layoutEditorPlayers");
  if (!layer || !editingTableLayout) return;
  layer.innerHTML = "";

  DEFAULT_PLAYERS.forEach(player => {
    const pos = editingTableLayout[player];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layout-player-token interact-draggable panzoom-exclude";
    button.dataset.player = player;
    
    button.style.left = pos.x + "%";
    button.style.top = pos.y + "%";
    button.style.transform = `translate(-50%, -50%) rotate(${pos.rotation || 0}deg)`;
    button.innerHTML = `
      <span class="zoomist-not-draggable">${player}</span>
      <img class="zoomist-not-draggable" src="CardBack.jpg" alt="${player}'s card">
    `;
    
    // Tap to rotate
    button.addEventListener("dblclick", () => {
      const currentRot = editingTableLayout[player].rotation || 0;
      editingTableLayout[player].rotation = currentRot + 90;
      button.style.transform = `translate(-50%, -50%) rotate(${editingTableLayout[player].rotation}deg)`;
    });

    layer.appendChild(button);
  });

  initLayoutDragging();
}


let layoutDraggingInitialized = false;

function initLayoutDragging() {
  if (layoutDraggingInitialized || typeof interact === "undefined") return;

  interact(".interact-draggable").draggable({
    listeners: {
      start(event) {
        if (tableInteractionLocked) return;
        event.target.classList.add("dragging");
      },

      move(event) {
        if (tableInteractionLocked) return;
        const target = event.target;
        const player = target.dataset.player;

        if (!editingTableLayout || !editingTableLayout[player]) return;

        const board = document.getElementById("layoutEditorBoard");
        if (!board) return;

        const rect = board.getBoundingClientRect();

        const currentX = editingTableLayout[player].x;
        const currentY = editingTableLayout[player].y;

        const moveX = (event.dx / rect.width) * 100;
        const moveY = (event.dy / rect.height) * 100;

        const newX = Math.max(5, Math.min(95, currentX + moveX));
        const newY = Math.max(5, Math.min(95, currentY + moveY));

        editingTableLayout[player].x = newX;
        editingTableLayout[player].y = newY;

        target.style.left = `${newX}%`;
        target.style.top = `${newY}%`;
      },

      end(event) {
        event.target.classList.remove("dragging");
      }
    }
  });

  layoutDraggingInitialized = true;
}


// --- Geometry / Saving ---
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

  addLine(t, leftX, rightX, topY, topY, 0); // Top
  addLine(r, rightX, rightX, topY, bottomY, 90); // Right
  addLine(b, rightX, leftX, bottomY, bottomY, 0); // Bottom
  addLine(l, leftX, leftX, bottomY, topY, 90); // Left

  return positions;
}

function getCurrentPositionMap(players) {
  const generatedMap = {};
  const defaultPos = getRectanglePositions(players.length);
  
  players.forEach((player, index) => {
    if (savedTableLayout && savedTableLayout[player]) {
      generatedMap[player] = savedTableLayout[player];
    } else {
      generatedMap[player] = defaultPos[index];
    }
  });
  return generatedMap;
}

function saveCurrentTableLayout() {
  if (!editingTableLayout) return;
  savedTableLayout = JSON.parse(JSON.stringify(editingTableLayout));
  localStorage.setItem("tableLayout", JSON.stringify(savedTableLayout));
}

function resetTableLayout() {
  savedTableLayout = null;
  localStorage.removeItem("tableLayout");
  renderLayoutEditor(); // Re-render with default math
}