import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db } from '../../platform/db.js';
import { orders } from '../../platform/schema.js';
import { and, eq, gte, lte } from 'drizzle-orm';

const exportQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to' });

/** Wraps a value for CSV output. */
function csvCell(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',')) return `"${s}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const header = 'orderId,status,placedAt,totalCents';
  const body = rows
    .map((r) => [r.orderId, r.status, r.placedAt, r.totalCents].map(csvCell).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

function toJson(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify({ orders: rows });
}

export async function registerOrderExport(app: FastifyInstance) {
  app.get('/orders/export', { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const { from, to } = parsed.data;
    const workspaceId = request.user.workspaceId;

    const rows = await db
      .select({
        orderId: orders.id,
        placedAt: orders.placedAt,
        status: orders.status,
        totalCents: orders.totalCents,
      })
      .from(orders)
      .where(and(eq(orders.workspaceId, workspaceId), gte(orders.placedAt, from), lte(orders.placedAt, to)));

    const format = (request.query as { format?: string }).format;
    if (format === 'json') {
      return reply.header('content-type', 'application/json').send(toJson(rows));
    }

    return reply.header('content-type', 'application/octet-stream').send(toCsv(rows));
  });
}
