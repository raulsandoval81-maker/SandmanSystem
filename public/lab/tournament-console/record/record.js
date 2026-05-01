import { app } from "/assets/js/firebase-init.js";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js";

const storage = getStorage(app);

// local emulator only
connectStorageEmulator(storage, "127.0.0.1", 9199);

let mediaRecorder;
let stream;
let chunks = [];

const preview = document.getElementById("preview");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const status = document.getElementById("status");

const matchData = JSON.parse(
  localStorage.getItem("arena_active_match") || "null"
);

console.log("Active match:", matchData);

startBtn.onclick = async () => {
  try {
stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: "environment" } },
  audio: true
});
    preview.srcObject = stream;
    preview.controls = false;

    chunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      preview.srcObject = null;
      preview.src = url;
      preview.controls = true;

      status.textContent = "Saving video...";

      try {
        const downloadURL = await saveVideoToMatch(blob);

        const savedMatch = {
          ...matchData,
          videoUrl: downloadURL,
          savedAt: new Date().toISOString()
        };

        localStorage.setItem("arena_last_video_match", JSON.stringify(savedMatch));
        status.textContent = "Video saved to match.";
      } catch (err) {
        console.error("Save failed:", err);
        status.textContent = "Save failed. Video preview still available.";
      }
    };

    mediaRecorder.start();

    startBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = "Recording...";
  } catch (err) {
    console.error("Camera error:", err);
    status.textContent = "Camera access failed.";
  }
};

stopBtn.onclick = () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;

  mediaRecorder.stop();

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
};

async function saveVideoToMatch(blob) {
  const athlete = (matchData?.athlete || "unknown-athlete")
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase();

  const matchId = matchData?.matchId || Date.now();

  const filePath = `arena-matches/${athlete}/${matchId}/match-video.webm`;
  const storageRef = ref(storage, filePath);

  await uploadBytes(storageRef, blob, {
    contentType: "video/webm"
  });

  const downloadURL = await getDownloadURL(storageRef);

  console.log("Saved video:", { filePath, downloadURL });

  return downloadURL;
}