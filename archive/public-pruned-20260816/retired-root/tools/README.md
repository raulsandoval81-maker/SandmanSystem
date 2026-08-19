# /tools/ — Coach Utility Zone

This folder contains all internal utility pages used by coaches, staff, and admins within the Sandman System. Most tools here are tied to XP tracking, badge promotion, and internal systems.

### Page Breakdown

| File                  | Purpose                                              |
|-----------------------|------------------------------------------------------|
| index.html            | Hub for launching tools (optional coach dashboard)  |
| leaderboard.html      | Displays live XP rankings / athlete tiers           |
| snapshot.html         | Displays all athlete data: XP, stats, stripe status |
| xp.html               | Core XP logger and tracking system                  |
| coach_notes.html      | Tool for writing and saving athlete notes           |
| practice-plans.html   | Area to upload or view training plans               |
| ceremony_tools.html   | Resources for running tier/badge ceremonies         |
| tools.service.js      | Shared utility functions (fetching data, etc.)      |

### Firebase Notes

Most of these pages will connect to Firestore to read/write XP, notes, or logs. Do not deploy until Firebase is initialized properly with `firebase-init.js`.

