# Cucina Food Safety Logbook

A free, self-hosted logbook system. Static front-end on **GitHub Pages** + a free
**Supabase** (Postgres) database. Seven logs, 15 sites, one row per entry, black/yellow theme.

## What's inside
| File | Purpose |
|---|---|
| `index.html` | App shell (login, tabs, views) |
| `app.js` | All logic — forms, tables, filters, CSV export |
| `styles.css` | Black / yellow theme |
| `config.js` | **You edit this** — your Supabase URL + anon key |
| `schema.sql` | Run once in Supabase to create the tables + 15 sites |

## The 7 logs
Sites register · Delivery · Fridge/Freezer (auto OK/CHECK) · Process–MEP ·
Process–Risky · Process–Freezer · Food Waste (auto totals).
The 3 process logs share one table (`process_logs`) via a `category` column but show as 3 tabs.

## Setup (~10 min, no cost)

### 1. Database — Supabase
1. Create a free account at supabase.com → **New project** (pick a region near AU, e.g. Sydney).
2. **SQL Editor → New query** → paste all of `schema.sql` → **Run**. This creates the tables,
   security rules, and seeds 15 placeholder sites.
3. **Project Settings → API** → copy the **Project URL** and the **anon public** key.

### 2. Connect the app
Edit `config.js` and paste both values:
```js
window.APP_CONFIG = {
  SUPABASE_URL:      "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGc..."
};
```
> The anon key is safe in a public repo — access is gated by login + Row Level Security, not by hiding the key.

### 3. Host — GitHub Pages
1. Create a repo, push these files to the `main` branch (root).
2. **Settings → Pages → Source: Deploy from branch → `main` / root** → Save.
3. Your app is live at `https://<user>.github.io/<repo>/`.

### 4. Turn on login
In Supabase → **Authentication → URL Configuration**: set **Site URL** to your Pages URL and
add it under **Redirect URLs**. Email magic-link login works on the free tier out of the box.
(To restrict who can sign in, use Authentication → Providers/Policies, or invite users manually.)

## Daily use
- Pick a tab, fill the form, **Save entry**. Multiple entries per day per site = just save again.
- **Records** table shows the latest 500, filterable by site + date range.
- **Export CSV** downloads the current filtered view.
- Rename the 15 sites in the **Sites** tab (or in Supabase) — every dropdown updates.

## Customising
Each log is defined in one place — the `LOGS` object at the top of `app.js`.
Add/rename a field there, add the matching column in `schema.sql`, and the form, table,
and CSV all pick it up. No build step, no framework.

## Notes / next steps
- Free tier limits are generous for this workload; if a project pauses from inactivity, reopen it in the dashboard.
- Possible v2: edit/delete rows in-app, role-based access (manager vs staff), charts, scheduled email reports.
