// Import database/import.sql on first start if tables are missing.
// Coolify's compose bind mount of ./database/import.sql into the MariaDB
// entrypoint did not load the schema, leaving an empty database and login
// failing with "Table whatscrm.user doesn't exist". This script runs inside
// the app container, which already contains database/import.sql via COPY,
// and imports it once when the user table is absent. Idempotent.
// Statements are executed one by one (split on ; + newline, the mysqldump
// terminator) so a single bad statement does not abort the whole import;
// failures are logged and the import continues.
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
    multipleStatements: false,
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
    const statements = sql.split(/;\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    console.log(`[init-db] ${statements.length} statements to run`);
    let ok = 0, failed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip mysqldump header comments that are not real statements
      if (stmt.startsWith("--") && !stmt.includes("CREATE") && !stmt.includes("INSERT") && !stmt.includes("DROP") && !stmt.includes("USE") && !stmt.includes("SET")) {
        continue;
      }
      try {
        await conn.query(stmt);
        ok++;
      } catch (err) {
        failed++;
        console.error(`[init-db] statement ${i + 1} failed: ${err.code} ${err.message} | ${stmt.slice(0, 200)}`);
      }
    }
    console.log(`[init-db] import done: ${ok} ok, ${failed} failed`);
    const [check] = await conn.query("SHOW TABLES LIKE 'user'");
    if (check.length > 0) {
      console.log("[init-db] user table now exists");
    } else {
      console.error("[init-db] user table still missing after import");
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
