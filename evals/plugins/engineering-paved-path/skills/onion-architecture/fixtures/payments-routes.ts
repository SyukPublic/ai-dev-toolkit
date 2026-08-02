import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { PaymentsRepository } from './repository.js';

/**
 * Payment-provider webhook receiver. Keeps local order payment state in sync
 * with the provider without waiting for the next reconciliation poll.
 *   POST /webhooks/payments → payment events update the local order status
 */

export default async function paymentsWebhookRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const repo = new PaymentsRepository(app.container.db);

  app.post('/webhooks/payments', async (req, reply) => {
    const payload = req.body as {
      event?: string;
      payment?: { order_number?: number; captured?: boolean; description?: string };
      store?: { slug?: string };
    };

    if (typeof payload.event !== 'string' || payload.event.length === 0) {
      reply.status(400);
      return { error: 'missing event' };
    }
    if (!payload.payment || typeof payload.payment.order_number !== 'number') {
      reply.status(400);
      return { error: 'missing payment' };
    }

    let nextStatus: string | undefined;
    if (payload.event === 'authorized' || payload.event === 'reauthorized') {
      nextStatus = 'awaiting_capture';
    } else if (payload.event === 'settled') {
      nextStatus = payload.payment.captured ? 'paid' : 'canceled';
    } else if (payload.event === 'retried') {
      nextStatus = 'awaiting_capture';
    }
    if (!nextStatus) {
      return { ok: true, ignored: payload.event };
    }

    const [storeRow] = await app.container.db
      .select()
      .from(t.stores)
      .where(eq(t.stores.slug, payload.store?.slug ?? ''));
    if (!storeRow) {
      return { ok: true, ignored: 'unknown store' };
    }

    await app.container.db
      .update(t.orders)
      .set({ paymentStatus: nextStatus })
      .where(
        and(
          eq(t.orders.storeId, storeRow.id),
          eq(t.orders.number, payload.payment.order_number),
        ),
      );

    await repo.recordDelivery({
      storeId: storeRow.id,
      event: 'payment',
      action: payload.event,
      orderNumber: payload.payment.order_number,
    });

    return { ok: true, status: nextStatus };
  });
}
