import type { Snapshot, FinancialEntry, Allocation } from '../models';
import { addDays, cents, derive, today, validAllocations } from '../lib/finance';
// Simulated network latency lets the UI exercise its pending-request states without a backend.
const delay = () => new Promise((resolve) => setTimeout(resolve, 350));
// Relative dates keep the demo useful on any launch date. Completed history is in opening balances.
function seed(): Snapshot {
  const date = today(),
    sync = {
      state: 'nominal' as const,
      lastSyncedAt: new Date(Date.now() - 134000).toISOString(),
    };
  const entry = (
    id: string,
    name: string,
    amount: number,
    offset: number,
    category: string,
    dynamic = false,
  ): FinancialEntry => ({
    id,
    name,
    amount,
    date: addDays(date, offset),
    category,
    kind: 'expense',
    source: 'manual',
    variability: dynamic ? 'dynamic' : 'static',
    recurring: true,
    recurrence: { frequency: dynamic ? 'biweekly' : 'monthly' },
    accountId: 'checking',
    includedInForecast: true,
    completed: false,
  });
  return {
    accounts: [
      {
        id: 'checking',
        institution: 'Chase',
        name: 'Primary checking',
        lastFour: '4821',
        type: 'checking',
        balance: 10480,
        liquid: true,
        sync,
      },
      {
        id: 'savings',
        institution: 'Ally',
        name: 'Cash savings',
        lastFour: '0916',
        type: 'savings',
        balance: 2000,
        liquid: true,
        sync,
      },
      {
        id: 'sapphire',
        institution: 'Chase',
        name: 'Sapphire Preferred',
        lastFour: '6042',
        type: 'credit',
        balance: 1245.82,
        liquid: false,
        creditLimit: 15000,
        paymentDate: addDays(date, 6),
        upcomingPayment: 350,
        sync,
      },
      {
        id: 'amex',
        institution: 'American Express',
        name: 'Blue Cash Everyday',
        lastFour: '1008',
        type: 'credit',
        balance: 428.5,
        liquid: false,
        creditLimit: 10000,
        paymentDate: addDays(date, 18),
        upcomingPayment: 428.5,
        sync,
      },
    ],
    entries: [
      {
        ...entry('pay', 'Primary paycheck', 3850, 9, 'Salary'),
        kind: 'income',
        primaryPaycheck: true,
        source: 'synced',
        recurrence: { frequency: 'biweekly' },
      },
      entry('rent', 'Rent · Parkside apartment', 1250, 2, 'Housing'),
      entry('car', 'Auto loan payment', 325, 4, 'Transport'),
      {
        ...entry('card', 'Chase Sapphire payment', 350, 6, 'Credit card'),
        source: 'synced',
        notes: 'Payment from checking to Sapphire Preferred.',
        merchant: 'Chase',
      },
      entry('internet', 'Internet · AT&T', 65, 7, 'Utilities'),
      entry('subscription', 'Subscriptions', 40, 8, 'Subscriptions'),
      entry('groceries', 'Groceries allowance', 450, 5, 'Groceries', true),
      entry('gas', 'Fuel & transport allowance', 200, 8, 'Transport', true),
      entry('utility', 'Electricity · City utilities', 115, 12, 'Utilities', true),
      {
        ...entry('previous', 'Primary paycheck', 3850, -5, 'Salary'),
        kind: 'income',
        completed: true,
        recurring: false,
        source: 'synced',
      },
      {
        ...entry('food1', 'Whole Foods Market', 128.4, -4, 'Groceries', true),
        completed: true,
        recurring: false,
        source: 'synced',
      },
      {
        ...entry('food2', 'Neighborhood coffee', 16.5, -3, 'Dining', true),
        completed: true,
        recurring: false,
        source: 'synced',
      },
      {
        ...entry('gas1', 'Shell fuel station', 54.2, -2, 'Transport', true),
        completed: true,
        recurring: false,
        source: 'synced',
      },
      {
        ...entry('food3', 'Weekly groceries', 86.9, -1, 'Groceries', true),
        completed: true,
        recurring: false,
        source: 'manual',
      },
    ],
    allocations: [
      {
        id: 'car-extra',
        name: 'Extra car payment',
        amount: 1000,
        color: '#77c8b3',
      },
      { id: 'roth', name: 'Roth IRA', amount: 500, color: '#648fac' },
      { id: 'brokerage', name: 'Brokerage', amount: 750, color: '#8e9eb7' },
      { id: 'save', name: 'Savings', amount: 1250, color: '#3e827c' },
    ],
    settings: { reserve: 2500, sinkingFund: 400, dailyPlan: 65, ambient: true },
    allocatedTotal: 0,
  };
}
// Session-only service state. Return detached responses so UI drafts cannot mutate it implicitly.
let db = seed();
const copy = <T>(value: T): T => structuredClone(value);
// direction reverses/reapplies settlements; credit balances represent debt, so their sign is inverted.
function applyAccountBalance(entry: FinancialEntry, direction: 1 | -1) {
  const account = db.accounts.find((a) => a.id === entry.accountId);
  if (account)
    account.balance = cents(
      account.balance +
        direction *
          (account.type === 'credit' ? -1 : 1) *
          (entry.kind === 'income' ? entry.amount : -entry.amount),
    );
}
export const financeService = {
  // Future backend request: retrieve synchronized bank and credit-card accounts.
  async getAccounts() {
    await delay();
    return copy(db.accounts);
  },
  // Future backend request: retrieve normalized manual and Plaid-backed financial entries.
  async getTransactions() {
    await delay();
    return copy(db.entries);
  },
  // Future backend request: retrieve accounts, entries, allocation state, and operating limits together.
  async getSnapshot() {
    await delay();
    return copy(db);
  },
  // Future backend request: trigger account synchronization and retrieve connection status.
  async syncAccounts() {
    await delay();
    db.accounts = db.accounts.map((a) => ({
      ...a,
      sync: { state: 'nominal', lastSyncedAt: new Date().toISOString() },
    }));
    return copy(db.accounts);
  },
  // Future backend request: create or update a manual financial entry.
  async saveEntry(entry: FinancialEntry) {
    await delay();
    // Only one income source may define the next-paycheck planning window.
    if (entry.primaryPaycheck)
      db.entries = db.entries.map((e) => ({ ...e, primaryPaycheck: false }));
    const i = db.entries.findIndex((e) => e.id === entry.id);
    // Editing a settled entry replaces its balance effect, including when its account changes.
    if (i >= 0 && db.entries[i].completed) applyAccountBalance(db.entries[i], -1);
    if (entry.completed) applyAccountBalance(entry, 1);
    if (i < 0) db.entries.push(copy(entry));
    else db.entries[i] = copy(entry);
    return copy(db);
  },
  // Future backend request: delete the financial entry and its future occurrences.
  async deleteEntry(id: string) {
    await delay();
    // Removing a record does not reverse money already paid or received.
    db.entries = db.entries.filter((e) => e.id !== id);
    return copy(db);
  },
  // Future backend request: settle an occurrence and update its associated account atomically.
  async completeEntry(id: string, date?: string) {
    await delay();
    const e = db.entries.find((e) => e.id === id);
    if (!e) throw Error('Entry not found.');
    const occurrence = date ?? e.date;
    // Make settlement idempotent per occurrence, including repeated UI requests.
    if (e.skippedDates?.includes(occurrence) || (e.completed && occurrence === e.date))
      return copy(db);
    applyAccountBalance(e, 1);
    if (occurrence === e.date) {
      e.completed = true;
      e.completedAt = today();
    } else e.skippedDates = [...(e.skippedDates ?? []), occurrence];
    return copy(db);
  },
  // Future backend request: skip a single forecast occurrence without deleting the recurring rule.
  async skipEntry(id: string, date: string) {
    await delay();
    db.entries = db.entries.map((e) =>
      e.id === id ? { ...e, skippedDates: [...(e.skippedDates ?? []), date] } : e,
    );
    return copy(db);
  },
  // Future backend request: store an allocation plan and reserve its cash atomically; this mock makes no transfers.
  async allocate(allocations: Allocation[]) {
    await delay();
    // Revalidate after the async boundary; another operation may have changed available cash.
    const safe = derive(db).safe;
    if (!validAllocations(allocations, safe)) throw Error('Allocation exceeds available cash.');
    const total = cents(allocations.reduce((s, a) => s + a.amount, 0));
    // Consume positive liquid balances in account order. This mock reserves cash, not transfers it.
    let remaining = total;
    db.accounts = db.accounts.map((a) => {
      if (!a.liquid) return a;
      const taken = Math.min(Math.max(0, a.balance), remaining);
      remaining = cents(remaining - taken);
      return { ...a, balance: cents(a.balance - taken) };
    });
    db.allocatedTotal = cents(db.allocatedTotal + total);
    db.allocations = allocations.map((a) => ({ ...a, amount: 0 }));
    return copy(db);
  },
  // Future backend request: update reserve and forecast preferences.
  async saveSettings(settings: Snapshot['settings']) {
    await delay();
    db.settings = copy(settings);
    return copy(db);
  },
};
