import { loadPanelMessage } from "./film.common.js";

console.log("Recon module loaded.");

export function initReconIndex(){
  console.log("initReconIndex()");
}

export function initOpponents(){
  loadPanelMessage(".panel", "Opponents scouting coming soon.");
}

export function initTeamScout(){
  loadPanelMessage(".panel", "Team scouting module locked in.");
}
