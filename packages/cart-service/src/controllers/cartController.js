const Joi = require('joi');
const cartService = require('../services/cartService');

const addItemSchema = Joi.object({
  productId: Joi.string().required(),
  name: Joi.string().required(),
  price: Joi.number().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
});

const updateSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

const getUserId = (req) => req.headers['x-user-id'];

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const { error, value } = addItemSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }
    const cart = await cartService.addItem(getUserId(req), value);
    res.status(201).json(cart);
  } catch (err) {
    next(err);
  }
};

const updateItemQuantity = async (req, res, next) => {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }
    const cart = await cartService.updateItemQuantity(getUserId(req), req.params.id, value.quantity);
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(getUserId(req), req.params.id);
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(getUserId(req));
    res.json(cart);
  } catch (err) {
    next(err);
  }
};

module.exports = { getCart, addItem, updateItemQuantity, removeItem, clearCart };
