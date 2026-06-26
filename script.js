// script.js

let gameState = null;
let currentPlayer = "Alice";

let selectedTableShape = localStorage.getItem("tableShape") || "oval";

let savedTableLayout = null;

try {
  savedTableLayout = JSON.parse(localStorage.getItem("tableLayout") || "null");
} catch {
  savedTableLayout = null;
  localStorage.removeItem("tableLayout");
}

let editingTableLayout = null;

let tableSettings = loadTableSettings();

function loadTableSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("tableSettings") || "{}");

    return {
      width: typeof saved.width === "number" ? saved.width : 100,
      height: typeof saved.height === "number" ? saved.height : 420
    };
  } catch {
    return {
      width: 100,
      height: 420
    };
  }
}

function applyTableSettings(board) {
  if (!board) return;

  board.style.width = tableSettings.width + "%";
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

  if (widthValue) widthValue.textContent = tableSettings.width + "%";
  if (heightValue) heightValue.textContent = tableSettings.height + "px";
}

function showScreen(id) {
    // Hide all screens
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });
  
    // Show the requested screen
    const target = document.getElementById(id);
    if (target) 
        target.classList.add("active");
}
  
  //Test
  // Wait for the page to load before wiring up buttons
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[name="roles"]').forEach((role) => {
    role.checked = false;
  });
  const numberOfPlayers = document.querySelectorAll(".player-list li").length;
  let numberOfRoles = numberOfPlayers + 3;

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
      saveTableLayout();
    }

    // Only check selected roles when Start Game is clicked
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

  if (shapeSelect) {
    shapeSelect.value = selectedTableShape;

    shapeSelect.addEventListener("change", () => {
      selectedTableShape = shapeSelect.value;

      const board = document.getElementById("layoutEditorBoard");
      setBoardShape(board, selectedTableShape);

      const players = getPlayersFromLobby();
      editingTableLayout = getGeneratedPositionMap(players, selectedTableShape);

      drawLayoutEditorPlayers();
    });
  }

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
    });
  }

  if (tableHeightInput) {
    tableHeightInput.addEventListener("input", () => {
      tableSettings.height = Number(tableHeightInput.value);

      const board = document.getElementById("layoutEditorBoard");
      applyTableSettings(board);
      updateTableSizeControls();
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

  // Shuffle selected roles
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

  // Remaining 3 cards go in the middle
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

    layout.appendChild(button);
  });
}


function getGeneratedTablePositions(playerCount, shape = "oval") {
  if (shape === "rectangle") {
    return getRectanglePositions(playerCount);
  }

  if (shape === "horseshoe") {
    return getHorseshoePositions(playerCount);
  }

  return getOvalPositions(playerCount);
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
      y: centerY + radiusY * Math.sin(angle)
    });
  }

  return positions;
}

function getRectanglePositions(playerCount) {
  const positions = [];

  const minX = 12;
  const maxX = 88;
  const minY = 12;
  const maxY = 88;

  const width = maxX - minX;
  const height = maxY - minY;
  const perimeter = 2 * (width + height);

  for (let i = 0; i < playerCount; i++) {
    let distance = ((i * perimeter) / playerCount + width / 2) % perimeter;

    let x;
    let y;

    if (distance < width) {
      x = minX + distance;
      y = minY;
    } else if (distance < width + height) {
      x = maxX;
      y = minY + (distance - width);
    } else if (distance < width * 2 + height) {
      x = maxX - (distance - width - height);
      y = maxY;
    } else {
      x = minX;
      y = maxY - (distance - width * 2 - height);
    }

    positions.push({ x, y });
  }

  return positions;
}

function getHorseshoePositions(playerCount) {
  if (playerCount === 1) {
    return [{ x: 50, y: 88 }];
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

    positions.push({ x, y });
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
    if (
      savedTableLayout[player] &&
      typeof savedTableLayout[player].x === "number" &&
      typeof savedTableLayout[player].y === "number"
    ) {
      generatedMap[player] = savedTableLayout[player];
    }
  });

  return generatedMap;
}
    

function renderLayoutEditor() {
  const board = document.getElementById("layoutEditorBoard");
  const playerLayer = document.getElementById("layoutEditorPlayers");
  const shapeSelect = document.getElementById("tableShape");

  if (!board || !playerLayer || !shapeSelect) return;

  shapeSelect.value = selectedTableShape;
  setBoardShape(board, selectedTableShape);
  applyTableSettings(board);
  updateTableSizeControls();

  const players = getPlayersFromLobby();

  editingTableLayout = getCurrentPositionMap(players);

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
    button.classList.add("layout-player-token");
    button.dataset.slot = player;

    button.style.left = position.x + "%";
    button.style.top = position.y + "%";

    button.innerHTML = `
      <span>${player}</span>
      <img src="CardBack.jpg" alt="${player}'s face-down card">
    `;

    enablePlayerDragging(button, player);

    playerLayer.appendChild(button);
  });
}

function enablePlayerDragging(button, player) {
  const board = document.getElementById("layoutEditorBoard");
  if (!board) return;

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    button.classList.add("dragging");
    button.setPointerCapture(event.pointerId);

    function movePlayer(moveEvent) {
      const rect = board.getBoundingClientRect();

      const x = clamp(
        ((moveEvent.clientX - rect.left) / rect.width) * 100,
        5,
        95
      );

      const y = clamp(
        ((moveEvent.clientY - rect.top) / rect.height) * 100,
        5,
        95
      );

      editingTableLayout[player] = { x, y };

      button.style.left = x + "%";
      button.style.top = y + "%";
    }

    function stopDragging() {
      button.classList.remove("dragging");
      button.removeEventListener("pointermove", movePlayer);
      button.removeEventListener("pointerup", stopDragging);
      button.removeEventListener("pointercancel", stopDragging);
    }

    button.addEventListener("pointermove", movePlayer);
    button.addEventListener("pointerup", stopDragging);
    button.addEventListener("pointercancel", stopDragging);
  });
}

function saveTableLayout() {
  if (!editingTableLayout) return;

  savedTableLayout = editingTableLayout;

  localStorage.setItem("tableLayout", JSON.stringify(savedTableLayout));
  localStorage.setItem("tableShape", selectedTableShape);
  saveTableSettings();
}

function resetTableLayout() {
  const players = getPlayersFromLobby();

  savedTableLayout = null;
  localStorage.removeItem("tableLayout");

  editingTableLayout = getGeneratedPositionMap(players, selectedTableShape);

  drawLayoutEditorPlayers();
}