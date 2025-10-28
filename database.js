import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function initDB() {
  const db = await open({
    filename: "./queue.db",
    driver: sqlite3.Database,
  });

  // --- Existing Tables ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      userId TEXT PRIMARY KEY,
      joinedAt INTEGER
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      userId TEXT PRIMARY KEY,
      mlbbId TEXT,
      mlbbNickname TEXT
    );
  `);

  // --- NEW: match history table ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      playerIds TEXT,
      result TEXT DEFAULT 'none',
      startedAt INTEGER,
      finishedAt INTEGER,
      logMessageId TEXT
    );
  `);

  return db;
}
