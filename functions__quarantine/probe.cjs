/* functions/probe.cjs */
const Module = require("module");
const origLoad = Module._load;

function shouldLog(request) {
  const r = String(request || "");
  if (!r.includes("firebase-functions")) return false;

  // any config-ish path inside firebase-functions
  if (r.includes("config")) return true;

  // catch v1/v2 roots too (sometimes config is pulled indirectly)
  if (r.includes("/v1/") || r.includes("/v2/")) return true;

  return false;
}

function wrapIfHasConfig(loaded, parent) {
  if (!loaded || (typeof loaded !== "object" && typeof loaded !== "function")) return loaded;

  // Some modules export { config } instead of functions.config()
  if ("config" in loaded) {
    return new Proxy(loaded, {
      get(target, prop) {
        if (prop === "config") {
          return (...args) => {
            console.error("\n🚨 CALLED export.config()");
            console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
            console.error(new Error("STACK").stack);
            return target.config(...args); // will throw in v7; we want the stack
          };
        }
        return target[prop];
      },
    });
  }

  return loaded;
}

Module._load = function (request, parent, isMain) {
  if (shouldLog(request)) {
    console.error("\n🧲 LOAD:", request);
    console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
    console.error(new Error("LOAD STACK").stack);
  }

  const loaded = origLoad.apply(this, arguments);
  return wrapIfHasConfig(loaded, parent);
};

process.on("uncaughtException", (e) => {
  console.error("🔥 uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (e) => {
  console.error("🔥 unhandledRejection:", e?.stack || e);
});

console.error("✅ preload probe active:", process.pid);
