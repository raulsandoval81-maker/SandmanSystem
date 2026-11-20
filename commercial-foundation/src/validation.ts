import { Entitlement, Membership, ProductRegistry, Program } from "./contracts";

const idPattern = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const iso = (value: string) => !Number.isNaN(Date.parse(value));
export function assertId(value: string, field = "id"): void {
  if (!idPattern.test(value)) throw new Error(`INVALID_${field.toUpperCase()}`);
}
export function validateMembership(value: Membership): Membership {
  assertId(value.id); assertId(value.userId, "userId"); assertId(value.organizationId, "organizationId"); assertId(value.scopeId, "scopeId");
  if (value.scopeType === "organization" && value.scopeId !== value.organizationId) throw new Error("INVALID_ORGANIZATION_SCOPE");
  return value;
}
export function validateProgram(value: Program): Program {
  assertId(value.id); assertId(value.organizationId, "organizationId"); assertId(value.academyId, "academyId");
  if (!value.name.trim() || value.disciplines.length === 0 || new Set(value.disciplines).size !== value.disciplines.length) throw new Error("INVALID_PROGRAM");
  return value;
}
export function validateEntitlement(value: Entitlement): Entitlement {
  assertId(value.id); assertId(value.organizationId, "organizationId"); assertId(value.capabilityId, "capabilityId");
  if (!iso(value.startsAt) || (value.expiresAt && !iso(value.expiresAt))) throw new Error("INVALID_ENTITLEMENT_DATE");
  if (value.source === "product" && !value.productId) throw new Error("PRODUCT_SOURCE_REQUIRES_PRODUCT_ID");
  return value;
}
export function validateProductRegistry(registry: ProductRegistry): ProductRegistry {
  if (registry.schema !== "sandman.commercial.registry.v1") throw new Error("INVALID_REGISTRY_SCHEMA");
  const ids = new Set<string>();
  for (const product of registry.products) {
    assertId(product.id); if (ids.has(product.id)) throw new Error("DUPLICATE_PRODUCT_ID"); ids.add(product.id);
    if (!product.owner.trim() || !product.dataBoundary.trim() || !/^\d+\.\d+\.\d+$/.test(product.compatibilityVersion)) throw new Error("INVALID_PRODUCT");
    for (const capability of product.capabilityIds) assertId(capability, "capabilityId");
  }
  return registry;
}
