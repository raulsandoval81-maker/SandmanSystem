import { loadPanelMessage } from "./film.common.js";

console.log("Video Vault Module loaded.");

export function initVaultIndex(){
  console.log("initVaultIndex()");
}

export function initAnalysis(){
  loadPanelMessage(".panel", "Match analysis will populate soon.");
}

export function initHighlights(){
  loadPanelMessage(".panel", "No highlight reels yet.");
}

export function initMatchArchive(){
  loadPanelMessage(".panel", "Match archive empty.");
}
