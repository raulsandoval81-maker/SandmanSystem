# WIRING_CHEATSHEET.md
Quick reference guide for running XP wiring (functions + emulator + tester).

---

## 1. Backup First
- Copy your whole `sandmandashboard/` folder to your external hard drive.  
- Do this **before** and **after** making changes.  
- Backup = insurance.

---

## 2. Functions Folder
- Work lives in `functions/src/`.  
- Example: `xpEvents.ts`, `index.ts`.  
- All callables (incrementXp, setRoleForMonth, etc.) are exported here.

---

## 3. Build Functions
Every time you change `.ts` files in `functions/src/`:

```bash
cd functions
npm run build
