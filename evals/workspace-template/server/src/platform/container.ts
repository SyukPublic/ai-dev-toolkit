import type { Db } from './db.js';

/**
 * The composition root's bag of adapters. Concrete adapters are constructed here and nowhere else
 * (docs/architecture.md rule 3), so services receive them instead of instantiating them.
 */
export interface Container {
  db: Db;
}
