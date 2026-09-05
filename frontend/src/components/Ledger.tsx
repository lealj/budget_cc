/** Searchable financial-entry table and the row controls also used by upcoming obligations. */
import { useState } from 'react';
import {
  Search,
  Pencil,
  Check,
  SkipForward,
  Trash2,
  EyeOff,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import type { FinancialEntry, Snapshot } from '../models';
import { money, shortDate, today } from '../lib/finance';
import { StaticDynamicIndicator, SystemLabel } from './ui';
// Shared callback contract: the parent performs the mutation and returns a promise when finished.
export type EntryAction = (
  action: 'complete' | 'skip' | 'delete' | 'toggle',
  entry: FinancialEntry,
  date?: string,
) => Promise<void>;
// Reusable edit/settle/skip/exclude/delete controls for one entry or dated occurrence.
export function EntryActions({
  entry,
  onEdit,
  onAction,
  date,
}: {
  entry: FinancialEntry;
  onEdit: (e: FinancialEntry) => void;
  onAction: EntryAction;
  date?: string;
}) {
  const [busy, setBusy] = useState(false);
  // Parameters<EntryAction>[0] reuses the action-name type instead of repeating its string union.
  const act = async (a: Parameters<EntryAction>[0]) => {
    setBusy(true);
    try {
      await onAction(a, entry, date);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="entry-actions">
      <button
        className="icon-button"
        aria-label={`Edit ${entry.name}`}
        onClick={() => onEdit(entry)}
      >
        <Pencil size={13} />
      </button>
      {!entry.completed && (
        <button
          disabled={busy}
          className="icon-button"
          aria-label={`Mark ${entry.name} ${entry.kind === 'expense' ? 'paid' : 'received'}`}
          onClick={() => act('complete')}
        >
          <Check size={14} />
        </button>
      )}
      <button
        disabled={busy}
        className="icon-button"
        aria-label={`Skip ${entry.name} occurrence`}
        onClick={() => act('skip')}
      >
        <SkipForward size={13} />
      </button>
      <button
        disabled={busy}
        className="icon-button"
        aria-label={`${entry.includedInForecast ? 'Exclude' : 'Include'} ${entry.name} ${entry.includedInForecast ? 'from' : 'in'} forecast`}
        onClick={() => act('toggle')}
      >
        {entry.includedInForecast ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        disabled={busy}
        className="icon-button danger"
        aria-label={`Delete ${entry.name}`}
        onClick={() => act('delete')}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
export function Ledger({
  snapshot,
  onEdit,
  onAction,
}: {
  snapshot: Snapshot;
  onEdit: (e: FinancialEntry) => void;
  onAction: EntryAction;
}) {
  // Search/filter state affects only the visible rows, not the saved entries.
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All events');
  // Apply text search, then the selected filter, then newest-first date sorting.
  // filter creates a new array, so sorting here does not reorder the original snapshot.
  const entries = snapshot.entries
    .filter((e) =>
      `${e.name} ${e.category} ${e.merchant ?? ''}`.toLowerCase().includes(query.toLowerCase()),
    )
    .filter((e) => {
      switch (filter) {
        case 'Income':
          return e.kind === 'income';
        case 'Expense':
          return e.kind === 'expense';
        case 'Static':
          return e.variability === 'static';
        case 'Dynamic':
          return e.variability === 'dynamic';
        case 'Upcoming':
          return !e.completed && e.date >= today();
        case 'Completed':
          return e.completed;
        case 'Recurring':
          return e.recurring;
        case 'Manual':
          return e.source === 'manual';
        case 'Synced':
          return e.source === 'synced';
        default:
          return true;
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="ledger">
      <div className="ledger-tools">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search financial entries"
            placeholder="Search events, merchants, categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter financial entries"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            'All events',
            'Income',
            'Expense',
            'Static',
            'Dynamic',
            'Upcoming',
            'Completed',
            'Recurring',
            'Manual',
            'Synced',
          ].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <SystemLabel>{entries.length} RECORDS</SystemLabel>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Event / source</th>
              <th>Classification</th>
              <th>Account</th>
              <th>Date</th>
              <th>Status</th>
              <th className="align-right">Amount</th>
              <th className="align-right">Controls</th>
            </tr>
          </thead>
          <tbody>
            {/* Each source entry becomes a row; recurring occurrences are expanded elsewhere. */}
            {entries.map((e) => (
              <tr key={e.id} className={!e.includedInForecast ? 'excluded' : ''}>
                <td>
                  <div className="event-name">
                    <span className={`event-icon ${e.kind}`}>
                      {e.kind === 'income' ? (
                        <ArrowDownLeft size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{e.name}</strong>
                      <small>
                        {e.source.toUpperCase()} <span>·</span> {e.category}{' '}
                        {e.recurring ? '· RECURRING' : ''}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <StaticDynamicIndicator value={e.variability} />
                </td>
                <td className="muted">
                  {snapshot.accounts.find((a) => a.id === e.accountId)?.name ?? 'Unassigned'}
                </td>
                <td className="mono">{shortDate(e.date)}</td>
                <td>
                  <span className={`table-status ${e.completed ? 'complete' : ''}`}>
                    {e.completed
                      ? e.kind === 'income'
                        ? 'RECEIVED'
                        : 'PAID'
                      : !e.includedInForecast
                        ? 'EXCLUDED'
                        : e.skippedDates?.includes(e.date)
                          ? 'SKIPPED'
                          : 'UPCOMING'}
                  </span>
                </td>
                <td className={`align-right mono ${e.kind === 'income' ? 'accent' : ''}`}>
                  {e.kind === 'income' ? '+' : '−'}
                  {money(e.amount, 2)}
                </td>
                <td>
                  <EntryActions entry={e} onEdit={onEdit} onAction={onAction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Offer a recovery action when the search/filter combination hides every entry. */}
        {entries.length === 0 && (
          <div className="empty-state">
            No events match your filters.
            <button
              className="text-button"
              onClick={() => {
                setQuery('');
                setFilter('All events');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
