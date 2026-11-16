# MechWar-X: your five-minute demonstration

Merrel, present the running application. You do not need PowerPoint. This script
is a rehearsal aid, not a fourth submission file. Say only what you demonstrate
and what your group has actually reviewed. Assign the speaking roles below to
the members who understand each part; you can also deliver the whole sequence.

## Before class

- Confirm your group number, members and demo order. Everyone must be present.
- Extract the Windows Run Kit and rehearse on the laptop you will bring.
- Open the application before your group is called; show DATABASE CONNECTED.
- Keep the three PDFs and this guide available offline. Keep the app open.
- Use the four numbered screens. Do not spend the presentation opening code files.
- Know the UTC time displayed in the app. Schedule the live demonstration booking
  using **Start in 30 seconds**, which fills a two-hour window. It does not save
  until you click Reserve. The dashboard enables Start when the countdown ends.
- Use a fresh chassis serial each rehearsal, such as CLASS-001, CLASS-002, etc.
- Prepare manufacturer Astra Dynamics, model Vanguard, current assembly year,
  color Emerald, rate 2400, Light Scout, garage Neo-Prime Central.
- Client 1 is Nova Reed; garage 2 is Orion East. Choose Alex Vega or Jordan Chen
  as the chief. Copy the actual IDs shown by the app instead of assuming them.
- Keep one future booked contract available for the cancellation demonstration.
  The fresh database already includes a Specter booking for Client 1.

## 0:00-0:25 | Opening - Merrel or presenter 1

**Say:** "Our project is MechWar-X, a combat-mech fleet and garage management
system. We built four screens connected to a real PostgreSQL database. I'll
show registration, reservations, client search, and incident repair. The important
rules run inside the database, so they still apply if two requests arrive together."

**Do:** Point to the four screens and the connection indicator. Avoid explaining
every field. Move immediately into the working workflow.

## 0:25-1:05 | Screen 1: register - presenter 1

**Say:** "This form registers a mech with a unique chassis serial, classification,
garage, and positive daily rate. The new asset appears in the fleet immediately.
Garage dispatch contacts are available beside the form for urgent failures."

**Do:** Submit the prepared values. Point to the success message and new row.
Click **Book this mech** to carry the new selection into booking. If you have
rehearsed fast enough, repeat the chassis serial before leaving registration
to show the duplicate rejection; otherwise mention that this check is tested.

## 1:05-1:55 | Screen 3: book and reject overlap - presenter 2

**Say:** "Now Client 1 reserves the new mech. We can return it to a different
garage. At $2,400 per day, a two-hour reservation estimates to $200."

**Do:** The new mech and its departure garage are already selected. Choose
Client 1 and return garage 2. Click **Start in 30 seconds**, then **Reserve**.
Note the manifest ID. Click Reserve again with the same values.

**Say:** "The second reservation is rejected. The stored procedure locks the
mech row and checks for overlap. A database exclusion constraint adds another
layer of protection, so simultaneous requests cannot create conflicting bookings."

## 1:55-2:45 | Screen 2: search, complete and cancel - presenter 2

**Do:** Click **View client manifests**. Client ID 1 is already selected and
the records load from the database. You can click Search to demonstrate the
query again. Locate your new manifest. When the countdown ends, click Start,
then Complete after a few seconds.

**Say:** "The dashboard pulls this client's live and historical contracts from
the database. Starting changes the mech to Deployed. Completion records actual
timestamps, calculates the final charge, adds actual operating hours once, and
updates the mech's garage. Our demonstration match is only a few seconds, so
its actual charge and added hours are small."

**Do:** Cancel the separate future Specter booking. Point to Cancelled and the
Available count. If it was already cancelled in rehearsal, book a new future
contract before class and use that contract here.

**Say:** "Cancellation automatically recomputes availability. It does not clear
an outstanding critical repair lock."

## 2:45-3:45 | Screen 4: critical damage and repair - presenter 3

**Do:** Select your new mech. Set Critical, reporting Client 1, chief Jordan Chen.
Enter "Left actuator coupling failure." Submit. Note the incident ID.

**Say:** "A critical incident immediately marks the mech Unavailable. The
database blocks new bookings and deployment until it is repaired. The incident
remains recorded for auditing. Routine maintenance uses a scheduled window."

**Do:** The new incident is automatically selected in the repair form. For an
existing incident, click **Update repair** in its table row. Choose Repaired,
keep Jordan Chen, and enter "Replaced actuator coupling; calibration and load test passed."
Save. Check Include repaired and point to the resolution timestamp and notes.

**Say:** "Resolving this incident checks for any other unresolved critical
failures before releasing the mech. We retain the repair history."

## 3:45-4:25 | Design and verification - presenter 3 or Merrel

**Do:** Briefly show the ERD or database-evidence screen. Do not read every table.

**Say:** "We use eight normalized tables. Client and Mech each connect to many
deployment manifests over time. Departure and return are separate references to
Garage. Charges are stored separately from operational contract details. Primary
keys, foreign keys, unique constraints, checks and restricted deletion protect
the data. We passed 36 database integration tests and 22 browser workflow checks,
including concurrent booking attempts and repair-lock edge cases."

Only use those counts for the delivered tested version; rerun the tests after
any changes. The included JSON reports record what was actually verified.

## 4:25-5:00 | Questions and buffer

**Say:** "That covers the complete workflow. We're ready for questions about the
design, implementation or tests."

Leave time for a slow click or a question. If a validation error occurs, read it,
correct the input and explain the rule. Do not pretend an error did not happen.

## Understand the five ideas behind your demonstration

- **Relational database:** separate tables hold related facts. A mech stores a
  Garage ID; the garage table holds its name, address and phone. This prevents
  copying the same contact details into every booking.
- **Primary key / foreign key:** a primary key identifies a row, such as Mech ID.
  A foreign key points to another table's row, such as a booking's Mech ID.
  A foreign-key constraint prevents a booking from naming a nonexistent mech.
- **Stored procedure / trigger:** a procedure is a named database operation you
  call, such as booking a match. A trigger responds automatically to an event,
  such as a status change, and invokes the synchronization logic.
- **Transaction:** related changes succeed together or fail together. Completion
  must save the return time, charge, hours and garage transfer as one unit.
- **Validation:** expected mistakes should produce helpful messages. An overlap
  rejection is evidence that the rule works. An unexplained crash is a bug.

Trace this aloud: **form input -> server -> database procedure -> saved rows ->
updated screen**. The GUI collects and displays; PostgreSQL enforces the rules.
At $2,400 per day, the hourly rate is $100, so two scheduled hours estimate $200.
If the demo lasts three actual seconds, the final price is about $0.08.

Your practice challenge: register a new mech, book it, reject an overlap,
complete the match, report critical damage, and repair it without using this
script. Then explain why a cancelled booking must not remove a repair lock.

## Questions you should be able to answer

**Why is the database in 3NF?** Each table describes one entity or accounting
fact. Values are atomic. Non-key attributes depend on that table's key, not on
another non-key descriptive attribute. Garage contact information lives with
garages/technicians, and mech-type names live in MechType instead of repeating
on each contract. The ERD PDF lists the dependencies and optional relationships.

**What is the overlap rule?** Existing start is before requested end AND existing
end is after requested start. This catches exact, partial and containing overlaps.
Adjacent windows are allowed. Completed and cancelled contracts do not reserve
future time. An actually active deployment still prevents allocation.

**What happens if two clients book at once?** The procedure locks the mech row
with SELECT FOR UPDATE. The exclusion constraint independently rejects overlapping
live reservations. The concurrency test confirmed one success and one rejection.

**How does the procedure run automatically?** PostgreSQL row triggers call small
trigger functions. Those functions call the stored status-synchronization or
emergency-lock procedures. PostgreSQL triggers require a trigger function;
the function bridges the automatic event to the required procedure.

**Why doesn't cancellation always make a mech Available?** It normally releases
the asset, but an unresolved critical failure or active service still requires
Unavailable. An ongoing deployment requires Deployed. This reconciles the
cancellation rule with the emergency-lock requirement.

**How do you avoid duplicate combat hours?** Only Active in Arena can transition
to Completed. A repeated completion is rejected before the completion trigger
can add hours again. The transition, billing and garage move are one transaction.

**How is price calculated?** Actual or scheduled elapsed seconds divided by
86,400, multiplied by the rate agreed at booking, rounded to cents with a $0.01
minimum. No unspecified full-day rounding or taxes are added.

**Why are some foreign keys nullable?** Telemetry can report an incident without
a client, and a newly reported incident may not yet have a chief. Repaired
incidents require a chief, notes and resolution timestamp.

**What did you test?** Positive workflows plus duplicate serials, blank fields,
invalid keys, nonpositive values, expired licenses, past/reversed windows,
overlap boundaries, maintenance conflicts, concurrent bookings, cancellation
during a repair lock, multiple critical incidents, and repeated completion.

**Did you use AI?** "We used OpenAI Codex with the instructor's permission for
the sections identified in our disclosure. Our group reviewed the implementation,
ran the tests and rehearsed the demonstration." Say the review/rehearsal portion
only after your group has actually done it.

## Final submission check

Upload exactly **G[number]_SQL.pdf**, **G[number]_ERD.pdf**, and **G[number]_GUI.pdf**.
Do not upload this guide or the run-kit ZIP. The assignment is worth 15 points:
3.5 design, 7 implementation, 3 documentation/code quality, 1.5 testing. The
percentage summary and point rubric differ slightly; prioritize every requirement
and use the explicit point rubric when discussing points.

Your pasted assignment indicates Monday, November 16 at 11:59 p.m. and closes
then, with one allowed attempt. Verify the Canvas timezone and upload all three
PDFs in the same group attempt. The stated late penalty does not guarantee the
upload portal remains open after its availability deadline. No submission has
been performed for you.
