const express = require('express');
const bcrypt = require('bcryptjs');
const { sql } = require('../db');
const {
    BCRYPT_ROUNDS,
    invalidateUserCache,
    registrarAuditoriaAcceso,
    requireRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Todas las rutas de /api/usuarios requieren rol Administrador ('A')
router.use(requireRoles('A'));

const ROLES_CATALOGO = {
    A: 'Administrador / RRHH Licencias (Control Total)',
    G: 'Gestión / Directivo (Dashboards, Auditoría y Estadísticas)',
    U: 'Consulta Unidad / Establecimiento',
    M: 'Prevención de Riesgos / Mutual (ACHS / IST / ISL)',
    P: 'Encargado BRP / Subvenciones'
};

// 1. Listar todos los usuarios y métricas de seguridad
router.get('/', async (req, res) => {
    try {
        const pool = req.db;

        const usersRes = await pool.request().query(`
            SELECT
                LTRIM(RTRIM(Usuario)) AS Usuario,
                LTRIM(RTRIM(ISNULL(NombreCompleto, ''))) AS NombreCompleto,
                LTRIM(RTRIM(ISNULL(Email, ''))) AS Email,
                LTRIM(RTRIM(ISNULL(Rut, ''))) AS Rut,
                LTRIM(RTRIM(ISNULL(Tipo, 'U'))) AS Tipo,
                LTRIM(RTRIM(ISNULL(Unidad, 'cmds'))) AS Unidad,
                LEN(LTRIM(RTRIM(ISNULL(Clave, '')))) AS LongitudClave,
                CASE WHEN PasswordHash IS NOT NULL AND LTRIM(RTRIM(PasswordHash)) <> '' THEN 1 ELSE 0 END AS TieneHashBcrypt,
                ISNULL(Activo, 1) AS Activo,
                ISNULL(DebeCambiarClave, 0) AS DebeCambiarClave,
                ISNULL(IntentosFallidos, 0) AS IntentosFallidos,
                CONVERT(varchar, BloqueadoHasta, 120) AS BloqueadoHasta,
                CONVERT(varchar, UltimoAcceso, 120) AS UltimoAcceso,
                CONVERT(varchar, UltimoCambioClave, 120) AS UltimoCambioClave,
                CONVERT(varchar, FechaCreacion, 120) AS FechaCreacion
            FROM Usuarios
            WHERE Usuario IS NOT NULL AND LTRIM(RTRIM(Usuario)) <> ''
            ORDER BY LTRIM(RTRIM(Usuario)) ASC
        `);

        const now = new Date();
        const usuarios = (usersRes.recordset || []).map(r => {
            const bloqDate = r.BloqueadoHasta ? new Date(r.BloqueadoHasta) : null;
            const estaBloqueadoTemporal = Boolean(bloqDate && !isNaN(bloqDate.getTime()) && bloqDate > now);
            const tipoNorm = String(r.Tipo || 'U').trim().toUpperCase();
            return {
                Usuario: r.Usuario,
                NombreCompleto: r.NombreCompleto || r.Usuario,
                Email: r.Email || '',
                Rut: r.Rut || '',
                Tipo: r.Tipo,
                TipoNormalizado: ['A', 'G', 'U', 'M', 'P'].includes(tipoNorm) ? tipoNorm : 'A',
                RolDescripcion: ROLES_CATALOGO[tipoNorm] || `Administrador (${r.Tipo})`,
                Unidad: r.Unidad || 'cmds',
                LongitudClave: Number(r.LongitudClave || 0),
                TieneHashBcrypt: Number(r.TieneHashBcrypt) === 1,
                Activo: Number(r.Activo) === 1,
                DebeCambiarClave: Number(r.DebeCambiarClave) === 1,
                IntentosFallidos: Number(r.IntentosFallidos || 0),
                BloqueadoHasta: r.BloqueadoHasta || null,
                EstaBloqueadoTemporal: estaBloqueadoTemporal,
                UltimoAcceso: r.UltimoAcceso || null,
                UltimoCambioClave: r.UltimoCambioClave || null,
                FechaCreacion: r.FechaCreacion || null
            };
        });

        let accesosHoy = 0;
        let fallidosHoy = 0;
        try {
            const audKpiRes = await pool.request().query(`
                SELECT
                    SUM(CASE WHEN Evento = 'LOGIN_OK' THEN 1 ELSE 0 END) AS AccesosHoy,
                    SUM(CASE WHEN Evento IN ('LOGIN_FAIL', 'LOCKOUT') THEN 1 ELSE 0 END) AS FallidosHoy
                FROM LIC_AUDITORIA_ACCESOS
                WHERE YEAR(FechaHora) = YEAR(GETDATE())
                  AND MONTH(FechaHora) = MONTH(GETDATE())
                  AND DAY(FechaHora) = DAY(GETDATE())
            `);
            const kRow = audKpiRes.recordset?.[0] || {};
            accesosHoy = Number(kRow.AccesosHoy || 0);
            fallidosHoy = Number(kRow.FallidosHoy || 0);
        } catch {}

        const resumen = {
            totalUsuarios: usuarios.length,
            usuariosActivos: usuarios.filter(u => u.Activo).length,
            usuariosSuspendidos: usuarios.filter(u => !u.Activo).length,
            usuariosBloqueados: usuarios.filter(u => u.EstaBloqueadoTemporal).length,
            usuariosConBcrypt: usuarios.filter(u => u.TieneHashBcrypt).length,
            usuariosCambioClavePendiente: usuarios.filter(u => u.DebeCambiarClave).length,
            accesosHoy,
            fallidosHoy
        };

        res.json({
            status: 'ok',
            resumen,
            usuarios
        });
    } catch (err) {
        console.error('Error en GET /api/usuarios:', err);
        res.status(500).json({ status: 'error', message: 'Error obteniendo listado de usuarios' });
    }
});

// 2. Crear nuevo usuario
router.post('/', async (req, res) => {
    try {
        const pool = req.db;
        const {
            usuario,
            password,
            nombreCompleto,
            email,
            rut,
            tipo = 'U',
            unidad = 'cmds',
            debeCambiarClave = true
        } = req.body;

        const userClean = String(usuario || '').trim();
        const passClean = String(password || '').trim();

        if (!userClean) {
            return res.status(400).json({ status: 'error', message: 'El nombre de usuario es obligatorio.' });
        }
        if (userClean.length > 10) {
            return res.status(400).json({
                status: 'error',
                message: 'El identificador de Usuario debe tener máximo 10 caracteres (por compatibilidad con la tabla Usuarios).'
            });
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(userClean)) {
            return res.status(400).json({
                status: 'error',
                message: 'El usuario solo puede contener letras, números, puntos o guiones (sin espacios).'
            });
        }
        if (passClean.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'La contraseña debe tener al menos 6 caracteres.'
            });
        }

        // Verificar si ya existe
        const existRes = await pool
            .request()
            .input('u', sql.NVarChar, userClean)
            .query(`SELECT TOP 1 Usuario FROM Usuarios WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@u)`);

        if (existRes.recordset && existRes.recordset.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: `El usuario "${userClean}" ya existe en el sistema.`
            });
        }

        const hash = await bcrypt.hash(passClean, BCRYPT_ROUNDS);
        // Sincronizar columna Clave (máx 10 caracteres en tabla legada)
        const claveLegada = passClean.slice(0, 10);
        const tipoClean = String(tipo || 'U').trim().toUpperCase().slice(0, 10);
        const unidadClean = String(unidad || 'cmds').trim().slice(0, 200);
        const nombreClean = String(nombreCompleto || userClean).trim().slice(0, 120);
        const emailClean = String(email || '').trim().slice(0, 120);
        const rutClean = String(rut || '').trim().slice(0, 20);
        const debeCambiarInt = debeCambiarClave ? 1 : 0;

        await pool
            .request()
            .input('Usuario', sql.NVarChar, userClean)
            .input('Clave', sql.NVarChar, claveLegada)
            .input('PasswordHash', sql.NVarChar, hash)
            .input('NombreCompleto', sql.NVarChar, nombreClean)
            .input('Email', sql.NVarChar, emailClean)
            .input('Rut', sql.NVarChar, rutClean)
            .input('Tipo', sql.NVarChar, tipoClean)
            .input('Unidad', sql.NVarChar, unidadClean)
            .input('DebeCambiarClave', sql.Int, debeCambiarInt)
            .query(`
                INSERT INTO Usuarios (
                    Usuario, Clave, PasswordHash, NombreCompleto, Email, Rut, Tipo, Unidad,
                    Activo, DebeCambiarClave, IntentosFallidos, UltimoCambioClave, FechaCreacion
                )
                VALUES (
                    @Usuario, @Clave, @PasswordHash, @NombreCompleto, @Email, @Rut, @Tipo, @Unidad,
                    1, @DebeCambiarClave, 0, GETDATE(), GETDATE()
                )
            `);

        invalidateUserCache(userClean);
        await registrarAuditoriaAcceso(pool, {
            usuario: req.user.username,
            evento: 'USER_CREATE',
            detalle: `Creó usuario "${userClean}" (Rol: ${tipoClean}, Unidad: ${unidadClean}, CambioClave: ${debeCambiarInt ? 'SÍ' : 'NO'})`,
            req,
            exitoso: true
        });

        res.json({
            status: 'ok',
            message: `Usuario "${userClean}" creado correctamente con contraseña encriptada (Bcrypt).`
        });
    } catch (err) {
        console.error('Error en POST /api/usuarios:', err);
        res.status(500).json({ status: 'error', message: 'Error al crear el usuario.' });
    }
});

// 3. Editar datos y perfil de un usuario existente
router.put('/:usuario', async (req, res) => {
    try {
        const pool = req.db;
        const targetUser = String(req.params.usuario || '').trim();
        const {
            nombreCompleto,
            email,
            rut,
            tipo,
            unidad,
            activo,
            debeCambiarClave
        } = req.body;

        if (!targetUser) {
            return res.status(400).json({ status: 'error', message: 'Usuario no especificado.' });
        }

        const isSelf = req.user.username.toLowerCase() === targetUser.toLowerCase();
        if (isSelf && activo === false) {
            return res.status(400).json({
                status: 'error',
                message: 'No puede suspender su propia cuenta de Administrador en sesión.'
            });
        }

        const tipoClean = String(tipo || 'U').trim().toUpperCase().slice(0, 10);
        const unidadClean = String(unidad || 'cmds').trim().slice(0, 200);
        const nombreClean = String(nombreCompleto || targetUser).trim().slice(0, 120);
        const emailClean = String(email || '').trim().slice(0, 120);
        const rutClean = String(rut || '').trim().slice(0, 20);
        const activoInt = activo === undefined ? 1 : (activo ? 1 : 0);
        const debeCambiarInt = debeCambiarClave ? 1 : 0;

        await pool
            .request()
            .input('Target', sql.NVarChar, targetUser)
            .input('NombreCompleto', sql.NVarChar, nombreClean)
            .input('Email', sql.NVarChar, emailClean)
            .input('Rut', sql.NVarChar, rutClean)
            .input('Tipo', sql.NVarChar, tipoClean)
            .input('Unidad', sql.NVarChar, unidadClean)
            .input('Activo', sql.Int, activoInt)
            .input('DebeCambiarClave', sql.Int, debeCambiarInt)
            .query(`
                UPDATE Usuarios
                SET NombreCompleto = @NombreCompleto,
                    Email = @Email,
                    Rut = @Rut,
                    Tipo = @Tipo,
                    Unidad = @Unidad,
                    Activo = @Activo,
                    DebeCambiarClave = @DebeCambiarClave
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);

        invalidateUserCache(targetUser);
        await registrarAuditoriaAcceso(pool, {
            usuario: req.user.username,
            evento: 'USER_UPDATE',
            detalle: `Actualizó usuario "${targetUser}" (Rol: ${tipoClean}, Unidad: ${unidadClean}, Activo: ${activoInt ? 'SÍ' : 'NO'})`,
            req,
            exitoso: true
        });

        res.json({
            status: 'ok',
            message: `Perfil del usuario "${targetUser}" actualizado correctamente.`
        });
    } catch (err) {
        console.error('Error en PUT /api/usuarios/:usuario:', err);
        res.status(500).json({ status: 'error', message: 'Error actualizando el usuario.' });
    }
});

// 4. Cambiar estado rápido (Suspender, Activar, Desbloquear o Forzar Cambio de Clave)
router.patch('/:usuario/estado', async (req, res) => {
    try {
        const pool = req.db;
        const targetUser = String(req.params.usuario || '').trim();
        const { accion } = req.body; // 'suspender' | 'activar' | 'desbloquear' | 'forzar-cambio-clave' | 'quitar-cambio-clave'

        if (!targetUser || !accion) {
            return res.status(400).json({ status: 'error', message: 'Usuario y acción son requeridos.' });
        }

        const isSelf = req.user.username.toLowerCase() === targetUser.toLowerCase();
        if (isSelf && accion === 'suspender') {
            return res.status(400).json({
                status: 'error',
                message: 'No puede suspender su propia cuenta activa.'
            });
        }

        const reqDb = pool.request().input('Target', sql.NVarChar, targetUser);
        let evento = 'USER_STATE';
        let detalle = '';
        let msg = '';

        if (accion === 'suspender') {
            await reqDb.query(`
                UPDATE Usuarios
                SET Activo = 0
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);
            evento = 'USER_SUSPEND';
            detalle = `Suspendió el acceso del usuario "${targetUser}"`;
            msg = `El usuario "${targetUser}" ha sido suspendido inmediatamente.`;
        } else if (accion === 'activar') {
            await reqDb.query(`
                UPDATE Usuarios
                SET Activo = 1,
                    IntentosFallidos = 0,
                    BloqueadoHasta = NULL
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);
            evento = 'USER_ACTIVATE';
            detalle = `Reactivó la cuenta del usuario "${targetUser}"`;
            msg = `El usuario "${targetUser}" ha sido reactivado.`;
        } else if (accion === 'desbloquear') {
            await reqDb.query(`
                UPDATE Usuarios
                SET IntentosFallidos = 0,
                    BloqueadoHasta = NULL
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);
            evento = 'USER_UNLOCK';
            detalle = `Desbloqueó intentos fallidos del usuario "${targetUser}"`;
            msg = `Cuenta "${targetUser}" desbloqueada correctamente.`;
        } else if (accion === 'forzar-cambio-clave') {
            await reqDb.query(`
                UPDATE Usuarios
                SET DebeCambiarClave = 1
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);
            evento = 'USER_FORCE_PASS_CHG';
            detalle = `Activó cambio obligatorio de contraseña en próximo login para "${targetUser}"`;
            msg = `Se solicitará cambio de contraseña a "${targetUser}" en su próximo ingreso.`;
        } else if (accion === 'quitar-cambio-clave') {
            await reqDb.query(`
                UPDATE Usuarios
                SET DebeCambiarClave = 0
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);
            evento = 'USER_CLEAR_PASS_CHG';
            detalle = `Desactivó exigencia de cambio de contraseña para "${targetUser}"`;
            msg = `Se quitó la exigencia de cambio de contraseña para "${targetUser}".`;
        } else {
            return res.status(400).json({ status: 'error', message: 'Acción no reconocida.' });
        }

        invalidateUserCache(targetUser);
        await registrarAuditoriaAcceso(pool, {
            usuario: req.user.username,
            evento,
            detalle,
            req,
            exitoso: true
        });

        res.json({ status: 'ok', message: msg });
    } catch (err) {
        console.error('Error en PATCH /api/usuarios/:usuario/estado:', err);
        res.status(500).json({ status: 'error', message: 'Error cambiando estado del usuario.' });
    }
});

// 5. Resetear contraseña de un usuario (por el Administrador)
router.post('/:usuario/reset-password', async (req, res) => {
    try {
        const pool = req.db;
        const targetUser = String(req.params.usuario || '').trim();
        const { nuevaPassword, debeCambiarClave = true } = req.body;

        const passClean = String(nuevaPassword || '').trim();
        if (!targetUser || passClean.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'La nueva contraseña debe tener al menos 6 caracteres.'
            });
        }

        const hash = await bcrypt.hash(passClean, BCRYPT_ROUNDS);
        const claveLegada = passClean.slice(0, 10);
        const debeCambiarInt = debeCambiarClave ? 1 : 0;

        await pool
            .request()
            .input('Target', sql.NVarChar, targetUser)
            .input('Clave', sql.NVarChar, claveLegada)
            .input('PasswordHash', sql.NVarChar, hash)
            .input('DebeCambiarClave', sql.Int, debeCambiarInt)
            .query(`
                UPDATE Usuarios
                SET Clave = @Clave,
                    PasswordHash = @PasswordHash,
                    DebeCambiarClave = @DebeCambiarClave,
                    IntentosFallidos = 0,
                    BloqueadoHasta = NULL,
                    UltimoCambioClave = GETDATE()
                WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)
            `);

        invalidateUserCache(targetUser);
        await registrarAuditoriaAcceso(pool, {
            usuario: req.user.username,
            evento: 'USER_RESET_PASS',
            detalle: `Reseteó contraseña del usuario "${targetUser}" (Forzar cambio al ingresar: ${debeCambiarInt ? 'SÍ' : 'NO'})`,
            req,
            exitoso: true
        });

        res.json({
            status: 'ok',
            message: `Contraseña de "${targetUser}" actualizada y encriptada con Bcrypt.`
        });
    } catch (err) {
        console.error('Error en POST /api/usuarios/:usuario/reset-password:', err);
        res.status(500).json({ status: 'error', message: 'Error al resetear la contraseña.' });
    }
});

// 6. Eliminar usuario
router.delete('/:usuario', async (req, res) => {
    try {
        const pool = req.db;
        const targetUser = String(req.params.usuario || '').trim();
        if (!targetUser) {
            return res.status(400).json({ status: 'error', message: 'Usuario requerido.' });
        }
        if (req.user.username.toLowerCase() === targetUser.toLowerCase()) {
            return res.status(400).json({
                status: 'error',
                message: 'No puede eliminar su propia cuenta de usuario activa.'
            });
        }

        await pool
            .request()
            .input('Target', sql.NVarChar, targetUser)
            .query(`DELETE FROM Usuarios WHERE LOWER(LTRIM(RTRIM(Usuario))) = LOWER(@Target)`);

        invalidateUserCache(targetUser);
        await registrarAuditoriaAcceso(pool, {
            usuario: req.user.username,
            evento: 'USER_DELETE',
            detalle: `Eliminó la cuenta de usuario "${targetUser}"`,
            req,
            exitoso: true
        });

        res.json({ status: 'ok', message: `Usuario "${targetUser}" eliminado correctamente.` });
    } catch (err) {
        console.error('Error en DELETE /api/usuarios/:usuario:', err);
        res.status(500).json({ status: 'error', message: 'Error eliminando el usuario.' });
    }
});

// 7. Consultar Bitácora de Auditoría de Accesos y Eventos de Seguridad
router.get('/auditoria', async (req, res) => {
    try {
        const pool = req.db;
        const { usuario, evento, limit = 250 } = req.query;
        const topN = Math.min(Math.max(parseInt(limit, 10) || 250, 20), 1000);

        const reqDb = pool.request();
        let whereClause = ' WHERE 1=1 ';
        if (usuario && String(usuario).trim()) {
            reqDb.input('Usuario', sql.NVarChar, `%${String(usuario).trim()}%`);
            whereClause += ' AND Usuario LIKE @Usuario ';
        }
        if (evento && String(evento).trim()) {
            reqDb.input('Evento', sql.NVarChar, String(evento).trim());
            whereClause += ' AND Evento = @Evento ';
        }

        const audRes = await reqDb.query(`
            SELECT TOP ${topN}
                Id,
                CONVERT(varchar, FechaHora, 120) AS FechaHora,
                LTRIM(RTRIM(Usuario)) AS Usuario,
                LTRIM(RTRIM(Evento)) AS Evento,
                LTRIM(RTRIM(ISNULL(Detalle, ''))) AS Detalle,
                LTRIM(RTRIM(ISNULL(IpOrigen, ''))) AS IpOrigen,
                LTRIM(RTRIM(ISNULL(UserAgent, ''))) AS UserAgent,
                ISNULL(Exitoso, 1) AS Exitoso
            FROM LIC_AUDITORIA_ACCESOS
            ${whereClause}
            ORDER BY Id DESC
        `);

        res.json({
            status: 'ok',
            registros: audRes.recordset || []
        });
    } catch (err) {
        console.error('Error en GET /api/usuarios/auditoria:', err);
        res.status(500).json({ status: 'error', message: 'Error obteniendo bitácora de auditoría de accesos.' });
    }
});

module.exports = router;
