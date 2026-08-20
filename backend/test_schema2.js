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

    console.log("\nLIC_PAGO_ACTUAL SCHEMA:");
    const pagoAct = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LIC_PAGO_ACTUAL'");
    console.log(pagoAct.recordset);

    process.exit(0);
}
run();
