# Handoff — where this stands

Written 2026-07-16, at the end of the migration session. Read this first when
resuming.

## State in one line

The Azure-native rebuild is **code-complete and building, but has never been
run**. Nothing is committed.

## What exists

| | |
|---|---|
| `azure/api` | Azure Functions — **50 HTTP routes**, 1 queue worker. `tsc` clean. |
| `azure/web` | React frontend ported from `src/`. Builds. **3 type errors**, all pre-existing `html2pdf` typings (original repo had 57). |
| `azure/db/migrations` | **7 migrations**, apply in filename order. |
| `azure/TEST.md` | Local end-to-end test procedure. **Start here.** |
| `azure/README.md` | Status, ground rules, what is not ported. |

Supabase is fully severed: no `@supabase` dependency, no imports, no Supabase
URL in the built bundle.

## Immediate next step

Run `azure/TEST.md` end to end. It has never been executed — expect setup
friction, especially around the two Entra app registrations.

**Do not commit until it runs.** That was the explicit plan.

## After it works

1. Commit `azure/` (nothing is staged)
2. Azure cloud deployment — `azure/infra/` is **empty**; no Bicep has been written
3. Decide the open question in `api/src/shared/pipeline/duplicateCheck.ts`:
   `SUPERSEDE_APPROVED` is `false`. "Newest upload wins" is implemented for
   in-review copies; whether it should also supersede an **already-approved**
   (possibly paid) invoice was never answered.

## Things that will bite you

- **`vite build` does not typecheck.** Always `npx tsc --noEmit -p tsconfig.app.json`.
  Reporting a green build as "it compiles" is wrong and cost time in this session.
- **A first upload from any vendor lands in Low Confidence**, not High. The vendor
  is created `pending_verification`. Correct behaviour, looks like a bug.
- **The settings and ERP pages had bulk scripted edits** at the end of the session
  and much less scrutiny than the invoice flow. Suspect them first.
- **Several features are deliberately not ported** and say so explicitly when used
  — see the table in `README.md` before debugging one.

## How the old and new relate

`src/` and `supabase/` are the **legacy Supabase app**, still deployed and still
the reference for behaviour. `azure/` is the replacement. The port was explicitly
required to be **faithful, not improved** — identical UI and behaviour so it can
be tested against the old system. Two "improvements" were made and reverted for
that reason (a status rename, and where a resolved exception lands).
