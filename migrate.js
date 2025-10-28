import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({
  filename: "./queue.db",
  driver: sqlite3.Database,
});

try {
  await db.exec("ALTER TABLE matches ADD COLUMN logMessageId TEXT;");
  console.log("✅ Column logMessageId added successfully.");
} catch (err) {
  if (err.message.includes("duplicate column")) {
    console.log("ℹ️ Column already exists, skipping.");
  } else {
    console.error("❌ Migration error:", err);
  }
}

await db.close();
