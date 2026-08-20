const sql = require('mssql');
require('dotenv').config();

async function run() {
    try {
        const pool = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const checkTable = await pool.request().query(`
            SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LIC_BITACORA_ARCHIVOS'
        `);

        if (checkTable.recordset.length === 0) {
            console.log("Creating LIC_BITACORA_ARCHIVOS...");
            await pool.request().query(`
                CREATE TABLE LIC_BITACORA_ARCHIVOS (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    NombreArchivo NVARCHAR(255),
                    FechaProceso DATETIME DEFAULT GETDATE(),
                    TotalRegistros INT,
                    RegistrosNuevos INT,
                    RegistrosActualizados INT,
                    Usuario NVARCHAR(100)
                )
            `);
            console.log("Table created successfully.");
        } else {
            console.log("Table already exists.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
