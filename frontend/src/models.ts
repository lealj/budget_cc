// Monetary values use USD dollars; financial dates use local YYYY-MM-DD strings.
// Synchronization timestamps are ISO instants rather than calendar dates.
export type EntryKind = 'income' | 'expense';
export type Variability = 'static' | 'dynamic';
export type EntrySource = 'manual' | 'synced' | 'projected';
export type Frequency =
  'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
export interface RecurringRule {
  frequency: Frequency;
  intervalDays?: number;
}
export type RecurrenceRule = RecurringRule;
export interface FinancialEntry {
  id: string;
  kind: EntryKind;
  source: EntrySource;
  name: string;
  /** Positive magnitude; kind determines cash-flow direction. */
  amount: number;
  /** Due/expected date, also the anchor for recurring occurrences. */
  date: string;
  variability: Variability;
  recurring: boolean;
  recurrence?: RecurringRule;
  category: string;
  accountId: string;
  includedInForecast: boolean;
  /** Settlement state of the anchored occurrence, not the entire recurring series. */
  completed: boolean;
  completedAt?: string;
  /** Suppressed occurrence dates; the mock also uses these for later settlements. */
  skippedDates?: string[];
  merchant?: string;
  notes?: string;
  primaryPaycheck?: boolean;
}
export type Income = FinancialEntry & { kind: 'income' };
export type Expense = FinancialEntry & { kind: 'expense' };
export interface SyncStatus {
  state: 'nominal' | 'syncing' | 'attention';
  lastSyncedAt: string;
  message?: string;
}
export interface Account {
  id: string;
  institution: string;
  name: string;
  lastFour: string;
  type: 'checking' | 'savings' | 'credit';
  /** Cash held for deposit accounts; outstanding debt for credit accounts. */
  balance: number;
  liquid: boolean;
  sync: SyncStatus;
}
export interface CreditCardAccount extends Account {
  type: 'credit';
  creditLimit: number;
  paymentDate: string;
  upcomingPayment: number;
}
export interface Allocation {
  id: string;
  name: string;
  amount: number;
  color: string;
}
/** Expanded forecast occurrence; entryId links back to the editable source entry. */
export interface CashFlowEvent {
  id: string;
  entryId: string;
  name: string;
  date: string;
  amount: number;
  kind: EntryKind;
}
export interface Settings {
  reserve: number;
  sinkingFund: number;
  dailyPlan: number;
  ambient: boolean;
}
/** Service response containing the inputs needed to derive a consistent financial view. */
export interface Snapshot {
  accounts: (Account | CreditCardAccount)[];
  entries: FinancialEntry[];
  allocations: Allocation[];
  settings: Settings;
  /** Session reservations already removed from liquid balances; never subtract again. */
  allocatedTotal: number;
}
