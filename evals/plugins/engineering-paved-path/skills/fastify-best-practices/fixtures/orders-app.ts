// server/src/plugins/db.ts
import fp from 'fastify-plugin';
import { createPool } from './pool.js';

// Correct as written: wrapped in fp(), so the decorator reaches the parent context.
export default fp(async function dbPlugin(fastify, opts) {
  const pool = await createPool(opts.connectionString);
  fastify.decorate('db', pool);
  fastify.addHook('onClose', async () => pool.end());
});

// server/src/plugins/audit.ts
import { writeAudit } from '../lib/audit.js';

export default async function auditPlugin(fastify) {
  fastify.decorate('audit', (event) => writeAudit(fastify.db, event));
}

// server/src/modules/orders/routes.ts
export default async function orderRoutes(fastify) {
  fastify.post('/orders', async (request, reply) => {
    const body = request.body;

    if (!body.customerId || typeof body.customerId !== 'string') {
      return reply.code(400).send({ error: 'customerId is required' });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return reply.code(400).send({ error: 'items must be a non-empty array' });
    }
    if (body.currency && !['USD', 'EUR'].includes(body.currency)) {
      return reply.code(400).send({ error: 'unsupported currency' });
    }

    const order = await fastify.db.insertOrder(body);

    // Records who placed the order.
    fastify.audit({ type: 'order.created', orderId: order.id });

    return order;
  });

  fastify.get('/orders/:id', async (request, reply) => {
    const order = await fastify.db.findOrder(request.params.id);
    if (!order) return reply.code(404).send({ error: 'not found' });
    return order;
  });
}

// server/src/app.ts
import Fastify from 'fastify';
import dbPlugin from './plugins/db.js';
import auditPlugin from './plugins/audit.js';
import orderRoutes from './modules/orders/routes.js';

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(dbPlugin, { connectionString: process.env.DATABASE_URL });
  app.register(auditPlugin);
  app.register(orderRoutes);
  return app;
}

// server/test/orders.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildApp } from '../src/app.js';

test('creates an order', async () => {
  const app = buildApp();
  await app.ready(); // correct as written
  await app.listen({ port: 4321 });

  const res = await fetch('http://localhost:4321/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customerId: 'c1', items: [{ sku: 'a', qty: 1 }] }),
  });

  assert.equal(res.status, 200);
  await app.close();
});
