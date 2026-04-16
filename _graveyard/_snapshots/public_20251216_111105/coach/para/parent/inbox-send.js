// public/para/parent/inbox-send.js
import {
  db,
  serverTimestamp,
  collection,
  addDoc
} from "/data/firebase-init.js";

const btnSend = document.querySelector("#btn-send-inbox");
const nameEL  = document.querySelector("#inbox-parent-name");
const emailEL = document.querySelector("#inbox-parent-email");
const subjectEL = document.querySelector("#inbox-subject");
const bodyEL = document.querySelector("#inbox-body");

const successMsg = document.querySelector("#inbox-success");
const errMsg = document.querySelector("#inbox-error");

btnSend.addEventListener("click", async () => {

  const name = nameEL.value.trim();
  const email = emailEL.value.trim();
  const subject = subjectEL.value.trim();
  const body = bodyEL.value.trim();

  if (!name || !body) {
    errMsg.style.display = "block";
    successMsg.style.display = "none";
    return;
  }

  errMsg.style.display = "none";

  try {
    const ref = await addDoc(collection(db, "paraCoachInbox"), {
      name,
      email: email || null,
      subject: subject || "(no subject)",
      body,
      createdAt: serverTimestamp(),
      seen: false
    });

    successMsg.style.display = "block";

    // Redirect WITH correct ID
    setTimeout(() => {
      window.location.href = `/para/parent/sent.html?id=${ref.id}`;
    }, 900);

  } catch (err) {
    console.error("Inbox send error:", err);
    errMsg.style.display = "block";
    successMsg.style.display = "none";
  }
});
