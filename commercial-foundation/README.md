# Sandman Commercial foundation

This package is an isolated, non-deployed reference implementation for organization-scoped Commercial contracts and authorization. It is not connected to Sandman Academy production and its `InMemoryCommercialStore` is test-only—not production tenancy evidence.

Run:

```sh
npm install
npm test
npm run check:production-dependencies
```

The package deliberately has no Firebase, Stripe, network, production URL, or deployment dependency.
