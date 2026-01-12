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
  
  // Wait for the page to load before wiring up buttons
document.addEventListener("DOMContentLoaded", () => {
    
    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-next]");
        if(!target) return;

        const nextScreen = target.dataset.next;
        showScreen(nextScreen);
    })
});
    
    

  