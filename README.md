# Epson Logistics Frontend

React + Vite frontend for the Epson Logistics Portal.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Make sure `.env` points to your local backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

4. Run the app:

```bash
npm run dev
```

## Vercel Deployment

This frontend is prepared to deploy as its own repository on Vercel.

Use these Vercel project settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

Set this environment variable in Vercel:

```env
VITE_API_BASE_URL=https://capstonea1-production.up.railway.app
```

The same value is also included in `.env.production`, so normal production builds already target the Railway backend.

## Backend Connection Notes

All API calls use `VITE_API_BASE_URL` from `src/config/api.js`. The deployed frontend talks to:

```text
https://capstonea1-production.up.railway.app/api/...
```

If browser requests are blocked after deployment, update the Railway backend CORS settings to allow the final Vercel domain, for example:

```text
https://your-frontend.vercel.app
```

## Single Page App Routing

`vercel.json` rewrites every route to `index.html`, so direct refreshes on routes such as `/admin-dashboard` or `/vendor-dashboard` work correctly on Vercel.
