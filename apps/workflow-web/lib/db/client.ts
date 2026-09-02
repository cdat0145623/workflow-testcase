import pg from "pg";

const { Pool } = pg;

export function createDatabasePool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required in local mode");
  return new Pool({ connectionString });
}
