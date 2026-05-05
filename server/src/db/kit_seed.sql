-- Kit seed data generated from Kit_#047.xlsx
-- Run AFTER migrate.js has created the tables

SET FOREIGN_KEY_CHECKS=0;
DELETE FROM kit_items;
DELETE FROM kits;
DELETE FROM kit_stations;
SET FOREIGN_KEY_CHECKS=1;

INSERT INTO kit_stations (id, name) VALUES
;

INSERT INTO kits (id, station_id, kit_code, description, sort_order) VALUES
;


-- Update auto-increment counters
ALTER TABLE kit_stations AUTO_INCREMENT = 1;
ALTER TABLE kits AUTO_INCREMENT = 1;
ALTER TABLE kit_items AUTO_INCREMENT = 1;
