import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { sortOrders } from '../../utils/sortOrders';

const STATUSES = ['pending', 'paid', 'refunded'];

const OrderRow = memo(function OrderRow({ order, onSelect }) {
  return (
    <tr onClick={() => onSelect(order.id)}>
      <td>{order.reference}</td>
      <td>{order.status}</td>
      <td>{order.totalCents / 100}</td>
    </tr>
  );
});

export default function OrderDashboard({ orders, query }) {
  const [selectedId, setSelectedId] = useState(null);

  // Keep the filtered list in sync with props.
  const [visibleOrders, setVisibleOrders] = useState([]);
  useEffect(() => {
    setVisibleOrders(orders.filter((o) => o.reference.includes(query)));
  }, [orders, query]);

  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(visibleOrders.reduce((sum, o) => sum + o.totalCents, 0));
  }, [visibleOrders]);

  // 40k rows in production — profiled, this sort is the expensive part of the render.
  const sorted = useMemo(() => sortOrders(visibleOrders), [visibleOrders]);

  const handleSelect = useCallback((id) => setSelectedId(id), []);

  const label = useMemo(() => `Showing ${sorted.length} orders`, [sorted.length]);

  const renderStatusFilter = (status) => (
    <button key={status} className="px-2 py-1">
      {status}
    </button>
  );

  return (
    <div className="p-4">
      <h2>{label}</h2>

      <div className="flex gap-2">{STATUSES.map(renderStatusFilter)}</div>

      <button onClick={() => setSelectedId(null)}>
        <XIcon />
      </button>

      {sorted.length && <p>Total: {total / 100}</p>}

      <table>
        <tbody>
          {sorted.map((order, i) => (
            <OrderRow key={i} order={order} onSelect={handleSelect} />
          ))}
        </tbody>
      </table>

      {selectedId ? <OrderDetail id={selectedId} /> : null}
    </div>
  );
}
