import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

async function ping() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }

  // Dynamic import after dotenv so DATABASE_URL is available
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);

  const rows = await sql`
    SELECT
      current_database() AS database,
      (
        SELECT COUNT(*)::int
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schools'
      ) AS columns,
      (SELECT COUNT(*)::int FROM schools) AS school_count,
      NOW() AS server_time
  `;

  const row = rows[0] as {
    database: string;
    columns: number;
    school_count: number;
    server_time: string;
  };

  if (!row.columns) {
    console.error('Connected, but public.schools is missing. Run "npm run db:migrate".');
    process.exit(1);
  }

  console.log("Neon connection OK");
  console.log(`  database: ${row.database}`);
  console.log(`  schools columns: ${row.columns}`);
  console.log(`  school rows: ${row.school_count}`);
  console.log(`  server time: ${row.server_time}`);
}

ping().catch((err) => {
  console.error("Neon connection failed:", err);
  process.exit(1);
});
