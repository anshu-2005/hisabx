# HisabX — Production-Grade Personal Finance Management

HisabX is an enterprise-quality personal finance web application built for precision, transparency, and effortless tracking of every rupee. Designed specifically for Indian English conventions, INR (`₹1,25,000.00`) number formatting, and the `Asia/Kolkata` timezone.

---

## 🌟 Key Capabilities

### 1. Main Dashboard & Net Worth Engine
- **6 Key Metrics**: Total Available Balance, Total Income This Month, Total Expenses This Month, Money Owed To Me (Receivables), Money I Owe Others (Payables), Net Monthly Savings.
- **Strict Ledger Balancing**: Real balance is computed dynamically from account opening balances plus completed ledger entries. Internal transfers and non-P&L debt disbursements are never confused with ordinary income or expenses.
- **Interactive Visualizations**: Income vs. Expense monthly bar charts, 30-day spending trends, category distributions, and upcoming payment reminders.

### 2. Complete Transaction Management
- Supports all 9 financial transaction types:
  1. `INCOME`
  2. `EXPENSE`
  3. `TRANSFER` (atomic debit/credit without double-counting)
  4. `MONEY_LENT` (reduces account balance, creates receivable)
  5. `MONEY_BORROWED` (increases account balance, creates payable)
  6. `LOAN_REPAYMENT_GIVEN` (reduces payable and cash)
  7. `LOAN_REPAYMENT_RECEIVED` (reduces receivable and increases cash)
  8. `REFUND` (offsets expenses)
  9. `ADJUSTMENT`
- Multi-dimensional filters (date range, type, account, category, status).
- Safe transaction editing with automated balance recalculation and audit logging.

### 3. Accounts & Wallet Architecture
- Cash Wallet, UPI (GPay/PhonePe), Bank Accounts (HDFC, SBI, ICICI, etc.).
- Atomic transfers with zero double-counting.
- Clear separation between liquid cash, receivables, and payables.

### 4. Dedicated "People & Debts" Module
- Tracks friends and merchants: Rahul, Amit, Priya, etc.
- Partial repayments, remaining balances, payment timelines, and overdue alerts.
- Solves the problem of forgetting who borrowed money or whom you owe.

### 5. Daily Financial Calendar & Monthly Total Notes
- **Monthly Interactive Matrix**: 7-column calendar showing exact daily income badges (`+₹X`), expense badges (`-₹Y`), and daily transaction count.
- **Day Ledger & Daily Memo Drawer**: Click on any date to inspect all transactions on that specific day, quickly record a new transaction with prefilled date, or write and save a personal daily note / diary memo.
- **Monthly Sticky Notes & Financial Journal**: Dedicated monthly notes board with tags (`Budget Goal`, `Income Plan`, `Debt Due`, `Tax & Saving`) to record monthly observations and spending limits.

### 6. UPI Direct Auto-Sync & Connect Hub (PhonePe / GPay / Paytm)
- **100% User Freedom Toggle**: Complete control to turn UPI auto-tracking ON or OFF anytime. When OFF, tracker runs in 100% private offline manual mode.
- **Connected UPI Apps**: Dedicated status cards and toggles for Google Pay, PhonePe, Paytm, and CRED with connected UPI IDs.
- **Instant Bank SMS & UPI Auto-Reader**: Live Regex parsing engine that extracts Amount, Merchant, Account, and Category from Indian Bank SMS with 1-click "Confirm & Log to Ledger" action.
- **Realtime Push Notification Simulator**: Interactive simulator to experience live PhonePe and GPay alerts and approve them directly into your ledger.
- **Android Webhook Bridge**: Webhook URL endpoint (`/v1/webhook/upi/usr_98234`) ready for automated forwarding via Tasker or MacroDroid.

### 7. Interactive Header Notification Bell & Due Reminders
- Top bar bell with live pulse badge displaying the exact count of pending bills and debts.
- Interactive popover listing upcoming dues with 1-click **"Pay Now"** button that automatically records the transaction into the ledger and clears the reminder.

### 8. Smart Transaction Entry (NLP)
- Rapid 10-second entry with natural language parsing:
  - `"Tea 20 cash"` -> Expense ₹20, Food & Drinks, Cash Wallet
  - `"Salary 15000 bank"` -> Income ₹15,000, Salary, Bank Account
  - `"Rahul ko 500 diye"` -> Proposed Money Lent, Rahul, ₹500
- Always shows an interactive confirmation preview before committing to the database.

### 9. 100% Dynamic Real-Time Calculations (Zero Hardcoded Amounts)
- **Zero Static Charts**: Every single chart (Monthly Income vs. Expense bar chart, Category spending donut chart, Account balance share, Report charts) is dynamically computed from actual completed entries in `appState.transactions`.
- **Dynamic Budgets**: Budget spent and progress bars are dynamically calculated from actual transactions matching the category.
- **Dynamic Ledger Updating**: When you add an Income entry (e.g., Salary ₹1,50,000 into your bank), liquid reserves, total income, net monthly savings, calendar badges, and charts update across all views instantly.
- **Dynamic Expense Updating**: Recording an expense immediately updates bank balances, increases total monthly expenses, adjusts savings rate, updates category charts, and recalculates budget caps.

### 10. Client Deployment & "Start Fresh" Setup Mode
- **1-Click Client Onboarding**: Click **"Setup Real Client / Clear Demo Data"** on the dashboard or in Settings to replace sample data with real numbers in 1 minute:
  - Enter Client Name or Business Name
  - Enter Primary Bank Name (HDFC, SBI, etc.)
  - Enter Real Opening Bank Balance
  - Enter Monthly Salary / Inflow
- **Clean Slate (Zero Slate)**: Option to wipe all 24 demo entries with 1 click so the user or client starts with an empty, clean ledger.
- **In-Place Account Editing**: Click **"Edit"** on any account card to adjust opening balances or rename wallets on the fly without touching code.
- **Demo Data Restore**: Anytime you need to demonstrate features to another client, restore the complete 24-transaction demo dataset with 1 click.

### 11. Monthly Budgets & Warning Thresholds
- Category-level budgets with visual progress indicators dynamically linked to transactions.
- Automatic alerts when spending reaches 80% and 100%.

### 12. Analytics, Reports & CSV Data Import/Export
- Export transactions to CSV and full JSON backup.
- CSV import with column mapping, duplicate detection, and preview confirmation.

---

## 🏗️ Technology Stack

- **Single-Page Application**: Vanilla JavaScript ES6+, HTML5, Tailwind CSS, Lucide Icons, Chart.js.
- **Local Web Server**: Node.js built-in HTTP server with zero external dependencies.
- **Fullstack Extensions**: React 18, Vite, TypeScript, Express.js, PostgreSQL & Prisma ORM.

---

## 🚀 Instant Ready-to-Use Guide (Ready Today!)

### Option 1: One-Command Local Web App (Recommended)
From the `hisabx/` folder:
```bash
npm start
```
Or directly:
```bash
node server.js
```
Open **`http://localhost:3000`** in any browser. The app runs with 100% functionality, local persistence, real ledger calculations, Daily Calendar, UPI Auto-Sync Hub, and Reminders!

### Option 2: Direct Double-Click (Zero Setup Required)
Simply double click or open **`hisabx_app.html`** directly in Chrome, Edge, Brave, or Firefox. Everything works completely offline without needing any database or server!

