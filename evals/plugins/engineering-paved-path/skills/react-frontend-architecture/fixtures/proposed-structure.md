### Proposed layout for the new dashboard app (~40 screens planned)

```
src/
  components/            # every component in the app
    OrderTable.tsx
    OrderFilters.tsx
    InvoicePdfButton.tsx
    Button.tsx
    Card.tsx
  hooks/                 # every hook in the app
    useOrders.ts
    useInvoices.ts
  utils.ts               # 1400 lines, everything shared
  constants.ts           # 900 lines, everything shared
  types.ts
  features/
    orders/
      index.ts           # re-exports every file below
      OrderPage.tsx
      orderHelpers.ts
    invoices/
      index.ts           # re-exports every file below
      InvoicePage.tsx
      components/
        table/
          InvoiceRow.tsx
```

### src/utils.ts (excerpt)

```ts
export function formatCurrency(cents: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function groupBy(rows, key) {
  return rows.reduce((acc, r) => ({ ...acc, [r[key]]: [...(acc[r[key]] ?? []), r] }), {});
}

export async function refreshOrdersCache(workspaceId: string) {
  await fetch(`/api/orders/refresh?workspace=${workspaceId}`, { method: 'POST' });
  localStorage.setItem('orders:lastRefresh', String(Date.now()));
}

export function buildInvoiceLineItems(order: Order) {
  // knows about our discount tiers and tax rules
  return order.items.map((i) => ({ ...i, taxCents: applyTaxRules(i, order.workspace) }));
}
```

### src/features/invoices/InvoicePage.tsx (excerpt)

```tsx
import { OrderTable } from '../../components/OrderTable';
import { orderHelpers } from '../orders';
import { InvoiceRow } from './components/table/InvoiceRow';
import { formatCurrency } from '../../utils';
```

### src/features/invoices/components/table/InvoiceRow.tsx (excerpt)

```tsx
import { formatCurrency } from '../../../../utils';
import { TAX_LABELS } from '../../../../constants';

export function InvoiceRow({ line }) {
  return <td>{TAX_LABELS[line.taxClass]}: {formatCurrency(line.taxCents)}</td>;
}
```

### src/features/orders/OrderPage.tsx (excerpt)

```tsx
import { create } from 'zustand';

// Orders come from GET /api/orders. Mirrored here so any component can read them.
export const useOrderStore = create((set) => ({
  orders: [],
  setOrders: (orders) => set({ orders }),
}));
```
