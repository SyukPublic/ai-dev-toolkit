# Order export — implementation plan (excerpt)

Execution mode: multi-agent

## Phase 2 — export endpoint (depends on: Phase 1)

**Disjoint scope:** `server/src/modules/orders/` — this phase owns these files and no others.
Phase 1 (`packages/shared/`, `report-core/`) is complete and owned by another implementer.

### Tasks

- [ ] T4 Add `OrdersRepository.listForExport(workspaceId, range)` returning only the export columns → AC-4 → test_orders_repository_list_for_export
- [ ] T5 Add `OrdersService.exportCsv(workspaceId, query)` composing the repository with the CSV formatter → AC-5 → test_orders_service_export_csv
- [ ] T6 Add `GET /orders/export` returning `text/csv`, workspace-scoped → AC-6 → test_orders_route_export
- [ ] T7 Record the export timestamp on the workspace so the admin UI can show "last exported" → AC-7 → test_orders_service_records_export_timestamp

### Acceptance criteria

- AC-4 — the repository query is scoped by `workspaceId` and selects only export columns.
- AC-5 — the service returns formatted CSV and never reaches for the database directly.
- AC-6 — the endpoint requires auth, returns `text/csv`, rejects a malformed query with 400.
- AC-7 — after a successful export, the workspace's last-export timestamp reflects that run.

### Shared scaffold (context pack)

CSV escaping is already solved — reuse `csvEscape` from `server/src/platform/csv.ts:8`.
Do not write a second escaping helper.
