const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/:productId', inventoryController.getStock);
router.put('/:productId', inventoryController.setStock);

module.exports = router;
