-- Fictional classroom data; all contacts use reserved example domains.
BEGIN;
SET search_path = arena, public;
INSERT INTO mech_type(type_name) VALUES
 ('Light Scout'),('Assault Brawler'),('Heavy Artillery'),('Juggernaut');
INSERT INTO battle_garage(garage_name,grid_address,dispatch_phone) VALUES
 ('Neo-Prime Central','Grid N-14 / Sector 07','555-0101'),
 ('Orion East','Grid E-22 / Sector 03','555-0102');
INSERT INTO pit_crew_technician(garage_id,full_name,phone,corporate_email) VALUES
 (1,'Alex Vega','555-0111','alex.vega@example.com'),
 (2,'Jordan Chen','555-0112','jordan.chen@example.com');
INSERT INTO client(first_name,last_name,corporate_address,phone,email,
 license_token,license_expiration) VALUES
 ('Nova','Reed','12 Arena Way','555-0121','nova@example.com','DEMO-NOVA',CURRENT_DATE+365),
 ('Kai','Stone','22 Circuit Road','555-0122','kai@example.com','DEMO-KAI',CURRENT_DATE+365),
 ('Expired','Pilot','30 Test Lane','555-0123','expired@example.com','DEMO-EXPIRED',CURRENT_DATE-1);
INSERT INTO mech(chassis_serial,manufacturer,model,assembly_year,armor_color,
 daily_rate,type_id,garage_id) VALUES
 ('NP-SCOUT-001','Astra Dynamics','Specter',2026,'Arctic white',2400,1,1),
 ('NP-BRAWLER-002','Titan Works','Ironclad',2025,'Crimson',4800,2,1),
 ('OR-HEAVY-003','Helix Industries','Longbow',2026,'Graphite',7200,3,2),
 ('OR-JUG-004','Titan Works','Atlas',2024,'Cobalt',9600,4,2);
CALL book_manifest(1,1,1,2,CURRENT_TIMESTAMP+interval '1 day',
 CURRENT_TIMESTAMP+interval '1 day 2 hours',NULL);
CALL report_incident(3,NULL,'Critical','Shield generator telemetry fault',
 2,NULL,NULL,NULL);
COMMIT;
