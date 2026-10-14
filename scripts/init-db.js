// Import database/import.sql on first start if tables are missing.
// Coolify's compose bind mount of ./database/import.sql into the MariaDB
// entrypoint did not load the schema (the volume mount is not honoured for
// the db service), leaving an empty database and login failing with
// "Table whatscrm.user doesn't exist". This script runs inside the app
// container, which already contains database/import.sql via COPY, and
// imports it once when the user table is absent. Idempotent.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const config = {
    host: process.env.DBHOST || "db",
    port: Number(process.env.DBPORT || 3306),
    user: process.env.DBUSER,
    password: process.env.DBPASS,
    database: process.env.DBNAME,
    multipleStatements: true,
  };
  let conn = null;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      conn = await mysql.createConnection(config);
      console.log("[init-db] connected to database");
      break;
    } catch (err) {
      console.log(`[init-db] waiting for db (attempt ${attempt}/30): ${err.code || err.message}`);
      await sleep(2000);
    }
  }
  if (!conn) {
    console.error("[init-db] could not connect to database, starting app anyway");
    return;
  }
  try {
    const [rows] = await conn.query("SHOW TABLES LIKE 'user'");
    if (rows.length > 0) {
      console.log("[init-db] user table exists, skipping import");
      return;
    }
    console.log("[init-db] user table missing, importing database/import.sql");
    const sqlPath = path.join(__dirname, "..", "database", "import.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await conn.query(sql);
    const [check] = await conn.query("SHOW TABLES LIKE 'user'");
    if (check.length > 0) {
      console.log("[init-db] import complete, user table now exists");
    } else {
      console.error("[init-db] import ran but user table still missing");
    }
  } catch (err) {
    console.error("[init-db] import failed:", err.message);
  } finally {
    try {
      await conn.end();
    } catch (_) {}
  }
}

main().then(() => process.exit(0));
