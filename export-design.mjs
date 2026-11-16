// Export the actual physical schema to a Graphviz ERD and metadata file.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";
import { config, root } from "./database.mjs";
const require = createRequire(import.meta.url);
const { instance } = require(process.env.GRAPHVIZ_PATH || "@viz-js/viz");
const db = new pg.Client(config);
await db.connect();
const columns = (
  await db.query(`SELECT table_name,column_name,data_type,
 character_maximum_length,numeric_precision,numeric_scale,is_nullable,column_default,is_identity
 FROM information_schema.columns WHERE table_schema='arena'
 AND table_name IN (SELECT table_name FROM information_schema.tables
 WHERE table_schema='arena' AND table_type='BASE TABLE') ORDER BY table_name,ordinal_position`)
).rows;
const keys = (
  await db.query(`SELECT tc.table_name,tc.constraint_type,kcu.column_name,
 tc.constraint_name FROM information_schema.table_constraints tc
 JOIN information_schema.key_column_usage kcu
 ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
 WHERE tc.table_schema='arena'`)
).rows;
const relationships = (
  await db.query(`SELECT tc.table_name AS child,kcu.column_name AS child_column,
 ccu.table_name AS parent,ccu.column_name AS parent_column,c.is_nullable,
 rc.update_rule,rc.delete_rule FROM information_schema.table_constraints tc
 JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
 AND tc.constraint_schema=kcu.constraint_schema
 JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
 AND tc.constraint_schema=rc.constraint_schema
 JOIN information_schema.constraint_column_usage ccu
 ON rc.unique_constraint_name=ccu.constraint_name AND rc.unique_constraint_schema=ccu.constraint_schema
 JOIN information_schema.columns c ON c.table_schema=tc.table_schema
 AND c.table_name=tc.table_name AND c.column_name=kcu.column_name
 WHERE tc.table_schema='arena' AND tc.constraint_type='FOREIGN KEY'
 ORDER BY parent,child,child_column`)
).rows;
const routines = (
  await db.query(
    "SELECT proname,prokind FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid WHERE nspname='arena' ORDER BY proname",
  )
).rows;
await db.end();
const out = path.resolve(root, "../evidence");
await fs.writeFile(
  path.join(out, "schema-metadata.json"),
  JSON.stringify({ columns, keys, relationships, routines }, null, 2),
);
function type(c) {
  if (c.data_type === "character varying")
    return `varchar(${c.character_maximum_length})`;
  if (c.data_type === "numeric")
    return `numeric(${c.numeric_precision},${c.numeric_scale})`;
  if (c.data_type === "timestamp with time zone") return "timestamptz";
  return c.data_type;
}
let dot = `digraph ERD {
 graph [rankdir=LR,splines=polyline,nodesep=0.65,ranksep=1.2,bgcolor="white",pad=0.35];
 node [shape=plain,fontname="Arial",fontsize=11];
 edge [fontname="Arial",fontsize=10,color="#557486",fontcolor="#294356",penwidth=1.2,arrowsize=0.7];
`;
for (const table of [...new Set(columns.map((c) => c.table_name))]) {
  dot += `${table} [label=<<TABLE BORDER="1" COLOR="#a2b5bf" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5">
 <TR><TD COLSPAN="3" BGCOLOR="#173b45"><FONT COLOR="white"><B>${table}</B></FONT></TD></TR>`;
  for (const c of columns.filter((c) => c.table_name === table)) {
    const tags = keys
      .filter((k) => k.table_name === table && k.column_name === c.column_name)
      .map(
        (k) =>
          ({ "PRIMARY KEY": "PK", "FOREIGN KEY": "FK", UNIQUE: "UQ" })[
            k.constraint_type
          ],
      )
      .filter(Boolean);
    dot += `<TR><TD ALIGN="LEFT" PORT="L_${c.column_name}"><FONT COLOR="#22705b">${tags.join(",") || " "}</FONT></TD><TD ALIGN="LEFT">${c.column_name}${c.is_nullable === "YES" ? " ?" : ""}</TD><TD ALIGN="LEFT" PORT="R_${c.column_name}"><FONT COLOR="#526674">${type(c)}${c.is_identity === "YES" ? " ID" : ""}</FONT></TD></TR>`;
  }
  dot += "</TABLE>>];\n";
}
for (const r of relationships) {
  const isCharge = r.child === "manifest_charge";
  dot += `${r.parent}:R_${r.parent_column}:e -> ${r.child}:L_${r.child_column}:w [dir=both,arrowtail=${r.is_nullable === "YES" ? "odottee" : "teetee"},arrowhead=${isCharge ? "odottee" : "crowodot"},label="${r.is_nullable === "YES" ? "0..1" : "1"} : ${isCharge ? "0..1" : "0..N"}"];\n`;
}
dot += "}";
await fs.writeFile(path.join(out, "MechWar-X.dot"), dot);
const viz = await instance();
await fs.writeFile(
  path.join(out, "MechWar-X-ERD.svg"),
  viz.renderString(dot, { format: "svg" }),
);
console.log(
  `${columns.length} columns; ${relationships.length} foreign-key relationships; Graphviz ERD exported.`,
);
