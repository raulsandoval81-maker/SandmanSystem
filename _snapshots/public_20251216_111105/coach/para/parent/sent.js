import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "/data/firebase-init.js";

const params = new URLSearchParams(location.search);
const threadId = params.get("id");

const btn = document.getElementById("btn-send-reply");
const bodyEl = document.getElementById("reply-body");

const ok = document.getElementById("reply-success");
const err = document.getElementById("reply-error");

btn.addEventListener("click", async () => {
  const body = bodyEl.value.trim();
  if (!body) {
    err.style.display = "block";
    ok.style.display = "none";
    return;
  }

  try {
    await addDoc(
      collection(db, "paraCoachInbox", threadId, "replies"),
      {
        from: "parent",
        body,
        createdAt: serverTimestamp()
      }
    );

    ok.style.display = "block";
    err.style.display = "none";
    bodyEl.value = "";

    setTimeout(() => ok.style.display = "none", 2000);

  } catch (e) {
    console.error(e);
    err.style.display = "block";
    ok.style.display = "none";
  }
});
