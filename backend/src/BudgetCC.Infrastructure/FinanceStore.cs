using System.Data;
using Microsoft.EntityFrameworkCore;
using BudgetCC.Application;
using BudgetCC.Domain;

namespace BudgetCC.Infrastructure;

public sealed class FinanceStore(FinanceDbContext db) : IFinanceStore
{
    public async Task<SnapshotDto> ReadSnapshot(CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var snapshot = await ProjectSnapshot(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return snapshot;
    }

    public async Task<SnapshotDto> ReplaceSettings(OperatingLimits limits, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var workspace = await db.Workspaces.SingleAsync(cancellationToken);
        workspace.ReserveCents = limits.Reserve.Cents;
        workspace.SinkingFundCents = limits.SinkingFund.Cents;
        workspace.DailyPlanCents = limits.DailyPlan.Cents;
        workspace.Ambient = limits.Ambient;
        await db.SaveChangesAsync(cancellationToken);
        var snapshot = await ProjectSnapshot(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return snapshot;
    }

    public async Task<IReadOnlyList<AccountDto>> ReadAccounts(CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var accounts = await ProjectAccounts(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return accounts;
    }

    public async Task<IReadOnlyList<FinancialEntryDto>> ReadEntries(CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var entries = await ProjectEntries(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return entries;
    }

    private async Task<SnapshotDto> ProjectSnapshot(CancellationToken cancellationToken)
    {
        var workspace = await db.Workspaces.AsNoTracking().SingleAsync(cancellationToken);
        var accounts = await ProjectAccounts(cancellationToken);
        var entries = await ProjectEntries(cancellationToken);
        var allocations = await db.Allocations.AsNoTracking().OrderBy(x => x.DisplayOrder).ThenBy(x => x.Id).ToListAsync(cancellationToken);
        var reserved = await db.Reservations.SumAsync(x => x.AmountCents, cancellationToken);
        return new SnapshotDto(accounts, entries,
            allocations.Select(x => new AllocationDto(x.Id, x.Name, Dollars(x.AmountCents), x.Color)).ToArray(),
            new SettingsDto(Dollars(workspace.ReserveCents), Dollars(workspace.SinkingFundCents),
                Dollars(workspace.DailyPlanCents), workspace.Ambient), Dollars(reserved));
    }

    private async Task<IReadOnlyList<AccountDto>> ProjectAccounts(CancellationToken cancellationToken)
    {
        var accounts = await db.Accounts.AsNoTracking().OrderBy(x => x.DisplayOrder).ThenBy(x => x.Id).ToListAsync(cancellationToken);
        var reservations = await db.Reservations.AsNoTracking().GroupBy(x => x.AccountId)
            .Select(g => new { Id = g.Key, Cents = g.Sum(x => x.AmountCents) }).ToDictionaryAsync(x => x.Id, x => x.Cents, cancellationToken);
        return accounts.Select(x => new AccountDto(x.Id, x.Institution, x.Name, x.LastFour, x.Type,
            Dollars(checked(x.ObservedBalanceCents + x.LocalAdjustmentCents - reservations.GetValueOrDefault(x.Id))),
            x.Liquid, new SyncStatusDto(x.SyncState, x.LastSyncedAt, x.SyncMessage),
            x.CreditLimitCents is { } limit ? Dollars(limit) : null, x.PaymentDate,
            x.UpcomingPaymentCents is { } payment ? Dollars(payment) : null)).ToArray();
    }

    private async Task<IReadOnlyList<FinancialEntryDto>> ProjectEntries(CancellationToken cancellationToken)
    {
        var entries = await db.Entries.AsNoTracking().Where(x => !x.Archived).OrderBy(x => x.Date).ThenBy(x => x.Id).ToListAsync(cancellationToken);
        var occurrences = (await db.Occurrences.AsNoTracking().ToListAsync(cancellationToken)).ToLookup(x => x.EntryId);
        return entries.Select(x =>
        {
            var anchor = occurrences[x.Id].SingleOrDefault(o => o.Date == x.Date);
            var suppressed = occurrences[x.Id].Where(o => o.State == "skipped" || o.Date != x.Date)
                .Select(o => o.Date).Order().ToArray();
            return new FinancialEntryDto(x.Id, x.Kind, x.Source, x.Name, Dollars(x.AmountCents), x.Date,
                x.Variability, x.Frequency is not null, x.Category, x.AccountId, x.IncludedInForecast,
                anchor?.State == "completed", x.Frequency is { } frequency ? new RecurringRuleDto(frequency, x.IntervalDays) : null,
                anchor?.CompletedAt, suppressed, x.Merchant, x.Notes, x.PrimaryPaycheck);
        }).ToArray();
    }

    private static decimal Dollars(long cents) => new Money(cents).Dollars;
}
