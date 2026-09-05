/** Shared allocation editor, used in full-page, drawer, and compact dashboard layouts. */
import { useState } from 'react';
import { ArrowUpRight, Plus, Check } from 'lucide-react';
import type { Allocation } from '../models';
import { cents, money, validAllocations } from '../lib/finance';
import { AllocationRadial } from './charts';
import { TechnicalButton, DataRow, SystemLabel } from './ui';
// Amounts stay in dollars in the shared draft; percentages are only an input/display conversion.
export function AllocationControls({
  items,
  onChange: setItems,
  safe,
  onAllocate,
  compact = false,
}: {
  items: Allocation[];
  onChange: (items: Allocation[]) => void;
  safe: number;
  onAllocate: (a: Allocation[]) => Promise<void>;
  compact?: boolean;
}) {
  // Only presentation and confirmation state live here; the parent owns destination amounts.
  const [mode, setMode] = useState<'dollars' | 'percent'>('dollars'),
    [custom, setCustom] = useState(''),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  // Recheck the whole plan on each render because other financial edits can reduce safe cash.
  const total = cents(items.reduce((s, a) => s + a.amount, 0)),
    valid = validAllocations(items, safe),
    available = Math.max(0, safe);
  const update = (id: string, value: number) => {
    // Clamp only the edited destination, preserving the user's other allocations.
    const other = items.filter((a) => a.id !== id).reduce((s, a) => s + a.amount, 0);
    setItems(
      items.map((a) =>
        a.id === id
          ? {
              ...a,
              amount: cents(
                Math.min(
                  Math.max(0, available - other),
                  Math.max(0, Number.isFinite(value) ? value : 0),
                ),
              ),
            }
          : a,
      ),
    );
    // Changing an amount means the revised plan must be confirmed again.
    setConfirm(false);
    setError('');
  };
  return (
    <div className={`allocation-controls ${compact ? 'compact' : ''}`}>
      <div className="allocation-overview">
        <AllocationRadial allocations={items} safe={available} />
        <div className="allocation-summary">
          <SystemLabel>DEPLOYABLE CAPITAL</SystemLabel>
          <strong>{money(available)}</strong>
          <span>Give your surplus a purpose.</span>
          <DataRow label="ALLOCATED" value={money(total)} />
        </div>
      </div>
      <div className="allocation-toolbar">
        <SystemLabel>
          ALLOCATED <span className="accent">{money(total)}</span>
        </SystemLabel>
        <div className="segmented" aria-label="Allocation units">
          <button
            aria-pressed={mode === 'dollars'}
            className={mode === 'dollars' ? 'active' : ''}
            onClick={() => setMode('dollars')}
          >
            USD
          </button>
          <button
            aria-pressed={mode === 'percent'}
            className={mode === 'percent' ? 'active' : ''}
            onClick={() => setMode('percent')}
          >
            %
          </button>
        </div>
      </div>
      {/* Both the number input and slider update the same destination through update(). */}
      <div className="allocation-destinations">
        {items.map((a) => (
          <div className="allocation-destination" key={a.id}>
            <div className="allocation-name">
              <span className="destination-dot" style={{ background: a.color }} />
              <label htmlFor={`amount-${compact ? 'small' : 'full'}-${a.id}`}>{a.name}</label>
              <div className="allocation-input">
                <span>{mode === 'dollars' ? '$' : '%'}</span>
                <input
                  id={`amount-${compact ? 'small' : 'full'}-${a.id}`}
                  aria-label={`${a.name} ${mode === 'dollars' ? 'amount' : 'percentage'}`}
                  type="number"
                  min="0"
                  step={mode === 'dollars' ? '50' : '1'}
                  value={
                    mode === 'dollars'
                      ? a.amount
                      : available
                        ? cents((a.amount / available) * 100)
                        : 0
                  }
                  onChange={(e) =>
                    update(
                      a.id,
                      Number(e.target.value) * (mode === 'percent' ? available / 100 : 1),
                    )
                  }
                />
              </div>
            </div>
            <input
              className="allocation-range"
              aria-label={`Adjust ${a.name}`}
              type="range"
              min="0"
              max={available}
              step="1"
              value={Math.min(a.amount, available)}
              style={{ accentColor: a.color }}
              onChange={(e) => update(a.id, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      {/* New destinations start at zero so adding one cannot overspend available cash. */}
      {adding ? (
        <form
          className="custom-destination"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) {
              setItems([
                ...items,
                {
                  id: crypto.randomUUID(),
                  name: custom.trim(),
                  amount: 0,
                  color: '#a8ab95',
                },
              ]);
              setCustom('');
              setAdding(false);
            }
          }}
        >
          <input
            aria-label="Custom destination name"
            autoFocus
            required
            maxLength={40}
            placeholder="Destination name"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="icon-button" aria-label="Add destination">
            <Check size={16} />
          </button>
        </form>
      ) : (
        <button className="text-button add-destination" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add destination
        </button>
      )}
      {!valid && (
        <p role="alert" className="error-message">
          Your plan exceeds available cash by {money(total - available)}. Adjust the amounts to
          continue.
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {confirm && (
        <p className="allocation-confirm">
          Reserve {money(total)} for these destinations? This updates your local cash forecast. No
          money is transferred.
        </p>
      )}
      <TechnicalButton
        className="allocate-submit"
        variant="primary"
        disabled={!valid || total <= 0 || busy}
        onClick={async () => {
          // The first click shows a review message; the second asks the parent to reserve cash.
          if (!confirm) {
            setConfirm(true);
            return;
          }
          setBusy(true);
          try {
            await onAllocate(items);
            setItems(items.map((a) => ({ ...a, amount: 0 })));
            setConfirm(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to allocate funds.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Reserving…' : confirm ? 'Confirm allocation' : 'Allocate funds'}
        <ArrowUpRight size={16} />
      </TechnicalButton>
      <div className="allocation-note">
        <span className="tiny-square" />{' '}
        {compact ? 'LOCAL PLAN · NO TRANSFERS' : 'Funds are reserved in the demo session only.'}
      </div>
    </div>
  );
}
