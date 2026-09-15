import express from 'express';
import * as cartController from '../controllers/cartController';

const router = express.Router();

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:id', cartController.updateItemQuantity);
router.delete('/items/:id', cartController.removeItem);
router.delete('/', cartController.clearCart);

export default router;
