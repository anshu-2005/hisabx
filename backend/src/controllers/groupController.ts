import { Request, Response } from 'express';

const groupsStore: any[] = [];

export class GroupController {
  static getGroups(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userGroups = groupsStore.filter(g => g.userId === userId || (g.members && g.members.includes(req.user?.email)));
    return res.json({ status: 'success', groups: userGroups });
  }

  static createGroup(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, description = '', members = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const group = {
      id: `grp_${Date.now()}`,
      userId,
      name: name.trim(),
      description: description.trim(),
      members: Array.isArray(members) ? members : ['You'],
      expenses: [],
      createdAt: new Date().toISOString()
    };

    groupsStore.push(group);
    return res.status(201).json({ status: 'success', group });
  }

  static addExpense(req: Request, res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const group = groupsStore.find(g => g.id === id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const { description, amount, paidBy = 'You' } = req.body;
    if (!description || !amount || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Valid description and amount are required' });
    }

    const expense = {
      id: `gexp_${Date.now()}`,
      description: description.trim(),
      amount: parseFloat(amount),
      paidBy: paidBy.trim(),
      date: new Date().toISOString().split('T')[0]
    };

    group.expenses.unshift(expense);
    return res.status(201).json({ status: 'success', expense });
  }
}
