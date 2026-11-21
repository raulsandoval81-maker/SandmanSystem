# Commercial Sprint 7 verification

## Migration manifest

| Migration | SHA-256 |
|---|---|
| `0001_commercial_core.sql` | `0d683cf04df3b94c9cd21e33a91e6db772f9d02fef03aa541b98e4102fea3a01` |
| `0002_application_persistence.sql` | `32d60e61c8e2fbf5b37edb991ddb1fe5b2de76fb7753740c37a59d3798faaee0` |
| `0003_mutable_record_delete.sql` | `9ae974183b864f1edea1dd751520dace697ad59a38ef8b4f17f2ac9a3efdcca4` |

The migration runner records and verifies these checksums in
`commercial_schema_migrations`. A changed migration fails with
`MIGRATION_CHECKSUM_MISMATCH`; an unchanged rerun returns `already_applied`.

## Development acceptance environment

- Railway project: `SandmanCommercial` (`73965866-ef13-4865-8c70-a298c3dc365b`)
- Environment: `development` (`defd3558-ac20-4812-bfd0-3fe11e40a368`)
- PostgreSQL service: `Postgres` (`1c356b4e-fa41-42a2-939d-d81d60922c36`)
- Acceptance runner: `commercial-acceptance-runner` (`500aae45-d13a-4778-ae21-80b73ede5800`)
- Database connection: Railway `${{Postgres.DATABASE_URL}}` reference only
- Public TCP proxies: none

The application rejects database URLs whose host is not localhost or a
`.railway.internal` private-network address.

## Verified results

- Local Commercial suite: 116 passed, 0 failed.
- Production-dependency isolation check: passed.
- Real PostgreSQL acceptance deployment `810ff301-ccf3-4eb5-80c2-e7532b9fb685`: 5 passed, 0 failed.
- Controlled PostgreSQL restart followed by deployment `337e8dfa-7594-419b-ba5f-13f904f62839`: 5 passed, 0 failed.
- Final acceptance deployment `d09f74f0-bb52-45e5-a5e5-c0ae7b073e0d`: 6 passed, 0 failed, including synthetic logical restore.
- RLS runtime role is `NOSUPERUSER` and `NOBYPASSRLS`.
- Cross-tenant reads return no rows and cross-tenant writes fail.
- Tenant operations use dedicated leased connections and transaction-local role and tenant context.
- Synthetic two-tenant XP/recovery workflows, rollback, concurrency, replay prevention, and application restart durability passed.

## Backup and recovery procedure

1. Use Railway-managed backups for infrastructure-level recovery; do not copy
   database credentials or expose a TCP proxy.
2. Before an application-level repair, export the affected synthetic tenant's
   `commercial_application_records` inside a tenant-scoped, read-only
   transaction and hash the artifact.
3. Restore only into the same organization under `commercial_runtime`; immutable
   XP, promotion, recovery-evidence, recovery-penalty, transfer, and audit rows
   must use insert-only semantics and reject divergent conflicts.
4. Rerun `npm run test:postgres` and verify migration checksums, RLS, replay
   protection, and aggregate reconstruction before returning the environment to use.
5. Never rehearse destructive recovery with customer data.

The real-database acceptance suite safely commits deletion of one mutable
synthetic progression-cycle record, restores it from an in-memory logical export, and
reconstructs the tenant aggregate to verify recovery. Immutable histories are
never deleted during this exercise.
