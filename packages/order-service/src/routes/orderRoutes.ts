import express from 'express';
import * as orderController from '../controllers/orderController';

const router = express.Router();

router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);

export default router;
