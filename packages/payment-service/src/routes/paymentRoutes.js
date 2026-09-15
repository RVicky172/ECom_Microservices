const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.get('/:orderId', paymentController.getPayment);

module.exports = router;
