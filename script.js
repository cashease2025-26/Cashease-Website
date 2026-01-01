/*************** FIREBASE IMPORTS ***************/
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
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
  checkLimit();
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
    const desc = document.getElementById("desc").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const category = document.getElementById("category").value;
    const date = document.getElementById("expenseDate").value;

    if (!desc || !amount || !date) return;

    const expense = { desc, amount, category, date };
    await addExpenseFirestore(expense);
    expenseForm.reset();
});
/*************** LIMIT ***************/
limitForm.addEventListener("submit", e => {
    e.preventDefault();
    limit = parseFloat(document.getElementById("limit").value);
    alert(`Spending limit set to ₹${limit.toFixed(2)}`);
    limitForm.reset();
    generateSuggestions(); 
});

function checkLimit() {
    if (limit <= 0) return;
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    if (total > limit) {
        alert(`⚠️ Alert: You have exceeded your spending limit of ₹${limit.toFixed(2)}!`);
    }
}

/*************** TABLE & CHART LOGIC ***************/
function updateTable() {
    tableBody.innerHTML = "";
    let total = 0;

    expenses.forEach((e, i) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${e.desc}</td>
            <td>₹${e.amount.toFixed(2)}</td>
            <td>${e.category}</td>
            <td>${e.date}</td>
            <td>
                <button onclick="deleteExpense(${i})" style="background:#dc2626;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">
                🗑
                </button>
            </td>
        `;
        tableBody.appendChild(row);
        total += e.amount;
    });

    totalAmount.textContent = total.toFixed(2);
}

async function deleteExpense(index) {
    const confirmDelete = confirm("⚠️ Are you sure you want to delete this expense?");
    if (!confirmDelete) return;

    const expense = expenses[index];
    if (expense.id) await deleteExpenseFirestore(expense.id);
    expenses.splice(index, 1);
    updateTable();
    updateChart();
    checkLimit();
}

function updateChart() {
    const catMap = {};
    expenses.forEach(e => catMap[e.category] = (catMap[e.category] || 0) + e.amount);

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: Object.keys(catMap),
            datasets: [{ data: Object.values(catMap), backgroundColor: ['#63b3ed','#f6ad55','#68d391','#fc8181','#b794f4'] }]
        },
        options: { plugins: { legend: { position: "bottom" } } }
    });
}

/*************** GOAL LOGIC ***************/
goalForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("goalName").value;
    const amount = parseFloat(document.getElementById("goalAmount").value);
    const date = document.getElementById("goalDate").value;

    const goal = { name, amount, saved: 0, date };
    await addGoalFirestore(goal);
    goalForm.reset();
});

async function addSavings(index) {
    const val = parseFloat(prompt("Enter amount to add"));
    if (!val || val <= 0) return;

    const goal = goals[index];
    if (goal.saved >= goal.amount) {
        alert("✅ Goal already completed! You cannot add more savings.");
        return;
    }

    goal.saved += val;

    // Update streak
    const today = new Date().toDateString();
    if (lastSavedDate === today) {
        // already saved today
    } else if (lastSavedDate === new Date(Date.now() - 86400000).toDateString()) {
        streakCount++;
    } else {
        streakCount = 1;
    }
    lastSavedDate = today;
    streakDisplay.textContent = streakCount;

    await updateGoalFirestore(goal);
    renderGoals();
    generateSuggestions();

    if (goal.saved >= goal.amount) {
        alert(`🎉 Congratulations! You completed the goal "${goal.name}"!`);
    }
}

async function deleteGoal(index) {
    const confirmDelete = confirm("⚠️ Are you sure you want to delete this goal?\nThis action cannot be undone.");
    if (!confirmDelete) return;

    const goal = goals[index];
    if (goal.id) await deleteGoalFirestore(goal.id);

    goals.splice(index, 1);
    renderGoals();
}

/*************** RENDER GOALS ***************/
function renderGoals() {
    goalList.innerHTML = "";
    goals.forEach((g, i) => {
        const percent = ((g.saved / g.amount) * 100).toFixed(1);
        goalList.innerHTML += `
            <div class="goal-box">
                <b>${g.name}</b><br>
                Target: ₹${g.amount}<br>
                Saved: ₹${g.saved} (${percent}%)<br>
                Target Date: ${g.date}

                <div class="progress-container">
                  <div class="progress-bar" style="width:${Math.min(percent, 100)}%"></div>
                </div>

               <button onclick="addSavings(${i})" ${percent >= 100 ? "disabled" : ""}>
                 ${percent >= 100 ? "✅ Goal Completed" : "+ Add Savings"}
               </button>
               <button onclick="deleteGoal(${i})" style="margin-left:10px;background:linear-gradient(90deg,#ef4444,#dc2626);">
                 🗑 Delete
               </button>
            </div>
        `;
    });
}

/*************** SUGGESTIONS LOGIC ***************/
function generateSuggestions() {
    suggestionsList.innerHTML = "";

    if (!expenses || expenses.length === 0) {
        addSuggestion("📌 Start adding expenses to receive smart financial insights.");
        return;
    }

    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const daysSet = new Set(expenses.map(e => e.date));
    const days = daysSet.size || 1;
    const avgDaily = totalSpent / days;

    budgetAnalysis(totalSpent);
    categoryAnalysis(totalSpent);
    dailyAnalysis(avgDaily);
    goalAnalysis();
    savingsAnalysis();
    smartTips();
}

/* HELPER */
function addSuggestion(text) {
    const li = document.createElement("li");
    li.textContent = text;
    suggestionsList.appendChild(li);
}

/* 1️⃣ BUDGET ANALYSIS */
function budgetAnalysis(totalSpent) {
    if (!limit || limit <= 0) return;

    const usage = totalSpent / limit;

    if (usage >= 1) {
        addSuggestion("🚨 Budget exceeded! Immediately cut non-essential expenses.");
    } else if (usage >= 0.9) {
        addSuggestion("⚠️ You've used 90% of your budget. Avoid shopping & eating out.");
    } else if (usage >= 0.75) {
        addSuggestion("📉 Spending is high. Review discretionary expenses.");
    } else {
        addSuggestion("✅ Budget usage is healthy. Keep it up!");
    }
}

/* 2️⃣ CATEGORY ANALYSIS */
function categoryAnalysis(totalSpent) {
    const catMap = {};

    expenses.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    Object.entries(catMap).forEach(([cat, amt]) => {
        const percent = (amt / totalSpent) * 100;

        if (percent > 40) {
            addSuggestion(`📊 ${cat} makes up ${percent.toFixed(1)}% of your spending. Set a strict limit.`);
        } else if (percent > 25) {
            addSuggestion(`💡 ${cat} spending is moderate. Try small reductions.`);
        }
    });

    const highestCategory = Object.keys(catMap).reduce((a, b) =>
        catMap[a] > catMap[b] ? a : b
    );

    addSuggestion(`🔍 Highest spending category: ${highestCategory}.`);
}

/* 3️⃣ DAILY SPENDING */
function dailyAnalysis(avgDaily) {
    addSuggestion(`📆 Average daily spending: ₹${avgDaily.toFixed(2)}.`);

    if (avgDaily > 1000) {
        addSuggestion("⚠️ Daily expenses are high. Try a no-spend day weekly.");
    } else {
        addSuggestion("👍 Daily spending looks controlled.");
    }
}

/* 4️⃣ GOAL INTELLIGENCE */
function goalAnalysis() {
    if (!goals || goals.length === 0) {
        addSuggestion("🎯 Add financial goals to unlock goal-based insights.");
        return;
    }

    goals.forEach(g => {
        const progress = g.saved / g.amount;
        const remaining = g.amount - g.saved;

        if (progress < 0.3) {
            addSuggestion(`💰 Goal "${g.name}" is slow. Save ₹${Math.ceil(remaining / 30)} per day.`);
        } else if (progress >= 0.7 && progress < 1) {
            addSuggestion(`🚀 You're close to achieving "${g.name}". Stay consistent!`);
        } else if (progress >= 1) {
            addSuggestion(`🏆 Goal "${g.name}" achieved! Set a new goal.`);
        }
    });
}

/* 5️⃣ SAVINGS BEHAVIOR */
function savingsAnalysis() {
    if (streakCount >= 7) {
        addSuggestion(`🔥 ${streakCount}-day savings streak! Excellent discipline.`);
    } else if (streakCount >= 3) {
        addSuggestion("👏 Good savings habit forming. Keep going!");
    } else {
        addSuggestion("⚠️ No strong savings streak yet. Start small—consistency matters.");
    }
}

/* 6️⃣ SMART FINANCIAL TIPS */
function smartTips() {
    const tips = [
        "📘 Follow the 50-30-20 rule: Needs, Wants, Savings.",
        "💳 Avoid impulse buying—wait 24 hours before purchases.",
        "📉 Review subscriptions you rarely use.",
        "💰 Save first, spend later.",
        "📊 Analyze expenses weekly for better control.",
        "🛒 Compare prices before buying.",
        "📅 Plan monthly budgets in advance."
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    addSuggestion(randomTip);
}

/*************** PDF ***************/
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const monthVal = document.getElementById("reportMonth").value;
    let filtered = expenses;
    if (monthVal !== "all") filtered = expenses.filter(e => new Date(e.date).getMonth() == monthVal);

    let y = 15;
    doc.setFontSize(18);
    doc.text("CashEase - Financial Report", 14, y);
    y += 10;

    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toDateString()}`, 14, y);
    y += 10;

    const total = filtered.reduce((s,e)=>s+e.amount,0);
    doc.text(`Total Expense: ₹${total.toFixed(2)}`, 14, y);
    y += 8;

    const catMap = {};
    filtered.forEach(e=>catMap[e.category]=(catMap[e.category]||0)+e.amount);
    doc.setFontSize(14);
    doc.text("Category Breakdown", 14, y);
    y += 8;

    doc.setFontSize(11);
    Object.keys(catMap).forEach(c=>{
        doc.text(`${c}: ₹${catMap[c].toFixed(2)}`, 18, y);
        y += 6;
    });

    y += 8;
    doc.setFontSize(14);
    doc.text("Goals Summary", 14, y);
    y += 8;

    doc.setFontSize(11);
    goals.forEach(g=>{
        const p = ((g.saved/g.amount)*100).toFixed(1);
        doc.text(`${g.name} - ${p}% completed`, 18, y);
        y += 6;
    });

    doc.save("CashEase_Report.pdf");
}

/*************** LOGOUT ***************/
window.logout = () => {
  signOut(auth).then(() => window.location.href = "login.html");
};

window.addSavings = addSavings;
window.generatePDF = generatePDF;
window.deleteExpense = deleteExpense;
window.deleteGoal = deleteGoal;
