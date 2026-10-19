# SideQuest Taipei

Web app (PWA) for the New Business Development course at NTUST: city events, community threads and university teams for students in Taipei.

- `mockup/` – original clickable mockup
- `app/` – the app (static HTML/JS, deployed to GitHub Pages), backed by Supabase
- `scripts/` – database schema, demo accounts and sample data

## Setup

1. `cp .env.example .env` and fill in the Supabase keys
2. `npm install`
3. `npm run setup` – creates tables, demo accounts (`users.json` → `accounts.txt`), sample data and `app/config.js`
4. `npm run dev` – local preview at http://localhost:5173

`npm run users` only adds/updates accounts from `users.json`. Re-running `npm run setup` wipes and re-seeds all data with dates shifted to today.
