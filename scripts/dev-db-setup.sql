-- Creates the local development database and its user.
--
-- Run once, as root, in MySQL Workbench (File → Open SQL Script, then the
-- lightning-bolt button) or from a terminal:
--
--   mysql -u root -p < scripts/dev-db-setup.sql
--
-- This is for your machine only. It is never run against the live database —
-- Hostinger's panel creates that one.

CREATE DATABASE IF NOT EXISTS leadcrm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Granted for BOTH 127.0.0.1 and localhost on purpose.
--
-- MySQL treats them as different accounts, and Node connects over TCP rather
-- than a socket — so "localhost" can arrive as 127.0.0.1 or as IPv6 ::1
-- depending on how the name resolves. A grant for only one of them produces
-- "Access denied" with a perfectly correct password, which is precisely what
-- cost a day of debugging on the live site.
CREATE USER IF NOT EXISTS 'leadcrm'@'127.0.0.1' IDENTIFIED BY 'leadcrm_dev_pw';
CREATE USER IF NOT EXISTS 'leadcrm'@'localhost' IDENTIFIED BY 'leadcrm_dev_pw';
CREATE USER IF NOT EXISTS 'leadcrm'@'::1'       IDENTIFIED BY 'leadcrm_dev_pw';

GRANT ALL PRIVILEGES ON leadcrm.* TO 'leadcrm'@'127.0.0.1';
GRANT ALL PRIVILEGES ON leadcrm.* TO 'leadcrm'@'localhost';
GRANT ALL PRIVILEGES ON leadcrm.* TO 'leadcrm'@'::1';

FLUSH PRIVILEGES;

-- The app creates its own tables on first start; nothing else is needed here.
SELECT 'leadcrm database ready' AS status;
