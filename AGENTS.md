# Agent instructions

Read **[CONTEXT.md](CONTEXT.md)** before making any change. It carries the
conventions, the traps that have already cost debugging time, and the things
that fail silently in this codebase.

Then, depending on the task:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the system fits together
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — running it locally
- [docs/PRODUCTION.md](docs/PRODUCTION.md) — deploying and hardening

The five rules most likely to be broken by someone who skipped CONTEXT.md:

1. Everything goes through `api/src/shared`. Routes are thin.
2. Users are keyed on `entra_oid`, never email.
3. One `app.http()` registration per route, with **per-method** roles.
4. Never render a role name raw — use `roleLabel()`.
5. A submitter cannot approve their own invoice. That is a financial control.
