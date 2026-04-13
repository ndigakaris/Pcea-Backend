-- ============================================================
--  PCEA Church Registry — Supabase/PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------
-- MEMBERS table
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Personal
  first_name      TEXT NOT NULL,
  middle_name     TEXT,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE,
  gender          TEXT CHECK (gender IN ('Male', 'Female')),
  marital_status  TEXT CHECK (marital_status IN ('Single','Married','Widowed','Divorced')),

  -- Contact
  phone           TEXT,
  email           TEXT,
  location        TEXT,

  -- Church
  district        TEXT NOT NULL,
  congregation    TEXT NOT NULL,
  session_name    TEXT,
  church_role     TEXT,
  date_joined     DATE,
  member_type     TEXT CHECK (member_type IN (
                    'Communicant Member','Baptised Member','Adherent','Associate Member'
                  )),

  -- Family
  family_unit     TEXT,
  family_role     TEXT,

  -- Groups (up to 3)
  group_primary   TEXT,
  group_secondary TEXT,
  group_other     TEXT,

  -- Admin
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Auto-update updated_at on row change
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Indexes for common queries
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_last_name   ON members (last_name);
CREATE INDEX IF NOT EXISTS idx_members_district    ON members (district);
CREATE INDEX IF NOT EXISTS idx_members_family_unit ON members (family_unit);
CREATE INDEX IF NOT EXISTS idx_members_active      ON members (is_active);

-- -------------------------------------------------------
-- Row Level Security (optional but recommended)
-- Enable if you add Supabase Auth later
-- -------------------------------------------------------
-- ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for now" ON members FOR ALL USING (true);

-- -------------------------------------------------------
-- Useful views
-- -------------------------------------------------------
CREATE OR REPLACE VIEW family_summary AS
  SELECT
    family_unit,
    COUNT(*) AS member_count,
    STRING_AGG(first_name || ' ' || last_name, ', ' ORDER BY first_name) AS members_list,
    MAX(district) AS district
  FROM members
  WHERE family_unit IS NOT NULL AND family_unit <> '' AND is_active = TRUE
  GROUP BY family_unit
  ORDER BY family_unit;

CREATE OR REPLACE VIEW group_summary AS
  SELECT group_name, COUNT(*) AS member_count
  FROM (
    SELECT group_primary AS group_name FROM members WHERE group_primary IS NOT NULL AND group_primary <> '' AND is_active = TRUE
    UNION ALL
    SELECT group_secondary FROM members WHERE group_secondary IS NOT NULL AND group_secondary <> '' AND is_active = TRUE
    UNION ALL
    SELECT group_other FROM members WHERE group_other IS NOT NULL AND group_other <> '' AND is_active = TRUE
  ) g
  GROUP BY group_name
  ORDER BY member_count DESC;

CREATE OR REPLACE VIEW district_summary AS
  SELECT district, COUNT(*) AS member_count
  FROM members
  WHERE is_active = TRUE
  GROUP BY district
  ORDER BY member_count DESC;

-- -------------------------------------------------------
-- Sample data (optional — remove in production)
-- -------------------------------------------------------
INSERT INTO members (first_name, middle_name, last_name, gender, district, congregation, church_role, member_type, family_unit, family_role, group_primary)
VALUES
  ('James', 'Kamau', 'Mwangi', 'Male', 'Limuru District', 'St. Andrew''s PCEA', 'Elder (Mzee)', 'Communicant Member', 'Mwangi Family', 'Head of Household', 'Men''s Fellowship (Wanaume)'),
  ('Grace', 'Wanjiru', 'Mwangi', 'Female', 'Limuru District', 'St. Andrew''s PCEA', 'Member', 'Communicant Member', 'Mwangi Family', 'Spouse', 'Mothers'' Union (Wamama wa Kanisa)'),
  ('Peter', 'Njoroge', 'Kariuki', 'Male', 'Githunguri District', 'PCEA Githunguri', 'Deacon (Shemasi)', 'Communicant Member', 'Kariuki Family', 'Head of Household', 'Prayer Group'),
  ('Mary', 'Nyambura', 'Gitau', 'Female', 'Nairobi District', 'St. Andrew''s Nairobi', 'Member', 'Communicant Member', 'Gitau Family', 'Spouse', 'Women''s Guild');
