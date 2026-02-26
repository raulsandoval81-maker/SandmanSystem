// Render message bubble (Level 3 Styling — Final)
function appendMessage({ from, text, ts }) {
  const wrap = document.createElement("div");

  // left or right alignment
  const isCoach = from === "coach";
  wrap.className = `msg-block ${isCoach ? "msg-coach" : "msg-parent"}`;

  const senderLabel = isCoach ? "Coach" : "You";
  const timeLabel = ts ? ts.toLocaleString() : "";

  wrap.innerHTML = `
    <div class="msg-header">
      <span class="msg-sender">${senderLabel}</span>
      <span class="msg-time">${timeLabel}</span>
    </div>
    <div class="msg-body">${text}</div>
  `;

  threadEl.appendChild(wrap);

  // Auto-scroll to bottom on new message
  setTimeout(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  }, 10);
}
