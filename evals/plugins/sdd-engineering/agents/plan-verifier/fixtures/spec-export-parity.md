# SPEC-2026-08-01-export-parity

Status: approved

A replacement CSV exporter that must retire the legacy command-line tool without changing what
downstream consumers receive.

## Acceptance criteria

- **AC-1** — WHEN a client requests the export with a `format` other than `csv`, THE SYSTEM SHALL reject the request with HTTP 415 before any query runs.
- **AC-2** — FOR the same order set, THE SYSTEM SHALL produce a file byte-identical to the one produced by the legacy exporter `tools/legacy-export`, which is maintained in a separate repository and is not part of this codebase.
- **AC-3** — THE SYSTEM SHALL include every order whose `placedAt` falls inside the requested range. Cancelled orders SHALL NOT appear in the export.
