"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installConfigProbe = installConfigProbe;
// functions/src/infra/probeConfig.ts
function installConfigProbe() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require("module");
    const origLoad = Module._load;
    function maybeWrapConfig(loaded, request, parent) {
        if (!loaded || typeof loaded !== "object" && typeof loaded !== "function")
            return loaded;
        // If the module itself has config()
        if (typeof loaded.config === "function") {
            const original = loaded.config;
            loaded.config = (...args) => {
                console.error(`\n🚨 functions.config() CALLED via module "${request}"`);
                console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
                console.error(new Error("STACK").stack);
                return original(...args);
            };
            return loaded;
        }
        // Or if a nested export has config()
        return new Proxy(loaded, {
            get(target, prop) {
                const val = target[prop];
                if (prop === "config" && typeof val === "function") {
                    return (...args) => {
                        console.error(`\n🚨 functions.config() CALLED via module "${request}" (proxy get)`);
                        console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
                        console.error(new Error("STACK").stack);
                        return val(...args);
                    };
                }
                return val;
            },
        });
    }
    Module._load = function (request, parent, isMain) {
        const loaded = origLoad.apply(this, arguments);
        // Log every firebase-functions* load (this is the missing visibility)
        if (typeof request === "string" && request.startsWith("firebase-functions")) {
            console.log(`🧪 loaded: ${request}  ←  ${parent?.filename || parent?.id || "(unknown)"}`);
            return maybeWrapConfig(loaded, request, parent);
        }
        return loaded;
    };
    console.log("✅ worker probe installed:", process.pid);
}
