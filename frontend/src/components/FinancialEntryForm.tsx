/**
 * Shared add/edit form for income and expenses. It collects a draft and sends it
 * to App through onSave; the form itself does not call the financial service.
 */
import { useState } from 'react';
import type { Account, EntryKind, FinancialEntry, Frequency } from '../models';
import { today } from '../lib/finance';
import { TechnicalButton, SystemLabel } from './ui';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
// Props supply the entry type, optional existing record, account choices, and parent callbacks.
export function FinancialEntryForm({
  kind,
  entry,
  accounts,
  onSave,
  onCancel,
}: {
  kind: EntryKind;
  entry?: FinancialEntry;
  accounts: Account[];
  onSave: (entry: FinancialEntry) => Promise<void>;
  onCancel: () => void;
}) {
  // useState remembers field values between renders. An existing entry pre-fills the form;
  // otherwise, ?? selects the defaults below. The parent's key resets state for a different entry.
  const [draft, setDraft] = useState<FinancialEntry>(
    entry ?? {
      id: crypto.randomUUID(),
      kind,
      source: 'manual',
      name: '',
      amount: 0,
      date: today(),
      variability: 'static',
      recurring: false,
      category: kind === 'income' ? 'Salary' : 'Housing',
      accountId: accounts.find((a) => a.type === 'checking')?.id ?? '',
      includedInForecast: true,
      completed: false,
    },
  );
  // Saving and error state drive button availability and the inline error message.
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // K is a field name; FinancialEntry[K] requires its matching value type.
  // Spread the previous object so updating one field preserves the rest of the draft.
  const set = <K extends keyof FinancialEntry>(key: K, value: FinancialEntry[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  // Income and expenses offer different recurrence choices, using the same select below.
  const frequencies: Frequency[] =
    kind === 'income'
      ? ['weekly', 'biweekly', 'semimonthly', 'monthly', 'custom']
      : ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'custom'];
  return (
    <form
      className="entry-form"
      onSubmit={async (e) => {
        // Handle submission in React instead of letting the browser navigate/reload.
        e.preventDefault();
        if (!draft.name.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0) {
          setError('Enter a name and an amount greater than zero.');
          return;
        }
        setBusy(true);
        setError('');
        try {
          // Wait for the parent to save before treating the operation as complete.
          // A primary paycheck must remain an income source with recurrence enabled.
          await onSave({
            ...draft,
            name: draft.name.trim(),
            primaryPaycheck: kind === 'income' && draft.recurring && draft.primaryPaycheck,
          });
        } catch (e) {
          // Failed saves keep the user's draft available for correction or retry.
          setError(e instanceof Error ? e.message : 'Unable to save entry.');
        } finally {
          // Runs on success or failure, so the form cannot stay stuck in its saving state.
          setBusy(false);
        }
      }}
    >
      <div className="form-intro">
        {kind === 'expense' ? <ArrowUpRight size={22} /> : <ArrowDownLeft size={22} />}
        <p>
          {kind === 'expense'
            ? 'Give every upcoming obligation a place in the forecast.'
            : 'Bring expected income into your financial outlook.'}
          <small>
            {entry?.source === 'synced'
              ? 'Editing a local copy of a synchronized entry.'
              : 'Manual entry · stored in this demo session'}
          </small>
        </p>
      </div>
      {/* Controlled inputs read from draft and write changes back through set(). */}
      <label>
        Name / {kind === 'expense' ? 'description' : 'source'}
        <input
          autoFocus
          required
          maxLength={100}
          placeholder={kind === 'expense' ? 'e.g. Auto insurance' : 'e.g. Primary paycheck'}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      {/* Number inputs emit strings; Number(...) converts the amount before storing it. */}
      <div className="form-grid">
        <label>
          {draft.variability === 'dynamic' ? 'Expected amount / allowance' : 'Amount'}
          <div className="input-prefix">
            <span>$</span>
            <input
              aria-label="Amount"
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              value={draft.amount || ''}
              placeholder="0.00"
              onChange={(e) => set('amount', Number(e.target.value))}
            />
          </div>
        </label>
        <label>
          {kind === 'income' ? 'Expected date' : 'Due date'}
          <input
            type="date"
            required
            value={draft.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
      </div>
      {/* These buttons change classification without submitting the form; aria-pressed exposes selection. */}
      <fieldset>
        <legend>Classification</legend>
        <div className="classification">
          <button
            type="button"
            className={draft.variability === 'static' ? 'selected' : ''}
            aria-pressed={draft.variability === 'static'}
            onClick={() => set('variability', 'static')}
          >
            <span>— STATIC</span>
            <small>Known, predictable amount</small>
          </button>
          <button
            type="button"
            className={draft.variability === 'dynamic' ? 'selected' : ''}
            aria-pressed={draft.variability === 'dynamic'}
            onClick={() => set('variability', 'dynamic')}
          >
            <span>⌁ DYNAMIC</span>
            <small>Expected variable amount</small>
          </button>
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Category
          <select value={draft.category} onChange={(e) => set('category', e.target.value)}>
            {(kind === 'income'
              ? ['Salary', 'Bonus', 'Freelance', 'Reimbursement', 'Other']
              : [
                  'Housing',
                  'Transport',
                  'Groceries',
                  'Dining',
                  'Utilities',
                  'Subscriptions',
                  'Insurance',
                  'Credit card',
                  'Entertainment',
                  'Other',
                ]
            ).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          {kind === 'income' ? 'Receiving account' : 'Payment account'}
          <select value={draft.accountId} onChange={(e) => set('accountId', e.target.value)}>
            {/* Income can go to deposit accounts; expenses may also use a credit card. */}
            {accounts
              .filter((a) => kind === 'expense' || a.type !== 'credit')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.lastFour}
                </option>
              ))}
          </select>
        </label>
      </div>
      {/* Turning recurrence off clears primary-paycheck eligibility but preserves the chosen rule. */}
      <div className="form-rule">
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.recurring}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                recurring: e.target.checked,
                recurrence: d.recurrence ?? { frequency: 'monthly' },
                primaryPaycheck: e.target.checked && d.primaryPaycheck,
              }))
            }
          />
          <span>
            Recurring {kind}
            <small>Repeat this event in cash-flow projections</small>
          </span>
        </label>
        {/* && renders the extra controls only while recurrence is enabled. */}
        {draft.recurring && (
          <div className="form-grid">
            <label>
              Frequency
              <select
                value={draft.recurrence?.frequency ?? 'monthly'}
                onChange={(e) =>
                  set('recurrence', {
                    ...draft.recurrence,
                    frequency: e.target.value as Frequency,
                  })
                }
              >
                {frequencies.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {/* ?. safely reads a field when the optional recurrence object is absent. */}
            {draft.recurrence?.frequency === 'custom' && (
              <label>
                Interval (days)
                <input
                  type="number"
                  min="1"
                  max="3650"
                  required
                  value={draft.recurrence.intervalDays ?? 1}
                  onChange={(e) =>
                    set('recurrence', {
                      frequency: 'custom',
                      intervalDays: Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
          </div>
        )}
        {kind === 'income' && draft.recurring && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.primaryPaycheck ?? false}
              onChange={(e) => set('primaryPaycheck', e.target.checked)}
            />
            <span>
              Primary paycheck
              <small>Drives the next-paycheck countdown and allocation window</small>
            </span>
          </label>
        )}
      </div>
      {kind === 'expense' && (
        <label>
          Merchant <span className="muted">/ optional</span>
          <input
            maxLength={100}
            value={draft.merchant ?? ''}
            onChange={(e) => set('merchant', e.target.value)}
            placeholder="Merchant or payee"
          />
        </label>
      )}
      <label>
        Notes <span className="muted">/ optional</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={draft.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Additional context for this event"
        />
      </label>
      {/* Excluding an entry keeps the record but removes it from planning calculations. */}
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.includedInForecast}
          onChange={(e) => set('includedInForecast', e.target.checked)}
        />
        <span>
          Include in {kind === 'expense' ? 'Safe to Allocate & forecast' : 'cash-flow forecast'}
          <small>
            {kind === 'income'
              ? 'Expected income becomes available when received.'
              : 'Reserves cash for this obligation before your next paycheck.'}
          </small>
        </span>
      </label>
      {/* role="alert" lets assistive technology announce a failed save. */}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {/* Cancel discards local edits; the submit button invokes the form's onSubmit handler. */}
      <footer className="drawer-footer">
        <SystemLabel>{entry ? 'UPDATE RECORD' : 'NEW MANUAL RECORD'}</SystemLabel>
        <div>
          <TechnicalButton type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </TechnicalButton>
          <TechnicalButton variant="primary" type="submit" disabled={busy}>
            <Check size={15} />
            {busy ? 'Saving…' : `Save ${kind}`}
          </TechnicalButton>
        </div>
      </footer>
    </form>
  );
}
