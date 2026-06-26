// script.js

let gameState = null;
let currentPlayer = "Alice";

let selectedTableShape = "rectangle";

let savedTableLayout = null;

try {
  savedTableLayout = JSON.parse(localStorage.getItem("tableLayout") || "null");
} catch {
  savedTableLayout = null;
  localStorage.removeItem("tableLayout");
}

let editingTableLayout = null;

let tableSettings = loadTableSettings();

const TABLE_GRID_SIZE = 5; // percent grid size

const DOUBLE_CLICK_DELAY = 350;
const DRAG_START_DISTANCE = 6;

let lastLayoutCardClick = {
  player: null,
  time: 0
};

const TABLE_ZOOM_OPTIONS = {
  maxScale: 3,
  minScale: 1,
  initScale: 1,
  bounds: true,
  draggable: true,
  wheelable: true,
  pinchable: true,
  smooth: true,
  zoomer: true,
  slider: true,
  wheelReleaseOnMinMax: true,
  disableDraggingClass: "zoomist-not-draggable"
};

function initOrUpdateTableZoom(selector) {
  const container = document.querySelector(selector);

  if (!container) return null;

  if (typeof Zoomist === "undefined") {
    console.warn("Zoomist is not loaded.");
    return null;
  }

  if (container.zoomist) {
    container.zoomist.update();
    return container.zoomist;
  }

  return new Zoomist(container, TABLE_ZOOM_OPTIONS);
}

function updateTableZoom(selector) {
  const zoomist = document.querySelector(selector)?.zoomist;

  if (zoomist) {
    zoomist.update();
  }
}

function registerLayoutCardClick(player, button) {
  const now = Date.now();

  const isDoubleClick =
    lastLayoutCardClick.player === player &&
    now - lastLayoutCardClick.time <= DOUBLE_CLICK_DELAY;

  if (isDoubleClick) {
    rotateCard90(player, button);

    lastLayoutCardClick = {
      player: null,
      time: 0
    };

    return;
  }

  lastLayoutCardClick = {
    player,
    time: now
  };
}

function loadTableSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("tableSettings") || "{}");

    return {
      width: typeof saved.width === "number" ? saved.width : 700,
      height: typeof saved.height === "number" ? saved.height : 360
    };
  } catch {
    return {
      width: 460,
      height: 360
    };
  }
}

function snapToGrid(value) {
  return Math.round(value / TABLE_GRID_SIZE) * TABLE_GRID_SIZE;
}

function getSnappedPointerPosition(event, board) {
  const rect = board.getBoundingClientRect();

  const rawX = ((event.clientX - rect.left) / rect.width) * 100;
  const rawY = ((event.clientY - rect.top) / rect.height) * 100;

  return {
    x: clamp(snapToGrid(rawX), 5, 95),
    y: clamp(snapToGrid(rawY), 5, 95)
  };
}

function getCardRotation(position) {
  if (typeof position?.rotation !== "number") {
    return 0;
  }

  return position.rotation;
}

function rotateCard90(player, card) {
  if (!editingTableLayout || !editingTableLayout[player]) return;

  const currentRotation = getCardRotation(editingTableLayout[player]);
  const nextRotation = currentRotation + 90;

  editingTableLayout[player] = {
    ...editingTableLayout[player],
    rotation: nextRotation
  };

  applyCardRotation(card, nextRotation);
}

function applyCardRotation(card, rotation) {
  card.style.setProperty("--card-rotation", rotation + "deg");
}


function applyTableSettings(board) {
  if (!board) return;

  board.style.width = tableSettings.width + "px";
  board.style.minWidth = tableSettings.width + "px";
  board.style.height = tableSettings.height + "px";
}

function saveTableSettings() {
  localStorage.setItem("tableSettings", JSON.stringify(tableSettings));
}

function updateTableSizeControls() {
  const widthInput = document.getElementById("tableWidth");
  const heightInput = document.getElementById("tableHeight");
  const widthValue = document.getElementById("tableWidthValue");
  const heightValue = document.getElementById("tableHeightValue");

  if (widthInput) widthInput.value = tableSettings.width;
  if (heightInput) heightInput.value = tableSettings.height;

  if (widthValue) widthValue.textContent = tableSettings.width + "px";
  if (heightValue) heightValue.textContent = tableSettings.height + "px";
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.add("active");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[name="roles"]').forEach((role) => {
    role.checked = false;
  });

  const numberOfPlayers = document.querySelectorAll(".player-list li").length;
  const numberOfRoles = numberOfPlayers + 3;

  const textElement = document.getElementById("numberofroles");

  if (textElement) {
    textElement.textContent = "Select " + numberOfRoles + " roles";
  } else {
    console.warn('No element found with id="numberofroles"');
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-next]");
    if (!target) return;

    const nextScreen = target.dataset.next;

    if (nextScreen === "screen-table-layout") {
      renderLayoutEditor();
    }

    if (target.id === "saveTableLayout") {
      saveCurrentTableLayout();
    }

    if (target.id === "startGame") {
      const selectedRoles = document.querySelectorAll(
        'input[name="roles"]:checked'
      ).length;

      if (selectedRoles !== numberOfRoles) {
        alert(
          "You need to select exactly " +
            numberOfRoles +
            " roles. You selected " +
            selectedRoles +
            "."
        );

        return;
      }

      gameState = dealCards();

      console.log("Game state:", gameState);

      showYourRole();
      renderTableLayout();
    }

    showScreen(nextScreen);

    requestAnimationFrame(() => {
      if (nextScreen === "screen-table-layout") {
        initOrUpdateTableZoom("#layoutTableZoom");
      }
    });
  });

  document.addEventListener("click", (event) => {
    const cardButton = event.target.closest(".table-card");
    if (!cardButton) return;

    const slot = cardButton.dataset.slot;

    if (slot) {
      console.log("Clicked card slot:", slot);
    }
  });

  const shapeSelect = document.getElementById("tableShape");


  const resetLayoutButton = document.getElementById("resetTableLayout");

  if (resetLayoutButton) {
    resetLayoutButton.addEventListener("click", resetTableLayout);
  }

  const tableWidthInput = document.getElementById("tableWidth");
  const tableHeightInput = document.getElementById("tableHeight");

  if (tableWidthInput) {
    tableWidthInput.addEventListener("input", () => {
      tableSettings.width = Number(tableWidthInput.value);

      const board = document.getElementById("layoutEditorBoard");

      applyTableSettings(board);
      updateTableSizeControls();
      requestAnimationFrame(() => updateTableZoom("#layoutTableZoom"));
    });
  }

  if (tableHeightInput) {
    tableHeightInput.addEventListener("input", () => {
      tableSettings.height = Number(tableHeightInput.value);

      const board = document.getElementById("layoutEditorBoard");

      applyTableSettings(board);
      updateTableSizeControls();
      requestAnimationFrame(() => updateTableZoom("#layoutTableZoom"));
    });
  }
});

function dealCards() {
  const players = Array.from(document.querySelectorAll(".player-list li")).map(
    (player) => player.textContent.trim()
  );

  const selectedRoles = Array.from(
    document.querySelectorAll('input[name="roles"]:checked')
  ).map((role) => role.value);

  const shuffledRoles = [...selectedRoles];

  for (let i = shuffledRoles.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    const temp = shuffledRoles[i];
    shuffledRoles[i] = shuffledRoles[randomIndex];
    shuffledRoles[randomIndex] = temp;
  }

  const cardSlots = {};
  const originalRoles = {};
  const submittedActions = {};
  const privateResults = {};

  players.forEach((player, index) => {
    const role = shuffledRoles[index];

    cardSlots[player] = role;
    originalRoles[player] = role;
    submittedActions[player] = null;
    privateResults[player] = [];
  });

  cardSlots.center1 = shuffledRoles[players.length];
  cardSlots.center2 = shuffledRoles[players.length + 1];
  cardSlots.center3 = shuffledRoles[players.length + 2];

  return {
    players,
    selectedRoles,
    cardSlots,
    originalRoles,
    submittedActions,
    privateResults
  };
}

function showYourRole() {
  const yourRoleImage = document.getElementById("yourRoleImage");
  const yourRoleName = document.getElementById("yourRoleName");

  const yourRole = gameState.originalRoles[currentPlayer];

  if (yourRoleImage && yourRoleName && yourRole) {
    yourRoleImage.src = yourRole + ".jpg";
    yourRoleImage.alt = yourRole + " card";
    yourRoleImage.style.display = "block";

    yourRoleName.textContent = yourRole;
  }
}

function swapCards(slotA, slotB) {
  const temp = gameState.cardSlots[slotA];

  gameState.cardSlots[slotA] = gameState.cardSlots[slotB];
  gameState.cardSlots[slotB] = temp;
}

function renderTableLayout() {
  const layout = document.getElementById("playerCardLayout");
  const board = document.querySelector("#screen-night .table-board");

  if (!layout || !gameState) return;

  setBoardShape(board, selectedTableShape);
  applyTableSettings(board);

  layout.innerHTML = "";

  const players = gameState.players;
  const positionMap = getCurrentPositionMap(players);

  players.forEach((player) => {
    const position = positionMap[player];

    const button = document.createElement("button");

    button.classList.add("table-card", "player-card-slot");
    button.dataset.slot = player;

    button.style.left = position.x + "%";
    button.style.top = position.y + "%";

    button.innerHTML = `
      <span>${player}</span>
      <img src="CardBack.jpg" alt="${player}'s face-down card">
    `;

    applyCardRotation(button, getCardRotation(position));

    layout.appendChild(button);
  });
}

function getGeneratedTablePositions(playerCount, shape = "oval") {
  return getRectanglePositions(playerCount);
}

function getOvalPositions(playerCount) {
  const positions = [];

  const centerX = 50;
  const centerY = 50;
  const radiusX = 40;
  const radiusY = 38;

  for (let i = 0; i < playerCount; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / playerCount;

    positions.push({
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
      rotation: 0
    });
  }

  return positions;
}

function getRectanglePositions(playerCount) {
  const positions = [];

  const leftX = 12;
  const rightX = 88;
  const topY = 14;
  const bottomY = 86;

  const base = Math.floor(playerCount / 4);
  const remainder = playerCount % 4;

  let topCount = base;
  let rightCount = base;
  let bottomCount = base;
  let leftCount = base;

  // Extra players are added in a way that matches your screenshot better.
  if (remainder >= 1) bottomCount++;
  if (remainder >= 2) rightCount++;
  if (remainder >= 3) topCount++;

  // Make sure very small games still show sensibly.
  if (playerCount === 1) {
    return [{ x: 50, y: topY, rotation: 0 }];
  }

  if (playerCount === 2) {
    return [
      { x: 40, y: topY, rotation: 0 },
      { x: 60, y: topY, rotation: 0 }
    ];
  }

  function addTop(count) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);

      positions.push({
        x: leftX + (rightX - leftX) * t,
        y: topY,
        rotation: 0
      });
    }
  }

  function addRight(count) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);

      positions.push({
        x: rightX,
        y: topY + (bottomY - topY) * t,
        rotation: 90
      });
    }
  }

  function addBottom(count) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);

      positions.push({
        x: rightX - (rightX - leftX) * t,
        y: bottomY,
        rotation: 0
      });
    }
  }

  function addLeft(count) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);

      positions.push({
        x: leftX,
        y: bottomY - (bottomY - topY) * t,
        rotation: 90
      });
    }
  }

  addTop(topCount);
  addRight(rightCount);
  addBottom(bottomCount);
  addLeft(leftCount);

  return positions;
}
function getHorseshoePositions(playerCount) {
  if (playerCount === 1) {
    return [
      {
        x: 50,
        y: 88,
        rotation: 0
      }
    ];
  }

  const positions = [];

  const minX = 12;
  const maxX = 88;
  const minY = 12;
  const maxY = 88;

  const width = maxX - minX;
  const height = maxY - minY;

  const pathLength = height + width + height;

  for (let i = 0; i < playerCount; i++) {
    const distance = (i * pathLength) / (playerCount - 1);

    let x;
    let y;

    if (distance < height) {
      x = minX;
      y = maxY - distance;
    } else if (distance < height + width) {
      x = minX + (distance - height);
      y = minY;
    } else {
      x = maxX;
      y = minY + (distance - height - width);
    }

    positions.push({
      x,
      y,
      rotation: 0
    });
  }

  return positions;
}

function getPlayersFromLobby() {
  return Array.from(document.querySelectorAll(".player-list li")).map((player) =>
    player.textContent.trim()
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setBoardShape(board, shape) {
  if (!board) return;

  board.classList.remove("shape-oval", "shape-rectangle", "shape-horseshoe");
  board.classList.add("shape-" + shape);
}

function getGeneratedPositionMap(players, shape) {
  const generatedPositions = getGeneratedTablePositions(players.length, shape);
  const positionMap = {};

  players.forEach((player, index) => {
    positionMap[player] = generatedPositions[index];
  });

  return positionMap;
}

function getCurrentPositionMap(players) {
  const generatedMap = getGeneratedPositionMap(players, selectedTableShape);

  if (!savedTableLayout) {
    return generatedMap;
  }

  players.forEach((player) => {
    const savedPosition = savedTableLayout[player];

    if (
      savedPosition &&
      typeof savedPosition.x === "number" &&
      typeof savedPosition.y === "number"
    ) {
      generatedMap[player] = {
        x: savedPosition.x,
        y: savedPosition.y,
        rotation: getCardRotation(savedPosition)
      };
    }
  });

  return generatedMap;
}

function renderLayoutEditor() {
  const board = document.getElementById("layoutEditorBoard");
  const playerLayer = document.getElementById("layoutEditorPlayers");

  if (!board || !playerLayer) return;

  setBoardShape(board, selectedTableShape);
  applyTableSettings(board);
  updateTableSizeControls();

  const players = getPlayersFromLobby();

  editingTableLayout = structuredCloneSafe(getCurrentPositionMap(players));

  drawLayoutEditorPlayers();
}

function drawLayoutEditorPlayers() {
  const playerLayer = document.getElementById("layoutEditorPlayers");

  if (!playerLayer || !editingTableLayout) return;

  playerLayer.innerHTML = "";

  const players = getPlayersFromLobby();

  players.forEach((player) => {
    const position = editingTableLayout[player];

    const button = document.createElement("button");

    button.type = "button";
    button.classList.add("layout-player-token", "zoomist-not-draggable");
    button.dataset.slot = player;

    button.style.left = position.x + "%";
    button.style.top = position.y + "%";

    button.innerHTML = `
      <span class="zoomist-not-draggable">${player}</span>
      <img class="zoomist-not-draggable" src="CardBack.jpg" alt="${player}'s face-down card">
    `;

    applyCardRotation(button, getCardRotation(position));

    enablePlayerDragging(button, player);

    playerLayer.appendChild(button);
  });
}

function enablePlayerDragging(button, player) {
  const board = document.getElementById("layoutEditorBoard");

  if (!board) return;

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;

    let hasDragged = false;

    button.classList.add("dragging");
    button.setPointerCapture(event.pointerId);

    function movePlayer(moveEvent) {
      const moveX = moveEvent.clientX - startX;
      const moveY = moveEvent.clientY - startY;
      const distanceMoved = Math.hypot(moveX, moveY);

      if (distanceMoved >= DRAG_START_DISTANCE) {
        hasDragged = true;
      }

      if (!hasDragged) return;

      const position = getSnappedPointerPosition(moveEvent, board);

      editingTableLayout[player] = {
        ...editingTableLayout[player],
        x: position.x,
        y: position.y
      };

      button.style.left = position.x + "%";
      button.style.top = position.y + "%";
    }

    function stopDragging(upEvent) {
      button.classList.remove("dragging");

      if (button.hasPointerCapture(upEvent.pointerId)) {
        button.releasePointerCapture(upEvent.pointerId);
      }

      button.removeEventListener("pointermove", movePlayer);
      button.removeEventListener("pointerup", stopDragging);
      button.removeEventListener("pointercancel", stopDragging);

      if (!hasDragged) {
        registerLayoutCardClick(player, button);
      }
    }

    button.addEventListener("pointermove", movePlayer);
    button.addEventListener("pointerup", stopDragging);
    button.addEventListener("pointercancel", stopDragging);
  });
}

function saveCurrentTableLayout() {
  if (!editingTableLayout) return;

  savedTableLayout = structuredCloneSafe(editingTableLayout);

  localStorage.setItem("tableLayout", JSON.stringify(savedTableLayout));
  saveTableSettings();
}

function resetTableLayout() {
  const players = getPlayersFromLobby();

  savedTableLayout = null;
  localStorage.removeItem("tableLayout");

  editingTableLayout = getGeneratedPositionMap(players, selectedTableShape);

  drawLayoutEditorPlayers();
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}