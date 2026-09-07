using BudgetCC.Domain;

namespace BudgetCC.Application;

public interface ICurrentWorkspace
{
    string Id { get; }
}

// This port owns the transaction boundary, including projection before commit.
// It is intentionally a use-case store, not a generic CRUD repository.
public interface IFinanceStore
{
    Task<SnapshotDto> ReadSnapshot(CancellationToken cancellationToken);
    Task<IReadOnlyList<AccountDto>> ReadAccounts(CancellationToken cancellationToken);
    Task<IReadOnlyList<FinancialEntryDto>> ReadEntries(CancellationToken cancellationToken);
    Task<SnapshotDto> ReplaceSettings(OperatingLimits limits, CancellationToken cancellationToken);
}

public sealed class FinanceService(IFinanceStore store)
{
    public Task<SnapshotDto> ReadSnapshot(CancellationToken cancellationToken) => store.ReadSnapshot(cancellationToken);
    public Task<IReadOnlyList<AccountDto>> ReadAccounts(CancellationToken cancellationToken) => store.ReadAccounts(cancellationToken);
    public Task<IReadOnlyList<FinancialEntryDto>> ReadEntries(CancellationToken cancellationToken) => store.ReadEntries(cancellationToken);

    public Task<SnapshotDto> SaveSettings(SettingsDto settings, CancellationToken cancellationToken)
    {
        var limits = new OperatingLimits(Money.FromDollars(settings.Reserve),
            Money.FromDollars(settings.SinkingFund), Money.FromDollars(settings.DailyPlan), settings.Ambient);
        return store.ReplaceSettings(limits, cancellationToken);
    }
}
