export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'MONEY_LENT'
  | 'MONEY_BORROWED'
  | 'LOAN_REPAYMENT_GIVEN'
  | 'LOAN_REPAYMENT_RECEIVED'
  | 'REFUND'
  | 'ADJUSTMENT';

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';

export interface Transaction {
  id: string;
  transactionType: TransactionType;
  amount: number;
  date: string;
  time?: string;
  status: TransactionStatus;
  category?: string;
  paymentMethod: string;
  sourceAccountName?: string;
  destinationAccountName?: string;
  personName?: string;
  merchant?: string;
  description: string;
  notes?: string;
  tags: string[];
  referenceNumber?: string;
  receiptUrl?: string;
  isExcludedFromBudget?: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  currentBalance: number;
  nickname?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
}

export interface PersonDebt {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  notes?: string;
  totalLent: number;
  totalBorrowed: number;
  totalRepaid: number;
  remainingAmount: number;
  type: 'LENT' | 'BORROWED';
  dueDate?: string;
  status: 'ACTIVE' | 'PARTIALLY_PAID' | 'SETTLED' | 'OVERDUE';
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  spent: number;
  month: number;
  year: number;
  alertThreshold: number;
}
