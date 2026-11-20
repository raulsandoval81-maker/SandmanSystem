import { Entitlement, Membership, ProductRegistry, Program } from "./contracts";

const idPattern = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const roles = new Set(["organization_admin", "management", "coach", "parent", "adult_athlete", "athlete"]);
const scopes = new Set(["organization", "academy", "location"]);
const membershipStates = new Set(["invited", "active", "suspended", "revoked"]);
const entitlementStates = new Set(["active", "suspended", "expired", "revoked"]);
const sources = new Set(["Core", "Plus", "Pro", "add_on", "product"]);
const iso = (value: string) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
export function assertId(value: string, field = "id"): void {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(`INVALID_${field.toUpperCase()}`);
}
export function validateMembership(value: Membership): Membership {
  assertId(value.id); assertId(value.userId, "userId"); assertId(value.organizationId, "organizationId"); assertId(value.scopeId, "scopeId");
  if (!roles.has(value.role) || !scopes.has(value.scopeType) || !membershipStates.has(value.state)) throw new Error("INVALID_MEMBERSHIP");
  if (value.role === "organization_admin" && value.scopeType !== "organization") throw new Error("INVALID_ADMIN_SCOPE");
  if (value.scopeType === "organization" && value.scopeId !== value.organizationId) throw new Error("INVALID_ORGANIZATION_SCOPE");
  return value;
}
export function validateProgram(value: Program): Program {
  assertId(value.id); assertId(value.organizationId, "organizationId"); assertId(value.academyId, "academyId");
  if (!Array.isArray(value.locationIds) || value.locationIds.some(id => typeof id !== "string" || !idPattern.test(id))) throw new Error("INVALID_PROGRAM_LOCATION");
  if (!Array.isArray(value.disciplines) || typeof value.name !== "string" || !value.name.trim() || value.disciplines.length === 0 || value.disciplines.some(d => typeof d !== "string" || !idPattern.test(d)) || new Set(value.disciplines).size !== value.disciplines.length) throw new Error("INVALID_PROGRAM");
  return value;
}
export function validateEntitlement(value: Entitlement): Entitlement {
  assertId(value.id); assertId(value.organizationId, "organizationId"); assertId(value.capabilityId, "capabilityId");
  if (!entitlementStates.has(value.state) || !sources.has(value.source) || !iso(value.startsAt) || (value.expiresAt && !iso(value.expiresAt)) || (value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.startsAt))) throw new Error("INVALID_ENTITLEMENT");
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
