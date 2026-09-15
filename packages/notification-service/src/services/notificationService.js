const sendOrderCreatedEmail = async (data, logger) => {
  logger.info(
    { orderId: data.orderId, userId: data.userId },
    `[EMAIL SENT] Order ${data.orderId} received. Waiting for payment...`
  );
};

const sendPaymentSuccessEmail = async (data, logger) => {
  logger.info(
    { orderId: data.orderId },
    `[EMAIL SENT] Payment for order ${data.orderId} was successful! Your order is confirmed.`
  );
};

const sendPaymentFailedEmail = async (data, logger) => {
  logger.info(
    { orderId: data.orderId, reason: data.reason },
    `[EMAIL SENT] Payment for order ${data.orderId} failed. Your order has been cancelled.`
  );
};

module.exports = { sendOrderCreatedEmail, sendPaymentSuccessEmail, sendPaymentFailedEmail };
