using System.Text.Json;
using Vector.Application;
using Vector.Domain;

namespace Vector.Api;

public sealed class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
        catch (Exception exception) when (!context.Response.HasStarted)
        {
            var (status, error) = exception switch
            {
                DomainValidationException validation => (400, new ApiError(validation.Message, "validation_failed")),
                BadHttpRequestException bad => (bad.StatusCode, new ApiError("Invalid request.", "invalid_request")),
                JsonException => (400, new ApiError("Invalid JSON request.", "invalid_request")),
                _ => (500, new ApiError("An unexpected error occurred.", "server_error"))
            };
            if (status == 500)
                logger.LogError("Request failed with {ExceptionType}; trace {TraceId}", exception.GetType().Name, context.TraceIdentifier);
            context.Response.Clear();
            context.Response.StatusCode = status;
            await context.Response.WriteAsJsonAsync(error, context.RequestAborted);
        }
    }
}
