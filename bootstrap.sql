-- Manual alternative to database.mjs. Run as a PostgreSQL administrator.
-- Replace this placeholder with a locally generated password before use.
-- The launcher generates unique local credentials automatically instead.
CREATE ROLE mechwar_app LOGIN PASSWORD 'REPLACE_WITH_LOCAL_RANDOM_PASSWORD';
CREATE DATABASE mechwar_x;
-- Reconnect to mechwar_x before executing schema.sql, then seed.sql.
-- In psql: \connect mechwar_x
-- The application uses the pg driver and parameterized queries.
