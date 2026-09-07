namespace Vector.Infrastructure;

public sealed class WorkspaceRecord
{
    public required string Id { get; set; }
    public long ReserveCents { get; set; }
    public long SinkingFundCents { get; set; }
    public long DailyPlanCents { get; set; }
    public bool Ambient { get; set; }
}

public abstract class WorkspaceRecordBase
{
    public required string WorkspaceId { get; set; }
}

public sealed class MembershipRecord : WorkspaceRecordBase
{
    public required string Subject { get; set; }
}

// Dashboard read records, not a bank ledger. Future write modules maintain these
// in the same transaction as their authoritative domain records (see architecture).
public sealed class AccountRecord : WorkspaceRecordBase
{
    public required string Id { get; set; }
    public required string Institution { get; set; }
    public required string Name { get; set; }
    public required string LastFour { get; set; }
    public required string Type { get; set; }
    public long ObservedBalanceCents { get; set; }
    public long LocalAdjustmentCents { get; set; }
    public bool Liquid { get; set; }
    public int DisplayOrder { get; set; }
    public required string SyncState { get; set; }
    public DateTimeOffset LastSyncedAt { get; set; }
    public string? SyncMessage { get; set; }
    public long? CreditLimitCents { get; set; }
    public DateOnly? PaymentDate { get; set; }
    public long? UpcomingPaymentCents { get; set; }
}

public sealed class EntryRecord : WorkspaceRecordBase
{
    public required string Id { get; set; }
    public required string AccountId { get; set; }
    public required string Kind { get; set; }
    public required string Source { get; set; }
    public required string Name { get; set; }
    public long AmountCents { get; set; }
    public DateOnly Date { get; set; }
    public required string Variability { get; set; }
    public string? Frequency { get; set; }
    public int? IntervalDays { get; set; }
    public required string Category { get; set; }
    public bool IncludedInForecast { get; set; }
    public bool PrimaryPaycheck { get; set; }
    public string? Merchant { get; set; }
    public string? Notes { get; set; }
    public bool Archived { get; set; }
}

public sealed class OccurrenceRecord : WorkspaceRecordBase
{
    public required string EntryId { get; set; }
    public DateOnly Date { get; set; }
    public required string State { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class AllocationRecord : WorkspaceRecordBase
{
    public required string Id { get; set; }
    public required string Name { get; set; }
    public long AmountCents { get; set; }
    public required string Color { get; set; }
    public int DisplayOrder { get; set; }
}

public sealed class ReservationRecord : WorkspaceRecordBase
{
    public required string Id { get; set; }
    public required string AccountId { get; set; }
    public long AmountCents { get; set; }
}
