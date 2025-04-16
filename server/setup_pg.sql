-- Create the user 'autonotes' with password
CREATE USER autonotes WITH PASSWORD 'idinfu48947fgdkfjrughhdbdu4';

-- Create the database
CREATE DATABASE autonotes;

-- Grant all privileges on the database to the user
GRANT ALL PRIVILEGES ON DATABASE autonotes TO autonotes;

-- Connect to the database and grant schema privileges
\c autonotes
GRANT ALL PRIVILEGES ON SCHEMA public TO autonotes;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO autonotes;