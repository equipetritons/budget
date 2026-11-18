"use strict";

// Minimal working version to confirm the page loads.
const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", () => {
  $("#app").classList.remove("hidden");
  $("#view").innerHTML = `
    <div style="padding:20px">
      <h2>✅ Ça fonctionne</h2>
      <p>L'application s'affiche correctement.</p>
    </div>`;
});
