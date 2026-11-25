# arunviswanathan91.github.io

Academic profile site, plus a personal dashboard, at <https://arunviswanathan91.github.io>.

| Folder | What it is |
|---|---|
| `index.html`, `repos.html`, `css/`, `js/`, `assets/` | The public profile site (static). Its text is edited in the dashboard under Website; `index.html` holds the fallback copy. |
| `dashboard-app/` | The private dashboard (React + Vite), published under `/dashboard/`. Sign-in required. Covers opportunities, tasks, papers, notes, meetings, deadlines, budget, loans and cards, habits and resumes. |
| `pipeline/` | Opportunity discovery worker (Node). Runs nightly from GitHub Actions and on demand from Cloud Run. |
| `supabase/` | Database scripts (`*.sql`, run in order, see its README) and Edge Functions (Telegram bot, reminders, calendar feed, Gmail, discovery trigger). |
| `.github/workflows/` | Checks on every pull request; deploys the site from `main`. |

## Working on the dashboard

```bash
cd dashboard-app
npm install
npm run dev      # local server (needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
npm run check    # tests + typecheck + build, same as CI
```

`package-lock.json` is committed and the deploy installs from it with `npm ci`, so a deploy uses the same library versions that were tested. After changing a dependency, run `npm install` and commit the updated lockfile.

Only `main` is published. Database scripts are applied by hand; see `supabase/README.md` for the order.
