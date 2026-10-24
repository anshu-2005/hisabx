import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { SubscriptionController } from '../controllers/subscriptionController';
import { GroupController } from '../controllers/groupController';
import { StatementController } from '../controllers/statementController';
import { authenticateToken } from '../middleware/auth';
import { SmartTransactionParser } from '../services/nlpParserService';

const router = Router();

// Auth Routes
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/me', authenticateToken, AuthController.me);

// SaaS Subscriptions
router.get('/subscription/status', authenticateToken, SubscriptionController.getStatus);
router.post('/subscription/upgrade', authenticateToken, SubscriptionController.upgrade);

// SaaS Splitwise Group Split
router.get('/groups', authenticateToken, GroupController.getGroups);
router.post('/groups', authenticateToken, GroupController.createGroup);
router.post('/groups/:id/expenses', authenticateToken, GroupController.addExpense);

// Statement Parser
router.post('/statement/parse', StatementController.parse);

// NLP Parser
router.post('/transactions/parse-smart-entry', (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'Text input string is required' });
  return res.json(SmartTransactionParser.parse(input));
});

export default router;
