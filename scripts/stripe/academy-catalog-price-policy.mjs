export function validateExistingCatalogPrice(item, product, price, lookupKey) {
  const productId = typeof price.product === "string" ? price.product : price.product?.id;
  const expected = {
    unit_amount: item.amount,
    currency: "usd",
    active: true,
    product: product.id,
    type: item.recurring ? "recurring" : "one_time",
    recurring_interval: item.recurring ? "month" : null,
    recurring_interval_count: item.recurring ? 1 : null,
    recurring_usage_type: item.recurring ? "licensed" : null,
  };
  const actual = {
    unit_amount: price.unit_amount,
    currency: price.currency,
    active: price.active,
    product: productId,
    type: price.type,
    recurring_interval: price.recurring?.interval ?? null,
    recurring_interval_count: price.recurring?.interval_count ?? null,
    recurring_usage_type: price.recurring?.usage_type ?? null,
  };

  for (const [field, value] of Object.entries(expected)) {
    if (actual[field] !== value) {
      throw new Error(
        `Stripe Price ${lookupKey} mismatch for ${field}: expected ${JSON.stringify(value)}, actual ${JSON.stringify(actual[field])}.`
      );
    }
  }
  return price;
}
