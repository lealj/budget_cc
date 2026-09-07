using BudgetCC.Application;

namespace BudgetCC.Api;

public static class FinanceEndpoints
{
    public static void MapFinanceEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1").RequireAuthorization("workspace-member");
        api.MapGet("/finance/snapshot", (FinanceService service, CancellationToken ct) => service.ReadSnapshot(ct))
            .WithName("getFinanceSnapshot");
        api.MapGet("/accounts", (FinanceService service, CancellationToken ct) => service.ReadAccounts(ct))
            .WithName("getAccounts");
        api.MapGet("/transactions", (FinanceService service, CancellationToken ct) => service.ReadEntries(ct))
            .WithName("getTransactions");
        api.MapPut("/settings", async (SaveSettingsRequest request, FinanceService service, CancellationToken ct) =>
        {
            if (request.Reserve is null || request.SinkingFund is null || request.DailyPlan is null || request.Ambient is null)
                return Results.BadRequest(new ApiError("All settings fields are required.", "validation_failed"));
            var snapshot = await service.SaveSettings(new SettingsDto(request.Reserve.Value,
                request.SinkingFund.Value, request.DailyPlan.Value, request.Ambient.Value), ct);
            return Results.Ok(snapshot);
        }).WithName("saveSettings");
    }
}

// Nullable input distinguishes missing fields from valid zero/false values.
public sealed record SaveSettingsRequest(decimal? Reserve, decimal? SinkingFund, decimal? DailyPlan, bool? Ambient);
