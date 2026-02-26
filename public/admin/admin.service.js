// admin.js – central admin wiring
console.log("Admin tools loaded");

// Example: guard (later tie to Firebase Auth role)
function adminCheck() {
  // placeholder: replace with Firebase Auth role check
  const isAdmin = true;
  if (!isAdmin) {
    alert("Access denied. Admins only.");
    window.location.href = "../index.html";
  }
}

// Run check on load
adminCheck();
