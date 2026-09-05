/**
 * Application coordinator: owns shared data, navigation, drawers, and service calls.
 * Child components receive data as props and request changes through callback props.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleHelp,
  Command,
  Crosshair,
  Database,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  Radar,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wallet,
  X,
  Check,
} from 'lucide-react';
import type { Allocation, EntryKind, FinancialEntry, Snapshot } from './models';
import { cents, derive, money } from './lib/finance';
import { financeService } from './services/financeService';
import {
  CommandDrawer,
  CommandPanel,
  DataRow,
  SectionHeader,
  StatusIndicator,
  SystemLabel,
  TechnicalButton,
} from './components/ui';
import { FinancialEntryForm } from './components/FinancialEntryForm';
import { AllocationControls } from './components/AllocationControls';
import { Dashboard } from './components/Dashboard';
import { Ledger } from './components/Ledger';
import type { EntryAction } from './components/Ledger';
import { AccountsView } from './components/Accounts';
// Keep the optional WebGL dependency out of the initial interface bundle.
const Ambient = lazy(() => import('./components/Ambient'));
// String unions limit navigation and drawer state to the screens the app supports.
type View = 'overview' | 'cashflow' | 'allocations' | 'accounts';
type Drawer =
  | { type: 'entry'; kind: EntryKind; entry?: FinancialEntry }
  | { type: 'allocate' | 'settings' | 'activity' | 'help' }
  | { type: 'delete'; entry: FinancialEntry }
  | null;
// One list supplies the sidebar labels, icons, and view identifiers.
const nav = [
  {
    id: 'overview' as const,
    label: 'Command overview',
    icon: LayoutDashboard,
    code: '01',
  },
  {
    id: 'cashflow' as const,
    label: 'Cash-flow ledger',
    icon: Activity,
    code: '02',
  },
  {
    id: 'allocations' as const,
    label: 'Capital allocation',
    icon: Crosshair,
    code: '03',
  },
  {
    id: 'accounts' as const,
    label: 'Connected accounts',
    icon: Wallet,
    code: '04',
  },
];
// Keeps settings edits local until Save; closing the drawer leaves the snapshot unchanged.
function Preferences({
  snapshot,
  onSave,
}: {
  snapshot: Snapshot;
  onSave: (settings: Snapshot['settings']) => Promise<void>;
}) {
  const [value, setValue] = useState(snapshot.settings),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="entry-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(value);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        Set the operating limits used by your allocation calculation and cash-flow projections.
      </p>
      {(
        [
          { key: 'reserve', label: 'Minimum cash reserve ($)' },
          { key: 'sinkingFund', label: 'Monthly sinking-fund obligations ($)' },
          { key: 'dailyPlan', label: 'Planned daily spending ($)' },
        ] as const
      ).map((f) => (
        <label key={f.key}>
          {f.label}
          <input
            type="number"
            min="0"
            max="100000000"
            step="0.01"
            required
            value={value[f.key]}
            onChange={(e) => setValue({ ...value, [f.key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.ambient}
          onChange={(e) => setValue({ ...value, ambient: e.target.checked })}
        />
        <span>
          Ambient technical grid
          <small>Subtle GPU effect. Automatically paused for reduced motion.</small>
        </span>
      </label>
      <div className="info-block">
        The allocation window reserves the full sinking-fund obligation. Projections schedule it
        before payday and repeat it every 30 days. Dynamic entries supply the forecast allowances;
        the daily plan is a comparison target.
      </div>
      <TechnicalButton variant="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save operating limits'}
      </TechnicalButton>
    </form>
  );
}
export default function App() {
  // snapshot holds saved financial data; null means it has not loaded yet.
  // draftAllocations is shared by the dashboard, allocation page, and drawer.
  // The remaining state controls which UI is visible and what feedback it displays.
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [draftAllocations, setDraftAllocations] = useState<Allocation[]>([]),
    [loadError, setLoadError] = useState(''),
    [view, setView] = useState<View>('overview'),
    [drawer, setDrawer] = useState<Drawer>(null),
    [days, setDays] = useState(30),
    [expanded, setExpanded] = useState(false),
    [syncing, setSyncing] = useState(false),
    [toast, setToast] = useState(''),
    [mobileNav, setMobileNav] = useState(false),
    [clock, setClock] = useState(new Date()),
    [updates, setUpdates] = useState<string[]>([
      'Demo environment initialized. All four accounts nominal.',
    ]);
  // Load the initial data after mounting. The timer refreshes displayed time/sync age;
  // its cleanup stops the timer when this component is removed.
  useEffect(() => {
    financeService
      .getSnapshot()
      .then((data) => {
        setSnapshot(data);
        setDraftAllocations(data.allocations);
      })
      .catch(() => setLoadError('Unable to initialize the demo. Reload to try again.'));
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  // Each new toast gets its own dismissal timer; replace the old timer when the message changes.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const [safeChange, setSafeChange] = useState(0);
  // Derive both sides of the delta from snapshots so every financial mutation uses the same rules.
  const updateSnapshot = (next: Snapshot) => {
    if (snapshot) setSafeChange(cents(derive(next).safe - derive(snapshot).safe));
    setSnapshot(next);
  };
  // Show immediate feedback and retain a short history for the activity drawer.
  const notify = (message: string) => {
    setToast(message);
    setUpdates((u) => [message, ...u].slice(0, 30));
  };
  // The service returns a new snapshot, which causes child components to render updated numbers.
  const saveEntry = async (entry: FinancialEntry) => {
    updateSnapshot(await financeService.saveEntry(entry));
    setDrawer(null);
    notify(`${entry.name} saved. Forecast recalculated.`);
  };
  const action: EntryAction = async (type, entry, date) => {
    // Timeline actions pass an occurrence date; ledger actions default to the entry's anchor.
    if (type === 'delete') {
      setDrawer({ type: 'delete', entry });
      return;
    }
    try {
      if (type === 'complete') updateSnapshot(await financeService.completeEntry(entry.id, date));
      if (type === 'skip')
        updateSnapshot(await financeService.skipEntry(entry.id, date ?? entry.date));
      if (type === 'toggle')
        updateSnapshot(
          await financeService.saveEntry({
            ...entry,
            includedInForecast: !entry.includedInForecast,
          }),
        );
      notify(
        type === 'complete'
          ? `${entry.name} marked ${entry.kind === 'income' ? 'received' : 'paid'}.`
          : type === 'skip'
            ? `${entry.name}: occurrence skipped.`
            : `${entry.name}: forecast inclusion updated.`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Unable to update entry.');
    }
  };
  // Apply a confirmed plan, then clear the shared draft using the service's returned amounts.
  const allocate = async (items: Allocation[]) => {
    const total = items.reduce((s, a) => s + a.amount, 0);
    const next = await financeService.allocate(items);
    updateSnapshot(next);
    setDraftAllocations(next.allocations);
    notify(`${money(total)} reserved in your local allocation plan. No transfer made.`);
  };
  // busy state prevents repeated sync clicks while the simulated request is pending.
  const sync = async () => {
    setSyncing(true);
    try {
      const accounts = await financeService.syncAccounts();
      // Preserve entry/settings changes that may have completed while synchronization was pending.
      setSnapshot((s) => (s ? { ...s, accounts } : s));
      notify('Demo synchronization complete. All accounts nominal.');
    } catch {
      notify('Synchronization failed. Try again.');
    } finally {
      setSyncing(false);
    }
  };
  // Passing the existing entry tells FinancialEntryForm to edit instead of create.
  const edit = (entry: FinancialEntry) => setDrawer({ type: 'entry', kind: entry.kind, entry });
  // Return the loading/error screen early so the main UI never reads missing account data.
  if (!snapshot)
    return (
      <div className="loading-screen">
        <Radar size={40} />
        <SystemLabel>VECTOR / INITIALIZING FINANCIAL OPERATIONS</SystemLabel>
        {loadError ? <p role="alert">{loadError}</p> : <span className="loading-bar" />}
      </div>
    );
  // Calculated values are recomputed from the snapshot rather than stored separately in state.
  const state = derive(snapshot);
  const lastSync = snapshot.accounts[0].sync.lastSyncedAt,
    syncMinutes = Math.max(0, Math.floor((clock.getTime() - new Date(lastSync).getTime()) / 60000));
  const headings = {
    overview: ['Command overview', 'A clear picture. A confident next move.'],
    cashflow: ['Cash-flow ledger', 'Every obligation, income source, and financial event.'],
    allocations: [
      'Capital allocation',
      'Put available cash to work, within your operating limits.',
    ],
    accounts: ['Connected accounts', 'Your cash positions and connection health.'],
  };
  return (
    <div className="app-shell">
      {/* Suspense renders nothing while the optional background component downloads. */}
      {snapshot.settings.ambient && (
        <Suspense fallback={null}>
          <Ambient healthy={state.safe >= 0} />
        </Suspense>
      )}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {/* Navigation changes view state; this local app does not use URL-based routing. */}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('overview');
          }}
          aria-label="Vector home"
        >
          <span className="brand-symbol">V</span>
          <div>
            <strong>
              VECTOR<span>®</span>
            </strong>
            <small>FINANCIAL OPERATIONS</small>
          </div>
        </a>
        <div className="workspace-id">
          <span className="tiny-square" />
          <SystemLabel>PERSONAL WORKSPACE</SystemLabel>
          <LockKeyhole size={11} />
        </div>
        <div className="nav-group-label">OPERATIONS</div>
        <nav aria-label="Primary navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => {
                setView(n.id);
                setMobileNav(false);
              }}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              <small>{n.code}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-group-label">SYSTEM</div>
        <button className="nav-item" onClick={() => setDrawer({ type: 'activity' })}>
          <Database size={16} />
          <span>Activity log</span>
          <span className="nav-count">{updates.length}</span>
        </button>
        <button className="nav-item" onClick={() => setDrawer({ type: 'settings' })}>
          <Settings2 size={16} />
          <span>Operating limits</span>
        </button>
        <div className="sidebar-bottom">
          <div className="system-health">
            <div className="health-header">
              <Radar size={18} />
              <SystemLabel>SYSTEM HEALTH</SystemLabel>
            </div>
            <StatusIndicator>ALL SYSTEMS NOMINAL</StatusIndicator>
            <div className="health-bars">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ height: 8 + ((i * 7) % 15) }} />
              ))}
            </div>
            <DataRow label="Environment" value="LOCAL" />
            <DataRow label="Data source" value="DEMO" />
          </div>
          <button className="help-link" onClick={() => setDrawer({ type: 'help' })}>
            <CircleHelp size={15} /> Console guide <ArrowUpRight size={13} />
          </button>
          <div className="profile">
            <span className="avatar">OP</span>
            <div>
              <strong>Personal command</strong>
              <small>LOCAL OPERATOR</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
        <div className="sidebar-version">
          VECTOR OS <span>V.1.0.0</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Command size={14} />
            <span>WORKSPACE</span>
            <ChevronRight size={12} />
            <strong>{view === 'overview' ? 'OVERVIEW' : view.toUpperCase()}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <LockKeyhole size={11} /> LOCAL ONLY
            </span>
            <span className="top-date">
              {clock
                .toLocaleDateString('en-US', {
                  month: 'short',
                  day: '2-digit',
                  year: 'numeric',
                })
                .toUpperCase()}
              <span className="top-time">
                {clock.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </span>
            </span>
            <button
              className="notification-button icon-button"
              aria-label="Open activity log"
              onClick={() => setDrawer({ type: 'activity' })}
            >
              <Bell size={16} />
              <i />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <SystemLabel>
                <span className="accent">FINANCIAL INTELLIGENCE</span> /{' '}
                {view === 'overview' ? 'LIVE POSITION' : 'OPERATIONS'}
              </SystemLabel>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            <div className="heading-status">
              <StatusIndicator>ALL ACCOUNTS NOMINAL</StatusIndicator>
              <span>
                LAST DEMO SYNC{' '}
                {syncMinutes < 1 ? 'JUST NOW' : `${String(syncMinutes).padStart(2, '0')} MIN AGO`}
              </span>
            </div>
          </div>
          <div className="command-bar">
            <div className="command-bar-label">
              <span className="tiny-square" /> QUICK COMMANDS
            </div>
            <TechnicalButton onClick={() => setDrawer({ type: 'entry', kind: 'expense' })}>
              <Plus size={14} /> Add expense
            </TechnicalButton>
            <TechnicalButton onClick={() => setDrawer({ type: 'entry', kind: 'income' })}>
              <Plus size={14} /> Add income
            </TechnicalButton>
            <TechnicalButton onClick={() => setDrawer({ type: 'allocate' })}>
              <Crosshair size={14} /> Allocate funds
            </TechnicalButton>
            <TechnicalButton className="sync-command" disabled={syncing} onClick={sync}>
              <RefreshCw size={13} className={syncing ? 'spinning' : ''} />
              {syncing ? 'Synchronizing…' : 'Sync accounts'}
            </TechnicalButton>
            <span className="command-bar-end">
              <ShieldCheck size={13} /> YOUR DATA STAYS HERE
            </span>
          </div>
          {view === 'overview' && (
            <Dashboard
              snapshot={snapshot}
              days={days}
              setDays={setDays}
              expanded={expanded}
              setExpanded={setExpanded}
              onSettings={() => setDrawer({ type: 'settings' })}
              setView={setView}
              edit={edit}
              action={action}
              allocate={allocate}
              safeChange={safeChange}
              draftAllocations={draftAllocations}
              onAllocationChange={setDraftAllocations}
            />
          )}
          {view === 'cashflow' && (
            <CommandPanel>
              <SectionHeader
                index="02"
                title="Financial events"
                action={<span className="small-tag">MANUAL + SYNCED</span>}
              />
              <Ledger snapshot={snapshot} onEdit={edit} onAction={action} />
            </CommandPanel>
          )}
          {view === 'allocations' && (
            <div className="allocation-page">
              <CommandPanel>
                <SectionHeader
                  title="Allocation plan"
                  action={<SystemLabel>LOCAL RESERVATIONS</SystemLabel>}
                />
                <AllocationControls
                  items={draftAllocations}
                  onChange={setDraftAllocations}
                  safe={state.safe}
                  onAllocate={allocate}
                />
              </CommandPanel>
              <CommandPanel className="allocation-explainer">
                <Crosshair size={32} />
                <h2>Intentional capital deployment.</h2>
                <p>
                  Your available capital is protected against upcoming obligations and your minimum
                  cash reserve.
                </p>
                <DataRow label="Safe to allocate" value={money(state.safe)} />
                <DataRow label="Reserved this session" value={money(snapshot.allocatedTotal)} />
                <DataRow label="Operating reserve" value={money(snapshot.settings.reserve)} />
                <p className="info-block">
                  Set amounts, switch to percentages, or adjust the sliders. Confirming a plan
                  reserves cash in this local demo and updates the forecast. It does not initiate
                  bank transfers.
                </p>
              </CommandPanel>
            </div>
          )}
          {view === 'accounts' && (
            <>
              <CommandPanel>
                <SectionHeader
                  title="Account connections"
                  action={<StatusIndicator>4 DEMO ACCOUNTS</StatusIndicator>}
                />
                <AccountsView accounts={snapshot.accounts} />
              </CommandPanel>
              <div className="account-disclaimer">
                <LockKeyhole size={15} />
                <span>
                  Demo connections. Future account synchronization will be handled by your local
                  backend. No bank credentials are stored in this frontend.
                </span>
              </div>
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="status-dot" /> LOCAL SESSION{' '}
              <span className="footer-divider">/</span> DEMO DATA · RESETS ON RELOAD
            </span>
            <span>
              VECTOR FINANCIAL OPERATIONS <span className="footer-divider">/</span> ALL AMOUNTS IN
              USD
            </span>
          </footer>
        </main>
      </div>
      {drawer && (
        <CommandDrawer
          title={
            drawer.type === 'entry'
              ? `${drawer.entry ? 'Edit' : 'Add'} ${drawer.kind}`
              : drawer.type === 'allocate'
                ? 'Allocate capital'
                : drawer.type === 'settings'
                  ? 'Operating limits'
                  : drawer.type === 'activity'
                    ? 'Activity log'
                    : drawer.type === 'delete'
                      ? 'Delete financial entry'
                      : 'Console guide'
          }
          kicker={
            drawer.type === 'entry' ? 'FINANCIAL EVENT / MANUAL CONTROL' : 'VECTOR / SYSTEM CONTROL'
          }
          onClose={() => setDrawer(null)}
        >
          {drawer.type === 'entry' && (
            <FinancialEntryForm
              key={drawer.entry?.id ?? drawer.kind}
              kind={drawer.kind}
              entry={drawer.entry}
              accounts={snapshot.accounts}
              onSave={saveEntry}
              onCancel={() => setDrawer(null)}
            />
          )}
          {drawer.type === 'allocate' && (
            <div className="drawer-body">
              <AllocationControls
                items={draftAllocations}
                onChange={setDraftAllocations}
                safe={state.safe}
                onAllocate={allocate}
              />
            </div>
          )}
          {drawer.type === 'settings' && (
            <Preferences
              snapshot={snapshot}
              onSave={async (value) => {
                updateSnapshot(await financeService.saveSettings(value));
                setDrawer(null);
                notify('Operating limits updated. Forecast recalculated.');
              }}
            />
          )}
          {drawer.type === 'activity' && (
            <div className="drawer-body">
              <SystemLabel>THIS SESSION / {updates.length} EVENTS</SystemLabel>
              <div className="activity-list">
                {updates.map((u, i) => (
                  <div key={`${u}-${i}`}>
                    <span className="activity-node" />
                    <div>
                      <SystemLabel>EVENT {String(updates.length - i).padStart(3, '0')}</SystemLabel>
                      <p>{u}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {drawer.type === 'delete' && (
            <div className="drawer-body">
              <p>
                Delete <strong>{drawer.entry.name}</strong>
                {drawer.entry.recurring ? ' and all future occurrences' : ''}? This removes the
                entry from the local forecast. Completed account balance changes are retained.
              </p>
              <div className="confirm-actions">
                <TechnicalButton onClick={() => setDrawer(null)}>Cancel</TechnicalButton>
                <TechnicalButton
                  className="delete-button"
                  onClick={async () => {
                    updateSnapshot(await financeService.deleteEntry(drawer.entry.id));
                    notify(`${drawer.entry.name} deleted.`);
                    setDrawer(null);
                  }}
                >
                  Delete entry
                </TechnicalButton>
              </div>
            </div>
          )}
          {drawer.type === 'help' && (
            <div className="drawer-body guide">
              <Radar size={32} />
              <h3>Your financial position, at a glance.</h3>
              <p>
                <strong>Safe to Allocate</strong> is liquid cash less expenses through payday,
                variable allowances, sinking funds, and your reserve. Expected income enters cash
                flow on its scheduled date.
              </p>
              <p>
                <strong>Quick commands</strong> add manual income and expenses. Set a recurring
                income as your primary paycheck to define the allocation window.
              </p>
              <p>
                <strong>Cash-flow ledger</strong> lets you edit, settle, skip, exclude, and delete
                entries. Static entries are predictable; dynamic entries are expected allowances.
              </p>
              <p>
                <strong>Capital allocation</strong> reserves surplus for your destinations. Local
                reservations reduce available cash and the projection; no transfers occur.
              </p>
              <div className="info-block">
                This is a frontend demo with typed, in-memory services. Changes reset when the page
                reloads. All interface assets are served locally. No external account connections
                are active.
              </div>
            </div>
          )}
        </CommandDrawer>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Check size={17} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToast('')}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
