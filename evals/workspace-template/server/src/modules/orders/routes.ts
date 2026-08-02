import type { FastifyInstance } from 'fastify';
import { OrdersService } from './service.js';

/**
 * Orders HTTP surface.
 *   GET  /orders            → list orders for the workspace
 *   GET  /orders/:id        → one order with line items
 *   POST /orders/:id/refunds → start a refund
 * (No export endpoint yet.)
 */
export default async function ordersRoutes(app: FastifyInstance) {
  const service = new OrdersService(app.container);

  app.get('/orders', async (req) => service.list(req.workspaceId));
  app.get('/orders/:id', async (req) => service.getById(req.workspaceId, (req.params as { id: string }).id));
  app.post('/orders/:id/refunds', async (req) =>
    service.startRefund(req.workspaceId, (req.params as { id: string }).id),
  );
}
