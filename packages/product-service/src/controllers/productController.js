const Joi = require('joi');
const productService = require('../services/productService');

const productSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(1).required(),
  price: Joi.number().positive().required(),
  category: Joi.string().required(),
  imageUrl: Joi.string().uri().allow('').optional(),
  stockHint: Joi.number().integer().min(0).optional(),
});

const getAllProducts = async (req, res, next) => {
  try {
    const result = await productService.getAllProducts(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

const createProduct = async (req, res, next) => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { code: 400, message: error.details[0].message } });
    }
    const product = await productService.createProduct(value);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const product = await productService.deleteProduct(req.params.id);
    res.json({ message: 'Product deleted', product });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };
