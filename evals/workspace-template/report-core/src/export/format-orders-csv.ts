/**
 * Phase 1's deliverable. Pure by contract: same input, same output, no I/O of any kind
 * (docs/architecture.md — report-core does no I/O except through the injected LLM provider).
 * RFC 4180 escaping lives here, so callers format rather than escape.
 */
const NEEDS_QUOTING = /[",\n\r]/;

const escapeCell = (value: unknown): string => {
  const s = String(value ?? '');
  return NEEDS_QUOTING.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function formatOrdersCsv(orders: readonly Record<string, unknown>[], columns: readonly string[]): string {
  const header = columns.map(escapeCell).join(',');
  const rows = orders.map((order) => columns.map((column) => escapeCell(order[column])).join(','));
  return [header, ...rows].join('\n');
}
