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

  async getById(workspaceId: string, id: string) {
    return this.repo.getById(workspaceId, id);
  }

  async startRefund(workspaceId: string, id: string) {
    const order = await this.repo.getById(workspaceId, id);
    if (!order) return null;
    return this.repo.markRefundPending(workspaceId, id);
  }
}
