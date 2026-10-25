/** The notifications themselves. There is no mail server: each "email" is a log line tagged `[EMAIL SENT]`. */
import type { HandoffRequestedData } from '@ecommerce/shared';

interface NotificationData {
  orderId: string;
  userId?: string;
  reason?: string;
}

/** Tells the shopper their order was received (`order.created`). */
export const sendOrderCreatedEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId, userId: data.userId },
    `[EMAIL SENT] Order ${data.orderId} received. Waiting for payment...`
  );
};

/** Tells the shopper the payment went through and the order is confirmed (`payment.completed`). */
export const sendPaymentSuccessEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId },
    `[EMAIL SENT] Payment for order ${data.orderId} was successful! Your order is confirmed.`
  );
};

/** Tells the shopper the payment failed and the order was cancelled (`payment.failed`). */
export const sendPaymentFailedEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId, reason: data.reason },
    `[EMAIL SENT] Payment for order ${data.orderId} failed (${data.reason ?? 'unknown reason'}). Your order has been cancelled.`
  );
};

/** A shopper asked the assistant for a person (feature 011); a simulated email to support. */
export const sendSupportHandoffEmail = async (data: HandoffRequestedData, logger: any): Promise<void> => {
  logger.info(
    { reference: data.reference, userId: data.userId, conversationId: data.conversationId, reason: data.reason },
    `[EMAIL SENT] To support: handoff ${data.reference} from user ${data.userId} (conversation ${data.conversationId}), ` +
      `reason ${data.reason}: ${data.summary}`
  );
};
