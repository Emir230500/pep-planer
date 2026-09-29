"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { weather } = require('../weather-provider');
test('weather makes no unconfigured requests and uses only the commercial endpoint with a key', async () => {
  let calls = 0;
  const request = async url => {
    calls++;
    assert.equal(url.hostname, 'customer-api.open-meteo.com');
    assert.equal(url.searchParams.get('apikey'), 'synthetic-key');
    return { ok: true, json: async () => ({ daily: { weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_sum: [0] } }) };
  };
  assert.equal((await weather('2026-09-23', 1, 2, {}, request)).unavailable, true);
  assert.equal((await weather('2026-09-23', 1, 2, { WEATHER_MODE: 'commercial' }, request)).unavailable, true);
  assert.equal(calls, 0);
  assert.equal((await weather('2026-09-23', 1, 2, { WEATHER_MODE: 'commercial', OPEN_METEO_API_KEY: 'synthetic-key' }, request)).max, 20);
  assert.equal(calls, 1);
});
