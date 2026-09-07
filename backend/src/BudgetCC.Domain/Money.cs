namespace BudgetCC.Domain;

public sealed class DomainValidationException(string message) : Exception(message);

public readonly record struct Money(long Cents)
{
    public decimal Dollars => Cents / 100m;

    public static Money FromDollars(decimal dollars)
    {
        if (dollars < long.MinValue / 100m || dollars > long.MaxValue / 100m)
            throw new DomainValidationException("Amount exceeds supported storage precision.");
        var cents = dollars * 100m;
        if (decimal.Truncate(cents) != cents)
            throw new DomainValidationException("Amounts must have at most two decimal places.");
        return new Money((long)cents);
    }
}

public sealed record OperatingLimits
{
    public Money Reserve { get; }
    public Money SinkingFund { get; }
    public Money DailyPlan { get; }
    public bool Ambient { get; }

    public OperatingLimits(Money reserve, Money sinkingFund, Money dailyPlan, bool ambient)
    {
        if (reserve.Cents < 0 || sinkingFund.Cents < 0 || dailyPlan.Cents < 0)
            throw new DomainValidationException("Operating limits must be non-negative.");
        (Reserve, SinkingFund, DailyPlan, Ambient) = (reserve, sinkingFund, dailyPlan, ambient);
    }
}
