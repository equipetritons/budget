"use strict";

(() => {
  const STORAGE_KEY = "budget_simple_v1";

  const initialState = {
    month: new Date().toISOString().slice(0, 7),
    incomes: [],
    envelopes: [],
    expenses: []
  };

  let state = loadState();
  let message = "";

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(initialState);

      const data = JSON.parse(saved);
      return {
        ...initialState,
        ...data,
        incomes: Array.isArray(data.incomes) ? data.incomes : [],
        envelopes: Array.isArray(data.envelopes) ? data.envelopes : [],
        expenses: Array.isArray(data.expenses) ? data.expenses : []
      };
    } catch (error) {
      return { ...initialState, incomes: [], envelopes: [], expenses: [] };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      alert("Impossible d'enregistrer les données sur cet appareil.");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&",
      "<": "<",
      ">": ">",
      '"': """,
      "'": "&#039;"
    }[character]));
  }

  function money(value) {
    return new Intl.NumberFormat("fr-CH", {
      style: "currency",
      currency: "CHF"
    }).format(Number(value) || 0);
  }

  function monthName(month) {
    const [year, number] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-CH", {
      month: "long",
      year: "numeric"
    }).format(new Date(year, number - 1, 1));
  }

  function monthExpenses() {
    return state.expenses.filter((item) => item.date.slice(0, 7) === state.month);
  }

  function totalIncome() {
    return state.incomes.reduce((sum, item) => sum + item.amount, 0);
  }

  function totalSpent() {
    return monthExpenses().reduce((sum, item) => sum + item.amount, 0);
  }

  function envelopeSpent(envelopeId) {
    return monthExpenses()
      .filter((item) => item.envelopeId === envelopeId)
      .reduce((sum, item) => sum + item.amount, 0);
  }

  function showMessage(text) {
    message = text;
    render();
    window.setTimeout(() => {
      if (message === text) {
        message = "";
        render();
      }
    }, 2500);
  }

  function render() {
    const app = document.querySelector("#app");
    if (!app) {
      document.body.innerHTML =
        "<p style='font:16px sans-serif;padding:20px'>Erreur : l'élément #app manque dans index.html.</p>";
      return;
    }

    const expenses = monthExpenses();
    const remaining = totalIncome() - totalSpent();

    app.classList.remove("hidden");
    app.innerHTML = `
      <main style="max-width:700px;margin:auto;padding:20px;font:16px Arial,sans-serif;color:#172033">
        <h1 style="margin-bottom:8px">Mon budget</h1>

        <label for="month" style="display:block;margin:16px 0 6px">Mois affiché</label>
        <input id="month" type="month" value="${escapeHtml(state.month)}"
          style="font-size:16px;padding:10px">

        <section style="margin:20px 0;padding:16px;border-radius:12px;background:#eef2ff">
          <p>Revenus enregistrés : <strong>${money(totalIncome())}</strong></p>
          <p>Dépenses du mois : <strong>${money(totalSpent())}</strong></p>
          <p>Reste estimé : <strong>${money(remaining)}</strong></p>
        </section>

        <h2>Ajouter une dépense</h2>
        <form id="expense-form" style="display:grid;gap:10px">
          <label>Date <input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
          <label>Montant (CHF) <input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label>Enveloppe
            <select name="envelopeId">
              <option value="">Sans enveloppe</option>
              ${state.envelopes.map((item) =>
                `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
              ).join("")}
            </select>
          </label>
          <label>Note <input name="note" type="text" maxlength="100"></label>
          <button type="submit" style="padding:12px;font-size:16px">Enregistrer la dépense</button>
        </form>

        <h2 style="margin-top:28px">Enveloppes</h2>
        <form id="envelope-form" style="display:grid;gap:10px">
          <label>Nom <input name="name" type="text" maxlength="50" required></label>
          <label>Budget mensuel (CHF) <input name="budget" type="number" min="0" step="0.01" required></label>
          <button type="submit" style="padding:12px;font-size:16px">Ajouter l'enveloppe</button>
        </form>
        <ul>
          ${state.envelopes.map((item) => {
            const spent = envelopeSpent(item.id);
            return `<li style="margin:12px 0">
              <strong>${escapeHtml(item.name)}</strong> : ${money(spent)} dépensés sur ${money(item.budget)}
              <button type="button" data-delete-envelope="${escapeHtml(item.id)}">Supprimer</button>
            </li>`;
          }).join("") || "<li>Aucune enveloppe pour le moment.</li>"}
        </ul>

        <h2 style="margin-top:28px">Revenus</h2>
        <form id="income-form" style="display:grid;gap:10px">
          <label>Nom <input name="name" type="text" maxlength="50" required></label>
          <label>Montant (CHF) <input name="amount" type="number" min="0.01" step="0.01" required></label>
          <button type="submit" style="padding:12px;font-size:16px">Ajouter le revenu</button>
        </form>
        <ul>
          ${state.incomes.map((item) =>
            `<li style="margin:12px 0">${escapeHtml(item.name)} : ${money(item.amount)}
              <button type="button" data-delete-income="${escapeHtml(item.id)}">Supprimer</button>
            </li>`
          ).join("") || "<li>Aucun revenu enregistré.</li>"}
        </ul>

        <h2 style="margin-top:28px">Dépenses de ${escapeHtml(monthName(state.month))}</h2>
        <ul>
          ${expenses.map((item) => {
            const envelope = state.envelopes.find((entry) => entry.id === item.envelopeId);
            return `<li style="margin:12px 0">
              ${escapeHtml(item.date)} — ${money(item.amount)}
              ${envelope ? ` — ${escapeHtml(envelope.name)}` : ""}
              ${item.note ? ` — ${escapeHtml(item.note)}` : ""}
              <button type="button" data-delete-expense="${escapeHtml(item.id)}">Supprimer</button>
            </li>`;
          }).join("") || "<li>Aucune dépense ce mois-ci.</li>"}
        </ul>

        ${message ? `<p role="status" style="padding:10px;background:#dcfce7">${escapeHtml(message)}</p>` : ""}
        <p style="margin-top:24px;font-size:13px;color:#555">
          Les données sont enregistrées dans le navigateur de cet appareil. Elles ne sont pas synchronisées avec ton PC.
        </p>
      </main>
    `;

    document.querySelector("#month").addEventListener("change", (event) => {
      if (event.target.value) {
        state.month = event.target.value;
        saveState();
        render();
      }
    });

    document.querySelector("#expense-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      const date = String(form.get("date"));

      if (!Number.isFinite(amount) || amount <= 0 || !date) {
        showMessage("Vérifie le montant et la date.");
        return;
      }

      state.expenses.push({
        id: crypto.randomUUID(),
        date,
        amount,
        envelopeId: String(form.get("envelopeId") || ""),
        note: String(form.get("note") || "").trim()
      });

      saveState();
      showMessage("Dépense enregistrée.");
    });

    document.querySelector("#envelope-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      const budget = Number(form.get("budget"));

      if (!name || !Number.isFinite(budget) || budget < 0) {
        showMessage("Vérifie le nom et le budget.");
        return;
      }

      state.envelopes.push({ id: crypto.randomUUID(), name, budget });
      saveState();
      showMessage("Enveloppe ajoutée.");
    });

    document.querySelector("#income-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      const amount = Number(form.get("amount"));

      if (!name || !Number.isFinite(amount) || amount <= 0) {
        showMessage("Vérifie le nom et le montant.");
        return;
      }

      state.incomes.push({ id: crypto.randomUUID(), name, amount });
      saveState();
      showMessage("Revenu ajouté.");
    });

    document.querySelectorAll("[data-delete-envelope]").forEach((button) => {
      button.addEventListener("click", () => {
        state.envelopes = state.envelopes.filter(
          (item) => item.id !== button.dataset.deleteEnvelope
        );
        saveState();
        render();
      });
    });

    document.querySelectorAll("[data-delete-income]").forEach((button) => {
      button.addEventListener("click", () => {
        state.incomes = state.incomes.filter(
          (item) => item.id !== button.dataset.deleteIncome
        );
        saveState();
        render();
      });
    });

    document.querySelectorAll("[data-delete-expense]").forEach((button) => {
      button.addEventListener("click", () => {
        state.expenses = state.expenses.filter(
          (item) => item.id !== button.dataset.deleteExpense
        );
        saveState();
        render();
      });
    });
  }

  function start() {
    if (!document.querySelector("#app")) {
      document.body.innerHTML =
        "<p style='font:16px sans-serif;padding:20px'>Erreur : index.html ne contient pas de bloc avec id=\"app\".</p>";
      return;
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
