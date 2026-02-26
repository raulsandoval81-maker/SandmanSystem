// /coaches/_ui/dev-boot.js
// Shared DEV bootstrap for all coach pages.
// Requires: /assets/js/dev-mode.js

import { paintDevUi, patchDevLinks, bindDevToggle } from "/assets/js/dev-mode.js";

paintDevUi();
patchDevLinks();
bindDevToggle({ onChange: () => location.reload() });
