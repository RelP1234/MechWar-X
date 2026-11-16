// Browser code collects input and displays database results.
// Booking, cancellation, maintenance and billing rules remain in SQL.
const $ = (s) => document.querySelector(s);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  n == null
    ? "Pending"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);
const date = (v) =>
  v ? new Date(v).toISOString().replace("T", " ").slice(0, 19) : "—";
const badge = (v) =>
  `<span class="badge ${escapeHtml(v).replaceAll(" ", "-")}">${escapeHtml(v)}</span>`;
let state = {};
let incidentRows = [];
let searchSequence = 0;
let bookingInitialized = false;
function notice(message, error = false) {
  const n = $("#notice");
  n.textContent = message;
  n.className = error ? "error" : "";
  n.hidden = false;
  n.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function api(url, data) {
  let r;
  try {
    r = await fetch(
      url,
      data
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : {},
    );
  } catch {
    $("#connection").textContent = "DATABASE DISCONNECTED";
    throw new Error(
      "Connection lost. Check that MechWar-X is running, then try again.",
    );
  }
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || "Request failed");
  return json;
}
function table(headers, rows) {
  if (!rows.length) return '<div class="empty">No matching records.</div>';
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
async function refresh() {
  state = await api("/api/state");
  $("#connection").textContent = "● DATABASE CONNECTED";
  $("#metric-total").textContent = state.mechs.length;
  for (const [key, status] of [
    ["available", "Available"],
    ["deployed", "Deployed"],
    ["locked", "Unavailable"],
  ])
    $(`#metric-${key}`).textContent = state.mechs.filter(
      (m) => m.operational_status === status,
    ).length;
  const labels = {
    types: (r) => [r.type_id, r.type_name],
    garages: (r) => [r.garage_id, r.garage_name],
    technicians: (r) => [r.staff_id, r.full_name],
    clients: (r) => [
      r.client_id,
      `${r.client_id} · ${r.first_name} ${r.last_name}`,
    ],
    mechs: (r) => [
      r.mech_id,
      `${r.mech_id} · ${r.model} / ${r.operational_status}`,
    ],
  };
  document.querySelectorAll("select[data-options]").forEach((select) => {
    const previous = select.value;
    select.innerHTML =
      (select.dataset.optional
        ? `<option value="">${escapeHtml(select.dataset.optional)}</option>`
        : "") +
      state[select.dataset.options]
        .map(labels[select.dataset.options])
        .map(
          ([id, label]) =>
            `<option value="${id}">${escapeHtml(label)}</option>`,
        )
        .join("");
    if ([...select.options].some((o) => o.value === previous))
      select.value = previous;
  });
  $("#fleet-table").innerHTML = table(
    [
      "ID",
      "CHASSIS / MODEL",
      "TYPE",
      "GARAGE",
      "STATUS",
      "DAILY RATE",
      "COMBAT HOURS",
    ],
    state.mechs.map((m) => [
      m.mech_id,
      `${escapeHtml(m.chassis_serial)}<br><strong>${escapeHtml(m.model)}</strong>`,
      escapeHtml(state.types.find((t) => t.type_id === m.type_id)?.type_name),
      escapeHtml(
        state.garages.find((g) => g.garage_id === m.garage_id)?.garage_name,
      ),
      badge(m.operational_status),
      money(m.daily_rate),
      Number(m.combat_hours).toFixed(6),
    ]),
  );
  $("#garage-cards").innerHTML = state.contacts
    .map(
      (c) =>
        `<div class="garage-card"><h3>${escapeHtml(c.garage_name)}</h3><p>${escapeHtml(c.grid_address)} · Dispatch ${escapeHtml(c.dispatch_phone)}</p><p><strong>${escapeHtml(c.full_name || "No technician assigned")}</strong> · ${escapeHtml(c.phone)}</p><p>${escapeHtml(c.corporate_email)}</p></div>`,
    )
    .join("");
  $("#updated").textContent =
    `SYNCED ${new Date().toISOString().slice(11, 19)} UTC`;
  $("#client-ids").innerHTML = state.clients
    .map(
      (c) =>
        `<option value="${c.client_id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`,
    )
    .join("");
  if (!bookingInitialized) {
    selectBookingMech($("#booking-form [name=mech_id]").value);
    bookingInitialized = true;
  }
  bookingContext();
  quote();
}
const screens = {
  fleet: ["01", "Register a mech", "Screen 1 · Mech Fleet Registration"],
  dashboard: [
    "02",
    "Client manifests",
    "Screen 2 · Sponsor Manifest Dashboard",
  ],
  booking: [
    "03",
    "Book a deployment",
    "Screen 3 · Battle Hangar Operations & Scheduling",
  ],
  maintenance: [
    "04",
    "Maintenance & repairs",
    "Screen 4 · Incident Command & Diagnostics",
  ],
  evidence: [
    "DB",
    "SQL implementation evidence",
    "Live database queries and stored records",
  ],
};
async function show(name) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => (s.hidden = s.id !== name));
  document.querySelectorAll("nav [data-screen]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.screen === name);
    if (b.dataset.screen === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#screen-number").textContent = screens[name][0];
  $("#page-title").textContent = screens[name][1];
  $("#page-subtitle").textContent = screens[name][2];
  $("#notice").hidden = true;
  await refresh();
  if (name === "maintenance") await incidents();
  if (name === "dashboard") await search();
  if (name === "evidence") await evidence();
}
document
  .querySelectorAll("[data-screen]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        show(b.dataset.screen).catch((e) => notice(e.message, true))),
  );
function formData(form) {
  const data = Object.fromEntries(new FormData(form));
  form.querySelectorAll("input[type=datetime-local]").forEach((input) => {
    data[input.name] = input.value
      ? new Date(`${input.value}Z`).toISOString()
      : null;
  });
  return data;
}
function wireForm(selector, handler) {
  $(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await handler(formData(event.target), event.target);
    } catch (e) {
      notice(e.message, true);
    } finally {
      button.disabled =
        selector === "#resolve-form" && !event.target.elements.log_id.value;
    }
  });
}
wireForm("#fleet-form", async (data, form) => {
  const r = await api("/api/mechs", data);
  await refresh();
  const newId = r.rows[0].mech_id;
  selectBookingMech(newId);
  $("#fleet-next-text").textContent =
    `${data.model} (#${newId}) is ready for a reservation.`;
  $("#fleet-next").hidden = false;
  notice(
    `Mech #${r.rows[0].mech_id} registered. The fleet table now includes the new asset.`,
  );
  form.reset();
});
async function search() {
  // Clear old records immediately; ignore stale responses from earlier searches.
  const sequence = ++searchSequence;
  const id = $("#search-form [name=client_id]").value;
  $("#manifest-table").replaceChildren();
  $("#search-client").textContent = `Searching Client ID ${id}…`;
  let r;
  try {
    r = await api(`/api/manifests?client=${encodeURIComponent(id)}`);
  } catch (error) {
    if (sequence !== searchSequence) return;
    $("#search-client").textContent =
      "No client records displayed. Check the Client ID and try again.";
    throw error;
  }
  if (sequence !== searchSequence) return;
  $("#search-client").textContent =
    `${r.client.first_name} ${r.client.last_name} · ${r.rows.length} deployment manifest(s). All timestamps UTC.`;
  $("#manifest-table").innerHTML = table(
    [
      "SERIAL / MECH",
      "SCHEDULED WINDOW",
      "GARAGES",
      "STATUS",
      "ESTIMATE / ACTUAL",
      "ACTUAL START / RETURN",
      "ACTIONS",
    ],
    r.rows.map((d) => [
      `#${d.serial_id}<br>${escapeHtml(d.model)}`,
      `${date(d.scheduled_start)}<br>${date(d.scheduled_end)}`,
      `${escapeHtml(d.departure_garage)}<br>→ ${escapeHtml(d.return_garage)}`,
      badge(d.status),
      `${money(d.estimated_cost)}<br>${money(d.actual_cost)}`,
      `${date(d.actual_start)}<br>${date(d.actual_return)}`,
      `<div class="row-actions">${(d.status === "Match Booked" ? ["start", "cancel"] : d.status === "Active in Arena" ? ["complete"] : []).map((action) => `<button class="quiet" data-action="${action}" data-serial="${d.serial_id}" ${action === "start" ? `data-start="${d.scheduled_start}" data-end="${d.scheduled_end}"` : ""}>${action[0].toUpperCase() + action.slice(1)}</button>`).join("")}</div>`,
    ]),
  );
  updateClock();
}
wireForm("#search-form", search);
$("#search-form [name=client_id]").addEventListener("input", () => {
  ++searchSequence;
  $("#manifest-table").replaceChildren();
  $("#search-client").textContent =
    "Click Search manifests to load this client.";
  $("#notice").hidden = true;
});
$("#manifest-table").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  b.disabled = true;
  b.dataset.busy = "true";
  try {
    await api("/api/manifest-action", {
      serial_id: b.dataset.serial,
      action: b.dataset.action,
    });
    await refresh();
    await search();
    notice(`Manifest #${b.dataset.serial}: ${b.dataset.action} successful.`);
  } catch (err) {
    notice(err.message, true);
    delete b.dataset.busy;
    b.disabled = false;
    updateClock();
  }
});
// Convenience defaults never bypass SQL eligibility or overlap validation.
function selectBookingMech(mechId) {
  const form = $("#booking-form");
  const mech = state.mechs.find((m) => m.mech_id === Number(mechId));
  if (!mech) return;
  form.elements.mech_id.value = String(mech.mech_id);
  form.elements.departure_garage_id.value = String(mech.garage_id);
  form.elements.return_garage_id.value = String(mech.garage_id);
  $("#booking-next").hidden = true;
  bookingContext();
  quote();
}
function bookingContext() {
  const mech = state.mechs?.find(
    (m) => m.mech_id === Number($("#booking-form [name=mech_id]").value),
  );
  if (!mech) return;
  const garage = state.garages.find((g) => g.garage_id === mech.garage_id);
  $("#booking-selection").textContent =
    `${mech.chassis_serial} · Currently at ${garage?.garage_name} · ${money(mech.daily_rate)} / day. ${mech.operational_status === "Available" ? "Ready now; your time window will be checked." : `Currently ${mech.operational_status.toLowerCase()}; booking will be blocked.`}`;
}
$("#booking-form [name=mech_id]").addEventListener("change", (e) =>
  selectBookingMech(e.target.value),
);
function fillWindow(delay) {
  const start = Date.now() + delay;
  $("#booking-form [name=scheduled_start]").value = new Date(start)
    .toISOString()
    .slice(0, 19);
  $("#booking-form [name=scheduled_end]").value = new Date(start + 7200000)
    .toISOString()
    .slice(0, 19);
  $("#booking-next").hidden = true;
  quote();
}
$("#quick-window").onclick = () => fillWindow(30000);
$("#tomorrow-window").onclick = () => fillWindow(86400000);
function quote() {
  const form = $("#booking-form"),
    m = state.mechs?.find(
      (m) => m.mech_id === Number(form.elements.mech_id.value),
    );
  const start = Date.parse(`${form.elements.scheduled_start.value}Z`),
    end = Date.parse(`${form.elements.scheduled_end.value}Z`);
  $("#quote").textContent =
    m && end > start
      ? money(Math.max(0.01, ((end - start) / 86400000) * Number(m.daily_rate)))
      : "Choose a valid window";
}
$("#booking-form").addEventListener("input", quote);
wireForm("#booking-form", async (data) => {
  const r = await api("/api/book", data);
  await refresh();
  notice(
    `Manifest #${r.rows[0].p_serial} booked. The requested window is now reserved.`,
  );
  $("#search-form [name=client_id]").value = data.client_id;
  $("#booking-next-text").textContent =
    `Manifest #${r.rows[0].p_serial} saved for Client ${data.client_id}.`;
  $("#booking-next").hidden = false;
});
$("#incident-form [name=issue_type]").addEventListener("change", () => {
  const routine = $("#incident-form [name=issue_type]").value === "Routine";
  document.querySelectorAll(".routine-field").forEach((label) => {
    label.hidden = !routine;
    label.querySelector("input").required = routine;
    if (!routine) label.querySelector("input").value = "";
  });
});
async function incidents() {
  const rows = await api(
    `/api/incidents?all=${$("#show-repaired").checked ? "1" : "0"}`,
  );
  incidentRows = rows;
  $("#incident-table").innerHTML = table(
    [
      "LOG / MECH",
      "TYPE",
      "REPORT / SERVICE WINDOW",
      "DESCRIPTION",
      "STATUS",
      "CHIEF / RESOLUTION",
      "ACTION",
    ],
    rows.map((l) => [
      `#${l.log_id} · ${escapeHtml(l.model)}`,
      badge(l.issue_type),
      `${date(l.reported_at)}${l.scheduled_start ? `<br>${date(l.scheduled_start)} → ${date(l.scheduled_end)}` : ""}`,
      `${escapeHtml(l.description)}<br><small>${escapeHtml(l.engineering_notes)}</small>`,
      badge(l.status),
      `${escapeHtml(l.chief_name || "Unassigned")}<br>${date(l.resolved_at)}`,
      l.status === "Repaired"
        ? "Closed"
        : `<button type="button" class="quiet" data-repair="${l.log_id}">Update repair</button>`,
    ]),
  );
}
function selectIncident(logId, focus = false) {
  const log = incidentRows.find((l) => l.log_id === Number(logId));
  if (!log || log.status === "Repaired") return;
  const form = $("#resolve-form");
  form.elements.log_id.value = log.log_id;
  form.elements.status.value =
    log.status === "Reported" ? "In-Progress" : log.status;
  const mech = state.mechs.find((m) => m.mech_id === log.mech_id);
  const chief =
    log.chief_id ||
    state.technicians.find((t) => t.garage_id === mech?.garage_id)?.staff_id;
  if (chief) form.elements.chief_id.value = String(chief);
  form.elements.engineering_notes.value = log.engineering_notes;
  form.querySelector("[type=submit]").disabled = false;
  $("#repair-context").textContent =
    `Incident #${log.log_id} · ${log.model} · ${log.issue_type} · ${log.status}`;
  if (focus) {
    form.scrollIntoView({ block: "center", behavior: "smooth" });
    form.elements.status.focus({ preventScroll: true });
  }
}
$("#incident-table").addEventListener("click", (e) => {
  const button = e.target.closest("[data-repair]");
  if (button) selectIncident(button.dataset.repair, true);
});
wireForm("#incident-form", async (data) => {
  const r = await api("/api/incident", data);
  await refresh();
  await incidents();
  selectIncident(r.rows[0].p_log);
  notice(
    `Incident #${r.rows[0].p_log} recorded.${data.issue_type === "Critical" ? " Mech automatically marked Unavailable." : ""}`,
  );
});
wireForm("#resolve-form", async (data) => {
  await api("/api/incident-action", data);
  await refresh();
  await incidents();
  if (data.status === "Repaired") {
    $("#resolve-form").reset();
    $("#repair-context").textContent =
      `Incident #${data.log_id} is repaired. Select another open incident to continue.`;
  } else selectIncident(data.log_id);
  notice(
    `Incident #${data.log_id} updated to ${data.status}. Fleet availability recalculated.`,
  );
});
$("#show-repaired").onchange = () =>
  incidents().catch((e) => notice(e.message, true));
$("#refresh-fleet").onclick = () =>
  refresh().catch((e) => notice(e.message, true));
async function evidence() {
  const data = await api("/api/evidence");
  $("#evidence-output").innerHTML = Object.entries(data)
    .map(
      ([key, value]) =>
        `<div class="evidence-block" id="evidence-${key}"><h3>${escapeHtml(key.toUpperCase())}</h3><pre>${escapeHtml(value.sql)}</pre>${table(
          Object.keys(value.rows[0] || {}),
          value.rows.map((r) => Object.values(r).map((v) => escapeHtml(v))),
        )}</div>`,
    )
    .join("");
}
$("#refresh-evidence").onclick = () =>
  evidence().catch((e) => notice(e.message, true));
function updateClock() {
  const now = new Date();
  $("#clock").textContent = `${date(now)} UTC`;
  $("#clock").dateTime = now.toISOString();
  document.querySelectorAll("[data-action=start]").forEach((button) => {
    if (button.dataset.busy) return;
    const start = Date.parse(button.dataset.start),
      end = Date.parse(button.dataset.end);
    button.disabled = now.getTime() < start || now.getTime() >= end;
    if (now.getTime() < start) {
      const seconds = Math.ceil((start - now.getTime()) / 1000);
      button.textContent =
        seconds < 3600
          ? `Start in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : "Scheduled";
      button.title = `Available to start at ${date(button.dataset.start)} UTC`;
    } else {
      button.textContent = now.getTime() >= end ? "Window ended" : "Start";
      button.title =
        now.getTime() >= end
          ? "Cancel this expired booking and create a new window."
          : "Start this deployment";
    }
  });
  if (!$("#resolve-form [name=log_id]").value)
    $("#resolve-form [type=submit]").disabled = true;
}
$("#fleet-form [name=assembly_year]").max = new Date().getUTCFullYear();
fillWindow(86400000);
updateClock();
setInterval(updateClock, 1000);
refresh().catch((e) => {
  $("#connection").textContent = "DATABASE ERROR";
  notice(e.message, true);
});
