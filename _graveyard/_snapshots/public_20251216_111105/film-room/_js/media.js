import { loadPanelMessage } from "./film.common.js";

console.log("Media module loaded.");

export function initMediaIndex(){
  console.log("initMediaIndex()");
}

export function initCeremony(){
  loadPanelMessage(".panel", "No ceremonies yet. Upload soon.");
}
