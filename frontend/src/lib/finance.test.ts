import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive, eventsBetween, projection, validAllocations, dayDiff } from './finance.ts';
import type { FinancialEntry, Snapshot } from '../models.ts';
// Fixed dates and explicit "now" arguments keep these scenarios independent of the test run date.
const event = (overrides: Partial<FinancialEntry> = {}): FinancialEntry => ({
  id: 'expense',
  name: 'Rent',
  kind: 'expense',
  source: 'manual',
  amount: 100,
  date: '2026-09-06',
  variability: 'static',
  recurring: false,
  category: 'Housing',
  accountId: 'checking',
  includedInForecast: true,
  completed: false,
  ...overrides,
});
const fixture = (entries: FinancialEntry[] = []): Snapshot => ({
  accounts: [
    {
      id: 'checking',
      name: 'Checking',
      institution: 'Test',
      lastFour: '0000',
      balance: 1000,
      type: 'checking',
      liquid: true,
      sync: { state: 'nominal', lastSyncedAt: '2026-09-04' },
    },
  ],
  entries,
  allocations: [],
  settings: { reserve: 200, sinkingFund: 50, dailyPlan: 30, ambient: false },
  allocatedTotal: 0,
});
const pay = event({
  id: 'pay',
  kind: 'income',
  primaryPaycheck: true,
  amount: 500,
  date: '2026-09-10',
  recurring: true,
  recurrence: { frequency: 'biweekly' },
});
test('safe allocation subtracts expenses, dynamic allowances, sinking funds, and reserve; never adds expected income', () => {
  const state = derive(
    fixture([pay, event(), event({ id: 'dynamic', variability: 'dynamic', amount: 75 })]),
    '2026-09-04',
  );
  assert.equal(state.safe, 575);
  assert.equal(state.days, 6);
  assert.equal(state.before, 775);
  assert.equal(state.after, 1275);
});
test('expenses on payday are protected; expenses after payday are outside the window', () => {
  const state = derive(
    fixture([
      pay,
      event({ date: '2026-09-10' }),
      event({ id: 'later', date: '2026-09-11', amount: 900 }),
    ]),
    '2026-09-04',
  );
  assert.equal(state.fixed, 100);
});
test('overdue unpaid obligations remain reserved; paid, excluded, and skipped items do not', () => {
  const entries = [
    pay,
    event({ id: 'overdue', date: '2026-09-01' }),
    event({ id: 'paid', completed: true }),
    event({ id: 'excluded', includedInForecast: false }),
    event({ id: 'skip', skippedDates: ['2026-09-06'] }),
  ];
  const state = derive(fixture(entries), '2026-09-04');
  assert.equal(state.fixed, 100);
  assert.equal(state.safe, 650);
});
test('month-end recurrence remains anchored across shorter months', () => {
  const e = event({
    date: '2026-01-31',
    recurring: true,
    recurrence: { frequency: 'monthly' },
  });
  assert.deepEqual(
    eventsBetween([e], '2026-01-01', '2026-04-30').map((e) => e.date),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
  );
});
test('completed first occurrence retains future recurrence and supports a skipped occurrence', () => {
  const e = event({
    date: '2026-09-01',
    completed: true,
    recurring: true,
    recurrence: { frequency: 'weekly' },
    skippedDates: ['2026-09-08'],
  });
  assert.deepEqual(
    eventsBetween([e], '2026-09-01', '2026-09-30').map((e) => e.date),
    ['2026-09-15', '2026-09-22', '2026-09-29'],
  );
});
test('custom interval, biweekly, quarterly and annual rules are supported', () => {
  for (const [frequency, next, intervalDays] of [
    ['custom', '2026-09-04', 3],
    ['biweekly', '2026-09-15', undefined],
    ['quarterly', '2026-12-01', undefined],
    ['annual', '2027-09-01', undefined],
  ] as const) {
    const e = event({
      date: '2026-09-01',
      recurring: true,
      recurrence: { frequency, intervalDays },
    });
    assert.equal(eventsBetween([e], '2026-09-01', next)[1].date, next);
  }
});
test('negative available cash is exposed, while allocation validation rejects overspending and invalid amounts', () => {
  assert.equal(derive(fixture([pay, event({ amount: 1200 })]), '2026-09-04').safe, -450);
  const a = (amount: number) => [{ id: 'a', name: 'Savings', amount, color: '#fff' }];
  assert.equal(validAllocations(a(100.01), 100), false);
  assert.equal(validAllocations(a(-1), 100), false);
  assert.equal(validAllocations(a(NaN), 100), false);
  assert.equal(validAllocations(a(100), 100), true);
  assert.equal(validAllocations(a(1), -10), false);
});
test('projection incorporates recurrence, income, static/dynamic expenses and sinking contributions', () => {
  const s = fixture([pay, event(), event({ id: 'variable', amount: 50, variability: 'dynamic' })]);
  const points = projection(s, 30, '2026-09-04');
  assert.equal(points.length, 31);
  assert.equal(points[0].balance, 1000);
  assert.equal(points.at(-1)?.balance, 1800);
});
test('day counts are stable across daylight saving transitions', () => {
  assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(dayDiff('2026-10-31', '2026-11-02'), 2);
});
test('semimonthly income preserves two anchored days across months', () => {
  const e = event({
    kind: 'income',
    date: '2026-01-21',
    recurring: true,
    recurrence: { frequency: 'semimonthly' },
  });
  assert.deepEqual(
    eventsBetween([e], '2026-01-01', '2026-03-31').map((e) => e.date),
    ['2026-01-21', '2026-02-06', '2026-02-21', '2026-03-06', '2026-03-21'],
  );
});
test('projection and pre-payday summary reserve the same sinking contribution', () => {
  const s = fixture([pay, event()]);
  const state = derive(s, '2026-09-04');
  const points = projection(s, 30, '2026-09-04');
  assert.equal(points.find((p) => p.date === '2026-09-09')?.balance, state.before);
  assert.equal(points.find((p) => p.date === '2026-09-10')?.balance, state.after);
});
test('missed recurring occurrences remain protected until each is settled or skipped', () => {
  const s = fixture([
    pay,
    event({
      date: '2026-07-06',
      recurring: true,
      recurrence: { frequency: 'monthly' },
      completed: true,
    }),
  ]);
  assert.equal(derive(s, '2026-09-04').fixed, 200);
});
