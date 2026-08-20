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

    console.log("LIC_LICENCIA_ACTUAL SCHEMA:");
    const licSchema = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LIC_LICENCIA_ACTUAL'");
    console.log(licSchema.recordset);

    console.log("\nLIC_DETALLE_PAGO_ACTUAL SCHEMA:");
    const pagoSchema = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LIC_DETALLE_PAGO_ACTUAL'");
    console.log(pagoSchema.recordset);

    // Also check if there is a LIC_PAGO_ACTUAL table or if it meant LIC_DETALLE_PAGO_ACTUAL
    console.log("\nTables matching %PAGO_ACTUAL%:");
    const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%PAGO_ACTUAL%'");
    console.log(tables.recordset);

    process.exit(0);
}
run();
