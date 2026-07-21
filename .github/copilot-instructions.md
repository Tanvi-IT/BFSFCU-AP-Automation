# Copilot instructions

Read [CONTEXT.md](../CONTEXT.md) before making any change. It carries the
conventions, the traps that have already cost debugging time, and the things
that fail silently in this codebase.

Most-broken rules: everything goes through `api/src/shared`; users are keyed on
`entra_oid` not email; one `app.http()` per route with per-method roles; never
render a role name raw; a submitter cannot approve their own invoice.
