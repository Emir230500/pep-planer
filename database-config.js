"use strict";

// pg URL SSL parameters can override the explicit SSL object. Normalize them
// here so production always verifies the server certificate and hostname.
function databaseConfig(env = process.env) {
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('Invalid database protocol');
  const local = ['development', 'test'].includes(env.NODE_ENV);
  if (env.DATABASE_SSL === 'false' && !local) throw Error('Unencrypted database connections require development/test mode');
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: env.DATABASE_SSL === 'false' ? false : {
      rejectUnauthorized: true,
      ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {})
    },
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  };
}
module.exports = { databaseConfig };
