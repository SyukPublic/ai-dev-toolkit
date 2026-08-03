### Contents of docs/plans/2026-08-invoice-export.md

```markdown
# Invoice export — implementation plan

Execution mode: multi-agent

## Phases

### Phase 1 — contracts (parallel-safe)
Disjoint scope: `packages/shared/`

### Phase 2 — service and route (depends on: Phase 1)
Disjoint scope: `server/src/modules/invoices/`

## Tasks

- [ ] T1 Add the invoice export query schema to `@acme/shared`
- [ ] T2 Add `InvoicesService.exportCsv`
- [ ] T3 Add `GET /invoices/export`

## Open questions

- BLOCKING: should the export include voided invoices? Finance has not decided,
  and the column set differs depending on the answer.
- Should we paginate at 10k rows or stream? Leaning stream.
```

### Output of `git status --short` in the project root

```
 M server/src/modules/orders/service.ts
 M client/src/features/orders/OrderExport.tsx
?? server/src/modules/orders/export.ts
```
