# SPEC-014 — Invoice reminder digest

**Status:** draft
**Owner:** billing

## Problem

Workspace admins currently learn about overdue invoices only by opening the billing
page. They want a periodic digest instead.

## User stories

- **US-1** As a workspace admin I want a scheduled digest of overdue invoices so I can
  chase them without opening the app.
- **US-2** As a workspace admin I want to choose which currency the digest totals are
  shown in.

## Acceptance criteria

- **AC-1** Given a workspace with at least one invoice past its due date, when the
  digest runs, then the admin receives one message listing each overdue invoice with
  its number, amount and days overdue.
- **AC-2** Given a workspace with no overdue invoices, when the digest runs, then no
  message is sent.
- **AC-3** The digest totals are converted to the workspace's configured base currency.
- **AC-4** [NEEDS CLARIFICATION] How often does the digest run, and is the schedule
  per-workspace or global?
- **AC-5** Given the currency conversion provider is unavailable, when the digest runs,
  then [NEEDS CLARIFICATION] — do we send the digest with original currencies, skip the
  run, or retry?

## Out of scope

- Editing invoices from the digest.
- Any change to the existing billing page.
