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

This is the secure foundation and first working application slice. POS checkout, receipt rendering/printing, purchasing workflows, accounting reports, offline queue/sync, and full role-permission screens are subsequent implementation modules; they are not represented as completed in this version.

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

1. Open your Supabase project.
2. Open SQL Editor.
3. Run `supabase/migrations/0001_raremedia_pos_foundation.sql`.
4. Deploy the Edge Function:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-business
```

The Supabase CLI will deploy the function with JWT verification disabled because the function validates the bearer token itself. Do not remove its `auth.getUser()` and platform-role checks.

The Edge Function uses the Supabase-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not expose the service role key to the browser.

## 4. Create the first Raremedia Super Admin

1. In Supabase Dashboard → Authentication → Users, create your own user.
2. Copy that user's UUID.
3. Run this SQL once, replacing the UUID:

```sql
update public.profiles
set platform_role = 'platform_admin'
where id = 'YOUR_AUTH_USER_UUID';
```

3. Sign in to RAREMEDIA POS with that user.
4. The Business Management page should load. Use **Create business** to create customer businesses.

Do not give platform-admin access to customers.

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

The site uses a client-side route rewrite to `index.html`. Do not set a service-role or `sb_secret_` key in Render's frontend environment variables. Apply the Supabase database migrations and deploy the Edge Function separately as described above.

## Important production hardening before public launch

This is a foundation release, not yet a finished production POS. Before onboarding paying businesses, add automated authorization tests, stricter role-specific policies per table/action, audit logging for privileged actions, transactional checkout/stock functions, signed/private document storage where appropriate, backup/restore procedures, offline conflict handling, printer testing and monitoring. Configure rate limits and email templates in Supabase Auth.
