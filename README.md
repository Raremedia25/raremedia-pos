# RAREMEDIA POS — Foundation v0.1

A new multi-business POS foundation for Web, Windows Desktop and Android.

## What is included

- Raremedia platform administrator role.
- Multi-organization data model.
- Business creation through a protected Supabase Edge Function.
- Owner invitation by email.
- Per-business logo upload and public logo URL.
- Organization-scoped products, categories, suppliers, recipes, tables, stock movements, customers, sales, payments and expenses.
- PostgreSQL Row Level Security policies.
- `bootstrap_organization(...)` and idempotent `seed_demo_data(org_id)`.
- Optional demo catalogue during business creation.
- No demo sales, payments or expenses.
- React + TypeScript + Vite frontend.
- Electron Windows shell.
- Capacitor Android configuration.

This is the secure foundation and first working application slice. It includes basic POS checkout and browser receipt printing, product and stock management, single-item purchase receiving, expenses, tables, and a basic transaction summary. Full accounting reports, multi-item purchasing, offline queue/sync, and complete role-permission screens are not implemented in this version.

## 1. Requirements

- Node.js 20.19+ or 22.12+
- npm
- A Supabase project
- For Android: Android Studio and Android SDK
- For Windows packaging: Windows build environment

## 2. Install

```bash
npm install
```

Copy `.env.example` to `.env` and set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Never place the Supabase `service_role` key in `.env` or frontend code.

## 3. Set up Supabase

1. Open your Supabase project and open SQL Editor.
2. Run the SQL files in `supabase/migrations` in numeric order: `0001` through `0006`.
   Migration `0003` backfills profiles for existing Auth users and secures inventory and transaction writes behind atomic database functions. Migration `0004` adds the full-access developer role. Migration `0005` reserves direct membership edits for platform administrators; business team changes go through the checked `manage-team` Edge Function. Migration `0006` lets platform administrators suspend businesses and blocks business-member data access while suspended.
3. Deploy the Edge Function:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-business
npx supabase functions deploy manage-team
```

The Supabase CLI will deploy the function with JWT verification disabled because the function validates the bearer token itself. Do not remove its `auth.getUser()` and platform-role checks.

The Edge Functions use the Supabase-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not expose the service role key to the browser. `manage-team` lets active business owners and admins invite workers, edit permitted roles, and enable or disable access. Only owners can grant the admin role; business-owner access cannot be changed from the team screen. New workers receive an invitation email and the owner sets their temporary password; existing accounts are linked without changing their credentials.

For owner invitation emails to reach customers, configure a production SMTP provider in Supabase Dashboard → Authentication → SMTP Settings, and set Authentication → URL Configuration → Site URL to the deployed POS URL. New owner accounts receive an invitation email automatically; the password is never included in the email. Existing owner accounts are linked without changing their password or sending a duplicate invite.

## 4. Create the first Raremedia Super Admin

1. In Supabase Dashboard → Authentication → Users, create your own user.
2. Copy that user's UUID.
3. Run this SQL once, replacing the UUID:

```sql
update public.profiles
set platform_role = 'platform_admin'
where id = 'YOUR_AUTH_USER_UUID';
```

4. Sign in to RAREMEDIA POS with that user.
5. The Business Management page should load. Use **Create business** to create customer businesses.

After promoting an existing user, verify the SQL editor reports one updated row. If it reports zero rows, run migrations `0001` and `0003` and retry; `0003` backfills missing profile rows.

When creating a business, set and confirm an owner login password. New owner accounts receive a Supabase invitation email and can sign in with that email and password after accepting the invite; share the password securely, not by email. If the owner email already belongs to an account, that account is linked and its existing password is not changed.

### Grant a trusted developer platform access

Create the developer's Auth account first, then run this as a trusted administrator, replacing the email:

```sql
update public.profiles p
set platform_role = 'developer'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('developer@example.com');
```

Verify one row was updated. Developers can see and manage every business and have the same platform-wide data access as a platform admin. Only grant this role to trusted Raremedia developers; do not grant it to customers.

## 5. Run the web app

```bash
npm run dev
```

Open `http://localhost:5173`.

## 6. Windows desktop

Development:

```bash
npm run electron:dev
```

Desktop shell after building:

```bash
npm run electron
```

For a distributable Windows installer, add and configure `electron-builder` or Electron Forge in a Windows build environment. Code signing is recommended before public distribution.

## 7. Android

Initialize Android project once:

```bash
npx cap add android
npm run android:sync
npm run android:open
```

Use Android Studio to select an emulator or connected device and run the app. Configure signing before producing a production APK/AAB.

## 8. Demo data behavior

The SQL function is:

```sql
select public.seed_demo_data('YOUR_ORGANIZATION_UUID');
```

It inserts a starter catalogue, ingredients, two sample recipes, 19 tables, three suppliers and opening-stock movements. It intentionally inserts no sales, payments or expenses. It returns without inserting anything if the organization already has products.

During business creation, the **Load demo catalogue** checkbox calls `bootstrap_organization(..., true)`, which creates the organization, attaches its owner, and seeds that organization's catalogue.

## 9. Business isolation

Every business-owned table contains `organization_id`. RLS is enabled and policies use membership checks. The frontend also filters by the selected organization, but frontend filters are not the security boundary: PostgreSQL RLS is.

The `platform_admin` role is stored in `profiles` and must only be assigned by a trusted administrator. The Edge Function checks this role server-side before it creates a business.

## 10. Initial verification checklist

- [ ] Create two test Auth users: one platform admin and two business owners.
- [ ] Promote only the platform admin using the SQL above.
- [ ] Create Business A with demo catalogue.
- [ ] Create Business B without demo catalogue.
- [ ] Confirm A has demo products and B starts empty.
- [ ] Add a product to A and verify it does not appear in B.
- [ ] Sign in as Business B owner and verify A is not visible.
- [ ] Upload separate logos and confirm each organization has its own logo URL.
- [ ] Run the SQL seed function twice for A; second call should be a no-op.
- [ ] Confirm sales, payments and expenses are empty for both businesses.

## 11. Deploy the web app to Render

The root `render.yaml` defines a Render static site that builds from the `main` branch and automatically redeploys after each push.

1. In the [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint** and connect `Raremedia25/raremedia-pos`.
2. Set `VITE_SUPABASE_URL` to your Supabase project URL and `VITE_SUPABASE_ANON_KEY` to its publishable key when prompted.
3. Create the Blueprint. Render will build the site and provide its public `onrender.com` URL.

The site uses a client-side route rewrite to `index.html`. Do not set a service-role or `sb_secret_` key in Render's frontend environment variables. Apply all Supabase database migrations and deploy the Edge Function separately as described above. A successful website deploy alone does not deploy database migrations or Edge Functions. Verify the `create-business` function is deployed; a missing function returns HTTP 404 and the POS cannot create businesses.

## Important production hardening before public launch

This is a foundation release, not yet a finished production POS. Before onboarding paying businesses, add automated authorization tests, stricter role-specific policies per table/action, audit logging for privileged actions, transactional checkout/stock functions, signed/private document storage where appropriate, backup/restore procedures, offline conflict handling, printer testing and monitoring. Configure rate limits and email templates in Supabase Auth.
