import { loadPanelMessage } from "./film.common.js";

console.log("Team Highlights loaded.");

export function initTHIndex(){
  console.log("initTHIndex()");
}

export function initMoment(){
  loadPanelMessage(".panel", "No moments uploaded yet.");
}

export function initSeason(){
  loadPanelMessage(".panel", "Season reel coming soon.");
}
