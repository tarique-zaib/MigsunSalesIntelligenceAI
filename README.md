# Migsun Sales Intelligence AI — Independent Prototype

**Independent prototype for demonstration only. Not an official Migsun Group product.**
All seeded people, leads, project names, values, and metrics are fictional. Do not use real customer data.

## Stack
- React + TypeScript + Vite
- ASP.NET Core Web API targeting .NET 10
- Entity Framework Core + PostgreSQL
- JWT bearer authentication
- Deterministic rule-based lead scoring and follow-up drafts

## Prerequisites (Windows)
- .NET 10 SDK
- Node.js 22+ and npm
- PostgreSQL 16+ (or a compatible local PostgreSQL installation)
- PowerShell

## 1. Create the database
Open pgAdmin or `psql` and run:

```sql
CREATE USER migsun_app WITH PASSWORD 'ChangeThis_LocalOnly_123!';
CREATE DATABASE migsun_sales OWNER migsun_app;
```

If the user already exists, alter its password instead:
```sql
ALTER USER migsun_app WITH PASSWORD 'ChangeThis_LocalOnly_123!';
```

## 2. Configure and run the API
Open PowerShell in the extracted project folder:

```powershell
cd backend
Copy-Item appsettings.Development.example.json appsettings.Development.json
```

Edit `appsettings.Development.json` and replace the local database password and JWT secret. The JWT secret must be at least 64 characters. Do not commit real secrets.

Then:

```powershell
dotnet restore
dotnet run --urls http://localhost:5080
```

On first startup, the app creates the demo schema and seeds fictional data. This uses `EnsureCreated` for a simple local prototype. Before production, switch to EF Core migrations and a managed secret store.

Demo login:
- Email: `admin@demo.local`
- Password: `DemoPass!2026`

Change this demo password and secret before exposing the application to any network.

Health check: `http://localhost:5080/health`

## 3. Configure and run the frontend
Open a second PowerShell window:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Features included
- Login with JWT
- Authenticated dashboard metrics
- Lead list and search
- Create a lead
- Deterministic lead score (0–100) and priority
- Lead status pipeline
- Lead detail selection and rule-based follow-up draft
- Analytics by pipeline stage and source
- Fictional demo data seeded automatically

## Lead scoring rules
The backend computes a transparent score:
- Budget supplied: +15
- Purchase timeline within 30 days: +25; within 90 days: +15; within 180 days: +8
- Contacted: +5; Qualified: +10; Site Visit: +15; Negotiation: +20
- Source referral/channel partner: +10; website: +5
- Score is capped at 100.
Priority: 70+ High, 40–69 Medium, below 40 Low. This is a demo heuristic, not a validated prediction.

## API endpoints
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/leads?search=...`
- `GET /api/leads/{id}`
- `POST /api/leads`
- `PUT /api/leads/{id}`
- `GET /api/leads/{id}/follow-up-draft`
- `GET /api/analytics`
- `GET /health`

All `/api/*` endpoints except login require a valid bearer token.

## Important security notes
- The seeded login is for local demonstration only.
- Replace the JWT secret and demo credentials before any shared deployment.
- Use HTTPS, rate limiting, a managed secret store, proper account lifecycle controls, and audit review for production.
- The prototype intentionally does not send email/SMS or make external AI calls.
- Do not store payment card data or sensitive identity documents in this demo.
