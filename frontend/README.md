# Budget Command Center — Financial operations

A local React + TypeScript + Vite dashboard for planning cash flow, allocations, and account balances.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. On Windows PowerShell systems that restrict unsigned scripts, use `npm.cmd` in place of `npm`.

```sh
npm run build       # Strict TypeScript check and production bundle
npm run preview     # Serve the production build locally
npm test            # Financial calculation and recurrence tests
npm run test:e2e    # Chrome browser interaction and responsive-layout tests
```

Browser tests use an installed Google Chrome. Set the Playwright `channel` in `playwright.config.ts` if using another browser. Test screenshots are written to `test-results/`.

## Workflows

- Add income or expenses from the visible quick commands. Both support static/dynamic classification, recurrence, account assignment, notes, and forecast inclusion. A recurring income can be designated the primary paycheck.
- Edit, settle, skip an occurrence, exclude, or delete events directly from upcoming obligations or the searchable ledger.
- Inspect Safe to Allocate's formula, change the reserve and sinking-fund assumptions, and switch between 30/60/90-day cash projections.
- Set allocation amounts, percentages, or sliders; add destinations; confirm a local cash reservation. Allocation validation runs in both the UI and mocked service.
- Inspect account balances and trigger simulated synchronization. No bank account connection or transfer occurs.

## Financial conventions

`Safe to Allocate = liquid cash − upcoming static expenses − expected dynamic expenses − sinking funds − minimum reserve`.

- Expenses due **on or before** payday are protected. Unpaid overdue entries remain reserved. Expected income is not deployable until received.
- A missing primary paycheck uses a visibly labeled 14-day planning window.
- The allocation window reserves the full configured sinking obligation. Projections schedule that contribution before payday, then repeat it every 30 days. The daily spending plan is a comparison benchmark; dynamic entries provide the forecast spending allowances.
- Month-based recurrence remains anchored to the original day and clamps at month end. Skipping an occurrence preserves the recurring rule.
- Completing an entry changes its associated demo account once. Seeded completed transactions are already reflected in initial balances.
- Confirmed allocations remove reserved funds from liquid availability in the mock. They do not send money or increase destination investment balances.

## Structure

| Location                                | Responsibility                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `src/tokens.css`, `src/styles.css`      | Design tokens, console layout, responsive rules                           |
| `src/components/ui.tsx`                 | Panels, buttons, status labels, metrics, accessible native-dialog drawers |
| `src/components/Dashboard.tsx`          | Primary dashboard composition                                             |
| `src/components/FinancialEntryForm.tsx` | Income and expense workflows                                              |
| `src/components/Ledger.tsx`             | Search, filters, event controls                                           |
| `src/components/AllocationControls.tsx` | Allocation plan, limits, custom destinations                              |
| `src/components/charts.tsx`             | Bespoke D3-generated SVG visualizations                                   |
| `src/components/Ambient.tsx`            | Lazy-loaded, noninteractive GPU atmosphere                                |
| `src/models.ts`                         | Typed frontend entities                                                   |
| `src/lib/finance.ts`                    | Pure calculation, recurrence, projection logic                            |
| `src/services/financeService.ts`        | Typed asynchronous mocked backend boundary                                |

## Deliberate frontend scope

Data is **in memory and resets on reload**. There is no database, backend, real Plaid integration, or browser persistence layer. Replace the mocked service methods with local ASP.NET Core endpoints when the backend is available; brief comments identify the intended request at each boundary. SQLite and EF Core belong to that future backend. Plaid credentials must never enter this frontend.

Fonts, icons, and assets are local. No runtime CDN calls are needed. The dev and preview servers bind to loopback. Drawers use native focus containment and Escape dismissal; normal UI remains HTML. Reduced-motion preferences disable the GPU atmosphere and decorative motion. The ambient grid pauses when the tab is hidden and has a non-WebGL fallback.
