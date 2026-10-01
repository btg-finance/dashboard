# BTG Finance Dashboard

A read-only finance dashboard for BTG Studios. Six pages: Executive Summary,
Forecast, Business Insights, P&L, Historical Performance and Projects, with a
chat that answers questions from the same numbers.

Every figure comes from two Google Sheets. The app never writes to them.

| Workbook | Tabs read | Variable |
|---|---|---|
| Master | Projects, Overheads, Targets, Access | `GOOGLE_SHEET_ID` |
| Pipeline | Pipeline, Probability | `GOOGLE_PIPELINE_SHEET_ID` |

## Run locally

1. Copy `.env.example` to `.env.local` and fill it in.
2. Share both workbooks with the service account's email, as Viewer.
3. Install and start:

```
npm install
npm run dev
```

The app runs at http://localhost:4002. The port is set in `package.json`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the app for local work |
| `npm run typecheck` | Check types |
| `npm run lint` | Check code style |
| `npm run build` | Build for production |

## Deploy

The app is a standard Next.js project and deploys to Vercel as is. Set the
variables from `.env.example` in the Vercel project's settings. `APP_URL` is
required in production and must be the address people open, for example
`https://finance.btg.studio`.

## Signing in and access

People sign in with Google, and only approved people are let in.

Access is managed in the **Access** tab of the master workbook, one row per
person. A change there takes effect within a minute, with nothing to deploy.
Keep edit rights on the master workbook to the people who may decide this.

| Column | What to enter |
|---|---|
| Email | The person's Google account address |
| Role | Full, Viewer or Limited. Blank counts as Viewer. |
| Expires On | Optional. The last day of access. Blank means no end date. |
| Executive Summary, Forecast, Business Insights, P&L, Historical Performance, Projects, Chat | Tick boxes, used only for a Limited person |
| Name, Organisation, Added On | For your records. The dashboard does not use them. |

| Role | Pages | Chat | Export (CSV, PDF, print) |
|---|---|---|---|
| Full | All | Yes | Yes |
| Viewer | All | Yes | No |
| Limited | Only the ticked pages | Only if ticked | No |

To remove someone, delete their row or set Expires On to a past date. An
expiry date that cannot be read ends the access, rather than leaving it open.

`ALLOWED_EMAILS` names the administrators. They have full access whatever
the Access tab says, so a mistake in the sheet cannot lock everyone out.
`ALLOWED_DOMAINS` gives full access to everyone on a domain and is best left
empty.

**What the roles do not do.** Roles decide which pages, buttons and chat a
person is shown. They do not change the data sent to a signed-in person's
browser, which is the same for every role. Nothing stops a person taking a
screenshot either. Treat Limited as keeping pages out of view, not as a
guarantee that a determined, technical person cannot reach the figures.

The Google OAuth client needs one redirect address per site address:
`<site address>/api/auth/callback`.

## What the sheets must contain

Column names are matched without regard to case, spaces or punctuation.
If a required column is missing, the dashboard says so at the top of every
page, because figures that depend on it would be wrong.

| Tab | Required columns | Optional columns |
|---|---|---|
| Projects | Month, Project, Client, Revenue, DirectCost | Industry, ServiceType, Retainer, DomesticExport |
| Overheads | Month, SalariesAndFees, OperatingExpenses | |
| Targets | FY, RevenueTarget, GrossProfitTarget | EBITDATarget, TargetGPPct |
| Pipeline | Project Name, Stage, Project Start Month, Revenue (Rs L), Cost (Rs L) | Client Name, Owner, Service Line |
| Probability | Stage, Probability | |
| Access | Email | Role, Expires On, one tick-box column per page, Chat |

- Months may be a date, `2026-10`, `10/2026` or `Oct-2026`.
- Targets has one row per year (`FY27`) and, optionally, four quarter rows
  (`FY27-Q1` to `FY27-Q4`). Quarter rows count only when all four are given.
- The Pipeline tab may have banner rows above its header row.

## How the numbers work

- The financial year runs April to March and is named by the year it ends in.
- Master amounts are in whole rupees; pipeline amounts are in rupees lakh.
- An opportunity's revenue lands in full in its start month.
- Weighted value is gross value times the stage's probability, which comes
  from the Probability tab. A stage at 0%, such as Lost, is left out.
- Committed pipeline is probability 75% and above; the rest is weighted
  pipeline. Gap to target is target less reported, committed and weighted.
- An opportunity whose start month is already reported is not counted, since
  it is either in Projects by now or has slipped. The Forecast page lists
  these so the pipeline sheet can be corrected.
- Without quarter rows, the annual target is split by last year's seasonal
  shape.

## The chat

The browser sends the question and what the page is showing. The server reads
the figures from the sheets and sends them to the model, so the assistant
never works from numbers a browser supplied. Each person may ask a limited
number of questions per hour (`CHAT_HOURLY_LIMIT`). That limit is kept per
running instance, so it guards against runaway use; the firm ceiling on spend
is the monthly limit set in the Anthropic console.

## Where things are

| Path | What it holds |
|---|---|
| `lib/sheets.ts` | Reading the workbooks |
| `lib/sheet-import.ts` | Mapping sheet columns to records |
| `lib/model.ts` | All calculations |
| `lib/access.ts` | Roles: who may see what |
| `lib/auth.ts`, `lib/google-auth.ts` | Sessions, access, Google sign-in |
| `lib/chat-context.ts`, `lib/chat-prompt.ts` | What the chat is told, and how it is asked to answer |
| `lib/env.ts` | Configuration, checked at start |
| `app/(dashboard)/` | The six pages |
| `app/api/` | The server routes |
| `components/sc-chart.tsx` | The chart engine |
