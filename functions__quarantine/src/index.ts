console.log("✅ INDEX BOOT:", __filename, "pid:", process.pid);

/* eslint-disable @typescript-eslint/no-var-requires */

// 0) Install the trap BEFORE anything else loads.
const Module = require("module");
const _load = Module._load;

function wrapConfig(loaded: any, parent: any, request: string) {
  if (loaded && typeof loaded.config === "function") {
    loaded.config = (..._args: any[]) => {
      console.error("\n🚨 functions.config() CALL INTERCEPTED");
      console.error("request:", request);
      console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
      console.error(new Error("STACK").stack);

      // Keep the worker alive so we can see the stack.
      return {};
    };
  }
  return loaded;
}

Module._load = function (request: string, parent: any, isMain: boolean) {
  const loaded = _load.apply(this, arguments as any);

  // Log any v1 paths too (these often bypass your exact-match trap)
  if (typeof request === "string" && request.startsWith("firebase-functions")) {
    if (request.includes("/v1") || request.includes("lib/v1")) {
      console.error("\n🚨 firebase-functions v1 path loaded:", request);
      console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
      console.error(new Error("STACK").stack);
    }
    return wrapConfig(loaded, parent, request);
  }

  return loaded;
};

process.on("uncaughtException", (e: any) => {
  console.error("🔥 uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (e: any) => {
  console.error("🔥 unhandledRejection:", e?.stack || e);
});

// 1) Now it’s safe to load everything else.
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

// 2) Exports (require AFTER hook is installed)
exports.ping = require("./modules/ping").ping;
exports.submitIntake = require("./modules/intake/submitIntake").submitIntake;
