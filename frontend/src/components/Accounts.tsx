/** Read-only account views. App loads/synchronizes accounts and passes them in as props. */
import { CreditCard, Landmark, RefreshCw } from 'lucide-react';
import type { Account, CreditCardAccount } from '../models';
import { money, shortDate } from '../lib/finance';
import { DataRow, StatusIndicator, SystemLabel } from './ui';
// Translate the account's connection state into a shared text-and-dot indicator.
export function AccountStatus({ account }: { account: Account }) {
  return (
    <StatusIndicator tone={account.sync.state === 'attention' ? 'warning' : 'good'}>
      {account.sync.state === 'attention' ? 'REQUIRES ATTENTION' : 'SYNCHRONIZED'}
    </StatusIndicator>
  );
}
// Compact credit-card summaries for the dashboard, including debt, credit limit, and next payment.
export function CreditCards({ accounts }: { accounts: CreditCardAccount[] }) {
  return (
    <div className="credit-cards">
      {accounts.map((a) => (
        <div className="credit-account" key={a.id}>
          <div className="credit-heading">
            <span className={`bank-mark ${a.id === 'amex' ? 'amex' : ''}`}>
              {a.id === 'amex' ? 'AMEX' : <CreditCard size={20} />}
            </span>
            <div>
              <strong>{a.name}</strong>
              <small>
                {a.institution} <span>•• {a.lastFour}</span>
              </small>
            </div>
            <span className="status-dot" title="Synchronized" />
          </div>
          <div className="credit-balance">
            <span className="mono">{money(a.balance, 2)}</span>
            <span>of {money(a.creditLimit)}</span>
          </div>
          {/* Utilization is debt divided by the limit; cap the visual bar at its container width. */}
          <div className="credit-track">
            <span
              style={{
                width: `${Math.min(100, (a.balance / a.creditLimit) * 100)}%`,
              }}
            />
          </div>
          <DataRow
            label={`Due ${shortDate(a.paymentDate)}`}
            value={`${money(a.upcomingPayment)} payment`}
          />
          <div className="credit-available">
            {money(a.creditLimit - a.balance)} available credit
          </div>
        </div>
      ))}
    </div>
  );
}
// Full account page: map creates one panel per account, and key keeps each panel's identity stable.
export function AccountsView({ accounts }: { accounts: Account[] }) {
  return (
    <div className="accounts-grid">
      {accounts.map((a) => (
        <div className="account-detail" key={a.id}>
          <div className="account-detail-header">
            {a.type === 'credit' ? <CreditCard size={24} /> : <Landmark size={24} />}
            <SystemLabel>
              {a.type.toUpperCase()} / {a.lastFour}
            </SystemLabel>
          </div>
          <h3>{a.name}</h3>
          <p className="muted">{a.institution}</p>
          <strong className="large-metric">{money(a.balance, 2)}</strong>
          <DataRow
            label="Availability"
            value={a.liquid ? 'Included in liquid cash' : 'Credit account'}
          />
          <AccountStatus account={a} />
          <div className="sync-timestamp">
            <RefreshCw size={12} /> Last demo sync{' '}
            {new Date(a.sync.lastSyncedAt).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}
