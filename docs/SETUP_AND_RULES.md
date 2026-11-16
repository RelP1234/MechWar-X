# MechWar-X - local demonstration kit

This is a working classroom application: four browser screens, a real local
PostgreSQL 17 database, server-side stored procedures and automated tests.
All included people, contact details and organizations are fictional demo data.

## Start on Windows x64

1. Extract the entire ZIP to a writable folder. Do not run from inside the ZIP.
2. Double-click `Start.cmd`. Allow up to one minute on the first start.
3. The app opens at http://127.0.0.1:3080. Keep this folder in place while running.
4. Double-click `Stop.cmd` when finished; wait five seconds before moving files.

The complete Windows kit includes Node.js and PostgreSQL. No separate database
installation or internet connection is needed after extraction. Data is stored
locally in `data/` and survives restarting. Do not delete that folder to fix an
error. There is no reset button that silently destroys your rehearsal work.

The Windows launch scripts have been exercised on this machine. A different
computer may enforce application restrictions; rehearse on the actual class
laptop before your presentation. Ports 3080 and 55432 must be free. If startup
fails, inspect `data/server-error.log` and `data/server.log`.

## Development / database tests

The source uses JavaScript, Node's HTTP server, the `pg` database API and
PostgreSQL's PL/pgSQL. `schema.sql` contains DDL, procedures, triggers and grants;
`seed.sql` contains fictional seed data. `bootstrap.sql` documents the manual
database creation alternative. `validation.sql` contains read-only evidence queries.

With the app running, double-click `Test.cmd` to run the database tests. Tests
create and drop only their own uniquely named temporary database. They do not
clear or overwrite the demonstration records. The saved result is
`test-results.json`. `browser-test.mjs` is the optional Playwright verification
source; it needs Playwright and Chrome and creates additional fictional records.
It is not needed to run or present the app.

If using source without the bundled runtime, install Node.js 20+ and run
`npm install`, then `npm start`. The lockfile records the resolved dependencies.
PostgreSQL binaries come from embedded-postgres, which starts a real local
PostgreSQL server. This is not an in-memory mock or a SQLite substitute.

## Demo records

- Client 1: Nova Reed. Valid license; one prebooked future Specter contract.
- Client 2: Kai Stone. Valid license; useful for a second-client booking test.
- Client 3: Expired Pilot. Expired license; rejection-test data.
- Mech 1: Specter; mech 2: Ironclad; mech 3: Longbow; mech 4: Atlas.
- Longbow begins with a critical shield fault and is Unavailable.
- Garage 1: Neo-Prime Central / Alex Vega. Garage 2: Orion East / Jordan Chen.

IDs generated during rehearsals may differ. Use the new ID displayed after each
successful registration, booking and incident report. Never guess the next ID.

## Four-screen workflow

1. **Register Mech:** submit the asset, then use **Book this mech**. The new mech
   is selected automatically and departure defaults to its current garage.
2. **Book Deployment:** choose the client and return garage. **Start in 30 seconds**
   or **Tomorrow** fills a two-hour window; **Reserve** actually saves it.
3. **Client Manifests:** search a Client ID, or use **View client manifests** after
   booking. Start enables during the window. Complete and Cancel save changes.
4. **Maintenance & Repairs:** report damage, or click **Update repair** beside an
   existing incident. The selected incident, chief and saved notes load together.

A UTC clock is always visible. Longer explanations expand on demand. The current
version passed 36 database integration tests and 22 browser checks, including
stale-search handling, date shortcuts, repair selection and narrow layouts.

## Documented operating rules

- All timestamps entered/displayed in the GUI are **UTC**, explicitly labelled.
- Intervals are half-open: a reservation ending at 14:00 permits one starting
  at 14:00. Same-client conflicts are rejected too.
- Future nonoverlapping reservations are allowed. An active deployment blocks
  new bookings, even if its scheduled return has passed, until completion.
- Available means physically ready now, not free for every possible future slot.
- Booked contracts can be cancelled. Active contracts must be completed on
  return; severe damage is retained as a critical incident.
- Cancellation recomputes availability; it never clears a legitimate repair lock.
- A critical incident may be reported during a match. It blocks further use.
  Existing future bookings remain visible; deployment rechecks readiness.
- Routine servicing reserves a future maintenance window; overdue unresolved
  routine work blocks deployment until resolved. Starting work makes the mech
  unavailable; all critical issues must be repaired before it becomes ready.
- Completion records actual return time, adds elapsed actual deployment hours
  once, calculates actual cost, and transfers the mech to its return garage.
- Combat hours use elapsed deployment time because separate telemetry hours
  were not supplied. The class demo's very short match therefore adds seconds.
- Cost is prorated: elapsed seconds / 86,400 x agreed daily rate, rounded to
  cents, minimum $0.01. No unspecified taxes, deposits or full-day rounding.
- The rate is fixed on booking. Estimated and final charges are stored in the
  one-to-one accounting table; later base-rate edits do not rewrite contracts.
- The pilot license must remain valid through the scheduled return date.
- Departure and return garages are independently chosen. At actual departure,
  the mech must be physically at that departure garage.
- Telemetry/staff reports may omit a reporting client. Chief assignment may be
  empty while Reported; a chief and engineering notes are required for repair.
- Records are retained for auditing; deleting a referenced entity is restricted.

## Submission boundary

Upload only the three PDFs in `Submission`: GX_SQL.pdf, GX_ERD.pdf and GX_GUI.pdf.
Replace X with the confirmed group number before uploading. Do not upload this
ZIP, raw source, data directory, screenshots separately or the rehearsal guide.
The assignment allows one attempt and requires a group submission. Every member
must attend the demonstration. Confirm the Canvas deadline/timezone and group
membership before using the single submission attempt.

## AI disclosure

OpenAI Codex (GPT-6) generated and modified schema/DDL, SQL procedures and
triggers, database connection/bootstrap code, HTTP routes, all four GUI screens,
validation code, tests, ERD and documentation. Merrel Payne reported instructor
permission for this scope. The group remains responsible for reviewing,
understanding, rehearsing and verifying the complete project.

## Technical references

- PostgreSQL constraints: https://www.postgresql.org/docs/17/ddl-constraints.html
- PostgreSQL triggers: https://www.postgresql.org/docs/17/sql-createtrigger.html
- PostgreSQL procedures: https://www.postgresql.org/docs/17/sql-createprocedure.html
- Runtime: https://github.com/leinelissen/embedded-postgres
- Database API: https://node-postgres.com/features/queries

Third-party runtime licenses remain with their bundled packages.
