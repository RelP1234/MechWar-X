-- Read-only verification queries for the SQL implementation evidence.
SELECT version(), current_database(), current_user;
SELECT table_name FROM information_schema.tables
 WHERE table_schema='arena' AND table_type='BASE TABLE' ORDER BY table_name;
SELECT routine_name, routine_type FROM information_schema.routines
 WHERE routine_schema='arena' ORDER BY routine_type,routine_name;
SELECT tgname,relname FROM pg_trigger
 JOIN pg_class ON tgrelid=pg_class.oid
 JOIN pg_namespace ON relnamespace=pg_namespace.oid
 WHERE nspname='arena' AND NOT tgisinternal ORDER BY tgname;
SELECT mech_id,model,operational_status,combat_hours,garage_id
 FROM arena.mech ORDER BY mech_id;
SELECT serial_id,client_id,status,estimated_cost,actual_cost
 FROM arena.manifest_dashboard ORDER BY serial_id;
SELECT log_id,mech_id,issue_type,status,resolved_at
 FROM arena.maintenance_log ORDER BY log_id;
-- No results means there are no conflicting live reservation pairs.
SELECT a.serial_id,b.serial_id FROM arena.deployment_manifest a
 JOIN arena.deployment_manifest b ON a.mech_id=b.mech_id AND a.serial_id<b.serial_id
 WHERE a.status IN ('Match Booked','Active in Arena')
 AND b.status IN ('Match Booked','Active in Arena')
 AND a.scheduled_start<b.scheduled_end AND b.scheduled_start<a.scheduled_end;
