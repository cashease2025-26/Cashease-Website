/*************** FIREBASE IMPORTS ***************/
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

/*************** GLOBAL VARIABLES ***************/
let expenses = [];
let goals = [];
let chart;
let limit = 0;
let streakCount = 0;
let lastSavedDate = null;

const auth = window.auth;
const db = window.db;
let userId = null;

/*************** DOM ELEMENTS ***************/
const expenseForm = document.getElementById("expenseForm");
const tableBody = document.querySelector("#expenseTable tbody");
const totalAmount = document.getElementById("totalAmount");
const ctx = document.getElementById("expenseChart").getContext("2d");
const goalForm = document.getElementById("goalForm");
const goalList = document.getElementById("goalList");
const limitForm = document.getElementById("limitForm");
const suggestionsList = document.getElementById("suggestionsList");
const streakDisplay = document.getElementById("streakCount");

/*************** AUTH CHECK ***************/
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    userId = user.uid;
    await fetchExpenses();
    await fetchGoals();
    generateSuggestions();
  }
});

/*************** FIRESTORE ***************/
async function fetchExpenses() {
  const snap = await getDocs(collection(db, "users", userId, "expenses"));
  expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  updateTable();
  updateChart();
}

async function fetchGoals() {
  const snap = await getDocs(collection(db, "users", userId, "goals"));
  goals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGoals();
}

async function addExpenseFirestore(expense) {
  const ref = await addDoc(collection(db, "users", userId, "expenses"), expense);
  expense.id = ref.id;
  expenses.push(expense);
  updateTable();
  updateChart();
  generateSuggestions();
}

async function addGoalFirestore(goal) {
  const ref = await addDoc(collection(db, "users", userId, "goals"), goal);
  goal.id = ref.id;
  goals.push(goal);
  renderGoals();
}

async function updateGoalFirestore(goal) {
  await updateDoc(doc(db, "users", userId, "goals", goal.id), goal);
}

async function deleteExpenseFirestore(id) {
  await deleteDoc(doc(db, "users", userId, "expenses", id));
}

async function deleteGoalFirestore(id) {
  await deleteDoc(doc(db, "users", userId, "goals", id));
}

/*************** EXPENSE FORM ***************/
expenseForm.addEventListener("submit", async e => {
  e.preventDefault();
  const expense = {
    desc: desc.value,
    amount: Number(amount.value),
    category: category.value,
    date: expenseDate.value
  };
  await addExpenseFirestore(expense);
  expenseForm.reset();
  checkLimit();
});

/*************** LIMIT ***************/
limitForm.addEventListener("submit", e => {
  e.preventDefault();
  limit = Number(document.getElementById("limit").value);
  alert(`Limit set to ₹${limit}`);
  limitForm.reset();
  generateSuggestions();
});

function checkLimit() {
  if (!limit) return;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  if (total > limit) alert("⚠️ Spending limit exceeded!");
}

/*************** TABLE ***************/
function updateTable() {
  tableBody.innerHTML = "";
  let total = 0;

  expenses.forEach((e, i) => {
    total += e.amount;
    tableBody.innerHTML += `
      <tr>
        <td>${e.desc}</td>
        <td>₹${e.amount.toFixed(2)}</td>
        <td>${e.category}</td>
        <td>${e.date}</td>
        <td><button onclick="deleteExpense(${i})">🗑</button></td>
      </tr>
    `;
  });

  totalAmount.textContent = total.toFixed(2);
}

window.deleteExpense = async i => {
  await deleteExpenseFirestore(expenses[i].id);
  expenses.splice(i, 1);
  updateTable();
  updateChart();
};

/*************** CHART ***************/
function updateChart() {
  const catMap = {};
  expenses.forEach(e => catMap[e.category] = (catMap[e.category] || 0) + e.amount);
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(catMap),
      datasets: [{ data: Object.values(catMap) }]
    }
  });
}

/*************** GOALS ***************/
goalForm.addEventListener("submit", async e => {
  e.preventDefault();
  const goal = {
    name: goalName.value,
    amount: Number(goalAmount.value),
    saved: 0,
    date: goalDate.value
  };
  await addGoalFirestore(goal);
  goalForm.reset();
});

window.addSavings = async i => {
  const val = Number(prompt("Enter savings"));
  if (!val) return;
  goals[i].saved += val;
  streakCount++;
  streakDisplay.textContent = streakCount;
  await updateGoalFirestore(goals[i]);
  renderGoals();
};

window.deleteGoal = async i => {
  await deleteGoalFirestore(goals[i].id);
  goals.splice(i, 1);
  renderGoals();
};

function renderGoals() {
  goalList.innerHTML = "";
  goals.forEach((g, i) => {
    const p = ((g.saved / g.amount) * 100).toFixed(1);
    goalList.innerHTML += `
      <div class="goal-box">
        <b>${g.name}</b><br>
        Saved ₹${g.saved} / ₹${g.amount}
        <div class="progress-container">
          <div class="progress-bar" style="width:${p}%"></div>
        </div>
        <button onclick="addSavings(${i})">+ Save</button>
        <button onclick="deleteGoal(${i})">🗑</button>
      </div>
    `;
  });
}

/*************** SUGGESTIONS ***************/
function generateSuggestions() {
  suggestionsList.innerHTML = "";

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  /* 1️⃣ Spending limit warning */
  if (limit > 0 && totalSpent / limit >= 0.8) {
    const li = document.createElement("li");
    li.textContent =
      "⚠️ You are close to your spending limit. Consider reducing unnecessary expenses.";
    suggestionsList.appendChild(li);
  }

  /* 2️⃣ Category-wise spending advice */
  if (expenses.length > 0) {
    const catMap = {};
    expenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    const maxCategory = Object.keys(catMap).reduce((a, b) =>
      catMap[a] > catMap[b] ? a : b
    );

    const li = document.createElement("li");
    li.textContent = `💡 You spend the most on ${maxCategory}. Try to reduce expenses here if possible.`;
    suggestionsList.appendChild(li);
  }

  /* 3️⃣ Goal progress advice */
  goals.forEach(g => {
    const progress = g.saved / g.amount;
    if (progress < 0.3) {
      const li = document.createElement("li");
      li.textContent = `💰 Your goal "${g.name}" is progressing slowly. Consider saving more regularly.`;
      suggestionsList.appendChild(li);
    }
  });

  /* 4️⃣ Savings streak encouragement */
  if (streakCount >= 3) {
    const li = document.createElement("li");
    li.textContent = `🔥 Amazing! You have a savings streak of ${streakCount} days. Keep it up!`;
    suggestionsList.appendChild(li);
  }

  /* Fallback */
  if (!suggestionsList.children.length) {
    const li = document.createElement("li");
    li.textContent = "✅ You're doing great! Keep tracking your expenses regularly.";
    suggestionsList.appendChild(li);
  }
}

/*************** PDF ***************/
window.generatePDF = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("CashEase Report", 10, 10);
  expenses.forEach((e, i) =>
    doc.text(`${i + 1}. ${e.desc} - ₹${e.amount}`, 10, 20 + i * 6)
  );
  doc.save("CashEase_Report.pdf");
};

/*************** LOGOUT ***************/
window.logout = () => {
  signOut(auth).then(() => window.location.href = "login.html");
};
