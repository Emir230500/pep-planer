"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { databaseConfig } = require('../database-config');
test('production cannot disable TLS verification through URL options or env', () => {
  const config = databaseConfig({ DATABASE_URL: 'postgres://test:synthetic@localhost/db?sslmode=no-verify&ssl=false&uselibpqcompat=true' });
  const { Client } = require('pg');
  const client = new Client(config);
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL: 'false' }));
  assert.equal(databaseConfig({ DATABASE_URL: 'postgres://localhost/db', DATABASE_SSL: 'false', NODE_ENV: 'test' }).ssl, false);
});
