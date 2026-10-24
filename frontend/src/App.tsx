import React, { useState, useEffect } from 'react';
import {
  Wallet,
  LayoutDashboard,
  Receipt,
  Calendar,
  Zap,
  Landmark,
  Users,
  PieChart,
  Split,
  Settings,
  Bell,
  Plus,
  Crown,
  FileSpreadsheet,
  Moon,
  Sun,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CheckCircle2,
  Check,
  ShieldCheck,
  Search,
  UserCheck
} from 'lucide-react';
import { api, setAuthToken, getAuthToken } from './services/api';

// Format Indian Rupee Currency
export function formatINR(val: number): string {
  if (isNaN(val)) return '0.00';
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isSmartAddOpen, setIsSmartAddOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [smartInput, setSmartInput] = useState('');
  const [statementText, setStatementText] = useState('');
  const [parsedStatementTxs, setParsedStatementTxs] = useState<any[]>([]);

  // User State
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // App Data State (Local fallback & Cloud synced)
  const [transactions, setTransactions] = useState<any[]>([
    { id: '1', date: '2026-10-24', description: 'Tech Corp Monthly Salary', category: 'Salary', amount: 85000, transactionType: 'INCOME', status: 'COMPLETED' },
    { id: '2', date: '2026-10-24', description: 'Swiggy Gourmet Dinner', category: 'Food & Groceries', amount: 640, transactionType: 'EXPENSE', status: 'COMPLETED' },
    { id: '3', date: '2026-10-23', description: 'HPCL Petrol Pump Fuel', category: 'Travel & Commute', amount: 1200, transactionType: 'EXPENSE', status: 'COMPLETED' },
    { id: '4', date: '2026-10-22', description: 'Rahul Loan Repayment', category: 'Debts', amount: 3500, transactionType: 'LOAN_REPAYMENT_RECEIVED', status: 'COMPLETED' },
  ]);

  const [groups, setGroups] = useState<any[]>([
    {
      id: 'grp_1',
      name: 'Flat 402 Roommates',
      description: 'Rent, Wi-Fi & Groceries',
      members: ['You', 'Amit Sharma', 'Rohan'],
      totalSpent: 6800,
      myStanding: 1200
    },
    {
      id: 'grp_2',
      name: 'Goa Reunion 2026',
      description: 'Villa & Beach Club',
      members: ['You', 'Priya', 'Rahul', 'Ananya'],
      totalSpent: 24400,
      myStanding: -2600
    }
  ]);

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle Theme
  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  // Financial Metrics
  const totalBalance = 142650;
  const monthlyIncome = transactions.filter(t => t.transactionType === 'INCOME' || t.transactionType === 'LOAN_REPAYMENT_RECEIVED').reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = transactions.filter(t => t.transactionType === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? Math.round((netSavings / monthlyIncome) * 100) : 0;

  // Handle Pro Upgrade
  const handleUpgrade = async () => {
    setIsPro(true);
    setIsSubscriptionOpen(false);
    showToast('🎉 Congratulations! You have upgraded to HisabX Pro Financial OS!');
    try {
      await api.upgradeSubscription('pro');
    } catch (e) {}
  };

  // Statement Parser
  const handleParseStatement = () => {
    if (!statementText.trim()) {
      showToast('Please paste statement rows first');
      return;
    }
    const lines = statementText.split('\n').filter(l => l.trim().length > 0);
    const parsed = lines.map((line, i) => {
      const isCr = /cr|credit|salary|deposit/i.test(line);
      const amtMatch = line.match(/[\d,]+(?:\.\d{1,2})?/);
      const amt = amtMatch ? parseFloat(amtMatch[0].replace(/,/g, '')) : 500;
      return {
        id: `stmt_${Date.now()}_${i}`,
        date: '2026-10-24',
        description: line.substring(0, 35) || 'Bank Entry',
        category: isCr ? 'Salary' : 'Bank Expense',
        amount: amt,
        transactionType: isCr ? 'INCOME' : 'EXPENSE',
        status: 'COMPLETED'
      };
    });
    setParsedStatementTxs(parsed);
  };

  const handleCommitStatement = () => {
    setTransactions(prev => [...parsedStatementTxs, ...prev]);
    setIsStatementOpen(false);
    setStatementText('');
    setParsedStatementTxs([]);
    showToast(`✅ Successfully imported ${parsedStatementTxs.length} transactions into your ledger!`);
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDarkMode ? 'dark' : ''}`}>
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center space-x-2 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl animate-fadeIn text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 select-none">
        {/* Brand Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveView('dashboard')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-brand-700 to-indigo-600 dark:from-white dark:to-indigo-400 bg-clip-text text-transparent">HisabX</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/50">INR</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Enterprise SaaS OS</p>
            </div>
          </div>
        </div>

        {/* Quick Add CTA */}
        <div className="p-3">
          <button onClick={() => setIsSmartAddOpen(true)} className="w-full flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white font-medium text-xs shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Smart Quick Add</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded ml-1 font-mono">10s</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-xs font-semibold">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'transactions', label: 'Transactions', icon: Receipt, badge: transactions.length },
            { id: 'group-split', label: 'Group Split (Bills)', icon: Split, badge: 'SaaS' },
            { id: 'calendar', label: 'Calendar & Notes', icon: Calendar },
            { id: 'upi-connect', label: 'UPI Auto-Sync', icon: Zap, badge: 'Live' },
            { id: 'accounts', label: 'Accounts & Wallets', icon: Landmark },
            { id: 'debts', label: 'People & Debts', icon: Users },
            { id: 'budgets', label: 'Monthly Budgets', icon: PieChart },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(item => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                  active
                    ? 'bg-brand-50 dark:bg-slate-800 text-brand-500 dark:text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${active ? 'text-brand-500 dark:text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${active ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* SaaS Pro Plan Upgrade Banner */}
        <div className="px-3 pb-2">
          <div onClick={() => setIsSubscriptionOpen(true)} className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 via-brand-500/10 to-indigo-600/10 border border-amber-500/30 cursor-pointer hover:border-amber-500/60 transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center">
                <Crown className="w-3.5 h-3.5 mr-1 text-amber-500" />
                {isPro ? '⭐ Pro Active' : 'Upgrade Pro'}
              </span>
              <span className="text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded-full">SaaS</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">Bank AI Statement Parser & Splitwise Groups</p>
          </div>
        </div>

        {/* User Card */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                HX
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{user ? user.fullName : 'HisabX User'}</p>
                <p className="text-[10px] text-slate-400">{isPro ? 'Enterprise Tier' : 'Standard Tier'}</p>
              </div>
            </div>
            <button onClick={toggleTheme} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Sticky Header */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white capitalize tracking-tight">
              {activeView.replace('-', ' ')}
            </h1>
            <p className="text-[11px] text-slate-400">Production-Grade SaaS Personal Finance Engine</p>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button onClick={() => setIsStatementOpen(true)} className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold hover:bg-blue-100 transition-colors">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
              <span>Import Statement</span>
            </button>

            <button onClick={() => setIsSubscriptionOpen(true)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-sm shadow-amber-500/20 active:scale-95 transition-all">
              <Crown className="w-3.5 h-3.5 text-amber-200" />
              <span>{isPro ? 'Pro Active' : 'Upgrade Pro'}</span>
            </button>

            <button onClick={() => setIsSmartAddOpen(true)} className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm shadow-brand-500/20 active:scale-95 transition-all">
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {activeView === 'dashboard' && (
            <div className="space-y-6 animate-fadeIn">
              {/* 6 Key Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Available Balance</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">₹{formatINR(totalBalance)}</div>
                  <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-flex items-center">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> All Bank & UPI Accounts
                  </span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monthly Income</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">₹{formatINR(monthlyIncome)}</div>
                  <span className="text-[11px] text-slate-400 font-semibold mt-1 block">October 2026 Inflows</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monthly Expenses</span>
                  <div className="text-2xl font-black text-rose-600 mt-1">₹{formatINR(monthlyExpense)}</div>
                  <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Strict Ledger Debit Count</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Net Monthly Savings</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">₹{formatINR(netSavings)}</div>
                  <span className="text-[11px] text-indigo-600 font-bold mt-1 inline-block">Savings Rate: {savingsRate}%</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Money Owed To Me (Lent)</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">₹4,500.00</div>
                  <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Active Receivables</span>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Money I Owe (Borrowed)</span>
                  <div className="text-2xl font-black text-amber-600 mt-1">₹1,800.00</div>
                  <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Pending Payables</span>
                </div>
              </div>

              {/* Transactions List */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Recent Transactions</h3>
                  <button onClick={() => setActiveView('transactions')} className="text-xs text-brand-500 dark:text-indigo-400 font-bold hover:underline">
                    View All ({transactions.length})
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${tx.transactionType === 'INCOME' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {tx.transactionType === 'INCOME' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{tx.description}</p>
                          <p className="text-[11px] text-slate-400">{tx.category} • {tx.date}</p>
                        </div>
                      </div>
                      <span className={`font-black text-sm ${tx.transactionType === 'INCOME' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                        {tx.transactionType === 'INCOME' ? `+₹${formatINR(tx.amount)}` : `-₹${formatINR(tx.amount)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'group-split' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-xl flex items-center justify-between">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-xs font-bold border border-purple-400/30">
                    Splitwise Module
                  </span>
                  <h2 className="text-xl font-black mt-1">Group Bill Splitting & Roommate Debts</h2>
                  <p className="text-xs text-purple-200 mt-0.5">Fair-share calculations and automated debt settlement matrices.</p>
                </div>
                <button onClick={() => showToast('Group creation form opened!')} className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md">
                  Create Group
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map(grp => (
                  <div key={grp.id} className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white">{grp.name}</h3>
                        <p className="text-xs text-slate-400">{grp.description}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${grp.myStanding >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {grp.myStanding >= 0 ? `+₹${formatINR(grp.myStanding)}` : `-₹${formatINR(Math.abs(grp.myStanding))}`}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500">
                      <span>Total Spent: <strong>₹{formatINR(grp.totalSpent)}</strong></span> • <span>Members: {grp.members.join(', ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'transactions' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search transactions..." className="bg-transparent text-xs text-slate-900 dark:text-white outline-none w-48 sm:w-64" />
                </div>
                <button onClick={() => setIsStatementOpen(true)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                  Import Statement CSV
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase text-[10px] font-semibold">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-[11px] text-slate-500">{t.date}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{t.description}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">{t.category}</span></td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${t.transactionType === 'INCOME' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{t.transactionType}</span></td>
                        <td className={`p-3 text-right font-black ${t.transactionType === 'INCOME' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>₹{formatINR(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Subscription Modal */}
      {isSubscriptionOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={() => setIsSubscriptionOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">SaaS Billing & Plans</span>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">Upgrade to HisabX Pro</h3>
              </div>
              <button onClick={() => setIsSubscriptionOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold uppercase text-slate-400">Starter Tier</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white">₹0 <span className="text-xs text-slate-400">/ forever</span></div>
                <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                  <li className="flex items-center space-x-1.5"><Check className="w-4 h-4 text-emerald-500" /><span>Up to 3 Accounts</span></li>
                  <li className="flex items-center space-x-1.5"><Check className="w-4 h-4 text-emerald-500" /><span>Basic Ledger & Calendar</span></li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl border-2 border-amber-500 bg-amber-500/5 space-y-3 shadow-lg">
                <span className="text-xs font-bold uppercase text-amber-600">Pro Financial OS</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white">₹1,499 <span className="text-xs text-slate-400">/ year</span></div>
                <ul className="text-xs space-y-2 text-slate-700 dark:text-slate-200 font-medium">
                  <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span>Unlimited Accounts & Wallets</span></li>
                  <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span>Bank Statement AI Parser</span></li>
                  <li className="flex items-center space-x-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span>Group Split (Splitwise)</span></li>
                </ul>
                <button onClick={handleUpgrade} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-md">
                  Upgrade with 1-Click
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statement Parser Modal */}
      {isStatementOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={() => setIsStatementOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Bank Statement AI Importer</h3>
              <button onClick={() => setIsStatementOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <textarea
              rows={5}
              value={statementText}
              onChange={e => setStatementText(e.target.value)}
              placeholder="Paste your statement rows here:&#10;24-10-2026, SWIGGY RESTAURANT, Dr, 580.00&#10;25-10-2026, SALARY CREDIT TECH CORP, Cr, 95000.00"
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />

            <div className="flex justify-between items-center">
              <button onClick={() => setStatementText("24-10-2026, SWIGGY RESTAURANT, Dr, 580.00\n24-10-2026, PETROL HPCL PUNE, Dr, 1500.00\n25-10-2026, SALARY TECH CORP, Cr, 95000.00")} className="text-xs text-brand-500 font-bold hover:underline">
                Load Sample Rows
              </button>
              <button onClick={handleParseStatement} className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-md">
                Parse Rows
              </button>
            </div>

            {parsedStatementTxs.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600">Detected {parsedStatementTxs.length} transactions!</span>
                  <button onClick={handleCommitStatement} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
                    Confirm & Commit to Ledger
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Add Modal */}
      {isSmartAddOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={() => setIsSmartAddOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>10-Second Smart NLP Add</span>
              </h3>
              <button onClick={() => setIsSmartAddOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <input
              type="text"
              value={smartInput}
              onChange={e => setSmartInput(e.target.value)}
              placeholder="e.g. Tea 20 cash, Salary 85000 bank, Rahul ko 500 diye"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
            />

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setIsSmartAddOpen(false)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (smartInput.trim()) {
                    setTransactions(prev => [
                      {
                        id: `tx_${Date.now()}`,
                        date: '2026-10-24',
                        description: smartInput,
                        category: 'Quick Add',
                        amount: parseFloat(smartInput.match(/\d+/)?.[0] || '100'),
                        transactionType: /salary|income|credited/i.test(smartInput) ? 'INCOME' : 'EXPENSE',
                        status: 'COMPLETED'
                      },
                      ...prev
                    ]);
                    setSmartInput('');
                    setIsSmartAddOpen(false);
                    showToast('Transaction added to ledger!');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md"
              >
                Log Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
