-- Elevate215 — Pennsylvania school data dictionary schema (Neon / Postgres)
-- One row per school building. Assessment, growth, enrollment, and EAPI fields
-- mirror the source dataset so CSV/Excel imports map column-for-column.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Schools
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- School Information
  aun TEXT NOT NULL,
  school_id TEXT NOT NULL,
  district_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  school_type TEXT NOT NULL
    CHECK (school_type IN ('District', 'Charter')),
  grade_span_2025_26 TEXT,
  pct_black_hispanic_2025_26 NUMERIC(5, 2)
    CHECK (pct_black_hispanic_2025_26 IS NULL OR (pct_black_hispanic_2025_26 >= 0 AND pct_black_hispanic_2025_26 <= 100)),
  pct_low_income_2025_26 NUMERIC(5, 2)
    CHECK (pct_low_income_2025_26 IS NULL OR (pct_low_income_2025_26 >= 0 AND pct_low_income_2025_26 <= 100)),
  excluded_selection_criteria TEXT,

  -- PSSA Reading Assessment Data (2025)
  pssa_reading_n_scored_2025 INTEGER
    CHECK (pssa_reading_n_scored_2025 IS NULL OR pssa_reading_n_scored_2025 >= 0),
  pssa_reading_pct_proficient_2025 NUMERIC(5, 2)
    CHECK (pssa_reading_pct_proficient_2025 IS NULL OR (pssa_reading_pct_proficient_2025 >= 0 AND pssa_reading_pct_proficient_2025 <= 100)),
  pssa_reading_predicted NUMERIC(5, 2),
  pssa_reading_residual NUMERIC(6, 2),
  pssa_reading_band TEXT,

  -- PSSA Math Assessment Data (2025)
  pssa_math_n_scored_2025 INTEGER
    CHECK (pssa_math_n_scored_2025 IS NULL OR pssa_math_n_scored_2025 >= 0),
  pssa_math_pct_proficient_2025 NUMERIC(5, 2)
    CHECK (pssa_math_pct_proficient_2025 IS NULL OR (pssa_math_pct_proficient_2025 >= 0 AND pssa_math_pct_proficient_2025 <= 100)),
  pssa_math_predicted NUMERIC(5, 2),
  pssa_math_residual NUMERIC(6, 2),
  pssa_math_band TEXT,

  -- Keystone Algebra I Assessment Data (2025)
  keystone_algebra_n_scored_2025 INTEGER
    CHECK (keystone_algebra_n_scored_2025 IS NULL OR keystone_algebra_n_scored_2025 >= 0),
  keystone_algebra_pct_proficient_2025 NUMERIC(5, 2)
    CHECK (keystone_algebra_pct_proficient_2025 IS NULL OR (keystone_algebra_pct_proficient_2025 >= 0 AND keystone_algebra_pct_proficient_2025 <= 100)),
  keystone_algebra_predicted NUMERIC(5, 2),
  keystone_algebra_residual NUMERIC(6, 2),
  keystone_algebra_band TEXT,

  -- Keystone Biology Assessment Data (2025)
  keystone_biology_n_scored_2025 INTEGER
    CHECK (keystone_biology_n_scored_2025 IS NULL OR keystone_biology_n_scored_2025 >= 0),
  keystone_biology_pct_proficient_2025 NUMERIC(5, 2)
    CHECK (keystone_biology_pct_proficient_2025 IS NULL OR (keystone_biology_pct_proficient_2025 >= 0 AND keystone_biology_pct_proficient_2025 <= 100)),
  keystone_biology_predicted NUMERIC(5, 2),
  keystone_biology_residual NUMERIC(6, 2),
  keystone_biology_band TEXT,

  -- Keystone Literature Assessment Data (2025)
  keystone_literature_n_scored_2025 INTEGER
    CHECK (keystone_literature_n_scored_2025 IS NULL OR keystone_literature_n_scored_2025 >= 0),
  keystone_literature_pct_proficient_2025 NUMERIC(5, 2)
    CHECK (keystone_literature_pct_proficient_2025 IS NULL OR (keystone_literature_pct_proficient_2025 >= 0 AND keystone_literature_pct_proficient_2025 <= 100)),
  keystone_literature_predicted NUMERIC(5, 2),
  keystone_literature_residual NUMERIC(6, 2),
  keystone_literature_band TEXT,

  -- Growth & Benchmark Indicators
  simple_avg_residual NUMERIC(6, 2),
  enrollment_weighted_avg_residual NUMERIC(6, 2),
  above_line_count INTEGER
    CHECK (above_line_count IS NULL OR above_line_count >= 0),
  within_5_count INTEGER
    CHECK (within_5_count IS NULL OR within_5_count >= 0),
  below_line_count INTEGER
    CHECK (below_line_count IS NULL OR below_line_count >= 0),
  tests_with_data INTEGER
    CHECK (tests_with_data IS NULL OR tests_with_data >= 0),

  -- Enrollment & Capacity Data (SY 2025-26)
  current_enrollment_2025_26 INTEGER
    CHECK (current_enrollment_2025_26 IS NULL OR current_enrollment_2025_26 >= 0),
  authorized_enrollment_cap_2025_26 INTEGER
    CHECK (authorized_enrollment_cap_2025_26 IS NULL OR authorized_enrollment_cap_2025_26 >= 0),
  unused_seats INTEGER,
  fill_tier TEXT,

  -- School Classification
  eapi_tier TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT schools_school_id_unique UNIQUE (school_id),
  CONSTRAINT schools_aun_school_id_unique UNIQUE (aun, school_id)
);

-- ---------------------------------------------------------------------------
-- Indexes for common filters / joins
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_schools_aun ON schools (aun);
CREATE INDEX IF NOT EXISTS idx_schools_district_name ON schools (district_name);
CREATE INDEX IF NOT EXISTS idx_schools_school_type ON schools (school_type);
CREATE INDEX IF NOT EXISTS idx_schools_eapi_tier ON schools (eapi_tier);
CREATE INDEX IF NOT EXISTS idx_schools_fill_tier ON schools (fill_tier);
CREATE INDEX IF NOT EXISTS idx_schools_excluded ON schools (excluded_selection_criteria)
  WHERE excluded_selection_criteria IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schools_set_updated_at ON schools;
CREATE TRIGGER schools_set_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Column comments (data dictionary)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE schools IS
  'Pennsylvania district and charter school information: identification, enrollment, demographics, PSSA/Keystone performance, growth metrics, benchmarks, and EAPI classification.';

COMMENT ON COLUMN schools.aun IS
  'Administrative Unit Number (AUN) assigned by PDE. Permanent statewide identifier for each school district or charter organization. Used when joining PA education datasets. Example: 126515001.';
COMMENT ON COLUMN schools.school_id IS
  'Unique identifier for an individual school building (not the district/charter org). Example: 7904 = Academy at Palumbo.';
COMMENT ON COLUMN schools.district_name IS
  'Name of the school district or charter organization operating the school. Example: Philadelphia City School District.';
COMMENT ON COLUMN schools.school_name IS
  'Official name of the school building. Example: Academy at Palumbo.';
COMMENT ON COLUMN schools.school_type IS
  'Governance model: District or Charter.';
COMMENT ON COLUMN schools.grade_span_2025_26 IS
  'Grade levels served in SY 2025–26. Examples: K-5, K-8, 6-8, 9-12, K-12. Informs which assessments apply.';
COMMENT ON COLUMN schools.pct_black_hispanic_2025_26 IS
  'Percentage of enrolled students identifying as Black or Hispanic (0–100). Used in equity and peer comparisons.';
COMMENT ON COLUMN schools.pct_low_income_2025_26 IS
  'Percentage of students identified as economically disadvantaged per PA criteria (0–100).';
COMMENT ON COLUMN schools.excluded_selection_criteria IS
  'Reason the school was excluded from an analysis/selection, if applicable. Blank/NULL if included.';

COMMENT ON COLUMN schools.pssa_reading_n_scored_2025 IS
  'PSSA Reading: number of students who completed the 2025 assessment.';
COMMENT ON COLUMN schools.pssa_reading_pct_proficient_2025 IS
  'PSSA Reading: percent Proficient or Advanced in 2025.';
COMMENT ON COLUMN schools.pssa_reading_predicted IS
  'PSSA Reading: expected proficiency from the demographic/benchmark model.';
COMMENT ON COLUMN schools.pssa_reading_residual IS
  'PSSA Reading: Actual − Predicted. Positive = above expectations.';
COMMENT ON COLUMN schools.pssa_reading_band IS
  'PSSA Reading: Above Benchmark / Within Benchmark / Below Benchmark (or equivalent).';

COMMENT ON COLUMN schools.pssa_math_n_scored_2025 IS
  'PSSA Math: number of students who completed the 2025 assessment.';
COMMENT ON COLUMN schools.pssa_math_pct_proficient_2025 IS
  'PSSA Math: percent Proficient or Advanced in 2025.';
COMMENT ON COLUMN schools.pssa_math_predicted IS
  'PSSA Math: expected proficiency from the benchmark model.';
COMMENT ON COLUMN schools.pssa_math_residual IS
  'PSSA Math: Actual − Predicted.';
COMMENT ON COLUMN schools.pssa_math_band IS
  'PSSA Math: performance category relative to prediction.';

COMMENT ON COLUMN schools.keystone_algebra_n_scored_2025 IS
  'Keystone Algebra I: number of students who completed the 2025 exam.';
COMMENT ON COLUMN schools.keystone_algebra_pct_proficient_2025 IS
  'Keystone Algebra I: percent Proficient or Advanced in 2025.';
COMMENT ON COLUMN schools.keystone_algebra_predicted IS
  'Keystone Algebra I: expected proficiency from comparison models.';
COMMENT ON COLUMN schools.keystone_algebra_residual IS
  'Keystone Algebra I: Actual − Predicted.';
COMMENT ON COLUMN schools.keystone_algebra_band IS
  'Keystone Algebra I: growth/benchmark classification.';

COMMENT ON COLUMN schools.keystone_biology_n_scored_2025 IS
  'Keystone Biology: number of students completing the 2025 assessment.';
COMMENT ON COLUMN schools.keystone_biology_pct_proficient_2025 IS
  'Keystone Biology: percent Proficient or Advanced.';
COMMENT ON COLUMN schools.keystone_biology_predicted IS
  'Keystone Biology: expected proficiency from the benchmark model.';
COMMENT ON COLUMN schools.keystone_biology_residual IS
  'Keystone Biology: Actual − Predicted.';
COMMENT ON COLUMN schools.keystone_biology_band IS
  'Keystone Biology: performance category based on residual.';

COMMENT ON COLUMN schools.keystone_literature_n_scored_2025 IS
  'Keystone Literature: number of students who completed the assessment.';
COMMENT ON COLUMN schools.keystone_literature_pct_proficient_2025 IS
  'Keystone Literature: percent Proficient or Advanced.';
COMMENT ON COLUMN schools.keystone_literature_predicted IS
  'Keystone Literature: expected proficiency from statewide comparison models.';
COMMENT ON COLUMN schools.keystone_literature_residual IS
  'Keystone Literature: Actual − Predicted.';
COMMENT ON COLUMN schools.keystone_literature_band IS
  'Keystone Literature: above / near / below expected levels.';

COMMENT ON COLUMN schools.simple_avg_residual IS
  'Unweighted average residual across every available assessment. Equal weight per test.';
COMMENT ON COLUMN schools.enrollment_weighted_avg_residual IS
  'Residual average weighted by N scored per assessment.';
COMMENT ON COLUMN schools.above_line_count IS
  'Count of assessments exceeding expected performance by more than 5 percentage points.';
COMMENT ON COLUMN schools.within_5_count IS
  'Count of assessments with residual within ±5 percentage points of expectation.';
COMMENT ON COLUMN schools.below_line_count IS
  'Count of assessments more than 5 percentage points below prediction.';
COMMENT ON COLUMN schools.tests_with_data IS
  'Total assessments with sufficient data for analysis.';

COMMENT ON COLUMN schools.current_enrollment_2025_26 IS
  'Students enrolled in SY 2025–26.';
COMMENT ON COLUMN schools.authorized_enrollment_cap_2025_26 IS
  'Maximum authorized enrollment (charter agreement). District schools may be NULL.';
COMMENT ON COLUMN schools.unused_seats IS
  'Authorized Enrollment Cap − Current Enrollment.';
COMMENT ON COLUMN schools.fill_tier IS
  'Utilization category, e.g. High (95–100%), Moderate (80–94%), Low (<80%).';

COMMENT ON COLUMN schools.eapi_tier IS
  'Equity Adjusted Performance Index tier from Simple Avg Residual — performance relative to demographic expectations.';
