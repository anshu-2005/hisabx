/**
 * HisabX Ledger Service
 *
 * Implements strict financial balance calculation rules:
 * 1. Available balance calculation is derived from:
 *    Account Balance = openingBalance + sum(Inflows) - sum(Outflows)
 * 2. Only COMPLETED transactions affect account balances.
 *    PENDING transactions are tracked as pending/reserved and do NOT alter available balance.
 * 3. Transfers atomically deduct from source and credit to destination without double counting.
 *    Transfers do NOT affect net income or expense totals.
 * 4. Money Lent reduces source account balance and creates an outstanding receivable.
 *    Loan Repayment Received increases account balance and reduces the receivable.
 * 5. Money Borrowed increases destination account balance and creates a payable.
 *    Loan Repayment Given reduces account balance and reduces the payable.
 * 6. Refunds increase account balance and offset expenses.
 * 7. Edits and Deletions safely rollback previous financial impacts before applying updates.
 * 8. Decimal arithmetic prevents rounding drift.
 */

export interface TransactionRecord {
  id: string;
  userId: string;
  transactionType: 
    | 'INCOME' 
    | 'EXPENSE' 
    | 'TRANSFER' 
    | 'MONEY_LENT' 
    | 'MONEY_BORROWED' 
    | 'LOAN_REPAYMENT_GIVEN' 
    | 'LOAN_REPAYMENT_RECEIVED' 
    | 'REFUND' 
    | 'ADJUSTMENT';
  amount: number;
  date: string;
  time?: string;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  categoryId?: string;
  paymentMethod: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  personId?: string;
  merchant?: string;
  description: string;
  notes?: string;
  tags?: string[];
  referenceNumber?: string;
  receiptUrl?: string;
  isExcludedFromBudget?: boolean;
  linkedTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: string;
  openingBalance: number;
  currentBalance: number;
  nickname?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
}

export interface DebtRecord {
  id: string;
  userId: string;
  personId: string;
  type: 'LENT' | 'BORROWED';
  initialAmount: number;
  remainingAmount: number;
  reason?: string;
  dueDate?: string;
  status: 'ACTIVE' | 'PARTIALLY_PAID' | 'SETTLED' | 'OVERDUE';
  transactionId?: string;
}

export interface PersonRecord {
  id: string;
  userId: string;
  name: string;
  nickname?: string;
  phone?: string;
  notes?: string;
  totalLent: number;
  totalBorrowed: number;
  totalRepaid: number;
  remainingBalance: number;
}

export class LedgerEngine {
  public static computeTransactionAccountDelta(tx: TransactionRecord): Map<string, number> {
    const delta = new Map<string, number>();

    if (tx.status !== 'COMPLETED') {
      return delta;
    }

    const amt = Math.round(tx.amount * 100) / 100;

    switch (tx.transactionType) {
      case 'INCOME':
        if (tx.destinationAccountId) {
          delta.set(tx.destinationAccountId, (delta.get(tx.destinationAccountId) || 0) + amt);
        } else if (tx.sourceAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) + amt);
        }
        break;

      case 'EXPENSE':
        if (tx.sourceAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) - amt);
        }
        break;

      case 'TRANSFER':
        if (tx.sourceAccountId && tx.destinationAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) - amt);
          delta.set(tx.destinationAccountId, (delta.get(tx.destinationAccountId) || 0) + amt);
        }
        break;

      case 'MONEY_LENT':
        if (tx.sourceAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) - amt);
        }
        break;

      case 'MONEY_BORROWED':
        const targetAcc = tx.destinationAccountId || tx.sourceAccountId;
        if (targetAcc) {
          delta.set(targetAcc, (delta.get(targetAcc) || 0) + amt);
        }
        break;

      case 'LOAN_REPAYMENT_GIVEN':
        if (tx.sourceAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) - amt);
        }
        break;

      case 'LOAN_REPAYMENT_RECEIVED':
        const recvAcc = tx.destinationAccountId || tx.sourceAccountId;
        if (recvAcc) {
          delta.set(recvAcc, (delta.get(recvAcc) || 0) + amt);
        }
        break;

      case 'REFUND':
        const refundAcc = tx.destinationAccountId || tx.sourceAccountId;
        if (refundAcc) {
          delta.set(refundAcc, (delta.get(refundAcc) || 0) + amt);
        }
        break;

      case 'ADJUSTMENT':
        if (tx.sourceAccountId) {
          delta.set(tx.sourceAccountId, (delta.get(tx.sourceAccountId) || 0) + amt);
        }
        break;
    }

    return delta;
  }

  public static recalculateAccountBalance(
    account: AccountRecord,
    transactions: TransactionRecord[]
  ): number {
    let balance = Math.round(account.openingBalance * 100);

    for (const tx of transactions) {
      if (tx.status !== 'COMPLETED') continue;

      const amtInCents = Math.round(tx.amount * 100);

      if (tx.sourceAccountId === account.id) {
        if (['EXPENSE', 'MONEY_LENT', 'LOAN_REPAYMENT_GIVEN'].includes(tx.transactionType)) {
          balance -= amtInCents;
        } else if (tx.transactionType === 'TRANSFER') {
          balance -= amtInCents;
        } else if (tx.transactionType === 'INCOME' && !tx.destinationAccountId) {
          balance += amtInCents;
        } else if (tx.transactionType === 'ADJUSTMENT') {
          balance += amtInCents;
        }
      }

      if (tx.destinationAccountId === account.id) {
        if (tx.transactionType === 'TRANSFER') {
          balance += amtInCents;
        } else if (['INCOME', 'MONEY_BORROWED', 'LOAN_REPAYMENT_RECEIVED', 'REFUND'].includes(tx.transactionType)) {
          balance += amtInCents;
        }
      }
    }

    return balance / 100;
  }

  public static calculateMonthlyMetrics(
    transactions: TransactionRecord[],
    currentYear: number,
    currentMonth: number
  ): {
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    savingsRate: number;
  } {
    let incomeCents = 0;
    let expenseCents = 0;

    for (const tx of transactions) {
      if (tx.status !== 'COMPLETED') continue;

      const txDate = new Date(tx.date);
      if (txDate.getFullYear() !== currentYear || (txDate.getMonth() + 1) !== currentMonth) {
        continue;
      }

      const amtCents = Math.round(tx.amount * 100);

      if (tx.transactionType === 'INCOME') {
        incomeCents += amtCents;
      } else if (tx.transactionType === 'EXPENSE') {
        expenseCents += amtCents;
      } else if (tx.transactionType === 'REFUND') {
        expenseCents -= amtCents;
      }
    }

    const totalIncome = Math.max(0, incomeCents / 100);
    const totalExpense = Math.max(0, expenseCents / 100);
    const netSavings = (incomeCents - expenseCents) / 100;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate: Math.round(savingsRate * 100) / 100,
    };
  }
}
