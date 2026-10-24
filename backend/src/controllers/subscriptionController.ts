import { Request, Response } from 'express';

const subscriptionsStore: Record<string, any> = {};

export class SubscriptionController {
  static getStatus(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const sub = subscriptionsStore[userId] || {
      userId,
      plan: 'free',
      status: 'active',
      name: 'Starter Plan',
      price: '₹0',
      maxAccounts: 3,
      statementParser: false,
      groupSplit: false,
      autoSync: true
    };

    return res.json({ status: 'success', subscription: sub });
  }

  static upgrade(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { plan = 'pro', paymentId = `pay_mock_${Date.now()}` } = req.body;
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const sub = {
      userId,
      plan,
      status: 'active',
      name: plan === 'pro' ? 'Pro Financial OS' : 'Enterprise Suite',
      price: plan === 'pro' ? '₹1,499/year' : '₹4,999/year',
      maxAccounts: 999,
      statementParser: true,
      groupSplit: true,
      autoSync: true,
      paymentId,
      expiresAt: expiresAt.toISOString()
    };

    subscriptionsStore[userId] = sub;
    return res.json({
      status: 'success',
      message: `Successfully upgraded to ${sub.name}!`,
      subscription: sub
    });
  }
}
