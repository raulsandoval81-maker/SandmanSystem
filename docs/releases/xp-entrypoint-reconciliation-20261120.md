# XP entrypoint reconciliation

Production remains NO-GO pending Management XP provenance and independent rollback verification.

| Entry point | Authority |
| --- | --- |
| Admin | Existing client-side correction authority and Firestore rules. The athlete update and audit log share one transaction. Signed amounts, accountability, transition metadata, and zero-floor behavior remain in place. |
| Management | Existing server-side callable, active staff and location checks, discipline-specific operational XP, and atomic transaction for balance, audit logs, and receipt. Positive corrections require an explicit lifetime classification. Earned stripes are preserved. |
| Coach and System | Existing authoritative award, progression, decay, and recovery code. Management decay is deferred. |

A correction for new earned XP increases lifetime XP by the accepted, capped amount. A restoration of already-counted XP leaves lifetime totals intact. The dashboard reuses the adjustment ID for the same pending payload within the current page, including a retry after an ambiguous response.

The Admin transaction remains a separate legacy entry point under the existing Admin rules. This change does not migrate it to the Management callable or give Management deduction authority.

The existing protected staging workflow has no reviewed Management XP target for this change. A scoped staging deployment and fictional dashboard verification require an exact candidate, captured rollback evidence, and the existing staging approvals. Production also requires verified source-to-serving-image provenance and independently recoverable rollback bytes.
