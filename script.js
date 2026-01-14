// script.js

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
    
    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-next]");
        if(!target) return;

        const nextScreen = target.dataset.next;
        showScreen(nextScreen);
    });

    const numberOfPlayers = document.querySelectorAll(".player-list li").length;
    let numberOfRoles = numberOfPlayers + 3;

    const textElement = document.getElementById("numberofroles");
  
    if (textElement) {
      textElement.textContent = "Select " + numberOfRoles + " roles";
    } else {
      console.warn('No element found with id="numberofroles"');
    }

});






    
    

  