// script.js

function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });
  
    // Show the requested screen
    const next = document.getElementById(screenId);
    if (next) next.classList.add("active");
  }
  
  // Wait for the page to load before wiring up buttons
  document.addEventListener("DOMContentLoaded", () => {
    // HOME
    const btnCreateRoom = document.querySelector("#screen-home button:nth-of-type(1)");
    const btnJoinRoom = document.querySelector("#screen-home button:nth-of-type(2)");
  
    // LOBBY
    const btnReady = document.querySelector("#screen-lobby button:nth-of-type(1)");
    const btnStartGame = document.querySelector("#screen-lobby button.primary");
  
    // NIGHT
    const btnSubmitAction = document.querySelector("#screen-night button.primary");
  
    // VOTING
    const voteButtons = document.querySelectorAll("#screen-voting .vote-list button");
  
    // REVEAL
    const btnPlayAgain = document.querySelector("#screen-reveal button.primary");
  
    // --- Wire up navigation ---
    btnCreateRoom?.addEventListener("click", () => showScreen("screen-lobby"));
    btnJoinRoom?.addEventListener("click", () => showScreen("screen-lobby"));
  
    // Ready doesn't change screens here, but you can if you want
    btnReady?.addEventListener("click", () => {
      alert("Marked ready (placeholder).");
    });
  
    btnStartGame?.addEventListener("click", () => showScreen("screen-night"));
    btnSubmitAction?.addEventListener("click", () => showScreen("screen-discussion"));
  
    // For now: click any vote button -> reveal screen
    voteButtons.forEach((btn) => {
      btn.addEventListener("click", () => showScreen("screen-reveal"));
    });
  
    btnPlayAgain?.addEventListener("click", () => showScreen("screen-home"));
  
    // Optional: allow clicking the discussion timer to move to voting (placeholder)
    const discussionTimer = document.querySelector("#screen-discussion .timer");
    discussionTimer?.addEventListener("click", () => showScreen("screen-voting"));
  });
  