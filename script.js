
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


let expenses = [];
let goals = [];
let chart;
let limit = 0;
let streakCount = 0;
let lastSavedDate = null;

const auth = window.auth;
const db = window.db;
let userId = null;

// ===== FIREBASE MONTHLY LIMIT =====
async function fetchMonthlyLimit() {
    const snap = await getDocs(collection(db, "users", userId, "settings"));
    snap.forEach(d => {
        if (d.id === "budget") {
            limit = d.data().limit || 0;
        }
    });
}

async function saveMonthlyLimit(value) {
    const ref = doc(db, "users", userId, "settings", "budget");
    try {
        await updateDoc(ref, { limit: value });
    } catch {
        await addDoc(collection(db, "users", userId, "settings"), {
            limit: value
        });
    }
}

const expenseForm = document.getElementById("expenseForm");
const tableBody = document.querySelector("#expenseTable tbody");
const totalAmount = document.getElementById("totalAmount");
const ctx = document.getElementById("expenseChart").getContext("2d");
const goalForm = document.getElementById("goalForm");
const goalList = document.getElementById("goalList");
const limitForm = document.getElementById("limitForm");
const suggestionsList = document.getElementById("suggestionsList");
const streakDisplay = document.getElementById("streakCount");


onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    userId = user.uid;
    await fetchExpenses();
    await fetchGoals();
    await fetchMonthlyLimit();
    generateSuggestions();
  }
});


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

limitForm.addEventListener("submit", async e => {
    e.preventDefault();

    limit = parseFloat(document.getElementById("limit").value);
    if (!limit || limit <= 0) return;

    await saveMonthlyLimit(limit);

    alert(`Monthly spending limit saved: ₹${limit.toFixed(2)}`);
    limitForm.reset();
    generateSuggestions();
});


function checkLimit() {
    if (!limit || limit <= 0) return;

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    const monthlyTotal = expenses
        .filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === m && d.getFullYear() === y;
        })
        .reduce((sum, e) => sum + e.amount, 0);

    if (monthlyTotal > limit) {
        alert(`⚠️ You exceeded your MONTHLY limit of ₹${limit.toFixed(2)}!`);
    }
}


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


function addSuggestion(text) {
    const li = document.createElement("li");
    li.textContent = text;
    suggestionsList.appendChild(li);
}


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

function dailyAnalysis(avgDaily) {
    addSuggestion(`📆 Average daily spending: ₹${avgDaily.toFixed(2)}.`);

    if (avgDaily > 1000) {
        addSuggestion("⚠️ Daily expenses are high. Try a no-spend day weekly.");
    } else {
        addSuggestion("👍 Daily spending looks controlled.");
    }
}

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

function savingsAnalysis() {
    if (streakCount >= 7) {
        addSuggestion(`🔥 ${streakCount}-day savings streak! Excellent discipline.`);
    } else if (streakCount >= 3) {
        addSuggestion("👏 Good savings habit forming. Keep going!");
    } else {
        addSuggestion("⚠️ No strong savings streak yet. Start small—consistency matters.");
    }
}

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

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const monthVal = document.getElementById("reportMonth").value;
    let filtered = expenses;

    if (monthVal !== "all") {
        filtered = expenses.filter(
            e => new Date(e.date).getMonth() == monthVal
        );
    }

    doc.setFontSize(20);
    doc.text("CashEase – Financial Report", 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toDateString()}`, 14, 28);

    doc.setDrawColor(0);
    doc.line(14, 32, 196, 32);

    const totalExpense = filtered.reduce((s, e) => s + e.amount, 0);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Expense Summary", 14, 42);

    doc.autoTable({
        startY: 46,
        head: [["Metric", "Value"]],
        body: [
            ["Total Expenses", `₹ ${totalExpense.toFixed(2)}`],
            ["Number of Transactions", filtered.length],
            ["Report Type", monthVal === "all" ? "All Months" : "Selected Month"]
        ],
        theme: "grid",
        styles: { fontSize: 11 }
    });

  
    const catMap = {};
    filtered.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    const categoryRows = Object.entries(catMap).map(([cat, amt]) => [
        cat,
        `₹ ${amt.toFixed(2)}`,
        `${((amt / totalExpense) * 100).toFixed(1)} %`
    ]);

    doc.setFontSize(14);
    doc.text("Category Breakdown", 14, doc.lastAutoTable.finalY + 10);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 14,
        head: [["Category", "Amount", "Percentage"]],
        body: categoryRows,
        theme: "striped",
        styles: { fontSize: 11 },
        headStyles: { fillColor: [30, 41, 59] }
    });

    const expenseRows = filtered.map(e => [
        new Date(e.date).toDateString(),
        e.category,
        `₹ ${e.amount.toFixed(2)}`
    ]);

    doc.setFontSize(14);
    doc.text("Detailed Expenses", 14, doc.lastAutoTable.finalY + 10);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 14,
        head: [["Date", "Category", "Amount"]],
        body: expenseRows,
        theme: "grid",
        styles: { fontSize: 10 },
        columnStyles: {
            2: { halign: "right" }
        }
    });

    if (goals.length > 0) {
        const goalRows = goals.map(g => [
            g.name,
            `₹ ${g.saved}`,
            `₹ ${g.amount}`,
            `${((g.saved / g.amount) * 100).toFixed(1)} %`
        ]);

        doc.setFontSize(14);
        doc.text("Goals Progress", 14, doc.lastAutoTable.finalY + 10);

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 14,
            head: [["Goal", "Saved", "Target", "Progress"]],
            body: goalRows,
            theme: "striped",
            styles: { fontSize: 11 },
            headStyles: { fillColor: [15, 23, 42] }
        });
    }
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(
        "Generated by CashEase Expense Tracker",
        14,
        pageHeight - 10
    );

    doc.save("CashEase_Financial_Report.pdf");
}

window.logout = () => {
  signOut(auth).then(() => window.location.href = "login.html");
};

window.addSavings = addSavings;
window.generatePDF = generatePDF;
window.deleteExpense = deleteExpense;
window.deleteGoal = deleteGoal;
