import express from 'express';
import * as authController from '../controllers/authController';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authController.getProfile);

export default router;
