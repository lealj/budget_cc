using Microsoft.EntityFrameworkCore;
using Vector.Domain;
using Vector.Infrastructure;
using Xunit;

namespace Vector.Tests;

public sealed class PersistenceTests
{
    [Fact]
    public void Money_preserves_cents_and_rejects_precision_loss_and_overflow()
    {
        Assert.Equal(29, Money.FromDollars(0.29m).Cents);
        Assert.Equal(-12.34m, new Money(-1234).Dollars);
        Assert.Equal(long.MaxValue, Money.FromDollars(long.MaxValue / 100m).Cents);
        Assert.Throws<DomainValidationException>(() => Money.FromDollars(0.001m));
        Assert.Throws<DomainValidationException>(() => Money.FromDollars(decimal.MaxValue));
        Assert.Throws<DomainValidationException>(() => new OperatingLimits(new Money(-1), default, default, false));
    }

    [Fact]
    public async Task Migrations_are_repeatable_and_model_matches_committed_migration()
    {
        using var host = new FinanceApiFactory();
        await using var db = host.OpenDatabase("workspace-a");
        await db.Database.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Single(await db.Database.GetAppliedMigrationsAsync());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Tracked_cross_workspace_writes_are_rejected_for_all_save_overloads(bool asynchronous)
    {
        using var host = new FinanceApiFactory();
        await using var db = host.OpenDatabase("workspace-a");
        db.Allocations.Add(new AllocationRecord { WorkspaceId = "workspace-b", Id = "forbidden", Name = "Example", Color = "#000000" });
        if (asynchronous)
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync(false));
        else
            Assert.Throws<InvalidOperationException>(() => db.SaveChanges(false));
    }

    [Fact]
    public async Task Composite_foreign_keys_reject_references_to_another_workspaces_account()
    {
        using var host = new FinanceApiFactory();
        await using (var other = host.OpenDatabase("workspace-b"))
        {
            other.Accounts.Add(new AccountRecord { WorkspaceId = "workspace-b", Id = "only-in-b", Name = "Example", Institution = "Example",
                LastFour = "5678", Type = "savings", SyncState = "nominal", LastSyncedAt = DateTimeOffset.UtcNow });
            await other.SaveChangesAsync();
        }
        await using var db = host.OpenDatabase("workspace-a");
        db.Reservations.Add(new ReservationRecord { WorkspaceId = "workspace-a", Id = "bad-reference", AccountId = "only-in-b", AmountCents = 100 });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Single(await db.Accounts.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Occurrence_identity_is_unique_and_history_survives_archiving()
    {
        using var host = new FinanceApiFactory();
        await using (var db = host.OpenDatabase("workspace-a"))
        {
            db.Occurrences.Add(new OccurrenceRecord { WorkspaceId = "workspace-a", EntryId = "entry", Date = new DateOnly(2026, 10, 1), State = "skipped" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        await using var archive = host.OpenDatabase("workspace-a");
        (await archive.Entries.SingleAsync()).Archived = true;
        await archive.SaveChangesAsync();
        var snapshot = await new FinanceStore(archive).ReadSnapshot(default);
        Assert.Empty(snapshot.Entries);
        Assert.Equal(3, await archive.Occurrences.CountAsync());
        Assert.Equal(965m, Assert.Single(snapshot.Accounts).Balance);
    }

    [Fact]
    public async Task Database_rejects_negative_settings_even_if_application_validation_is_bypassed()
    {
        using var host = new FinanceApiFactory();
        await using var db = host.OpenDatabase("workspace-a");
        (await db.Workspaces.SingleAsync()).ReserveCents = -1;
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
