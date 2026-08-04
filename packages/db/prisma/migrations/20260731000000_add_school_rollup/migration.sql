-- Adds the SchoolRollup model — PHL School Performance Model, "School Rollup"
-- tab only (301 rows, one per school). Wide/denormalized by design.
-- See docs/data-sources/school-rollup-dictionary.md for field definitions.
--
-- Column names are snake_case, matching this repo's Postgres naming
-- convention (not exact source-header casing, per explicit direction — see
-- schema.prisma's field-level comments for the source header each column
-- traces back to).
--
-- "aun" is read from the source sheet's first column (index 0) by position,
-- not by header lookup — that column's actual header is malformed (" f").

-- CreateTable
CREATE TABLE "school_rollup" (
    "id" TEXT NOT NULL,
    "aun" TEXT NOT NULL,
    "school_number" TEXT NOT NULL,
    "district_name" TEXT NOT NULL,
    "school_name" TEXT NOT NULL,
    "school_type" TEXT NOT NULL,
    "grade_span_2025_26" TEXT,
    "pct_black_hispanic_2025_26" DECIMAL(5,2),
    "pct_low_income_2025_26" DECIMAL(5,2),
    "excluded_selection_criteria" BOOLEAN NOT NULL,
    "pssa_reading_n_scored_2025" INTEGER,
    "pssa_reading_pct_proficient_2025" DECIMAL(5,2),
    "pssa_reading_predicted" DECIMAL(5,2),
    "pssa_reading_residual" DECIMAL(5,2),
    "pssa_reading_band" TEXT,
    "pssa_math_n_scored_2025" INTEGER,
    "pssa_math_pct_proficient_2025" DECIMAL(5,2),
    "pssa_math_predicted" DECIMAL(5,2),
    "pssa_math_residual" DECIMAL(5,2),
    "pssa_math_band" TEXT,
    "keystone_algebra_i_n_scored_2025" INTEGER,
    "keystone_algebra_i_pct_proficient_2025" DECIMAL(5,2),
    "keystone_algebra_i_predicted" DECIMAL(5,2),
    "keystone_algebra_i_residual" DECIMAL(5,2),
    "keystone_algebra_i_band" TEXT,
    "keystone_biology_n_scored_2025" INTEGER,
    "keystone_biology_pct_proficient_2025" DECIMAL(5,2),
    "keystone_biology_predicted" DECIMAL(5,2),
    "keystone_biology_residual" DECIMAL(5,2),
    "keystone_biology_band" TEXT,
    "keystone_literature_n_scored_2025" INTEGER,
    "keystone_literature_pct_proficient_2025" DECIMAL(5,2),
    "keystone_literature_predicted" DECIMAL(5,2),
    "keystone_literature_residual" DECIMAL(5,2),
    "keystone_literature_band" TEXT,
    "simple_avg_residual" DECIMAL(5,2),
    "enrollment_weighted_avg_residual" DECIMAL(5,2),
    "above_line_count" INTEGER NOT NULL,
    "within_5_count" INTEGER NOT NULL,
    "below_line_count" INTEGER NOT NULL,
    "tests_with_data" INTEGER NOT NULL,
    "current_enrollment_sy_2025_26" INTEGER,
    "authorized_enrollment_cap_sy_2025_26" INTEGER,
    "unused_seats" INTEGER,
    "fill_tier" TEXT,
    "eapi_tier" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_rollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_rollup_school_type_idx" ON "school_rollup"("school_type");

-- CreateIndex
CREATE INDEX "school_rollup_district_name_idx" ON "school_rollup"("district_name");

-- CreateIndex
CREATE UNIQUE INDEX "school_rollup_aun_school_number_key" ON "school_rollup"("aun", "school_number");
