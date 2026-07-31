import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

config({ path: resolve(process.cwd(), ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env");
  process.exit(1);
}

async function migrate() {
  const schema = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log("Applying db/schema.sql…");
    await client.query(schema);

    const { rows } = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schools'
    `);

    console.log(`Done. public.schools has ${rows[0].count} columns.`);
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
