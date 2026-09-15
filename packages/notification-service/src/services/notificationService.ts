interface NotificationData {
  orderId: string;
  userId?: string;
  reason?: string;
}

export const sendOrderCreatedEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId, userId: data.userId },
    `[EMAIL SENT] Order ${data.orderId} received. Waiting for payment...`
  );
};

export const sendPaymentSuccessEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId },
    `[EMAIL SENT] Payment for order ${data.orderId} was successful! Your order is confirmed.`
  );
};

export const sendPaymentFailedEmail = async (data: NotificationData, logger: any): Promise<void> => {
  logger.info(
    { orderId: data.orderId, reason: data.reason },
    `[EMAIL SENT] Payment for order ${data.orderId} failed. Your order has been cancelled.`
  );
};
