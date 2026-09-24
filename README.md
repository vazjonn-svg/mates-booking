# Mates Studios — Booking Manager

Internal booking tool. Client-side only — no backend, no database. Google Calendar
is the single source of truth; Google Drive stores uploaded stage plots.

## First-time setup

See the comment block at the top of `src/App.js` for the full Google Cloud
Console steps (enabling APIs, OAuth consent screen, Client ID). Short version:

```bash
cp .env.example .env      # then fill in REACT_APP_GOOGLE_CLIENT_ID
npm install
npm start                 # runs at http://localhost:3000
```

## Deploying to GitHub Pages

1. Update `"homepage"` in `package.json` to your real GitHub Pages URL.
2. Add that URL to **Authorized JavaScript origins** on the OAuth Client ID in
   Google Cloud Console.
3. `npm run deploy`

## After it's running

Open the app → **Settings** tab → fill in each room's real Google Calendar ID,
gate codes, and rates. Gear/pricing can be edited there too. See the in-app
Settings tab notes about syncing config between the two staff computers.
