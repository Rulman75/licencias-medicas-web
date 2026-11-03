const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Helper para normalizar fechas dd-mm-yyyy, dd/mm/yyyy o yyyy-mm-dd a objeto Date o string YYYY-MM-DD para SQL Server
const parseFlexibleDate = (val) => {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;
    // Formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.substring(0, 10);
    }
    // Formato DD-MM-YYYY o DD/MM/YYYY
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const yyyy = m[3];
        return `${yyyy}-${mm}-${dd}`;
    }
    return null;
};

// 1. Obtener listas de filtros (Bancos, Observaciones de cargas masivas e Importar_Pago actual)
router.get('/filtros', async (req, res) => {
    try {
        const pool = req.db;

        const bancosRes = await pool.request().query(`
            SELECT RTRIM(banco) as banco FROM BANCOS WHERE banco IS NOT NULL ORDER BY banco
        `);

        const obsRes = await pool.request().query(`
            SELECT TOP 150
                RTRIM(LTRIM(Observacion)) AS Observacion,
                CONVERT(varchar, MAX(recepcion), 23) AS UltimaRecepcion,
                COUNT(*) AS Cantidad,
                SUM(ISNULL(Monto, 0)) AS TotalMonto
            FROM LIC_DETALLE_PAGO_ACTUAL
            WHERE Observacion IS NOT NULL AND RTRIM(LTRIM(Observacion)) <> ''
              AND RTRIM(LTRIM(Observacion)) <> '""'
            GROUP BY RTRIM(LTRIM(Observacion))
            HAVING (RTRIM(LTRIM(Observacion)) LIKE 'INGRESO%' OR COUNT(*) > 1)
            ORDER BY MAX(recepcion) DESC, RTRIM(LTRIM(Observacion)) DESC
        `);

        const impRes = await pool.request().query(`
            SELECT
                RTRIM(ISNULL(col1, '')) as col1,
                RTRIM(ISNULL(col2, '')) as col2,
                RTRIM(ISNULL(col3, '')) as col3,
                RTRIM(ISNULL(col4, '')) as col4,
                RTRIM(ISNULL(col5, '')) as col5,
                RTRIM(ISNULL(col6, '')) as col6,
                RTRIM(ISNULL(col7, '')) as col7,
                RTRIM(ISNULL(col8, '')) as col8,
                RTRIM(ISNULL(col9, '')) as col9,
                RTRIM(ISNULL(col10, '')) as col10,
                RTRIM(ISNULL(col11, '')) as col11,
                RTRIM(ISNULL(col12, '')) as col12,
                RTRIM(ISNULL(col13, '')) as col13
            FROM Importar_Pago
        `);

        res.json({
            status: 'ok',
            bancos: bancosRes.recordset.map(r => r.banco),
            observaciones: obsRes.recordset,
            ultimaImportacion: impRes.recordset
        });
    } catch (err) {
        console.error('Error en GET /pagos-masivos/filtros:', err);
        res.status(500).json({ error: 'Error obteniendo filtros de pagos masivos' });
    }
});

// 2. Previsualizar archivo de Pagos Masivos antes de insertar
router.post('/previsualizar', async (req, res) => {
    try {
        const pool = req.db;
        const { registros } = req.body;
        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({ error: 'No se recibieron registros para previsualizar' });
        }

        // Extraer números de licencia únicos para validar contra LIC_LICENCIA_ACTUAL
        const licsUnicas = [...new Set(registros.map(r => String(r.col1 || '').trim()).filter(Boolean))];
        const mapaLicencias = {};

        // Consultar en lotes de 500 para evitar límite de parámetros
        const chunkSize = 500;
        for (let i = 0; i < licsUnicas.length; i += chunkSize) {
            const chunk = licsUnicas.slice(i, i + chunkSize);
            const request = pool.request();
            const params = chunk.map((val, idx) => {
                const pName = `L${idx}`;
                request.input(pName, sql.NVarChar, val);
                return `@${pName}`;
            });

            const q = await request.query(`
                SELECT 
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    RTRIM(ISNULL(L.RutFuncionario, '')) as Rut,
                    RTRIM(ISNULL(F.Nombre, '')) + ' ' + RTRIM(ISNULL(F.Paterno, '')) + ' ' + RTRIM(ISNULL(F.Materno, '')) as NombreCompleto,
                    ISNULL(L.NumDias, 0) as NumDiasLicencia,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_FUNCIONARIO F ON RTRIM(L.RutFuncionario) = RTRIM(F.Rut)
                WHERE RTRIM(L.NumeroLicencia) IN (${params.join(',')})
            `);

            for (const row of q.recordset) {
                mapaLicencias[row.NumeroLicencia] = row;
            }
        }

        const resultado = registros.map((r, idx) => {
            const numLic = String(r.col1 || '').trim();
            const infoLic = mapaLicencias[numLic] || null;
            return {
                fila: idx + 1,
                col1: numLic,
                col2: String(r.col2 || '').trim(),
                col3: String(r.col3 || '').trim(), // N° Doc
                col4: String(r.col4 || '').trim(), // Fecha Dep CtaCte
                col5: String(r.col5 || '').trim(), // Días Pagados
                col6: String(r.col6 || '').trim(), // Desde
                col7: String(r.col7 || '').trim(), // Hasta
                col8: String(r.col8 || '0').trim(), // Monto
                col9: String(r.col9 || '').trim(), // Observación
                col10: String(r.col10 || '').trim(), // Fecha Recepción
                col11: String(r.col11 || '').trim(), // Concepto
                col12: String(r.col12 || '').trim(), // Banco
                col13: String(r.col13 || '').trim(), // Cenco
                existeLicencia: Boolean(infoLic),
                rutFuncionario: infoLic ? infoLic.Rut : '',
                nombreFuncionario: infoLic ? infoLic.NombreCompleto.trim() : 'LICENCIA NO INGRESADA',
                pagoEstimado: infoLic ? infoLic.PagoEstimado : 0
            };
        });

        const totalLeidos = resultado.length;
        const totalValidos = resultado.filter(x => x.existeLicencia).length;
        const totalNoEncontrados = totalLeidos - totalValidos;
        const montoTotalValidos = resultado
            .filter(x => x.existeLicencia)
            .reduce((acc, x) => acc + (parseInt(x.col8, 10) || 0), 0);

        res.json({
            status: 'ok',
            resumen: {
                totalLeidos,
                totalValidos,
                totalNoEncontrados,
                montoTotalValidos
            },
            registros: resultado
        });
    } catch (err) {
        console.error('Error en POST /pagos-masivos/previsualizar:', err);
        res.status(500).json({ error: 'Error al previsualizar el archivo de pagos' });
    }
});

// 3. Procesar e Insertar Pagos Masivos (Replica exacta de Frm_importar_pagos.vb Button2_Click)
router.post('/procesar', async (req, res) => {
    const pool = req.db;
    const transaction = new sql.Transaction(pool);
    try {
        const { registros } = req.body;
        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({ error: 'No hay registros para procesar' });
        }

        await transaction.begin();

        // 1. Limpiar tabla temporal Importar_Pago igual que en VB.NET ("delete from Importar_Pago")
        await new sql.Request(transaction).query(`DELETE FROM Importar_Pago`);

        let leidos = 0;
        let insertados = 0;
        const licenciasNoEncontradas = [];

        for (const r of registros) {
            leidos++;
            const col1 = String(r.col1 || '').trim();
            const col2 = String(r.col2 || '').trim();
            const col3 = String(r.col3 || '').trim();
            const col4 = String(r.col4 || '').trim();
            const col5 = String(r.col5 || '0').trim();
            const col6 = String(r.col6 || '').trim();
            const col7 = String(r.col7 || '').trim();
            const col8 = String(r.col8 || '0').trim();
            const col9 = String(r.col9 || '').trim();
            const col10 = String(r.col10 || '').trim();
            const col11 = String(r.col11 || '').trim();
            const col12 = String(r.col12 || '').trim();
            const col13 = String(r.col13 || '').trim();

            if (!col1) continue;

            // Guardar en Importar_Pago
            await new sql.Request(transaction)
                .input('c1', sql.NChar, col1)
                .input('c2', sql.NChar, col2 || null)
                .input('c3', sql.NChar, col3)
                .input('c4', sql.NChar, col4)
                .input('c5', sql.NChar, col5)
                .input('c6', sql.NChar, col6)
                .input('c7', sql.NChar, col7)
                .input('c8', sql.NChar, col8)
                .input('c9', sql.NChar, col9)
                .input('c10', sql.NChar, col10)
                .input('c11', sql.NChar, col11)
                .input('c12', sql.NChar, col12)
                .input('c13', sql.NChar, col13)
                .query(`
                    INSERT INTO Importar_Pago (col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12, col13)
                    VALUES (@c1, @c2, @c3, @c4, @c5, @c6, @c7, @c8, @c9, @c10, @c11, @c12, @c13)
                `);

            // Verificar si existe en LIC_LICENCIA_ACTUAL
            const checkLic = await new sql.Request(transaction)
                .input('NumLic', sql.NVarChar, col1)
                .query(`SELECT TOP 1 NumeroLicencia FROM LIC_LICENCIA_ACTUAL WHERE RTRIM(NumeroLicencia) = @NumLic`);

            if (checkLic.recordset.length === 0) {
                licenciasNoEncontradas.push(col1);
            } else {
                const fechaDepISO = parseFlexibleDate(col4);
                const desdeISO = parseFlexibleDate(col6);
                const hastaISO = parseFlexibleDate(col7);
                const fechaRecepISO = parseFlexibleDate(col10);
                const nDias = parseInt(col5, 10) || 0;
                const monto = parseInt(col8.replace(/\./g, '').replace(/,/g, ''), 10) || 0;

                await new sql.Request(transaction)
                    .input('NumeroLicencia', sql.NVarChar, col1)
                    .input('NumeroDocumento', sql.NVarChar, col3)
                    .input('FechaDep', sql.Date, fechaDepISO)
                    .input('DiasPagados', sql.Int, nDias)
                    .input('Desde', sql.Date, desdeISO)
                    .input('Hasta', sql.Date, hastaISO)
                    .input('Monto', sql.Decimal(18, 0), monto)
                    .input('Observacion', sql.NVarChar, col9)
                    .input('Recepcion', sql.Date, fechaRecepISO)
                    .input('Concepto', sql.NVarChar, col11)
                    .input('Banco', sql.NVarChar, col12)
                    .input('Cenco', sql.NVarChar, col13)
                    .query(`
                        INSERT INTO LIC_DETALLE_PAGO_ACTUAL (
                            numerolicencia, numerodocumento, fechadepctacte, diaspagados,
                            desde, hasta, monto, observacion, recepcion, concepto, banco, correlativo, cenco
                        ) VALUES (
                            @NumeroLicencia, @NumeroDocumento, @FechaDep, @DiasPagados,
                            @Desde, @Hasta, @Monto, @Observacion, @Recepcion, @Concepto, @Banco,
                            NEXT VALUE FOR dbo.correlativo, @Cenco
                        )
                    `);
                insertados++;
            }
        }

        await transaction.commit();

        res.json({
            status: 'ok',
            message: `Proceso Terminado — Leídos: ${leidos} registros, Insertados: ${insertados} registros`,
            leidos,
            insertados,
            licenciasNoEncontradas
        });
    } catch (err) {
        await transaction.rollback();
        console.error('Error en POST /pagos-masivos/procesar:', err);
        res.status(500).json({ error: `Error procesando carga masiva: ${err.message}` });
    }
});

// 4. Auditar Pagos Masivos (Replica exacta de AuditarPagos.vb y Auditoriapagos2TableAdapter)
router.get('/auditar', async (req, res) => {
    try {
        const pool = req.db;
        const num = String(req.query.numeroDocumento || '').trim();
        const banco = String(req.query.banco || '').trim();
        const area = String(req.query.area || 'Todos').trim();
        const observacion = String(req.query.observacion || '').trim();
        const soloDescuentos = req.query.soloDescuentos === 'true';

        if (!num && !observacion) {
            return res.status(400).json({ error: 'Ingrese un N° de Documento o seleccione una Observación de carga para auditar' });
        }

        const reqDb = pool.request();
        let whereClauses = ['1=1'];

        if (num) {
            whereClauses.push('LIC_DETALLE_PAGO_ACTUAL.NumeroDocumento = @num');
            reqDb.input('num', sql.NVarChar, num);
        }
        if (banco) {
            whereClauses.push('LIC_DETALLE_PAGO_ACTUAL.Banco = @banco');
            reqDb.input('banco', sql.NVarChar, banco);
        }
        if (observacion) {
            whereClauses.push('LIC_DETALLE_PAGO_ACTUAL.Observacion = @obs');
            reqDb.input('obs', sql.NVarChar, observacion);
        }
        if (area === 'Educacion') {
            whereClauses.push('ISNULL(LIC_FUNCIONARIO.CodUnidad, 0) < 600');
        } else if (area === 'Salud') {
            whereClauses.push('ISNULL(LIC_FUNCIONARIO.CodUnidad, 0) >= 600');
        }
        if (soloDescuentos) {
            whereClauses.push("LIC_DETALLE_PAGO_ACTUAL.concepto IN ('Descuento', 'DESCUENTO')");
        }

        const query = `
            SELECT
                RTRIM(ISNULL(LIC_FUNCIONARIO.Rut, '')) as Rut,
                RTRIM(ISNULL(LIC_FUNCIONARIO.DV, '')) as DV,
                RTRIM(ISNULL(LIC_FUNCIONARIO.Nombre, '')) as Nombre,
                RTRIM(ISNULL(LIC_FUNCIONARIO.Paterno, '')) as Paterno,
                RTRIM(ISNULL(LIC_FUNCIONARIO.Materno, '')) as Materno,
                ISNULL(LIC_FUNCIONARIO.Jornada, 0) as Jornada,
                CONVERT(varchar, LIC_LICENCIA_ACTUAL.Desde, 23) as Desde,
                CONVERT(varchar, LIC_LICENCIA_ACTUAL.Hasta, 23) as Hasta,
                RTRIM(ISNULL(LIC_DETALLE_PAGO_ACTUAL.NumeroLicencia, '')) as NumeroLicencia,
                ISNULL(LIC_LICENCIA_ACTUAL.NumDias, 0) as NumDias,
                ISNULL(LIC_LICENCIA_ACTUAL.DiasAutorizados, 0) as DiasAutorizados,
                RTRIM(ISNULL(LIC_SALUD.Descripcion, '')) as SaludDescripcion,
                ISNULL(LIC_LICENCIA_ACTUAL.Rechazo, 0) as Rechazo,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Observacion, '')) as ObservacionLicencia,
                ISNULL(LIC_LICENCIA_ACTUAL.PagoEstimado, 0) as PagoEstimado,
                ISNULL(LIC_FUNCIONARIO.CodUnidad, 0) as CodUnidad,
                RTRIM(ISNULL(LIC_FUNCIONARIO.descripcionPlanta, '')) as DescripcionPlanta,
                CONVERT(varchar, LIC_LICENCIA_ACTUAL.Recepcion, 23) as Recepcion,
                RTRIM(ISNULL(Personal.R2, '')) as PrevisionR2,
                RTRIM(ISNULL(LIC_FUNCIONARIO.Vigencia, '')) as Vigencia,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.TipoLic, '')) as TipoLic,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.RutMedico, '')) as RutMedico,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.nombreMedico, '')) as NombreMedico,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.PagoDirecto, '')) as PagoDirecto,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Tipo_enferm, '')) as TipoEnferm,
                RTRIM(ISNULL(LIC_DETALLE_PAGO_ACTUAL.NumeroDocumento, '')) as NumeroDocumento,
                CONVERT(varchar, LIC_DETALLE_PAGO_ACTUAL.FechaDepCtaCte, 23) as FechaDepCtaCte,
                ISNULL(LIC_DETALLE_PAGO_ACTUAL.DiasPagados, 0) as DiasPagados,
                ISNULL(LIC_DETALLE_PAGO_ACTUAL.Monto, 0) as Monto,
                RTRIM(ISNULL(LIC_DETALLE_PAGO_ACTUAL.Observacion, '')) as ObservacionPago,
                RTRIM(ISNULL(LIC_DETALLE_PAGO_ACTUAL.concepto, '')) as Concepto,
                RTRIM(ISNULL(LIC_DETALLE_PAGO_ACTUAL.Banco, '')) as Banco,
                LIC_DETALLE_PAGO_ACTUAL.Correlativo,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Autorizada, '')) as Autorizada,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Obser_apelacion, '')) as ObserApelacion,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Compin, '')) as Compin,
                RTRIM(ISNULL(LIC_LICENCIA_ACTUAL.Apelacion, '')) as Apelacion,
                ISNULL(LIC_LICENCIA_ACTUAL.regularizado, 0) as Regularizado,
                RTRIM(ISNULL(Personal.INICIO, '')) as ContratoInicio,
                RTRIM(ISNULL(Personal.TERMINO, '')) as ContratoTermino,
                RTRIM(ISNULL(LIC_CARGA_HORARIA_SEP_PIE.COD_UNIDAD_TRAB, '')) as CodUnidadSepPie,
                RTRIM(ISNULL(LIC_CARGA_HORARIA_SEP_PIE.DES_UNIDAD_TRAB, '')) as DesUnidadSepPie,
                RTRIM(ISNULL(LIC_CARGA_HORARIA_SEP_PIE.FUN_UNIDAD_TRAB, '')) as FunUnidadSepPie,
                CASE WHEN ISNULL(LIC_FUNCIONARIO.CodUnidad, 0) >= 600 THEN 'Salud' ELSE 'Educacion' END as Sector,
                ISNULL(LIC_LICENCIA_ACTUAL.Descuento, 0) as DescuentoFlag,
                ISNULL(DESCUENTO.MontoDesc, 0) as MontoDesc
            FROM LIC_FUNCIONARIO
            INNER JOIN LIC_LICENCIA_ACTUAL ON LIC_FUNCIONARIO.Rut = LIC_LICENCIA_ACTUAL.RutFuncionario
            LEFT OUTER JOIN LIC_HISTORICO_PREVISION_ACTUAL
                ON LIC_FUNCIONARIO.Rut = LIC_HISTORICO_PREVISION_ACTUAL.Rut
                AND YEAR(LIC_LICENCIA_ACTUAL.Desde) = LIC_HISTORICO_PREVISION_ACTUAL.Anio
                AND MONTH(LIC_LICENCIA_ACTUAL.Desde) = LIC_HISTORICO_PREVISION_ACTUAL.Mes
            LEFT OUTER JOIN LIC_SALUD ON LIC_HISTORICO_PREVISION_ACTUAL.CodSalud = LIC_SALUD.CodSalud
            RIGHT OUTER JOIN LIC_DETALLE_PAGO_ACTUAL ON LIC_LICENCIA_ACTUAL.NumeroLicencia = LIC_DETALLE_PAGO_ACTUAL.NumeroLicencia
            LEFT JOIN Personal ON LIC_FUNCIONARIO.Rut = Personal.[RUT EMPLEADO]
            LEFT OUTER JOIN LIC_CARGA_HORARIA_SEP_PIE ON LIC_FUNCIONARIO.Rut = LIC_CARGA_HORARIA_SEP_PIE.RUT
            LEFT OUTER JOIN (
                SELECT a.NumeroLicencia, SUM(ISNULL(a.monto, 0)) as MontoDesc
                FROM LIC_DETALLE_PAGO_ACTUAL a
                WHERE a.concepto IN ('Descuento', 'DESCUENTO')
                GROUP BY a.NumeroLicencia
            ) AS DESCUENTO ON LIC_LICENCIA_ACTUAL.NumeroLicencia = DESCUENTO.NumeroLicencia
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY LIC_DETALLE_PAGO_ACTUAL.Correlativo ASC
        `;

        const result = await reqDb.query(query);
        const rows = result.recordset;

        const resumen = {
            totalRegistros: rows.length,
            totalMonto: rows.reduce((acc, r) => acc + Number(r.Monto || 0), 0),
            totalDiasPagados: rows.reduce((acc, r) => acc + Number(r.DiasPagados || 0), 0),
            totalPagoEstimado: rows.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0),
            totalDescuento: rows.reduce((acc, r) => acc + Number(r.MontoDesc || 0), 0)
        };

        res.json({
            status: 'ok',
            resumen,
            registros: rows
        });
    } catch (err) {
        console.error('Error en GET /pagos-masivos/auditar:', err);
        res.status(500).json({ error: 'Error ejecutando auditoría de pagos' });
    }
});

// 5. Buscar Pagos para Eliminación Masiva (Replica exacta de eliminar_pagomasivo.vb Button1 y Button4)
router.get('/eliminar/buscar', async (req, res) => {
    try {
        const pool = req.db;
        const modo = String(req.query.modo || 'observacion');
        const observacion = String(req.query.observacion || '').trim();
        const numeroDocumento = String(req.query.numeroDocumento || '').trim();
        const banco = String(req.query.banco || '').trim();

        const reqDb = pool.request();
        let where = '';

        if (modo === 'observacion') {
            if (!observacion) return res.status(400).json({ error: 'Seleccione o ingrese una Observación para buscar' });
            reqDb.input('Obs', sql.NVarChar, observacion);
            where = 'D.Observacion = @Obs';
        } else {
            if (!numeroDocumento || !banco) {
                return res.status(400).json({ error: 'Ingrese N° de Documento y Banco para buscar' });
            }
            reqDb.input('NumDoc', sql.NVarChar, numeroDocumento);
            reqDb.input('Banco', sql.NVarChar, banco);
            where = 'D.NumeroDocumento = @NumDoc AND D.Banco = @Banco';
        }

        const result = await reqDb.query(`
            SELECT
                D.Correlativo,
                RTRIM(ISNULL(D.NumeroLicencia, '')) as NumeroLicencia,
                RTRIM(ISNULL(L.RutFuncionario, '')) + '-' + RTRIM(ISNULL(L.dv, '')) as RutFuncionario,
                RTRIM(ISNULL(F.Nombre, '')) + ' ' + RTRIM(ISNULL(F.Paterno, '')) + ' ' + RTRIM(ISNULL(F.Materno, '')) as NombreFuncionario,
                CONVERT(varchar, D.Desde, 23) as Desde,
                CONVERT(varchar, D.Hasta, 23) as Hasta,
                RTRIM(ISNULL(D.NumeroDocumento, '')) as NumeroDocumento,
                CONVERT(varchar, D.FechaDepCtaCte, 23) as FechaDepCtaCte,
                ISNULL(D.DiasPagados, 0) as DiasPagados,
                RTRIM(ISNULL(D.Observacion, '')) as Observacion,
                ISNULL(D.Monto, 0) as Monto,
                RTRIM(ISNULL(D.concepto, '')) as Concepto,
                RTRIM(ISNULL(D.Banco, '')) as Banco,
                RTRIM(ISNULL(D.cenco, '')) as Cenco,
                CONVERT(varchar, D.recepcion, 23) as Recepcion
            FROM LIC_DETALLE_PAGO_ACTUAL D
            LEFT JOIN LIC_LICENCIA_ACTUAL L ON D.NumeroLicencia = L.NumeroLicencia
            LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            WHERE ${where}
            ORDER BY D.Desde ASC, D.Correlativo ASC
        `);

        const totalMonto = result.recordset.reduce((acc, r) => acc + Number(r.Monto || 0), 0);

        res.json({
            status: 'ok',
            cantidad: result.recordset.length,
            totalMonto,
            registros: result.recordset
        });
    } catch (err) {
        console.error('Error en GET /pagos-masivos/eliminar/buscar:', err);
        res.status(500).json({ error: 'Error buscando pagos para eliminar' });
    }
});

// 6. Ejecutar Eliminación Masiva de Pagos (Replica exacta de eliminar_pagomasivo.vb Button2 y Button3)
router.delete('/eliminar', async (req, res) => {
    try {
        const pool = req.db;
        const { modo, observacion, numeroDocumento, banco } = req.body;
        const reqDb = pool.request();

        if (modo === 'observacion') {
            const obs = String(observacion || '').trim();
            if (!obs) return res.status(400).json({ error: 'Observación requerida para eliminar' });
            reqDb.input('Obs', sql.NVarChar, obs);
            const result = await reqDb.query(`
                DELETE FROM LIC_DETALLE_PAGO_ACTUAL WHERE RTRIM(LTRIM(Observacion)) = @Obs
            `);
            return res.json({
                status: 'ok',
                eliminados: result.rowsAffected[0] || 0,
                message: `Se eliminaron ${result.rowsAffected[0] || 0} pagos asociados a la observación "${obs}"`
            });
        } else if (modo === 'documento') {
            const numDoc = String(numeroDocumento || '').trim();
            const bco = String(banco || '').trim();
            if (!numDoc || !bco) return res.status(400).json({ error: 'N° Documento y Banco son requeridos para eliminar' });
            reqDb.input('NumDoc', sql.NVarChar, numDoc);
            reqDb.input('Banco', sql.NVarChar, bco);
            const result = await reqDb.query(`
                DELETE FROM LIC_DETALLE_PAGO_ACTUAL WHERE RTRIM(NumeroDocumento) = @NumDoc AND RTRIM(Banco) = @Banco
            `);
            return res.json({
                status: 'ok',
                eliminados: result.rowsAffected[0] || 0,
                message: `Se eliminaron ${result.rowsAffected[0] || 0} pagos del documento #${numDoc} (${bco})`
            });
        } else {
            return res.status(400).json({ error: 'Modo de eliminación inválido' });
        }
    } catch (err) {
        console.error('Error en DELETE /pagos-masivos/eliminar:', err);
        res.status(500).json({ error: 'Error ejecutando eliminación masiva de pagos' });
    }
});

module.exports = router;
