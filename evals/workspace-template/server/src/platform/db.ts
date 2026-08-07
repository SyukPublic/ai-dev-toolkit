import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema.js';

/**
 * The Drizzle handle. Repositories take this; nothing else in the codebase may touch it directly
 * (docs/architecture.md rule 2 — database access lives in repositories only).
 */
export type Db = NodePgDatabase<typeof schema>;
