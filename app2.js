"use strict";

/* =====================================================================
   Budget - single-file app. Data is stored in the browser (localStorage).
   The whole UI is built by this script, so it does not depend on
   any other HTML element.
   ===================================================================== */

const STORAGE_KEY = "budget_v2";
const DEFAULT_PIN = "1234";

// Load saved data, or create a starter structure on first launch.
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Could not read saved data", e);
  }
  return { pin: DEFAULT_PIN, envelopes: [], expenses: [] };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();
let unlocked = false;
let pinBuffer = "";

const root = document.getElementById("root");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[c]));
}

function formatMoney(value) {
  return Number(value).toFixed(2) + " CHF";
}

/* ---------- PIN screen ---------- */
function renderLock(message = "Entre ton code") {
  const dots = [0, 1, 2, 3].map((i) =>
    `<span class="dot ${i < pinBuffer.length ? "filled" : ""}"></span>`).join("");

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"]
    .map((k) => k === ""
      ? `<span></span>`
      : `<button class="key" data-key="${k}">${k}</button>`).join("");

  root.innerHTML = `
    <div class="lock">
      <h1>🔒 Budget</h1>
      <p>${escapeHtml(message)}</p>
      <div class="dots">${dots}</div>
      <div class="keypad">${keys}</div>
    </div>`;
}

function handleKey(key) {
  if (key === "⌫") {
    pinBuffer = pinBuffer.slice(0, -1);
    return renderLock();
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += key;
  renderLock();

  if (pinBuffer.length === 4) {
    if (pinBuffer === data.pin) {
      unlocked = true;
      pinBuffer = "";
      renderApp();
    } else {
      pinBuffer = "";
      setTimeout(() => renderLock("Code incorrect, réessaie"), 300);
    }
  }
}

/* ---------- Main screen ---------- */
function renderApp() {
  const total = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const envelopeRows = data.envelopes.length
    ? data.envelopes.map((env) => {
        const spent = data.expenses
          .filter((e) => e.envelopeId === env.id)
          .reduce((sum, e) => sum + Number(e.amount), 0);
        return `
          <div class="row">
            <span>${escapeHtml(env.name)}</span>
            <span>${formatMoney(spent)} / ${formatMoney(env.budget)}</span>
          </div>`;
      }).join("")
    : `<p class="muted">Aucune enveloppe. Ajoute-en une ci-dessous.</p>`;

  const envelopeOptions = data.envelopes
    .map((env) => `<option value="${env.id}">${escapeHtml(env.name)}</option>`).join("");

  root.innerHTML = `
    <div class="app">
      <header><h1>Budget</h1><p>Total dépensé : <b>${formatMoney(total)}</b></p></header>

      <section class="card">
        <h2>Enveloppes</h2>
        ${envelopeRows}
        <form id="envForm" class="form">
          <input id="envName" placeholder="Nom (ex : Courses)" required>
          <input id="envBudget" type="number" step="0.01" min="0" placeholder="Budget (CHF)" required>
          <button type="submit">Ajouter l'enveloppe</button>
        </form>
      </section>

      <section class="card">
        <h2>Nouvelle dépense</h2>
        <form id="expForm" class="form">
          <input id="expAmount" type="number" step="0.01" min="0" placeholder="Montant (CHF)" required>
          <select id="expEnv">
            ${envelopeOptions || '<option value="">(crée d\'abord une enveloppe)</option>'}
          </select>
          <input id="expNote" placeholder="Note (optionnel)">
          <button type="submit" ${data.envelopes.length ? "" : "disabled"}>Enregistrer</button>
        </form>
      </section>

      <section class="card">
        <h2>Historique</h2>
        ${data.expenses.slice().reverse().map((e) => `
          <div class="row">
            <span>${escapeHtml(e.note || "Dépense")}</span>
            <span>${formatMoney(e.amount)}</span>
          </div>`).join("") || `<p class="muted">Aucune dépense.</p>`}
      </section>

      <button id="lockBtn" class="secondary">🔒 Verrouiller</button>
    </div>`;

  document.getElementById("envForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    data.envelopes.push({
      id: Date.now().toString(),
      name: document.getElementById("envName").value.trim(),
      budget: Number(document.getElementById("envBudget").value),
    });
    saveData();
    renderApp();
  });

  document.getElementById("expForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    data.expenses.push({
      id: Date.now().toString(),
      amount: Number(document.getElementById("expAmount").value),
      envelopeId: document.getElementById("expEnv").value,
      note: document.getElementById("expNote").value.trim(),
    });
    saveData();
    renderApp();
  });

  document.getElementById("lockBtn").addEventListener("click", () => {
    unlocked = false;
    pinBuffer = "";
    renderLock();
  });
}

/* ---------- Events ---------- */
root.addEventListener("click", (ev) => {
  const key = ev.target.closest("[data-key]");
  if (key && !unlocked) handleKey(key.dataset.key);
});

/* ---------- Start ---------- */
renderLock();
