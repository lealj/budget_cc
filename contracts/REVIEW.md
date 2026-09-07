# API review

Reviewed against `frontend/src/models.ts`, `services/financeService.ts`, and
`lib/finance.ts` from both consumer and domain perspectives. Version 1.0.1 fixes
the misplaced `servers` object and double-escaped date pattern, adds date-format
validation, and clarifies the previously unspecified authentication boundary.
No paths, payload fields, required lists, enums, or successful status codes change.
Existing frontend calendar dates now validate. HTTP integration must obtain a
workspace-scoped token from the configured issuer; the frontend still uses its mock.

## Decisions and remaining contract work

| Priority / boundary | Consumer impact | Backend decision / next contract change |
| --- | --- | --- |
| Critical: `Account.balance` mixes bank money and local reservations | The forecast already treats this as spendable balance; changing its meaning silently would double-count reservations | Keep the v1 projection, but store bank observations, local balance effects, and reservation records separately. Never overwrite a provider balance to reserve money. Later expose observed, available, reserved and effective amounts explicitly. |
| Critical: one `FinancialEntry` represents imported history, editable plans and recurrence | The form sends server-owned `source`, settlement state and timestamps back; blanket read-only fields would break edits | Use distinct internal planned-entry, occurrence and imported-transaction concepts. A future write DTO must distinguish editable annotations from provider-owned facts. Do not allow a client to invent `synced` provenance or edit imported money/account/date. Coordinate this restriction with the form before implementing writes. |
| Critical: settlement/edit/delete balance effects | Retrying completion must not debit twice; deletion currently preserves settled money | Unique occurrence identity `(workspace, entry, date)` plus retained effects, not a mutable balance alone. A completed occurrence and a skipped occurrence need different durable states even though v1 projects both later dates into `skippedDates`. Editing a rule must not rewrite historical occurrences. Define corrections and reconciliation before enabling settlement. |
| High: `POST /accounts` means sync rather than create | Current UI expects an array and may wrongly infer a successful bank refresh | Preserve legacy route until a coordinated change. Prefer `POST /connections/{id}/sync-jobs` -> `202` with Location, then job GET. Item-level work covers multiple accounts. Define partial failure, retry/backoff, rate limiting (`429`), and cached versus refreshed data. Never change last successful sync time merely because work was queued. |
| High: additive reservation through `PUT /allocations` | An automatic PUT retry could reserve twice | Keep the wire contract pending migration; do not implement unsafe retries. Prefer `POST /allocation-reservations` with a persisted idempotency key, request hash and replay response; same key/different payload -> `409`. Alternatively PUT a client-identified reservation resource. A plan is configuration; a reservation is an event. Color is presentation metadata, not ledger data. |
| High: Plaid account shape does not fit `lastFour`, type and required sync time | Missing masks, unsupported accounts or newly linked accounts cannot be rendered honestly | Before Plaid, coordinate nullable/optional mask and last successful sync time, unknown balance handling, currency and supported-account UX. Never fabricate `0000`, a balance of zero, payment details or timestamps. Credit liability fields are not guaranteed by Transactions. USD-only v1 must reject/quarantine unsupported currencies, not silently convert. |
| High: unbounded snapshot and transaction arrays | Straightforward initial UI integration, but imported history will grow without bound | Keep the snapshot as a transactionally consistent dashboard projection, not the aggregate root or raw provider history. Plan a versioned dashboard horizon, cursor-paginated history and revision/ETag; never silently truncate current v1 arrays. Read committed local data; do not call Plaid during a snapshot transaction. |
| High: no concurrency token | Two tabs can overwrite settings or rule edits | Current settings use documented last-committed-write-wins and an atomic write-plus-snapshot. Before financial writes, coordinate optional then required If-Match / revision and `412`; preserve per-occurrence and per-command idempotency independently. |
| Medium: `/transactions` names forecast rules as bank transactions | Recurring source rules are expanded by the UI, not posted transaction history | Preserve names for compatibility; future `/planned-entries` and `/bank-transactions` should be separate resources with explicit matching links. Transfers/card payments need paired account effects, not duplicate income/expense observations. |
| Medium: PUT upsert always returns `200` | Existing consumer expects a snapshot | A future revision should distinguish creation (`201` + Location) from replacement (`200`). Do not switch to `204`: UI requires the snapshot body. `complete`/`skip` POST commands are reasonable if idempotency is durable. |
| Medium: skip date is optional in the shared DTO, required in prose | Generated clients may send `{}` for skip | Introduce a distinct required-date skip DTO in a coordinated update. Also define recurrence membership, monthly clamping, semimonthly anchors, timezone, skipped-to-completed transitions and primary-paycheck income-only rules. Frontend expansion does not remove the need for server validation/forecast policy. |
| Medium: monetary and error constraints | JavaScript uses floating point; generated clients cannot infer every validation rule | Preserve dollar-number JSON; use exact decimal at the boundary and integer cents in SQLite, rejecting fractional cents/overflow rather than silently rounding. Keep `{message, code, details}` errors, safe machine codes, and no raw exception/provider bodies. Distinguish malformed input (`400`), inaccessible resources (`404`), authenticated non-members (`403`), and state conflicts (`409`). |
| Medium: `ambient` sits with operating limits | A display preference can accidentally overwrite money settings | Keep the existing Settings DTO; a future user-preferences resource can separate personal presentation from workspace financial policy. |

## Plaid boundary

Plaid synchronization returns added, modified and removed transactions. Pending
transactions may be removed and replaced by a posted transaction on another page.
Persist a whole completed update and its cursor atomically; restart from the original
cursor on a pagination mutation. Keep provider identity and cursors out of public
DTOs, retain removal tombstones, and use opaque local IDs. See the official
[transaction state documentation](https://plaid.com/docs/transactions/transactions-data/)
and [sync integration guide](https://plaid.com/docs/transactions/add-to-app/).

Account balances can be cached or unavailable; masks may be null or 2–4 alphanumeric
characters, and account identifiers can change after relinking. These are actual
provider constraints, not optional implementation polish. See the official
[Accounts reference](https://plaid.com/docs/api/accounts/).

Link-token creation, public-token exchange, connection removal/update-mode Link,
verified webhooks and a durable worker remain explicit future API work. Access
tokens belong in a secret store behind references; they must never enter snapshots,
logs or client storage. Webhook events schedule deduplicated Item-level work and
do not use the workspace JWT authentication path.

## Compatibility review and checks

Only schema defects and authentication documentation are corrected in this commit;
the table's proposed breaking changes are deliberately not applied. Backend and
frontend impacts are evaluated above; a separate human/frontend review is still
needed before changing those behaviors. Contract regression tests validate the
OpenAPI document, base URL, real calendar dates and representative existing DTOs.
