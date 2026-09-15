const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:id', cartController.updateItemQuantity);
router.delete('/items/:id', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
