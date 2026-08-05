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
