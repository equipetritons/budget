"use strict";

/* =====================================================================
   Budget app - built for iPhone Safari.
   - Plain ES5-style syntax (no optional chaining) for older iOS versions.
   - All data stays on the device (localStorage), with a safe fallback.
   ===================================================================== */

var STORAGE_KEY = "budget_v3";
var DEFAULT_PIN = "1234";

/* ---------- Safe storage (private mode on iOS can throw) ---------- */
var memoryFallback = null;

function readStorage() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    if (memoryFallback) return memoryFallback;
  }
  return null;
}

function writeStorage(obj) {
  memoryFallback = obj;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    // Data will only live until the page is closed.
  }
}

var data = readStorage() || { pin: DEFAULT_PIN, envelopes: [], expenses: [] };
if (!data.envelopes) data.envelopes = [];
if (!data.expenses) data.expenses = [];
if (!data.pin) data.pin = DEFAULT_PIN;

var pinBuffer = "";
var root = document.getElementById("root");

/* ---------- Helpers ---------- */
function save() { writeStorage(data); }

function esc(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[c];
  });
}

function money(value) {
  return Number(value).toFixed(2) + " CHF";
}

function newId() {
  return String(Date.now()) + Math.floor(Math.random() * 1000);
}

function spentFor(envId) {
  var total = 0;
  for (var i = 0; i < data.expenses.length; i++) {
    if (data.expenses[i].envelopeId === envId) total += Number(data.expenses[i].amount);
  }
  return total;
}

/* ---------- Lock screen ---------- */
function renderLock(message) {
  var dots = "";
  for (var i = 0; i < 4; i++) {
    dots += '<span class="dot' + (i < pinBuffer.length ? " filled" : "") + '"></span>';
  }

  var keys = "";
  var layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  for (var k = 0; k < layout.length; k++) {
    var key = layout[k];
    if (key === "") {
      keys += '<span class="key-empty"></span>';
    } else if (key === "del") {
      keys += '<button type="button" class="key" data-key="del" aria-label="Effacer">&#9003;</button>';
    } else {
      keys += '<button type="button" class="key" data-key="' + key + '">' + key + "</button>";
    }
  }

  root.innerHTML =
    '<div class="lock">' +
    "<h1>Budget</h1>" +
    "<p>" + esc(message || "Entre ton code") + "</p>" +
    '<div class="dots">' + dots + "</div>" +
    '<div class="keypad">' + keys + "</div>" +
    "</div>";
}

function pressKey(key) {
  if (key === "del") {
    pinBuffer = pinBuffer.slice(0, -1);
    renderLock();
    return;
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += key;
  renderLock();

  if (pinBuffer.length === 4) {
    if (pinBuffer === data.pin) {
      pinBuffer = "";
      renderApp();
    } else {
      pinBuffer = "";
      setTimeout(function () { renderLock("Code incorrect, réessaie"); }, 250);
    }
  }
}

/* ---------- Main screen ---------- */
function renderApp() {
  var totalSpent = 0;
  for (var i = 0; i < data.expenses.length; i++) totalSpent += Number(data.expenses[i].amount);

  var envHtml = "";
  for (var e = 0; e < data.envelopes.length; e++) {
    var env = data.envelopes[e];
    var spent = spentFor(env.id);
    var pct = env.budget > 0 ? Math.min(100, (spent / env.budget) * 100) : 0;
    var over = spent > env.budget;
    envHtml +=
      '<div class="row"><div style="flex:1">' +
      "<div>" + esc(env.name) + "</div>" +
      '<div class="bar"><span class="' + (over ? "over" : "") + '" style="width:' + pct + '%"></span></div>' +
      "</div>" +
      '<span class="amount' + (over ? " over" : "") + '">' + money(spent) + " / " + money(env.budget) + "</span>" +
      '<button type="button" class="danger" data-action="del-env" data-id="' + env.id + '" aria-label="Supprimer">&#10005;</button>' +
      "</div>";
  }
  if (!envHtml) envHtml = '<p class="muted">Aucune enveloppe. Ajoute-en une ci-dessous.</p>';

  var options = "";
  for (var o = 0; o < data.envelopes.length; o++) {
    options += '<option value="' + data.envelopes[o].id + '">' + esc(data.envelopes[o].name) + "</option>";
  }
  if (!options) options = '<option value="">Crée d\'abord une enveloppe</option>';

  var histHtml = "";
  for (var h = data.expenses.length - 1; h >= 0; h--) {
    var ex = data.expenses[h];
    histHtml +=
      '<div class="row"><span style="flex:1">' + esc(ex.note || "Dépense") + "</span>" +
      '<span class="amount">' + money(ex.amount) + "</span>" +
      '<button type="button" class="danger" data-action="del-exp" data-id="' + ex.id + '" aria-label="Supprimer">&#10005;</button>' +
      "</div>";
  }
  if (!histHtml) histHtml = '<p class="muted">Aucune dépense.</p>';

  root.innerHTML =
    '<div class="app">' +
    '<header><h1>Budget</h1><p>Total dépensé : <b>' + money(totalSpent) + "</b></p></header>" +

    '<section class="card"><h2>Enveloppes</h2>' + envHtml +
    '<form id="envForm" class="form">' +
    '<input id="envName" placeholder="Nom (ex : Courses)" required autocomplete="off">' +
    '<input id="envBudget" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Budget (CHF)" required>' +
    '<button type="submit" class="primary">Ajouter l\'enveloppe</button>' +
    "</form></section>" +

    '<section class="card"><h2>Nouvelle dépense</h2>' +
    '<form id="expForm" class="form">' +
    '<input id="expAmount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Montant (CHF)" required>' +
    '<select id="expEnv">' + options + "</select>" +
    '<input id="expNote" placeholder="Note (optionnel)" autocomplete="off">' +
    '<button type="submit" class="primary"' + (data.envelopes.length ? "" : " disabled") + ">Enregistrer</button>" +
    "</form></section>" +

    '<section class="card"><h2>Historique</h2>' + histHtml + "</section>" +

    '<button type="button" id="lockBtn" class="secondary">Verrouiller</button>' +
    "</div>";

  document.getElementById("envForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = document.getElementById("envName").value.trim();
    var budget = parseFloat(document.getElementById("envBudget").value);
    if (!name || isNaN(budget) || budget < 0) return;
    data.envelopes.push({ id: newId(), name: name, budget: budget });
    save();
    renderApp();
  });

  document.getElementById("expForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var amount = parseFloat(document.getElementById("expAmount").value);
    var envId = document.getElementById("expEnv").value;
    if (isNaN(amount) || amount <= 0 || !envId) return;
    data.expenses.push({
      id: newId(),
      amount: amount,
      envelopeId: envId,
      note: document.getElementById("expNote").value.trim()
    });
    save();
    renderApp();
  });

  document.getElementById("lockBtn").addEventListener("click", function () {
    pinBuffer = "";
    renderLock();
  });
}

/* ---------- Click handling (one listener for the whole page) ---------- */
root.addEventListener("click", function (ev) {
  var target = ev.target;
  while (target && target !== root && !target.getAttribute("data-key") && !target.getAttribute("data-action")) {
    target = target.parentNode;
  }
  if (!target || target === root) return;

  var key = target.getAttribute("data-key");
  if (key) { pressKey(key); return; }

  var action = target.getAttribute("data-action");
  var id = target.getAttribute("data-id");

  if (action === "del-env") {
    if (!window.confirm("Supprimer cette enveloppe et ses dépenses ?")) return;
    data.envelopes = data.envelopes.filter(function (x) { return x.id !== id; });
    data.expenses = data.expenses.filter(function (x) { return x.envelopeId !== id; });
    save();
    renderApp();
  } else if (action === "del-exp") {
    data.expenses = data.expenses.filter(function (x) { return x.id !== id; });
    save();
    renderApp();
  }
});

/* ---------- Start ---------- */
renderLock();
