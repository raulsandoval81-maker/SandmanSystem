/* ============================================================
   BRACKET MODEL (2026) — Round Robin & Bracket Buster Core
   ============================================================ */

export class Athlete {
  constructor(id, name, team) {
    this.id = id;
    this.name = name;
    this.team = team;

    // Stats for standings
    this.wins = 0;
    this.losses = 0;
    this.pointsFor = 0;
    this.pointsAgainst = 0;
    this.pins = 0;
    this.techs = 0;
    this.majors = 0;
    this.decisions = 0;

    this.matchResults = {}; // opponentId → result object
  }
}

export class RRMatch {
  constructor(redId, greenId) {
    this.red = redId;
    this.green = greenId;

    this.status = "pending"; // pending | finished
    this.redScore = null;
    this.greenScore = null;
    this.victoryType = null; // fall | tech | major | decision | forfeit
  }
}
