const sql = require('mssql');
require('dotenv').config();

let PgPool = null;
let pgTypes = null;
try {
    const pgMod = require('pg');
    PgPool = pgMod.Pool;
    pgTypes = pgMod.types;
    // Convertir INT8 / BIGINT y NUMERIC a Number de JS igual que mssql
    pgTypes.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
    pgTypes.setTypeParser(1700, val => (val === null ? null : Number(val)));
} catch (err) {
    console.warn('[DB] Módulo "pg" no disponible, operando exclusivamente con SQL Server:', err.message);
}

const DB_ENGINE = (process.env.DB_ENGINE || 'dual').toLowerCase();

const KNOWN_PASCAL_KEYS = {
    number: 'number',
    usuario: 'Usuario',
    password: 'Password',
    clave: 'Clave',
    tipo: 'Tipo',
    unidad: 'Unidad',
    rut: 'Rut',
    dv: 'DV',
    nombre: 'Nombre',
    paterno: 'Paterno',
    materno: 'Materno',
    codunidad: 'CodUnidad',
    descripcion: 'Descripcion',
    codsector: 'CodSector',
    totalregistros: 'TotalRegistros',
    totalfuncionarios: 'TotalFuncionarios',
    totaldias: 'TotalDias',
    convenio: 'Convenio',
    pagodirecto: 'PagoDirecto',
    reposo: 'Reposo',
    rechazadas: 'Rechazadas',
    reducidas: 'Reducidas',
    maternales: 'Maternales',
    sectoreducacion: 'SectorEducacion',
    sectorsalud: 'SectorSalud',
    totalestimado: 'TotalEstimado',
    totalpagado: 'TotalPagado',
    licenciaspagadas: 'LicenciasPagadas',
    licenciaspendientespago: 'LicenciasPendientesPago',
    totalcheques: 'TotalCheques',
    chequesabiertos: 'ChequesAbiertos',
    chequescerrados: 'ChequesCerrados',
    saldoporcuadrar: 'SaldoPorCuadrar',
    periodonum: 'PeriodoNum',
    total: 'Total',
    estimado: 'Estimado',
    pagado: 'Pagado',
    institucion: 'Institucion',
    cantidad: 'Cantidad',
    dias: 'Dias',
    establecimiento: 'Establecimiento',
    funcionarios: 'Funcionarios',
    numerolicencia: 'NumeroLicencia',
    funcionario: 'Funcionario',
    salud: 'Salud',
    desde: 'Desde',
    hasta: 'Hasta',
    recepcion: 'Recepcion',
    numdias: 'NumDias',
    modalidad: 'Modalidad',
    rechazo: 'Rechazo',
    reducida: 'Reducida',
    maternal: 'Maternal',
    pagoestimado: 'PagoEstimado'
};

function translateSingleTSqlToPostgres(queryText, paramsMap) {
    let q = String(queryText);

    const SQL_KEYWORDS = new Set([
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'ON', 'JOIN',
        'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'GROUP', 'BY', 'ORDER', 'ASC', 'DESC',
        'HAVING', 'LIMIT', 'OFFSET', 'TOP', 'DISTINCT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
        'INSERT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'CONVERT', 'COALESCE', 'ISNULL',
        'LTRIM', 'RTRIM', 'TRIM', 'UPPER', 'LOWER', 'REPLACE', 'SUBSTRING', 'LEN', 'LENGTH', 'CONCAT',
        'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROW_NUMBER', 'OVER', 'PARTITION', 'VARCHAR', 'NVARCHAR',
        'CHAR', 'NCHAR', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DATE',
        'DATETIME', 'TIMESTAMP', 'TEXT', 'GETDATE', 'CURRENT_TIMESTAMP', 'LIKE', 'BETWEEN', 'EXISTS',
        'WITH', 'NULLIF', 'ROWS', 'FETCH', 'NEXT', 'ONLY', 'APPLY', 'LATERAL', 'TRUE', 'EXTRACT', 'YEAR', 'MONTH'
    ]);
    const aliasMap = { ...KNOWN_PASCAL_KEYS };
    const identRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m;
    while ((m = identRegex.exec(q)) !== null) {
        const word = m[1];
        const upper = word.toUpperCase();
        if (!SQL_KEYWORDS.has(upper) && /[A-Z]/.test(word) && /[a-z]/.test(word)) {
            aliasMap[word.toLowerCase()] = word;
        }
    }
    const aliasRegex = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
    while ((m = aliasRegex.exec(q)) !== null) {
        const word = m[1];
        if (!SQL_KEYWORDS.has(word.toUpperCase())) {
            aliasMap[word.toLowerCase()] = word;
        }
    }

    // 1. Esquema dbo. y corchetes [Col]
    q = q.replace(/\bdbo\./gi, '');
    q = q.replace(/\[([^\]]+)\]/g, (_, ident) => `"${ident.toLowerCase()}"`);

    // 2. OUTER APPLY (SELECT TOP 1 ... ORDER BY ...) alias -> LEFT JOIN LATERAL (SELECT ... LIMIT 1) alias ON TRUE
    q = q.replace(
        /\bOUTER\s+APPLY\s*\(\s*SELECT\s+TOP\s+\(?\s*(\d+)\s*\)?\s+([\s\S]*?ORDER\s+BY\s+[^\n\r)]+)\s*\)\s*([A-Za-z_][A-Za-z0-9_]*)/gi,
        (_, limitNum, subBody, aliasName) => {
            return `LEFT JOIN LATERAL (SELECT ${subBody.trim()} LIMIT ${limitNum}) ${aliasName} ON TRUE`;
        }
    );

    // 3. TRY_CAST(expr AS INT) -> CASE WHEN RTRIM(CAST(expr AS TEXT)) ~ '^[0-9]+$' THEN ...::INT ELSE NULL END
    q = q.replace(
        /\bTRY_CAST\s*\(\s*([\s\S]*?)\s+AS\s+INT\s*\)/gi,
        (_, expr) => `(CASE WHEN RTRIM(CAST(${expr} AS TEXT)) ~ '^[0-9]+$' THEN RTRIM(CAST(${expr} AS TEXT))::INT ELSE NULL END)`
    );

    // 4. Funciones comunes T-SQL -> PostgreSQL
    q = q.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
    q = q.replace(
        /\bCOALESCE\s*\(\s*([A-Za-z0-9_.]*(?:Rechazo|regularizado|Maternal|Parcial|Retenida|Pendiente|Descuento))\s*,\s*0\s*\)\s*=\s*([01])\b/gi,
        (_, col, bitVal) => `COALESCE(${col}::boolean, false) = ${bitVal === '1' ? 'true' : 'false'}`
    );
    q = q.replace(
        /\bCOALESCE\s*\(\s*([A-Za-z0-9_.]*(?:Rechazo|regularizado|Maternal|Parcial|Retenida|Pendiente|Descuento))\s*,\s*0\s*\)/gi,
        '(CASE WHEN COALESCE($1::boolean, false) THEN 1 ELSE 0 END)'
    );
    q = q.replace(/\bGETDATE\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
    q = q.replace(/\bLEN\s*\(/gi, 'LENGTH(');
    q = q.replace(/\bYEAR\s*\(\s*CURRENT_TIMESTAMP\s*\)/gi, 'EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::INT');
    q = q.replace(/\bYEAR\s*\(\s*([^()]+)\s*\)/gi, 'EXTRACT(YEAR FROM $1)::INT');
    q = q.replace(/\bMONTH\s*\(\s*([^()]+)\s*\)/gi, 'EXTRACT(MONTH FROM $1)::INT');
    q = q.replace(/\bCONVERT\s*\(\s*varchar(?:\(\d+\))?\s*,\s*([^,]+?)\s*,\s*23\s*\)/gi, "TO_CHAR($1, 'YYYY-MM-DD')");
    q = q.replace(/\bCONVERT\s*\(\s*varchar(?:\(\d+\))?\s*,\s*([^,]+?)\s*,\s*103\s*\)/gi, "TO_CHAR($1, 'DD/MM/YYYY')");
    q = q.replace(/\bCONVERT\s*\(\s*varchar(?:\(\d+\))?\s*,\s*([^,]+?)\s*,\s*105\s*\)/gi, "TO_CHAR($1, 'DD-MM-YYYY')");

    // 5. Concatenación de strings con '+' cuando hay literales de texto ('...')
    for (let i = 0; i < 4; i++) {
        q = q.replace(/('[^']*')\s*\+\s*([A-Za-z0-9_().]+)/g, '$1 || $2');
        q = q.replace(/([A-Za-z0-9_().]+)\s*\+\s*('[^']*')/g, '$1 || $2');
    }

    // 6. Paginación OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY -> LIMIT @pageSize OFFSET @offset
    q = q.replace(
        /\bOFFSET\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+FETCH\s+NEXT\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+ONLY/gi,
        'LIMIT $2 OFFSET $1'
    );

    // 7. Transformar SELECT TOP (N) o SELECT TOP N a LIMIT N al final de la consulta
    q = q.replace(
        /^\s*SELECT\s+(DISTINCT\s+)?TOP\s*\(?\s*(\d+)\s*\)?\s+([\s\S]*?)\s*;?\s*$/i,
        (match, distinctPart, limitNum, body) => {
            return `SELECT ${distinctPart || ''}${body.trim()} LIMIT ${limitNum}`;
        }
    );

    // 8. Reemplazar parámetros @param por $1, $2...
    const values = [];
    const paramIndexMap = new Map();

    q = q.replace(/@([A-Za-z0-9_]+)/g, (fullMatch, paramName) => {
        const key = paramName.toLowerCase();
        if (!paramsMap.has(key)) {
            return fullMatch;
        }
        if (!paramIndexMap.has(key)) {
            values.push(paramsMap.get(key));
            paramIndexMap.set(key, values.length);
        }
        return `$${paramIndexMap.get(key)}`;
    });

    return { text: q, values, aliasMap };
}

function normalizePgRows(rows, aliasMap) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => {
        const out = {};
        for (const [k, v] of Object.entries(r)) {
            const lower = k.toLowerCase();
            const mappedKey = aliasMap[lower] || KNOWN_PASCAL_KEYS[lower] || k;
            out[mappedKey] = v;
            if (mappedKey !== k) {
                out[k] = v;
            }
        }
        return out;
    });
}

class PgRequestWrapper {
    constructor(pgPool) {
        this.pgPool = pgPool;
        this.params = new Map();
    }

    input(name, typeOrVal, val) {
        const value = arguments.length === 2 ? typeOrVal : val;
        this.params.set(String(name).toLowerCase(), value);
        return this;
    }

    async query(queryText) {
        const parts = String(queryText)
            .split(';')
            .map(s => s.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            const recordsets = [];
            const rowsAffected = [];
            for (const part of parts) {
                const { text, values, aliasMap } = translateSingleTSqlToPostgres(part, this.params);
                const res = await this.pgPool.query(text, values);
                recordsets.push(normalizePgRows(res.rows, aliasMap));
                rowsAffected.push(res.rowCount || 0);
            }
            return {
                recordset: recordsets[0] || [],
                recordsets,
                rowsAffected
            };
        }

        const { text, values, aliasMap } = translateSingleTSqlToPostgres(queryText, this.params);
        const res = await this.pgPool.query(text, values);
        const normalized = normalizePgRows(res.rows, aliasMap);
        return {
            recordset: normalized,
            recordsets: [normalized],
            rowsAffected: [res.rowCount || 0]
        };
    }
}

class DualRequestWrapper {
    constructor(mssqlPool, pgPool) {
        this.mssqlReq = mssqlPool.request();
        this.pgReq = new PgRequestWrapper(pgPool);
    }

    input(name, typeOrVal, val) {
        if (arguments.length === 2) {
            this.mssqlReq.input(name, typeOrVal);
            this.pgReq.input(name, typeOrVal);
        } else {
            this.mssqlReq.input(name, typeOrVal, val);
            this.pgReq.input(name, typeOrVal, val);
        }
        return this;
    }

    async query(queryText) {
        const qTrim = String(queryText).trim();
        const isWrite = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(qTrim);
        const isMaxQuery = /^\s*SELECT\s+(?:TOP\s+\d+\s+)?(?:ISNULL\s*\(\s*|COALESCE\s*\(\s*)?MAX\s*\(/i.test(qTrim) && !/\bGROUP\s+BY\b/i.test(qTrim);

        if (isWrite) {
            const [pgOutcome, mssqlOutcome] = await Promise.allSettled([
                this.pgReq.query(queryText),
                this.mssqlReq.query(queryText)
            ]);
            if (pgOutcome.status === 'rejected') {
                console.error('[DUAL-WRITE] Error en PostgreSQL:', pgOutcome.reason?.message);
            }
            if (mssqlOutcome.status === 'rejected') {
                console.error('[DUAL-WRITE] Error en SQL Server:', mssqlOutcome.reason?.message);
            }
            if (pgOutcome.status === 'fulfilled') return pgOutcome.value;
            if (mssqlOutcome.status === 'fulfilled') return mssqlOutcome.value;
            throw pgOutcome.reason || mssqlOutcome.reason;
        }

        if (isMaxQuery) {
            const [pgRes, mssqlRes] = await Promise.all([
                this.pgReq.query(queryText),
                this.mssqlReq.query(queryText)
            ]);
            const rowPg = (pgRes.recordset && pgRes.recordset[0]) || {};
            const rowMs = (mssqlRes.recordset && mssqlRes.recordset[0]) || {};
            const merged = { ...rowPg };
            for (const key of Object.keys(rowMs)) {
                const vPg = Number(merged[key]);
                const vMs = Number(rowMs[key]);
                if (!isNaN(vPg) && !isNaN(vMs)) {
                    merged[key] = Math.max(vPg, vMs);
                }
            }
            return {
                recordset: [merged],
                recordsets: [[merged]],
                rowsAffected: [1]
            };
        }

        try {
            return await this.mssqlReq.query(queryText);
        } catch (err) {
            console.warn('[DUAL-READ] Fallback a PostgreSQL por:', err.message);
            return await this.pgReq.query(queryText);
        }
    }
}

function createPgConfig(defaultDbName) {
    return process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
              host: process.env.PG_HOST || '192.168.30.47',
              port: parseInt(process.env.PG_PORT || '5432', 10),
              user: process.env.PG_USER || 'cmds_admin',
              password: process.env.PG_PASS || 'CmdsPostgres2026!',
              database: process.env.PG_DB || defaultDbName,
              max: 15,
              idleTimeoutMillis: 30000
          };
}

function createMssqlConfig() {
    const rawServer = process.env.DB_SERVER || '192.168.3.251';
    const [serverHost, instanceName] = rawServer.includes('\\')
        ? rawServer.split('\\')
        : [rawServer, undefined];

    return {
        rawServer,
        config: {
            user: process.env.DB_USER,
            password: process.env.DB_PASS || process.env.DB_PASSWORD,
            server: process.env.DB_PORT ? serverHost : rawServer,
            ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
            database: process.env.DB_NAME || process.env.DB_DATABASE || 'BDLicencias',
            requestTimeout: 90000,
            connectionTimeout: 30000,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true,
                ...(!process.env.DB_PORT && instanceName ? { instanceName } : {})
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        }
    };
}

let poolPromise = null;

async function initPool() {
    const { rawServer, config: mssqlConfig } = createMssqlConfig();

    // Si pg no está instalado o el modo es mssql, usar exclusivamente SQL Server
    if (!PgPool || (DB_ENGINE !== 'dual' && DB_ENGINE !== 'ambos' && DB_ENGINE !== 'marcha_blanca' && DB_ENGINE !== 'postgres' && DB_ENGINE !== 'pg' && DB_ENGINE !== 'postgresql')) {
        const pool = await new sql.ConnectionPool(mssqlConfig).connect();
        console.log('Connected to SQL Server successfully (' + rawServer + ' -> ' + process.env.DB_NAME + ')');
        return pool;
    }

    if (DB_ENGINE === 'postgres' || DB_ENGINE === 'pg' || DB_ENGINE === 'postgresql') {
        const pgConfig = createPgConfig('bd_licencias');
        const pgPool = new PgPool(pgConfig);
        await pgPool.query('SELECT 1');
        console.log(`Conectado a PostgreSQL exitosamente (${pgConfig.host || 'URL'} -> ${pgConfig.database || 'bd_licencias'})`);
        return {
            request: () => new PgRequestWrapper(pgPool),
            query: (q) => new PgRequestWrapper(pgPool).query(q),
            close: () => pgPool.end()
        };
    }

    // Modo DUAL (SQL Server + PostgreSQL) con fallback automático si uno de los dos no responde
    const pgConfig = createPgConfig('bd_licencias');
    const pgPool = new PgPool(pgConfig);

    const [mssqlOut, pgOut] = await Promise.allSettled([
        new sql.ConnectionPool(mssqlConfig).connect(),
        pgPool.query('SELECT 1')
    ]);

    if (mssqlOut.status === 'fulfilled' && pgOut.status === 'fulfilled') {
        const mssqlPool = mssqlOut.value;
        console.log(
            `[MODO MARCHA BLANCA DUAL] Conectado simultáneamente a SQL Server (${rawServer} -> ${mssqlConfig.database}) y PostgreSQL (${pgConfig.host} -> ${pgConfig.database})`
        );
        return {
            request: () => new DualRequestWrapper(mssqlPool, pgPool),
            query: (q) => new DualRequestWrapper(mssqlPool, pgPool).query(q),
            close: async () => {
                await Promise.allSettled([mssqlPool.close(), pgPool.end()]);
            }
        };
    }

    if (mssqlOut.status === 'fulfilled') {
        console.warn('[DB DUAL] PostgreSQL no disponible (' + (pgOut.reason?.message || 'error') + '). Operando con SQL Server.');
        pgPool.end().catch(() => {});
        return mssqlOut.value;
    }

    if (pgOut.status === 'fulfilled') {
        console.warn('[DB DUAL] SQL Server no disponible (' + (mssqlOut.reason?.message || 'error') + '). Operando con PostgreSQL.');
        return {
            request: () => new PgRequestWrapper(pgPool),
            query: (q) => new PgRequestWrapper(pgPool).query(q),
            close: () => pgPool.end()
        };
    }

    throw mssqlOut.reason || pgOut.reason;
}

async function getConnection() {
    if (!poolPromise) {
        poolPromise = initPool().catch(err => {
            console.error('Database connection failed!', err.message);
            poolPromise = null;
            throw err;
        });
    }
    return poolPromise;
}

const getPool = getConnection;

// Pre-conectar en segundo plano sin provocar UnhandledPromiseRejection
getConnection().catch(() => {});

module.exports = {
    sql,
    get poolPromise() {
        return getConnection();
    },
    getPool,
    getConnection,
    DB_ENGINE
};
