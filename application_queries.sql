-- Application SQL, executed using the pg API with bound parameters.
-- $1, $2, etc. are parameters, not text interpolated into SQL.
-- DDL/bootstrap SQL is listed separately. Test queries are in test.mjs.
SET search_path = arena, public;
SELECT * FROM mech ORDER BY mech_id;
SELECT * FROM mech_type ORDER BY type_id;
SELECT * FROM battle_garage ORDER BY garage_id;
SELECT staff_id,full_name,garage_id FROM pit_crew_technician ORDER BY staff_id;
SELECT client_id,first_name,last_name,license_expiration FROM client ORDER BY client_id;
SELECT * FROM garage_contacts ORDER BY garage_id,staff_id;
SELECT first_name,last_name FROM client WHERE client_id=$1;
SELECT * FROM manifest_dashboard WHERE client_id=$1 ORDER BY serial_id DESC;
SELECT l.*,m.model,t.full_name AS chief_name
 FROM maintenance_log l JOIN mech m USING(mech_id)
 LEFT JOIN pit_crew_technician t ON t.staff_id=l.chief_id
 WHERE l.status <> 'Repaired' ORDER BY l.log_id DESC;
-- Include repaired selects the same query without its WHERE clause.
SELECT l.*,m.model,t.full_name AS chief_name
 FROM maintenance_log l JOIN mech m USING(mech_id)
 LEFT JOIN pit_crew_technician t ON t.staff_id=l.chief_id ORDER BY l.log_id DESC;
INSERT INTO mech(chassis_serial,manufacturer,model,assembly_year,
 armor_color,daily_rate,type_id,garage_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING mech_id;
CALL book_manifest($1,$2,$3,$4,$5,$6,NULL);
CALL change_manifest($1,$2);
CALL report_incident($1,$2,$3,$4,$5,$6,$7,NULL);
CALL update_incident($1,$2,$3,$4);
SELECT version(),current_database(),current_user;
SELECT table_name FROM information_schema.tables WHERE table_schema='arena'
 AND table_type='BASE TABLE' ORDER BY table_name;
SELECT proname AS routine_name,
 CASE prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type
 FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid
 WHERE nspname='arena' ORDER BY routine_type,routine_name;
SELECT tgname AS trigger_name,relname AS table_name FROM pg_trigger
 JOIN pg_class ON tgrelid=pg_class.oid
 JOIN pg_namespace ON relnamespace=pg_namespace.oid
 WHERE nspname='arena' AND NOT tgisinternal ORDER BY tgname;
SELECT conname AS constraint_name,contype AS type FROM pg_constraint
 JOIN pg_namespace ON connamespace=pg_namespace.oid
 WHERE nspname='arena' ORDER BY conname;
SELECT mech_id,model,operational_status,combat_hours,garage_id FROM mech ORDER BY mech_id;
SELECT serial_id,client_id,status,estimated_cost,actual_cost
 FROM manifest_dashboard ORDER BY serial_id;
-- Bootstrap existence checks, executed by the administrator connection:
SELECT 1 FROM pg_database WHERE datname='mechwar_x';
SELECT 1 FROM pg_roles WHERE rolname='mechwar_app';
SELECT 1 FROM pg_namespace WHERE nspname='arena';
