import type {
  Allocation,
  CashFlowEvent,
  FinancialEntry,
  RecurringRule,
  Snapshot,
} from '../models.ts';
export const money = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
// Round dollar totals to cents; the small epsilon offsets some floating-point rounding errors.
export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Treat due dates as local calendar dates, avoiding UTC parsing and midnight DST transitions.
export const parseDate = (d: string) => new Date(`${d}T12:00:00`);
export const today = () => iso(new Date());
export const addDays = (d: string, days: number) => {
  const date = parseDate(d);
  date.setDate(date.getDate() + days);
  return iso(date);
};
// Compare calendar components in UTC so 23/25-hour days still count as one day.
export const dayDiff = (a: string, b: string) =>
  Math.round((Date.UTC(...dateParts(b)) - Date.UTC(...dateParts(a))) / 86400000);
function dateParts(d: string): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m - 1, day];
}
export const shortDate = (d: string) =>
  parseDate(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
// Always expand from the original anchor: Jan 31 -> Feb 28 must not shift March to the 28th.
function occurrenceDate(anchor: string, rule: RecurringRule, n: number): string {
  const days = {
    weekly: 7,
    biweekly: 14,
    custom: Math.max(1, rule.intervalDays || 1),
  };
  if (rule.frequency in days) return addDays(anchor, days[rule.frequency as keyof typeof days] * n);
  const date = parseDate(anchor);
  if (rule.frequency === 'semimonthly') {
    // Two anchored payments per month, clamped to the month's last day.
    const first = date.getDate() > 15 ? date.getDate() - 15 : date.getDate(),
      second = Math.min(first + 15, 31);
    const index = (date.getDate() > 15 ? 1 : 0) + n;
    const month = new Date(date.getFullYear(), date.getMonth() + Math.floor(index / 2), 1, 12);
    month.setDate(
      Math.min(
        index % 2 === 0 ? first : second,
        new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
      ),
    );
    return iso(month);
  }
  const step = rule.frequency === 'annual' ? 12 : rule.frequency === 'quarterly' ? 3 : 1;
  const target = new Date(date.getFullYear(), date.getMonth() + n * step, 1, 12);
  target.setDate(
    Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()),
  );
  return iso(target);
}
/** Expand included, unsettled occurrences within the inclusive [from, to] date range. */
export function eventsBetween(
  entries: FinancialEntry[],
  from: string,
  to: string,
): CashFlowEvent[] {
  const events: CashFlowEvent[] = [];
  for (const entry of entries) {
    if (!entry.includedInForecast) continue;
    // Bound expansion for unusually old anchors or very long requested horizons.
    for (let n = 0; n < 40000; n++) {
      const date =
        n === 0
          ? entry.date
          : entry.recurring && entry.recurrence
            ? occurrenceDate(entry.date, entry.recurrence, n)
            : '';
      if (!date || date > to) break;
      // Completing the anchor suppresses only that occurrence; later repeats remain forecastable.
      if (date >= from && !(n === 0 && entry.completed) && !entry.skippedDates?.includes(date))
        events.push({
          id: `${entry.id}:${date}`,
          entryId: entry.id,
          name: entry.name,
          date,
          amount: entry.amount,
          kind: entry.kind,
        });
      if (!entry.recurring || !entry.recurrence) break;
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
/** Derive allocation clearance and payday balances without mutating service data. */
export function derive(snapshot: Snapshot, now = today()) {
  const liquid = cents(
    snapshot.accounts.filter((a) => a.liquid).reduce((sum, a) => sum + a.balance, 0),
  );
  const future = eventsBetween(snapshot.entries, now, addDays(now, 400));
  const paycheck = future.find(
    (e) => snapshot.entries.find((x) => x.id === e.entryId)?.primaryPaycheck && e.kind === 'income',
  );
  // Keep a planning window even when no primary paycheck is scheduled in the lookup horizon.
  const end = paycheck?.date ?? addDays(now, 14);
  // Unpaid overdue expenses remain obligations until explicitly settled or skipped.
  const expenses = snapshot.entries.filter((e) => e.kind === 'expense');
  const earliest = expenses.reduce((date, entry) => (entry.date < date ? entry.date : date), now);
  const obligations = eventsBetween(expenses, earliest, end);
  const total = (v: 'static' | 'dynamic') =>
    cents(
      obligations
        .filter((e) => snapshot.entries.find((x) => x.id === e.entryId)?.variability === v)
        .reduce((s, e) => s + e.amount, 0),
    );
  const fixed = total('static'),
    variable = total('dynamic');
  // Expected income is not deployable cash. Preserve negative values to expose shortfalls.
  const safe = cents(
    liquid - fixed - variable - snapshot.settings.sinkingFund - snapshot.settings.reserve,
  );
  // The payday balance includes earlier income; the reserve remains cash, not an expense.
  const before = cents(
    liquid -
      fixed -
      variable -
      snapshot.settings.sinkingFund +
      future.filter((e) => e.kind === 'income' && e.date < end).reduce((s, e) => s + e.amount, 0),
  );
  return {
    liquid,
    paycheck,
    end,
    days: dayDiff(now, end),
    fixed,
    variable,
    safe,
    before,
    after: cents(before + (paycheck?.amount ?? 0)),
    obligations,
    future,
  };
}
/** Daily closing balances, including today's scheduled events and a catch-up for overdue bills. */
export function projection(snapshot: Snapshot, days: number, now = today()) {
  const state = derive(snapshot, now);
  const events = eventsBetween(snapshot.entries, now, addDays(now, days));
  let balance = state.liquid;
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = addDays(now, i);
    const daily = events.filter((e) => e.date === date);
    // Reserve the first sinking contribution before payday, then repeat every 30 days.
    const sinkingOffset = Math.max(0, state.days - 1);
    if (i >= sinkingOffset && (i - sinkingOffset) % 30 === 0) {
      daily.push({
        id: `sinking:${date}`,
        entryId: 'sinking-fund',
        name: 'Sinking-fund contribution',
        date,
        kind: 'expense',
        amount: snapshot.settings.sinkingFund,
      });
    }
    balance += daily.reduce((s, e) => s + (e.kind === 'income' ? e.amount : -e.amount), 0);
    // Overdue occurrences are outside the forward event range; charge them once at the start.
    if (i === 0)
      balance -= state.obligations.filter((e) => e.date < now).reduce((s, e) => s + e.amount, 0);
    return { date, balance: cents(balance), events: daily };
  });
}
/** Shared by UI and service; compare cent-rounded totals and disallow deploying a cash shortfall. */
export function validAllocations(allocations: Allocation[], safe: number) {
  return (
    allocations.every((a) => Number.isFinite(a.amount) && a.amount >= 0) &&
    cents(allocations.reduce((s, a) => s + a.amount, 0)) <= Math.max(0, safe)
  );
}
