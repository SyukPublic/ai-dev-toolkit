# SPEC-014 — Invoice reminder digest

**Status:** approved
**Owner:** billing

## Problem

Workspace admins currently learn about overdue invoices only by opening the billing
page. They want a periodic digest instead.

## User stories

- **US-1** As a workspace admin I want a scheduled digest of overdue invoices so I can
  chase them without opening the app.
- **US-2** As a workspace admin I want to choose which currency the digest totals are
  shown in.
- **US-3** As a workspace admin I want to unsubscribe from the digest without losing
  access to the billing page.

## Acceptance criteria

- **AC-1** Given a workspace with at least one invoice past its due date, when the daily
  digest runs at 07:00 in the workspace's timezone, then the admin receives exactly one
  message listing each overdue invoice with its number, amount and days overdue.
- **AC-2** Given a workspace with no overdue invoices, when the digest runs, then no
  message is sent and the run is recorded as skipped.
- **AC-3** Given a workspace whose base currency is set, when the digest runs, then every
  amount in the message is converted to that base currency and the conversion rate used is
  recorded on the run.
- **AC-4** Given the currency conversion provider returns an error, when the digest runs,
  then the digest is sent with each invoice in its original currency and the message states
  that conversion was unavailable.
- **AC-5** Given an admin has already received a digest for a given day, when the digest
  runs again the same day, then no second message is sent.
- **AC-6** Given the digest message is generated, then it renders correctly as both HTML
  and plain text.
- **AC-7** Given an admin has unsubscribed from the digest, when the digest runs, then no
  message is sent to that admin and their access to the billing page is unaffected.

## Non-functional

- A digest run for a workspace with 500 overdue invoices completes within 30 seconds.

## Out of scope

- Editing invoices from the digest.
- Any change to the existing billing page.
