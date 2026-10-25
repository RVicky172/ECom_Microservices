/** Routes under `/api/v1/assistant`. */
import { Router } from 'express';
import * as chatController from '../controllers/chatController';

const router = Router();

router.post('/chat', chatController.postChat);
router.get('/conversations/:id', chatController.getConversation);
router.delete('/conversations/:id', chatController.deleteConversation);
router.put('/conversations/:id/answers/:answerId/feedback', chatController.putFeedback);

export default router;
