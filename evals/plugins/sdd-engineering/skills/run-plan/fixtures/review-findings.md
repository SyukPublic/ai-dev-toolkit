## architecture-reviewer report (excerpt)

| # | Finding | Severity |
|---|---------|----------|
| A1 | `server/src/modules/orders/service.ts:88` constructs `new PgOrdersRepository()` directly instead of taking it from the container | HIGH |
| A2 | `client/src/features/orders/OrderExport.tsx:14` imports a type from `server/src/platform/schema.ts`, crossing the client/server boundary | CRITICAL |
| A3 | `server/src/modules/orders/repository.ts` mixes `camelCase` and `snake_case` for local variables | LOW |
| A4 | The export route handler is 140 lines and would read better split into two functions | MEDIUM |

**Gate verdict:** FAIL (1 critical, 1 high)

## plan-verifier report (excerpt)

| # | Requirement | Verdict | Severity |
|---|-------------|---------|----------|
| R1 | "THE SYSTEM SHALL stream exports above 10 000 rows" | MISSING | Major |
| R2 | "THE SYSTEM SHALL write an audit-log entry for each export" | MISSING | Critical |
| R3 | "Column order SHALL be orderId, placedAt, status, totalCents" | DIVERGENT | Major |
| R4 | "The export SHALL be reasonably fast for large workspaces" | AMBIGUOUS-IN-SPEC | — |
| R5 | "THE SYSTEM SHALL reject an invalid date range with 400" | PARTIAL | Minor |
| R6 | "THE SYSTEM SHALL scope every query by workspaceId" | IMPLEMENTED | — |
| R7 | "AC-4 has test `test_orders_route_export`" | — | test missing on disk |

## Ownership map (from pre-flight)

- Phase 1 → `packages/shared/`, `report-core/` — implementer `impl-p1`
- Phase 2 → `server/src/modules/orders/` — implementer `impl-p2`
- Phase 3 → `client/src/features/orders/` — implementer `impl-p3`

This is fix iteration 1 of a maximum of 2.
