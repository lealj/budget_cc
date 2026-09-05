# Backend Agent

Primary responsibility:
- ASP.NET Core
- EF Core
- SQLite
- API endpoints
- Plaid integration

# Backend Instructions
Do not modify frontend implementation unless explicitly instructed.
- Add comments only when they explain non-obvious intent, constraints, workarounds, or architectural decisions. Do not comment code whose behavior is already clear from its names and structure.

## Test Failure / Retry Policy

When a build or test fails:

1. Read and classify the failure before making another change.
2. Attempt at most 3 fix-and-retest cycles for the same underlying failure.
3. Do not repeatedly make speculative changes without new evidence.
4. If the same failure persists after 3 attempts:
   - stop modifying code,
   - preserve the current working state,
   - summarize the failure,
   - list the attempted fixes,
   - identify the most likely root cause,
   - include the failing command and relevant error output,
   - escalate for review instead of continuing.
5. If a new unrelated failure appears, treat it as a separate issue, but do not exceed 5 total fix attempts for the task without escalation.
6. Never weaken, delete, or skip a legitimate test merely to make the test suite pass.