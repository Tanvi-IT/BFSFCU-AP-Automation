# Archived — not part of the build

These files came from the multi-tenant SaaS product this application was forked
from. They are **excluded from compilation** (see `tsconfig.app.json`) and are
kept only so the code is recoverable without digging through git history.

## Why they were archived

The product is a **single-tenant internal tool** for one organisation, with
staff signing in through Entra ID. That removes the reason for all of these:

| File | What it was | Why it does not apply |
|---|---|---|
| `Pricing.tsx` | Public pricing tiers → Stripe checkout | Nobody subscribes; there is no one to charge |
| `Contact.tsx` | Marketing contact page, **branded "Hyperwise LLC"** | Not our company — fork residue |
| `BillingSettings.tsx` | Customer-facing subscription management | No subscription |
| `SuperadminBilling.tsx` | Per-tenant Stripe billing control panel | No tenants, no billing |
| `TenantManagement.tsx` | Create/delete customer organisations | Exactly one organisation |
| `Onboarding.tsx` | New-tenant signup wizard (pick a plan) | No tenant signup |
| `OnboardingSuccess.tsx` / `OnboardingCanceled.tsx` | Stripe checkout return pages | No checkout |
| `AuthVerify.tsx` | Supabase email-verification landing page | Entra owns identity — cannot work by design |
| `useBilling.ts` | Stripe hooks (`create-checkout`, `billing-portal`) | No Stripe |
| `useOnboarding.ts` | Onboarding state | No onboarding |

Their routes were removed from `App.tsx` at the same time.

## If the product ever becomes multi-tenant SaaS

This is the starting point for billing and tenant provisioning — but it was
written against Supabase and would need the same port as everything else.

**Do not import from this directory.** Restore a file by moving it back into
`src/` and migrating it properly.
