# Architecture and implementation guide

## Scope and dependency direction

This is a modular monolith with one SQLite database. Four projects enforce the
dependency direction:

```text
HTTP / JWT / composition (BudgetCC.Api)
               -> use cases, DTOs, persistence ports (BudgetCC.Application)
               -> pure financial invariants (BudgetCC.Domain)

EF Core adapters (BudgetCC.Infrastructure) -> Application -> Domain
Api also references Infrastructure only to compose the concrete implementation.
```

Use ordinary classes and narrow ports. There is no generic CRUD repository, mediator
framework, event bus, separate read database, or microservice dependency. The database
records under Infrastructure are never serialized directly. Application and Domain
must not reference ASP.NET, EF, Plaid SDK types or configuration providers.

Implemented domain behavior is deliberately small: exact money and operating limits.
The settings feature is the complete reference for validation, authorization,
persistence, error handling, rollback and testing. Read records support the whole v1
dashboard but are **not** a finished transaction ledger or Plaid storage model.

## Follow the settings reference

1. `FinanceEndpoints` binds an input DTO. Nullable members preserve the difference
   between omitted required values and valid zero/false. It translates HTTP only.
2. Authentication validates the JWT, then `WorkspaceMemberHandler` checks current
   membership. Scope comes exclusively from the validated token. A request body,
   path identifier or `X-Workspace-Id` header cannot select a workspace.
3. `FinanceService.SaveSettings` converts dollar decimals to `Money`, then builds
   `OperatingLimits`. Invalid values fail before opening a write transaction.
4. `FinanceStore.ReplaceSettings` opens a serializable transaction, loads the scoped
   workspace, replaces settings, saves, projects the entire snapshot and commits.
   A failed projection or cancellation before commit rolls back the settings too.
5. The API serializes detached DTOs: camelCase, JSON number dollars, `DateOnly`
   financial dates, instant timestamps, and omitted optional null properties.
6. Tests call HTTP with signed synthetic tokens and a migrated SQLite database,
   then reopen a separate context to check committed state and workspace isolation.

For the next feature, add one focused application service and persistence port if
its responsibilities differ; do not grow `FinanceService` into a universal handler.
Add a pure domain policy for financial decisions. Extend the existing snapshot
projection inside the same database transaction; do not duplicate projection logic
in endpoints. Refactor projection into an internal shared component when another
write store needs it. Keep the existing response semantics until a reviewed contract
change explicitly replaces them.

## Persistence and transaction rules

Money crosses HTTP as `decimal` dollars, converts exactly to `long` cents, and is
stored as SQLite INTEGER. Values with fractional cents or outside signed 64-bit
cent storage return `400`; no silent rounding or double-based arithmetic. Aggregate
overflow must fail the transaction. If product limits are needed, add matching
contract/client validation. This avoids SQLite's limitations for decimal comparison
and ordering documented by [Microsoft](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/limitations).

Every tenant-owned table has a workspace filter. Child primary/foreign keys include
workspace IDs, so an account ID in another workspace cannot satisfy a reference.
Tracked writes are checked for matching scope, including explicit SaveChanges
overloads. These are application safeguards, not SQLite row-level security:
`IgnoreQueryFilters`, raw SQL, ExecuteUpdate/Delete and a malicious process with
database access can bypass them. Do not use those APIs in request handlers. Migration
and provisioning are separate trusted operator paths; provider workers must resolve
their workspace from a persisted connection before constructing a scoped context.

Settings use last-committed-write-wins. Serializing writes prevents a response from
containing another writer's settings, but does not detect a stale browser draft.
Before entry/financial writes, implement the reviewed revision/If-Match protocol
with a workspace revision increment in every relevant transaction. Do not mistake
an in-process lock for durable concurrency control.

Snapshot transactions read committed local state only. SQLite's serializable
transactions can serialize access across workspaces and wait for a writer lock;
keep them short and never hold one across a provider call. The concurrent HTTP test
checks write/response consistency. For heavier workloads, revisit read transaction
mode/WAL with explicit concurrency tests or move the adapter to PostgreSQL. Do not
add blind request retries around financial operations.

The initial migration contains:

| Table | Role and constraints |
| --- | --- |
| Workspaces | Authoritative operating limits; nonnegative cent checks |
| Memberships | Current issuer subject membership; composite key |
| Accounts | v1 dashboard projection of observed balance, local adjustment, stable display order and supported display metadata |
| Entries | v1 source-entry projection, recurrence scalars, archived flag; scoped account FK and unique active primary paycheck |
| Occurrences | Distinct skipped/completed state, unique entry/date identity, completion instant; retained when an entry is archived |
| Allocations | Dashboard allocation targets/drafts, separate from reservations |
| Reservations | Active per-account reservation projection; positive cents and scoped account FK |

No writer for the five financial projection tables is exposed yet. Future modules
write their authoritative records and update these projections atomically in the
same database. Avoid asynchronously updated projections while the v1 mutation
contract requires a complete, current snapshot.

## Financial ownership decisions

`Account.balance` in v1 is the effective planning balance:

```text
effective cents = observed balance cents + unapplied local adjustment cents
                  - active reservation cents
allocatedTotal = sum(active reservation cents)
```

Observed credit balances represent debt, including possible negative credit balances.
Credit accounts are not liquid. Reservation writes must select positive liquid
deposit balances in persisted `(DisplayOrder, Id)` order, and must never reserve a
credit account. The read model can store only accounts representable by today's
strict v1 schema. It is not a place to ingest every Plaid response directly.

Local adjustments must ultimately be backed by immutable signed balance-effect
records, keyed to a completion/correction. They cannot be the sole evidence that
money moved. Do not implement settlement by just incrementing `LocalAdjustmentCents`.
Account observations change independently; reconciliation must retire or match
local effects already reflected by an observation, without applying imported
transactions to an observed balance again.

An entry's future plan, a completed occurrence and a provider transaction are
different things. `Entries.Source` is a v1 projection discriminator, not permission
to edit bank-owned data. Imported transactions get their own authoritative table
and local ID; plans link to them through matches. Pending/posted replacements and
provider removal do not delete local history. Corrections add compensating effects;
archiving a plan suppresses forecasts and preserves completed effects. `skippedDates`
is a lossy compatibility projection, not the authoritative occurrence state.

## Ordered implementation tasks

### 1. Forecast policy and manual entry writes

Add `PlannedEntry`, a recurrence policy and a calendar-date/timezone policy under
Domain. Introduce authoritative plan persistence and an `IEntryStore` use-case port.
Keep `EntryRecord` as the v1 projection. Coordinate the write DTO ownership rules
from the contract review before mapping entry PUT.

Match `frontend/src/lib/finance.ts` recurrence rules with shared synthetic fixtures:
weekly/biweekly intervals; custom positive interval; monthly/quarterly/annual
expansion from the original anchor with end-of-month clamping; the frontend's two
anchored semimonthly days. Add a workspace timezone for the server's definition of
today. Bound inputs/expansion explicitly, not by silently dropping old obligations.
The server must validate that skip/complete dates belong to the rule even though the
frontend also expands forecasts.

Acceptance: path/body ID mismatch -> 400; missing or other-workspace account -> 404;
invalid recurrence/name/money -> 400; one primary income paycheck per workspace;
idempotent repeated PUT; archived entries excluded; unchanged other workspaces;
month ends/leap years/DST fixtures; safe snapshot returned from the same transaction.
Do not enable completed-entry editing until correction semantics in task 2 exist.

### 2. Occurrence completion, skip and corrections

Add immutable `BalanceEffect` records with `(workspace, effectId)` keys and a unique
completion origin `(workspace, entryId, occurrenceDate)`. In one transaction, validate
the plan and transition, insert occurrence/effect, update the account projection,
project the snapshot and commit. Replayed completion must return the snapshot without
another effect. Concurrent uniqueness failures must be translated into a replay or
409 after a fresh read; do not return an unrelated 500.

Use this target transition policy in the coordinated contract update:

| Current occurrence | Command | Result |
| --- | --- | --- |
| Unresolved | Complete | Persist completion and exactly one effect |
| Completed | Complete | Successful replay; no new effect |
| Unresolved | Skip | Persist skipped state; no effect |
| Skipped | Skip | Successful replay |
| Skipped | Complete | 409; require an explicit future unskip action |
| Completed | Skip | 409; money cannot be undone by suppression |

Manual corrections create an explicit reversal plus replacement effect in one
transaction. For v1 entry PUT, only the completed anchor's prior effect is replaced;
other completed occurrences retain their original account, amount and date. Changes
to future recurrence do not rewrite completed history. Reject attempts to change
`completed`, `completedAt` or occurrence state through PUT once persisted; those
transitions belong to commands. Creating a manual already-completed entry must
create its initial occurrence/effect atomically. Provider-backed entries allow only
name/category/notes/forecast-inclusion annotations, with all financial facts and
provenance unchanged. Record this narrower write behavior in the contract and adapt
the form before enabling it. A transfer/card payment has paired account effects and
must not be counted as both spending and income.

Acceptance: concurrent/repeated complete debits once; anchor versus later occurrence;
invalid dates; skip/complete conflict; edits across accounts; deletion after settlement;
rollback on any failed write/projection; provider balances never directly mutated;
cross-workspace denial on every path.

### 3. Allocation reservation command

First migrate the unsafe additive PUT contract as described in `contracts/REVIEW.md`.
Add `AllocationReservation` and lines, persisted command ID/request hash/replay result,
and a pure `SafeToAllocatePolicy`. Keep presentation targets separate. The current
frontend calculation subtracts all unsettled overdue and upcoming expenses through
the next primary paycheck (fallback 14 days), reserve and sinking fund from effective
liquid money; expected income is not allocatable and dailyPlan is not subtracted by
that calculation. Port its golden fixtures before changing this policy.

Inside the transaction, calculate the current safe amount, validate total and
liquid-account eligibility, insert reservation lines, zero returned draft amounts,
and return the snapshot. Store enough lineage to release/consume a reservation
later without changing observed bank money. The current Reservations table is only
the active read projection and lacks command history by design.

Acceptance: simultaneous requests cannot over-reserve; lost-response retry replays;
same key/different body -> 409; negative/fractional/overflow rejected; stable account
ordering; no destination balance increase; no bank transfers; reservation totals
survive process restart and sync; no double subtraction in the frontend.

### 4. Plaid connections and ingestion

Add a BankConnections module before enabling `POST /accounts`. Domain/Application
ports should expose `CreateLinkSession`, `ExchangePublicToken`, `FetchTransactionPage`
and `FetchAccountObservations` operations using normalized internal types. Put the
provider adapter in Infrastructure. Do not freeze speculative SDK-shaped interfaces
today or pass provider JSON through public DTOs.

Persist a connection per Item with workspace, local connection ID, provider identity,
secret-store reference, committed sync cursor and connection state. Use separate
provider-account mappings, observations, imported transactions, match records,
webhook inbox and durable sync jobs. Unique provider identities must include
provider/connection scope. Tokens must never be stored in these read projection
tables or emitted in logs. Relinking must reconcile mappings using an explicit
reviewable policy; never identify an account by mask alone.

Workers claim an Item job with a lease. Fetch all pages outside the database
transaction, staging a complete update if too large for memory. Restart the batch
from its original cursor if pagination changes. In one short transaction, apply
added/modified/removed changes, pending-to-posted matching, observation reconciliation,
read projections, new cursor and job status. A crash must leave either the old
complete state or the new complete state. Deduplicate webhook deliveries and queue
work durably; verify the webhook signature before accepting it. Queue acceptance
does not mean balances were refreshed successfully.

Acceptance: duplicate webhook/page, crash before/after cursor commit, pending removal
and posted addition on different pages, modified/removed history, partial Item failure,
relink, unsupported currency/account/missing data, expired connection, lease recovery,
safe errors, and no duplicate adjustment after importing a manual settlement.
Use a fake provider at the adapter boundary and then Plaid sandbox scenarios.

The provider behavior behind these decisions is documented in the official
[sync integration guide](https://plaid.com/docs/transactions/add-to-app/),
[transaction lifecycle](https://plaid.com/docs/transactions/transactions-data/), and
[account reference](https://plaid.com/docs/api/accounts/).

## Definition of done for every added slice

Update the contract and both-consumer impact analysis when wire semantics change.
Write domain behavior first, a migrated SQLite integration test next, then map the
endpoint through the authenticated group. Cover wrong-workspace IDs, retry behavior,
failure rollback, exact money/date serialization and a real HTTP success response.
Run contract tests, locked restore, build and backend tests; include frontend fixture
checks when calculations change. Document implemented/deferred status in README.
Keep contract work in a separate commit where practical. Never expose a route that
only pretends to persist or synchronize data.
