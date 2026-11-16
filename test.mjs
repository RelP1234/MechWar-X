// Integration tests use a new disposable database, never the demo records.
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { config, root } from "./database.mjs";

const owner = new pg.Client({ ...config, database: "postgres" });
await owner.connect();
const name = `mechwar_x_test_${Date.now()}`;
await owner.query(`CREATE DATABASE ${name}`);
const db = new pg.Client({ ...config, database: name });
await db.connect();
const results = [];
const q = (sql, args) => db.query(sql, args);
const val = async (sql, args) => (await q(sql, args)).rows[0];
async function check(label, fn) {
  try {
    await fn();
    results.push({ test: label, status: "PASS" });
    console.log(`PASS ${label}`);
  } catch (e) {
    results.push({ test: label, status: "FAIL", error: e.message });
    console.log(`FAIL ${label}: ${e.message}`);
  }
}
async function reject(fn, pattern) {
  await assert.rejects(fn, pattern);
}
async function newMech(suffix) {
  return (
    await val(
      `INSERT INTO mech(chassis_serial,manufacturer,model,assembly_year,
    armor_color,daily_rate,type_id,garage_id) VALUES($1,'Test','Test',2026,'Black',2400,1,1)
    RETURNING mech_id`,
      [`TEST-${suffix}`],
    )
  ).mech_id;
}
const future = (days, hour = 0) =>
  new Date(Date.now() + days * 86400000 + hour * 3600000).toISOString();
async function book(m, start, end, client = 1, dep = 1, ret = 2) {
  return (
    await val("CALL book_manifest($1,$2,$3,$4,$5,$6,NULL)", [
      client,
      m,
      dep,
      ret,
      start,
      end,
    ])
  ).p_serial;
}
async function incident(m, type = "Critical", start = null, end = null) {
  return (
    await val("CALL report_incident($1,NULL,$2,$3,1,$4,$5,NULL)", [
      m,
      type,
      "Test incident",
      start,
      end,
    ])
  ).p_log;
}
const fix = (id) =>
  q(
    "CALL update_incident($1,'Repaired',1,'Component replaced and load-tested')",
    [id],
  );
const status = async (m) =>
  (await val("SELECT operational_status FROM mech WHERE mech_id=$1", [m]))
    .operational_status;
try {
  await q(await fs.readFile(path.join(root, "schema.sql"), "utf8"));
  await q(await fs.readFile(path.join(root, "seed.sql"), "utf8"));
  await check("All eight physical tables created", async () =>
    assert.equal(
      Number(
        (
          await val(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='arena' AND table_type='BASE TABLE'",
          )
        ).count,
      ),
      8,
    ),
  );
  await check("Chassis serial uniqueness enforced", () =>
    reject(
      () =>
        q(
          "INSERT INTO mech(chassis_serial,manufacturer,model,assembly_year,armor_color,daily_rate,type_id,garage_id) VALUES('NP-SCOUT-001','A','B',2026,'C',100,1,1)",
        ),
      /unique/,
    ),
  );
  await check("Nonpositive daily rate rejected", () =>
    reject(
      () => q("UPDATE mech SET daily_rate=0 WHERE mech_id=1"),
      /check constraint/,
    ),
  );
  await check("Nonpositive assembly year rejected", () =>
    reject(
      () => q("UPDATE mech SET assembly_year=0 WHERE mech_id=1"),
      /check constraint/,
    ),
  );
  await check("Blank mandatory model rejected", () =>
    reject(
      () => q("UPDATE mech SET model='   ' WHERE mech_id=1"),
      /check constraint/,
    ),
  );
  await check("Invalid foreign key rejected", () =>
    reject(
      () => q("UPDATE mech SET type_id=99999 WHERE mech_id=1"),
      /foreign key/,
    ),
  );
  await check("Audit parent deletion restricted", () =>
    reject(() => q("DELETE FROM client WHERE client_id=1"), /foreign key/),
  );
  const m = await newMech("WINDOWS"),
    a = future(3),
    b = future(3, 2),
    c = future(3, 3);
  let serial;
  await check("Valid booking and $200 estimated charge", async () => {
    serial = await book(m, a, b);
    assert.equal(
      (
        await val(
          "SELECT estimated_cost FROM manifest_charge WHERE serial_id=$1",
          [serial],
        )
      ).estimated_cost,
      "200.00",
    );
  });
  await check("Identical overlapping booking rejected", () =>
    reject(() => book(m, a, b), /overlapping/),
  );
  await check("Partial overlap by another client rejected", () =>
    reject(() => book(m, future(3, 1), c, 2), /overlapping/),
  );
  await check("Containing overlap rejected", () =>
    reject(() => book(m, future(2), future(4)), /overlapping/),
  );
  await check("Adjacent boundary accepted", async () =>
    assert.ok(await book(m, b, c)),
  );
  await check("Reversed window rejected", () =>
    reject(() => book(m, c, b), /after/),
  );
  await check("Past booking rejected", () =>
    reject(() => book(m, future(-2), future(-1)), /future/),
  );
  await check("Expired pilot license rejected", () =>
    reject(() => book(m, future(5), future(5, 2), 3), /license/),
  );
  await check(
    "Cancellation automatically releases ordinary asset",
    async () => {
      await q("CALL change_manifest($1,'cancel')", [serial]);
      assert.equal(await status(m), "Available");
    },
  );
  await check("Cancelled window can be booked again", async () =>
    assert.ok(await book(m, a, b)),
  );
  const l1 = await incident(m),
    l2 = await incident(m);
  await check("Critical incident automatically locks asset", async () =>
    assert.equal(await status(m), "Unavailable"),
  );
  await check("Critical lock blocks new booking", () =>
    reject(() => book(m, future(8), future(8, 1)), /unavailable/),
  );
  await check("Cancelling a match cannot bypass critical lock", async () => {
    const r = await val(
      "SELECT serial_id FROM deployment_manifest WHERE mech_id=$1 AND status='Match Booked' LIMIT 1",
      [m],
    );
    await q("CALL change_manifest($1,'cancel')", [r.serial_id]);
    assert.equal(await status(m), "Unavailable");
  });
  await check("Repairing one of two incidents preserves lock", async () => {
    await fix(l1);
    assert.equal(await status(m), "Unavailable");
  });
  await check("Repairing last incident restores availability", async () => {
    await fix(l2);
    assert.equal(await status(m), "Available");
  });
  await check("Repaired incident audit cannot be rewritten", () =>
    reject(() => fix(l2), /immutable/),
  );
  const rm = await newMech("ROUTINE"),
    rs = future(10),
    re = future(10, 2);
  await incident(rm, "Routine", rs, re);
  await check("Routine service prevents overlapping reservation", () =>
    reject(() => book(rm, rs, re), /maintenance/),
  );
  await check("Routine service allows nonoverlapping reservation", async () =>
    assert.ok(await book(rm, future(11), future(11, 1))),
  );
  await check("Routine service cannot overlap a booked match", () =>
    reject(
      () => incident(rm, "Routine", future(11), future(11, 1)),
      /overlaps/,
    ),
  );
  await check("Routine service requires both timestamps", () =>
    reject(() => incident(rm, "Routine", future(12), null), /check constraint/),
  );
  const lm = await newMech("LIFECYCLE");
  const ls = new Date(Date.now() + 200).toISOString(),
    le = future(1);
  const life = await book(lm, ls, le);
  await q("SELECT pg_sleep(0.3)");
  await check("Starting a valid match sets Deployed", async () => {
    await q("CALL change_manifest($1,'start')", [life]);
    assert.equal(await status(lm), "Deployed");
  });
  await check("Active deployment blocks even distant new booking", () =>
    reject(() => book(lm, future(20), future(20, 1)), /unavailable|deployed/),
  );
  const activeFailure = await incident(lm);
  await check("Repair during active match returns to Deployed", async () => {
    await fix(activeFailure);
    assert.equal(await status(lm), "Deployed");
  });
  await check(
    "Completion updates hours, final cost and return garage",
    async () => {
      await q("CALL change_manifest($1,'complete')", [life]);
      const r = await val(
        `SELECT m.combat_hours,m.garage_id,m.operational_status,c.actual_cost,
      round(extract(epoch FROM (d.actual_return-d.actual_start))/3600,6) AS expected_hours
      FROM mech m JOIN deployment_manifest d USING(mech_id)
      JOIN manifest_charge c USING(serial_id) WHERE serial_id=$1`,
        [life],
      );
      assert.equal(r.garage_id, 2);
      assert.equal(r.operational_status, "Available");
      assert.equal(r.combat_hours, r.expected_hours);
      assert.ok(Number(r.actual_cost) > 0);
    },
  );
  await check("Repeated completion cannot double-count hours", () =>
    reject(
      () => q("CALL change_manifest($1,'complete')", [life]),
      /transition/,
    ),
  );
  const cm = await newMech("CONCURRENT");
  await check(
    "Concurrent overlapping requests: exactly one commits",
    async () => {
      const clients = [
        new pg.Client({ ...config, database: name }),
        new pg.Client({ ...config, database: name }),
      ];
      await Promise.all(clients.map((c) => c.connect()));
      try {
        const start = future(30),
          end = future(30, 1);
        const outcome = await Promise.allSettled(
          clients.map((c, i) =>
            c.query("CALL book_manifest($1,$2,1,1,$3,$4,NULL)", [
              i + 1,
              cm,
              start,
              end,
            ]),
          ),
        );
        assert.equal(outcome.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(outcome.filter((r) => r.status === "rejected").length, 1);
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
    },
  );
  await check(
    "Runtime role cannot bypass booking with direct INSERT",
    async () => {
      await q("SET ROLE mechwar_app");
      try {
        await reject(
          () =>
            q(
              "INSERT INTO deployment_manifest(client_id,mech_id,departure_garage_id,return_garage_id,scheduled_start,scheduled_end,agreed_daily_rate) VALUES(1,1,1,1,now()+interval '50 days',now()+interval '51 days',100)",
            ),
          /permission denied/,
        );
      } finally {
        await q("RESET ROLE");
      }
    },
  );
  await check("Runtime role cannot manually clear a repair lock", async () => {
    await q("SET ROLE mechwar_app");
    try {
      await reject(
        () =>
          q("UPDATE mech SET operational_status='Available' WHERE mech_id=3"),
        /permission denied/,
      );
    } finally {
      await q("RESET ROLE");
    }
  });
  await check("Client-filtered search excludes other clients", async () => {
    const rows = (
      await q("SELECT * FROM manifest_dashboard WHERE client_id=$1", [1])
    ).rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.client_id === 1));
  });
  const version = (await val("SELECT version() AS version")).version;
  await fs.writeFile(
    path.join(root, "test-results.json"),
    JSON.stringify(
      {
        executed_at: new Date().toISOString(),
        database: version,
        total: results.length,
        passed: results.filter((r) => r.status === "PASS").length,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
  await owner.query(`DROP DATABASE ${name}`);
  await owner.end();
}
console.log(
  `${results.filter((r) => r.status === "PASS").length}/${results.length} integration tests passed`,
);
process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
