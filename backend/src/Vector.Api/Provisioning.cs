using Microsoft.EntityFrameworkCore;
using Vector.Application;
using Vector.Infrastructure;

namespace Vector.Api;

internal static class Provisioning
{
    public static async Task Run(IConfiguration configuration)
    {
        var workspaceId = configuration["Provisioning:WorkspaceId"];
        var subject = configuration["Provisioning:Subject"];
        var connection = configuration.GetConnectionString("Finance");
        if (string.IsNullOrWhiteSpace(workspaceId) || string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("Provisioning requires workspace, subject and database configuration.");

        await using var db = new FinanceDbContext(new DbContextOptionsBuilder<FinanceDbContext>().UseSqlite(connection).Options,
            new ProvisioningWorkspace(workspaceId));
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Workspaces.AnyAsync())
            db.Workspaces.Add(new WorkspaceRecord { Id = workspaceId });
        if (!await db.Memberships.AnyAsync(x => x.Subject == subject))
            db.Memberships.Add(new MembershipRecord { WorkspaceId = workspaceId, Subject = subject });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }

    private sealed record ProvisioningWorkspace(string Id) : ICurrentWorkspace;
}
