// --- Q&A Logic ---
const askBtn = document.getElementById("askBtn");
const qName = document.getElementById("qName");
const qEmail = document.getElementById("qEmail");
const qText = document.getElementById("qText");
const qStatus = document.getElementById("qStatus");
const qaList = document.getElementById("qaList");

// Mock storage for demo – replace with Firebase later
let qaData = [
  { name: "Parent A", question: "When is the next tournament?", answer: "Jan 14 – Dual Meet at Lompoc." },
  { name: "Parent B", question: "What color is Commander rank?", answer: "Purple for youth, Brown for adults." }
];

// Render function
function renderQA() {
  qaList.innerHTML = "";
  if (qaData.length === 0) {
    qaList.textContent = "No questions yet.";
    return;
  }

  qaData.forEach(item => {
    const block = document.createElement("div");
    block.className = "item";
    block.innerHTML = `
      <div><strong>Q:</strong> ${item.question} <span class="muted">— ${item.name || "Anonymous"}</span></div>
      <div style="margin-top:6px"><strong>A:</strong> ${item.answer || "<span class='muted'>Pending…</span>"}</div>
    `;
    qaList.appendChild(block);
  });
}

// Handle submission
askBtn.addEventListener("click", () => {
  const question = qText.value.trim();
  if (!question) {
    qStatus.textContent = "⚠ Please enter a question.";
    return;
  }

  qStatus.textContent = "Sending…";

  // Add new question (answer pending)
  qaData.unshift({
    name: qName.value.trim(),
    question: question,
    answer: null
  });

  // Reset inputs
  qName.value = "";
  qEmail.value = "";
  qText.value = "";

  qStatus.textContent = "✅ Sent! Waiting for coach reply.";
  renderQA();
});

// Initial render
renderQA();
