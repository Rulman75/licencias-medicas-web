const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'cmds_licencias_jwt_secret_2026_v28';
const BCRYPT_ROUNDS = 12;

// Caché ligera en memoria para validar estado Activo del usuario en cada request (TTL 15s)
const userStatusCache = new Map();
const USER_CACHE_TTL_MS = 15 * 1000;

// Rate Limiter en memoria para intentos fallidos de Login por IP (Anti-Fuerza Bruta)
const loginFailuresByIp = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_LOGIN_FAILURES_PER_IP = 15;

// Rate Limiter general de API por IP (Anti-Scraping / DoS)
const apiRequestsByIp = new Map();
const API_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_API_REQ_PER_MIN = 350;

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        return String(xff).split(',')[0].trim();
    }
    const xReal = req.headers['x-real-ip'];
    if (xReal) {
        return String(xReal).trim();
    }
    return String(req.ip || req.socket?.remoteAddress || 'desconocida').replace(/^::ffff:/, '');
}

function invalidateUserCache(username) {
    if (!username) {
        userStatusCache.clear();
        return;
    }
    userStatusCache.delete(String(username).trim().toLowerCase());
}

/**
 * Cabeceras HTTP de seguridad estándar para exposición a Internet (equivalente a Helmet)
 */
function securityHeadersMiddleware(req, res, next) {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

/**
 * Limitador de tasa general para endpoints /api/*
 */
function apiRateLimiter(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    let entry = apiRequestsByIp.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + API_WINDOW_MS };
        apiRequestsByIp.set(ip, entry);
        return next();
    }
    entry.count += 1;
    if (entry.count > MAX_API_REQ_PER_MIN) {
        return res.status(429).json({
            status: 'error',
            message: 'Demasiadas solicitudes desde su dirección IP. Por favor aguarde un minuto.'
        });
    }
    next();
}

/**
 * Limitador de intentos fallidos de Login por IP
 */
function checkLoginIpRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = loginFailuresByIp.get(ip);
    if (entry && now < entry.resetAt && entry.failures >= MAX_LOGIN_FAILURES_PER_IP) {
        const minsLeft = Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
        return res.status(429).json({
            status: 'error',
            message: `Demasiados intentos fallidos desde esta dirección IP (${ip}). Intente nuevamente en ${minsLeft} minutos.`
        });
    }
    next();
}

function recordLoginIpResult(req, success) {
    const ip = getClientIp(req);
    if (success) {
        loginFailuresByIp.delete(ip);
        return;
    }
    const now = Date.now();
    let entry = loginFailuresByIp.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { failures: 1, resetAt: now + LOGIN_WINDOW_MS };
    } else {
        entry.failures += 1;
    }
    loginFailuresByIp.set(ip, entry);
}

/**
 * Registra un evento en LIC_AUDITORIA_ACCESOS (compatible con Modo Dual SQL Server + PostgreSQL)
 */
async function registrarAuditoriaAcceso(pool, { usuario, evento, detalle = '', req = null, exitoso = true }) {
    try {
        const ip = req ? getClientIp(req) : 'sistema';
        const ua = req ? String(req.headers['user-agent'] || '').slice(0, 290) : 'sistema';
        const userClean = String(usuario || 'desconocido').trim().slice(0, 48);
        const evClean = String(evento || 'EVENTO').trim().slice(0, 48);
        const detClean = String(detalle || '').trim().slice(0, 490);
        const exInt = exitoso ? 1 : 0;

        await pool
            .request()
            .input('Usuario', sql.NVarChar, userClean)
            .input('Evento', sql.NVarChar, evClean)
            .input('Detalle', sql.NVarChar, detClean)
            .input('IpOrigen', sql.NVarChar, ip)
            .input('UserAgent', sql.NVarChar, ua)
            .input('Exitoso', sql.Int, exInt)
            .query(`
                INSERT INTO LIC_AUDITORIA_ACCESOS (FechaHora, Usuario, Evento, Detalle, IpOrigen, UserAgent, Exitoso)
                VALUES (GETDATE(), @Usuario, @Evento, @Detalle, @IpOrigen, @UserAgent, @Exitoso)
            `);
    } catch (err) {
        console.warn('[AUDITORIA] No se pudo registrar evento de auditoría:', err.message);
    }
}

/**
 * Inicializa y migra de forma idempotente las columnas de seguridad en Usuarios y la tabla LIC_AUDITORIA_ACCESOS
 * en SQL Server y PostgreSQL, manteniendo intacta la columna Clave para compatibilidad con sistemas legados.
 */
async function ensureSecuritySchema(pool) {
    try {
        const msPool = pool.mssqlPool || (pool.config ? pool : null);
        const pgPool = pool.pgPool || null;

        // 1. Migración en SQL Server (BDLicencias)
        if (msPool) {
            await msPool.request().query(`
                IF COL_LENGTH('dbo.Usuarios', 'PasswordHash') IS NULL
                    ALTER TABLE dbo.Usuarios ADD PasswordHash NVARCHAR(255) NULL;
                IF COL_LENGTH('dbo.Usuarios', 'NombreCompleto') IS NULL
                    ALTER TABLE dbo.Usuarios ADD NombreCompleto NVARCHAR(120) NULL;
                IF COL_LENGTH('dbo.Usuarios', 'Email') IS NULL
                    ALTER TABLE dbo.Usuarios ADD Email NVARCHAR(120) NULL;
                IF COL_LENGTH('dbo.Usuarios', 'Rut') IS NULL
                    ALTER TABLE dbo.Usuarios ADD Rut NVARCHAR(20) NULL;
                IF COL_LENGTH('dbo.Usuarios', 'Activo') IS NULL
                    ALTER TABLE dbo.Usuarios ADD Activo INT NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT(1);
                IF COL_LENGTH('dbo.Usuarios', 'DebeCambiarClave') IS NULL
                    ALTER TABLE dbo.Usuarios ADD DebeCambiarClave INT NOT NULL CONSTRAINT DF_Usuarios_DebeCambiar DEFAULT(0);
                IF COL_LENGTH('dbo.Usuarios', 'IntentosFallidos') IS NULL
                    ALTER TABLE dbo.Usuarios ADD IntentosFallidos INT NOT NULL CONSTRAINT DF_Usuarios_Intentos DEFAULT(0);
                IF COL_LENGTH('dbo.Usuarios', 'BloqueadoHasta') IS NULL
                    ALTER TABLE dbo.Usuarios ADD BloqueadoHasta DATETIME NULL;
                IF COL_LENGTH('dbo.Usuarios', 'UltimoAcceso') IS NULL
                    ALTER TABLE dbo.Usuarios ADD UltimoAcceso DATETIME NULL;
                IF COL_LENGTH('dbo.Usuarios', 'UltimoCambioClave') IS NULL
                    ALTER TABLE dbo.Usuarios ADD UltimoCambioClave DATETIME NULL;
                IF COL_LENGTH('dbo.Usuarios', 'FechaCreacion') IS NULL
                    ALTER TABLE dbo.Usuarios ADD FechaCreacion DATETIME NULL CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT(GETDATE());

                IF OBJECT_ID('dbo.LIC_AUDITORIA_ACCESOS', 'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.LIC_AUDITORIA_ACCESOS (
                        Id INT IDENTITY(1,1) PRIMARY KEY,
                        FechaHora DATETIME NOT NULL DEFAULT GETDATE(),
                        Usuario NVARCHAR(50) NOT NULL,
                        Evento NVARCHAR(50) NOT NULL,
                        Detalle NVARCHAR(500) NULL,
                        IpOrigen NVARCHAR(80) NULL,
                        UserAgent NVARCHAR(300) NULL,
                        Exitoso INT NOT NULL DEFAULT 1
                    );
                END
            `);
        }

        // 2. Migración en PostgreSQL (bd_licencias)
        if (pgPool) {
            await pgPool.query(`
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS passwordhash VARCHAR(255) NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombrecompleto VARCHAR(120) NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(120) NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rut VARCHAR(20) NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo INT NOT NULL DEFAULT 1;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debecambiarclave INT NOT NULL DEFAULT 0;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentosfallidos INT NOT NULL DEFAULT 0;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueadohasta TIMESTAMP NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimoacceso TIMESTAMP NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimocambioclave TIMESTAMP NULL;
                ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fechacreacion TIMESTAMP NULL DEFAULT NOW();

                CREATE TABLE IF NOT EXISTS lic_auditoria_accesos (
                    id SERIAL PRIMARY KEY,
                    fechahora TIMESTAMP NOT NULL DEFAULT NOW(),
                    usuario VARCHAR(50) NOT NULL,
                    evento VARCHAR(50) NOT NULL,
                    detalle VARCHAR(500) NULL,
                    iporigen VARCHAR(80) NULL,
                    useragent VARCHAR(300) NULL,
                    exitoso INT NOT NULL DEFAULT 1
                );
            `);
        }

        // 3. Rescatar nombres históricos desde lic_usuarios si NombreCompleto está vacío
        try {
            if (msPool) {
                await msPool.request().query(`
                    UPDATE U
                    SET U.NombreCompleto = LTRIM(RTRIM(LU.nombreUsuario))
                    FROM Usuarios U
                    INNER JOIN lic_usuarios LU ON LOWER(LTRIM(RTRIM(U.Usuario))) = LOWER(LTRIM(RTRIM(LU.Usuario)))
                    WHERE (U.NombreCompleto IS NULL OR LTRIM(RTRIM(U.NombreCompleto)) = '')
                      AND LU.nombreUsuario IS NOT NULL
                      AND LTRIM(RTRIM(LU.nombreUsuario)) <> ''
                `);
            }
            if (pgPool) {
                await pgPool.query(`
                    UPDATE usuarios u
                    SET nombrecompleto = TRIM(lu.nombreusuario)
                    FROM lic_usuarios lu
                    WHERE LOWER(TRIM(u.usuario)) = LOWER(TRIM(lu.usuario))
                      AND (u.nombrecompleto IS NULL OR TRIM(u.nombrecompleto) = '')
                      AND lu.nombreusuario IS NOT NULL
                      AND TRIM(lu.nombreusuario) <> ''
                `);
            }
        } catch {}

        // 4. Hashear con Bcrypt todas las cuentas existentes que aún no tengan PasswordHash
        const usersRes = await pool.request().query(`
            SELECT
                LTRIM(RTRIM(Usuario)) AS Usuario,
                LTRIM(RTRIM(ISNULL(Clave, ''))) AS Clave,
                LTRIM(RTRIM(ISNULL(PasswordHash, ''))) AS PasswordHash,
                LTRIM(RTRIM(ISNULL(NombreCompleto, ''))) AS NombreCompleto
            FROM Usuarios
            WHERE Usuario IS NOT NULL AND LTRIM(RTRIM(Usuario)) <> ''
        `);

        let migrados = 0;
        for (const row of usersRes.recordset || []) {
            if (!row.PasswordHash && row.Clave) {
                const hash = await bcrypt.hash(row.Clave, BCRYPT_ROUNDS);
                await pool
                    .request()
                    .input('Hash', sql.NVarChar, hash)
                    .input('User', sql.NVarChar, row.Usuario)
                    .query(`
                        UPDATE Usuarios
                        SET PasswordHash = @Hash,
                            Activo = COALESCE(Activo, 1),
                            DebeCambiarClave = COALESCE(DebeCambiarClave, 0),
                            IntentosFallidos = COALESCE(IntentosFallidos, 0),
                            FechaCreacion = COALESCE(FechaCreacion, GETDATE())
                        WHERE LTRIM(RTRIM(Usuario)) = @User
                    `);
                migrados++;
            }
        }

        if (migrados > 0) {
            console.log(`[SEGURIDAD] Se generaron hashes Bcrypt (12 rondas) para ${migrados} usuarios existentes.`);
        }
    } catch (err) {
        console.error('[SEGURIDAD] Error verificando esquema de seguridad:', err.message);
    }
}

/**
 * Middleware de autenticación JWT obligatoria para rutas /api/*
 */
async function authenticateJWT(req, res, next) {
    try {
        let token = null;
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (authHeader && String(authHeader).startsWith('Bearer ')) {
            token = String(authHeader).slice(7).trim();
        } else if (req.query && req.query.token) {
            token = String(req.query.token).trim();
        }

        if (!token) {
            return res.status(401).json({
                status: 'error',
                code: 'NO_TOKEN',
                message: 'Sesión no autenticada. Por favor inicie sesión.'
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                status: 'error',
                code: 'INVALID_TOKEN',
                message: 'Su sesión ha expirado o no es válida. Por favor inicie sesión nuevamente.'
            });
        }

        const usernameKey = String(decoded.username || '').trim().toLowerCase();
        if (!usernameKey) {
            return res.status(401).json({ status: 'error', message: 'Token de usuario inválido.' });
        }

        // Verificar en caché de 15s (o BD) si el usuario sigue Activo y obtener su rol actualizado
        const now = Date.now();
        let cached = userStatusCache.get(usernameKey);
        if (!cached || now > cached.expiresAt) {
            const { getConnection } = require('../db');
            const pool = await getConnection();
            const dbRes = await pool
                .request()
                .input('u', sql.NVarChar, String(decoded.username).trim())
                .query(`
                    SELECT
                        LTRIM(RTRIM(Usuario)) AS Usuario,
                        LTRIM(RTRIM(ISNULL(Tipo, 'U'))) AS Tipo,
                        LTRIM(RTRIM(ISNULL(Unidad, 'cmds'))) AS Unidad,
                        LTRIM(RTRIM(ISNULL(NombreCompleto, ''))) AS NombreCompleto,
                        ISNULL(Activo, 1) AS Activo,
                        ISNULL(DebeCambiarClave, 0) AS DebeCambiarClave
                    FROM Usuarios
                    WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@u)
                `);

            if (!dbRes.recordset || dbRes.recordset.length === 0) {
                return res.status(401).json({
                    status: 'error',
                    code: 'USER_NOT_FOUND',
                    message: 'La cuenta de usuario ya no existe.'
                });
            }

            const uRow = dbRes.recordset[0];
            cached = {
                username: uRow.Usuario,
                tipo: String(uRow.Tipo || 'U').trim().toUpperCase(),
                unidad: uRow.Unidad,
                nombreCompleto: uRow.NombreCompleto || uRow.Usuario,
                activo: Number(uRow.Activo) === 1,
                debeCambiarClave: Number(uRow.DebeCambiarClave) === 1,
                expiresAt: now + USER_CACHE_TTL_MS
            };
            userStatusCache.set(usernameKey, cached);
        }

        if (!cached.activo) {
            return res.status(401).json({
                status: 'error',
                code: 'USER_SUSPENDED',
                message: 'Su cuenta de usuario se encuentra suspendida. Contacte al Administrador.'
            });
        }

        req.user = {
            username: cached.username,
            tipo: cached.tipo,
            unidad: cached.unidad,
            nombreCompleto: cached.nombreCompleto,
            debeCambiarClave: cached.debeCambiarClave
        };

        next();
    } catch (err) {
        console.error('[AUTH] Error en authenticateJWT:', err.message);
        res.status(500).json({ status: 'error', message: 'Error interno verificando sesión.' });
    }
}

/**
 * Normaliza el código de rol histórico: cualquier rol distinto de G, M, U, P que tenía permisos
 * de administración en el sistema (como 'A' o 'BIANCA') se evalúa según la matriz de permisos.
 */
function isUserAdmin(tipoRaw) {
    const t = String(tipoRaw || '').trim().toUpperCase();
    return t === 'A' || !['G', 'M', 'U', 'P'].includes(t);
}

/**
 * Middleware de autorización por Rol (RBAC)
 * @param  {...string} allowedRoles Roles permitidos ('A', 'G', 'M', 'U', 'P')
 */
function requireRoles(...allowedRoles) {
    const normalizedAllowed = allowedRoles.map(r => String(r).trim().toUpperCase());
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'No autenticado.' });
        }
        const userRole = isUserAdmin(req.user.tipo) ? 'A' : String(req.user.tipo || 'U').trim().toUpperCase();
        if (userRole === 'A' || normalizedAllowed.includes(userRole)) {
            return next();
        }
        return res.status(403).json({
            status: 'error',
            code: 'FORBIDDEN_ROLE',
            message: `Su perfil (${req.user.tipo}) no cuenta con permisos para ejecutar esta operación.`
        });
    };
}

module.exports = {
    JWT_SECRET,
    BCRYPT_ROUNDS,
    getClientIp,
    invalidateUserCache,
    securityHeadersMiddleware,
    apiRateLimiter,
    checkLoginIpRateLimit,
    recordLoginIpResult,
    registrarAuditoriaAcceso,
    ensureSecuritySchema,
    authenticateJWT,
    requireRoles,
    isUserAdmin
};
