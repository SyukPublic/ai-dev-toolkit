// packages/schema/src/tree.ts
//
// tsc fails on this file with:
//   error TS2589: Type instantiation is excessively deep and possibly infinite.

export type Nested<T> = T | Nested<T>[];

export type WithMeta<T> = T & { id: string } & { createdAt: Date } & { version: number };

export type FieldName =
  | 'field_001' | 'field_002' | 'field_003' | 'field_004' | 'field_005'
  | 'field_006' | 'field_007' | 'field_008' | 'field_009' | 'field_010';
// … the real file continues to 'field_240' — 240 members in total.

export type FieldMap = {
  [K in FieldName]: WithMeta<Nested<string>>;
};

export function walk(node: Nested<string>): string[] {
  return Array.isArray(node) ? node.flatMap(walk) : [node];
}
