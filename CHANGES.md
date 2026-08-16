# GFMSC — Changes in this update

This file documents everything added/changed on top of the original repo,
organized by the two source documents (Trae.docx / SMS.pdf — same content).
Kept here instead of scattered comments so it's easy to review in one place.

## 1. Automated recurring jobs
- `backend/src/jobs/monthlyFeeCron.js` — runs 00:05 on the 1st of every
  month, bulk-generates pending tuition Invoices for every student in every
  active school, based on each class's `FeeStructure`. Duplicate-safe.
  Manual trigger: `POST /api/invoices/generate-monthly` (superAdmin).

## 2. Security hardening
- `express-rate-limit` wired into `app.js` (global 600 req/15min, auth
  routes 20 req/15min).
- **JWT refresh-token rotation**: access tokens now expire in 15 minutes.
  A 30-day refresh token is issued as an `httpOnly` cookie
  (`POST /api/auth/login`), renewed via `POST /api/auth/refresh`, and
  cleared via `POST /api/auth/logout`. The frontend axios client
  (`frontend/src/api/client.js`) automatically calls `/auth/refresh` on a
  401 and retries the original request — this should be invisible to users.
  **Set `JWT_REFRESH_SECRET` in your `.env`** (falls back to a default if
  unset, same as `JWT_SECRET` — fine for dev, change for production).
- `.github/dependabot.yml` — weekly automated dependency PRs for both
  `backend/` and `frontend/`.

## 3. New modules (backend API + frontend admin pages)
| Module | Routes base | Admin page | Notes |
|---|---|---|---|
| Library | `/api/library` | `/admin/library` | Books, issue/return, automatic late fine |
| Transport | `/api/transport` | `/admin/transport` | Vehicles/routes, student assignment, monthly fee invoicing |
| Payroll | `/api/payroll` | `/admin/payroll` | Bulk monthly salary generation for Teacher+Staff (needs `basicSalary` set on each) |
| Online Admission | `/api/admissions` | `/admin/admissions` + public `/admission/apply/:schoolId` | Public form (no auth) → admin approve → auto-enrolls into `Student` |
| ID Cards | `/api/id-cards` | `/admin/id-cards` | Single card or full-class printable sheet, PDF with QR code (see note below) |
| Tabulation Sheet | `GET /api/pdf/tabulation?examId=` | (no dedicated page yet — call from an exam's detail view) | Class-wise, bilingual-ready |

All 5 modules now have a working admin UI page, reachable from the sidebar
(Library, Transport, Payroll, Admissions, ID Cards), wired into `App.jsx`
routing and `AdminSidebar.jsx` nav. The public admission form is at
`/admission/apply/:schoolId` — the exact link (with your real schoolId) is
shown on the Admissions admin page for you to copy/share.

## 4. Bangladeshi-specific groundwork
- `Teacher` and `Staff` models now have `mpoIndexNumber` and `basicSalary`
  fields (used by Payroll; MPO government-format export is not built —
  the exact govt. report layout wasn't specified).
- Tabulation Sheet PDF: true Bangla glyph rendering needs a Unicode Bengali
  font file. See `backend/assets/fonts/README.md`. Without it, the PDF
  still generates correctly with English-only labels (no broken glyphs).
- ID cards use a QR code (encoding the student ID) instead of a 1D
  barcode — scans reliably from any phone camera and needed no extra
  barcode-font dependency. Functionally equivalent for the "scan to look
  up a student" use case.

## 5. SaaS/multi-tenant groundwork
- `School` model: added `subdomain`, `customDomain`, `plan`,
  `subscriptionExpiresAt`. Editable via
  `PUT /api/schools/super-admin/:id` (superAdmin).
- `GET /api/schools/by-subdomain/:subdomain` — public, resolves a school's
  branding info from a subdomain string.
- `backend/src/middleware/tenantMiddleware.js` — **optional** helper that
  resolves `req.tenantSchool` from the request's hostname. **Not wired in
  globally** and does **not** replace the existing JWT-based `schoolId`
  scoping that every controller already uses for real data isolation —
  actual subdomain-per-school *hosting* (DNS, wildcard SSL, per-tenant
  routing at the infra level) is a deployment task outside what code
  changes alone can deliver.

## 6. Explicitly NOT done (needs real infrastructure/decisions, not just code)
- BullMQ/Redis background queue (needs a Redis instance you provision)
- Live SSLCommerz/bKash merchant credentials (needs your merchant account)
- MPO government report's exact official format/columns
- MongoDB sharding (not needed until several hundred schools)
- Frontend pages for Library/Transport/Payroll/Admission/ID-Card modules — now built (see section 3 above)
- RFID hardware integration (needs physical readers + their SDK) — QR code used instead, which needs no special hardware

## New/changed dependencies (run `npm install` in `backend/` before starting)
`node-cron`, `qrcode`, `cookie-parser`
