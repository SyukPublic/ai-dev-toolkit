### server/src/modules/invoices/invoice.repository.ts

```ts
import { eq, and, gte } from "drizzle-orm";
import type { Db } from "../../platform/db.js";
import { invoices } from "../../platform/schema.js";

/** Injected port — the service depends on this interface, not on Drizzle. */
export interface InvoiceRepository {
  listOverdue(workspaceId: string, asOf: Date): Promise<Invoice[]>;
  markReminded(invoiceId: string, at: Date): Promise<void>;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  number: string;
  amountCents: number;
  currency: string;
  dueAt: Date;
  remindedAt: Date | null;
}

export function createInvoiceRepository(db: Db): InvoiceRepository {
  return {
    async listOverdue(workspaceId, asOf) {
      return db
        .select()
        .from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), gte(asOf, invoices.dueAt)));
    },
    async markReminded(invoiceId, at) {
      await db.update(invoices).set({ remindedAt: at }).where(eq(invoices.id, invoiceId));
    },
  };
}
```

### server/src/modules/invoices/invoice.service.ts

```ts
import type { InvoiceRepository, Invoice } from "./invoice.repository.js";
import type { ExchangeRateClient } from "../../adapters/exchange-rate.client.js";

// Read once at module load, so a test cannot vary it without reloading the module.
const INVOICE_PREFIX = process.env.INVOICE_PREFIX ?? "INV";

export interface OverdueSummary {
  reference: string;
  totalBaseCents: number;
  count: number;
}

export function createInvoiceService(repo: InvoiceRepository, rates: ExchangeRateClient) {
  return {
    /** Sums overdue invoices in the workspace's base currency and marks them reminded. */
    async summariseOverdue(workspaceId: string, asOf: Date, base: string): Promise<OverdueSummary> {
      const overdue: Invoice[] = await repo.listOverdue(workspaceId, asOf);
      let totalBaseCents = 0;
      for (const inv of overdue) {
        const rate = await rates.getRate(inv.currency, base);
        totalBaseCents += Math.round(inv.amountCents * rate);
        await repo.markReminded(inv.id, asOf);
      }
      return { reference: `${INVOICE_PREFIX}-${workspaceId.slice(0, 6)}`, totalBaseCents, count: overdue.length };
    },
  };
}
```

### server/src/adapters/exchange-rate.client.ts

```ts
export interface ExchangeRateClient {
  getRate(from: string, to: string): Promise<number>;
}

/** Talks to a third-party FX API over the network. */
export function createExchangeRateClient(baseUrl: string): ExchangeRateClient {
  return {
    async getRate(from, to) {
      const res = await fetch(`${baseUrl}/rates?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`rate lookup failed: ${res.status}`);
      const body = (await res.json()) as { rate: number };
      return body.rate;
    },
  };
}
```

### server/src/modules/invoices/invoice.routes.ts

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  base: z.string().length(3),
});

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/invoices/overdue", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const summary = await app.invoiceService.summariseOverdue(
      parsed.data.workspaceId,
      new Date(),
      parsed.data.base,
    );
    return reply.send(summary);
  });
}
```

### server/test/helpers/build-app.ts  *(already exists)*

```ts
import { build } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

/** Builds the real app with the real DI container; pass overrides to swap adapters. */
export async function buildTestApp(overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const app = await build({ logger: false, ...overrides });
  await app.ready();
  return app;
}
```

### server/test/helpers/fake-exchange-rate.ts  *(already exists)*

```ts
import type { ExchangeRateClient } from "../../src/adapters/exchange-rate.client.js";

/** In-memory fake for the FX adapter — no network. */
export function fakeExchangeRate(table: Record<string, number> = { "EUR:USD": 1.1 }): ExchangeRateClient {
  return { async getRate(from, to) { return table[`${from}:${to}`] ?? 1 } };
}
```

### server/test/helpers/db.ts  *(already exists)*

```ts
/** Runs fn inside a transaction that is always rolled back. */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> { /* ... */ }
```
