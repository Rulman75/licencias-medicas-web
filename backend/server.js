const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getConnection, sql } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir la aplicación React unificada (Frontend compilado)
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;

// Simple route to test DB connection
app.get('/api/health', async (req, res) => {
    try {
        const pool = await getConnection();
        res.json({ status: 'ok', message: 'Backend is running and connected to DB.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'DB Connection failed', error: error.message });
    }
});

// Inject pool for reposo routes
app.use('/api/reposo', async (req, res, next) => {
    try {
        req.db = await getConnection();
        next();
    } catch (e) {
        res.status(500).json({ error: 'DB connection error' });
    }
}, require('./routes/reposo'));

const jwt = require('jsonwebtoken');

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Usuario y contraseña son requeridos' });
    }

    try {
        const pool = await getConnection();
        // The table columns are nchar, so we use rtrim to remove trailing spaces if any
        const result = await pool.request()
            .input('user', sql.NVarChar, username)
            .input('pass', sql.NVarChar, password)
            .query(`
                SELECT RTRIM(Usuario) as Usuario, RTRIM(Tipo) as Tipo, RTRIM(Unidad) as Unidad 
                FROM Usuarios 
                WHERE RTRIM(Usuario) = @user AND RTRIM(Clave) = @pass
            `);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            const token = jwt.sign(
                { username: user.Usuario, tipo: user.Tipo, unidad: user.Unidad }, 
                process.env.JWT_SECRET || 'secret', 
                { expiresIn: '8h' }
            );
            res.json({ status: 'ok', token, user });
        } else {
            res.status(401).json({ status: 'error', message: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
    }
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const { year, startYear, sector, codUnidad, codSalud, vigencia, modulo, mutualidad, tipoSiniestro, tipoAlta } = req.query;
        
        const reqDb = pool.request();

        let condition = `NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        if (modulo === 'reposo') {
            condition = `IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        }

        let baseFromAndJoins = `
            FROM LIC_LICENCIA_ACTUAL L
            LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HPA 
                ON HPA.Rut = L.RutFuncionario 
                AND HPA.Anio = YEAR(L.Desde) 
                AND HPA.Mes = MONTH(L.Desde)
            LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            LEFT JOIN LIC_SALUD S ON HPA.CodSalud = S.CodSalud
        `;

        let filters = "";
        if (year) {
            filters += " AND YEAR(L.Desde) = @Year ";
            reqDb.input('Year', sql.Int, parseInt(year, 10));
        }
        if (startYear) {
            filters += " AND YEAR(L.Desde) >= @StartYear ";
            reqDb.input('StartYear', sql.Int, parseInt(startYear, 10));
        }
        if (sector === 'educacion') {
            filters += " AND F.CodUnidad < 600 ";
        } else if (sector === 'salud') {
            filters += " AND F.CodUnidad >= 600 ";
        }
        if (codUnidad) {
            filters += " AND F.CodUnidad = @CodUnidad ";
            reqDb.input('CodUnidad', sql.Int, parseInt(codUnidad, 10));
        }
        if (codSalud && modulo !== 'reposo') {
            filters += " AND S.CodSalud = @CodSalud ";
            reqDb.input('CodSalud', sql.Int, parseInt(codSalud, 10));
        }
        if (mutualidad && modulo === 'reposo') {
            if (mutualidad === 'ACHS') {
                filters += " AND RTRIM(ISNULL(L.PagoDirecto, '')) IN ('ACHS', 'ACHS OR') ";
            } else if (mutualidad === 'Mutual') {
                filters += " AND RTRIM(ISNULL(L.PagoDirecto, '')) IN ('Mutual', 'Mutual OR') ";
            }
        }
        if (vigencia) {
            filters += " AND F.vigencia = @Vigencia ";
            reqDb.input('Vigencia', sql.VarChar, vigencia);
        }
        if (tipoSiniestro) {
            filters += " AND RTRIM(ISNULL(L.Tipo_enferm, '')) = @TipoSiniestro ";
            reqDb.input('TipoSiniestro', sql.VarChar, tipoSiniestro);
        }
        if (tipoAlta) {
            filters += " AND RTRIM(ISNULL(L.altaAchs, '')) = @TipoAlta ";
            reqDb.input('TipoAlta', sql.VarChar, tipoAlta);
        }

        const buildQuery = (extraCondition) => `
            SELECT COUNT(*) as Cantidad, SUM(PagoEstimado) as TotalMonto
            FROM (
                SELECT L.NumeroLicencia, MAX(ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) AS PagoEstimado
                ${baseFromAndJoins}
                WHERE RTRIM(ISNULL(L.PagoDirecto, '')) ${condition}
                ${filters}
                ${extraCondition}
                GROUP BY L.NumeroLicencia
            ) T
        `;

        // 1. Universo de licencias a evaluar
        const qUniverso = await reqDb.query(buildQuery(""));

        // 2. Licencias pagadas
        const qPagadas = await reqDb.query(buildQuery("AND L.NumeroLicencia IN (SELECT b.NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL b)"));

        // 3. Licencias NO pagadas (Impagas)
        const qNoPagadas = await reqDb.query(buildQuery("AND L.NumeroLicencia NOT IN (SELECT b.NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL b)"));

        // 4. Agrupación por Sector
        const qSector = await reqDb.query(`
            SELECT GroupLabel as Label, 
                   COUNT(*) as Cantidad, 
                   SUM(PagoEstimado) as TotalMonto,
                   SUM(CASE WHEN Pagado = 1 THEN 1 ELSE 0 END) as PagadasCantidad,
                   SUM(CASE WHEN Pagado = 0 THEN 1 ELSE 0 END) as ImpagasCantidad,
                   SUM(CASE WHEN Pagado = 1 THEN PagoEstimado ELSE 0 END) as PagadasMonto,
                   SUM(CASE WHEN Pagado = 0 THEN PagoEstimado ELSE 0 END) as ImpagasMonto
            FROM (
                SELECT L.NumeroLicencia, 
                       MAX(ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) AS PagoEstimado,
                       MAX(CASE WHEN ISNULL(F.CodUnidad, 0) < 600 THEN 'Educación' ELSE 'Salud' END) as GroupLabel,
                       MAX(CASE WHEN DP.NumeroLicencia IS NOT NULL THEN 1 ELSE 0 END) as Pagado
                ${baseFromAndJoins}
                LEFT JOIN (SELECT DISTINCT NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL) DP ON DP.NumeroLicencia = L.NumeroLicencia
                WHERE RTRIM(ISNULL(L.PagoDirecto, '')) ${condition}
                ${filters}
                GROUP BY L.NumeroLicencia
            ) T
            GROUP BY GroupLabel
        `);

        // 5. Agrupación por Entidad
        const qEntidad = await reqDb.query(`
            SELECT GroupLabel as Label, 
                   COUNT(*) as Cantidad, 
                   SUM(PagoEstimado) as TotalMonto,
                   SUM(CASE WHEN Pagado = 1 THEN 1 ELSE 0 END) as PagadasCantidad,
                   SUM(CASE WHEN Pagado = 0 THEN 1 ELSE 0 END) as ImpagasCantidad,
                   SUM(CASE WHEN Pagado = 1 THEN PagoEstimado ELSE 0 END) as PagadasMonto,
                   SUM(CASE WHEN Pagado = 0 THEN PagoEstimado ELSE 0 END) as ImpagasMonto
            FROM (
                SELECT L.NumeroLicencia, 
                       MAX(ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) AS PagoEstimado,
                       MAX(ISNULL(${modulo === 'reposo' ? "RTRIM(L.PagoDirecto)" : "S.Descripcion"}, 'Sin Entidad')) as GroupLabel,
                       MAX(CASE WHEN DP.NumeroLicencia IS NOT NULL THEN 1 ELSE 0 END) as Pagado
                ${baseFromAndJoins}
                LEFT JOIN (SELECT DISTINCT NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL) DP ON DP.NumeroLicencia = L.NumeroLicencia
                WHERE RTRIM(ISNULL(L.PagoDirecto, '')) ${condition}
                ${filters}
                GROUP BY L.NumeroLicencia
            ) T
            GROUP BY GroupLabel
        `);

        res.json({ 
            status: 'ok', 
            data: {
                universo: qUniverso.recordset[0] || { Cantidad: 0, TotalMonto: 0 },
                pagadas: qPagadas.recordset[0] || { Cantidad: 0, TotalMonto: 0 },
                noPagadas: qNoPagadas.recordset[0] || { Cantidad: 0, TotalMonto: 0 },
                composicionCantidad: [
                    { name: 'Pagadas', value: qPagadas.recordset[0]?.Cantidad || 0 },
                    { name: 'Impagas', value: qNoPagadas.recordset[0]?.Cantidad || 0 }
                ],
                porSector: qSector.recordset,
                porEntidad: qEntidad.recordset
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ status: 'error', message: 'Error obteniendo estadísticas' });
    }
});

// Endpoint para dominios (Combos de filtros)
app.get('/api/dominios', async (req, res) => {
    try {
        const pool = await getConnection();
        const salud = await pool.request().query('SELECT CodSalud, Descripcion FROM LIC_SALUD ORDER BY Descripcion ASC');
        const unidades = await pool.request().query('SELECT CodUnidad, Descripcion FROM LIC_ESTABLECIMIENTO ORDER BY Descripcion ASC');
        res.json({
            status: 'ok',
            data: {
                salud: salud.recordset,
                unidades: unidades.recordset
            }
        });
    } catch (error) {
        console.error('Error fetching dominios:', error);
        res.status(500).json({ status: 'error', message: 'Error fetching dominios' });
    }
});

// Detalle de licencias (Universo, Pagadas, Impagas)
app.get('/api/licencias/detalle', async (req, res) => {
    try {
        const pool = await getConnection();
        const { year, startYear, type, sector, codUnidad, codSalud, vigencia, modulo, mutualidad, tipoSiniestro, tipoAlta } = req.query; // type: 'universo', 'pagadas', 'impagas'

        let condition = `NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        if (modulo === 'reposo') {
            condition = `IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        }

        let query = `
            SELECT 
                F.Nombre, F.Paterno, F.Materno, F.CodUnidad, 
                MAX(S.Descripcion) AS SaludDescripcion, 
                NULL AS NumeroDocumento, 
                0 AS MONTOPAG, 
                0 AS DIASPAG, 
                NULL AS concepto, 
                F.Rut, F.DV, 
                L.PagoDirecto, 
                L.NumDias AS NUMDIAS, 
                L.Desde, L.Hasta, L.NumeroLicencia, L.Maternal, L.Parcial, 
                L.Rechazo, L.Observacion, L.Estado, L.Autorizada, L.Obser_apelacion, L.Compin, 
                L.Apelacion, L.Tipo_enferm, L.MontoDesc, L.regularizado, 
                (ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) AS PagoEstimado, 
                L.Descuento, 
                L.TipoLic, 
                YEAR(L.Desde) AS año, 
                MAX(P.Descripcion) AS PrevisionDescripcion, 
                F.vigencia, L.Retenida, L.Pendiente, L.Observacion_CajaLA,
                CASE 
                    WHEN L.altaAchs = 'ADF' THEN 'Alta Diferida'
                    WHEN L.altaAchs = 'ADI' THEN 'Alta Día'
                    WHEN L.altaAchs = 'AIN' THEN 'Alta Inmediata'
                    WHEN L.altaAchs = 'TAD' THEN 'Termino Rep. Admin'
                    WHEN L.altaAchs = 'TIN' THEN 'Termino Rep. Inasi'
                END AS ALTA_ACHS,
                CASE
                    WHEN F.CodUnidad < 600 THEN 'Educación'
                    WHEN F.CodUnidad >= 600 THEN 'Salud'
                    ELSE 'Desconocido'
                END AS Sector
            FROM LIC_LICENCIA_ACTUAL L
            LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HPA 
                ON HPA.Rut = L.RutFuncionario 
                AND HPA.Anio = YEAR(L.Desde) 
                AND HPA.Mes = MONTH(L.Desde)
            LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            LEFT JOIN LIC_SALUD S ON HPA.CodSalud = S.CodSalud
            LEFT JOIN LIC_PREVISION P ON HPA.CodPrevision = P.CodPrevision
            WHERE RTRIM(ISNULL(L.PagoDirecto, '')) ${condition}
        `;

        const request = pool.request();

        if (year) {
            query += ` AND YEAR(L.Desde) = @Year `;
            request.input('Year', sql.Int, parseInt(year, 10));
        }
        if (startYear) {
            query += ` AND YEAR(L.Desde) >= @StartYear `;
            request.input('StartYear', sql.Int, parseInt(startYear, 10));
        }
        if (sector === 'educacion') {
            query += ` AND F.CodUnidad < 600 `;
        } else if (sector === 'salud') {
            query += ` AND F.CodUnidad >= 600 `;
        }
        if (codUnidad) {
            query += ` AND F.CodUnidad = @CodUnidad `;
            request.input('CodUnidad', sql.Int, parseInt(codUnidad, 10));
        }
        if (codSalud && modulo !== 'reposo') {
            query += ` AND S.CodSalud = @CodSalud `;
            request.input('CodSalud', sql.Int, parseInt(codSalud, 10));
        }
        if (mutualidad && modulo === 'reposo') {
            if (mutualidad === 'ACHS') {
                query += " AND RTRIM(ISNULL(L.PagoDirecto, '')) IN ('ACHS', 'ACHS OR') ";
            } else if (mutualidad === 'Mutual') {
                query += " AND RTRIM(ISNULL(L.PagoDirecto, '')) IN ('Mutual', 'Mutual OR') ";
            }
        }
        if (vigencia) {
            query += ` AND F.vigencia = @Vigencia `;
            request.input('Vigencia', sql.VarChar, vigencia);
        }
        if (tipoSiniestro) {
            query += " AND RTRIM(ISNULL(L.Tipo_enferm, '')) = @TipoSiniestro ";
            request.input('TipoSiniestro', sql.VarChar, tipoSiniestro);
        }
        if (tipoAlta) {
            query += " AND RTRIM(ISNULL(L.altaAchs, '')) = @TipoAlta ";
            request.input('TipoAlta', sql.VarChar, tipoAlta);
        }

        // Condición para el tipo de detalle
        if (type === 'pagadas') {
            query += ` AND L.NumeroLicencia IN (SELECT DISTINCT NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL) `;
        } else if (type === 'impagas') {
            query += ` AND L.NumeroLicencia NOT IN (SELECT b.NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL b) `;
        }

        query += `
            GROUP BY 
                F.Rut, F.DV, F.Nombre, F.Paterno, F.Materno, F.CodUnidad, 
                L.PagoDirecto, L.Desde, L.Hasta, L.NumeroLicencia, L.Maternal, L.Parcial, 
                L.Rechazo, L.Observacion, L.Estado, L.Autorizada, L.Obser_apelacion, L.Compin, 
                L.Apelacion, L.Tipo_enferm, L.MontoDesc, L.PagoEstimado, L.regularizado, 
                L.Descuento, L.TipoLic, L.NumDias, F.vigencia, L.Retenida, 
                L.Pendiente, L.Observacion_CajaLA, L.altaAchs
            ORDER BY L.NumeroLicencia ASC
        `;

        const result = await request.query(query);
        res.json({ status: 'ok', data: result.recordset });
    } catch (error) {
        console.error('Detalle error:', error);
        res.status(500).json({ status: 'error', message: 'Error obteniendo detalle' });
    }
});

// Catch-all para que React Router funcione con URLs directas
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
