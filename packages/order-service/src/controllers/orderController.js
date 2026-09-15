const Joi = require('joi');
const orderService = require('../services/orderService');

const createOrderSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    productId: Joi.string().required(),
    name: Joi.string().required(),
    price: Joi.number().positive().required(),
    quantity: Joi.number().integer().min(1).required(),
  })).min(1).required(),
  shippingAddress: Joi.string().allow('').optional(),
});

const createOrder = async (req, res, next) => {
  try {
    const { error, value } = createOrderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }

    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: { code: 401, message: 'Unauthorized' } });
    }

    const order = await orderService.createOrder({
      userId,
      items: value.items,
      shippingAddress: value.shippingAddress,
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    const { page = 1, limit = 20 } = req.query;
    const orders = await orderService.getOrdersByUserId(userId, parseInt(page), parseInt(limit));
    res.json({ orders });
  } catch (err) {
    next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
};

module.exports = { createOrder, getOrders, getOrderById };
