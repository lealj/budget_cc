using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using BudgetCC.Application;
using BudgetCC.Infrastructure;

namespace BudgetCC.Api;

public sealed class CurrentWorkspace(IHttpContextAccessor accessor) : ICurrentWorkspace
{
    public string Id => accessor.HttpContext?.User.FindFirst("workspace_id")?.Value ?? "";
}

public sealed class WorkspaceMemberRequirement : IAuthorizationRequirement;

public sealed class WorkspaceMemberHandler(FinanceDbContext db)
    : AuthorizationHandler<WorkspaceMemberRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, WorkspaceMemberRequirement requirement)
    {
        var subjects = context.User.FindAll("sub").ToArray();
        var workspaces = context.User.FindAll("workspace_id").ToArray();
        if (context.User.Identity?.IsAuthenticated != true || subjects.Length != 1 || workspaces.Length != 1 ||
            string.IsNullOrWhiteSpace(subjects[0].Value) || string.IsNullOrWhiteSpace(workspaces[0].Value))
            return;
        var cancellationToken = (context.Resource as HttpContext)?.RequestAborted ?? default;
        if (await db.Memberships.AsNoTracking().AnyAsync(x => x.Subject == subjects[0].Value, cancellationToken))
            context.Succeed(requirement);
    }
}
