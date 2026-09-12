"use strict";

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const configuredTtl = Number(process.env.NEON_QUERY_CACHE_TTL_MS || DEFAULT_TTL_MS);
const CACHE_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 5 * 60 * 1000
  ? configuredTtl
  : DEFAULT_TTL_MS;

try {
  const pg = require("pg");
  const originalQuery = pg.Pool.prototype.query;
  let cachedDbValue;
  let cachedAt = 0;

  function normalizedSql(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function queryParts(config, values, callback) {
    if (typeof config === "string") {
      return {
        text: config,
        values: Array.isArray(values) ? values : [],
        callback: typeof callback === "function" ? callback : (typeof values === "function" ? values : null)
      };
    }
    if (config && typeof config === "object") {
      return {
        text: config.text || "",
        values: Array.isArray(config.values) ? config.values : (Array.isArray(values) ? values : []),
        callback: typeof callback === "function" ? callback : (typeof values === "function" ? values : null)
      };
    }
    return { text: "", values: [], callback: null };
  }

  function isDbRead(text, values) {
    const sql = normalizedSql(text);
    return values?.[0] === "db" && sql === "select value from app_store where key = $1";
  }

  function isDbWrite(text, values) {
    const sql = normalizedSql(text);
    return values?.[0] === "db" && sql.startsWith("update app_store set value = $2::jsonb");
  }

  function cachedResult() {
    return { command: "SELECT", rowCount: 1, oid: null, rows: [{ value: cachedDbValue }], fields: [] };
  }

  function rememberReadResult(result) {
    if (result?.rows?.length && Object.prototype.hasOwnProperty.call(result.rows[0], "value")) {
      cachedDbValue = result.rows[0].value;
      cachedAt = Date.now();
    }
  }

  function rememberWrite(values) {
    try {
      const nextValue = values?.[1];
      cachedDbValue = typeof nextValue === "string" ? JSON.parse(nextValue) : nextValue;
      cachedAt = Date.now();
    } catch {
      cachedDbValue = undefined;
      cachedAt = 0;
    }
  }

  pg.Pool.prototype.query = function patchedQuery(config, values, callback) {
    const parts = queryParts(config, values, callback);
    const read = isDbRead(parts.text, parts.values);
    const write = isDbWrite(parts.text, parts.values);

    if (read && cachedDbValue !== undefined && Date.now() - cachedAt < CACHE_TTL_MS) {
      const result = cachedResult();
      if (parts.callback) {
        queueMicrotask(() => parts.callback(null, result));
        return;
      }
      return Promise.resolve(result);
    }

    const result = originalQuery.apply(this, arguments);
    if (!result || typeof result.then !== "function") return result;

    return result.then(queryResult => {
      if (read) rememberReadResult(queryResult);
      if (write) rememberWrite(parts.values);
      return queryResult;
    });
  };

  console.log(`[neon-cache] app_store cache active (${Math.round(CACHE_TTL_MS / 3600000)}h TTL)`);
} catch (error) {
  console.error("[neon-cache] preload disabled:", error?.message || error);
}
