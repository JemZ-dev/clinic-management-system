# Deploy React and Express together on Vercel

The repository root is the Vercel project. React is built into `dist`, and
`api/index.js` runs the existing Express API as a Node.js function. MongoDB stays
in Atlas. Local development still uses `npm run dev`; the backend alone still
uses `npm run dev:server` or `npm run start:server`.

## Vercel setup

1. Import the web GitHub repository in Vercel. Set Root Directory to the repository
   root (leave it empty), Framework Preset to Vite, and Node.js to 22.x.
2. The checked-in `vercel.json` supplies installation of both package folders,
   `npm run build`, output directory `dist`, API routing, and React page fallback.
3. Add these variables to Vercel's **Production** environment settings:

   | Name | Value |
   | --- | --- |
   | `MONGODB_URI` | Your private, completed Atlas connection string |
   | `MONGODB_DB_NAME` | `clinic_management`, or your existing database name |
   | `JWT_SECRET` | Your private random secret of at least 32 characters |
   | `APP_ORIGIN` | Your exact HTTPS website origin, e.g. `https://your-clinic.vercel.app` |
   | `NODE_ENV` | `production` |

   `APP_ORIGIN` must have no trailing slash or path. It is the frontend website
   address, not an `/api` URL. Do not prefix secrets with `VITE_`: that exposes
   values to the browser. Do not commit or upload the real `.env` files.
4. Deploy. If the domain was not known beforehand, update `APP_ORIGIN` with the
   assigned production domain and redeploy. Domain changes need this update too.
5. Confirm Atlas Network Access allows the deployment's outbound connections.
   Your computer's IP allow-list entry does not cover Vercel's servers. Use your
   Atlas/Vercel network configuration appropriate to the deployment; never put
   database credentials in frontend code.
6. Open `https://your-clinic.vercel.app/api/health`: it should return
   `{"status":"ok","database":"connected"}`. Sign in, refresh a nested page
   such as `/patients`, and test uploading/downloading a report up to 3 MB.

Production credentials should only be assigned to Production. Preview deployments
need separate test credentials/database and an `APP_ORIGIN` matching their own
domain to support sign-in. The API intentionally does not trust arbitrary preview
origins. The app needs its existing invitation/admin setup for new accounts;
deployment does not create or reset users.

## Uploads and existing reports

New PDF, PNG, and JPEG reports have a 3 MiB (3,145,728 byte) limit in the backend,
React, and Flutter. Base64 encoding expands that to 4 MiB; metadata still fits
under Vercel's 4.5 MB function request limit. Express allows at most 4,400 KiB
for the upload JSON. Reports remain stored in MongoDB; there is no local file
storage dependency.

Existing report files are retained. A legacy report over the hosted response
limit must be downloaded using the local backend; Vercel cannot return that large
a response. New reports fit both the request and download limits.

## Flutter

Flutter web served by the local proxy keeps using the local backend. A native
Flutter build can select the hosted backend with:

```powershell
flutter run --dart-define=API_BASE_URL=https://your-clinic.vercel.app/api
```

Flutter web must be served on the same website origin or use a local reverse
proxy; its browser requests cannot directly cross origins to this cookie-based
API. Hosting the Flutter website is separate from this React deployment.

## Local commands remain unchanged

```powershell
npm run dev
npm run dev:server
npm run dev:client
```

Keep your local settings in `server/.env`, including the local `APP_ORIGIN`.
Vercel uses its environment settings and does not receive that file.

References:
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/functions/limitations
