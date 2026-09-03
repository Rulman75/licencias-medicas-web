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

app.get('/api/dashboard/inicio-stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const year = req.query.year;
        
        let yearFilter = '';
        if (year && year !== '') {
            yearFilter = ` AND YEAR(Desde) = @Year`;
        }

        const query = `
            SELECT 
                SUM(CASE WHEN RTRIM(ISNULL(PagoDirecto, '')) NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra', 'PPP') THEN 1 ELSE 0 END) as Convenio,
                SUM(CASE WHEN RTRIM(ISNULL(PagoDirecto, '')) = 'Pago Directo' THEN 1 ELSE 0 END) as PagoDirecto,
                SUM(CASE WHEN RTRIM(ISNULL(PagoDirecto, '')) IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra') THEN 1 ELSE 0 END) as Reposo
            FROM LIC_LICENCIA_ACTUAL
            WHERE 1=1 ${yearFilter}
        `;
        
        const request = pool.request();
        if (year && year !== '') {
            request.input('Year', sql.Int, parseInt(year));
        }
        
        const result = await request.query(query);
        res.json({ status: 'ok', data: result.recordset[0] });
    } catch (err) {
        console.error('Inicio Stats error:', err);
        res.status(500).json({ status: 'error', message: 'Error obteniendo estadisticas de inicio' });
    }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const { year, startYear, sector, codUnidad, codSalud, vigencia, modulo, mutualidad, tipoSiniestro, tipoAlta } = req.query;
        
        const reqDb = pool.request();

        let condition = `NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra', 'PPP')`;
        if (modulo === 'reposo') {
            condition = `IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        } else if (modulo === 'pago-directo') {
            condition = `= 'Pago Directo'`;
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
            if (modulo === 'reposo') {
                filters += " AND RTRIM(ISNULL(L.Tipo_Siniestro, '')) = @TipoSiniestro ";
            } else {
                filters += " AND RTRIM(ISNULL(L.Tipo_enferm, '')) = @TipoSiniestro ";
            }
            reqDb.input('TipoSiniestro', sql.NVarChar, tipoSiniestro);
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
        const qPagadas = await reqDb.query(buildQuery("AND EXISTS (SELECT 1 FROM LIC_DETALLE_PAGO_ACTUAL b WHERE b.NumeroLicencia = L.NumeroLicencia)"));

        // 3. Licencias NO pagadas (Impagas)
        const qNoPagadas = await reqDb.query(buildQuery("AND NOT EXISTS (SELECT 1 FROM LIC_DETALLE_PAGO_ACTUAL b WHERE b.NumeroLicencia = L.NumeroLicencia)"));

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


// Dashboard advanced stats endpoint
app.get('/api/dashboard/advanced-stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const { year, startYear, sector, codUnidad, codSalud, vigencia, modulo, mutualidad, tipoSiniestro, tipoAlta } = req.query;
        
        const reqDb = pool.request();

        let condition = "NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra', 'PPP')";
        if (modulo === 'reposo') {
            condition = "IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')";
        } else if (modulo === 'pago-directo') {
            condition = "= 'Pago Directo'";
        }

        let baseFromAndJoins = `
            FROM LIC_LICENCIA_ACTUAL L
            LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HPA 
                ON HPA.Rut = L.RutFuncionario 
                AND HPA.Anio = YEAR(L.Desde) 
                AND HPA.Mes = MONTH(L.Desde)
            LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            LEFT JOIN LIC_SALUD S ON HPA.CodSalud = S.CodSalud
            LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
        `;

        let filters = "";
        if (year) {
            filters += " AND YEAR(L.Desde) = @Year ";
            reqDb.input('Year', require('mssql').Int, parseInt(year, 10));
        }
        if (startYear) {
            filters += " AND YEAR(L.Desde) >= @StartYear ";
            reqDb.input('StartYear', require('mssql').Int, parseInt(startYear, 10));
        }
        if (sector === 'educacion') {
            filters += " AND F.CodUnidad < 600 ";
        } else if (sector === 'salud') {
            filters += " AND F.CodUnidad >= 600 ";
        }
        if (codUnidad) {
            filters += " AND F.CodUnidad = @CodUnidad ";
            reqDb.input('CodUnidad', require('mssql').Int, parseInt(codUnidad, 10));
        }
        if (codSalud && modulo !== 'reposo') {
            filters += " AND S.CodSalud = @CodSalud ";
            reqDb.input('CodSalud', require('mssql').Int, parseInt(codSalud, 10));
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
            reqDb.input('Vigencia', require('mssql').VarChar, vigencia);
        }
        if (tipoSiniestro) {
            if (modulo === 'reposo') {
                filters += " AND RTRIM(ISNULL(L.Tipo_Siniestro, '')) = @TipoSiniestro ";
            } else {
                filters += " AND RTRIM(ISNULL(L.Tipo_enferm, '')) = @TipoSiniestro ";
            }
            reqDb.input('TipoSiniestro', require('mssql').NVarChar, tipoSiniestro);
        }
        if (tipoAlta) {
            filters += " AND RTRIM(ISNULL(L.altaAchs, '')) = @TipoAlta ";
            reqDb.input('TipoAlta', require('mssql').VarChar, tipoAlta);
        }

        const baseWhere = `WHERE RTRIM(ISNULL(L.PagoDirecto, '')) ${condition} ${filters}`;

        // 1. Evolucion Mensual
        const qEvolucion = await reqDb.query(`
            SELECT 
                MONTH(L.Desde) as Mes,
                COUNT(DISTINCT L.NumeroLicencia) as Cantidad,
                SUM(ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) as TotalMonto
            ${baseFromAndJoins}
            ${baseWhere}
            GROUP BY MONTH(L.Desde)
            ORDER BY MONTH(L.Desde) ASC
        `);

        // 2. Top 10 Siniestros/Enfermedades
        const qSiniestros = await reqDb.query(`
            SELECT TOP 10
                ISNULL(NULLIF(RTRIM(L.Tipo_Siniestro), ''), ISNULL(NULLIF(RTRIM(L.Tipo_enferm), ''), 'Sin Especificar')) as Motivo,
                COUNT(DISTINCT L.NumeroLicencia) as Cantidad
            ${baseFromAndJoins}
            ${baseWhere}
            GROUP BY ISNULL(NULLIF(RTRIM(L.Tipo_Siniestro), ''), ISNULL(NULLIF(RTRIM(L.Tipo_enferm), ''), 'Sin Especificar'))
            ORDER BY Cantidad DESC
        `);

        // 3. Distribucion por Rangos de Dias
        const qDias = await reqDb.query(`
            SELECT 
                RangoDias as Rango,
                COUNT(*) as Cantidad
            FROM (
                SELECT 
                    L.NumeroLicencia,
                    MAX(ISNULL(L.NumDias, 0)) as Dias,
                    CASE 
                        WHEN MAX(ISNULL(L.NumDias, 0)) BETWEEN 1 AND 3 THEN '1-3 Días'
                        WHEN MAX(ISNULL(L.NumDias, 0)) BETWEEN 4 AND 7 THEN '4-7 Días'
                        WHEN MAX(ISNULL(L.NumDias, 0)) BETWEEN 8 AND 15 THEN '8-15 Días'
                        ELSE '16+ Días'
                    END as RangoDias
                ${baseFromAndJoins}
                ${baseWhere}
                GROUP BY L.NumeroLicencia
            ) T
            GROUP BY RangoDias
        `);

        // 4. Top 10 Establecimientos
        const qEstablecimientos = await reqDb.query(`
            SELECT TOP 10
                ISNULL(RTRIM(E.Descripcion), 'Sin Establecimiento') as Establecimiento,
                COUNT(DISTINCT L.NumeroLicencia) as Cantidad,
                SUM(ISNULL(L.PagoEstimado, 0) + ISNULL(L.MontoDesc, 0)) as TotalMonto
            ${baseFromAndJoins}
            ${baseWhere}
            GROUP BY ISNULL(RTRIM(E.Descripcion), 'Sin Establecimiento')
            ORDER BY Cantidad DESC
        `);

        res.json({ 
            status: 'ok', 
            data: {
                evolucion: qEvolucion.recordset,
                siniestros: qSiniestros.recordset,
                dias: qDias.recordset,
                establecimientos: qEstablecimientos.recordset
            }
        });
    } catch (error) {
        console.error('Advanced Stats error:', error);
        res.status(500).json({ status: 'error', message: 'Error obteniendo estadisticas avanzadas' });
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

        let condition = `NOT IN ('Nula', 'Pago Directo', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra', 'PPP')`;
        if (modulo === 'reposo') {
            condition = `IN ('ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra')`;
        } else if (modulo === 'pago-directo') {
            condition = `= 'Pago Directo'`;
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
            if (modulo === 'reposo') {
                query += " AND RTRIM(ISNULL(L.Tipo_Siniestro, '')) = @TipoSiniestro ";
            } else {
                query += " AND RTRIM(ISNULL(L.Tipo_enferm, '')) = @TipoSiniestro ";
            }
            request.input('TipoSiniestro', sql.NVarChar, tipoSiniestro);
        }
        if (tipoAlta) {
            query += " AND RTRIM(ISNULL(L.altaAchs, '')) = @TipoAlta ";
            request.input('TipoAlta', sql.VarChar, tipoAlta);
        }

        // Condición para el tipo de detalle
        if (type === 'pagadas') {
            query += ` AND EXISTS (SELECT 1 FROM LIC_DETALLE_PAGO_ACTUAL b WHERE b.NumeroLicencia = L.NumeroLicencia) `;
        } else if (type === 'impagas') {
            query += ` AND NOT EXISTS (SELECT 1 FROM LIC_DETALLE_PAGO_ACTUAL b WHERE b.NumeroLicencia = L.NumeroLicencia) `;
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


// Info Gestión - Funcionarios
app.get('/api/info-gestion/funcionarios', async (req, res) => {
    try {
        const pool = await getConnection();
        const { fechaDesde, fechaHasta, minDias, unidad, sucursal, rutFiltro } = req.query;
        
        let desde = fechaDesde || '2024-08-01';
        let hasta = fechaHasta || '2026-08-31';
        let dias = parseInt(minDias, 10) || 180;

        const reqDb = pool.request();
        reqDb.input('Desde', sql.Date, desde);
        reqDb.input('Hasta', sql.Date, hasta);
        reqDb.input('MinDias', sql.Int, dias);

        let dynamicFilters = "";
        if (unidad) {
            dynamicFilters += " AND P.[NOMBRE UNIDAD] = @Unidad ";
            reqDb.input('Unidad', sql.NVarChar, unidad);
        }
        if (sucursal) {
            dynamicFilters += " AND P.NOMBRE_SUCURSAL = @Sucursal ";
            reqDb.input('Sucursal', sql.NVarChar, sucursal);
        }
        if (rutFiltro) {
            dynamicFilters += " AND P.[RUT EMPLEADO] = @RutFiltro ";
            reqDb.input('RutFiltro', sql.VarChar, rutFiltro);
        }

        const query = `
            SELECT 
                P.[RUT EMPLEADO] as Rut, 
                P.DV as Dv, 
                P.PATERNO as Apellido_Paterno, 
                P.MATERNO as Apellido_Materno, 
                P.NOMBRE as Nombre, 
                P.NOMBRE_SUCURSAL, 
                P.[NOMBRE UNIDAD] as NOMBRE_UNIDAD, 
                SUM(L.NumDias) as Total_Dias
            FROM dbo.Personal P
            INNER JOIN dbo.LIC_LICENCIA_ACTUAL L ON L.RutFuncionario = P.[RUT EMPLEADO]
            INNER JOIN dbo.LIC_PAGO_ACTUAL LPA ON L.NumeroLicencia = LPA.NumeroLicencia
            WHERE L.Desde >= @Desde AND L.hasta <= @Hasta
            AND RTRIM(ISNULL(L.PagoDirecto, '')) NOT IN ('Nula', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra','PPP')
            AND ISNULL(L.Tipo_enferm, '') <> 'Maternal'
            ${dynamicFilters}
            GROUP BY 
                P.[RUT EMPLEADO], P.DV, P.PATERNO, P.MATERNO, P.NOMBRE, P.NOMBRE_SUCURSAL, P.[NOMBRE UNIDAD]
            HAVING SUM(L.NumDias) >= @MinDias
            ORDER BY P.[RUT EMPLEADO] DESC
        `;

        const result = await reqDb.query(query);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error en info-gestion/funcionarios:", err);
        res.status(500).json({ error: "Error al obtener info gestion", details: err.message });
    }
});


app.get('/api/info-gestion/filtros', async (req, res) => {
    try {
        const pool = await getConnection();
        
        const reqDbUnidades = pool.request();
        const unidades = await reqDbUnidades.query("SELECT DISTINCT [NOMBRE UNIDAD] as Unidad FROM dbo.Personal WHERE [NOMBRE UNIDAD] IS NOT NULL AND RTRIM([NOMBRE UNIDAD]) <> '' ORDER BY [NOMBRE UNIDAD]");
        
        const reqDbSucursales = pool.request();
        const sucursales = await reqDbSucursales.query("SELECT DISTINCT NOMBRE_SUCURSAL as Sucursal FROM dbo.Personal WHERE NOMBRE_SUCURSAL IS NOT NULL AND RTRIM(NOMBRE_SUCURSAL) <> '' ORDER BY NOMBRE_SUCURSAL");

        res.json({
            status: 'ok',
            data: {
                unidades: unidades.recordset.map(r => r.Unidad),
                sucursales: sucursales.recordset.map(r => r.Sucursal)
            }
        });
    } catch (err) {
        console.error("Error en info-gestion/filtros:", err);
        res.status(500).json({ error: "Error al obtener filtros", details: err.message });
    }
});

app.get('/api/info-gestion/funcionarios/detalle', async (req, res) => {
    try {
        const pool = await getConnection();
        const { rut, fechaDesde, fechaHasta } = req.query;
        
        let desde = fechaDesde || '2024-08-01';
        let hasta = fechaHasta || '2026-08-31';

        const reqDb = pool.request();
        reqDb.input('Rut', sql.VarChar, rut.toString());
        reqDb.input('Desde', sql.Date, desde);
        reqDb.input('Hasta', sql.Date, hasta);

        const query = `
            SELECT 
                L.NumeroLicencia, 
                L.Desde, 
                L.hasta as Hasta, 
                L.NumDias, 
                L.Tipo_enferm, 
                L.PagoDirecto,
                LPA.TotalPagado
            FROM dbo.LIC_LICENCIA_ACTUAL L
            INNER JOIN dbo.LIC_PAGO_ACTUAL LPA ON L.NumeroLicencia = LPA.NumeroLicencia
            WHERE L.RutFuncionario = @Rut
            AND L.Desde >= @Desde AND L.hasta <= @Hasta
            AND RTRIM(ISNULL(L.PagoDirecto, '')) NOT IN ('Nula', 'ACHS', 'ACHS OR', 'Mutual', 'Mutual OR', 'Otra','PPP')
            AND ISNULL(L.Tipo_enferm, '') <> 'Maternal'
            ORDER BY L.Desde DESC
        `;

        const result = await reqDb.query(query);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error en info-gestion/funcionarios/detalle:", err);
        res.status(500).json({ error: "Error al obtener detalle", details: err.message });
    }
});


// Info Gestin - Pago Licencias (Rechazadas y Sin Resolucin)
app.get('/api/info-gestion/pago-licencias', async (req, res) => {
    try {
        const pool = await getConnection();
        const { tipo, fechaDesde, fechaHasta, rutFiltro } = req.query;
        
        let desde = fechaDesde || '2024-01-01';
        let hasta = fechaHasta || '2026-12-31';

        const reqDb = pool.request();
        reqDb.input('Desde', sql.Date, desde);
        reqDb.input('Hasta', sql.Date, hasta);

        let tipoCondition = "";
        if (tipo === 'rechazadas') {
            tipoCondition = " AND L.Rechazo = 1 ";
        } else if (tipo === 'sin-resolucion') {
            tipoCondition = " AND L.Rechazo = 0 AND ISNULL(RTRIM(CAST(L.Obser_apelacion AS NVARCHAR(MAX))), '') = '' ";
        } else {
            return res.status(400).json({ error: "Tipo invalido" });
        }

        let rutCondition = "";
        if (rutFiltro) {
            rutCondition = " AND P.[RUT EMPLEADO] = @RutFiltro ";
            reqDb.input('RutFiltro', sql.VarChar, rutFiltro);
        }

        const query = `
            SELECT 
                P.[RUT EMPLEADO] AS Rut, 
                P.DV AS Dv, 
                P.PATERNO AS Apellido_Paterno, 
                P.MATERNO AS Apellido_Materno, 
                P.NOMBRE AS Nombre, 
                P.NOMBRE_SUCURSAL AS Sector, 
                P.[NOMBRE UNIDAD] AS Unidad,
                L.NumeroLicencia, 
                L.Desde, 
                L.Hasta, 
                L.NumDias,
                L.Obser_apelacion,
                ISNULL(L.MontoDesc, 0) AS MontoDesc,
                ISNULL(L.PagoEstimado, 0) AS PagoEstimado,
                ISNULL(Detalle.TotalMonto, ISNULL(L.MontoDesc, 0)) AS PagoRecuperado,
                (ISNULL(L.PagoEstimado, 0) - ISNULL(Detalle.TotalMonto, ISNULL(L.MontoDesc, 0))) AS PagoPorRecuperar,
                (ISNULL(CAST(REPLACE(P.[TOT HABERES], ',', '.') AS FLOAT), 0) - ISNULL(CAST(REPLACE(P.[TOT DESCTOS], ',', '.') AS FLOAT), 0)) AS Liquidez,
                Detalle.NumPagos
            FROM dbo.LIC_LICENCIA_ACTUAL L
            INNER JOIN dbo.Personal P ON L.RutFuncionario = P.[RUT EMPLEADO]
            LEFT JOIN (
                SELECT NumeroLicencia, SUM(Monto) as TotalMonto, COUNT(*) as NumPagos
                FROM dbo.LIC_DETALLE_PAGO_ACTUAL
                GROUP BY NumeroLicencia
            ) Detalle ON L.NumeroLicencia = Detalle.NumeroLicencia
            WHERE L.Desde >= @Desde AND L.Hasta <= @Hasta
            AND RTRIM(P.VIGENCIA) = 'S'
            ${tipoCondition}
            ${rutCondition}
            ORDER BY L.Desde DESC
        `;

        const result = await reqDb.query(query);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error en info-gestion/pago-licencias:", err);
        res.status(500).json({ error: "Error al obtener informacion", details: err.message });
    }
});

// Info Gestin - Pago Licencias Detalle
app.get('/api/info-gestion/pago-licencias/detalle', async (req, res) => {
    try {
        const pool = await getConnection();
        const { numeroLicencia } = req.query;
        
        if (!numeroLicencia) return res.status(400).json({ error: 'numeroLicencia requerido' });

        const reqDb = pool.request();
        reqDb.input('NumeroLicencia', sql.NVarChar, numeroLicencia);

        const query = `
            SELECT * 
            FROM dbo.LIC_DETALLE_PAGO_ACTUAL
            WHERE NumeroLicencia = @NumeroLicencia
            ORDER BY FechaDepCtaCte DESC
        `;

        const result = await reqDb.query(query);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error en info-gestion/pago-licencias/detalle:", err);
        res.status(500).json({ error: "Error al obtener detalle de pagos", details: err.message });
    }
});

// Catch-all para que React Router funcione con URLs directas
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile('index.html', { root: path.join(__dirname, 'public') });
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
