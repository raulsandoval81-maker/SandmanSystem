// public/admin/hub.service.js
// Placeholder service for Admin Hub logic

(function (global) {
  "use strict";

  const HubService = {
    // Example: return links or menu items
    getLinks() {
      return [
        { label: "Dashboard", href: "dashboard.html" },
        { label: "Snapshot", href: "snapshot.html" },
      ];
    },

    // Future: hub-specific admin logic
    init() {
      console.log("[HubService] initialized.");
    }
  };

  global.HubService = HubService;
})(window);
