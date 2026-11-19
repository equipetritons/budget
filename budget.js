"use strict";

/* Budget app for iPhone Safari. PIN code: 1997 */

window.__budgetLoaded = true;

var STORAGE_KEY = "budget_v5";
var PIN_CODE = "1997";

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

/* ---------- Data model ----------
   envelopes: { id, name, amount, kind }  kind = "variable" | "fixed"
   incomes:   { id, name, amount }        recurring monthly income
   expenses:  { id, envelopeId, amount, date (YYYY-MM-DD), note }
   oneoffs:   { id, name, amount, date }  one-time income (refund, etc.)
*/
var data = readStorage() || {};
if (!data.envelopes) { data.envelopes = []; }
if (!data.expenses) { data.expenses = []; }
if (!data.incomes) { data.incomes = []; }
if (!data.oneoffs) { data.oneoffs = []; }
data.envelopes.forEach(function (e) {
  if (!e.kind) { e.kind = "variable"; }
});

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
  if (currentTab === "home") { body = viewHome(); }
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
  }
  variable.forEach(function (s) {
    html += envelopeRow(s);
  });
  html += "</div>";
  return html;
}

function envelopeRow(s) {
  var left = s.budget - s.spent;
  var over = left < 0;
  var p = s.budget > 0 ? Math.min(100, (s.spent / s.budget) * 100) : (s.spent > 0 ? 100 : 0);
  var color = over ? "var(--red)" : (p > 85 ? "var(--orange)" : "var(--green)");
  return '<div class="envelope"><div class="envhead">' +
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
    html += '<div class="row"><span class="name">' + esc(s.env.name) +
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
    if (data.envelopes.length === 0) {
      html += '<div class="empty">Cree d abord une enveloppe dans Fixes</div>';
    } else {
      html += '<select id="f_env">';
      data.envelopes.forEach(function (e) {
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
      var env = data.envelopes.filter(function (e) { return e.id === x.envelopeId; })[0];
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
  if (items.length === 0) { html += '<div class="empty">Rien ce mois-ci</div>'; }
  items.forEach(function (it) {
    html += '<div class="row"><div><div class="name">' + esc(it.title) + "</div>" +
      '<div class="muted">' + esc(it.date) + (it.note ? " - " + esc(it.note) : "") + "</div></div>" +
      "<div style=\"text-align:right\"><div class=\"amt " + (it.type === "inc" ? "pos" : "") + '">' +
      (it.type === "inc" ? "+" : "-") + money(it.amount) + "</div>" +
      '<button class="btn ghost small" data-action="del-' + it.type + '" data-id="' + esc(it.id) + '">Suppr.</button></div></div>';
  });
  html += "</div>";
  return html;
}

function viewSettings() {
  var html = "<h1>Fixes</h1>";

  html += '<div class="card"><h2>Rentrees fixes (chaque mois)</h2>';
  if (data.incomes.length === 0) { html += '<div class="empty">Aucune (ex: salaire)</div>'; }
  data.incomes.forEach(function (i) {
    html += '<div class="row"><span class="name">' + esc(i.name) + '</span><span><span class="amt pos">' +
      money(i.amount) + '</span> <button class="btn ghost small" data-action="del-income-fixed" data-id="' +
      esc(i.id) + '">X</button></span></div>';
  });
  html += '<input id="s_inc_name" type="text" placeholder="Nom (Salaire)">' +
    '<input id="s_inc_amt" type="text" inputmode="decimal" placeholder="Montant">' +
    '<button class="btn" data-action="add-income-fixed">Ajouter la rentree</button></div>';

  html += '<div class="card"><h2>Enveloppes et charges</h2>';
  if (data.envelopes.length === 0) { html += '<div class="empty">Aucune enveloppe</div>'; }
  data.envelopes.forEach(function (e) {
    html += '<div class="row"><div><div class="name">' + esc(e.name) + "</div>" +
      '<div class="muted">' + (e.kind === "fixed" ? "Charge fixe" : "Variable") + "</div></div>" +
      '<span><span class="amt">' + money(e.amount) +
      '</span> <button class="btn ghost small" data-action="del-env" data-id="' + esc(e.id) + '">X</button></span></div>';
  });
  html += '<input id="s_env_name" type="text" placeholder="Nom (Loyer, Courses...)">' +
    '<input id="s_env_amt" type="text" inputmode="decimal" placeholder="Montant par mois">' +
    '<select id="s_env_kind"><option value="variable">Variable (courses, loisirs...)</option>' +
    '<option value="fixed">Charge fixe (loyer, assurance...)</option></select>' +
    '<button class="btn" data-action="add-env">Ajouter l enveloppe</button></div>';

  html += '<div class="card"><h2>Donnees</h2>' +
    '<button class="btn red" data-action="reset">Tout effacer</button></div>';
  return html;
}

/* ---------- Receipt scan (Tesseract OCR) ---------- */
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

function scanReceipt(file) {
  if (typeof Tesseract === "undefined") {
    setScanStatus("Scan indisponible (connexion requise la premiere fois).");
    return;
  }
  setScanStatus("Lecture du ticket... (10 a 20 secondes)");
  Tesseract.recognize(file, "fra+eng").then(function (result) {
    var amount = extractAmount(result.data.text || "");
    if (amount === null) {
      setScanStatus("Montant introuvable. Saisis-le a la main.");
      return;
    }
    var input = document.getElementById("f_amount");
    if (input) { input.value = amount.toFixed(2); }
    setScanStatus("Montant detecte : " + amount.toFixed(2) + " CHF. Verifie avant d enregistrer.");
  }).catch(function () {
    setScanStatus("Erreur de lecture. Saisis le montant a la main.");
  });
}

/* ---------- Events ---------- */
function val(id) {
  var el = document.getElementById(id);
  return el ? el.value : "";
}

root.addEventListener("change", function (ev) {
  if (ev.target && ev.target.id === "f_scan" && ev.target.files && ev.target.files[0]) {
    scanReceipt(ev.target.files[0]);
  }
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
  if (tab) { currentTab = tab; scanStatus = ""; renderApp(); return; }

  var at = target.getAttribute("data-addtype");
  if (at) { addType = at; renderApp(); return; }

  var action = target.getAttribute("data-action");
  var id = target.getAttribute("data-id");

  if (action === "prev") { viewMonth = shiftMonth(viewMonth, -1); renderApp(); }
  else if (action === "next") { viewMonth = shiftMonth(viewMonth, 1); renderApp(); }
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
    data.incomes = data.incomes.filter(function (x) { return x.id !== id; });
    save(); renderApp();
  }
  else if (action === "del-env") {
    if (!window.confirm("Supprimer cette enveloppe et ses depenses ?")) { return; }
    data.envelopes = data.envelopes.filter(function (x) { return x.id !== id; });
    data.expenses = data.expenses.filter(function (x) { return x.envelopeId !== id; });
    save(); renderApp();
  }
  else if (action === "del-exp") {
    data.expenses = data.expenses.filter(function (x) { return x.id !== id; });
    save(); renderApp();
  }
  else if (action === "del-inc") {
    data.oneoffs = data.oneoffs.filter(function (x) { return x.id !== id; });
    save(); renderApp();
  }
  else if (action === "reset") {
    if (window.confirm("Tout effacer definitivement ?")) {
      data = { envelopes: [], expenses: [], incomes: [], oneoffs: [] };
      save(); renderApp();
    }
  }
});

renderLock();
