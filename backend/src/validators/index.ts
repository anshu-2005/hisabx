import { z } from 'zod';

export const TransactionTypeEnum = z.enum([
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'MONEY_LENT',
  'MONEY_BORROWED',
  'LOAN_REPAYMENT_GIVEN',
  'LOAN_REPAYMENT_RECEIVED',
  'REFUND',
  'ADJUSTMENT',
]);

export const TransactionStatusEnum = z.enum(['COMPLETED', 'PENDING', 'CANCELLED']);

export const PaymentMethodEnum = z.enum([
  'UPI',
  'CASH',
  'NET_BANKING',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'CHEQUE',
  'BANK_TRANSFER',
]);

export const AccountTypeEnum = z.enum([
  'CASH',
  'BANK',
  'UPI_WALLET',
  'SAVINGS',
  'CREDIT_CARD',
  'INVESTMENT',
  'OTHER',
]);

export const createTransactionSchema = z.object({
  transactionType: TransactionTypeEnum,
  amount: z.number().positive('Amount must be positive'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().optional(),
  status: TransactionStatusEnum.default('COMPLETED'),
  categoryId: z.string().optional(),
  paymentMethod: PaymentMethodEnum.default('UPI'),
  sourceAccountId: z.string().optional(),
  destinationAccountId: z.string().optional(),
  personId: z.string().optional(),
  merchant: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  referenceNumber: z.string().optional(),
  receiptUrl: z.string().optional(),
  isExcludedFromBudget: z.boolean().default(false),
});

export const updateTransactionSchema = createTransactionSchema.partial();
