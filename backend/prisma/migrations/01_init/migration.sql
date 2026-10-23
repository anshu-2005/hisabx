-- CreateEnums
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'UPI_WALLET', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'MONEY_LENT', 'MONEY_BORROWED', 'LOAN_REPAYMENT_GIVEN', 'LOAN_REPAYMENT_RECEIVED', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'PENDING', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CASH', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'CHEQUE', 'BANK_TRANSFER');
CREATE TYPE "DebtType" AS ENUM ('LENT', 'BORROWED');
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PARTIALLY_PAID', 'SETTLED', 'OVERDUE');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'OVERDUE', 'DISMISSED');

-- CreateTable users
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable user_profiles
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "enableBiometrics" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable accounts
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'BANK',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "nickname" TEXT,
    "color" TEXT DEFAULT '#1E3A8A',
    "icon" TEXT DEFAULT 'Wallet',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "accounts_userId_isActive_idx" ON "accounts"("userId", "isActive");

-- CreateTable transaction_categories
CREATE TABLE "transaction_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT REFERENCES "users"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Tag',
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unique_user_category_type" UNIQUE ("userId", "name", "type")
);
CREATE INDEX "categories_userId_type_idx" ON "transaction_categories"("userId", "type");

-- CreateTable people
CREATE TABLE "people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "totalLent" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalBorrowed" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalRepaid" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "remainingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "unique_user_person_name" UNIQUE ("userId", "name")
);
CREATE INDEX "people_userId_idx" ON "people"("userId");

-- CreateTable transactions
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "transactionType" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "categoryId" TEXT REFERENCES "transaction_categories"("id") ON DELETE SET NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UPI',
    "sourceAccountId" TEXT REFERENCES "accounts"("id") ON DELETE RESTRICT,
    "destinationAccountId" TEXT REFERENCES "accounts"("id") ON DELETE RESTRICT,
    "personId" TEXT REFERENCES "people"("id") ON DELETE SET NULL,
    "merchant" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referenceNumber" TEXT,
    "receiptUrl" TEXT,
    "isExcludedFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "linkedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "transactions_userId_date_idx" ON "transactions"("userId", "date");
CREATE INDEX "transactions_userId_type_idx" ON "transactions"("userId", "transactionType");
CREATE INDEX "transactions_userId_status_idx" ON "transactions"("userId", "status");

-- CreateTable debts
CREATE TABLE "debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "personId" TEXT NOT NULL REFERENCES "people"("id") ON DELETE CASCADE,
    "type" "DebtType" NOT NULL,
    "initialAmount" DECIMAL(14,2) NOT NULL,
    "remainingAmount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "dueDate" DATE,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "transactionId" TEXT REFERENCES "transactions"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "debts_userId_personId_idx" ON "debts"("userId", "personId");
CREATE INDEX "debts_userId_status_idx" ON "debts"("userId", "status");

-- CreateTable debt_repayments
CREATE TABLE "debt_repayments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "debtId" TEXT NOT NULL REFERENCES "debts"("id") ON DELETE CASCADE,
    "amount" DECIMAL(14,2) NOT NULL,
    "repaymentDate" DATE NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UPI',
    "accountId" TEXT REFERENCES "accounts"("id") ON DELETE RESTRICT,
    "transactionId" TEXT REFERENCES "transactions"("id") ON DELETE SET NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "debt_repayments_userId_debtId_idx" ON "debt_repayments"("userId", "debtId");

-- CreateTable budgets
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "categoryId" TEXT NOT NULL REFERENCES "transaction_categories"("id") ON DELETE CASCADE,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "alertThreshold" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "unique_user_category_month_year" UNIQUE ("userId", "categoryId", "month", "year")
);

-- CreateTable recurring_transactions
CREATE TABLE "recurring_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATE NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "lastRunDate" DATE,
    "accountId" TEXT REFERENCES "accounts"("id") ON DELETE SET NULL,
    "categoryId" TEXT REFERENCES "transaction_categories"("id") ON DELETE SET NULL,
    "personId" TEXT,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable reminders
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "dueDate" DATE NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "relatedAccountId" TEXT REFERENCES "accounts"("id") ON DELETE SET NULL,
    "relatedPersonId" TEXT REFERENCES "people"("id") ON DELETE SET NULL,
    "notes" TEXT,
    "isNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldState" JSONB,
    "newState" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "audit_logs_userId_entity_idx" ON "audit_logs"("userId", "entityType", "entityId");
