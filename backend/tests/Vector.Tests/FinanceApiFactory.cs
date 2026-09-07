using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Vector.Application;
using Vector.Infrastructure;

namespace Vector.Tests;

public sealed class FinanceApiFactory : WebApplicationFactory<Program>
{
    private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"vector-test-{Guid.NewGuid():N}.db");
    private readonly RSA signingKey = RSA.Create(2048);
    private const string Issuer = "https://issuer.example.test";
    public string ConnectionString => $"Data Source={databasePath};Pooling=False;Foreign Keys=True";

    public FinanceApiFactory()
    {
        using var db = OpenDatabase("workspace-a");
        db.Database.Migrate();
        Seed(db, "workspace-a", 100_00);
        using var other = OpenDatabase("workspace-b");
        Seed(other, "workspace-b", 900_00);
    }

    public FinanceDbContext OpenDatabase(string workspace) => new(
        new DbContextOptionsBuilder<FinanceDbContext>().UseSqlite(ConnectionString).Options,
        new TestWorkspace(workspace));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(logging => logging.ClearProviders());
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Finance"] = ConnectionString,
            ["Authentication:Authority"] = Issuer,
            ["Authentication:Audience"] = "vector-tests"
        }));
        builder.ConfigureServices(services => services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            var metadata = new OpenIdConnectConfiguration { Issuer = Issuer };
            metadata.SigningKeys.Add(new RsaSecurityKey(signingKey) { KeyId = "ephemeral-test-key" });
            options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(metadata);
        }));
    }

    public HttpClient AuthenticatedClient(string workspace = "workspace-a", string subject = "test-member")
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(workspace, subject));
        return client;
    }

    public string Token(string? workspace = "workspace-a", string subject = "test-member", string audience = "vector-tests",
        string issuer = Issuer, bool expired = false, bool wrongKey = false, bool duplicateWorkspace = false)
    {
        using var otherKey = wrongKey ? RSA.Create(2048) : null;
        var claims = new List<Claim> { new("sub", subject) };
        if (workspace is not null) claims.Add(new Claim("workspace_id", workspace));
        if (duplicateWorkspace) claims.Add(new Claim("workspace_id", "workspace-b"));
        var jwt = new JwtSecurityToken(issuer, audience, claims, DateTime.UtcNow.AddHours(-2),
            expired ? DateTime.UtcNow.AddHours(-1) : DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(new RsaSecurityKey(otherKey ?? signingKey) { KeyId = "ephemeral-test-key" }, SecurityAlgorithms.RsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    private static void Seed(FinanceDbContext db, string workspace, long reserve)
    {
        db.Workspaces.Add(new WorkspaceRecord { Id = workspace, ReserveCents = reserve, Ambient = true });
        db.Memberships.Add(new MembershipRecord { WorkspaceId = workspace, Subject = "test-member" });
        db.Accounts.Add(new AccountRecord
        {
            WorkspaceId = workspace, Id = "account", Institution = "Example institution", Name = "Example account",
            LastFour = "1234", Type = "checking", ObservedBalanceCents = 1000_00, LocalAdjustmentCents = -10_00,
            Liquid = true, SyncState = "nominal", LastSyncedAt = DateTimeOffset.Parse("2026-09-01T10:00:00Z")
        });
        db.Entries.Add(new EntryRecord
        {
            WorkspaceId = workspace, Id = "entry", AccountId = "account", Kind = "expense", Source = "manual",
            Name = "Example plan", AmountCents = 12_50, Date = new DateOnly(2026, 9, 1),
            Variability = "static", Frequency = "monthly", Category = "Example", IncludedInForecast = true
        });
        db.Occurrences.AddRange(
            new OccurrenceRecord { WorkspaceId = workspace, EntryId = "entry", Date = new DateOnly(2026, 9, 1), State = "completed", CompletedAt = DateTimeOffset.Parse("2026-09-01T12:00:00Z") },
            new OccurrenceRecord { WorkspaceId = workspace, EntryId = "entry", Date = new DateOnly(2026, 10, 1), State = "skipped" },
            new OccurrenceRecord { WorkspaceId = workspace, EntryId = "entry", Date = new DateOnly(2026, 11, 1), State = "completed", CompletedAt = DateTimeOffset.Parse("2026-09-02T12:00:00Z") });
        db.Allocations.Add(new AllocationRecord { WorkspaceId = workspace, Id = "target", Name = "Example target", AmountCents = 0, Color = "#123456" });
        db.Reservations.Add(new ReservationRecord { WorkspaceId = workspace, Id = "reservation", AccountId = "account", AmountCents = 25_00 });
        db.SaveChanges();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            signingKey.Dispose();
            File.Delete(databasePath);
            File.Delete(databasePath + "-wal");
            File.Delete(databasePath + "-shm");
        }
    }

    private sealed record TestWorkspace(string Id) : ICurrentWorkspace;
}
