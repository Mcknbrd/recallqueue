import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({
  filename: "./queue.db",
  driver: sqlite3.Database,
});

const columns = await db.all("PRAGMA table_info(matches);");

console.log("🧩 Table columns in 'matches':");
for (const c of columns) {
  console.log(`- ${c.name} (${c.type})`);
}

await db.close();
