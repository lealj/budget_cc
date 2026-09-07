namespace BudgetCC.Application;

// Wire DTOs deliberately do not serve as EF entities or provider models.
public sealed record SettingsDto(decimal Reserve, decimal SinkingFund, decimal DailyPlan, bool Ambient);
public sealed record SyncStatusDto(string State, DateTimeOffset LastSyncedAt, string? Message = null);
public sealed record AccountDto(string Id, string Institution, string Name, string LastFour,
    string Type, decimal Balance, bool Liquid, SyncStatusDto Sync,
    decimal? CreditLimit = null, DateOnly? PaymentDate = null, decimal? UpcomingPayment = null);
public sealed record RecurringRuleDto(string Frequency, int? IntervalDays = null);
public sealed record FinancialEntryDto(string Id, string Kind, string Source, string Name,
    decimal Amount, DateOnly Date, string Variability, bool Recurring, string Category,
    string AccountId, bool IncludedInForecast, bool Completed,
    RecurringRuleDto? Recurrence = null, DateTimeOffset? CompletedAt = null,
    IReadOnlyList<DateOnly>? SkippedDates = null, string? Merchant = null,
    string? Notes = null, bool? PrimaryPaycheck = null);
public sealed record AllocationDto(string Id, string Name, decimal Amount, string Color);
public sealed record SnapshotDto(IReadOnlyList<AccountDto> Accounts,
    IReadOnlyList<FinancialEntryDto> Entries, IReadOnlyList<AllocationDto> Allocations,
    SettingsDto Settings, decimal AllocatedTotal);
public sealed record ApiError(string Message, string Code);
