// Render one message bubble safely.
function appendMessage({
  from = "parent",
  fromName = "",
  text = "",
  ts = null
}) {
  if (!threadEl) return;

  const isCoach =
    String(from).toLowerCase() === "coach";

  const wrap =
    document.createElement("div");

  wrap.className =
    `msg-block ${
      isCoach
        ? "msg-coach"
        : "msg-parent"
    }`;

  const header =
    document.createElement("div");

  header.className =
    "msg-header";

  const sender =
    document.createElement("span");

  sender.className =
    "msg-sender";

  sender.textContent =
    fromName ||
    (isCoach ? "Coach" : "You");

  const time =
    document.createElement("span");

  time.className =
    "msg-time";

  let date = null;

  try {
    if (
      ts &&
      typeof ts.toDate === "function"
    ) {
      date = ts.toDate();
    } else if (ts instanceof Date) {
      date = ts;
    } else if (ts) {
      const parsed =
        new Date(ts);

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        date = parsed;
      }
    }
  } catch {
    date = null;
  }

  time.textContent =
    date
      ? date.toLocaleString()
      : "";

  const body =
    document.createElement("div");

  body.className =
    "msg-body";

  body.textContent =
    String(text || "");

  header.appendChild(sender);
  header.appendChild(time);

  wrap.appendChild(header);
  wrap.appendChild(body);

  threadEl.appendChild(wrap);

  requestAnimationFrame(() => {
    threadEl.scrollTop =
      threadEl.scrollHeight;
  });
}