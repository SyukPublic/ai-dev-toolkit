// app/orders/[id]/page.tsx
import { cookies } from 'next/headers';
import { OrderTimeline } from './OrderTimeline';
import { OrderFilters } from './OrderFilters';
import { getOrder, getEvents } from '@/lib/orders';

type Props = { params: { id: string }; searchParams: { tab?: string } };

export default async function OrderPage({ params, searchParams }: Props) {
  const session = cookies().get('session')?.value;
  const order = await getOrder(params.id, session);
  const events = await getEvents(params.id);

  return (
    <main>
      <h1>Order {order.reference}</h1>

      <OrderFilters activeTab={searchParams.tab ?? 'summary'} />

      <OrderTimeline
        events={events}
        placedAt={order.placedAt}
        onSelect={(eventId) => console.log(eventId)}
      />
    </main>
  );
}

// app/orders/[id]/OrderTimeline.tsx
'use client';

import { formatEvent } from '@/lib/format';

export async function OrderTimeline({ events, placedAt, onSelect }) {
  const enriched = await formatEvent(events);

  return (
    <ol>
      <li>Placed {placedAt.toLocaleDateString()}</li>
      {enriched.map((e) => (
        <li key={e.id} onClick={() => onSelect(e.id)}>
          {e.label}
        </li>
      ))}
    </ol>
  );
}

// app/orders/[id]/OrderFilters.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';

export function OrderFilters({ activeTab }: { activeTab: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const current = searchParams.get('tab') ?? activeTab;

  return (
    <nav>
      {['summary', 'timeline', 'invoices'].map((tab) => (
        <button key={tab} aria-current={tab === current} onClick={() => router.push(`?tab=${tab}`)}>
          {tab}
        </button>
      ))}
    </nav>
  );
}
