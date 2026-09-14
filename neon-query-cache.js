"use strict";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const configuredTtl = Number(process.env.NEON_QUERY_CACHE_TTL_MS || DEFAULT_TTL_MS);
const CACHE_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 5 * 60 * 1000
  ? configuredTtl
  : DEFAULT_TTL_MS;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

try {
  const pg = require("pg");
  const originalQuery = pg.Pool.prototype.query;
  let cachedDbValue;
  let cachedAt = 0;
  let lastBackupAt = 0;
  let backupWrittenForCurrentWrite = false;

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

  function isBackupInsert(text, values) {
    const sql = normalizedSql(text);
    return values?.[0] === "db" && sql.startsWith("insert into app_backups (value) select value from app_store where key = $1");
  }

  function isBackupCleanup(text) {
    return normalizedSql(text).startsWith("delete from app_backups where id not in");
  }

  function cachedResult() {
    return { command: "SELECT", rowCount: 1, oid: null, rows: [{ value: cachedDbValue }], fields: [] };
  }

  function fakeResult(command = "UPDATE") {
    return { command, rowCount: 1, oid: null, rows: [], fields: [] };
  }

  function deliver(parts, result) {
    if (parts.callback) {
      queueMicrotask(() => parts.callback(null, result));
      return;
    }
    return Promise.resolve(result);
  }

  function rememberReadResult(result) {
    if (result?.rows?.length && Object.prototype.hasOwnProperty.call(result.rows[0], "value")) {
      cachedDbValue = result.rows[0].value;
      cachedAt = Date.now();
    }
  }

  function parseNextValue(values) {
    try {
      const nextValue = values?.[1];
      return typeof nextValue === "string" ? JSON.parse(nextValue) : nextValue;
    } catch {
      return undefined;
    }
  }

  function rememberWrite(values) {
    const parsed = parseNextValue(values);
    if (parsed !== undefined) {
      cachedDbValue = parsed;
      cachedAt = Date.now();
    } else {
      cachedDbValue = undefined;
      cachedAt = 0;
    }
  }

  function comparableDb(value) {
    if (!value || typeof value !== "object") return value;
    try {
      const clone = JSON.parse(JSON.stringify(value));
      if (clone.revenueImport && typeof clone.revenueImport === "object") {
        delete clone.revenueImport.lastRunAt;
        delete clone.revenueImport.lastSuccessAt;
        delete clone.revenueImport.lastError;
        delete clone.revenueImport.lastResult;
      }
      return clone;
    } catch {
      return value;
    }
  }

  function isOnlyTransientRevenueChange(nextValue) {
    if (cachedDbValue === undefined || nextValue === undefined) return false;
    try {
      return JSON.stringify(comparableDb(cachedDbValue)) === JSON.stringify(comparableDb(nextValue));
    } catch {
      return false;
    }
  }

  pg.Pool.prototype.query = function patchedQuery(config, values, callback) {
    const parts = queryParts(config, values, callback);
    const read = isDbRead(parts.text, parts.values);
    const write = isDbWrite(parts.text, parts.values);
    const backupInsert = isBackupInsert(parts.text, parts.values);
    const backupCleanup = isBackupCleanup(parts.text);

    if (read && cachedDbValue !== undefined && Date.now() - cachedAt < CACHE_TTL_MS) {
      return deliver(parts, cachedResult());
    }

    if (backupInsert) {
      if (Date.now() - lastBackupAt < BACKUP_INTERVAL_MS) {
        backupWrittenForCurrentWrite = false;
        return deliver(parts, fakeResult("INSERT"));
      }
      lastBackupAt = Date.now();
      backupWrittenForCurrentWrite = true;
    }

    if (backupCleanup && !backupWrittenForCurrentWrite) {
      return deliver(parts, fakeResult("DELETE"));
    }

    if (write) {
      const nextValue = parseNextValue(parts.values);
      if (isOnlyTransientRevenueChange(nextValue)) {
        rememberWrite(parts.values);
        backupWrittenForCurrentWrite = false;
        console.log("[neon-cache] skipped redundant app_store write (mail status only)");
        return deliver(parts, fakeResult("UPDATE"));
      }
    }

    const result = originalQuery.apply(this, arguments);
    if (!result || typeof result.then !== "function") return result;

    return result.then(queryResult => {
      if (read) rememberReadResult(queryResult);
      if (write) rememberWrite(parts.values);
      if (backupCleanup) backupWrittenForCurrentWrite = false;
      return queryResult;
    });
  };

  console.log(`[neon-cache] app_store cache active (${Math.round(CACHE_TTL_MS / 3600000)}h TTL, daily backups, redundant writes blocked)`);
} catch (error) {
  console.error("[neon-cache] preload disabled:", error?.message || error);
}
