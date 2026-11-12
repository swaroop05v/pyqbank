# PYQ Bank: Previous-Year Question Bank with Repeat Detection

DBMS Experiential Learning, Level 3 project (Dept. of CSE, PES University)

| Name | SRN |
|------|-----|
| Swaroop Venkateshwar | PES1UG24CS923 |
| Shreesh S A | PES1UG24CS441 |

PYQ Bank stores every previous-year exam paper (ISA1, ISA2, ESA) of each course, with every question tagged by unit and topic. When a question is added, the database **detects whether it was asked before, even in different words**. Each question's text is turned into a vector embedding stored in PostgreSQL with **pgvector**, and a trigger compares it with every earlier paper of the course:

- very similar (≥ 0.80): grouped automatically as a repeat;
- somewhat similar (0.60–0.80): sent to a faculty review queue;
- otherwise: a new question.

Students then see the most repeated questions, unit weightage and topic frequency, and can search by keyword or by meaning.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router, React 19, Tailwind CSS 4) |
| Backend / API | Next.js route handlers (`src/app/api/**`) and server components, `pg` connection pool |
| SQL database | PostgreSQL 15+ (Neon, a local install, or the bundled offline server) |
| Vector database | pgvector in the same PostgreSQL database (`vector(384)`, HNSW index, cosine distance) |
| Embeddings | `all-MiniLM-L6-v2` (384-d), run locally with `@huggingface/transformers`, no API key |
| Auth | bcrypt password hashes + signed JWT in an httpOnly cookie; roles **admin**, **faculty**, **student** |

## Database features at a glance

| Requirement | Where |
|-------------|-------|
| DDL: CREATE / ALTER / DROP, PK, FK, CHECK, UNIQUE, ENUM, generated column | [`db/01_schema.sql`](db/01_schema.sql) |
| Indexes: B-tree, composite, partial, GIN (full-text), HNSW (vector) | [`db/02_indexes.sql`](db/02_indexes.sql) |
| Functions, stored procedures, triggers, **the repeat detector** | [`db/03_functions_triggers.sql`](db/03_functions_triggers.sql) |
| Views (CTE, window functions, correlated subqueries) | [`db/04_views.sql`](db/04_views.sql) |
| Audit trail (trigger + acting user) | [`db/05_audit.sql`](db/05_audit.sql) |
| Transactions and row locks | all API writes use `withTransaction` ([`src/lib/db.ts`](src/lib/db.ts)); procedures use `SELECT … FOR UPDATE` |
| Full-text search | `tsvector` generated column + GIN, used in search |
| Vector similarity search | `<=>` on `vector(384)`, used by the detector and by search |
| JOIN / GROUP BY / HAVING / subqueries / set operations / window functions / EXPLAIN | Admin **SQL Lab** ([`src/lib/showcase.ts`](src/lib/showcase.ts)) |
| Validation at database level | CHECK, UNIQUE, ENUM, FK actions, integrity triggers |

The full write-up (ER diagram, schema, normalisation, data dictionary, justification, queries, testing) is in [`docs/REPORT.md`](docs/REPORT.md).

## Setup (Windows, Command Prompt)

### 1. Prerequisites
- **Node.js 20 or newer**: check with `node -v`.
- **Git**.
- A PostgreSQL database with pgvector. Pick one:
  - **Neon** (recommended): free at neon.tech, pgvector built in.
  - **Offline**: no database to install; `npm run db:local` starts an embedded PostgreSQL (PGlite) with pgvector.

### 2. Install
```
git clone <this-repo-url>
cd pyqbank
npm install
```

### 3. Configure
```
copy .env.example .env
notepad .env
```
- `DATABASE_URL`: in Neon, open your project, click **Connect**, copy the connection string. For the offline option, use `postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable`.
- `AUTH_SECRET`: any long random string. To generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Credentials are read only from `.env`, which is git-ignored.

### 4. Create the schema and load demo data
For the offline option only, first open a **second** Command Prompt in the project folder, run `npm run db:local` and leave it open.

```
npm run db:setup
npm run db:seed
npm run test:db
```
`db:setup` runs `db/01…05` (it drops and recreates everything). `db:seed` loads demo data and computes embeddings; the first run downloads the ~23 MB model. `test:db` runs 34 database test cases and writes `docs/test-results.md`.

### 5. Run
```
npm run dev
```
Open http://localhost:3000.

| Role | Email | Password |
|------|-------|----------|
| Admin (exam cell) | admin@pyqbank.test | Admin@123 |
| Faculty (DBMS) | faculty@pyqbank.test | Faculty@123 |
| Faculty (OS) | os.faculty@pyqbank.test | Faculty@123 |
| Student | student@pyqbank.test | Student@123 |

## Demo walkthrough
1. **Student**: the dashboard shows the most repeated questions and saved questions. Under **Question Bank → Database Management Systems**, look at *Most repeated*, *Unit weightage*, *Topics* and *Past papers*. Open a paper to see which questions were asked before. Click an "asked N×" chip to see every wording of that question. Under **Search**, try `how are deadlocks prevented`: keyword search finds 2 questions, meaning search finds many more.
2. **Faculty** (`faculty@pyqbank.test`): create a draft *ISA1 2026* paper and add these questions one at a time:
   - `1a` · topic *Database architecture and data independence* · "Explain the three-schema architecture of a DBMS with a diagram" → sent to the **review queue**
   - `1b` · topic *Nested and correlated subqueries* · "Explain the correlated subquery with an example and compare it with a nested subquery." → **repeat detected**, grouped
   - `2a` · topic *Join expressions* · "Explain the GROUPING SETS and ROLLUP extensions of GROUP BY with an example." → **new question**

   Then open the **Review Queue** and decide a few pairs, and **Publish** the paper.
3. **Admin**: dashboard (repeat share per year), **Detection** thresholds (try saving review > auto: the CHECK constraint refuses), **SQL Lab** (15 live queries including EXPLAIN plans), **Audit Log**, and **Courses** (deleting a course with papers is refused by ON DELETE RESTRICT).

## Project structure
```
db/                     SQL: schema, indexes, functions/procedures/triggers, views, audit
scripts/                db-setup, seed (+ seed-data), test-db, local-db
src/proxy.ts            role-based route protection
src/lib/db.ts           pg pool, transactions (sets app.user_id for the audit trigger), error messages
src/lib/embeddings.ts   local sentence-embedding model
src/app/api/**          backend API (auth, student, faculty, admin)
src/app/bank/**         question bank pages shared by all roles (course, paper, repeat group, search)
src/app/student|faculty|admin/**   role dashboards
docs/                   report, ER/architecture diagrams, test results, detector evaluation, screenshots
```
