/**
 * Backs up the live database to a local gzip file, through the Management API
 * (no database password needed). The free Supabase plan keeps no backups.
 *
 *   npm run db:backup                     writes ~/sunday-football-backups/
 *   npm run db:backup -- --dir ./somewhere
 *
 * Contains private data (PINs hashes, ratings, emails): the file is written
 * owner-only and must never go in git. Avatar images are not included.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\./)?.[1];
if (!ref) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!existsSync(".supabase-token")) throw new Error(".supabase-token is missing. Run: npm run setup:supabase");
const token = readFileSync(".supabase-token", "utf8").trim();

const dirFlag = process.argv.indexOf("--dir");
const dir = dirFlag > -1 ? process.argv[dirFlag + 1] : join(homedir(), "sunday-football-backups");

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const PAGE = 1000;

async function main() {
  const tables = (
    await query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1",
    )
  ).map((t) => t.table_name);

  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from public."${table}"`);
    const rows: unknown[] = [];
    // Stable paging by ctid-free ordering: order by the whole row text.
    for (let offset = 0; offset < n; offset += PAGE) {
      rows.push(
        ...(await query(
          `select * from public."${table}" order by to_jsonb("${table}")::text limit ${PAGE} offset ${offset}`,
        )),
      );
    }
    if (rows.length !== n) throw new Error(`${table}: expected ${n} rows, got ${rows.length}`);
    data[table] = rows;
    counts[table] = n;
  }

  // Who can sign in as an admin. No password hashes.
  const authUsers = await query("select id, email, created_at, last_sign_in_at from auth.users order by created_at");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = { takenAt: new Date().toISOString(), project: ref, counts, authUsers, data };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `sunday-football-${stamp}.json.gz`);
  writeFileSync(file, gzipSync(JSON.stringify(payload)), { mode: 0o600 });
  chmodSync(file, 0o600);

  console.log(`Wrote ${file}`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(28)} ${n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
