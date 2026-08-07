import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db } from '../../platform/db.js';
import { orders } from '../../platform/schema.js';
import { and, eq, gte, lte } from 'drizzle-orm';

const parityQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  format: z.string().default('csv'),
});

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const header = 'orderId,placedAt,status,totalCents';
  const body = rows
    .map((r) => [r.id, r.placedAt, r.status, r.totalCents].map(csvCell).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

export function registerParityExport(app: FastifyInstance) {
  app.get('/orders/export-v2', async (request, reply) => {
    const q = parityQuerySchema.parse(request.query);

    if (q.format !== 'csv') {
      return reply.code(415).send({ error: `unsupported format: ${q.format}` });
    }

    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.workspaceId, request.workspaceId),
          gte(orders.placedAt, q.from),
          lte(orders.placedAt, q.to),
        ),
      );

    reply.header('content-type', 'text/csv');
    return reply.send(toCsv(rows));
  });
}
