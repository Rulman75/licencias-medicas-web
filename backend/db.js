const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // For older SQL Server 2012, encrypt might need to be false unless configured otherwise
        trustServerCertificate: true // Useful for local/internal IPs
    }
};

let pool;

async function getConnection() {
    try {
        if (!pool) {
            pool = await sql.connect(config);
            console.log('Connected to SQL Server successfully');
        }
        return pool;
    } catch (error) {
        console.error('Database connection failed!', error);
        throw error;
    }
}

module.exports = {
    getConnection,
    sql
};
