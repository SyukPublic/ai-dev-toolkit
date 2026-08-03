# Order export — implementation plan

Adds CSV export of a workspace's orders: a pure formatter in `report-core/`, a
service method in the orders module, and one authenticated HTTP endpoint.

Execution mode: multi-agent

## Context

- Contracts live in `@acme/shared` (Zod). Add the export query schema there, not in the route.
- `report-core/` is the pure reporting engine: no fs, no db, no HTTP. The formatter belongs here.
- `OrdersRepository` owns queries; `OrdersService` orchestrates. Routes stay thin.

## Phases

### Phase 1 — contracts and pure formatter (parallel-safe)

Disjoint scope: `packages/shared/src/orders/`, `report-core/src/export/`

### Phase 2 — service and route (depends on: Phase 1)

Disjoint scope: `server/src/modules/orders/`

## Tasks

- [ ] T1 Add `orderExportQuerySchema` (date range + optional status filter) to `@acme/shared` → AC-1 → test_shared_order_export_schema
- [ ] T2 Add `formatOrdersCsv(orders, columns)` to `report-core/src/export/` as a pure function → AC-2 → test_report_core_format_orders_csv
- [ ] T3 Escape embedded commas, quotes, and newlines per RFC 4180 in the formatter → AC-3 → test_report_core_csv_escaping
- [ ] T4 Add `OrdersRepository.listForExport(workspaceId, range)` returning only export columns → AC-4 → test_orders_repository_list_for_export
- [ ] T5 Add `OrdersService.exportCsv(workspaceId, query)` composing repository + formatter → AC-5 → test_orders_service_export_csv
- [ ] T6 Add `GET /orders/export` returning `text/csv`, workspace-scoped, validated by the shared schema → AC-6 → test_orders_route_export

## Acceptance criteria

- AC-1 — an invalid date range is rejected by the schema before reaching the service.
- AC-2 — the formatter is pure: same input, same output, no I/O of any kind.
- AC-3 — a value containing `,`, `"`, or a newline round-trips through a compliant CSV parser.
- AC-4 — the repository query is scoped by `workspaceId` and selects only export columns.
- AC-5 — the service returns formatted CSV and never reaches for the database directly.
- AC-6 — the endpoint requires auth, returns `text/csv`, and rejects a malformed query with 400.

## Traceability matrix

| Task | Acceptance criterion | Test |
| --- | --- | --- |
| T1 | AC-1 | test_shared_order_export_schema |
| T2 | AC-2 | test_report_core_format_orders_csv |
| T3 | AC-3 | test_report_core_csv_escaping |
| T4 | AC-4 | test_orders_repository_list_for_export |
| T5 | AC-5 | test_orders_service_export_csv |
| T6 | AC-6 | test_orders_route_export |

## Open questions

None blocking. Column ordering follows the existing admin table; revisit only if product asks.
