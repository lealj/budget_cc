using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BudgetCC.Application;

namespace BudgetCC.Infrastructure;

public sealed class FinanceDbContext(DbContextOptions<FinanceDbContext> options, ICurrentWorkspace workspace)
    : DbContext(options)
{
    public string WorkspaceId => workspace.Id;
    public DbSet<WorkspaceRecord> Workspaces => Set<WorkspaceRecord>();
    public DbSet<MembershipRecord> Memberships => Set<MembershipRecord>();
    public DbSet<AccountRecord> Accounts => Set<AccountRecord>();
    public DbSet<EntryRecord> Entries => Set<EntryRecord>();
    public DbSet<OccurrenceRecord> Occurrences => Set<OccurrenceRecord>();
    public DbSet<AllocationRecord> Allocations => Set<AllocationRecord>();
    public DbSet<ReservationRecord> Reservations => Set<ReservationRecord>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        var w = model.Entity<WorkspaceRecord>();
        w.HasKey(x => x.Id);
        w.HasQueryFilter(x => x.Id == WorkspaceId);
        w.ToTable("Workspaces", t => t.HasCheckConstraint("CK_Settings_NonNegative",
            "ReserveCents >= 0 AND SinkingFundCents >= 0 AND DailyPlanCents >= 0"));

        var m = Scoped<MembershipRecord>(model);
        m.HasKey(x => new { x.WorkspaceId, x.Subject });

        var a = Scoped<AccountRecord>(model);
        a.HasKey(x => new { x.WorkspaceId, x.Id });
        a.ToTable("Accounts", t =>
        {
            t.HasCheckConstraint("CK_Account_Type", "Type IN ('checking','savings','credit')");
            t.HasCheckConstraint("CK_Account_Mask", "length(LastFour) = 4 AND LastFour NOT GLOB '*[^0-9]*'");
            t.HasCheckConstraint("CK_Account_Sync", "SyncState IN ('nominal','syncing','attention')");
            t.HasCheckConstraint("CK_Account_Liquid", "Type != 'credit' OR Liquid = 0");
        });

        var e = Scoped<EntryRecord>(model);
        e.HasKey(x => new { x.WorkspaceId, x.Id });
        e.HasOne<AccountRecord>().WithMany().HasForeignKey(x => new { x.WorkspaceId, x.AccountId })
            .OnDelete(DeleteBehavior.Restrict);
        e.HasIndex(x => x.WorkspaceId).IsUnique().HasFilter("PrimaryPaycheck = 1 AND Archived = 0");
        e.ToTable("Entries", t =>
        {
            t.HasCheckConstraint("CK_Entry_Money", "AmountCents > 0");
            t.HasCheckConstraint("CK_Entry_Kind", "Kind IN ('income','expense')");
            t.HasCheckConstraint("CK_Entry_Source", "Source IN ('manual','synced','projected')");
            t.HasCheckConstraint("CK_Entry_Variability", "Variability IN ('static','dynamic')");
            t.HasCheckConstraint("CK_Entry_Paycheck", "PrimaryPaycheck = 0 OR Kind = 'income'");
            t.HasCheckConstraint("CK_Entry_Frequency", "Frequency IS NULL OR Frequency IN ('weekly','biweekly','semimonthly','monthly','quarterly','annual','custom')");
            t.HasCheckConstraint("CK_Entry_Interval", "Frequency != 'custom' OR (IntervalDays IS NOT NULL AND IntervalDays > 0)");
        });

        var o = Scoped<OccurrenceRecord>(model);
        o.HasKey(x => new { x.WorkspaceId, x.EntryId, x.Date });
        o.HasOne<EntryRecord>().WithMany().HasForeignKey(x => new { x.WorkspaceId, x.EntryId })
            .OnDelete(DeleteBehavior.Restrict);
        o.ToTable("Occurrences", t => t.HasCheckConstraint("CK_Occurrence_State",
            "(State = 'completed' AND CompletedAt IS NOT NULL) OR (State = 'skipped' AND CompletedAt IS NULL)"));

        var allocation = Scoped<AllocationRecord>(model);
        allocation.HasKey(x => new { x.WorkspaceId, x.Id });
        allocation.ToTable("Allocations", t => t.HasCheckConstraint("CK_Allocation_Money", "AmountCents >= 0"));

        var r = Scoped<ReservationRecord>(model);
        r.HasKey(x => new { x.WorkspaceId, x.Id });
        r.HasOne<AccountRecord>().WithMany().HasForeignKey(x => new { x.WorkspaceId, x.AccountId })
            .OnDelete(DeleteBehavior.Restrict);
        r.ToTable("Reservations", t => t.HasCheckConstraint("CK_Reservation_Money", "AmountCents > 0"));
    }

    private EntityTypeBuilder<T> Scoped<T>(ModelBuilder model) where T : WorkspaceRecordBase
    {
        var entity = model.Entity<T>();
        entity.HasQueryFilter(x => x.WorkspaceId == WorkspaceId);
        entity.HasOne<WorkspaceRecord>().WithMany().HasForeignKey(x => x.WorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);
        return entity;
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        AssertWorkspaceWrites();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        AssertWorkspaceWrites();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    private void AssertWorkspaceWrites()
    {
        foreach (var entry in ChangeTracker.Entries().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))
        {
            var id = entry.Entity is WorkspaceRecord w ? w.Id : ((WorkspaceRecordBase)entry.Entity).WorkspaceId;
            if (string.IsNullOrWhiteSpace(WorkspaceId) || id != WorkspaceId)
                throw new InvalidOperationException("Cross-workspace writes are prohibited.");
        }
    }
}

public sealed class MigrationContextFactory : IDesignTimeDbContextFactory<FinanceDbContext>
{
    public FinanceDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<FinanceDbContext>().UseSqlite("Data Source=:memory:").Options,
        new MigrationWorkspace());

    private sealed class MigrationWorkspace : ICurrentWorkspace { public string Id => ""; }
}
