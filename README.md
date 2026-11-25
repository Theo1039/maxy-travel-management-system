# Maxy Travel Management System

A trip-booking portal where travellers browse travel packages and manage their own bookings, while administrators manage packages and review bookings.

## Technology

- HTML5, CSS3, Bootstrap 5 and vanilla JavaScript
- Node.js and Express.js
- Supabase Auth, PostgreSQL and Supabase Storage

## Implemented scope

### Traveller
- Browse package cards with destination, image, price per person and duration.
- Search packages by destination.
- Register and sign in using Supabase Auth.
- Book a package with an automatically populated destination, travel date, passenger count and contact email.
- See the estimated total before submission. The server recalculates the authoritative total from the database.
- View the signed-in traveller's itinerary.
- Edit pending bookings, cancel pending bookings and permanently delete their own bookings.

### Admin
- Admin-only package creation, listing, editing and removal from the public catalogue.
- Upload package images (JPG, PNG or WebP, up to 5 MB) to Supabase Storage.
- View all bookings and update booking status.

### Production-minded foundations
- Server-side Supabase JWT verification and role authorization.
- Password handling delegated to Supabase Auth.
- Server-side input validation and price calculation.
- Helmet security headers, compression, request rate limiting and centralized error handling.
- Environment-based secrets; service-role key is never exposed to the browser.
- Database constraints, indexes, foreign keys and row-level security enabled.
- Package removal archives a package instead of deleting records referenced by historical bookings.

> The supplied original project text ends at “Edit and C…”. This implementation interprets that visible wording as Edit and Cancel. No other missing layer requirements were supplied, so the features above are the confirmed scope plus the minimum supporting implementation needed to run it safely.

## 1. Requirements

- Node.js 20 or newer
- A Supabase project
- npm

## 2. Install

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

## 3. Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run the complete contents of `sql/schema.sql`. This creates the tables, relationships, indexes, profile trigger, row-level security and a few editable sample travel packages.
4. In Supabase **Project Settings → API**, copy the Project URL and `anon` public key.
5. Copy the `service_role` key as well. Keep it secret; never put it in frontend JavaScript or commit it to Git.
6. Put the values in `.env`:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=package-images
MAX_UPLOAD_MB=5
```

7. Register a normal account from the website. Supabase may require email confirmation depending on your Auth settings.
8. To make your account an administrator, run the final `update public.profiles ...` statement in `sql/schema.sql`, replacing the example email with the email you registered. Do not expose an admin-registration option on the public website.

## 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

For a normal start:

```bash
npm start
```

Health check: `http://localhost:3000/api/health`.

## 5. First administrator

Register a normal account in the application and confirm the email if confirmation is enabled. Then run the commented promotion SQL at the bottom of `sql/schema.sql`, replacing the example email with the exact email address you registered. This is intentionally a manual, trusted-owner action; public visitors cannot choose the Admin role.

## 6. Important API routes

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| GET | `/api/packages?search=dubai` | Public | Browse/search active packages |
| GET | `/api/packages/:id` | Public | Read one active package |
| POST | `/api/packages` | Admin | Create package + image upload |
| PUT | `/api/packages/:id` | Admin | Update package and optional image |
| DELETE | `/api/packages/:id` | Admin | Archive package |
| GET | `/api/bookings` | Signed in | Own bookings; Admin sees all |
| POST | `/api/bookings` | Traveller/Admin | Create booking |
| PUT | `/api/bookings/:id` | Owner/Admin | Edit booking; Admin may update status |
| PATCH | `/api/bookings/:id/cancel` | Owner/Admin | Cancel booking |
| DELETE | `/api/bookings/:id` | Owner/Admin | Delete own booking (Admin may delete any) |
| GET | `/api/auth/me` | Signed in | Current profile and role |

Protected API requests require `Authorization: Bearer <Supabase access token>`.

## 7. Production deployment checklist

This repository can be deployed to a Node-compatible host (for example, Render, Railway or a VPS). Configure the following in the hosting provider's environment-variable settings; do not upload `.env`:

- `NODE_ENV=production`
- `PORT` (use the port supplied by the host)
- `APP_ORIGIN` (the final HTTPS site origin)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=package-images`
- `MAX_UPLOAD_MB=5`

Use `npm install` as the build/install command and `npm start` as the start command. Configure Supabase Auth's Site URL and allowed redirect URLs for the deployed HTTPS domain. Enable email confirmation and configure SMTP for real users. Use a strong, private service-role key; rotate it if exposed. Use a custom domain and HTTPS. Review logs, database backups, storage retention and rate limits before opening the site to customers.

## 8. Before real customer use

- Add automated integration tests against a non-production Supabase project.
- Verify all role and ownership cases with separate Traveller and Admin accounts.
- Configure transactional email for booking confirmations and status changes if required by the business.
- Decide cancellation/refund policy and payment integration separately. Payment processing is not included in the supplied project scope.
- Add privacy policy, terms, support contact and applicable data-protection notices.
- Consider stronger upload scanning and image transformation if uploads are open to frequent use.

## Project structure

```text
public/                 Frontend HTML, CSS and browser JavaScript
src/config/             Supabase server configuration
src/middleware/         Authentication, role checks and errors
src/routes/             Express API routes
src/utils/              Input validation helpers
sql/schema.sql          PostgreSQL schema, trigger, indexes and RLS
server.js               Express application entry point
```
