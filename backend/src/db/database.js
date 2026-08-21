const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const DB_PATH = path.join(__dirname, '../../data/ticket_booking.db');
const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

const txStorage = new AsyncLocalStorage();

let _sqliteDb = null;
let _pgPool = null;

function getSqliteDb() {
  if (!_sqliteDb) {
    const { DatabaseSync } = require('node:sqlite');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _sqliteDb = new DatabaseSync(DB_PATH);
    _sqliteDb.exec('PRAGMA journal_mode = WAL');
    _sqliteDb.exec('PRAGMA foreign_keys = ON');
  }
  return _sqliteDb;
}

function getPgPool() {
  if (!_pgPool) {
    const { Pool } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    _pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return _pgPool;
}

function getQueryClient() {
  if (!USE_POSTGRES) return getSqliteDb();
  return txStorage.getStore() || getPgPool();
}

function toPgSql(sql) {
  let pgSql = sql;

  if (/INSERT OR IGNORE/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR IGNORE INTO seat_status/i, 'INSERT INTO seat_status');
    if (!/ON CONFLICT/i.test(pgSql)) {
      pgSql = `${pgSql.trim()} ON CONFLICT (event_id, seat_id) DO NOTHING`;
    }
  }

  pgSql = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
  pgSql = pgSql.replace(/\brows\b/g, '"rows"');

  let index = 0;
  pgSql = pgSql.replace(/\?/g, () => `$${++index}`);
  return pgSql;
}

function isInsert(sql) {
  return /^\s*INSERT\s+/i.test(sql.trim());
}

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  async run(...params) {
    if (USE_POSTGRES) {
      let pgSql = toPgSql(this.sql);
      if (isInsert(pgSql) && !/RETURNING/i.test(pgSql)) {
        pgSql = `${pgSql.trim()} RETURNING id`;
      }
      const result = await getQueryClient().query(pgSql, params);
      return {
        changes: result.rowCount,
        lastInsertRowid: result.rows[0]?.id ?? null,
      };
    }

    const result = getSqliteDb().prepare(this.sql).run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async get(...params) {
    if (USE_POSTGRES) {
      const result = await getQueryClient().query(toPgSql(this.sql), params);
      return result.rows[0] ?? undefined;
    }
    return getSqliteDb().prepare(this.sql).get(...params);
  }

  async all(...params) {
    if (USE_POSTGRES) {
      const result = await getQueryClient().query(toPgSql(this.sql), params);
      return result.rows;
    }
    return getSqliteDb().prepare(this.sql).all(...params);
  }
}

function getDb() {
  return {
    prepare(sql) {
      return new Statement(sql);
    },
    async exec(sql) {
      if (USE_POSTGRES) {
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await getQueryClient().query(statement);
        }
        return;
      }
      getSqliteDb().exec(sql);
    },
  };
}

async function withTransaction(_db, fn) {
  if (USE_POSTGRES) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const result = await txStorage.run(client, async () => fn());
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const sqlite = getSqliteDb();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    sqlite.exec('COMMIT');
    return result;
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

async function initDb() {
  if (USE_POSTGRES) {
    const schemaPath = path.join(__dirname, 'schema.postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await getPgPool().query(statement);
    }
    console.log('PostgreSQL database initialized');
    return getDb();
  }

  const sqlite = getSqliteDb();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  sqlite.exec(schema);
  console.log('SQLite database initialized');
  return getDb();
}

function getDatabaseType() {
  return USE_POSTGRES ? 'postgresql' : 'sqlite';
}

module.exports = {
  getDb,
  initDb,
  withTransaction,
  DB_PATH,
  getDatabaseType,
};
