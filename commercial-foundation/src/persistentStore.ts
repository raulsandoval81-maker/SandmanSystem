import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AuditEvent, Organization, VerifiedIdentity } from "./contracts";
import { InMemoryCommercialStore, StoreKind, TenantRecord } from "./foundation";
import { assertId, validateEntitlement, validateMembership, validateProgram } from "./validation";

interface PersistedState {
  schema: "sandman.commercial.local-store.v1";
  organizations: Organization[];
  academies: TenantRecord[]; locations: TenantRecord[]; programs: TenantRecord[];
  memberships: TenantRecord[]; entitlements: TenantRecord[]; audits: AuditEvent[];
}

/**
 * Durable local reference adapter for isolated development and restart tests.
 * It atomically replaces one mode-0600 JSON file and never connects to Firebase.
 * This single-process adapter is not a production database or concurrency boundary.
 */
export class PersistentJsonCommercialStore extends InMemoryCommercialStore {
  readonly filePath: string;
  constructor(filePath: string) {
    super();
    this.filePath = resolve(filePath);
    if (!existsSync(dirname(this.filePath))) throw new Error("PERSISTENCE_DIRECTORY_NOT_FOUND");
    if (existsSync(this.filePath)) this.load();
  }
  private load(): void {
    const state = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedState;
    if (state.schema !== "sandman.commercial.local-store.v1") throw new Error("INVALID_PERSISTENCE_SCHEMA");
    if (![state.organizations, state.academies, state.locations, state.programs, state.memberships, state.entitlements, state.audits].every(Array.isArray)) throw new Error("INVALID_PERSISTENCE_SHAPE");
    for (const record of state.organizations) { assertId(record.id); if (!record.displayName?.trim() || !["active","suspended","archived"].includes(record.state)) throw new Error("INVALID_PERSISTED_ORGANIZATION"); super.createOrganization(record); }
    for (const record of state.academies as TenantRecord[]) { assertId(record.id); assertId(record.organizationId,"organizationId"); if (!this.getOrganization(record.organizationId)) throw new Error("INVALID_PERSISTED_TENANT_REFERENCE"); super.put("academies",record); }
    for (const record of state.locations as TenantRecord[]) { assertId(record.id); const value = record as import("./contracts").Location; if (!this.get<import("./contracts").Academy>("academies",value.organizationId,value.academyId)) throw new Error("INVALID_PERSISTED_ACADEMY_REFERENCE"); super.put("locations",record); }
    for (const record of state.programs as TenantRecord[]) { validateProgram(record as import("./contracts").Program); super.put("programs",record); }
    for (const record of state.memberships as TenantRecord[]) { validateMembership(record as import("./contracts").Membership); super.put("memberships",record); }
    for (const record of state.entitlements as TenantRecord[]) { validateEntitlement(record as import("./contracts").Entitlement); super.put("entitlements",record); }
    this.audits = state.audits.map(event => structuredClone(event));
    this.sequence = this.audits.reduce((max, event) => Math.max(max, Number(event.id.replace(/^audit-/, "")) || 0), 0);
  }
  private flush(): void {
    const state: PersistedState = {
      schema: "sandman.commercial.local-store.v1",
      organizations: [...this.organizations.values()],
      academies: [...this.academies.values()], locations: [...this.locations.values()], programs: [...this.programs.values()],
      memberships: [...this.memberships.values()], entitlements: [...this.entitlements.values()], audits: this.audits
    };
    const temporary = `${this.filePath}.${globalThis.crypto.randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporary, this.filePath);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  override createOrganization(record: Organization): void { super.createOrganization(record); this.flush(); }
  override updateOrganization(record: Organization): void { super.updateOrganization(record); this.flush(); }
  override put(kind: StoreKind, record: TenantRecord, replace = false): void { super.put(kind, record, replace); this.flush(); }
  override audit(identity: VerifiedIdentity, action: string, resourceType: string, resourceId: string, outcome: AuditEvent["outcome"], reason?: string): void {
    super.audit(identity, action, resourceType, resourceId, outcome, reason); this.flush();
  }
}
