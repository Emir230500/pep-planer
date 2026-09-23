"use strict";
async function weather(date, latitude, longitude, env = process.env, request = fetch) {
  // No unlicensed commercial access by default. A key must belong to an active
  // commercial subscription; configuration alone cannot establish that right.
  const mode = env.WEATHER_MODE || 'off';
  if (mode !== 'free' && mode !== 'commercial') return { unavailable: true };
  if (mode === 'commercial' && !env.OPEN_METEO_API_KEY) return { unavailable: true };
  const url = new URL(mode === 'commercial' ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast');
  for (const [key, value] of Object.entries({ latitude, longitude, daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum', timezone: 'Europe/Berlin', start_date: date, end_date: date })) url.searchParams.set(key, value);
  if (mode === 'commercial') url.searchParams.set('apikey', env.OPEN_METEO_API_KEY);
  try {
    const response = await request(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { unavailable: true };
    const j = await response.json();
    const values = [j.daily?.weather_code?.[0], j.daily?.temperature_2m_max?.[0], j.daily?.temperature_2m_min?.[0], j.daily?.precipitation_sum?.[0]];
    if (!values.every(Number.isFinite)) return { unavailable: true };
    const [code, max, min, rain] = values;
    return { code, max, min, rain };
  } catch { return { unavailable: true }; }
}
module.exports = { weather };
