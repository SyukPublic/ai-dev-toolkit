# SPEC-2026-07-22-order-export

Status: approved

CSV export of a workspace's orders, exposed as one authenticated endpoint.

## Acceptance criteria

- **AC-1** — WHEN a client requests the export with a `from` date later than the `to` date, THE SYSTEM SHALL reject the request with HTTP 400 before any query runs.
- **AC-2** — THE SYSTEM SHALL scope every export query by `workspaceId`, so a caller can never receive another workspace's orders.
- **AC-3** — WHEN a field value contains a comma, a double quote, or a newline, THE SYSTEM SHALL quote and escape it per RFC 4180.
- **AC-4** — THE SYSTEM SHALL return the response with `Content-Type: text/csv`.
- **AC-5** — WHEN the export contains more than 10 000 rows, THE SYSTEM SHALL stream the response rather than buffering it in memory.
- **AC-6** — THE SYSTEM SHALL write an audit-log entry recording who exported what and when.
- **AC-7** — THE SYSTEM SHALL include exactly these columns, in this order: `orderId`, `placedAt`, `status`, `totalCents`.
