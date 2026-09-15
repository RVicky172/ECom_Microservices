const Joi = require('joi');
const inventoryService = require('../services/inventoryService');

const setStockSchema = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
});

const getStock = async (req, res, next) => {
  try {
    const stock = await inventoryService.getStock(req.params.productId);
    res.json(stock);
  } catch (err) {
    next(err);
  }
};

const setStock = async (req, res, next) => {
  try {
    const { error, value } = setStockSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }
    const stock = await inventoryService.setStock(req.params.productId, value.quantity);
    res.json(stock);
  } catch (err) {
    next(err);
  }
};

module.exports = { getStock, setStock };
