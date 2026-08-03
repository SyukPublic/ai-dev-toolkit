### server/src/platform/csv.ts

```ts
/** RFC 4180 CSV escaping. Used by the reporting exports. */
const NEEDS_QUOTING = /[",\n\r]/;

export function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}
```

### server/src/platform/schema.ts

```ts
import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  status: text('status').notNull(),
  placedAt: timestamp('placed_at').notNull(),
  totalCents: integer('total_cents').notNull(),
});
```

### server/src/modules/orders/repository.ts

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../platform/db.js';
import { orders } from '../../platform/schema.js';

export class OrdersRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string) {
    return this.db.select().from(orders).where(eq(orders.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)));
    return row ?? null;
  }
}
```

### server/src/modules/orders/service.ts

```ts
import type { Container } from '../../platform/container.js';
import { OrdersRepository } from './repository.js';

/** Orders business logic. Queries live in OrdersRepository; this class orchestrates. */
export class OrdersService {
  private repo: OrdersRepository;

  constructor(private container: Container) {
    this.repo = new OrdersRepository(container.db);
  }

  async list(workspaceId: string) {
    return this.repo.list(workspaceId);
  }
}
```

### server/src/modules/notifications/mailer.ts

```ts
import { transport } from '../../platform/smtp.js';

export async function sendRefundEmail(to: string, orderId: string) {
  try {
    transport.send({ to, subject: `Refund for ${orderId}`, body: 'Your refund is on the way.' });
  } catch {
    // ignore
  }
}
```
