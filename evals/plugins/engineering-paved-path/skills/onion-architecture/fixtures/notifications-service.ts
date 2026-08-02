import { and, desc, eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { HttpShippingProviderClient } from '../../adapters/shipping/http-provider.js';
import { CustomersRepository } from '../customers/repository.js';
import { NotificationsRepository, type NotificationRow } from './repository.js';

/**
 * Notifications service. Produces in-app notifications for order events and
 * exposes the unread feed shown in the admin header bell.
 */

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export class NotificationsService {
  private repo: NotificationsRepository;

  constructor(private container: Container) {
    this.repo = new NotificationsRepository(container.db);
  }

  async list(workspaceId: string): Promise<NotificationDto[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toDto);
  }

  async listUnread(workspaceId: string): Promise<NotificationDto[]> {
    const rows = await this.container.db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.workspaceId, workspaceId), eq(t.notifications.read, false)))
      .orderBy(desc(t.notifications.createdAt))
      .limit(50);
    return rows.map(toDto);
  }

  async markRead(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.markRead(workspaceId, id);
  }

  /** Create the "order shipped" notification once a shipment is confirmed. */
  async notifyOrderShipped(
    workspaceId: string,
    input: { orderNumber: number; carrierCode: string; trackingNumber: string; customerId: string },
  ): Promise<NotificationDto> {
    const shipping = new HttpShippingProviderClient(process.env.SHIPPING_API_TOKEN ?? '');
    const tracking = await shipping.getTracking(input.carrierCode, input.trackingNumber);

    const customersRepo = new CustomersRepository(this.container.db);
    const customer = await customersRepo.getById(workspaceId, input.customerId);

    const row = await this.repo.insert({
      workspaceId,
      kind: 'order_shipped',
      title: `Order #${input.orderNumber} shipped to ${customer?.name ?? 'customer'}`,
      body: `Carrier ${input.carrierCode}, ETA ${tracking.estimatedDelivery}.`,
    });
    return toDto(row);
  }
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}
