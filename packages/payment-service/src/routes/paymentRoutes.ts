import express from 'express';
import * as paymentController from '../controllers/paymentController';

const router = express.Router();

router.get('/:orderId', paymentController.getPayment);

export default router;
