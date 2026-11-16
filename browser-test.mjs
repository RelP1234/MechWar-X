// End-to-end checks against the running local demonstration server.
// Creates fictional records; never resets or deletes rehearsal data.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { root } from "./database.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3080";
const out = path.resolve(root, "../evidence");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({
  viewport: { width: 1510, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
const pass = (test) => results.push({ test, status: "PASS" });
const shot = (name) =>
  page.screenshot({ path: path.join(out, name), fullPage: true });
const notice = (pattern) =>
  page.locator("#notice").filter({ hasText: pattern }).waitFor();
const state = () => page.request.get(`${base}/api/state`).then((r) => r.json());
const field = (form, name) => form.locator(`[name=${name}]`);
const submit = (form) => form.locator("[type=submit]").click();
const navigate = async (name) => {
  const loaded = page.waitForResponse((r) => r.url() === `${base}/api/state`);
  await page.locator(`nav [data-screen=${name}]`).click();
  await loaded;
  await page.locator(`#${name}`).waitFor({ state: "visible" });
};
try {
  await page.goto(base);
  await page.locator("#connection").filter({ hasText: "CONNECTED" }).waitFor();
  const serial = `DEMO-${Date.now()}`;
  const model = `Vanguard ${serial.slice(-6)}`;
  const form = page.locator("#fleet-form");
  const values = {
    chassis_serial: serial,
    manufacturer: "Astra Dynamics",
    model,
    assembly_year: String(new Date().getUTCFullYear()),
    armor_color: "Emerald",
    daily_rate: "2400.00",
  };
  for (const [k, v] of Object.entries(values)) await field(form, k).fill(v);
  await submit(form);
  await notice(/registered/);
  const mech = (await state()).mechs.find((m) => m.chassis_serial === serial);
  assert.ok(mech);
  pass("Register asset through Screen 1");
  await shot("gui-1-fleet.png");
  for (const [k, v] of Object.entries(values)) await field(form, k).fill(v);
  await submit(form);
  await notice(/already exists/);
  pass("Duplicate chassis shows readable rejection");
  await page.locator("#fleet-next [data-screen=booking]").click();
  await page.locator("#booking").waitFor({ state: "visible" });
  const booking = page.locator("#booking-form");
  assert.equal(
    await field(booking, "mech_id").inputValue(),
    String(mech.mech_id),
  );
  assert.equal(await field(booking, "departure_garage_id").inputValue(), "1");
  pass("New registration is selected by Book this mech");
  const other = (await state()).mechs.find((m) => m.garage_id === 2);
  await field(booking, "mech_id").selectOption(String(other.mech_id));
  assert.equal(await field(booking, "departure_garage_id").inputValue(), "2");
  assert.equal(await field(booking, "return_garage_id").inputValue(), "2");
  await field(booking, "mech_id").selectOption(String(mech.mech_id));
  pass("Changing mech defaults both garage fields to its location");
  await page.locator("#quick-window").click();
  const quick = Date.parse(
    `${await field(booking, "scheduled_start").inputValue()}Z`,
  );
  const end = Date.parse(
    `${await field(booking, "scheduled_end").inputValue()}Z`,
  );
  assert.ok(quick - Date.now() > 25000 && quick - Date.now() <= 30000);
  assert.equal(end - quick, 7200000);
  assert.equal(await page.locator("#quote").innerText(), "$200.00");
  pass("Thirty-second shortcut fills a two-hour window and correct estimate");
  await page.locator("#tomorrow-window").click();
  const tomorrow = Date.parse(
    `${await field(booking, "scheduled_start").inputValue()}Z`,
  );
  assert.ok(tomorrow - Date.now() > 86395000);
  assert.equal(
    (
      await page.request
        .get(`${base}/api/manifests?client=1`)
        .then((r) => r.json())
    ).rows.filter((r) => r.mech_id === mech.mech_id).length,
    0,
  );
  pass("Date shortcuts do not save a reservation");
  await field(booking, "return_garage_id").selectOption("2");
  const start = Date.now() + 7000;
  await field(booking, "scheduled_start").fill(
    new Date(start).toISOString().slice(0, 19),
  );
  await field(booking, "scheduled_end").fill(
    new Date(start + 7200000).toISOString().slice(0, 19),
  );
  await submit(booking);
  await notice(/booked/);
  pass("Create reservation through Screen 3");
  await shot("gui-2-booking.png");
  await submit(booking);
  await notice(/overlapping/);
  pass("Overlapping reservation rejected by the database");
  await shot("gui-3-overlap.png");
  await page.locator("#booking-next [data-screen=dashboard]").click();
  const record = page
    .locator("#manifest-table tbody tr")
    .filter({ hasText: model });
  await record.waitFor();
  const startButton = record.locator("[data-action=start]");
  assert.equal(await startButton.isDisabled(), true);
  assert.match(await startButton.innerText(), /Start in/);
  pass("Dashboard counts down and prevents starting before the window");
  await startButton.click();
  await notice(/start successful/);
  await new Promise((r) => setTimeout(r, 1100));
  await record.locator("[data-action=complete]").click();
  await notice(/complete successful/);
  pass("Client dashboard starts and completes the selected deployment");
  await shot("gui-4-dashboard.png");
  const search = page.locator("#search-form");
  await field(search, "client_id").fill("99999");
  assert.equal(await page.locator("#manifest-table tbody tr").count(), 0);
  pass("Editing Client ID clears the previous client records immediately");
  await submit(search);
  await notice(/not found/);
  assert.equal(await page.locator("#manifest-table tbody tr").count(), 0);
  pass("Failed client search leaves no stale results");
  await page.route("**/api/manifests?client=1", async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({ response });
  });
  await field(search, "client_id").fill("1");
  const delayed = page.waitForResponse((r) =>
    r.url().endsWith("/api/manifests?client=1"),
  );
  await submit(search);
  await field(search, "client_id").fill("2");
  await delayed;
  await page.waitForFunction(
    () => !document.querySelector("#search-form [type=submit]").disabled,
  );
  assert.equal(await page.locator("#manifest-table tbody tr").count(), 0);
  assert.match(
    await page.locator("#search-client").innerText(),
    /Click Search/,
  );
  await page.unroute("**/api/manifests?client=1");
  await submit(search);
  await page
    .locator("#search-client")
    .filter({ hasText: "Kai Stone" })
    .waitFor();
  pass("A delayed search response cannot replace a newly selected client");
  await navigate("booking");
  await field(booking, "mech_id").selectOption(String(mech.mech_id));
  assert.equal(await field(booking, "departure_garage_id").inputValue(), "2");
  await field(booking, "client_id").selectOption("2");
  await page.locator("#tomorrow-window").click();
  await submit(booking);
  await notice(/booked/);
  await page.locator("#booking-next [data-screen=dashboard]").click();
  const cancelRow = page
    .locator("#manifest-table tbody tr")
    .filter({ hasText: model });
  await cancelRow.locator("[data-action=cancel]").click();
  await notice(/cancel successful/);
  assert.equal(await cancelRow.locator(".badge").innerText(), "Cancelled");
  assert.equal(
    (await state()).mechs.find((m) => m.mech_id === mech.mech_id)
      .operational_status,
    "Available",
  );
  pass("Cancellation from Screen 2 persists Cancelled and restores readiness");
  await navigate("maintenance");
  const incident = page.locator("#incident-form");
  await field(incident, "issue_type").selectOption("Routine");
  assert.equal(await field(incident, "scheduled_start").isVisible(), true);
  assert.equal(
    await field(incident, "scheduled_end").getAttribute("required"),
    "",
  );
  await field(incident, "issue_type").selectOption("Critical");
  assert.equal(await field(incident, "scheduled_start").isVisible(), false);
  pass(
    "Routine maintenance requires service dates; critical reporting does not",
  );
  await field(incident, "mech_id").selectOption(String(mech.mech_id));
  await field(incident, "reporting_client_id").selectOption("1");
  await field(incident, "chief_id").selectOption("2");
  await field(incident, "description").fill(
    "Critical left actuator fault after arena return.",
  );
  await submit(incident);
  await notice(/automatically marked Unavailable/);
  assert.equal(
    (await state()).mechs.find((m) => m.mech_id === mech.mech_id)
      .operational_status,
    "Unavailable",
  );
  pass("Critical incident immediately locks the mech in PostgreSQL");
  await shot("gui-5-critical.png");
  const resolution = page.locator("#resolve-form");
  const logId = await field(resolution, "log_id").inputValue();
  assert.ok(Number(logId));
  assert.equal(await field(resolution, "log_id").getAttribute("readonly"), "");
  assert.equal(await field(resolution, "chief_id").inputValue(), "2");
  pass("New incident automatically selects its repair form and assigned chief");
  const notes = "Inspected actuator coupling; replacement part ordered.";
  await field(resolution, "status").selectOption("Awaiting Parts");
  await field(resolution, "engineering_notes").fill(notes);
  await submit(resolution);
  await notice(/updated to Awaiting Parts/);
  await field(resolution, "engineering_notes").fill("Unsaved temporary edit");
  await page.locator(`[data-repair="${logId}"]`).click();
  assert.equal(
    await field(resolution, "engineering_notes").inputValue(),
    notes,
  );
  assert.equal(
    await field(resolution, "status").inputValue(),
    "Awaiting Parts",
  );
  pass("Update repair loads saved incident notes, chief and status");
  await field(resolution, "status").selectOption("Repaired");
  await field(resolution, "engineering_notes").fill(
    "Replaced actuator coupling; torque calibration and load test passed.",
  );
  await submit(resolution);
  await notice(/updated to Repaired/);
  assert.equal(await resolution.locator("[type=submit]").isDisabled(), true);
  await page.locator("#show-repaired").check();
  await page
    .locator("#incident-table tbody tr")
    .filter({ hasText: model })
    .filter({ hasText: "Repaired" })
    .waitFor();
  pass("Repair resolution retains history and disables the cleared form");
  await shot("gui-6-repaired.png");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["fleet", "dashboard", "booking", "maintenance"]) {
    await navigate(name);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
  }
  pass("All four screens fit a narrow viewport without page overflow");
  await page.setViewportSize({ width: 1510, height: 1100 });
  await page.locator("[data-screen=evidence]").click();
  await page.locator("#evidence-database").waitFor();
  const groups = [
    ["database", "tables"],
    ["routines", "triggers"],
    ["fleet", "manifests"],
  ];
  for (let i = 0; i < groups.length; i++) {
    await page
      .locator(".evidence-block")
      .evaluateAll(
        (els, group) =>
          els.forEach(
            (el) =>
              (el.hidden = !group.includes(el.id.replace("evidence-", ""))),
          ),
        groups[i],
      );
    await shot(`sql-${i + 1}.png`);
  }
  assert.deepEqual(errors, []);
  pass("No browser JavaScript exceptions");
  const after = (await state()).mechs.find((m) => m.mech_id === mech.mech_id);
  assert.equal(after.operational_status, "Available");
  assert.equal(after.garage_id, 2);
  assert.ok(Number(after.combat_hours) > 0);
  pass(
    "Persisted combat hours, return-garage transfer and availability verified",
  );
  const report = {
    executed_at: new Date().toISOString(),
    total: results.length,
    passed: results.length,
    results,
    demo_mech_id: mech.mech_id,
  };
  await fs.writeFile(
    path.join(root, "browser-test-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      total: results.length,
      passed: results.length,
      screenshots: 9,
      demo_mech_id: mech.mech_id,
    }),
  );
} catch (error) {
  await shot("browser-failure.png");
  console.error(
    JSON.stringify({ passed_before_failure: results.length, results }),
  );
  throw error;
} finally {
  await browser.close();
}
