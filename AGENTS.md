## General Rules
- Never expose or add sensitive information of any kind (API Keys, PPI, etc.)
- Never force push or merge code into main.
- Follow industry best practices; no bandaid fixes or similar.

## Protected files

Agents must never modify:
- AGENTS.md
- Any .gitignore
- .github/CODEOWNERS
- repository security/rules configuration
- agent credential/configuration files

## Git workflow

For completed feature work:

1. Create a new branch from the current base branch.
2. Use a descriptive branch name, e.g. `feature/add-expense-form`.
3. Make the requested changes.
4. Run the relevant build/tests and fix failures caused by your changes.
5. Commit the completed work with a concise conventional commit message.
6. Push the branch to `origin`.
7. Create a GitHub pull request targeting `dev` using `gh pr create`.
8. In the PR description, summarize:
   - what changed
   - important implementation decisions
   - tests/checks performed
9. Do not merge the PR yourself.

## API Contracts

`contracts/` is a shared boundary between frontend and backend.

Frontend and backend agents may propose contract changes when required.

Any modification to `contracts/` must:
- be explicitly called out in the PR description
- remain backward-compatible unless the task requires otherwise
- be reviewed for both frontend and backend impact
- update affected tests

Neither frontend nor backend should change the contract merely to simplify its own implementation.