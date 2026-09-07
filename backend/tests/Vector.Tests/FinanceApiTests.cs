using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vector.Application;
using Xunit;

namespace Vector.Tests;

public sealed class FinanceApiTests
{
    [Fact]
    public async Task Anonymous_and_invalid_tokens_receive_safe_401_with_challenge()
    {
        using var host = new FinanceApiFactory();
        using var client = host.CreateClient();
        foreach (var token in new string?[] { null, "malformed", host.Token(expired: true), host.Token(wrongKey: true),
            host.Token(audience: "wrong"), host.Token(issuer: "https://wrong.example.test") })
        {
            client.DefaultRequestHeaders.Authorization = token is null ? null : new AuthenticationHeaderValue("Bearer", token);
            var response = await client.GetAsync("/api/v1/finance/snapshot");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("Bearer", response.Headers.WwwAuthenticate.Single().Scheme);
            Assert.Equal("unauthorized", (await response.Content.ReadFromJsonAsync<ApiError>())!.Code);
        }
    }

    [Fact]
    public async Task Missing_ambiguous_or_nonmember_workspace_is_forbidden()
    {
        using var host = new FinanceApiFactory();
        using var client = host.CreateClient();
        foreach (var token in new[] { host.Token(workspace: null), host.Token(workspace: ""),
            host.Token(workspace: "missing"), host.Token(subject: "nonmember"), host.Token(duplicateWorkspace: true) })
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await client.GetAsync("/api/v1/accounts");
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Equal("forbidden", (await response.Content.ReadFromJsonAsync<ApiError>())!.Code);
        }
    }

    [Fact]
    public async Task Membership_revocation_takes_effect_without_waiting_for_token_expiry()
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/accounts")).StatusCode);
        await using var db = host.OpenDatabase("workspace-a");
        db.Memberships.Remove(await db.Memberships.SingleAsync());
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/accounts")).StatusCode);
    }

    [Fact]
    public async Task Snapshot_projects_real_rows_dollar_numbers_dates_and_reservations_once()
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        var response = await client.GetAsync("/api/v1/finance/snapshot");
        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.CacheControl!.NoStore);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal(5, root.EnumerateObject().Count());
        var account = Assert.Single(root.GetProperty("accounts").EnumerateArray());
        Assert.Equal(965m, account.GetProperty("balance").GetDecimal());
        Assert.False(account.TryGetProperty("observedBalanceCents", out _));
        Assert.False(account.TryGetProperty("workspaceId", out _));
        Assert.False(account.TryGetProperty("creditLimit", out _));
        Assert.Equal(25m, root.GetProperty("allocatedTotal").GetDecimal());
        Assert.Equal(100m, root.GetProperty("settings").GetProperty("reserve").GetDecimal());
        var entry = Assert.Single(root.GetProperty("entries").EnumerateArray());
        Assert.Equal("2026-09-01", entry.GetProperty("date").GetString());
        Assert.True(entry.GetProperty("completed").GetBoolean());
        Assert.Contains("T", entry.GetProperty("completedAt").GetString());
        Assert.Equal(new[] { "2026-10-01", "2026-11-01" }, entry.GetProperty("skippedDates").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(12.5m, entry.GetProperty("amount").GetDecimal());
        var accounts = await client.GetFromJsonAsync<AccountDto[]>("/api/v1/accounts");
        Assert.Equal(965m, Assert.Single(accounts!).Balance);
        var entries = await client.GetFromJsonAsync<FinancialEntryDto[]>("/api/v1/transactions");
        Assert.Single(entries!);
    }

    [Fact]
    public async Task Settings_replace_is_durable_idempotent_and_scoped_even_with_spoofed_scope_fields()
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        client.DefaultRequestHeaders.Add("X-Workspace-Id", "workspace-b");
        const string body = """{"reserve":123.45,"sinkingFund":7.89,"dailyPlan":0,"ambient":false,"workspaceId":"workspace-b"}""";
        for (var i = 0; i < 2; i++)
        {
            var response = await client.PutAsync("/api/v1/settings", Json(body));
            response.EnsureSuccessStatusCode();
            var snapshot = await response.Content.ReadFromJsonAsync<SnapshotDto>();
            Assert.Equal(new SettingsDto(123.45m, 7.89m, 0m, false), snapshot!.Settings);
            Assert.Single(snapshot.Accounts);
            Assert.Single(snapshot.Entries);
            Assert.Single(snapshot.Allocations);
            Assert.Equal(25m, snapshot.AllocatedTotal);
        }
        await using var db = host.OpenDatabase("workspace-a");
        Assert.Equal(12345, (await db.Workspaces.SingleAsync()).ReserveCents);
        Assert.Equal(100000, (await db.Accounts.SingleAsync()).ObservedBalanceCents);
        using var other = host.AuthenticatedClient("workspace-b");
        Assert.Equal(900m, (await other.GetFromJsonAsync<SnapshotDto>("/api/v1/finance/snapshot"))!.Settings.Reserve);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("{bad}")]
    [InlineData("{\"reserve\":0,\"sinkingFund\":0,\"dailyPlan\":0}")]
    [InlineData("{\"reserve\":null,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":-1,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":1.001,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":\"12\",\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":NaN,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":1e100,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    [InlineData("{\"reserve\":92233720368547758.08,\"sinkingFund\":0,\"dailyPlan\":0,\"ambient\":true}")]
    public async Task Invalid_settings_return_contract_error_without_writing(string body)
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        var response = await client.PutAsync("/api/v1/settings", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await response.Content.ReadFromJsonAsync<ApiError>())!.Code));
        await using var db = host.OpenDatabase("workspace-a");
        Assert.Equal(10000, (await db.Workspaces.SingleAsync()).ReserveCents);
    }

    [Fact]
    public async Task Snapshot_failure_after_settings_save_rolls_back_entire_transaction()
    {
        using var host = new FinanceApiFactory();
        await using (var db = host.OpenDatabase("workspace-a"))
        {
            (await db.Accounts.SingleAsync()).LocalAdjustmentCents = long.MaxValue;
            await db.SaveChangesAsync();
        }
        using var client = host.AuthenticatedClient();
        var response = await client.PutAsJsonAsync("/api/v1/settings", new SettingsDto(1m, 2m, 3m, false));
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(new ApiError("An unexpected error occurred.", "server_error"), await response.Content.ReadFromJsonAsync<ApiError>());
        await using var verify = host.OpenDatabase("workspace-a");
        Assert.Equal(10000, (await verify.Workspaces.SingleAsync()).ReserveCents);
    }

    [Fact]
    public async Task Concurrent_settings_responses_each_contain_their_own_committed_settings()
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        var settings = new[] { new SettingsDto(11, 12, 13, true), new SettingsDto(21, 22, 23, false) };
        await Task.WhenAll(settings.Select(async value =>
        {
            var response = await client.PutAsJsonAsync("/api/v1/settings", value);
            response.EnsureSuccessStatusCode();
            Assert.Equal(value, (await response.Content.ReadFromJsonAsync<SnapshotDto>())!.Settings);
        }));
        var final = await client.GetFromJsonAsync<SnapshotDto>("/api/v1/finance/snapshot");
        Assert.Contains(final!.Settings, settings);
    }

    [Fact]
    public async Task Deferred_operations_do_not_report_fake_success()
    {
        using var host = new FinanceApiFactory();
        using var client = host.AuthenticatedClient();
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await client.PostAsync("/api/v1/accounts", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/v1/transactions/entry/complete", null)).StatusCode);
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");
}
