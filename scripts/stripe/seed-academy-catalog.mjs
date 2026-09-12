import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY. Set it in your terminal; never hard-code it."
  );
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const CURRENCY = "usd";
const CATALOG_VERSION = "academy-2026-v3";

/**
 * Sandman Academy of Combat & Fitness
 * 2026 Founding-Year Catalog
 *
 * Amounts are stored in cents.
 *
 * IMPORTANT:
 * - 12-month agreement memberships are billed MONTHLY.
 * - agreement_months=12 is Sandman business logic.
 * - Family plans below are 12-month family-cap prices.
 */

const catalog = [
  // =========================================================
  // COMBAT — 1 DISCIPLINE
  // =========================================================

  {
    key: "combat_1disc_23_mtm",
    productName: "Combat — 1 Discipline · 2–3 Days/Week",
    description:
      "One combat discipline with 2–3 days per week access. Month-to-month.",
    amount: 9000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "1",
      frequency: "2-3",
      term: "month_to_month",
      agreement_months: "0",
    },
  },

  {
    key: "combat_1disc_23_12mo",
    productName: "Combat — 1 Discipline · 2–3 Days/Week",
    description:
      "One combat discipline with 2–3 days per week access. 12-month agreement.",
    amount: 8000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "1",
      frequency: "2-3",
      term: "12_month",
      agreement_months: "12",
    },
  },

  {
    key: "combat_1disc_46_mtm",
    productName: "Combat — 1 Discipline · 4–6 Days/Week",
    description:
      "One combat discipline with 4–6 days per week access. Month-to-month.",
    amount: 14000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "1",
      frequency: "4-6",
      term: "month_to_month",
      agreement_months: "0",
    },
  },

  {
    key: "combat_1disc_46_12mo",
    productName: "Combat — 1 Discipline · 4–6 Days/Week",
    description:
      "One combat discipline with 4–6 days per week access. 12-month agreement.",
    amount: 12000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "1",
      frequency: "4-6",
      term: "12_month",
      agreement_months: "12",
    },
  },

  // =========================================================
  // COMBAT — 2 DISCIPLINES
  // =========================================================

  {
    key: "combat_2disc_23_mtm",
    productName: "Combat — 2 Disciplines · 2–3 Days/Week",
    description:
      "Two combat disciplines with 2–3 days per week access. Month-to-month.",
    amount: 14000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "2",
      frequency: "2-3",
      term: "month_to_month",
      agreement_months: "0",
    },
  },

  {
    key: "combat_2disc_23_12mo",
    productName: "Combat — 2 Disciplines · 2–3 Days/Week",
    description:
      "Two combat disciplines with 2–3 days per week access. 12-month agreement.",
    amount: 12000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "2",
      frequency: "2-3",
      term: "12_month",
      agreement_months: "12",
    },
  },

  {
    key: "combat_2disc_46_mtm",
    productName: "Combat — 2 Disciplines · 4–6 Days/Week",
    description:
      "Two combat disciplines with 4–6 days per week access. Month-to-month.",
    amount: 16000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "2",
      frequency: "4-6",
      term: "month_to_month",
      agreement_months: "0",
    },
  },

  {
    key: "combat_2disc_46_12mo",
    productName: "Combat — 2 Disciplines · 4–6 Days/Week",
    description:
      "Two combat disciplines with 4–6 days per week access. 12-month agreement.",
    amount: 14000,
    recurring: true,
    metadata: {
      category: "combat",
      disciplines: "2",
      frequency: "4-6",
      term: "12_month",
      agreement_months: "12",
    },
  },

  // =========================================================
  // FITNESS
  // =========================================================

  {
    key: "fitness_2day",
    productName: "Fitness — 2 Days/Week",
    description: "Fitness membership for 2 days per week.",
    amount: 6000,
    recurring: true,
    metadata: {
      category: "fitness",
      frequency: "2",
    },
  },

  {
    key: "fitness_3day",
    productName: "Fitness — 3 Days/Week",
    description: "Fitness membership for 3 days per week.",
    amount: 8000,
    recurring: true,
    metadata: {
      category: "fitness",
      frequency: "3",
    },
  },

  {
    key: "fitness_dropin",
    productName: "Fitness — Drop-In",
    description: "Single fitness drop-in session.",
    amount: 1500,
    recurring: false,
    metadata: {
      category: "fitness",
      type: "drop_in",
    },
  },

  // =========================================================
  // ANNUAL ATHLETE ENROLLMENT
  // =========================================================

  {
    key: "enrollment_1",
    productName: "Annual Athlete Enrollment — 1 Training Shirt Package",
    description:
      "Annual athlete enrollment package: AAU membership, 1 athlete shirt, and annual digital/admin support.",
    amount: 5000,
    recurring: false,
    metadata: {
      category: "annual_enrollment",
      package: "1",
      shirts: "1",
      includes_aau: "true",
      standard_minimum: "true",
    },
  },

  {
    key: "enrollment_2",
    productName: "Annual Athlete Enrollment — 2 Training Shirt Package",
    description:
      "Annual athlete enrollment package: AAU membership, 2 athlete shirts, and annual digital/admin support.",
    amount: 6500,
    recurring: false,
    metadata: {
      category: "annual_enrollment",
      package: "2",
      shirts: "2",
      includes_aau: "true",
    },
  },

  {
    key: "enrollment_3",
    productName: "Annual Athlete Enrollment — 3 Training Shirt Package",
    description:
      "Annual athlete enrollment package: AAU membership, 3 athlete shirts, and annual digital/admin support.",
    amount: 7500,
    recurring: false,
    metadata: {
      category: "annual_enrollment",
      package: "3",
      shirts: "3",
      includes_aau: "true",
    },
  },

  // =========================================================
  // COMBAT — SHORT-TERM PASSES
  // =========================================================

  {
    key: "combat_dropin_1day",
    productName: "Combat — 1 Day Pass",
    description: "One-day Combat training pass.",
    amount: 2500,
    recurring: false,
    metadata: {
      category: "combat",
      type: "drop_in",
      days: "1",
    },
  },

  {
    key: "combat_dropin_2day",
    productName: "Combat — 2 Day Pass",
    description: "Two-day Combat training pass.",
    amount: 4000,
    recurring: false,
    metadata: {
      category: "combat",
      type: "short_pass",
      days: "2",
    },
  },

  // =========================================================
  // FAMILY COMBAT — 12-MONTH FAMILY CAPS
  // =========================================================

  {
    key: "family_1disc_23_12mo",
    productName: "Family Combat — 1 Discipline · 2–3 Days/Week",
    description:
      "Family Combat cap for one discipline, 2–3 days per week. 12-month agreement.",
    amount: 16000,
    recurring: true,
    metadata: {
      category: "family_combat",
      disciplines: "1",
      frequency: "2-3",
      family_cap: "true",
      term: "12_month",
      agreement_months: "12",
    },
  },

  {
    key: "family_1disc_46_12mo",
    productName: "Family Combat — 1 Discipline · 4–6 Days/Week",
    description:
      "Family Combat cap for one discipline, 4–6 days per week. 12-month agreement.",
    amount: 20000,
    recurring: true,
    metadata: {
      category: "family_combat",
      disciplines: "1",
      frequency: "4-6",
      family_cap: "true",
      term: "12_month",
      agreement_months: "12",
    },
  },

  {
    key: "family_2disc_23_12mo",
    productName: "Family Combat — 2 Disciplines · 2–3 Days/Week",
    description:
      "Family Combat cap for two disciplines, 2–3 days per week. 12-month agreement.",
    amount: 20000,
    recurring: true,
    metadata: {
      category: "family_combat",
      disciplines: "2",
      frequency: "2-3",
      family_cap: "true",
      term: "12_month",
      agreement_months: "12",
    },
  },

  {
    key: "family_2disc_46_12mo",
    productName: "Family Combat — 2 Disciplines · 4–6 Days/Week",
    description:
      "Family Combat cap for two disciplines, 4–6 days per week. 12-month agreement.",
    amount: 26000,
    recurring: true,
    metadata: {
      category: "family_combat",
      disciplines: "2",
      frequency: "4-6",
      family_cap: "true",
      term: "12_month",
      agreement_months: "12",
    },
  },
];

async function findProductByKey(key) {
  const result = await stripe.products.search({
    query: `metadata['sandman_catalog_key']:'${key}'`,
    limit: 1,
  });

  return result.data[0] || null;
}

async function findPriceByLookupKey(lookupKey) {
  const result = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  return result.data[0] || null;
}

async function ensureCatalogItem(item) {
  let product = await findProductByKey(item.key);

  if (!product) {
    product = await stripe.products.create({
      name: item.productName,
      description: item.description,
      metadata: {
        sandman_catalog_key: item.key,
        catalog_version: CATALOG_VERSION,
        brand: "sandman_academy",
        ...item.metadata,
      },
    });

    console.log(`✓ Created product: ${product.name}`);
  } else {
    product = await stripe.products.update(product.id, {
      name: item.productName,
      description: item.description,
      metadata: {
        sandman_catalog_key: item.key,
        catalog_version: CATALOG_VERSION,
        brand: "sandman_academy",
        ...item.metadata,
      },
    });

    console.log(`• Updated product: ${product.name}`);
  }

  const lookupKey = `sandman_${CATALOG_VERSION}_${item.key}`;

  let price = await findPriceByLookupKey(lookupKey);

  if (!price) {
    const priceData = {
      product: product.id,
      currency: CURRENCY,
      unit_amount: item.amount,
      lookup_key: lookupKey,
      metadata: {
        sandman_catalog_key: item.key,
        catalog_version: CATALOG_VERSION,
        ...item.metadata,
      },
    };

    if (item.recurring) {
      priceData.recurring = {
        interval: "month",
      };
    }

    price = await stripe.prices.create(priceData);

    console.log(
      `  ✓ Created ${item.recurring ? "monthly" : "one-time"} price: ` +
        `$${(item.amount / 100).toFixed(2)}`
    );
  } else {
    console.log(
      `  • Existing price: $${(price.unit_amount / 100).toFixed(2)}`
    );
  }

  return {
    key: item.key,
    productId: product.id,
    priceId: price.id,
    lookupKey,
  };
}

async function main() {
  const account = await stripe.accounts.retrieve();

  console.log("");
  console.log("Sandman Academy Stripe Catalog");
  console.log("--------------------------------");
  console.log(`Stripe account: ${account.id}`);
  console.log(
  `Live mode: ${
    process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ||
    process.env.STRIPE_SECRET_KEY.startsWith("rk_live_")
  }`
);
  console.log("");

  const output = {};

  for (const item of catalog) {
    output[item.key] = await ensureCatalogItem(item);
  }

  console.log("");
  console.log("CATALOG CREATED / VERIFIED");
  console.log("--------------------------------");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("Stripe catalog seed failed:");
  console.error(error);
  process.exit(1);
});