-- MechWar-X | PostgreSQL 17 | Execute inside database mechwar_x.
-- AI disclosure: OpenAI Codex (GPT-6) assisted with schema, routines,
-- GUI, tests and documentation, with instructor permission reported
-- by Merrel Payne. The group must review and understand all code.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA arena;
SET search_path = arena, public;

CREATE TABLE mech_type (
  type_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_name varchar(50) NOT NULL UNIQUE CHECK (btrim(type_name) <> '')
);
CREATE TABLE battle_garage (
  garage_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  garage_name varchar(80) NOT NULL CHECK (btrim(garage_name) <> ''),
  grid_address varchar(160) NOT NULL CHECK (btrim(grid_address) <> ''),
  dispatch_phone varchar(30) NOT NULL CHECK (btrim(dispatch_phone) <> '')
);
CREATE TABLE pit_crew_technician (
  staff_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  garage_id integer NOT NULL REFERENCES battle_garage
    ON UPDATE CASCADE ON DELETE RESTRICT,
  full_name varchar(100) NOT NULL CHECK (btrim(full_name) <> ''),
  phone varchar(30) NOT NULL CHECK (btrim(phone) <> ''),
  corporate_email varchar(160) NOT NULL UNIQUE
    CHECK (corporate_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
CREATE TABLE client (
  client_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(60) NOT NULL CHECK (btrim(first_name) <> ''),
  last_name varchar(60) NOT NULL CHECK (btrim(last_name) <> ''),
  corporate_address varchar(200) NOT NULL CHECK (btrim(corporate_address) <> ''),
  phone varchar(30) NOT NULL CHECK (btrim(phone) <> ''),
  email varchar(160) NOT NULL
    CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  license_token varchar(100) NOT NULL UNIQUE CHECK (btrim(license_token) <> ''),
  license_expiration date NOT NULL
);
CREATE TABLE mech (
  mech_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chassis_serial varchar(50) NOT NULL UNIQUE
    CHECK (chassis_serial ~ '^[A-Z0-9][A-Z0-9-]{2,49}$'),
  manufacturer varchar(80) NOT NULL CHECK (btrim(manufacturer) <> ''),
  model varchar(80) NOT NULL CHECK (btrim(model) <> ''),
  assembly_year smallint NOT NULL CHECK (assembly_year > 0),
  armor_color varchar(40) NOT NULL CHECK (btrim(armor_color) <> ''),
  daily_rate numeric(12,2) NOT NULL CHECK (daily_rate > 0),
  combat_hours numeric(16,6) NOT NULL DEFAULT 0 CHECK (combat_hours >= 0),
  type_id integer NOT NULL REFERENCES mech_type
    ON UPDATE CASCADE ON DELETE RESTRICT,
  garage_id integer NOT NULL REFERENCES battle_garage
    ON UPDATE CASCADE ON DELETE RESTRICT,
  operational_status varchar(20) NOT NULL DEFAULT 'Available'
    CHECK (operational_status IN ('Available','Deployed','Unavailable'))
);
CREATE TABLE deployment_manifest (
  serial_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id integer NOT NULL REFERENCES client
    ON UPDATE CASCADE ON DELETE RESTRICT,
  mech_id integer NOT NULL REFERENCES mech
    ON UPDATE CASCADE ON DELETE RESTRICT,
  departure_garage_id integer NOT NULL REFERENCES battle_garage
    ON UPDATE CASCADE ON DELETE RESTRICT,
  return_garage_id integer NOT NULL REFERENCES battle_garage
    ON UPDATE CASCADE ON DELETE RESTRICT,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  actual_start timestamptz,
  actual_return timestamptz,
  agreed_daily_rate numeric(12,2) NOT NULL CHECK (agreed_daily_rate > 0),
  status varchar(20) NOT NULL DEFAULT 'Match Booked'
    CHECK (status IN ('Match Booked','Active in Arena','Completed','Cancelled')),
  CHECK (scheduled_end > scheduled_start),
  CHECK (actual_return IS NULL OR actual_return > actual_start),
  CHECK (
    (status IN ('Match Booked','Cancelled') AND actual_start IS NULL
      AND actual_return IS NULL) OR
    (status = 'Active in Arena' AND actual_start IS NOT NULL
      AND actual_return IS NULL) OR
    (status = 'Completed' AND actual_start IS NOT NULL
      AND actual_return IS NOT NULL)
  ),
  CONSTRAINT no_overlapping_manifests EXCLUDE USING gist
    (mech_id WITH =,
     tstzrange(scheduled_start,scheduled_end,'[)') WITH &&)
    WHERE (status IN ('Match Booked','Active in Arena'))
);
CREATE UNIQUE INDEX one_active_manifest_per_mech
  ON deployment_manifest(mech_id) WHERE status = 'Active in Arena';
CREATE INDEX manifest_client_search ON deployment_manifest(client_id);

-- Separate accounting facts preserve a normalized operational table.
CREATE TABLE manifest_charge (
  serial_id integer PRIMARY KEY REFERENCES deployment_manifest
    ON UPDATE CASCADE ON DELETE RESTRICT,
  estimated_cost numeric(14,2) NOT NULL CHECK (estimated_cost > 0),
  actual_cost numeric(14,2) CHECK (actual_cost > 0)
);
CREATE TABLE maintenance_log (
  log_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  mech_id integer NOT NULL REFERENCES mech
    ON UPDATE CASCADE ON DELETE RESTRICT,
  reporting_client_id integer REFERENCES client
    ON UPDATE CASCADE ON DELETE RESTRICT,
  issue_type varchar(10) NOT NULL CHECK (issue_type IN ('Routine','Critical')),
  description text NOT NULL CHECK (btrim(description) <> ''),
  status varchar(20) NOT NULL DEFAULT 'Reported'
    CHECK (status IN ('Reported','In-Progress','Awaiting Parts','Repaired')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  resolved_at timestamptz,
  chief_id integer REFERENCES pit_crew_technician(staff_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  engineering_notes text NOT NULL DEFAULT '',
  CHECK ((issue_type = 'Routine' AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
    AND scheduled_end > scheduled_start) OR
    (issue_type = 'Critical' AND scheduled_start IS NULL AND scheduled_end IS NULL)),
  CHECK ((status = 'Repaired' AND resolved_at IS NOT NULL
    AND resolved_at >= reported_at AND chief_id IS NOT NULL
    AND btrim(engineering_notes) <> '') OR
    (status <> 'Repaired' AND resolved_at IS NULL)),
  CHECK (status = 'Reported' OR chief_id IS NOT NULL)
);
CREATE INDEX maintenance_open_mech ON maintenance_log(mech_id)
  WHERE status <> 'Repaired';
ALTER TABLE maintenance_log ADD CONSTRAINT maintenance_routine_end_required
  CHECK (issue_type <> 'Routine' OR scheduled_end IS NOT NULL);

-- B: one authoritative availability recomputation, including safeguards.
CREATE PROCEDURE sync_mech_status(p_mech integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
BEGIN
  PERFORM 1 FROM mech WHERE mech_id = p_mech FOR UPDATE;
  UPDATE mech SET operational_status = CASE
    WHEN EXISTS (SELECT 1 FROM maintenance_log WHERE mech_id = p_mech
      AND status <> 'Repaired' AND (issue_type = 'Critical'
        OR status IN ('In-Progress','Awaiting Parts'))) THEN 'Unavailable'
    WHEN EXISTS (SELECT 1 FROM deployment_manifest WHERE mech_id = p_mech
      AND status = 'Active in Arena') THEN 'Deployed'
    ELSE 'Available' END WHERE mech_id = p_mech;
END $$;

-- C: invoked automatically by the maintenance trigger for critical logs.
CREATE PROCEDURE emergency_asset_lock(p_mech integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
BEGIN
  PERFORM 1 FROM mech WHERE mech_id = p_mech FOR UPDATE;
  UPDATE mech SET operational_status = 'Unavailable' WHERE mech_id = p_mech;
END $$;

-- Guards also protect owner-issued direct SQL; GUI writes use procedures.
CREATE FUNCTION guard_manifest() RETURNS trigger
LANGUAGE plpgsql SET search_path = arena, pg_temp AS $$
DECLARE m mech; c client;
BEGIN
  SELECT * INTO STRICT m FROM mech WHERE mech_id = NEW.mech_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Match Booked' THEN
      RAISE EXCEPTION 'New manifests must start as Match Booked';
    END IF;
    IF NEW.scheduled_start < clock_timestamp() THEN
      RAISE EXCEPTION 'Choose a future match window';
    END IF;
    IF m.operational_status <> 'Available' THEN
      RAISE EXCEPTION 'Mech is unavailable or already deployed';
    END IF;
    SELECT * INTO STRICT c FROM client WHERE client_id = NEW.client_id;
    IF c.license_expiration < (NEW.scheduled_end AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'Pilot license expires before the requested return';
    END IF;
    IF EXISTS (SELECT 1 FROM maintenance_log WHERE mech_id = NEW.mech_id
      AND status <> 'Repaired' AND (issue_type = 'Critical' OR
        (scheduled_start < NEW.scheduled_end AND scheduled_end > NEW.scheduled_start))) THEN
      RAISE EXCEPTION 'Requested window conflicts with maintenance';
    END IF;
  ELSE
    IF (NEW.client_id,NEW.mech_id,NEW.departure_garage_id,NEW.return_garage_id,
        NEW.scheduled_start,NEW.scheduled_end,NEW.agreed_daily_rate)
      IS DISTINCT FROM
       (OLD.client_id,OLD.mech_id,OLD.departure_garage_id,OLD.return_garage_id,
        OLD.scheduled_start,OLD.scheduled_end,OLD.agreed_daily_rate) THEN
      RAISE EXCEPTION 'Contract details are immutable; cancel and rebook';
    END IF;
    IF NOT ((OLD.status = 'Match Booked' AND NEW.status IN ('Active in Arena','Cancelled'))
       OR (OLD.status = 'Active in Arena' AND NEW.status = 'Completed')) THEN
      RAISE EXCEPTION 'Invalid or repeated manifest status transition';
    END IF;
    IF NEW.status = 'Active in Arena' THEN
      IF m.operational_status <> 'Available' THEN
        RAISE EXCEPTION 'Mech cannot deploy until available';
      END IF;
      IF m.garage_id <> NEW.departure_garage_id THEN
        RAISE EXCEPTION 'Mech is not at the booked departure garage';
      END IF;
      IF NEW.actual_start < NEW.scheduled_start OR
         NEW.actual_start >= NEW.scheduled_end OR
         NEW.actual_start > clock_timestamp() THEN
        RAISE EXCEPTION 'Deployment must start within its scheduled window';
      END IF;
      IF EXISTS (SELECT 1 FROM maintenance_log WHERE mech_id = NEW.mech_id
        AND status <> 'Repaired' AND issue_type = 'Routine'
        AND scheduled_start <= clock_timestamp()) THEN
        RAISE EXCEPTION 'Overdue routine maintenance must be resolved first';
      END IF;
      IF EXISTS (SELECT 1 FROM client WHERE client_id = NEW.client_id
        AND license_expiration < (clock_timestamp() AT TIME ZONE 'UTC')::date) THEN
        RAISE EXCEPTION 'Pilot license has expired';
      END IF;
    ELSIF NEW.status = 'Completed' THEN
      IF NEW.actual_start IS DISTINCT FROM OLD.actual_start OR
        NEW.actual_return > clock_timestamp() THEN
        RAISE EXCEPTION 'Invalid actual timestamps';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manifest_guard BEFORE INSERT OR UPDATE ON deployment_manifest
  FOR EACH ROW EXECUTE FUNCTION guard_manifest();

-- A: serialized per-mech check plus an exclusion constraint as a backstop.
CREATE PROCEDURE book_manifest(
  p_client integer, p_mech integer, p_departure integer, p_return integer,
  p_start timestamptz, p_end timestamptz, INOUT p_serial integer DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, public, pg_temp AS $$
DECLARE v_rate numeric;
BEGIN
  SELECT daily_rate INTO STRICT v_rate FROM mech WHERE mech_id = p_mech FOR UPDATE;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Return must be after deployment';
  END IF;
  IF EXISTS (SELECT 1 FROM deployment_manifest WHERE mech_id = p_mech
    AND status IN ('Match Booked','Active in Arena')
    AND scheduled_start < p_end AND scheduled_end > p_start) THEN
    RAISE EXCEPTION 'Booking rejected: this mech has an overlapping reservation';
  END IF;
  INSERT INTO deployment_manifest(client_id,mech_id,departure_garage_id,
    return_garage_id,scheduled_start,scheduled_end,agreed_daily_rate)
  VALUES (p_client,p_mech,p_departure,p_return,p_start,p_end,v_rate)
  RETURNING serial_id INTO p_serial;
  INSERT INTO manifest_charge(serial_id,estimated_cost)
  VALUES (p_serial,greatest(0.01,round(v_rate * extract(epoch FROM (p_end-p_start))/86400,2)));
END $$;

CREATE FUNCTION after_manifest_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
BEGIN
  IF NEW.status = 'Completed' THEN
    UPDATE mech SET combat_hours = combat_hours +
      extract(epoch FROM (NEW.actual_return-NEW.actual_start))/3600,
      garage_id = NEW.return_garage_id WHERE mech_id = NEW.mech_id;
    UPDATE manifest_charge SET actual_cost = greatest(0.01,round(
      NEW.agreed_daily_rate * extract(epoch FROM (NEW.actual_return-NEW.actual_start))/86400,2))
      WHERE serial_id = NEW.serial_id;
  END IF;
  -- Automatic B execution on cancellation; retains legitimate repair locks.
  CALL sync_mech_status(NEW.mech_id);
  RETURN NEW;
END $$;
CREATE TRIGGER manifest_status_sync AFTER UPDATE ON deployment_manifest
  FOR EACH ROW EXECUTE FUNCTION after_manifest_change();

CREATE PROCEDURE change_manifest(p_serial integer, p_action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
DECLARE v_mech integer;
BEGIN
  SELECT mech_id INTO STRICT v_mech FROM deployment_manifest WHERE serial_id = p_serial;
  PERFORM 1 FROM mech WHERE mech_id = v_mech FOR UPDATE;
  IF p_action = 'cancel' THEN
    UPDATE deployment_manifest SET status = 'Cancelled' WHERE serial_id = p_serial;
  ELSIF p_action = 'start' THEN
    UPDATE deployment_manifest SET status = 'Active in Arena',
      actual_start = clock_timestamp() WHERE serial_id = p_serial;
  ELSIF p_action = 'complete' THEN
    UPDATE deployment_manifest SET status = 'Completed',
      actual_return = clock_timestamp() WHERE serial_id = p_serial;
  ELSE RAISE EXCEPTION 'Unknown manifest action'; END IF;
END $$;

CREATE FUNCTION guard_maintenance() RETURNS trigger
LANGUAGE plpgsql SET search_path = arena, pg_temp AS $$
BEGIN
  PERFORM 1 FROM mech WHERE mech_id = NEW.mech_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Reported' THEN RAISE EXCEPTION 'New incidents must be Reported'; END IF;
    IF NEW.issue_type = 'Routine' THEN
      IF NEW.scheduled_start < clock_timestamp() THEN
        RAISE EXCEPTION 'Routine servicing needs a future window';
      END IF;
      IF EXISTS (SELECT 1 FROM deployment_manifest WHERE mech_id = NEW.mech_id
        AND (status = 'Active in Arena' OR (status = 'Match Booked'
          AND scheduled_start < NEW.scheduled_end AND scheduled_end > NEW.scheduled_start)))
        OR EXISTS (SELECT 1 FROM maintenance_log WHERE mech_id = NEW.mech_id
          AND status <> 'Repaired' AND issue_type = 'Routine'
          AND scheduled_start < NEW.scheduled_end AND scheduled_end > NEW.scheduled_start) THEN
        RAISE EXCEPTION 'Routine service overlaps a booking or another service';
      END IF;
    END IF;
  ELSE
    IF (NEW.mech_id,NEW.reporting_client_id,NEW.issue_type,NEW.description,
        NEW.reported_at,NEW.scheduled_start,NEW.scheduled_end)
       IS DISTINCT FROM (OLD.mech_id,OLD.reporting_client_id,OLD.issue_type,
        OLD.description,OLD.reported_at,OLD.scheduled_start,OLD.scheduled_end) THEN
      RAISE EXCEPTION 'Incident audit facts are immutable';
    END IF;
    IF OLD.status = 'Repaired' THEN RAISE EXCEPTION 'Repaired incidents are immutable'; END IF;
    IF NEW.issue_type = 'Routine' AND NEW.status IN ('In-Progress','Awaiting Parts') THEN
      IF clock_timestamp() < NEW.scheduled_start THEN
        RAISE EXCEPTION 'Routine servicing cannot begin before its reserved window';
      END IF;
      IF EXISTS (SELECT 1 FROM deployment_manifest WHERE mech_id = NEW.mech_id
        AND status = 'Active in Arena') THEN
        RAISE EXCEPTION 'Return the deployed mech before starting routine work';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_guard BEFORE INSERT OR UPDATE ON maintenance_log
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance();

CREATE FUNCTION after_maintenance_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
BEGIN
  IF NEW.issue_type = 'Critical' AND NEW.status <> 'Repaired' THEN
    CALL emergency_asset_lock(NEW.mech_id);
  ELSE CALL sync_mech_status(NEW.mech_id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_status_sync AFTER INSERT OR UPDATE ON maintenance_log
  FOR EACH ROW EXECUTE FUNCTION after_maintenance_change();

CREATE PROCEDURE report_incident(p_mech integer,p_client integer,p_type text,
  p_description text,p_chief integer,p_start timestamptz,p_end timestamptz,
  INOUT p_log integer DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
BEGIN
  PERFORM 1 FROM mech WHERE mech_id = p_mech FOR UPDATE;
  INSERT INTO maintenance_log(mech_id,reporting_client_id,issue_type,
    description,chief_id,scheduled_start,scheduled_end)
  VALUES (p_mech,p_client,p_type,p_description,p_chief,p_start,p_end)
  RETURNING log_id INTO p_log;
END $$;
CREATE PROCEDURE update_incident(p_log integer,p_status text,p_chief integer,p_notes text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = arena, pg_temp AS $$
DECLARE v_mech integer;
BEGIN
  SELECT mech_id INTO STRICT v_mech FROM maintenance_log WHERE log_id = p_log;
  PERFORM 1 FROM mech WHERE mech_id = v_mech FOR UPDATE;
  UPDATE maintenance_log SET status = p_status,chief_id = p_chief,
    engineering_notes = p_notes,
    resolved_at = CASE WHEN p_status = 'Repaired' THEN clock_timestamp() ELSE NULL END
    WHERE log_id = p_log;
END $$;

CREATE VIEW manifest_dashboard AS
SELECT d.*,c.estimated_cost,c.actual_cost,m.chassis_serial,m.model,
  bg.garage_name AS departure_garage,rg.garage_name AS return_garage
FROM deployment_manifest d JOIN manifest_charge c USING(serial_id)
JOIN mech m USING(mech_id)
JOIN battle_garage bg ON bg.garage_id = d.departure_garage_id
JOIN battle_garage rg ON rg.garage_id = d.return_garage_id;
CREATE VIEW garage_contacts AS
SELECT g.garage_id,g.garage_name,g.grid_address,g.dispatch_phone,
  t.staff_id,t.full_name,t.phone,t.corporate_email
FROM battle_garage g LEFT JOIN pit_crew_technician t USING(garage_id);

-- Runtime role gets SELECT, limited registration INSERT, and procedures.
-- Bootstrap creates mechwar_app before running this script.
REVOKE ALL ON SCHEMA arena FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA arena FROM PUBLIC;
GRANT USAGE ON SCHEMA arena TO mechwar_app;
GRANT SELECT ON ALL TABLES IN SCHEMA arena TO mechwar_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA arena TO mechwar_app;
GRANT INSERT(chassis_serial,manufacturer,model,assembly_year,armor_color,
  daily_rate,type_id,garage_id) ON mech TO mechwar_app;
GRANT EXECUTE ON PROCEDURE book_manifest(integer,integer,integer,integer,
  timestamptz,timestamptz,integer) TO mechwar_app;
GRANT EXECUTE ON PROCEDURE change_manifest(integer,text) TO mechwar_app;
GRANT EXECUTE ON PROCEDURE report_incident(integer,integer,text,text,
  integer,timestamptz,timestamptz,integer) TO mechwar_app;
GRANT EXECUTE ON PROCEDURE update_incident(integer,text,integer,text) TO mechwar_app;
COMMIT;
