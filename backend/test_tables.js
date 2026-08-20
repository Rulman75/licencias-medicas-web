const sql = require('mssql');
require('dotenv').config();

async function run() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    });

    console.log("LIC_SALUD:");
    const salud = await pool.request().query('SELECT TOP 5 * FROM LIC_SALUD');
    console.log(salud.recordset);

    console.log("\nLIC_ESTABLECIMIENTO:");
    const estab = await pool.request().query('SELECT TOP 5 * FROM LIC_ESTABLECIMIENTO');
    console.log(estab.recordset);

    process.exit(0);
}
run();
