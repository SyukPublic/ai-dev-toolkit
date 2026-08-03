// packages/billing/src/types.ts

export type UserId = string;
export type OrderId = string;
export type InvoiceId = string;

export const appConfig: Record<string, string | number> = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
};

export const routes: string[] = ['/home', '/billing', '/invoices'];

export function refundOrder(orderId: OrderId, userId: UserId, amountCents: number) {
  return { orderId, userId, amountCents };
}

// packages/billing/src/handlers.ts

export function handleRefund(user: { id: UserId }, order: { id: OrderId }) {
  // Compiles today. Arguments are swapped.
  return refundOrder(user.id, order.id, 1500);
}

export function navigate(to: string) {
  // Any string is accepted, including '/hoem'.
  window.location.assign(to);
}

export function readTimeout(): number {
  // appConfig.timeout is string | number here, so this needs a cast.
  return appConfig.timeout as number;
}
