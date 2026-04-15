// TEMP DEBUG: show who triggers functions.config()
import Module from "module";
const _load = (Module as any)._load;

(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  const loaded = _load.apply(this, arguments as any);

  // When firebase-functions v2 loads, it also requires v1/config internally.
  // If anything actually calls config(), print the stack.
  if (request === "firebase-functions") {
    return new Proxy(loaded, {
      get(target, prop) {
        if (prop === "config") {
          return (...args: any[]) => {
            console.error("\n🚨 functions.config() CALLED");
            console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
            console.error(new Error("STACK").stack);
            return (target as any).config(...args);
          };
        }
        return (target as any)[prop];
      },
    });
  }

  return loaded;
};

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

export const ping = onRequest((req, res) => {
  res.status(200).send("pong");
});
