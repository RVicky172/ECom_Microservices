/** Routes under `/api/v1/inventory`. */
import express from 'express';
import * as inventoryController from '../controllers/inventoryController';

const router = express.Router();

router.get('/:productId', inventoryController.getStock);
router.put('/:productId', inventoryController.setStock);

export default router;
