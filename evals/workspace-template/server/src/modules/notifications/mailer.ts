import { transport } from '../../platform/smtp.js';

export async function sendRefundEmail(to: string, orderId: string) {
  try {
    transport.send({ to, subject: `Refund for ${orderId}`, body: 'Your refund is on the way.' });
  } catch {
    // ignore
  }
}
