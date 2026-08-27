# Workspace audit trail — implementation plan

Records every mutating action on a workspace so admins can answer "who changed
this, and when". A shared event contract, a pure renderer in `report-core/`, the
server-side audit module that writes the events, and an admin read endpoint.

Execution mode: multi-agent

## Context

- Contracts live in `@acme/shared` (Zod). The event schema goes there, not in the module.
- `report-core/` is the pure reporting engine: no fs, no db, no HTTP. The renderer belongs here.
- All DB access lives in repositories; the audit service writes through its own repository.
- Cross-module access goes through the container facade, never by importing another module's
  repository files directly.

## Phases

### Phase 1 — audit event contracts (parallel-safe)

Disjoint scope: `packages/shared/src/audit/`

### Phase 2 — audit trail renderer (parallel-safe)

Disjoint scope: `report-core/src/audit/`

### Phase 3 — server audit module (parallel-safe)

Disjoint scope: `server/src/modules/audit/` — `schema.ts`, `repository.ts`,
`service.ts`, `recorder.ts`, `redaction.ts`, `retention.ts`, `backfill.ts`,
`container-registration.ts`, `routes.ts`

### Phase 4 — admin retrieval endpoint (depends on: Phase 1, Phase 3)

Disjoint scope: `server/src/modules/admin/`

## Tasks

- [ ] T1 Add `auditEventSchema` (actor, action, subject, workspace, occurredAt) to `@acme/shared` → AC-1 → test_shared_audit_event_schema
- [ ] T2 Add `auditQuerySchema` (actor / action / date-range filters, cursor paging) to `@acme/shared` → AC-2 → test_shared_audit_query_schema
- [ ] T3 Add `renderAuditTrail(events, locale)` to `report-core/src/audit/` as a pure function → AC-3 → test_report_core_render_audit_trail
- [ ] T4 Render an empty trail as an explicit "no recorded activity" section rather than an empty string → AC-4 → test_report_core_render_empty_trail
- [ ] T5 Add the `audit_events` table to the audit module's Drizzle schema, workspace-scoped → AC-5 → test_audit_schema_table
- [ ] T6 Add `AuditRepository.append(event)` writing one event row → AC-6 → test_audit_repository_append
- [ ] T7 Add `AuditRepository.list(workspaceId, query)` with cursor paging → AC-7 → test_audit_repository_list
- [ ] T8 Add `AuditService.record(actor, action, subject)` composing the repository → AC-8 → test_audit_service_record
- [ ] T9 Add a `recordMutation` recorder hook other modules call through the container facade → AC-9 → test_audit_recorder_hook
- [ ] T10 Redact configured sensitive fields from the event payload before it is written → AC-10 → test_audit_redaction
- [ ] T11 Enforce the configured retention window when listing and when appending → AC-11 → test_audit_retention_window
- [ ] T12 Add a backfill routine that records one synthetic event per pre-existing order → AC-12 → test_audit_backfill
- [ ] T13 Register the audit repository, service and recorder in the composition root → AC-13 → test_audit_container_registration
- [ ] T14 Add `POST /audit/events` for internal service-to-service recording, workspace-scoped → AC-14 → test_audit_route_record
- [ ] T15 Add `GET /admin/audit` returning a page of events validated by the shared query schema → AC-15 → test_admin_route_audit_list
- [ ] T16 Add `GET /admin/audit.txt` returning the rendered trail as `text/plain` → AC-16 → test_admin_route_audit_rendered
- [ ] T17 Reject an admin audit request from a non-admin caller with 403 → AC-17 → test_admin_route_audit_forbidden

## Acceptance criteria

- AC-1 — an event missing an actor or an action is rejected by the schema before reaching the service.
- AC-2 — an invalid date range or an unknown filter key is rejected by the query schema.
- AC-3 — the renderer is pure: same events in, same text out, no I/O of any kind.
- AC-4 — an empty event list renders a stated "no recorded activity" section.
- AC-5 — the table is scoped by `workspaceId` and indexed by `occurredAt`.
- AC-6 — appending an event writes exactly one row and returns its id.
- AC-7 — listing is scoped by `workspaceId` and pages by cursor, never by offset.
- AC-8 — the service records through its repository and never reaches for the database directly.
- AC-9 — a module calling `recordMutation` reaches the audit service through the container facade.
- AC-10 — a configured sensitive field never appears in a stored event payload.
- AC-11 — events older than the retention window are neither listed nor appended.
- AC-12 — the backfill is idempotent: running it twice records each order once.
- AC-13 — the audit dependencies resolve from the container, not from `new` inside a service.
- AC-14 — the internal record endpoint requires auth and is scoped to the caller's workspace.
- AC-15 — the admin listing returns a page plus a cursor, and rejects a malformed query with 400.
- AC-16 — the rendered endpoint returns `text/plain` produced by the `report-core` renderer.
- AC-17 — a non-admin caller receives 403 and no event data.

## Traceability matrix

| Task | Acceptance criterion | Test |
| --- | --- | --- |
| T1 | AC-1 | test_shared_audit_event_schema |
| T2 | AC-2 | test_shared_audit_query_schema |
| T3 | AC-3 | test_report_core_render_audit_trail |
| T4 | AC-4 | test_report_core_render_empty_trail |
| T5 | AC-5 | test_audit_schema_table |
| T6 | AC-6 | test_audit_repository_append |
| T7 | AC-7 | test_audit_repository_list |
| T8 | AC-8 | test_audit_service_record |
| T9 | AC-9 | test_audit_recorder_hook |
| T10 | AC-10 | test_audit_redaction |
| T11 | AC-11 | test_audit_retention_window |
| T12 | AC-12 | test_audit_backfill |
| T13 | AC-13 | test_audit_container_registration |
| T14 | AC-14 | test_audit_route_record |
| T15 | AC-15 | test_admin_route_audit_list |
| T16 | AC-16 | test_admin_route_audit_rendered |
| T17 | AC-17 | test_admin_route_audit_forbidden |

## Open questions

None blocking. Retention defaults to 400 days, matching the existing reporting
retention; product may revisit the number later without changing the shape.
