/* AI DISCLOSURE
 * Tool: OpenAI Codex (GPT-6), used with instructor permission reported
 * by Merrel Payne. AI generated/modified this server, database bootstrap,
 * SQL schema/procedures/triggers, browser HTML/CSS/JavaScript, automated
 * tests and project documentation. Group review and rehearsal required.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { startDatabase, root } from "./database.mjs";

const { pool, cluster } = await startDatabase();
const port = Number(process.env.PORT || 3080);
const origin = `http://127.0.0.1:${port}`;
const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
function id(value, optional = false) {
  if (optional && (value === "" || value == null)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("Enter a valid positive ID");
  return n;
}
function text(value, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`Required text must be between 1 and ${max} characters`);
  return value.trim();
}
function time(value, optional = false) {
  if (optional && !value) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("Enter a valid date and time");
  return new Date(value).toISOString();
}
async function body(req) {
  let content = "";
  for await (const chunk of req) {
    content += chunk;
    if (content.length > 16000) throw new Error("Request is too large");
  }
  return JSON.parse(content);
}
const errorMessage = (e) => {
  if (e.code === "23505")
    return "That unique chassis serial or identifier already exists.";
  if (e.code === "23503")
    return "A selected client, mech, garage or technician does not exist.";
  if (e.code === "23P01") return "Booking rejected: overlapping reservation.";
  if (e.code === "23514")
    return "Validation failed. Check positive values, dates, status and required repair notes.";
  if (e.code === "P0002") return "The requested record does not exist.";
  if (e.code === "22003") return "A numeric value exceeds the supported range.";
  return e.message;
};
const server = http.createServer(async (req, res) => {
  try {
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
    ) {
      return send(res, 403, { error: "Local access only" });
    }
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      ![origin, `http://localhost:${port}`].includes(req.headers.origin)
    ) {
      return send(res, 403, { error: "Origin rejected" });
    }
    const url = new URL(req.url, origin);
    if (req.method === "GET" && url.pathname === "/api/state") {
      const queries = [
        "SELECT * FROM mech ORDER BY mech_id",
        "SELECT * FROM mech_type ORDER BY type_id",
        "SELECT * FROM battle_garage ORDER BY garage_id",
        "SELECT staff_id,full_name,garage_id FROM pit_crew_technician ORDER BY staff_id",
        "SELECT client_id,first_name,last_name,license_expiration FROM client ORDER BY client_id",
        "SELECT * FROM garage_contacts ORDER BY garage_id,staff_id",
      ];
      const rows = await Promise.all(
        queries.map((q) => pool.query(q).then((r) => r.rows)),
      );
      return send(
        res,
        200,
        Object.fromEntries(
          [
            "mechs",
            "types",
            "garages",
            "technicians",
            "clients",
            "contacts",
          ].map((key, i) => [key, rows[i]]),
        ),
      );
    }
    if (req.method === "GET" && url.pathname === "/api/manifests") {
      const client = id(url.searchParams.get("client"));
      const exists = await pool.query(
        "SELECT first_name,last_name FROM client WHERE client_id=$1",
        [client],
      );
      if (!exists.rowCount)
        return send(res, 404, { error: "Client ID not found" });
      const data = await pool.query(
        "SELECT * FROM manifest_dashboard WHERE client_id=$1 ORDER BY serial_id DESC",
        [client],
      );
      return send(res, 200, { client: exists.rows[0], rows: data.rows });
    }
    if (req.method === "GET" && url.pathname === "/api/incidents") {
      const data =
        await pool.query(`SELECT l.*,m.model,t.full_name AS chief_name
        FROM maintenance_log l JOIN mech m USING(mech_id)
        LEFT JOIN pit_crew_technician t ON t.staff_id=l.chief_id
        ${url.searchParams.get("all") === "1" ? "" : "WHERE l.status <> 'Repaired'"}
        ORDER BY l.log_id DESC`);
      return send(res, 200, data.rows);
    }
    if (req.method === "GET" && url.pathname === "/api/evidence") {
      const specs = {
        database: "SELECT version(),current_database(),current_user",
        tables:
          "SELECT table_name FROM information_schema.tables WHERE table_schema='arena' AND table_type='BASE TABLE' ORDER BY table_name",
        routines:
          "SELECT proname AS routine_name,CASE prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid WHERE nspname='arena' ORDER BY routine_type,routine_name",
        triggers:
          "SELECT tgname AS trigger_name,relname AS table_name FROM pg_trigger JOIN pg_class ON tgrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='arena' AND NOT tgisinternal ORDER BY tgname",
        constraints:
          "SELECT conname AS constraint_name,contype AS type FROM pg_constraint JOIN pg_namespace ON connamespace=pg_namespace.oid WHERE nspname='arena' ORDER BY conname",
        fleet:
          "SELECT mech_id,model,operational_status,combat_hours,garage_id FROM mech ORDER BY mech_id",
        manifests:
          "SELECT serial_id,client_id,status,estimated_cost,actual_cost FROM manifest_dashboard ORDER BY serial_id",
      };
      const out = {};
      for (const [key, sql] of Object.entries(specs))
        out[key] = { sql, rows: (await pool.query(sql)).rows };
      return send(res, 200, out);
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(res, 415, { error: "JSON required" });
      const b = await body(req);
      let result;
      if (url.pathname === "/api/mechs") {
        const year = id(b.assembly_year),
          rate = Number(b.daily_rate);
        if (year > new Date().getUTCFullYear())
          throw new Error("Assembly year cannot be in the future");
        if (!Number.isFinite(rate) || rate <= 0)
          throw new Error("Daily rate must be positive");
        result = await pool.query(
          `INSERT INTO mech(chassis_serial,manufacturer,model,
          assembly_year,armor_color,daily_rate,type_id,garage_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING mech_id`,
          [
            text(b.chassis_serial, 50).toUpperCase(),
            text(b.manufacturer, 80),
            text(b.model, 80),
            year,
            text(b.armor_color, 40),
            rate,
            id(b.type_id),
            id(b.garage_id),
          ],
        );
      } else if (url.pathname === "/api/book") {
        result = await pool.query(
          "CALL book_manifest($1,$2,$3,$4,$5,$6,NULL)",
          [
            id(b.client_id),
            id(b.mech_id),
            id(b.departure_garage_id),
            id(b.return_garage_id),
            time(b.scheduled_start),
            time(b.scheduled_end),
          ],
        );
      } else if (url.pathname === "/api/manifest-action") {
        result = await pool.query("CALL change_manifest($1,$2)", [
          id(b.serial_id),
          text(b.action, 20),
        ]);
      } else if (url.pathname === "/api/incident") {
        result = await pool.query(
          "CALL report_incident($1,$2,$3,$4,$5,$6,$7,NULL)",
          [
            id(b.mech_id),
            id(b.reporting_client_id, true),
            text(b.issue_type, 10),
            text(b.description, 4000),
            id(b.chief_id, true),
            time(b.scheduled_start, true),
            time(b.scheduled_end, true),
          ],
        );
      } else if (url.pathname === "/api/incident-action") {
        result = await pool.query("CALL update_incident($1,$2,$3,$4)", [
          id(b.log_id),
          text(b.status, 20),
          id(b.chief_id),
          text(b.engineering_notes, 4000),
        ]);
      } else return send(res, 404, { error: "Unknown action" });
      return send(res, 200, { ok: true, rows: result.rows });
    }
    const files = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
    };
    if (req.method === "GET" && files[url.pathname]) {
      const file = files[url.pathname];
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      return res.end(await fs.readFile(path.join(root, "public", file)));
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 400, { error: errorMessage(e) });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`MechWar-X ready: ${origin}`),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await pool.end();
  await cluster.stop();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
// A local stop file lets the Windows launcher request a clean shutdown.
const stopFile = path.join(root, "data", "stop-request");
await fs.rm(stopFile, { force: true });
setInterval(async () => {
  try {
    await fs.access(stopFile);
    await fs.rm(stopFile);
    await close();
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Shutdown:", e.message);
  }
}, 1000).unref();
