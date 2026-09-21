import { readFile } from "node:fs/promises";

// Read the browser catalog itself so Stripe provisioning cannot drift from
// the approved household/access/term amounts or lookup keys.
export async function currentV4RecurringCatalog() {
  const source = await readFile(
    new URL("../../public/assets/js/pricing/sandman-pricing-catalog.js", import.meta.url),
    "utf8"
  );
  const { SANDMAN_PRICING_CATALOG: pricing } = await import(
    `data:text/javascript,${encodeURIComponent(source)}`
  );
  const prefix = pricing.stripeLookupPrefix;
  const items = [];

  for (const householdSize of [1, 2, 3, 4]) {
    for (const access of pricing.combat.accessOrder) {
      for (const [term, termLabel] of [
        ["annual", "12-month"],
        ["sixMonth", "6-month"],
        ["monthToMonth", "month-to-month"],
      ]) {
        const rate = pricing.combat.householdPricing[String(householdSize)]?.[access]?.[term];
        if (!rate || !Number.isSafeInteger(rate.amount * 100) || rate.amount <= 0 ||
            !rate.lookup.startsWith(prefix)) {
          throw new Error(`Invalid v4 recurring catalog entry: ${householdSize}/${access}/${term}`);
        }
        items.push({
          key: `v4_${rate.lookup.slice(prefix.length)}`,
          lookupKey: rate.lookup,
          catalogVersion: "academy-2026-v4",
          productName: `Combat — Household ${householdSize} · ${pricing.combat.accessLevels[access].label} · ${termLabel}`,
          description: `Monthly Combat membership for household ${householdSize}, ${access}, ${termLabel}.`,
          amount: Math.round(rate.amount * 100),
          recurring: true,
          metadata: {
            category: "combat",
            household_size: String(householdSize),
            training_access: access,
            billing_term: term,
          },
        });
      }
    }
  }

  if (items.length !== 60 || new Set(items.map((item) => item.lookupKey)).size !== 60) {
    throw new Error("The v4 Combat recurring catalog must contain 60 unique prices.");
  }
  return items;
}
