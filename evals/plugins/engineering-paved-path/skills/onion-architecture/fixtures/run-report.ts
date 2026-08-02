import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Order } from '@acme/shared';
import { ExternalServiceError } from '../../../server/src/platform/errors.js';

/**
 * Weekly report: condenses the last N days of completed orders into a short
 * markdown summary for the admin dashboard.
 */

interface OrderHistoryEntry {
  storeSlug: string;
  orderNumber: number;
  customerName: string;
  completedAt: string;
  order: Order;
}

const REPORT_PROMPT =
  'You are summarizing a week of order activity. ' +
  'Group by store, call out the highest-value orders, and keep it under 200 words.';

export async function summarizeRecentOrders(days: number, model: string): Promise<string> {
  const historyPath = join(homedir(), '.acme-shop', 'order-history.json');
  const entries: OrderHistoryEntry[] = JSON.parse(await readFile(historyPath, 'utf8'));

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => new Date(e.completedAt).getTime() >= cutoff);
  if (recent.length === 0) return 'No completed orders in this period.';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: REPORT_PROMPT },
        { role: 'user', content: formatReportInput(recent) },
      ],
    }),
  });
  if (!res.ok) {
    throw new ExternalServiceError(`Report summarization failed: ${res.status}`);
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message.content ?? '';
}

/** Renders history entries into the prompt's user block. */
export function formatReportInput(entries: OrderHistoryEntry[]): string {
  return entries
    .map(
      (e) =>
        `- ${e.storeSlug}#${e.orderNumber} for ${e.customerName}: total ${e.order.total}, status ${e.order.status}`,
    )
    .join('\n');
}
