const paymentService = require('../services/paymentService');

const getPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.getPayment(req.params.orderId);
    res.json(payment);
  } catch (err) {
    next(err);
  }
};

module.exports = { getPayment };
