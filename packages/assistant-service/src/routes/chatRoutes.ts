import { Router } from 'express';
import * as chatController from '../controllers/chatController';

const router = Router();

router.post('/chat', chatController.postChat);
router.get('/conversations/:id', chatController.getConversation);
router.delete('/conversations/:id', chatController.deleteConversation);

export default router;
