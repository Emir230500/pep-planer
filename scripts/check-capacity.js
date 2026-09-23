"use strict";
// Run in the configured service shell. Read-only; prints no URLs, credentials,
// employee records or business report payloads. No scans of raw business tables.
const { Client } = require('pg');
const { databaseConfig } = require('../database-config');
async function main() {
  const configured = {};
  for (const name of ['DATABASE_URL', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) configured[name] = Boolean(process.env[name]);
  console.log(JSON.stringify({ configured, processMemory: process.memoryUsage(), commit: process.env.RENDER_GIT_COMMIT || null }));
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL missing');
  const client = new Client(databaseConfig());
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const size = await client.query('SELECT pg_database_size(current_database())::text AS database_bytes');
    const tables = await client.query("SELECT relname AS table_name, n_live_tup::text AS estimated_rows, pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20");
    const ssl = await client.query('SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ ...size.rows[0], tables: tables.rows, tls: ssl.rows, note: 'Provider quota, transfer and billing are not exposed by these SQL measurements.' }, null, 2));
  } finally { await client.end(); }
}
main().catch(() => { console.error('Capacity check failed. Verify provider access, configuration and TLS; credentials were not printed.'); process.exitCode = 1; });
