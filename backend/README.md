# Budget Command Center backend foundation

ASP.NET Core / EF Core / SQLite on .NET 10 LTS. This is an intentionally partial
backend with a complete settings feature and persisted dashboard reads.

| Operation | Status |
| --- | --- |
| `GET /api/v1/finance/snapshot` | Implemented; consistent local database snapshot |
| `GET /api/v1/accounts` | Implemented; normalized account projection |
| `GET /api/v1/transactions` | Implemented; source-entry projection, not expanded occurrences |
| `PUT /api/v1/settings` | Implemented; validated replacement and snapshot in one transaction |
| Account synchronization, entry writes/completion/skips, allocation writes | Unmapped; return ordinary 404/405, never simulated success |
| Plaid, login/issuer, frontend HTTP adapter | Deferred |

Read [the contract review](../contracts/REVIEW.md) and
[architecture and implementation guide](ARCHITECTURE.md) before adding a feature.
The frontend remains unchanged and uses its existing in-memory service.

## Build and test

Install a stable .NET 10 SDK, then run from `backend/`:

```powershell
dotnet restore BudgetCC.slnx --locked-mode
dotnet build BudgetCC.slnx --no-restore
dotnet test BudgetCC.slnx --no-build
```

Package versions and transitive dependencies are locked. Generated build files go
to the OS temporary directory under `budgetcc-build/<checkout-name>` via
`Directory.Build.props`. Override `-p:ArtifactsPath=<absolute-path>` consistently
for parallel checkouts with identical directory names. No protected ignore files
are changed. Do not put databases or secrets in the repository.

From the repository root, validate the authoritative OpenAPI contract using an
external Python virtual environment (Python 3.11+):

```powershell
python -m venv "$env:TEMP/budgetcc-contract-tests"
& "$env:TEMP/budgetcc-contract-tests/Scripts/python.exe" -m pip install -r tests/contracts/requirements.txt
$env:PYTHONDONTWRITEBYTECODE = '1'
& "$env:TEMP/budgetcc-contract-tests/Scripts/python.exe" -m unittest discover -s tests/contracts -v
```

Backend tests use real file-backed SQLite databases with the committed migrations,
in-process HTTP hosting, and freshly generated signing keys for JWT validation.
They do not call a bank, use real identities or require stored credentials.

## Database and authentication setup

Configure these through the environment or the deployment secret/configuration
provider. Do not commit their values:

| Configuration key / environment variable | Meaning |
| --- | --- |
| `ConnectionStrings:Finance` / `ConnectionStrings__Finance` | SQLite connection string with an absolute path outside the checkout; enable foreign keys and use local disk |
| `Authentication:Authority` / `Authentication__Authority` | HTTPS OIDC issuer that publishes signing keys |
| `Authentication:Audience` / `Authentication__Audience` | This API's intended audience |

The trusted issuer must issue a subject (`sub`) and exactly one `workspace_id`
claim. A token alone does not grant workspace access: the subject must also have a
current database membership. There is no development authentication bypass, token
minting endpoint, default user or implicit workspace creation. Missing authority or
audience fails host startup; missing database configuration fails database access.

Apply migrations as an explicit deployment step, with the database connection
configured, before starting the HTTP host:

```powershell
dotnet run --project src/BudgetCC.Api --no-build -- --migrate
```

Provision the first workspace/membership using the trusted operator command.
Set `Provisioning__WorkspaceId` to an opaque local workspace ID and
`Provisioning__Subject` to the issuer's subject, then run:

```powershell
dotnet run --project src/BudgetCC.Api --no-build -- --provision
```

Provisioning is idempotent, creates zero-valued settings, and never overwrites
existing settings. It is an offline operator capability using database access,
not an HTTP signup route. Clear provisioning environment values afterward. Grant
runtime/operator process access appropriately. A new workspace has genuinely empty
accounts/entries/allocations; only test fixtures contain example financial data.

Start the API after configuring authentication:

```powershell
dotnet run --project src/BudgetCC.Api --no-build
```

Use HTTPS hosting or terminate TLS at a trusted same-origin reverse proxy. There is
no permissive CORS policy. Financial responses have `Cache-Control: no-store`.
JWT validation checks signature, issuer, audience, expiration and membership;
401 responses include a Bearer challenge. Errors use the existing contract's
`message`/`code` shape, without exception details or provider data.

## Adding migrations

Install `dotnet-ef` version `10.0.11` outside the checkout and invoke it from
`backend/`:

```powershell
dotnet ef migrations add DescriptiveName --project src/BudgetCC.Infrastructure --output-dir Migrations
```

The design-time factory uses an in-memory database solely for model discovery.
`--migrate` uses the configured deployment database. Do not use `EnsureCreated`,
automatic migrations on every web startup, or hand-edit the model snapshot.
Inspect migration SQL, test a fresh database and test upgrades with retained data.

This foundation is not ready for public deployment of financial mutations. The
remaining contract decisions and acceptance criteria are explicit in the guide.
