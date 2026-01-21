const db = firebase.firestore();

let selectedId = null;
let selectedData = null;

// ===== Load All Athletes With Questionnaires =====
async function loadAthletes(){
  const list = document.getElementById("athleteList");
  list.innerHTML = "<p>Loading...</p>";

  const snap = await db.collection("athletes").get();

  list.innerHTML = "";

  snap.forEach(doc => {
    const data = doc.data();

    if (!data.questionnaires) return;

    // Show athletes who completed at least one
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = `${data.name} — ${data.foundry}`;
    div.onclick = () => loadResponse(doc.id, data);
    list.appendChild(div);
  });
}

loadAthletes();


// ===== Load One Athlete's Responses =====
async function loadResponse(uid, profile){
  selectedId = uid;
  
  const path = `athletes/${uid}/questionnaires`;

  const f8 = await db.collection(path).doc("destiny").get();
  const f4 = await db.collection(path).doc("reflection").get();

  const box = document.getElementById("responseBox");

  let out = "";

  if (f8.exists){
    out += "=== DESTINY (F8) ===\n\n";
    out += JSON.stringify(f8.data(), null, 2) + "\n\n";
    selectedData = f8.data();
  }

  if (f4.exists){
    out += "=== REFLECTION (F4) ===\n\n";
    out += JSON.stringify(f4.data(), null, 2);
    selectedData = f4.data();
  }

  box.classList.remove("empty");
  box.textContent = out || "No questionnaires found.";

  document.getElementById("btnExport").disabled = !selectedData;
  document.getElementById("btnMark").disabled = !selectedData;
}


// ===== Export PDF =====
document.getElementById("btnExport").onclick = async () => {
  if (!selectedData) return;
  await exportPDF(selectedId, selectedData);
  alert("PDF downloaded.");
};


// ===== Mark as Archived =====
document.getElementById("btnMark").onclick = async () => {
  if (!selectedId) return;

  await db.collection("athletes")
          .doc(selectedId)
          .update({ questionnaireArchived: true });

  alert("Marked as archived.");
};
