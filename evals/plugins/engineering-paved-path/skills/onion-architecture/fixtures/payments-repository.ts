import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Payments data-access. Owns the `webhook_deliveries` audit table — one row per
 * processed provider delivery, used by the admin page to show sync activity.
 */

export interface DeliveryRow {
  id: string;
  storeId: string;
  event: string;
  action: string;
  orderNumber: number;
  receivedAt: Date;
}

export interface InsertDelivery {
  storeId: string;
  event: string;
  action: string;
  orderNumber: number;
}

export class PaymentsRepository {
  constructor(private db: Db) {}

  async recordDelivery(values: InsertDelivery): Promise<DeliveryRow> {
    const [row] = await this.db.insert(t.webhookDeliveries).values(values).returning();
    return row!;
  }

  /** Latest deliveries for a store, newest first (admin activity feed). */
  async recentDeliveries(storeId: string, limit: number): Promise<DeliveryRow[]> {
    return this.db
      .select()
      .from(t.webhookDeliveries)
      .where(eq(t.webhookDeliveries.storeId, storeId))
      .orderBy(desc(t.webhookDeliveries.receivedAt))
      .limit(limit);
  }
}
