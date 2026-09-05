/**
 * Composes the overview panels from the current snapshot. Financial calculations
 * live in lib/finance; saving and navigation are delegated to App via callbacks.
 */
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Crosshair,
  Gauge,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { Allocation, CreditCardAccount, FinancialEntry, Snapshot } from '../models';
import { addDays, cents, derive, money, shortDate, today } from '../lib/finance';
import {
  CommandPanel,
  DataRow,
  MetricDisplay,
  SectionHeader,
  StatusIndicator,
  SystemLabel,
  StaticDynamicIndicator,
} from './ui';
import { CashFlowTimeline, ProjectionChart, SpendingChart } from './charts';
import { AllocationControls } from './AllocationControls';
import { CreditCards } from './Accounts';
import { EntryActions } from './Ledger';
import type { EntryAction } from './Ledger';
// Props include both data to display and callbacks for actions owned by the parent.
interface DashboardProps {
  snapshot: Snapshot;
  days: number;
  setDays: (n: number) => void;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  onSettings: () => void;
  setView: (view: 'overview' | 'cashflow' | 'allocations' | 'accounts') => void;
  edit: (entry: FinancialEntry) => void;
  action: EntryAction;
  allocate: (items: Allocation[]) => Promise<void>;
  safeChange: number;
  draftAllocations: Allocation[];
  onAllocationChange: (items: Allocation[]) => void;
}
export function Dashboard({
  snapshot,
  days,
  setDays,
  expanded,
  setExpanded,
  onSettings,
  setView,
  edit,
  action,
  allocate,
  safeChange,
  draftAllocations,
  onAllocationChange,
}: DashboardProps) {
  // Build the main metrics and select the account groups used by the panels below.
  // The mock always supplies a checking account, which is why this lookup uses !.
  const state = derive(snapshot),
    checking = snapshot.accounts.find((a) => a.type === 'checking')!,
    cards = snapshot.accounts.filter((a) => a.type === 'credit') as CreditCardAccount[];
  // Spending velocity follows actual settlement dates; seeded history falls back to the entry date.
  const settledDate = (entry: FinancialEntry) => entry.completedAt ?? entry.date;
  // Find the latest received salary/paycheck to establish the spending comparison window.
  const recentPay = snapshot.entries
    .filter(
      (e) =>
        e.kind === 'income' &&
        (e.primaryPaycheck || e.category === 'Salary') &&
        e.completed &&
        settledDate(e) <= today(),
    )
    .sort((a, b) => settledDate(b).localeCompare(settledDate(a)))[0];
  const lastPayDate = recentPay ? settledDate(recentPay) : addDays(today(), -14);
  const spentEntries = snapshot.entries.filter(
    (e) =>
      e.kind === 'expense' &&
      e.completed &&
      settledDate(e) >= lastPayDate &&
      settledDate(e) <= today(),
  );
  // reduce adds up completed expenses; at least one day avoids dividing by zero on payday.
  const spent = cents(spentEntries.reduce((s, e) => s + e.amount, 0)),
    elapsed = Math.max(
      1,
      Math.round((new Date(today()).getTime() - new Date(lastPayDate).getTime()) / 86400000),
    ),
    average = spent / elapsed,
    pace = snapshot.settings.dailyPlan > 0 ? average / snapshot.settings.dailyPlan : 0;
  // Produce seven daily totals in order, including zero for days with no settled expenses.
  const dailySpent = Array.from({ length: 7 }, (_, i) =>
    spentEntries
      .filter((e) => settledDate(e) === addDays(today(), i - 6))
      .reduce((s, e) => s + e.amount, 0),
  );
  return (
    <div className="overview-layout">
      <div className="dashboard-grid">
        <div className="primary-column">
          {/* The dominant metric and its deductions come from the same derived result. */}
          <CommandPanel className={`safe-panel ${state.safe < 0 ? 'negative' : ''}`}>
            <div className="safe-content">
              <div className="safe-title">
                <span className="crosshair-mark">⌖</span>
                <SystemLabel>SAFE TO ALLOCATE</SystemLabel>
                <span className="panel-id">CAPITAL / 001</span>
              </div>
              <div className="safe-value">
                <MetricDisplay value={Math.trunc(state.safe)} />
                <span>.{String(Math.round(Math.abs(state.safe % 1) * 100)).padStart(2, '0')}</span>
                <span className="currency">USD</span>
              </div>
              <div className="safe-context">
                <span className={state.safe >= 0 ? 'accent' : 'warning'}>
                  <ArrowUpRight size={13} />
                  {state.safe >= 0
                    ? 'Capital ready for deployment'
                    : 'Cash shortfall · review obligations'}
                </span>
                <span>Protected through {shortDate(state.end)}</span>
              </div>
              <div className="safe-lower">
                <StatusIndicator tone={state.variable > 0 ? 'neutral' : 'good'}>
                  {state.variable > 0 ? 'INCLUDES SPENDING ESTIMATES' : 'FORECAST NOMINAL'}
                </StatusIndicator>
                <span className="mono muted">
                  {safeChange === 0
                    ? 'BASELINE ESTABLISHED · DEMO'
                    : `${safeChange > 0 ? '+' : '−'}${money(Math.abs(safeChange), 2)} SINCE LAST UPDATE`}
                </span>
              </div>
            </div>
            <div className="safe-calculation">
              <SystemLabel>CAPITAL CLEARANCE</SystemLabel>
              <DataRow label="Liquid cash" value={money(state.liquid)} />
              <DataRow label="Upcoming expenses" value={`− ${money(state.fixed)}`} />
              <DataRow label="Variable spending" value={`− ${money(state.variable)}`} />
              <DataRow label="Sinking funds" value={`− ${money(snapshot.settings.sinkingFund)}`} />
              <DataRow label="Minimum reserve" value={`− ${money(snapshot.settings.reserve)}`} />
              <button
                className="text-button formula-button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                Inspect calculation <ChevronDown size={13} className={expanded ? 'rotated' : ''} />
              </button>
            </div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  className="calculation-expanded"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <p>
                    Cash available now, less all included expense occurrences through{' '}
                    {shortDate(state.end)}, variable allowances, sinking funds, and your reserve.
                    Expected income is excluded until received.
                  </p>
                  <div className="mono">
                    {money(state.liquid)} − {money(state.fixed)} − {money(state.variable)} −{' '}
                    {money(snapshot.settings.sinkingFund)} − {money(snapshot.settings.reserve)} ={' '}
                    <b className="accent">{money(state.safe, 2)}</b>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CommandPanel>
          <CommandPanel className="projection-panel">
            <SectionHeader
              index="01"
              title="Cash-flow projection"
              action={
                <div className="segmented">
                  {[30, 60, 90].map((d) => (
                    <button
                      key={d}
                      className={days === d ? 'active' : ''}
                      aria-pressed={days === d}
                      onClick={() => setDays(d)}
                    >
                      {d}D
                    </button>
                  ))}
                </div>
              }
            />
            <div className="projection-meta">
              <span>
                <span className="status-dot" /> FORECAST MODEL ACTIVE
              </span>
              <span>USD / LIQUID BALANCE</span>
            </div>
            <ProjectionChart snapshot={snapshot} days={days} />
          </CommandPanel>
          <CommandPanel className="obligations-panel">
            <SectionHeader
              index="02"
              title="Upcoming obligations"
              action={
                <span className="small-tag">
                  BEFORE NEXT PAYCHECK <b>{state.obligations.length}</b>
                </span>
              }
            />
            <CashFlowTimeline events={state.future} end={state.end} />
            <div className="table-scroll">
              <table className="obligations-table">
                <thead>
                  <tr>
                    <th>Obligation</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th className="align-right">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {state.obligations.map((event) => {
                    const entry = snapshot.entries.find((e) => e.id === event.entryId)!;
                    return (
                      <tr key={event.id}>
                        <td>
                          <div className="obligation-name">
                            <span className={`obligation-symbol ${entry.variability}`}>
                              {entry.variability === 'dynamic' ? (
                                <Activity size={14} />
                              ) : (
                                <span>—</span>
                              )}
                            </span>
                            <div>
                              <strong>{entry.name}</strong>
                              <small>
                                {snapshot.accounts.find((a) => a.id === entry.accountId)?.name}{' '}
                                <span>·</span> {entry.source.toUpperCase()} <span>·</span>{' '}
                                <StaticDynamicIndicator value={entry.variability} />
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="mono muted">{shortDate(event.date)}</td>
                        <td className="mono">{money(event.amount, 2)}</td>
                        <td>
                          <span className="table-status">
                            {event.date < today() ? 'OVERDUE' : 'RESERVED'}
                          </span>
                        </td>
                        <td>
                          {/* This row is an unsettled occurrence even if its source anchor was paid. */}
                          <EntryActions
                            entry={{ ...entry, completed: false }}
                            onEdit={() => edit(entry)}
                            onAction={action}
                            date={event.date}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {state.obligations.length === 0 && (
                <div className="empty-state">
                  All clear. No obligations before your next paycheck.
                </div>
              )}
            </div>
            <div className="table-footer">
              <span>
                <span className="tiny-square" /> {money(state.fixed + state.variable)} PROTECTED FOR
                UPCOMING EXPENSES
              </span>
              <button className="text-button" onClick={() => setView('cashflow')}>
                Open cash-flow ledger <ArrowRight size={13} />
              </button>
            </div>
          </CommandPanel>
        </div>
        <div className="secondary-column">
          <CommandPanel className="paycheck-panel">
            <SectionHeader
              title="Next paycheck"
              action={<CalendarDays size={15} className="muted" />}
            />
            <div className="paycheck-main">
              <span className="countdown">
                {String(state.days).padStart(2, '0')}
                <small>DAYS</small>
              </span>
              <div>
                <strong>{state.paycheck ? shortDate(state.end) : 'No primary paycheck'}</strong>
                <span>{state.paycheck ? 'PRIMARY PAYCHECK' : '14-DAY PLANNING WINDOW'}</span>
              </div>
            </div>
            <DataRow
              label="Expected income"
              value={<span className="accent">+ {money(state.paycheck?.amount ?? 0, 2)}</span>}
            />
            <div className="paycheck-divider" />
            <DataRow label="Balance before payday" value={money(state.before)} />
            <DataRow label="Balance after payday" value={money(state.after)} />
            <div className="paycheck-note">
              <ShieldCheck size={12} />{' '}
              {state.before >= snapshot.settings.reserve
                ? 'Reserve protected through payday'
                : 'Projected reserve needs attention'}
            </div>
          </CommandPanel>
          <CommandPanel className="allocation-panel">
            <SectionHeader
              index="03"
              title="Capital allocation"
              action={<Crosshair size={15} className="muted" />}
            />
            <AllocationControls
              items={draftAllocations}
              onChange={onAllocationChange}
              safe={state.safe}
              onAllocate={allocate}
              compact
            />
          </CommandPanel>
        </div>
      </div>
      <div className="lower-grid">
        <CommandPanel className="spending-panel">
          <SectionHeader
            index="04"
            title="Spending velocity"
            action={<Gauge size={15} className="muted" />}
          />
          <div className="spending-head">
            <MetricDisplay value={average} decimals={2} />
            <span>/ DAY</span>
            <span className={`pace-label ${pace > 1 ? 'warning' : 'accent'}`}>
              {pace <= 1 ? 'WITHIN PLAN' : 'ABOVE PLAN'}
            </span>
          </div>
          <SpendingChart spent={dailySpent} plan={snapshot.settings.dailyPlan} />
          <DataRow label="Since last paycheck" value={money(spent, 2)} />
          <DataRow label="Remaining variable allowance" value={money(state.variable)} />
          <DataRow
            label="Daily pace vs. plan"
            value={`${Math.round(pace * 100)}% of ${money(snapshot.settings.dailyPlan)}`}
          />
        </CommandPanel>
        <CommandPanel className="reserve-panel">
          <SectionHeader
            index="05"
            title="Checking reserve"
            action={<ShieldCheck size={15} className="muted" />}
          />
          <div className="reserve-heading">
            <MetricDisplay value={checking.balance} />
            <span>PRIMARY CHECKING · {checking.lastFour}</span>
          </div>
          {/* Both markers share a scale of at least four reserves; a floor of 1 avoids division by zero. */}
          <div className="reserve-track">
            <span
              style={{
                width: `${Math.min(100, (Math.max(0, checking.balance) / Math.max(1, checking.balance, snapshot.settings.reserve * 4)) * 100)}%`,
              }}
            />
            <i
              style={{
                left: `${(snapshot.settings.reserve / Math.max(1, checking.balance, snapshot.settings.reserve * 4)) * 100}%`,
              }}
            />
          </div>
          <div className="reserve-markers">
            <span>0</span>
            <span>MIN {money(snapshot.settings.reserve)}</span>
            <span>{money(Math.max(checking.balance, snapshot.settings.reserve * 4))}</span>
          </div>
          <DataRow
            label="Above minimum reserve"
            value={
              <span
                className={checking.balance >= snapshot.settings.reserve ? 'accent' : 'warning'}
              >
                {money(checking.balance - snapshot.settings.reserve)}
              </span>
            }
          />
          <button className="text-button reserve-action" onClick={() => onSettings()}>
            Configure operating limits <SlidersHorizontal size={12} />
          </button>
        </CommandPanel>
        <CommandPanel className="cards-panel">
          <SectionHeader
            index="06"
            title="Credit positions"
            action={
              <button className="text-button" onClick={() => setView('accounts')}>
                All accounts <ArrowUpRight size={12} />
              </button>
            }
          />
          <CreditCards accounts={cards} />
        </CommandPanel>
      </div>
    </div>
  );
}
