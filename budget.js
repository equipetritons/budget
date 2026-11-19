"use strict";

/* Budget app for iPhone Safari. PIN code: 1997 */

window.__budgetLoaded = true;

var STORAGE_KEY = "budget_v5";
var PIN_CODE = "1997";
var QUOTE_D = String.fromCharCode(34);
var QUOTE_S = String.fromCharCode(39);

var memoryFallback = null;

function readStorage() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    if (memoryFallback) {
      return memoryFallback;
    }
  }
  return null;
}

function writeStorage(obj) {
  memoryFallback = obj;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    // Private mode: data lives only until the page is closed.
  }
}

var data = readStorage() || { envelopes: [], expenses: [] };
if (!data.envelopes) { data.envelopes = []; }
if (!data.expenses) { data.expenses = []; }

var pinBuffer = "";
var root = document.getElementById("root");

function save() {
  writeStorage(data);
}

// Escape text so it is safe inside HTML.
// Entities are built from character codes so copy-paste cannot corrupt them.
var AMP = String.fromCharCode(38);

function entity(code) {
  return AMP + "#" + code + ";";
}

function esc(text) {
  var s = String(text);
  s = s.split(String.fromCharCode(38)).join(entity(38));
  s = s.split(String.fromCharCode(60)).join(entity(60));
  s = s.split(String.fromCharCode(62)).join(entity(62));
  s = s.split(QUOTE_D).join(entity(34));
  s = s.split(QUOTE_S).join(entity(39));
  return s;
}

function money(value) {
  return Number(value).toFixed(2) + " CHF";
}

function newId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 1000));
}

function spentFor(envId) {
  var total = 0;
  for (var i = 0; i < data.expenses.length; i++) {
    if (data.expenses[i].envelopeId === envId) {
      total += Number(data.expenses[i].amount);
    }
  }
  return total;
}

/* ---------- Lock screen ---------- */
function renderLock(message) {
  var dots = "";
  for (var i = 0; i < 4; i++) {
    dots += "<span class=" + QUOTE_D + "dot" + (i < pinBuffer.length ? " filled" : "") + QUOTE_D + "></span>";
  }

  var layout = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  var keys = "";
  for (var k = 0; k < layout.length; k++) {
    var key = layout[k];
    if (key === "") {
      keys += "<span class=" + QUOTE_D + "key-empty" + QUOTE_D + "></span>";
    } else if (key === "del") {
      keys += "<button type=" + QUOTE_D + "button" + QUOTE_D + " class=" + QUOTE_D + "key" + QUOTE_D +
        " data-key=" + QUOTE_D + "del" + QUOTE_D + ">&#9003;</button>";
    } else {
      keys += "<button type=" + QUOTE_D + "button" + QUOTE_D + " class=" + QUOTE_D + "key" + QUOTE_D +
        " data-key=" + QUOTE_D + key + QUOTE_D + ">" + key + "</button>";
    }
  }

  var text = message || "Entre ton code";
  root.innerHTML =
    "<div class=" + QUOTE_D + "lock" + QUOTE_D + ">" +
    "<h1>Budget</h1>" +
    "<p>" + esc(text) + "</p>" +
    "<div class=" + QUOTE_D + "dots" + QUOTE_D + ">" + dots + "</div>" +
    "<div class=" + QUOTE_D + "keypad" + QUOTE_D + ">" + keys + "</div>" +
    "</div>";
}

function pressKey(key) {
  if (key === "del") {
    pinBuffer = pinBuffer.slice(0, -1);
    renderLock();
    return;
  }
  if (pinBuffer.length >= 4) {
    return;
  }
  pinBuffer += key;
  renderLock();

  if (pinBuffer.length === 4) {
    if (pinBuffer === PIN_CODE) {
      pinBuffer = "";
      renderApp();
    } else {
      pinBuffer = "";
      setTimeout(function () {
        renderLock("Code incorrect, reessaie");
      }, 250);
    }
  }
}

/* ---------- Main screen ---------- */
function renderApp() {
  var D = QUOTE_D;
  var totalSpent = 0;
  for (var i = 0; i < data.expenses.length; i++) {
    totalSpent += Number(data.expenses[i].amount);
  }

  var envHtml = "";
  for (var e = 0; e < data.envelopes.length; e++) {
    var env = data.envelopes[e];
    var spent = spentFor(env.id);
    var pct = env.budget > 0 ? Math.min(100, (spent / env.budget) * 100) : 0;
    var over = spent > env.budget;
    envHtml +=
      "<div class=" + D + "row" + D + ">" +
      "<div style=" + D + "flex:1" + D + ">" +
      "<div>" + esc(env.name) + "</div>" +
      "<div class=" + D + "bar" + D + "><span class=" + D + (over ? "over" : "ok") + D +
      " style=" + D + "width:" + pct + "%" + D + "></span></div>" +
      "</div>" +
      "<span class=" + D + "amount" + (over ? " over" : "") + D + ">" +
      money(spent) + " / " + money(env.budget) + "</span>" +
      "<button type=" + D + "button" + D + " class=" + D + "danger" + D +
      " data-action=" + D + "del-env" + D + " data-id=" + D + env.id + D + ">&#10005;</button>" +
      "</div>";
  }
  if (envHtml === "") {
    envHtml = "<p class=" + D + "muted" + D + ">Aucune enveloppe. Ajoute-en une ci-dessous.</p>";
  }

  var options = "";
  for (var o = 0; o < data.envelopes.length; o++) {
    options += "<option value=" + D + data.envelopes[o].id + D + ">" + esc(data.envelopes[o].name) + "</option>";
  }
  if (options === "") {
    options = "<option value=" + D + D + ">Cree d abord une enveloppe</option>";
  }

  var histHtml = "";
  for (var h = data.expenses.length - 1; h >= 0; h--) {
    var ex = data.expenses[h];
    histHtml +=
      "<div class=" + D + "row" + D + ">" +
      "<span style=" + D + "flex:1" + D + ">" + esc(ex.note || "Depense") + "</span>" +
      "<span class=" + D + "amount" + D + ">" + money(ex.amount) + "</span>" +
      "<button type=" + D + "button" + D + " class=" + D + "danger" + D +
      " data-action=" + D + "del-exp" + D + " data-id=" + D + ex.id + D + ">&#10005;</button>" +
      "</div>";
  }
  if (histHtml === "") {
    histHtml = "<p class=" + D + "muted" + D + ">Aucune depense.</p>";
  }

  var disabledAttr = data.envelopes.length ? "" : " disabled";

  root.innerHTML =
    "<div class=" + D + "app" + D + ">" +
    "<header><h1>Budget</h1><p>Total depense : <b>" + money(totalSpent) + "</b></p></header>" +

    "<section class=" + D + "card" + D + "><h2>Enveloppes</h2>" + envHtml +
    "<form id=" + D + "envForm" + D + " class=" + D + "form" + D + ">" +
    "<input id=" + D + "envName" + D + " placeholder=" + D + "Nom (ex : Courses)" + D + " required autocomplete=" + D + "off" + D + ">" +
    "<input id=" + D + "envBudget" + D + " type=" + D + "number" + D + " inputmode=" + D + "decimal" + D +
    " step=" + D + "0.01" + D + " min=" + D + "0" + D + " placeholder=" + D + "Budget (CHF)" + D + " required>" +
    "<button type=" + D + "submit" + D + " class=" + D + "primary" + D + ">Ajouter l enveloppe</button>" +
    "</form></section>" +

    "<section class=" + D + "card" + D + "><h2>Nouvelle depense</h2>" +
    "<form id=" + D + "expForm" + D + " class=" + D + "form" + D + ">" +
    "<input id=" + D + "expAmount" + D + " type=" + D + "number" + D + " inputmode=" + D + "decimal" + D +
    " step=" + D + "0.01" + D + " min=" + D + "0" + D + " placeholder=" + D + "Montant (CHF)" + D + " required>" +
    "<select id=" + D + "expEnv" + D + ">" + options + "</select>" +
    "<input id=" + D + "expNote" + D + " placeholder=" + D + "Note (optionnel)" + D + " autocomplete=" + D + "off" + D + ">" +
    "<button type=" + D + "submit" + D + " class=" + D + "primary" + D + disabledAttr + ">Enregistrer</button>" +
    "</form></section>" +

    "<section class=" + D + "card" + D + "><h2>Historique</h2>" + histHtml + "</section>" +

    "<button type=" + D + "button" + D + " id=" + D + "lockBtn" + D + " class=" + D + "secondary" + D + ">Verrouiller</button>" +
    "</div>";

  document.getElementById("envForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = document.getElementById("envName").value.trim();
    var budget = parseFloat(document.getElementById("envBudget").value);
    if (!name || isNaN(budget) || budget < 0) {
      return;
    }
    data.envelopes.push({ id: newId(), name: name, budget: budget });
    save();
    renderApp();
  });

  document.getElementById("expForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var amount = parseFloat(document.getElementById("expAmount").value);
    var envId = document.getElementById("expEnv").value;
    if (isNaN(amount) || amount <= 0 || !envId) {
      return;
    }
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

/* ---------- One click listener for keypad and delete buttons ---------- */
root.addEventListener("click", function (ev) {
  var target = ev.target;
  while (target && target !== root && !target.getAttribute("data-key") && !target.getAttribute("data-action")) {
    target = target.parentNode;
  }
  if (!target || target === root) {
    return;
  }

  var key = target.getAttribute("data-key");
  if (key) {
    pressKey(key);
    return;
  }

  var action = target.getAttribute("data-action");
  var id = target.getAttribute("data-id");

  if (action === "del-env") {
    if (!window.confirm("Supprimer cette enveloppe et ses depenses ?")) {
      return;
    }
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

renderLock();
