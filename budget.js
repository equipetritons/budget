"use strict";

/* Budget app for iPhone Safari. PIN code: 1997 */

window.__budgetLoaded = true;

var STORAGE_KEY = "budget_v5";
var PIN_CODE = "1997";
var EXPORT_KEY = "budget_last_export";

/* =====================================================================
   DATA PROTECTION (must run before the data is loaded)
   ===================================================================== */

// One-time recovery: look for older storage keys and migrate their data.
(function recoverOldData() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) { return; }
    var best = null;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.toLowerCase().indexOf("budget") !== -1 && k !== STORAGE_KEY && k !== EXPORT_KEY) {
        var raw = localStorage.getItem(k);
        // Keep the largest candidate: it most likely holds the most data.
        if (raw && (!best || raw.length > best.length)) { best = raw; }
      }
    }
    if (best) { localStorage.setItem(STORAGE_KEY, best); }
  } catch (err) {}
})();

// Ask the browser to keep our data (prevents automatic cleanup).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// Second copy of the data in IndexedDB, used if localStorage gets wiped.
var BACKUP_DB = "budget_backup_db";
var BACKUP_STORE = "snapshots";

function openBackupDb(callback) {
  try {
    var req = indexedDB.open(BACKUP_DB, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(BACKUP_STORE); };
    req.onsuccess = function () { callback(req.result); };
    req.onerror = function () { callback(null); };
  } catch (e) { callback(null); }
}

function writeBackup(jsonText) {
  openBackupDb(function (db) {
    if (!db) { return; }
    try {
      var tx = db.transaction(BACKUP_STORE, "readwrite");
      tx.objectStore(BACKUP_STORE).put(jsonText, "latest");
    } catch (e) {}
  });
}

function readBackup(callback) {
  openBackupDb(function (db) {
    if (!db) { return callback(null); }
    try {
      var tx = db.transaction(BACKUP_STORE, "readonly");
      var req = tx.objectStore(BACKUP_STORE).get("latest");
      req.onsuccess = function () { callback(req.result || null); };
      req.onerror = function () { callback(null); };
    } catch (e) { callback(null); }
  });
}

/* ---------- Storage ---------- */
var memoryFallback = null;

function readStorage() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) { return JSON.parse(raw); }
  } catch (e) {
    if (memoryFallback) { return memoryFallback; }
  }
  return null;
}

function writeStorage(obj) {
  memoryFallback = obj;
  var text = JSON.stringify(obj);
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch (e) {
    // Private mode: data lives only until the page is closed.
  }
  writeBackup(text);
}

/* ---------- Data model ----------
   envelopes: { id, name, amount, kind }  kind = "variable" | "fixed"
   incomes:   { id, name, amount }        recurring monthly income
   expenses:  { id, envelopeId, amount, date (YYYY-MM-DD), note }
   oneoffs:   { id, name, amount, date }  one-time income (refund, etc.)
*/
var data = readStorage() || {};
normalizeData();

function normalizeData() {
  if (!data.envelopes) { data.envelopes = []; }
  if (!data.expenses) { data.expenses = []; }
  if (!data.incomes) { data.incomes = []; }
  if (!data.oneoffs) { data.oneoffs = []; }
  data.envelopes.forEach(function (e) {
    if (!e.kind) { e.kind = "variable"; }
  });
}

function save() {
  writeStorage(data);
}

/* ---------- Helpers ---------- */
var root = document.getElementById("root");
var pinBuffer = "";
var currentTab = "home";
var viewMonth = monthKey(new Date());
var addType = "expense";
var scanStatus = "";
// editing = { type: "env"|"income"|"exp"|"oneoff", id: "..." } or null
var editing = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function monthKey(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function shiftMonth(key, delta) {
  var parts = key.split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
  return monthKey(d);
}

function monthLabel(key) {
  var parts = key.split("-");
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
}

function money(n) {
  var v = Number(n) || 0;
  return v.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " CHF";
}

function toNumber(text) {
  var n = parseFloat(String(text).replace(",", ".").replace(/\s/g, ""));
  return isNaN(n) ? 0 : n;
}

// Build HTML entities from char codes so copy-paste cannot corrupt them.
var AMP = String.fromCharCode(38);
function entity(code) {
  return AMP + "#" + code + ";";
}
function esc(text) {
  var s = String(text);
  s = s.split(String.fromCharCode(38)).join(entity(38));
  s = s.split(String.fromCharCode(60)).join(entity(60));
  s = s.split(String.fromCharCode(62)).join(entity(62));
  s = s.split(String.fromCharCode(34)).join(entity(34));
  s = s.split(String.fromCharCode(39)).join(entity(39));
  return s;
}

function findById(list, id) {
  return list.filter(function (x) { return x.id === id; })[0];
}

/* ---------- Export / Import ---------- */
function exportData() {
  var text = JSON.stringify(data, null, 2);
  var blob = new Blob([text], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "budget-sauvegarde-" + todayStr() + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  try { localStorage.setItem(EXPORT_KEY, todayStr()); } catch (e) {}
}

function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(String(reader.result));
      if (!parsed || !Array.isArray(parsed.envelopes) || !Array.isArray(parsed.expenses)) {
        window.alert("Fichier invalide.");
        return;
      }
      if (!window.confirm("Remplacer toutes les donnees actuelles par ce fichier ?")) { return; }
      data = parsed;
      normalizeData();
      save();
      renderApp();
    } catch (e) {
      window.alert("Impossible de lire ce fichier.");
    }
  };
  reader.readAsText(file);
}

function daysSinceExport() {
  try {
    var last = localStorage.getItem(EXPORT_KEY);
    if (!last) { return null; }
    var diff = Date.now() - new Date(last + "T00:00:00").getTime();
    return Math.floor(diff / 86400000);
  } catch (e) { return null; }
}

/* ---------- Calculations ---------- */
function computeMonth(key) {
  var incomeFixed = 0;
  data.incomes.forEach(function (i) { incomeFixed += Number(i.amount) || 0; });
  var incomeOne = 0;
  data.oneoffs.forEach(function (o) {
    if (o.date.slice(0, 7) === key) { incomeOne += Number(o.amount) || 0; }
  });

  var fixedOut = 0;
  var varBudget = 0;
  var varSpent = 0;
  var envStats = [];

  data.envelopes.forEach(function (e) {
    var spent = 0;
    data.expenses.forEach(function (x) {
      if (x.envelopeId === e.id && x.date.slice(0, 7) === key) {
        spent += Number(x.amount) || 0;
      }
    });
    var budget = Number(e.amount) || 0;
    if (e.kind === "fixed") {
      fixedOut += budget;
    } else {
      varBudget += budget;
      varSpent += spent;
    }
    envStats.push({ env: e, spent: spent, budget: budget });
  });

  var totalIn = incomeFixed + incomeOne;
  var totalOut = fixedOut + varSpent;
  var percent = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;

  return {
    incomeFixed: incomeFixed,
    incomeOne: incomeOne,
    totalIn: totalIn,
    fixedOut: fixedOut,
    varBudget: varBudget,
    varSpent: varSpent,
    totalOut: totalOut,
    balance: totalIn - totalOut,
    percent: percent,
    envStats: envStats,
    varLeft: varBudget - varSpent
  };
}

/* ---------- Lock screen ---------- */
function renderLock() {
  var dots = "";
  for (var i = 0; i < 4; i++) {
    dots += '<div class="dot' + (i < pinBuffer.length ? " on" : "") + '"></div>';
  }
  var keys = "";
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].forEach(function (k) {
    if (k === "") {
      keys += "<div></div>";
    } else if (k === "del") {
      keys += '<button class="key" data-key="del">\u232B</button>';
    } else {
      keys += '<button class="key" data-key="' + k + '">' + k + "</button>";
    }
  });
  root.innerHTML =
    '<div class="lock"><h1>Budget</h1><div class="muted">Entre ton code</div>' +
    '<div class="dots">' + dots + "</div>" +
    '<div class="keypad">' + keys + "</div></div>";
}

function pressKey(k) {
  if (k === "del") {
    pinBuffer = pinBuffer.slice(0, -1);
  } else if (pinBuffer.length < 4) {
    pinBuffer += k;
  }
  if (pinBuffer.length === 4) {
    if (pinBuffer === PIN_CODE) {
      pinBuffer = "";
      renderApp();
      return;
    }
    pinBuffer = "";
    if (navigator.vibrate) { navigator.vibrate(200); }
  }
  renderLock();
}

/* ---------- Main app ---------- */
function tabBar() {
  function tab(id, icon, label, extra) {
    return '<button class="tab' + (currentTab === id ? " active" : "") + (extra || "") +
      '" data-tab="' + id + '"><span class="ic">' + icon + "</span>" + label + "</button>";
  }
  return '<div class="tabs">' +
    tab("home", "\uD83C\uDFE0", "Accueil") +
    tab("envelopes", "\uD83D\uDCC2", "Enveloppes") +
    tab("add", "+", "", " add") +
    tab("history", "\uD83D\uDCCB", "Historique") +
    tab("settings", "\u2699\uFE0F", "Fixes") +
    "</div>";
}

function monthBar() {
  return '<div class="monthbar">' +
    '<button class="iconbtn" data-action="prev">\u2039</button>' +
    '<div class="label">' + esc(monthLabel(viewMonth)) + "</div>" +
    '<button class="iconbtn" data-action="next">\u203A</button></div>';
}

function renderApp() {
  var body = "";
  if (editing) { body = viewEdit(); }
  else if (currentTab === "home") { body = viewHome(); }
  else if (currentTab === "envelopes") { body = viewEnvelopes(); }
  else if (currentTab === "add") { body = viewAdd(); }
  else if (currentTab === "history") { body = viewHistory(); }
  else if (currentTab === "settings") { body = viewSettings(); }
  root.innerHTML = body + tabBar();
}

function viewHome() {
  var m = computeMonth(viewMonth);
  var pct = Math.min(100, Math.max(0, m.percent));
  var barColor = m.percent > 100 ? "var(--red)" : (m.percent > 85 ? "var(--orange)" : "var(--green)");
  var balClass = m.balance >= 0 ? "pos" : "neg";

  var html = "<h1>Budget</h1>" + monthBar();

  html += '<div class="card">' +
    '<div class="muted">Solde du mois</div>' +
    '<div class="bigamount ' + balClass + '">' + money(m.balance) + "</div>" +
    '<div class="grid3" style="margin-top:12px">' +
    '<div class="stat"><div class="muted">Rentrees</div><div class="v pos">' + money(m.totalIn) + "</div></div>" +
    '<div class="stat"><div class="muted">Sorties</div><div class="v neg">' + money(m.totalOut) + "</div></div>" +
    '<div class="stat"><div class="muted">Depense</div><div class="v">' + m.percent.toFixed(0) + " %</div></div>" +
    "</div>" +
    '<div class="bar"><div style="width:' + pct + "%;background:" + barColor + '"></div></div>' +
    "</div>";

  var leftClass = m.varLeft >= 0 ? "pos" : "neg";
  html += '<div class="card"><h2>Budget variable</h2>' +
    '<div class="row"><span>Prevu</span><span class="amt">' + money(m.varBudget) + "</span></div>" +
    '<div class="row"><span>Depense</span><span class="amt">' + money(m.varSpent) + "</span></div>" +
    '<div class="row"><span>Reste a gratter</span><span class="amt ' + leftClass + '">' + money(m.varLeft) + "</span></div>" +
    "</div>";

  var variable = m.envStats.filter(function (s) { return s.env.kind === "variable"; });
  html += '<div class="card"><h2>Enveloppes</h2>';
  if (variable.length === 0) {
    html += '<div class="empty">Aucune enveloppe. Va dans Fixes pour en creer.</div>';
  } else {
    html += '<div class="muted" style="margin-bottom:6px">Touche une enveloppe pour la modifier</div>';
  }
  variable.forEach(function (s) {
    html += envelopeRow(s);
  });
  html += "</div>";
  return html;
}

// The whole envelope block is clickable (data-action="edit-env").
function envelopeRow(s) {
  var left = s.budget - s.spent;
  var over = left < 0;
  var p = s.budget > 0 ? Math.min(100, (s.spent / s.budget) * 100) : (s.spent > 0 ? 100 : 0);
  var color = over ? "var(--red)" : (p > 85 ? "var(--orange)" : "var(--green)");
  return '<div class="envelope" data-action="edit-env" data-id="' + esc(s.env.id) + '"><div class="envhead">' +
    "<div><b>" + esc(s.env.name) + "</b>" + (over ? '<span class="badge over">depasse</span>' : "") + "</div>" +
    '<div class="' + (over ? "neg" : "") + '"><b>' + money(left) + "</b></div></div>" +
    '<div class="muted">' + money(s.spent) + " / " + money(s.budget) + "</div>" +
    '<div class="bar mini"><div style="width:' + p + "%;background:" + color + '"></div></div></div>';
}

function viewEnvelopes() {
  var m = computeMonth(viewMonth);
  var html = "<h1>Enveloppes</h1>" + monthBar();
  html += '<div class="card"><h2>Variables</h2>';
  var variable = m.envStats.filter(function (s) { return s.env.kind === "variable"; });
  if (variable.length === 0) { html += '<div class="empty">Aucune enveloppe variable</div>'; }
  variable.forEach(function (s) { html += envelopeRow(s); });
  html += "</div>";

  html += '<div class="card"><h2>Charges fixes</h2>';
  var fixed = m.envStats.filter(function (s) { return s.env.kind === "fixed"; });
  if (fixed.length === 0) { html += '<div class="empty">Aucune charge fixe</div>'; }
  fixed.forEach(function (s) {
    html += '<div class="row" data-action="edit-env" data-id="' + esc(s.env.id) + '"><span class="name">' + esc(s.env.name) +
      '</span><span class="amt">' + money(s.budget) + "</span></div>";
  });
  html += "</div>";
  return html;
}

function viewAdd() {
  var html = "<h1>Ajouter</h1>";
  html += '<div class="seg">' +
    '<button data-addtype="expense" class="' + (addType === "expense" ? "on" : "") + '">Depense</button>' +
    '<button data-addtype="income" class="' + (addType === "income" ? "on" : "") + '">Rentree</button></div>';

  html += '<div class="card">';
  if (addType === "expense") {
    html += '<input id="f_amount" class="bigamount" type="text" inputmode="decimal" placeholder="0.00">';
    // Only variable envelopes can receive expenses; fixed charges are automatic.
    var variableEnvs = data.envelopes.filter(function (e) {
      return e.kind !== "fixed";
    });
    if (variableEnvs.length === 0) {
      html += '<div class="empty">Cree d abord une enveloppe variable dans Fixes</div>';
    } else {
      html += '<select id="f_env">';
      variableEnvs.forEach(function (e) {
        html += '<option value="' + esc(e.id) + '">' + esc(e.name) + "</option>";
      });
      html += "</select>";
    }
    html += '<input id="f_note" type="text" placeholder="Note (facultatif)">';
    html += '<input id="f_date" type="date" value="' + todayStr() + '">';
    html += '<button class="btn green" data-action="save-expense">Enregistrer la depense</button>';
    html += '<div style="height:10px"></div>';
    html += '<label class="btn ghost" style="display:block;text-align:center">\uD83D\uDCF7 Scanner un ticket' +
      '<input id="f_scan" type="file" accept="image/*" style="display:none"></label>';
    html += '<div class="status" id="scanstatus">' + esc(scanStatus) + "</div>";
  } else {
    html += '<input id="f_amount" class="bigamount" type="text" inputmode="decimal" placeholder="0.00">';
    html += '<input id="f_name" type="text" placeholder="Nom (remboursement, cadeau...)">';
    html += '<input id="f_date" type="date" value="' + todayStr() + '">';
    html += '<button class="btn green" data-action="save-income">Enregistrer la rentree</button>';
  }
  html += "</div>";
  return html;
}

function viewHistory() {
  var html = "<h1>Historique</h1>" + monthBar();
  var items = [];
  data.expenses.forEach(function (x) {
    if (x.date.slice(0, 7) === viewMonth) {
      var env = findById(data.envelopes, x.envelopeId);
      items.push({ id: x.id, type: "exp", date: x.date, title: env ? env.name : "?", note: x.note, amount: x.amount });
    }
  });
  data.oneoffs.forEach(function (o) {
    if (o.date.slice(0, 7) === viewMonth) {
      items.push({ id: o.id, type: "inc", date: o.date, title: o.name, note: "", amount: o.amount });
    }
  });
  items.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  html += '<div class="card">';
  if (items.length === 0) {
    html += '<div class="empty">Rien ce mois-ci</div>';
  } else {
    html += '<div class="muted" style="margin-bottom:6px">Touche une ligne pour la modifier</div>';
  }
  items.forEach(function (it) {
    var editAction = it.type === "inc" ? "edit-oneoff" : "edit-exp";
    html += '<div class="row" data-action="' + editAction + '" data-id="' + esc(it.id) + '"><div><div class="name">' + esc(it.title) + "</div>" +
      '<div class="muted">' + esc(it.date) + (it.note ? " - " + esc(it.note) : "") + "</div></div>" +
      "<div style=\"text-align:right\"><div class=\"amt " + (it.type === "inc" ? "pos" : "") + '">' +
      (it.type === "inc" ? "+" : "-") + money(it.amount) + "</div></div></div>";
  });
  html += "</div>";
  return html;
}

function viewSettings() {
  var html = "<h1>Fixes</h1>";

  var days = daysSinceExport();
  if (days === null || days >= 7) {
    html += '<div class="card"><b>Sauvegarde conseillee</b><div class="muted">' +
      (days === null ? "Aucune sauvegarde faite." : "Derniere sauvegarde il y a " + days + " jours.") +
      '</div><button class="btn green" data-action="export">Exporter mes donnees</button></div>';
  }

  html += '<div class="card"><h2>Rentrees fixes (chaque mois)</h2>';
  if (data.incomes.length === 0) { html += '<div class="empty">Aucune (ex: salaire)</div>'; }
  else { html += '<div class="muted" style="margin-bottom:6px">Touche une ligne pour la modifier</div>'; }
  data.incomes.forEach(function (i) {
    html += '<div class="row" data-action="edit-income" data-id="' + esc(i.id) + '"><span class="name">' + esc(i.name) +
      '</span><span class="amt pos">' + money(i.amount) + "</span></div>";
  });
  html += '<input id="s_inc_name" type="text" placeholder="Nom (Salaire)">' +
    '<input id="s_inc_amt" type="text" inputmode="decimal" placeholder="Montant">' +
    '<button class="btn" data-action="add-income-fixed">Ajouter la rentree</button></div>';

  html += '<div class="card"><h2>Enveloppes et charges</h2>';
  if (data.envelopes.length === 0) { html += '<div class="empty">Aucune enveloppe</div>'; }
  else { html += '<div class="muted" style="margin-bottom:6px">Touche une ligne pour la modifier</div>'; }
  data.envelopes.forEach(function (e) {
    html += '<div class="row" data-action="edit-env" data-id="' + esc(e.id) + '"><div><div class="name">' + esc(e.name) + "</div>" +
      '<div class="muted">' + (e.kind === "fixed" ? "Charge fixe" : "Variable") + "</div></div>" +
      '<span class="amt">' + money(e.amount) + "</span></div>";
  });
  html += '<input id="s_env_name" type="text" placeholder="Nom (Loyer, Courses...)">' +
    '<input id="s_env_amt" type="text" inputmode="decimal" placeholder="Montant par mois">' +
    '<select id="s_env_kind"><option value="variable">Variable (courses, loisirs...)</option>' +
    '<option value="fixed">Charge fixe (loyer, assurance...)</option></select>' +
    '<button class="btn" data-action="add-env">Ajouter l enveloppe</button></div>';

  html += '<div class="card"><h2>Donnees</h2>' +
    '<button class="btn green" data-action="export">Exporter mes donnees</button>' +
    '<div style="height:10px"></div>' +
    '<label class="btn ghost" style="display:block;text-align:center">Importer une sauvegarde' +
    '<input id="f_import" type="file" accept="application/json,.json" style="display:none"></label>' +
    '<div style="height:10px"></div>' +
    '<button class="btn red" data-action="reset">Tout effacer</button></div>';
  return html;
}

/* ---------- Edit screen (envelope, fixed income, expense, one-off) ---------- */
function viewEdit() {
  var html = "";
  var item;

  if (editing.type === "env") {
    item = findById(data.envelopes, editing.id);
    if (!item) { editing = null; return viewHome(); }
    html += "<h1>Modifier l enveloppe</h1>" + '<div class="card">' +
      '<div class="muted">Nom</div><input id="e_name" type="text" value="' + esc(item.name) + '">' +
      '<div class="muted">Montant par mois (CHF)</div>' +
      '<input id="e_amount" class="bigamount" type="text" inputmode="decimal" value="' + esc(item.amount) + '">' +
      '<div class="muted">Type</div><select id="e_kind">' +
      '<option value="variable"' + (item.kind === "variable" ? " selected" : "") + '>Variable (courses, loisirs...)</option>' +
      '<option value="fixed"' + (item.kind === "fixed" ? " selected" : "") + '>Charge fixe (loyer, assurance...)</option></select>' +
      '<button class="btn green" data-action="save-edit">Enregistrer</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn ghost" data-action="cancel-edit">Annuler</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn red" data-action="del-env" data-id="' + esc(item.id) + '">Supprimer cette enveloppe</button></div>';
  } else if (editing.type === "income") {
    item = findById(data.incomes, editing.id);
    if (!item) { editing = null; return viewHome(); }
    html += "<h1>Modifier la rentree fixe</h1>" + '<div class="card">' +
      '<div class="muted">Nom</div><input id="e_name" type="text" value="' + esc(item.name) + '">' +
      '<div class="muted">Montant par mois (CHF)</div>' +
      '<input id="e_amount" class="bigamount" type="text" inputmode="decimal" value="' + esc(item.amount) + '">' +
      '<button class="btn green" data-action="save-edit">Enregistrer</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn ghost" data-action="cancel-edit">Annuler</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn red" data-action="del-income-fixed" data-id="' + esc(item.id) + '">Supprimer</button></div>';
  } else if (editing.type === "exp") {
    item = findById(data.expenses, editing.id);
    if (!item) { editing = null; return viewHome(); }
    html += "<h1>Modifier la depense</h1>" + '<div class="card">' +
      '<div class="muted">Montant (CHF)</div>' +
      '<input id="e_amount" class="bigamount" type="text" inputmode="decimal" value="' + esc(item.amount) + '">' +
      '<div class="muted">Enveloppe</div><select id="e_env">';
    data.envelopes.forEach(function (e) {
      html += '<option value="' + esc(e.id) + '"' + (e.id === item.envelopeId ? " selected" : "") + ">" + esc(e.name) + "</option>";
    });
    html += "</select>" +
      '<div class="muted">Note</div><input id="e_note" type="text" value="' + esc(item.note || "") + '">' +
      '<div class="muted">Date</div><input id="e_date" type="date" value="' + esc(item.date) + '">' +
      '<button class="btn green" data-action="save-edit">Enregistrer</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn ghost" data-action="cancel-edit">Annuler</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn red" data-action="del-exp" data-id="' + esc(item.id) + '">Supprimer cette depense</button></div>';
  } else if (editing.type === "oneoff") {
    item = findById(data.oneoffs, editing.id);
    if (!item) { editing = null; return viewHome(); }
    html += "<h1>Modifier la rentree</h1>" + '<div class="card">' +
      '<div class="muted">Nom</div><input id="e_name" type="text" value="' + esc(item.name) + '">' +
      '<div class="muted">Montant (CHF)</div>' +
      '<input id="e_amount" class="bigamount" type="text" inputmode="decimal" value="' + esc(item.amount) + '">' +
      '<div class="muted">Date</div><input id="e_date" type="date" value="' + esc(item.date) + '">' +
      '<button class="btn green" data-action="save-edit">Enregistrer</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn ghost" data-action="cancel-edit">Annuler</button>' +
      '<div style="height:10px"></div>' +
      '<button class="btn red" data-action="del-inc" data-id="' + esc(item.id) + '">Supprimer cette rentree</button></div>';
  }
  return html;
}

function saveEdit() {
  var item;
  if (editing.type === "env") {
    item = findById(data.envelopes, editing.id);
    var name = val("e_name").trim();
    var amount = toNumber(val("e_amount"));
    if (!name || amount < 0) { window.alert("Nom et montant valides requis."); return false; }
    item.name = name;
    item.amount = amount;
    item.kind = val("e_kind") === "fixed" ? "fixed" : "variable";
  } else if (editing.type === "income") {
    item = findById(data.incomes, editing.id);
    var n2 = val("e_name").trim();
    var a2 = toNumber(val("e_amount"));
    if (!n2 || a2 <= 0) { window.alert("Nom et montant valides requis."); return false; }
    item.name = n2;
    item.amount = a2;
  } else if (editing.type === "exp") {
    item = findById(data.expenses, editing.id);
    var a3 = toNumber(val("e_amount"));
    if (a3 <= 0) { window.alert("Montant requis."); return false; }
    item.amount = a3;
    item.envelopeId = val("e_env") || item.envelopeId;
    item.note = val("e_note");
    item.date = val("e_date") || item.date;
  } else if (editing.type === "oneoff") {
    item = findById(data.oneoffs, editing.id);
    var a4 = toNumber(val("e_amount"));
    if (a4 <= 0) { window.alert("Montant requis."); return false; }
    item.name = val("e_name").trim() || item.name;
    item.amount = a4;
    item.date = val("e_date") || item.date;
  }
  save();
  return true;
}

/* ---------- Receipt scan (Tesseract OCR) ----------
   The photo is only read in memory. It is never saved anywhere. */
function extractAmount(text) {
  var lines = text.split("\n");
  var best = null;
  var keyword = /(total|montant|a payer|somme|chf|eur)/i;
  var numberRe = /(\d{1,6}[.,]\d{2})(?!\d)/g;

  // First choice: amount on a line containing a total keyword.
  lines.forEach(function (line) {
    if (keyword.test(line)) {
      var m;
      numberRe.lastIndex = 0;
      while ((m = numberRe.exec(line)) !== null) {
        var v = toNumber(m[1]);
        if (best === null || v > best) { best = v; }
      }
    }
  });
  if (best !== null) { return best; }

  // Fallback: the largest amount found on the whole ticket.
  var all = text.match(numberRe) || [];
  all.forEach(function (s) {
    var v = toNumber(s);
    if (best === null || v > best) { best = v; }
  });
  return best;
}

function setScanStatus(msg) {
  scanStatus = msg;
  var el = document.getElementById("scanstatus");
  if (el) { el.textContent = msg; }
}

function scanReceipt(file, fileInput) {
  if (typeof Tesseract === "undefined") {
    setScanStatus("Scan indisponible (connexion requise la premiere fois).");
    return;
  }
  setScanStatus("Lecture du ticket... (10 a 20 secondes)");
  Tesseract.recognize(file, "fra+eng").then(function (result) {
    var amount = extractAmount(result.data.text || "");
    if (amount === null) {
      setScanStatus("Montant introuvable. Saisis-le a la main.");
    } else {
      var input = document.getElementById("f_amount");
      if (input) { input.value = amount.toFixed(2); }
      setScanStatus("Montant detecte : " + amount.toFixed(2) + " CHF. Verifie avant d enregistrer.");
    }
    // Release the photo: nothing about the image is kept.
    if (fileInput) { fileInput.value = ""; }
  }).catch(function () {
    setScanStatus("Erreur de lecture. Saisis le montant a la main.");
    if (fileInput) { fileInput.value = ""; }
  });
}

/* ---------- Events ---------- */
function val(id) {
  var el = document.getElementById(id);
  return el ? el.value : "";
}

root.addEventListener("change", function (ev) {
  var t = ev.target;
  if (!t || !t.files || !t.files[0]) { return; }
  if (t.id === "f_scan") { scanReceipt(t.files[0], t); }
  else if (t.id === "f_import") { importData(t.files[0]); t.value = ""; }
});

root.addEventListener("click", function (ev) {
  var target = ev.target;
  while (target && target !== root && !target.getAttribute("data-key") &&
         !target.getAttribute("data-tab") && !target.getAttribute("data-action") &&
         !target.getAttribute("data-addtype")) {
    target = target.parentNode;
  }
  if (!target || target === root) { return; }

  var key = target.getAttribute("data-key");
  if (key) { pressKey(key); return; }

  var tab = target.getAttribute("data-tab");
  if (tab) { currentTab = tab; editing = null; scanStatus = ""; renderApp(); return; }

  var at = target.getAttribute("data-addtype");
  if (at) { addType = at; renderApp(); return; }

  var action = target.getAttribute("data-action");
  var id = target.getAttribute("data-id");

  if (action === "prev") { viewMonth = shiftMonth(viewMonth, -1); renderApp(); }
  else if (action === "next") { viewMonth = shiftMonth(viewMonth, 1); renderApp(); }
  else if (action === "export") { exportData(); renderApp(); }
  else if (action === "edit-env") { editing = { type: "env", id: id }; renderApp(); window.scrollTo(0, 0); }
  else if (action === "edit-income") { editing = { type: "income", id: id }; renderApp(); window.scrollTo(0, 0); }
  else if (action === "edit-exp") { editing = { type: "exp", id: id }; renderApp(); window.scrollTo(0, 0); }
  else if (action === "edit-oneoff") { editing = { type: "oneoff", id: id }; renderApp(); window.scrollTo(0, 0); }
  else if (action === "cancel-edit") { editing = null; renderApp(); }
  else if (action === "save-edit") {
    if (saveEdit()) { editing = null; renderApp(); }
  }
  else if (action === "save-expense") {
    var amt = toNumber(val("f_amount"));
    var envId = val("f_env");
    if (amt <= 0 || !envId) { window.alert("Montant et enveloppe requis."); return; }
    data.expenses.push({ id: uid(), envelopeId: envId, amount: amt, date: val("f_date") || todayStr(), note: val("f_note") });
    save(); currentTab = "home"; scanStatus = ""; renderApp();
  }
  else if (action === "save-income") {
    var amt2 = toNumber(val("f_amount"));
    if (amt2 <= 0) { window.alert("Montant requis."); return; }
    data.oneoffs.push({ id: uid(), name: val("f_name") || "Rentree", amount: amt2, date: val("f_date") || todayStr() });
    save(); currentTab = "home"; renderApp();
  }
  else if (action === "add-income-fixed") {
    var a3 = toNumber(val("s_inc_amt"));
    if (a3 <= 0) { window.alert("Montant requis."); return; }
    data.incomes.push({ id: uid(), name: val("s_inc_name") || "Rentree", amount: a3 });
    save(); renderApp();
  }
  else if (action === "add-env") {
    var a4 = toNumber(val("s_env_amt"));
    var nm = val("s_env_name");
    if (!nm || a4 < 0) { window.alert("Nom et montant requis."); return; }
    data.envelopes.push({ id: uid(), name: nm, amount: a4, kind: val("s_env_kind") });
    save(); renderApp();
  }
  else if (action === "del-income-fixed") {
    if (!window.confirm("Supprimer cette rentree fixe ?")) { return; }
    data.incomes = data.incomes.filter(function (x) { return x.id !== id; });
    editing = null; save(); renderApp();
  }
  else if (action === "del-env") {
    if (!window.confirm("Supprimer cette enveloppe et ses depenses ?")) { return; }
    data.envelopes = data.envelopes.filter(function (x) { return x.id !== id; });
    data.expenses = data.expenses.filter(function (x) { return x.envelopeId !== id; });
    editing = null; save(); renderApp();
  }
  else if (action === "del-exp") {
    if (!window.confirm("Supprimer cette depense ?")) { return; }
    data.expenses = data.expenses.filter(function (x) { return x.id !== id; });
    editing = null; save(); renderApp();
  }
  else if (action === "del-inc") {
    if (!window.confirm("Supprimer cette rentree ?")) { return; }
    data.oneoffs = data.oneoffs.filter(function (x) { return x.id !== id; });
    editing = null; save(); renderApp();
  }
  else if (action === "reset") {
    if (window.confirm("Tout effacer definitivement ? Pense a exporter avant.")) {
      data = { envelopes: [], expenses: [], incomes: [], oneoffs: [] };
      save(); renderApp();
    }
  }
});

/* ---------- Startup ----------
   If localStorage was wiped but the IndexedDB copy exists, restore it
   (once only, to avoid reload loops). */
var hasMainData = false;
try { hasMainData = !!window.localStorage.getItem(STORAGE_KEY); } catch (e) {}

if (!hasMainData && !sessionStorage.getItem("budget_restored")) {
  readBackup(function (saved) {
    if (saved) {
      try { sessionStorage.setItem("budget_restored", "1"); } catch (e) {}
      try { localStorage.setItem(STORAGE_KEY, saved); } catch (e) {}
      location.reload();
    } else {
      renderLock();
    }
  });
} else {
  renderLock();
}
