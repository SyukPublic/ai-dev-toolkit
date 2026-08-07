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

  async markRefundPending(workspaceId: string, id: string) {
    const [row] = await this.db
      .update(orders)
      .set({ status: 'refund_pending' })
      .where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
      .returning();
    return row ?? null;
  }
}
