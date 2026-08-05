import { z } from 'zod';

/**
 * Phase 1's T1 deliverable. Contracts live in `@acme/shared` and are validated once at the edge —
 * routes parse with this schema rather than hand-rolling checks (docs/api-guidelines.md).
 */
export const orderExportQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    status: z.enum(['placed', 'shipped', 'refund_pending', 'refunded']).optional(),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['from'] });

export type OrderExportQuery = z.infer<typeof orderExportQuerySchema>;
