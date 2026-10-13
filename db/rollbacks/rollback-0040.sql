DROP TABLE IF EXISTS contact_nicknames;
DROP FUNCTION IF EXISTS contact_people(uuid);
DELETE FROM schema_migrations WHERE name='0040_contact_nicknames.sql';
