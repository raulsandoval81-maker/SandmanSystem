// sandbox.service.js
// Service file for Sandbox section (dev playground)

export const sandboxService = {
  name: "Sandbox",
  purpose: "Testing and prototyping features before they go live.",
  status: "development",
  version: "1.0.0",
  lastUpdated: new Date().toISOString(),

  logStatus() {
    console.log(`[Sandbox] Service loaded. Version: ${this.version}`);
  }
};

// Auto-run when loaded
document.addEventListener("DOMContentLoaded", () => {
  sandboxService.logStatus();
});
