// Sandman Silver — Controller/UI (Nov 13)
// Wires DOM → SilverCore. No Firebase imports here.

import { paintXp } from "./silver.xp.js";
import SilverCore, { setLive } from "./silver.core.js";

// expose for console & start safe
window.SilverCore = SilverCore;
window.setLive = setLive;
setLive(false);
