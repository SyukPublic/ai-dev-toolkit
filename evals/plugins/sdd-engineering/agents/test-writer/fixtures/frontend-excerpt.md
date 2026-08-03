### client/src/test-utils.tsx  *(already exists)*

```tsx
import { render as rtlRender } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";

/** The project's shared render — wraps every provider a feature component needs. */
export function render(ui: ReactElement, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export { screen, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
```

### client/src/features/invoices/OverdueFilter.tsx

```tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export function OverdueFilter({ workspaceId }: { workspaceId: string }) {
  const [base, setBase] = useState("USD");
  const { data, isPending } = useQuery({
    queryKey: ["overdue", workspaceId, base],
    queryFn: async () => {
      const res = await fetch(`/invoices/overdue?workspaceId=${workspaceId}&base=${base}`);
      return (await res.json()) as { reference: string; totalBaseCents: number; count: number };
    },
  });

  return (
    <section aria-labelledby="overdue-heading">
      <h2 id="overdue-heading">Overdue invoices</h2>

      <label htmlFor="base-currency">Base currency</label>
      <select id="base-currency" value={base} onChange={(e) => setBase(e.target.value)}>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>

      <button type="button" onClick={() => setBase("EUR")}>
        Switch to EUR
      </button>

      {isPending ? <p role="status">Loading…</p> : null}
      {data ? (
        <p data-testid="overdue-total">
          {data.count} invoices, {(data.totalBaseCents / 100).toFixed(2)} {base}
        </p>
      ) : null}
      {data?.count === 0 ? <p>Nothing overdue</p> : null}
    </section>
  );
}
```

### client/src/features/invoices/InvoiceSummaryPanel.tsx

```tsx
import { getOverdueSummary } from "../../server/invoices.js";

/** Server Component — awaits data during the server render. */
export default async function InvoiceSummaryPanel({ workspaceId }: { workspaceId: string }) {
  const summary = await getOverdueSummary(workspaceId);
  return (
    <aside>
      <h3>{summary.reference}</h3>
      <p>{summary.count} overdue</p>
    </aside>
  );
}
```
