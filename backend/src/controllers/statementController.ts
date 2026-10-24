import { Request, Response } from 'express';

export class StatementController {
  static parse(req: Request, res: Response) {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Statement content text is required' });
    }

    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    const parsed: any[] = [];

    lines.forEach((line, idx) => {
      if (idx === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('narration'))) return;

      const cols = line.split(/[,\t|]/);
      if (cols.length < 3) return;

      const amtMatch = line.match(/[\d,]+(?:\.\d{1,2})?/);
      if (!amtMatch) return;

      const amount = parseFloat(amtMatch[0].replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) return;

      const isCredit = /credit|cr|salary|deposit|inward/i.test(line);
      const txType = isCredit ? 'INCOME' : 'EXPENSE';

      parsed.push({
        id: `TX-STMT-${Date.now()}-${idx}`,
        transactionType: txType,
        amount,
        date: new Date().toISOString().split('T')[0],
        description: cols[1]?.trim() || 'Bank Entry',
        category: isCredit ? 'Salary' : 'Bank Expense',
        status: 'COMPLETED'
      });
    });

    return res.json({
      status: 'success',
      totalParsed: parsed.length,
      transactions: parsed
    });
  }
}
