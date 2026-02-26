/* ============================================================
   EVENT SYNC CORE — 2026
   Central broadcast engine for all Sandman Tournament Systems
   ------------------------------------------------------------
   - Mat Console PRO  → Table Console
   - Mat Console PRO  → Director Board
   - Mat Console PRO  → Parent Live Scoreboard
   - Mat Console PRO  → Filmroom Jump Buttons
   - Future: Big Screen, Analytics, RFA-style events
   ============================================================ */

console.log("%cEVENT-SYNC 2026 ONLINE", "color:#00e1ff;font-weight:bold;");


/* ============================================================
   1) MAT REGISTRATION
   ------------------------------------------------------------
   Each mat calls registerMat(matNumber)
   so we know who is sending events.
   ============================================================ */

const mats = new Set();

export function registerMat(matNum) {
  mats.add(matNum);
  window.currentMat = matNum;
  console.log(`%cRegistered Mat ${matNum}`, "color:#ffdd48;");
}



/* ============================================================
   2) fireEvent (LOCAL ONLY)
   ------------------------------------------------------------
   Sends event to:
     - TableConsoleMirror
     - Local Match Log
     - Filmroom
   Does NOT broadcast to all mats.
   ============================================================ */

export function fireEvent(ev) {
  // 1. TABLE CONSOLE
  if (window.tableMirrorPush) {
    try { window.tableMirrorPush(ev); } catch (_) {}
  }

  // 2. FILMROOM PULSE
  if (window.refreshFilmroom) {
    try { window.refreshFilmroom(ev); } catch (_) {}
  }

  // 3. LOCAL LOG (Mat Console internal)
  if (window.localLogPush) {
    try { window.localLogPush(ev); } catch (_) {}
  }
}



/* ============================================================
   3) fireToAll (GLOBAL BROADCAST)
   ------------------------------------------------------------
   Sends event to:
     - Director Board
     - Table Console
     - Parent Live Scoreboard / Live Bracket
     - Future big-screen and analytics
   ============================================================ */

export function fireToAll(ev) {
  const mat = window.currentMat || null;
  if (!mat) return;

  const packet = {
    ...ev,
    ts: Date.now(),
    mat
  };

  // OUT: DIRECTOR BOARD
  if (window.multiMatPush) {
    try { window.multiMatPush(mat, packet); } catch (_) {}
  }

  // OUT: TABLE CONSOLE
  if (window.tableMirrorPush) {
    try { window.tableMirrorPush(packet); } catch (_) {}
  }

  // OUT: PARENT LIVE SCOREBOARD
  if (window.parentLivePush) {
    try { window.parentLivePush(packet); } catch (_) {}
  }

  // OUT: BRACKET BOARD
  if (window.bracketLivePush) {
    try { window.bracketLivePush(packet); } catch (_) {}
  }

  // OUT: FILMROOM
  if (window.refreshFilmroom) {
    try { window.refreshFilmroom(packet); } catch (_) {}
  }
}



/* ============================================================
   4) sendMatchInfo
   ------------------------------------------------------------
   Broadcast athlete names, event title, bout #
   Used by mat console on load or when changed.
   ============================================================ */

export function sendMatchInfo(info) {
  fireToAll({
    type: "match-info",
    payload: {
      event: info.event || scoringState?.event || "--",
      bout: info.bout || scoringState?.bout || "--",
      redName: info.redName || scoringState?.redName || "RED",
      greenName: info.greenName || scoringState?.greenName || "GREEN"
    }
  });
}



/* ============================================================
   5) sendClockUpdate
------------------------------------------------------------ */
export function sendClockUpdate(timeString) {
  fireToAll({
    type: "clock",
    payload: { time: timeString }
  });
}



/* ============================================================
   6) sendLog
------------------------------------------------------------ */
export function sendLog(text) {
  fireToAll({
    type: "log",
    payload: { text }
  });
}


/* ============================================================
   7) sendBoutSheetEvent
------------------------------------------------------------ */
export function sendBoutSheetEvent(cell, color, choice) {
  fireToAll({
    type: "boutsheet",
    payload: { cell, color, choice }
  });
}


/* ============================================================
   END
============================================================ */
