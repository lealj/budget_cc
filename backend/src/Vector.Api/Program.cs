using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Vector.Api;
using Vector.Application;
using Vector.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentWorkspace, CurrentWorkspace>();
builder.Services.AddDbContext<FinanceDbContext>((services, options) =>
{
    var connection = services.GetRequiredService<IConfiguration>().GetConnectionString("Finance")
        ?? throw new InvalidOperationException("ConnectionStrings:Finance is required.");
    options.UseSqlite(connection);
});
builder.Services.AddScoped<IFinanceStore, FinanceStore>();
builder.Services.AddScoped<FinanceService>();
builder.Services.AddScoped<IAuthorizationHandler, WorkspaceMemberHandler>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IConfiguration>((options, configuration) =>
    {
        options.Authority = configuration["Authentication:Authority"];
        options.Audience = configuration["Authentication:Audience"];
        options.MapInboundClaims = false;
        options.RequireHttpsMetadata = true;
        options.IncludeErrorDetails = false;
        options.TokenValidationParameters.ValidateIssuer = true;
        options.TokenValidationParameters.ValidateAudience = true;
        options.TokenValidationParameters.ValidateLifetime = true;
        options.TokenValidationParameters.ValidateIssuerSigningKey = true;
        options.TokenValidationParameters.RequireSignedTokens = true;
        options.TokenValidationParameters.RequireExpirationTime = true;
        options.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(30);
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = 401;
                context.Response.Headers.WWWAuthenticate = "Bearer";
                await context.Response.WriteAsJsonAsync(new ApiError("Authentication is required.", "unauthorized"));
            },
            OnForbidden = context =>
            {
                context.Response.StatusCode = 403;
                return context.Response.WriteAsJsonAsync(new ApiError("Workspace access is denied.", "forbidden"));
            }
        };
    })
    .Validate(options => Uri.TryCreate(options.Authority, UriKind.Absolute, out var uri) && uri.Scheme == "https"
        && !string.IsNullOrWhiteSpace(options.Audience), "Configure an HTTPS Authentication:Authority and Authentication:Audience.")
    .ValidateOnStart();
builder.Services.AddAuthorization(options => options.AddPolicy("workspace-member", policy =>
    policy.RequireAuthenticatedUser().AddRequirements(new WorkspaceMemberRequirement())));
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);

var app = builder.Build();
if (args.Contains("--migrate"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<FinanceDbContext>().Database.MigrateAsync();
    return;
}
if (args.Contains("--provision"))
{
    await Provisioning.Run(builder.Configuration);
    return;
}

app.UseMiddleware<ErrorMiddleware>();
app.UseStatusCodePages(async context =>
{
    var response = context.HttpContext.Response;
    await response.WriteAsJsonAsync(new ApiError("Request could not be handled.", $"http_{response.StatusCode}"));
});
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    await next(context);
});
app.UseAuthentication();
app.UseAuthorization();
app.MapFinanceEndpoints();
app.Run();

public partial class Program;
