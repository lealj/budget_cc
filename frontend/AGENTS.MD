# AGENTS.md

## Architecture

Frontend:
- React
- TypeScript
- Vite
- D3
- Motion
- React Three Fiber

Backend:
- ASP.NET Core
- SQLite
- EF Core

## Frontend rules

- Do not use Material UI.
- Maintain the military command-center design system.
- Use HTML/CSS for normal UI.
- Use D3 only for custom data visualization.
- Use Three.js only for ambient/specialized graphics.
- Keep financial calculations outside presentation components.

## General Rules
- Never expose or add sensitive information of any kind (API Keys, PPI, etc.)
- Never force push or merge code into main.

## Protected files

Agents must never modify:
- AGENTS.md
- Any .gitignore
- .github/CODEOWNERS
- repository security/rules configuration
- agent credential/configuration files

## Commands

Frontend build:
npm run build

Frontend tests:
npm test

## Git workflow

For completed feature work:

1. Create a new branch from the current base branch.
2. Use a descriptive branch name, e.g. `feature/add-expense-form`.
3. Make the requested changes.
4. Run the relevant build/tests and fix failures caused by your changes.
5. Commit the completed work with a concise conventional commit message.
6. Push the branch to `origin`.
7. Create a GitHub pull request targeting `main` using `gh pr create`.
8. In the PR description, summarize:
   - what changed
   - important implementation decisions
   - tests/checks performed
9. Do not merge the PR yourself.