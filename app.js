"use strict";

/* =====================================================================
   Budget PWA - all data lives in localStorage on the device.
   ===================================================================== */

const KEY = "budget_pwa_v1";

/* ---------- Helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) =>
  new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n) || 0).replace(/[\u202f\u00a0]/g, " ") + " CHF";
const monthKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
// Escape HTML special characters to avoid injecting markup
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&", "<": "<", ">": ">", '"': """, "'": "'"
}[c]));
const parseAmount = (v) => {
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("budget-salt:" + text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- State ---------- */
let state = null;
let viewMonth = new Date(); viewMonth.setDate(1);
let currentTab = "home";

function defaultState(pinHash) {
  return {
    pin: pinHash,
    incomes: [{ id: uid(), name: "Salaire", amount: 5000, type: "fixed", month: null }],
    fixed: [
      { id: uid(), name: "Loyer", amount: 1500 },
      { id: uid(), name: "Assurance maladie", amount: 400 },
    ],
    envelopes: [
      { id: uid(), name: "Courses", budget: 600, keywords: ["migros", "coop", "denner", "aldi", "lidl", "volg"] },
      { id: uid(), name: "Transport", budget: 120, keywords: ["cff", "sbb", "tpg", "essence", "shell", "avia", "parking"] },
      { id: uid(), name: "Coiffeur", budget: 60, keywords: ["coiffeur", "coiffure", "barber"] },
      { id: uid(), name: "Loisirs", budget: 200, keywords: ["cinema", "restaurant", "netflix", "spotify"] },
    ],
    savings: { goal: 500 },
    expenses: [],
    learned: {},
  };
}

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { state = JSON.parse(raw); return true; }
  } catch (e) { /* corrupted data: fall through to defaults */ }
  return false;
}

/* ---------- Calculations ---------- */
function monthExpenses(mk) { return state.expenses.filter((e) => e.date.startsWith(mk)); }

function compute(mk) {
  const exps = monthExpenses(mk);
  const incomeTotal = state.incomes
    .filter((i) => i.type === "fixed" || (i.type === "oneoff" && i.month === mk))
    .reduce((s, i) => s + i.amount, 0);
  const fixedTotal = state.fixed.reduce((s, f) => s + f.amount, 0);

  const envs = state.envelopes.map((env) => {
    const spent = exps.filter((e) => e.kind === "env" && e.envId === env.id).reduce((s, e) => s + e.amount, 0);
    return { ...env, spent, left: env.budget - spent };
  });
  const budgetTotal = envs.reduce((s, e) => s + e.budget, 0);
  const spentTotal = envs.reduce((s, e) => s + e.spent, 0);
  const savedActual = exps.filter((e) => e.kind === "saving").reduce((s, e) => s + e.amount, 0);
  const goal = state.savings.goal;

  const planned = incomeTotal - fixedTotal - goal;
  const remaining = budgetTotal - spentTotal;
  const unallocated = planned - budgetTotal;

  const over = envs.filter((e) => e.left < 0);
  const under = envs.filter((e) => e.left > 0).sort((a, b) => b.left - a.left);
  const totalOver = over.reduce((s, e) => s - e.left, 0);
  const totalUnder = under.reduce((s, e) => s + e.left, 0);

  return { incomeTotal, fixedTotal, envs, budgetTotal, spentTotal, savedActual, goal,
           planned, remaining, unallocated, over, under, totalOver, totalUnder };
}

function savingsCumulative() {
  return state.expenses.filter((e) => e.kind === "saving").reduce((s, e) => s + e.amount, 0);
}

/* ---------- UI helpers ---------- */
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}
function openModal(html) {
  const m = $("#modal");
  m.innerHTML = '<div class="sheet">' + html + "</div>";
  m.classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); $("#modal").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

/* ---------- PIN lock ---------- */
let pinBuf = "";
function buildKeypad() {
  const kp = $("#keypad"); kp.innerHTML = "";
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  keys.forEach((k) => {
    const b = document.createElement("button");
    b.textContent = k;
    if (!k) { b.style.visibility = "hidden"; }
    b.addEventListener("click", () => pressKey(k));
    kp.appendChild(b);
  });
}
function renderDots() {
  [...$("#dots").children].forEach((d, i) => d.classList.toggle("on", i < pinBuf.length));
}
async function pressKey(k) {
  if (!k) return;
  if (k === "⌫") pinBuf = pinBuf.slice(0, -1);
  else if (pinBuf.length < 4) pinBuf += k;
  renderDots();
  if (pinBuf.length === 4) {
    const h = await sha256(pinBuf);
    if (h === state.pin) { unlock(); }
    else {
      $("#dots").classList.add("shake");
      $("#lockMsg").textContent = "Code incorrect";
      setTimeout(() => { $("#dots").classList.remove("shake"); pinBuf = ""; renderDots(); }, 400);
    }
  }
}
function unlock() {
  pinBuf = ""; renderDots();
  $("#lock").classList.add("hidden");
  $("#app").classList.remove("hidden");
  render();
}
function showLock() {
  $("#app").classList.add("hidden");
  $("#lock").classList.remove("hidden");
  $("#lockMsg").textContent = "Entre ton code";
  pinBuf = ""; renderDots();
}

/* ---------- Rendering ---------- */
function render() {
  const mk = monthKey(viewMonth);
  $("#monthLabel").textContent = viewMonth.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
  const v = $("#view");
  if (currentTab === "home") v.innerHTML = renderHome(mk);
  else if (currentTab === "history") v.innerHTML = renderHistory(mk);
  else if (currentTab === "setup") v.innerHTML = renderSetup(mk);
  else v.innerHTML = renderSettings();
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
  $("#fab").classList.toggle("hidden", currentTab === "settings");
}

function renderHome(mk) {
  const c = compute(mk);
  const cumul = savingsCumulative();
  const monthName = viewMonth.toLocaleDateString("fr-CH", { month: "long" });

  // Alert card: over-budget envelopes and where to take money from
  let alert = "";
  if (c.over.length) {
    const overList = c.over.map((e) => `<b>${esc(e.name)}</b> (−${fmt(-e.left)})`).join(", ");
    const underList = c.under.length
      ? c.under.map((e) => `${esc(e.name)} : <b>${fmt(e.left)}</b>`).join("<br>")
      : "Aucune enveloppe n'a de marge.";
    const covered = c.totalUnder >= c.totalOver;
    alert = `
      <div class="card alert">
        <h2>⚠️ Dépassement</h2>
        <div>${overList}</div>
        <div class="give">
          ${covered
            ? `Tu peux compenser en grattant sur :<br>${underList}`
            : `Marge disponible insuffisante (${fmt(c.totalUnder)} pour ${fmt(c.totalOver)} de dépassement).<br>${underList}`}
        </div>
      </div>`;
  }

  const envRows = c.envs.length ? c.envs.map((e) => {
    const pct = e.budget > 0 ? Math.min(100, (e.spent / e.budget) * 100) : (e.spent > 0 ? 100 : 0);
    const cls = e.left < 0 ? "bad" : pct >= 80 ? "warn" : "";
    return `
      <div class="env ${e.left < 0 ? "over" : ""}">
        <div class="env-head">
          <div class="env-name">${esc(e.name)}${e.left < 0 ? '<span class="badge">dépassé</span>' : ""}</div>
          <div class="env-amt">${fmt(e.spent)} / ${fmt(e.budget)}</div>
        </div>
        <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div>
        <div class="env-foot">
          <span>${e.left >= 0 ? "Reste" : "Dépassement"}</span>
          <b class="${e.left < 0 ? "neg" : "pos"}">${fmt(Math.abs(e.left))}</b>
        </div>
      </div>`;
  }).join("") : '<p class="mut">Aucune enveloppe. Va dans l\'onglet Budget.</p>';

  const fixedRows = state.fixed.map((f) =>
    `<div class="row"><div class="l"><b>${esc(f.name)}</b></div><div class="r">${fmt(f.amount)}</div></div>`).join("")
    || '<p class="mut">Aucune charge fixe.</p>';

  return `
    ${alert}
    <div class="card hero">
      <div class="sub">Reste à dépenser en ${esc(monthName)}</div>
      <div class="big ${c.remaining >= 0 ? "pos" : "neg"}">${fmt(c.remaining)}</div>
      <div class="sub">${c.remaining >= 0 ? "Tu es dans le budget ✅" : "Budget global dépassé ❌"}</div>
    </div>

    <div class="grid2" style="margin-bottom:14px">
      <div class="stat"><small>Revenus</small><b>${fmt(c.incomeTotal)}</b></div>
      <div class="stat"><small>Charges fixes</small><b>${fmt(c.fixedTotal)}</b></div>
      <div class="stat"><small>Enveloppes (budget)</small><b>${fmt(c.budgetTotal)}</b></div>
      <div class="stat"><small>Dépensé</small><b>${fmt(c.spentTotal)}</b></div>
    </div>

    ${c.unallocated < 0 ? `<div class="card alert"><h3>Attention</h3>Tes enveloppes + charges + épargne dépassent tes revenus de <b>${fmt(-c.unallocated)}</b>.</div>` : ""}

    <div class="card">
      <h2>Enveloppes (budget réel)</h2>
      ${envRows}
    </div>

    <div class="card">
      <h2>💰 Épargne</h2>
      <div class="grid2">
        <div class="stat"><small>Objectif du mois</small><b>${fmt(c.goal)}</b></div>
        <div class="stat"><small>Épargné ce mois</small><b class="${c.savedActual >= c.goal ? "pos" : ""}">${fmt(c.savedActual)}</b></div>
      </div>
      <div class="stat" style="margin-top:10px"><small>Total épargné (cumul)</small><b>${fmt(cumul)}</b></div>
      <p class="mut" style="font-size:12px;margin:10px 0 0">Pour enregistrer une épargne : bouton ＋ puis « Épargne ».</p>
    </div>

    <div class="card">
      <h3>Charges fixes (prélevées chaque mois)</h3>
      ${fixedRows}
    </div>`;
}

function renderHistory(mk) {
  const exps = monthExpenses(mk).sort((a, b) => b.date.localeCompare(a.date));
  if (!exps.length) return '<div class="card"><p class="mut">Aucune opération ce mois-ci.</p></div>';
  const rows = exps.map((e) => {
    const name = e.kind === "saving" ? "💰 Épargne" : (state.envelopes.find((x) => x.id === e.envId)?.name || "Enveloppe supprimée");
    return `
      <div class="row">
        <div class="l"><b>${esc(name)}</b><small>${e.date}${e.note ? " · " + esc(e.note) : ""}</small></div>
        <div class="r">${fmt(e.amount)}</div>
        <div><button class="mini" data-act="edit-exp" data-id="${e.id}">✏️</button><button class="mini" data-act="del-exp" data-id="${e.id}">🗑️</button></div>
      </div>`;
  }).join("");
  return `<div class="card"><h2>Opérations du mois</h2>${rows}</div>`;
}

function renderSetup(mk) {
  const inc = state.incomes.map((i) => `
    <div class="row">
      <div class="l"><b>${esc(i.name)}</b><small>${i.type === "fixed" ? "Fixe (chaque mois)" : "Ponctuel · " + i.month}</small></div>
      <div class="r pos">${fmt(i.amount)}</div>
      <div><button class="mini" data-act="edit-inc" data-id="${i.id}">✏️</button><button class="mini" data-act="del-inc" data-id="${i.id}">🗑️</button></div>
    </div>`).join("") || '<p class="mut">Aucun revenu.</p>';

  const fx = state.fixed.map((f) => `
    <div class="row">
      <div class="l"><b>${esc(f.name)}</b><small>Charge fixe</small></div>
      <div class="r">${fmt(f.amount)}</div>
      <div><button class="mini" data-act="edit-fix" data-id="${f.id}">✏️</button><button class="mini" data-act="del-fix" data-id="${f.id}">🗑️</button></div>
    </div>`).join("") || '<p class="mut">Aucune charge fixe.</p>';

  const ev = state.envelopes.map((e) => `
    <div class="row">
      <div class="l"><b>${esc(e.name)}</b><small>${e.keywords.length ? "Mots-clés : " + esc(e.keywords.join(", ")) : "Aucun mot-clé"}</small></div>
      <div class="r">${fmt(e.budget)}</div>
      <div><button class="mini" data-act="edit-env" data-id="${e.id}">✏️</button><button class="mini" data-act="del-env" data-id="${e.id}">🗑️</button></div>
    </div>`).join("") || '<p class="mut">Aucune enveloppe.</p>';

  return `
    <div class="section-title">Revenus</div>
    <div class="card">${inc}<button class="btn sec full" data-act="add-inc">＋ Ajouter un revenu</button></div>
    <div class="section-title">Charges fixes</div>
    <div class="card">${fx}<button class="btn sec full" data-act="add-fix">＋ Ajouter une charge fixe</button></div>
    <div class="section-title">Enveloppes variables (budget réel)</div>
    <div class="card">${ev}<button class="btn sec full" data-act="add-env">＋ Ajouter une enveloppe</button></div>
    <div class="section-title">Épargne</div>
    <div class="card">
      <div class="row"><div class="l"><b>Objectif mensuel</b></div><div class="r">${fmt(state.savings.goal)}</div>
      <div><button class="mini" data-act="edit-goal">✏️</button></div></div>
    </div>`;
}

function renderSettings() {
  return `
    <div class="card">
      <h2>Sauvegarde</h2>
      <p class="mut" style="font-size:13px">Tes données sont uniquement sur cet iPhone. Fais un export régulièrement.</p>
      <button class="btn full" data-act="export">📤 Exporter mes données</button>
      <button class="btn sec full" data-act="import">📥 Importer une sauvegarde</button>
      <input type="file" id="importFile" accept="application/json">
    </div>
    <div class="card">
      <h2>Sécurité</h2>
      <button class="btn sec full" data-act="change-pin">🔑 Changer le code PIN</button>
      <button class="btn sec full" data-act="lock">🔒 Verrouiller maintenant</button>
    </div>
    <div class="card">
      <h2>Zone dangereuse</h2>
      <button class="btn danger full" data-act="reset">🗑️ Tout effacer</button>
    </div>`;
}

/* ---------- Forms ---------- */
function envOptions(selected) {
  return state.envelopes.map((e) => `<option value="${e.id}" ${e.id === selected ? "selected" : ""}>${esc(e.name)}</option>`).join("");
}

function openExpenseForm(existing, prefill) {
  const e = existing || { id: null, date: todayStr(), amount: "", envId: state.envelopes[0]?.id || "", note: "", kind: "env", ...(prefill || {}) };
  openModal(`
    <h2>${existing ? "Modifier" : "Nouvelle opération"}</h2>
    ${!existing ? `
      <button class="btn sec full" id="scanBtn">📷 Scanner / importer une capture</button>
      <input type="file" id="scanFile" accept="image/*">
      <div class="scan-status" id="scanStatus"></div>` : ""}
    <label>Type</label>
    <select id="fKind">
      <option value="env" ${e.kind === "env" ? "selected" : ""}>Dépense (enveloppe)</option>
      <option value="saving" ${e.kind === "saving" ? "selected" : ""}>Épargne</option>
    </select>
    <label>Montant (CHF)</label>
    <input id="fAmount" type="text" inputmode="decimal" placeholder="0.00" value="${e.amount}">
    <div id="envWrap"><label>Enveloppe</label><select id="fEnv">${envOptions(e.envId)}</select></div>
    <label>Date</label>
    <input id="fDate" type="date" value="${e.date}">
    <label>Note (optionnel)</label>
    <input id="fNote" type="text" value="${esc(e.note || "")}">
    <div class="btns">
      <button class="btn sec" id="fCancel">Annuler</button>
      <button class="btn" id="fSave">Enregistrer</button>
    </div>`);

  const toggle = () => { $("#envWrap").style.display = $("#fKind").value === "env" ? "block" : "none"; };
  $("#fKind").addEventListener("change", toggle); toggle();
  $("#fCancel").onclick = closeModal;
  if (!existing) {
    $("#scanBtn").onclick = () => $("#scanFile").click();
    $("#scanFile").onchange = (ev) => scanImage(ev.target.files[0]);
    setTimeout(() => $("#fAmount").focus(), 100);
  }
  $("#fSave").onclick = () => {
    const amount = parseAmount($("#fAmount").value);
    const kind = $("#fKind").value;
    if (amount <= 0) return toast("Montant invalide");
    if (kind === "env" && !$("#fEnv").value) return toast("Crée d'abord une enveloppe");
    const rec = {
      id: e.id || uid(), date: $("#fDate").value || todayStr(), amount, kind,
      envId: kind === "env" ? $("#fEnv").value : null, note: $("#fNote").value.trim(),
    };
    if (kind === "env" && rec.note) learnFromNote(rec.note, rec.envId);
    if (existing) state.expenses = state.expenses.map((x) => (x.id === rec.id ? rec : x));
    else state.expenses.push(rec);
    save(); closeModal(); render(); toast("Enregistré ✅");
  };
}

function learnFromNote(note, envId) {
  // Remember the first meaningful word of the note for future auto-categorisation
  const word = note.toLowerCase().split(/[^a-zà-ÿ0-9]+/).find((w) => w.length >= 4);
  if (word) state.learned[word] = envId;
}

function simpleForm(title, fields, onSave) {
  const html = fields.map((f) => `
    <label>${f.label}</label>
    ${f.type === "select"
      ? `<select id="${f.id}">${f.options}</select>`
      : `<input id="${f.id}" type="${f.type || "text"}" ${(f.type || "text") === "text" && f.numeric ? 'inputmode="decimal"' : ""} value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder || "")}">`}
  `).join("");
  openModal(`<h2>${title}</h2>${html}
    <div class="btns"><button class="btn sec" id="sCancel">Annuler</button><button class="btn" id="sSave">Enregistrer</button></div>`);
  $("#sCancel").onclick = closeModal;
  $("#sSave").onclick = () => { if (onSave() !== false) { save(); closeModal(); render(); } };
}

function incomeForm(inc) {
  const i = inc || { id: null, name: "", amount: "", type: "fixed", month: monthKey(viewMonth) };
  simpleForm(inc ? "Modifier le revenu" : "Nouveau revenu", [
    { id: "iName", label: "Nom", value: i.name, placeholder: "Salaire, remboursement…" },
    { id: "iAmt", label: "Montant (CHF)", value: i.amount, numeric: true },
    { id: "iType", label: "Type", type: "select", options:
      `<option value="fixed" ${i.type === "fixed" ? "selected" : ""}>Fixe (chaque mois)</option>
       <option value="oneoff" ${i.type === "oneoff" ? "selected" : ""}>Ponctuel (un mois)</option>` },
    { id: "iMonth", label: "Mois (si ponctuel)", type: "month", value: i.month || monthKey(viewMonth) },
  ], () => {
    const name = $("#iName").value.trim(), amount = parseAmount($("#iAmt").value), type = $("#iType").value;
    if (!name || amount <= 0) { toast("Nom et montant requis"); return false; }
    const rec = { id: i.id || uid(), name, amount, type, month: type === "oneoff" ? $("#iMonth").value : null };
    if (inc) state.incomes = state.incomes.map((x) => (x.id === rec.id ? rec : x)); else state.incomes.push(rec);
  });
}

function fixedForm(fx) {
  const f = fx || { id: null, name: "", amount: "" };
  simpleForm(fx ? "Modifier la charge" : "Nouvelle charge fixe", [
    { id: "fName", label: "Nom", value: f.name, placeholder: "Loyer, assurance…" },
    { id: "fAmt", label: "Montant mensuel (CHF)", value: f.amount, numeric: true },
  ], () => {
    const name = $("#fName").value.trim(), amount = parseAmount($("#fAmt").value);
    if (!name || amount <= 0) { toast("Nom et montant requis"); return false; }
    const rec = { id: f.id || uid(), name, amount };
    if (fx) state.fixed = state.fixed.map((x) => (x.id === rec.id ? rec : x)); else state.fixed.push(rec);
  });
}

function envelopeForm(env) {
  const e = env || { id: null, name: "", budget: "", keywords: [] };
  simpleForm(env ? "Modifier l'enveloppe" : "Nouvelle enveloppe", [
    { id: "eName", label: "Nom", value: e.name, placeholder: "Courses, coiffeur…" },
    { id: "eBud", label: "Budget mensuel (CHF)", value: e.budget, numeric: true },
    { id: "eKw", label: "Mots-clés pour le scan (séparés par des virgules)", value: e.keywords.join(", "), placeholder: "migros, coop, denner" },
  ], () => {
    const name = $("#eName").value.trim(), budget = parseAmount($("#eBud").value);
    if (!name || budget < 0) { toast("Nom et budget requis"); return false; }
    const keywords = $("#eKw").value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const rec = { id: e.id || uid(), name, budget, keywords };
    if (env) state.envelopes = state.envelopes.map((x) => (x.id === rec.id ? rec : x)); else state.envelopes.push(rec);
  });
}

function goalForm() {
  simpleForm("Objectif d'épargne mensuel", [
    { id: "gAmt", label: "Montant (CHF)", value: state.savings.goal, numeric: true },
  ], () => {
    const v = parseAmount($("#gAmt").value);
    if (v < 0) return false;
    state.savings.goal = v;
  });
}

/* ---------- OCR scan (Tesseract.js, loaded on demand) ---------- */
let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = res;
    s.onerror = () => { tesseractLoading = null; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return tesseractLoading;
}

async function scanImage(file) {
  if (!file) return;
  const status = $("#scanStatus");
  status.textContent = "Chargement du lecteur (1re fois : quelques secondes)…";
  try {
    await loadTesseract();
    status.textContent = "Lecture de l'image…";
    const result = await Tesseract.recognize(file, "fra+eng", {
      logger: (m) => { if (m.status === "recognizing text") status.textContent = "Lecture… " + Math.round(m.progress * 100) + "%"; },
    });
    const text = result.data.text || "";
    const amount = extractTotal(text);
    const envId = guessEnvelope(text);
    if (amount) $("#fAmount").value = amount.toFixed(2);
    if (envId) $("#fEnv").value = envId;
    const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3) || "";
    if (firstLine && !$("#fNote").value) $("#fNote").value = firstLine.slice(0, 40);
    status.textContent = amount
      ? `Détecté : ${fmt(amount)}${envId ? " → " + state.envelopes.find((x) => x.id === envId).name : " (catégorie à choisir)"}. Vérifie avant d'enregistrer.`
      : "Montant non détecté. Saisis-le à la main.";
  } catch (err) {
    status.textContent = "Scan impossible (connexion requise la 1re fois). Saisis à la main.";
  }
}

function extractTotal(text) {
  // 1) Prefer amounts on lines that mention a total
  const lines = text.split("\n");
  const re = /(\d{1,6}[.,]\d{2})(?!\d)/g;
  let best = 0;
  for (const line of lines) {
    if (/total|montant|à payer|a payer|somme|summe|amount|paid|payé/i.test(line)) {
      for (const m of line.matchAll(re)) best = Math.max(best, parseAmount(m[1]));
    }
  }
  if (best > 0) return best;
  // 2) Fallback: largest decimal amount in the whole text
  for (const m of text.matchAll(re)) best = Math.max(best, parseAmount(m[1]));
  return best || 0;
}

function guessEnvelope(text) {
  const t = text.toLowerCase();
  // Learned words first (they come from past corrections)
  for (const [word, envId] of Object.entries(state.learned)) {
    if (t.includes(word) && state.envelopes.some((e) => e.id === envId)) return envId;
  }
  // Then the keywords defined on each envelope
  for (const env of state.envelopes) {
    if (env.keywords.some((k) => k && t.includes(k))) return env.id;
  }
  return null;
}

/* ---------- Export / import ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "budget-sauvegarde-" + todayStr() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.expenses) || !Array.isArray(d.envelopes) || !d.pin) throw new Error("bad");
      if (!confirm("Remplacer toutes les données actuelles par cette sauvegarde ?")) return;
      state = d; save(); render(); toast("Sauvegarde importée ✅");
    } catch (e) { toast("Fichier invalide"); }
  };
  r.readAsText(file);
}

/* ---------- PIN change ---------- */
function changePinForm() {
  simpleForm("Changer le code PIN", [
    { id: "pOld", label: "Code actuel", type: "password" },
    { id: "pNew", label: "Nouveau code (4 chiffres)", type: "password" },
  ], () => {
    // The check is asynchronous: return false to keep the modal open until verified
    verifyAndChangePin();
    return false;
  });
  ["pOld", "pNew"].forEach((id) => {
    $("#" + id).setAttribute("inputmode", "numeric");
    $("#" + id).setAttribute("maxlength", "4");
  });
}

async function verifyAndChangePin() {
  const oldPin = $("#pOld").value, newPin = $("#pNew").value;
  if ((await sha256(oldPin)) !== state.pin) return toast("Code actuel incorrect");
  if (!/^\d{4}$/.test(newPin)) return toast("Le nouveau code doit faire 4 chiffres");
  state.pin = await sha256(newPin);
  save(); closeModal(); toast("Code modifié ✅");
}

/* ---------- Event delegation (buttons rendered dynamically) ---------- */
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act]");
  if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case "add-inc": incomeForm(); break;
    case "edit-inc": incomeForm(state.incomes.find((x) => x.id === id)); break;
    case "del-inc":
      if (confirm("Supprimer ce revenu ?")) { state.incomes = state.incomes.filter((x) => x.id !== id); save(); render(); }
      break;
    case "add-fix": fixedForm(); break;
    case "edit-fix": fixedForm(state.fixed.find((x) => x.id === id)); break;
    case "del-fix":
      if (confirm("Supprimer cette charge fixe ?")) { state.fixed = state.fixed.filter((x) => x.id !== id); save(); render(); }
      break;
    case "add-env": envelopeForm(); break;
    case "edit-env": envelopeForm(state.envelopes.find((x) => x.id === id)); break;
    case "del-env":
      if (confirm("Supprimer cette enveloppe ? Ses dépenses resteront dans l'historique.")) {
        state.envelopes = state.envelopes.filter((x) => x.id !== id); save(); render();
      }
      break;
    case "edit-goal": goalForm(); break;
    case "edit-exp": openExpenseForm(state.expenses.find((x) => x.id === id)); break;
    case "del-exp":
      if (confirm("Supprimer cette opération ?")) { state.expenses = state.expenses.filter((x) => x.id !== id); save(); render(); }
      break;
    case "export": exportData(); break;
    case "import": $("#importFile").click(); break;
    case "change-pin": changePinForm(); break;
    case "lock": showLock(); break;
    case "reset":
      if (confirm("Tout effacer définitivement ? Pense à exporter avant.")) {
        localStorage.removeItem(KEY); location.reload();
      }
      break;
  }
});

// The import file input is re-created on each render, so listen on the document
document.addEventListener("change", (ev) => {
  if (ev.target.id === "importFile" && ev.target.files[0]) importData(ev.target.files[0]);
});

/* ---------- Navigation ---------- */
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => { currentTab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
$("#fab").addEventListener("click", () => openExpenseForm());
$("#prevMonth").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() - 1); render(); });
$("#nextMonth").addEventListener("click", () => { viewMonth.setMonth(viewMonth.getMonth() + 1); render(); });

/* ---------- Startup ---------- */
(async function init() {
  buildKeypad();
  if (!load()) {
    // First launch: create default data with the initial PIN
    state = defaultState(await sha256("1997"));
    save();
  }
  showLock();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline mode simply unavailable */ });
  }
})();
