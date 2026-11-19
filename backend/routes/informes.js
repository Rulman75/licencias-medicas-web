const express = require('express');
const sql = require('mssql');
const router = express.Router();

const cleanRut = (rawRut) => {
    if (!rawRut) return '';
    return String(rawRut).split('-')[0].replace(/\./g, '').trim();
};

// 1. Certificado de Licencia Médica (Replica exacta de frm_certificado.vb + Certificado.rdlc)
router.get('/certificado/:numero', async (req, res) => {
    try {
        const pool = req.db;
        const numero = String(req.params.numero || '').trim();
        if (!numero) return res.status(400).json({ error: 'Número de licencia requerido' });

        // Obtener datos de la licencia y funcionario
        const licRes = await pool.request()
            .input('Num', sql.NVarChar, numero)
            .query(`
                SELECT TOP 1
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    RTRIM(ISNULL(L.RutFuncionario, '')) as Rut,
                    RTRIM(ISNULL(F.DV, ISNULL(L.dv, ''))) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    CONVERT(varchar, L.Recepcion, 23) as Recepcion,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    ISNULL(L.Maternal, 0) as Maternal,
                    ISNULL(L.MontoNetoPromedio, 0) as MontoNetoPromedio,
                    ISNULL(L.SubsidioDiario, 0) as SubsidioDiario,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                    RTRIM(ISNULL(S.Descripcion, '')) as SaludActual
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                LEFT JOIN LIC_SALUD S ON F.UltimaPrev = S.CodSalud
                WHERE L.NumeroLicencia = @Num
            `);

        if (licRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Licencia no encontrada' });
        }

        const lic = licRes.recordset[0];
        const baseDate = new Date(`${lic.Desde}T12:00:00`);
        const getPrevMonth = (d, back) => {
            const c = new Date(d.getFullYear(), d.getMonth() - back, 1);
            return { mes: c.getMonth() + 1, anio: c.getFullYear() };
        };

        const m1 = getPrevMonth(baseDate, 1);
        const m2 = getPrevMonth(baseDate, 2);
        const m3 = getPrevMonth(baseDate, 3);

        // Obtener los 3 meses de renta e información previsional igual que CertificadoTableAdapter
        const rentasRes = await pool.request()
            .input('Rut', sql.NVarChar, lic.Rut)
            .input('M1', sql.Int, m1.mes).input('A1', sql.Int, m1.anio)
            .input('M2', sql.Int, m2.mes).input('A2', sql.Int, m2.anio)
            .input('M3', sql.Int, m3.mes).input('A3', sql.Int, m3.anio)
            .query(`
                SELECT
                    R.Anio,
                    R.Mes,
                    ISNULL(R.MontoImponible, 0) as MontoImponible,
                    ISNULL(R.descPrevision, 0) as DescPrevision,
                    ISNULL(R.descSalud, 0) as DescSalud,
                    ISNULL(R.impuestoUnico, 0) as ImpuestoUnico,
                    ISNULL(R.montoNeto, 0) as MontoNeto,
                    ISNULL(HP.diasTrab, 30) as DiasTrab,
                    ISNULL(HP.CodSalud, 0) as CodSalud,
                    RTRIM(ISNULL(S.Descripcion, '')) as SaludMes,
                    ISNULL(HP.CodPrevision, 0) as CodPrevision,
                    RTRIM(ISNULL(P.Descripcion, '')) as AFP
                FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL R
                LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HP
                    ON R.RutFuncionario = HP.Rut AND R.Anio = HP.Anio AND R.Mes = HP.Mes
                LEFT JOIN LIC_PREVISION P ON HP.CodPrevision = P.CodPrevision
                LEFT JOIN LIC_SALUD S ON HP.CodSalud = S.CodSalud
                WHERE R.RutFuncionario = @Rut
                  AND ((R.Mes = @M1 AND R.Anio = @A1) OR (R.Mes = @M2 AND R.Anio = @A2) OR (R.Mes = @M3 AND R.Anio = @A3))
                ORDER BY R.Anio DESC, R.Mes DESC
            `);

        res.json({
            status: 'ok',
            licencia: lic,
            rentas: rentasRes.recordset,
            periodosConsultados: [m1, m2, m3]
        });
    } catch (err) {
        console.error('Error en GET /informes/certificado/:numero:', err);
        res.status(500).json({ error: 'Error generando el Certificado de Licencia' });
    }
});

// 2. Nómina de Correspondencia Normal y Pago Directo (Form5.vb / NomicaCorre.rdlc e Imprimr_NomCorrePDirecto.vb)
router.get('/nomina-correspondencia', async (req, res) => {
    try {
        const pool = req.db;
        const tipo = String(req.query.tipo || 'normal'); // 'normal' | 'pago-directo'
        const fecha = req.query.fecha;
        const salud = String(req.query.salud || '').trim();
        const desde = req.query.desde;
        const hasta = req.query.hasta;

        const reqDb = pool.request();

        if (tipo === 'pago-directo') {
            if (!desde || !hasta) {
                return res.status(400).json({ error: 'Rango de fechas de remisión (Desde / Hasta) requerido' });
            }
            reqDb.input('Desde', sql.Date, desde);
            reqDb.input('Hasta', sql.Date, hasta);

            const result = await reqDb.query(`
                SELECT
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    RTRIM(L.RutFuncionario) as RutFuncionario,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(L.NumDias, 0) as NumDias,
                    CONVERT(varchar, L.Remision, 23) as Remision,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    'FONASA / PAGO DIRECTO' as InstitucionSalud
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                WHERE L.Remision >= @Desde AND L.Remision <= @Hasta
                  AND F.CodUnidad IN (530, 384, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510)
                  AND RTRIM(ISNULL(F.descripcionPlanta, '')) <> 'DOCENTE'
                  AND F.UltimaPrev = 41
                ORDER BY F.Paterno ASC, F.Materno ASC
            `);

            return res.json({ status: 'ok', registros: result.recordset });
        } else {
            // Nómina Correspondencia Normal (Form5.vb)
            if (!fecha) {
                return res.status(400).json({ error: 'Fecha de remisión requerida' });
            }
            reqDb.input('Fecha', sql.Date, fecha);
            let saludFilter = '';
            if (salud && salud !== 'Todas') {
                saludFilter = 'AND RTRIM(S.Descripcion) = @Salud';
                reqDb.input('Salud', sql.NVarChar, salud);
            }

            const result = await reqDb.query(`
                SELECT
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    RTRIM(L.RutFuncionario) as RutFuncionario,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(L.NumDias, 0) as NumDias,
                    CONVERT(varchar, L.Remision, 23) as Remision,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    RTRIM(ISNULL(S.Descripcion, '')) as InstitucionSalud
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                INNER JOIN LIC_SALUD S ON F.UltimaPrev = S.CodSalud
                WHERE L.Remision = @Fecha ${saludFilter}
                ORDER BY F.Paterno ASC, F.Materno ASC
            `);

            return res.json({ status: 'ok', registros: result.recordset });
        }
    } catch (err) {
        console.error('Error en GET /informes/nomina-correspondencia:', err);
        res.status(500).json({ error: 'Error consultando nómina de correspondencia' });
    }
});

// 3. Consulta de Licencias por Funcionario y Certificado de No Pago / Deuda (LicenciasPorFuncionario.vb + Licencias_NoPagadasfun.vb)
router.get('/por-funcionario', async (req, res) => {
    try {
        const pool = req.db;
        const rut = cleanRut(req.query.rut);
        const paterno = String(req.query.paterno || '').trim();
        const desde = String(req.query.desde || '').trim();
        const hasta = String(req.query.hasta || '').trim();

        // Si busca por apellido paterno, devolver lista de coincidencias
        if (!rut && paterno) {
            const listReq = pool.request().input('Pat', sql.NVarChar, `%${paterno}%`);
            let whereExtra = '';
            if (desde) {
                listReq.input('Desde', sql.Date, desde);
                whereExtra += ` AND EXISTS (SELECT 1 FROM LIC_LICENCIA_ACTUAL L WHERE RTRIM(L.RutFuncionario) = RTRIM(F.Rut) AND L.Desde >= @Desde${hasta ? ' AND L.Desde <= @Hasta' : ''})`;
            }
            if (hasta) {
                listReq.input('Hasta', sql.Date, hasta);
                if (!desde) {
                    whereExtra += ` AND EXISTS (SELECT 1 FROM LIC_LICENCIA_ACTUAL L WHERE RTRIM(L.RutFuncionario) = RTRIM(F.Rut) AND L.Desde <= @Hasta)`;
                }
            }
            const listRes = await listReq.query(`
                SELECT TOP 50
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    RTRIM(ISNULL(F.vigencia, '')) as Vigencia
                FROM LIC_FUNCIONARIO F
                LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                WHERE F.Paterno LIKE @Pat ${whereExtra}
                ORDER BY F.Paterno ASC, F.Materno ASC, F.Nombre ASC
            `);
            return res.json({ status: 'ok', modo: 'lista', funcionarios: listRes.recordset });
        }

        // Si busca únicamente por rango de fechas (Desde / Hasta) sin RUT ni Apellido
        if (!rut && (desde || hasta)) {
            const rangoReq = pool.request();
            let rangoWhere = 'WHERE 1=1';
            if (desde) {
                rangoReq.input('Desde', sql.Date, desde);
                rangoWhere += ' AND L.Desde >= @Desde';
            }
            if (hasta) {
                rangoReq.input('Hasta', sql.Date, hasta);
                rangoWhere += ' AND L.Desde <= @Hasta';
            }
            const rangoRes = await rangoReq.query(`
                SELECT TOP 1000
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    RTRIM(L.RutFuncionario) as Rut,
                    RTRIM(ISNULL(F.DV, ISNULL(L.dv, ''))) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) + ' ' + RTRIM(ISNULL(F.Paterno, '')) + ' ' + RTRIM(ISNULL(F.Materno, '')) as NombreCompleto,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    RTRIM(ISNULL(L.Obser_apelacion, '')) as ObserApelacion,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(P.TotalPagado, 0) as TotalPagadoTabla,
                    ISNULL(DP.SumaMonto, 0) as MontoPagadoDetalle
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                LEFT JOIN LIC_PAGO_ACTUAL P ON L.NumeroLicencia = P.NumeroLicencia
                LEFT JOIN (
                    SELECT 
                        NumeroLicencia,
                        SUM(ISNULL(Monto, 0)) as SumaMonto
                    FROM LIC_DETALLE_PAGO_ACTUAL
                    GROUP BY NumeroLicencia
                ) DP ON L.NumeroLicencia = DP.NumeroLicencia
                ${rangoWhere}
                ORDER BY L.Desde DESC
            `);
            return res.json({ status: 'ok', modo: 'rango', licenciasRango: rangoRes.recordset });
        }

        if (!rut) {
            return res.status(400).json({ error: 'Ingrese un RUT, Apellido Paterno o Rango de Fechas (Desde/Hasta) para consultar' });
        }

        // Datos del funcionario
        const funRes = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT TOP 1
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    CONVERT(varchar, F.FechaInicio, 23) as FechaInicio,
                    CONVERT(varchar, F.FechaTermino, 23) as FechaTermino,
                    RTRIM(ISNULL(F.vigencia, '')) as Vigencia
                FROM LIC_FUNCIONARIO F
                LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                WHERE F.Rut = @Rut
            `);

        // Licencias del funcionario (LicenciasPorFuncionarioTableAdapter) con filtro opcional de rango Desde/Hasta
        const licReq = pool.request().input('Rut', sql.NVarChar, rut);
        let licDateFilter = '';
        if (desde) {
            licReq.input('Desde', sql.Date, desde);
            licDateFilter += ' AND L.Desde >= @Desde';
        }
        if (hasta) {
            licReq.input('Hasta', sql.Date, hasta);
            licDateFilter += ' AND L.Desde <= @Hasta';
        }
        const licRes = await licReq.query(`
                SELECT
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    ISNULL(L.Parcial, 0) as Parcial,
                    ISNULL(L.regularizado, 0) as Regularizado,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    RTRIM(ISNULL(L.Obser_apelacion, '')) as ObserApelacion,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(L.MontoDesc, 0) as MontoDesc,
                    ISNULL(P.TotalPagado, 0) as TotalPagadoTabla,
                    ISNULL(DP.SumaMonto, 0) as MontoPagadoDetalle
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_PAGO_ACTUAL P ON L.NumeroLicencia = P.NumeroLicencia
                LEFT JOIN (
                    SELECT 
                        NumeroLicencia,
                        SUM(ISNULL(Monto, 0)) as SumaMonto
                    FROM LIC_DETALLE_PAGO_ACTUAL
                    GROUP BY NumeroLicencia
                ) DP ON L.NumeroLicencia = DP.NumeroLicencia
                WHERE L.RutFuncionario = @Rut ${licDateFilter}
                ORDER BY L.Desde DESC
            `);

        // Rentas históricas del funcionario
        const rentasRes = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT
                    Anio, Mes,
                    ISNULL(MontoImponible, 0) as MontoImponible,
                    ISNULL(descPrevision, 0) as DescPrevision,
                    ISNULL(descSalud, 0) as DescSalud,
                    ISNULL(impuestoUnico, 0) as ImpuestoUnico,
                    ISNULL(montoNeto, 0) as MontoNeto
                FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL
                WHERE RutFuncionario = @Rut
                ORDER BY Anio DESC, Mes DESC
            `);

        // Calcular Certificado de No Pago / Deuda (Replica exacta de Licencias_NoPagadasfun.vb)
        const mapaRentas = {};
        for (const r of rentasRes.recordset) {
            mapaRentas[`${r.Anio}-${r.Mes}`] = Number(r.MontoImponible || 0);
        }

        const licenciasNoPagadasDeuda = [];
        for (const l of licRes.recordset) {
            const pagado = Number(l.TotalPagadoTabla || 0) + Number(l.MontoPagadoDetalle || 0);
            if (pagado === 0 && l.Desde) {
                const dt = new Date(`${l.Desde}T12:00:00`);
                if (!isNaN(dt.getTime())) {
                    let sumimp = 0;
                    for (let back = 1; back <= 3; back++) {
                        const c = new Date(dt.getFullYear(), dt.getMonth() - back, 1);
                        const key = `${c.getFullYear()}-${c.getMonth() + 1}`;
                        if (mapaRentas[key]) {
                            sumimp += Math.floor(mapaRentas[key] / 30);
                        }
                    }
                    const ndias = Number(l.NumDias || 0);
                    const diasa = Number(l.DiasAutorizados || 0);
                    const diasdes = ndias === diasa ? diasa : ndias - diasa;
                    const descuento = Math.floor(sumimp / 3) * diasdes;
                    if (descuento > 0 || Number(l.PagoEstimado || 0) > 0) {
                        licenciasNoPagadasDeuda.push({
                            NumeroLicencia: l.NumeroLicencia,
                            Desde: l.Desde,
                            Hasta: l.Hasta,
                            NumDias: ndias,
                            DiasAutorizados: diasa,
                            DiasDescuento: diasdes,
                            SumaImponibleDiaria: sumimp,
                            MontoAPagarDescuento: descuento,
                            PagoEstimado: Number(l.PagoEstimado || 0),
                            MontoPagado: 0,
                            Observacion: l.Observacion,
                            ObserApelacion: l.ObserApelacion
                        });
                    }
                }
            }
        }

        res.json({
            status: 'ok',
            modo: 'detalle',
            funcionario: funRes.recordset[0] || null,
            licencias: licRes.recordset,
            rentas: rentasRes.recordset,
            noPagadasDeuda: licenciasNoPagadasDeuda
        });
    } catch (err) {
        console.error('Error en GET /informes/por-funcionario:', err);
        res.status(500).json({ error: 'Error consultando licencias por funcionario' });
    }
});

// 4. Licencias Recepcionadas Diarias (Imprime_LicenciasDiarias.vb)
router.get('/licencias-diarias', async (req, res) => {
    try {
        const pool = req.db;
        const { desde, hasta } = req.query;
        if (!desde || !hasta) {
            return res.status(400).json({ error: 'Ingrese fecha Desde y Hasta de recepción' });
        }

        const result = await pool.request()
            .input('Desde', sql.Date, desde)
            .input('Hasta', sql.Date, hasta)
            .query(`
                SELECT
                    RTRIM(ISNULL(F.Rut, L.RutFuncionario)) as Rut,
                    RTRIM(ISNULL(F.DV, ISNULL(L.dv, ''))) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    ISNULL(F.Jornada, 0) as Jornada,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    RTRIM(ISNULL(S.Descripcion, '')) as Salud,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    CONVERT(varchar, L.Recepcion, 23) as Recepcion,
                    RTRIM(ISNULL(P.R2, '')) as Prevision,
                    RTRIM(ISNULL(F.vigencia, '')) as Vigencia,
                    RTRIM(ISNULL(L.TipoLic, '')) as TipoLic,
                    RTRIM(ISNULL(L.RutMedico, '')) as RutMedico,
                    RTRIM(ISNULL(L.nombreMedico, '')) as NombreMedico,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                    RTRIM(ISNULL(P.[NOMBRE UNIDAD], '')) as NombreUnidad,
                    RTRIM(ISNULL(O.Observacion, '')) as ObsFuncionario
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                LEFT JOIN LIC_SALUD S ON F.UltimaPrev = S.CodSalud
                LEFT JOIN Personal P ON L.RutFuncionario = P.[RUT EMPLEADO]
                LEFT JOIN LIC_OBSERVACIONES O ON L.RutFuncionario = O.Rut
                WHERE L.Recepcion >= @Desde AND L.Recepcion <= @Hasta
                ORDER BY L.Recepcion DESC, F.Paterno ASC
            `);

        res.json({ status: 'ok', registros: result.recordset });
    } catch (err) {
        console.error('Error en GET /informes/licencias-diarias:', err);
        res.status(500).json({ error: 'Error consultando licencias recepcionadas diarias' });
    }
});

// 5. Licencias BRP por Mes y Año (ImprimeLicenciasBRP.vb)
router.get('/licencias-brp', async (req, res) => {
    try {
        const pool = req.db;
        const mes = parseInt(req.query.mes, 10);
        const anio = parseInt(req.query.anio, 10);
        if (!mes || !anio) {
            return res.status(400).json({ error: 'Mes y Año son requeridos' });
        }

        const result = await pool.request()
            .input('Mes', sql.Int, mes)
            .input('Anio', sql.Int, anio)
            .query(`
                SELECT
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    ISNULL(F.Jornada, 0) as Jornada,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    RTRIM(ISNULL(S.Descripcion, '')) as Salud,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta
                FROM LIC_FUNCIONARIO F
                INNER JOIN LIC_LICENCIA_ACTUAL L ON F.Rut = L.RutFuncionario
                LEFT JOIN LIC_SALUD S ON F.UltimaPrev = S.CodSalud
                WHERE (MONTH(L.Desde) = @Mes AND YEAR(L.Desde) = @Anio)
                   OR (MONTH(L.Hasta) = @Mes AND YEAR(L.Hasta) = @Anio)
                ORDER BY F.CodUnidad ASC, F.Paterno ASC
            `);

        res.json({ status: 'ok', registros: result.recordset });
    } catch (err) {
        console.error('Error en GET /informes/licencias-brp:', err);
        res.status(500).json({ error: 'Error consultando licencias BRP' });
    }
});

// 6. Licencias Pago Directo por Año y Mes (Frm_PagoDirecto.vb)
router.get('/licencias-pago-directo', async (req, res) => {
    try {
        const pool = req.db;
        const anio = parseInt(req.query.anio, 10);
        const mes = parseInt(req.query.mes, 10);
        if (!anio || !mes) {
            return res.status(400).json({ error: 'Año y Mes son requeridos' });
        }

        const result = await pool.request()
            .input('Anio', sql.Int, anio)
            .input('Mes', sql.Int, mes)
            .query(`
                SELECT
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    ISNULL(PA.NumDiasPagados, 0) as NumDiasPagados,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    RTRIM(ISNULL(S.Descripcion, '')) as Salud,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(PA.TotalPagado, 0) as TotalPagado,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                LEFT JOIN LIC_PAGO_ACTUAL PA ON L.NumeroLicencia = PA.NumeroLicencia
                LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HP
                    ON HP.Rut = F.Rut AND HP.Anio = YEAR(L.Desde) AND HP.Mes = MONTH(L.Desde)
                LEFT JOIN LIC_SALUD S ON COALESCE(HP.CodSalud, TRY_CAST(F.UltimaPrev AS INT)) = S.CodSalud
                WHERE YEAR(L.Desde) = @Anio AND MONTH(L.Desde) = @Mes
                  AND (
                    (F.CodUnidad IN (530, 384) AND COALESCE(HP.CodSalud, TRY_CAST(F.UltimaPrev AS INT)) = 41 AND RTRIM(ISNULL(F.descripcionPlanta, '')) <> 'DOCENTE')
                    OR F.CodUnidad IN (501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 608, 613)
                  )
                ORDER BY F.CodUnidad ASC, F.Paterno ASC
            `);

        res.json({ status: 'ok', registros: result.recordset });
    } catch (err) {
        console.error('Error en GET /informes/licencias-pago-directo:', err);
        res.status(500).json({ error: 'Error consultando licencias de Pago Directo' });
    }
});

// 7. Informe General de Licencias Pagadas / No Pagadas / Maternal por Año y Doc (Imprimenopagadas.vb)
router.get('/general-pagos', async (req, res) => {
    try {
        const pool = req.db;
        const anio = parseInt(req.query.anio || new Date().getFullYear(), 10);
        const tipo = String(req.query.tipo || 'Todos'); // Todos | Maternal | Pagadas Resumen | Pagadas Detalle | No Pagadas
        const numeroDocumento = String(req.query.numeroDocumento || '').trim();

        const reqDb = pool.request();
        reqDb.input('Anio', sql.Int, anio);

        let extraWhere = '';
        if (tipo === 'Maternal') {
            extraWhere += ' AND L.Maternal = 1 ';
        } else if (tipo === 'Pagadas Resumen' || tipo === 'Pagadas Detalle' || tipo === 'Pagadas') {
            extraWhere += ' AND ISNULL(D.MontoPag, 0) > 0 ';
        } else if (tipo === 'No Pagadas') {
            extraWhere += ' AND ISNULL(D.MontoPag, 0) = 0 ';
        }

        if (numeroDocumento) {
            extraWhere += ' AND D.NumeroDocumento = @NumDoc ';
            reqDb.input('NumDoc', sql.NVarChar, numeroDocumento);
        }

        const result = await reqDb.query(`
            SELECT
                RTRIM(F.Rut) as Rut,
                RTRIM(ISNULL(F.DV, '')) as DV,
                RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                RTRIM(ISNULL(F.Materno, '')) as Materno,
                ISNULL(F.CodUnidad, 0) as CodUnidad,
                RTRIM(ISNULL(S.Descripcion, '')) as Salud,
                RTRIM(ISNULL(P.Descripcion, '')) as Prevision,
                RTRIM(L.NumeroLicencia) as NumeroLicencia,
                CONVERT(varchar, L.Desde, 23) as Desde,
                CONVERT(varchar, L.Hasta, 23) as Hasta,
                ISNULL(L.NumDias, 0) as NumDias,
                RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                RTRIM(ISNULL(L.TipoLic, '')) as TipoLic,
                ISNULL(L.Maternal, 0) as Maternal,
                ISNULL(L.Rechazo, 0) as Rechazo,
                ISNULL(L.Retenida, 0) as Retenida,
                ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                ISNULL(L.MontoDesc, 0) as MontoDesc,
                RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                RTRIM(ISNULL(L.Obser_apelacion, '')) as ObserApelacion,
                RTRIM(ISNULL(D.NumeroDocumento, '')) as NumeroDocumento,
                RTRIM(ISNULL(D.Concepto, '')) as Concepto,
                ISNULL(D.DiasPag, 0) as DiasPagados,
                ISNULL(D.MontoPag, 0) as MontoPagado
            FROM LIC_LICENCIA_ACTUAL L
            INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HP
                ON HP.Rut = F.Rut AND HP.Anio = YEAR(L.Desde) AND HP.Mes = MONTH(L.Desde)
            LEFT JOIN LIC_SALUD S ON COALESCE(HP.CodSalud, TRY_CAST(F.UltimaPrev AS INT)) = S.CodSalud
            LEFT JOIN LIC_PREVISION P ON HP.CodPrevision = P.CodPrevision
            LEFT JOIN (
                SELECT
                    NumeroLicencia,
                    MAX(RTRIM(ISNULL(NumeroDocumento, ''))) as NumeroDocumento,
                    MAX(RTRIM(ISNULL(concepto, ''))) as Concepto,
                    SUM(ISNULL(DiasPagados, 0)) as DiasPag,
                    SUM(ISNULL(Monto, 0)) as MontoPag
                FROM LIC_DETALLE_PAGO_ACTUAL
                GROUP BY NumeroLicencia
            ) D ON L.NumeroLicencia = D.NumeroLicencia
            WHERE YEAR(L.Desde) = @Anio ${extraWhere}
            ORDER BY L.Desde DESC
        `);

        res.json({ status: 'ok', registros: result.recordset });
    } catch (err) {
        console.error('Error en GET /informes/general-pagos:', err);
        res.status(500).json({ error: 'Error consultando informe general de licencias' });
    }
});

// 8. Captura Softland Licencias y Pagos (CapturaSoftland.vb + CapturaSoftlandPagos.vb)
router.get('/captura-softland', async (req, res) => {
    try {
        const pool = req.db;
        const tipo = String(req.query.tipo || 'licencias'); // 'licencias' | 'pagos'
        const sectorNombre = String(req.query.sector || 'Educacion'); // 'Educacion' (1) | 'Salud' (2)
        const codSector = sectorNombre === 'Salud' ? 2 : 1;
        const { desde, hasta } = req.query;

        if (!desde || !hasta) {
            return res.status(400).json({ error: 'Fechas Desde y Hasta son requeridas' });
        }

        const reqDb = pool.request();
        reqDb.input('Desde', sql.Date, desde);
        reqDb.input('Hasta', sql.Date, hasta);
        reqDb.input('Sector', sql.Int, codSector);

        if (tipo === 'pagos') {
            // CapturaSoftlandPagosTableAdapter
            const result = await reqDb.query(`
                SELECT
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    E.CodSector,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    RTRIM(ISNULL(E.CCosto, '')) as CCosto,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(D.DiasPagados, 0) as DiasPagados,
                    CONVERT(varchar, D.FechaDepCtaCte, 23) as FechaDeposito,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(D.Monto, 0) as TotalPagado,
                    RTRIM(ISNULL(D.NumeroDocumento, '')) as NumeroDocumento,
                    RTRIM(ISNULL(D.Banco, '')) as Banco,
                    RTRIM(ISNULL(D.concepto, '')) as Concepto,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                INNER JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                INNER JOIN LIC_DETALLE_PAGO_ACTUAL D ON L.NumeroLicencia = D.NumeroLicencia
                WHERE E.CodSector = @Sector
                  AND D.FechaDepCtaCte >= @Desde
                  AND D.FechaDepCtaCte <= @Hasta
                  AND RTRIM(ISNULL(L.Observacion, '')) <> 'PAGO DIRECTO'
                ORDER BY E.CCosto ASC, F.Paterno ASC
            `);

            return res.json({ status: 'ok', registros: result.recordset });
        } else {
            // CapturaSoftlandTableAdapter (Licencias)
            const result = await reqDb.query(`
                SELECT
                    RTRIM(F.Rut) as Rut,
                    RTRIM(ISNULL(F.DV, '')) as DV,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    E.CodSector,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    RTRIM(ISNULL(E.CCosto, '')) as CCosto,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    ISNULL(L.NumDias, 0) as NumDias,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                INNER JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                WHERE L.Desde >= @Desde
                  AND L.Desde <= @Hasta
                  AND E.CodSector = @Sector
                  AND RTRIM(ISNULL(L.Observacion, '')) <> 'PAGO DIRECTO'
                ORDER BY E.CCosto ASC, F.Paterno ASC
            `);

            return res.json({ status: 'ok', registros: result.recordset });
        }
    } catch (err) {
        console.error('Error en GET /informes/captura-softland:', err);
        res.status(500).json({ error: 'Error consultando Captura Softland' });
    }
});

// 9. Documentos de Pago Recibidos en un Mes con Máximo Detalle (Maestro de Documentos + Sábana Detallada de Movimientos)
router.get('/documentos-pago-mes', async (req, res) => {
    try {
        const pool = req.db;
        const now = new Date();
        const anio = parseInt(req.query.anio || now.getFullYear(), 10);
        const mes = req.query.mes !== undefined ? parseInt(req.query.mes, 10) : (now.getMonth() + 1);
        const criterio = String(req.query.criterio || 'deposito').toLowerCase(); // 'deposito' | 'recepcion'

        let fechaInicio;
        let fechaFin;
        if (mes >= 1 && mes <= 12) {
            fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
            const nextAnio = mes === 12 ? anio + 1 : anio;
            const nextMes = mes === 12 ? 1 : mes + 1;
            fechaFin = `${nextAnio}-${String(nextMes).padStart(2, '0')}-01`;
        } else {
            fechaInicio = `${anio}-01-01`;
            fechaFin = `${anio + 1}-01-01`;
        }

        const buildDateWhere = (alias) => {
            if (criterio === 'recepcion') {
                return `((${alias}.recepcion >= @FechaInicio AND ${alias}.recepcion < @FechaFin) OR (${alias}.recepcion IS NULL AND ${alias}.FechaDepCtaCte >= @FechaInicio AND ${alias}.FechaDepCtaCte < @FechaFin))`;
            }
            return `((${alias}.FechaDepCtaCte >= @FechaInicio AND ${alias}.FechaDepCtaCte < @FechaFin) OR (${alias}.FechaDepCtaCte IS NULL AND ${alias}.recepcion >= @FechaInicio AND ${alias}.recepcion < @FechaFin))`;
        };

        const whereD = buildDateWhere('D');

        // 1. Obtener todos los movimientos individuales de pago del período con máximo detalle
        const movRes = await pool.request()
            .input('FechaInicio', sql.Date, fechaInicio)
            .input('FechaFin', sql.Date, fechaFin)
            .query(`
                SELECT
                    D.Correlativo,
                    RTRIM(ISNULL(D.NumeroLicencia, '')) as NumeroLicencia,
                    RTRIM(ISNULL(D.NumeroDocumento, '')) as NumeroDocumento,
                    RTRIM(ISNULL(D.Banco, '')) as Banco,
                    RTRIM(ISNULL(D.concepto, '')) as Concepto,
                    CONVERT(varchar, D.FechaDepCtaCte, 23) as FechaDeposito,
                    CONVERT(varchar, D.recepcion, 23) as FechaRecepcion,
                    ISNULL(D.DiasPagados, 0) as DiasPagados,
                    CONVERT(varchar, D.Desde, 23) as PagoDesde,
                    CONVERT(varchar, D.Hasta, 23) as PagoHasta,
                    ISNULL(D.Monto, 0) as Monto,
                    RTRIM(ISNULL(D.Observacion, '')) as ObservacionPago,
                    RTRIM(ISNULL(D.cenco, '')) as CencoPago,
                    RTRIM(ISNULL(L.RutFuncionario, '')) as Rut,
                    RTRIM(ISNULL(F.DV, ISNULL(L.dv, ''))) as DV,
                    RTRIM(ISNULL(F.Nombre, '')) as Nombre,
                    RTRIM(ISNULL(F.Paterno, '')) as Paterno,
                    RTRIM(ISNULL(F.Materno, '')) as Materno,
                    ISNULL(F.CodUnidad, 0) as CodUnidad,
                    RTRIM(ISNULL(E.Descripcion, '')) as Establecimiento,
                    RTRIM(ISNULL(E.CCosto, '')) as CCosto,
                    ISNULL(E.CodSector, 0) as CodSector,
                    RTRIM(ISNULL(F.descripcionPlanta, '')) as Planta,
                    RTRIM(ISNULL(S.Descripcion, '')) as Salud,
                    CONVERT(varchar, L.Desde, 23) as LicDesde,
                    CONVERT(varchar, L.Hasta, 23) as LicHasta,
                    ISNULL(L.NumDias, 0) as NumDiasLicencia,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    ISNULL(L.Maternal, 0) as Maternal,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    ISNULL(L.Parcial, 0) as Parcial,
                    ISNULL(L.regularizado, 0) as Regularizado,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(L.SubsidioDiario, 0) as SubsidioDiario,
                    ISNULL(L.MontoNetoPromedio, 0) as MontoNetoPromedio,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as TipoEnferm,
                    RTRIM(ISNULL(L.Observacion, '')) as ObservacionLicencia,
                    ISNULL(PA.TotalPagado, 0) as TotalAcumuladoLicencia,
                    ISNULL(PA.NumDiasPagados, 0) as DiasAcumuladosLicencia
                FROM LIC_DETALLE_PAGO_ACTUAL D
                LEFT JOIN LIC_LICENCIA_ACTUAL L ON D.NumeroLicencia = L.NumeroLicencia
                LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
                LEFT JOIN LIC_ESTABLECIMIENTO E ON F.CodUnidad = E.CodUnidad
                LEFT JOIN LIC_SALUD S ON TRY_CAST(F.UltimaPrev AS INT) = S.CodSalud
                LEFT JOIN LIC_PAGO_ACTUAL PA ON D.NumeroLicencia = PA.NumeroLicencia
                WHERE ${whereD}
                ORDER BY D.FechaDepCtaCte DESC, D.recepcion DESC, D.Banco ASC, D.NumeroDocumento ASC, D.Correlativo ASC
            `);

        // Extraer números de documento únicos activos en el período
        const docNumsSet = new Set();
        for (const r of (movRes.recordset || [])) {
            const nd = String(r.NumeroDocumento || '').trim();
            if (nd) docNumsSet.add(nd);
        }
        const activeDocNums = Array.from(docNumsSet).slice(0, 500);

        // 2. Obtener cabeceras de DETALLE_CHEQUES asociadas al período o a los documentos con movimientos en el período
        const chequesReq = pool.request()
            .input('FechaInicio', sql.Date, fechaInicio)
            .input('FechaFin', sql.Date, fechaFin);

        let chequesInClause = '';
        if (activeDocNums.length > 0) {
            const params = activeDocNums.map((num, idx) => {
                const pName = `DocNum${idx}`;
                chequesReq.input(pName, sql.NVarChar, num);
                return `@${pName}`;
            });
            chequesInClause = ` OR RTRIM(ISNULL(C.num, '')) IN (${params.join(', ')})`;
        }

        const chequesRes = await chequesReq.query(`
            SELECT
                RTRIM(ISNULL(C.banco, '')) as Banco,
                RTRIM(ISNULL(C.num, '')) as NumeroDocumento,
                ISNULL(C.monto, 0) as MontoCheque,
                ISNULL(C.saldo, 0) as SaldoTabla,
                CONVERT(varchar, C.Fecha, 23) as FechaCheque,
                RTRIM(ISNULL(C.Tipo, '')) as Tipo,
                RTRIM(ISNULL(C.area, '')) as Area,
                RTRIM(ISNULL(C.estado, '')) as Estado
            FROM DETALLE_CHEQUES C
            WHERE (C.Fecha >= @FechaInicio AND C.Fecha < @FechaFin)${chequesInClause}
        `);

        for (const ch of (chequesRes.recordset || [])) {
            const nd = String(ch.NumeroDocumento || '').trim();
            if (nd) docNumsSet.add(nd);
        }
        const allDocNums = Array.from(docNumsSet).slice(0, 500);

        // 3. Obtener totales globales históricos por documento para cuadrar documentos que abarcan más de una fecha
        let globalTotalsRes = { recordset: [] };
        if (allDocNums.length > 0) {
            const globalReq = pool.request();
            const gParams = allDocNums.map((num, idx) => {
                const pName = `GDoc${idx}`;
                globalReq.input(pName, sql.NVarChar, num);
                return `@${pName}`;
            });
            globalTotalsRes = await globalReq.query(`
                SELECT
                    RTRIM(ISNULL(D.Banco, '')) as Banco,
                    RTRIM(ISNULL(D.NumeroDocumento, '')) as NumeroDocumento,
                    COUNT(*) as TotalMovimientosGlobal,
                    SUM(CASE WHEN RTRIM(ISNULL(D.concepto, '')) <> 'Devolucion' THEN ISNULL(D.Monto, 0) ELSE 0 END) as MontoImputadoGlobal,
                    SUM(ISNULL(D.Monto, 0)) as MontoTotalGlobal,
                    CONVERT(varchar, MIN(D.FechaDepCtaCte), 23) as PrimeraFechaDeposito,
                    CONVERT(varchar, MAX(D.FechaDepCtaCte), 23) as UltimaFechaDeposito
                FROM LIC_DETALLE_PAGO_ACTUAL D
                WHERE D.NumeroDocumento IN (${gParams.join(', ')})
                GROUP BY RTRIM(ISNULL(D.Banco, '')), RTRIM(ISNULL(D.NumeroDocumento, ''))
            `);
        }

        // Indexar cabeceras de cheques y totales globales
        const normalizeKey = (banco, numDoc) => `${String(banco || '').trim().toUpperCase()}||${String(numDoc || '').trim().toUpperCase()}`;
        const chequesByExactKey = new Map();
        const chequesByNumDoc = new Map();

        for (const ch of (chequesRes.recordset || [])) {
            const key = normalizeKey(ch.Banco, ch.NumeroDocumento);
            chequesByExactKey.set(key, ch);
            const numKey = String(ch.NumeroDocumento || '').trim().toUpperCase();
            if (numKey && !chequesByNumDoc.has(numKey)) {
                chequesByNumDoc.set(numKey, ch);
            }
        }

        const globalByExactKey = new Map();
        const globalByNumDoc = new Map();
        for (const g of (globalTotalsRes.recordset || [])) {
            const key = normalizeKey(g.Banco, g.NumeroDocumento);
            globalByExactKey.set(key, g);
            const numKey = String(g.NumeroDocumento || '').trim().toUpperCase();
            if (numKey && !globalByNumDoc.has(numKey)) {
                globalByNumDoc.set(numKey, g);
            }
        }

        // Procesar movimientos y agrupar por documento (Banco + NumeroDocumento)
        const docGroups = new Map();
        const licenciasSetMes = new Set();
        const funcionariosSetMes = new Set();

        const resumen = {
            anio,
            mes,
            criterio,
            fechaInicio,
            fechaFin,
            totalDocumentos: 0,
            documentosEnTablaCheques: 0,
            documentosCerrados: 0,
            documentosAbiertos: 0,
            documentosCuadrados: 0,
            documentosConDiferencia: 0,
            documentosNominaDescuento: 0,
            totalMovimientos: 0,
            totalLicenciasDistintas: 0,
            totalFuncionariosDistintos: 0,
            totalDiasPagados: 0,
            montoTotalMes: 0,
            montoSubsidio: 0,
            montoAporte: 0,
            montoDescuento: 0,
            montoDevolucion: 0,
            montoOtros: 0,
            montoEducacion: 0,
            montoSaludAPS: 0,
            montoSinSector: 0,
            montoChequesRegistrados: 0,
            montoImputadoCheques: 0,
            diferenciaGlobalCheques: 0
        };

        const movimientos = (movRes.recordset || []).map((m) => {
            const monto = Number(m.Monto || 0);
            const dias = Number(m.DiasPagados || 0);
            const concepto = String(m.Concepto || 'Sin Concepto').trim();
            const banco = String(m.Banco || '').trim() || 'SIN BANCO';
            const numDoc = String(m.NumeroDocumento || '').trim() || 'SIN DOCUMENTO';
            const codSector = Number(m.CodSector || 0);
            const sectorNombre = codSector === 1 ? 'Educación' : codSector === 2 ? 'Salud APS' : 'Otro / Central';
            const nombreFuncionario = [m.Nombre, m.Paterno, m.Materno].filter(Boolean).join(' ').trim();
            const rutFormateado = m.Rut ? `${m.Rut}${m.DV ? '-' + m.DV : ''}` : '';

            // Actualizar acumuladores globales del mes
            resumen.totalMovimientos += 1;
            resumen.totalDiasPagados += dias;
            resumen.montoTotalMes += monto;

            if (m.NumeroLicencia) licenciasSetMes.add(m.NumeroLicencia);
            if (m.Rut) funcionariosSetMes.add(m.Rut);

            const conceptoUpper = concepto.toUpperCase();
            if (conceptoUpper === 'SUBSIDIO') resumen.montoSubsidio += monto;
            else if (conceptoUpper === 'APORTE') resumen.montoAporte += monto;
            else if (conceptoUpper === 'DESCUENTO') resumen.montoDescuento += monto;
            else if (conceptoUpper === 'DEVOLUCION' || conceptoUpper === 'DEVOLUCIÓN') resumen.montoDevolucion += monto;
            else resumen.montoOtros += monto;

            if (codSector === 1) resumen.montoEducacion += monto;
            else if (codSector === 2) resumen.montoSaludAPS += monto;
            else resumen.montoSinSector += monto;

            // Agrupar en documento
            const docKey = normalizeKey(banco, numDoc);
            if (!docGroups.has(docKey)) {
                const isDescuentoPayroll = banco.toUpperCase() === 'DESCUENTO';
                const ch = isDescuentoPayroll
                    ? null
                    : (chequesByExactKey.get(docKey) || (numDoc.length >= 4 ? chequesByNumDoc.get(numDoc.toUpperCase()) : null) || null);
                const gl = globalByExactKey.get(docKey) || (!isDescuentoPayroll && numDoc.length >= 4 ? globalByNumDoc.get(numDoc.toUpperCase()) : null) || null;
                docGroups.set(docKey, {
                    docKey,
                    Banco: banco,
                    NumeroDocumento: numDoc,
                    EnTablaCheques: Boolean(ch),
                    TipoDocumento: ch ? (ch.Tipo || 'Transferencia') : (banco.toUpperCase() === 'DESCUENTO' ? 'Nómina Descuento' : 'Sin Cabecera'),
                    AreaCheque: ch ? (ch.Area || '') : '',
                    EstadoCheque: ch ? (ch.Estado || 'Abierto') : (banco.toUpperCase() === 'DESCUENTO' ? 'Nómina RRHH' : 'Sin Cabecera'),
                    FechaCheque: ch ? ch.FechaCheque : null,
                    MontoChequeOriginal: ch ? Number(ch.MontoCheque || 0) : 0,
                    SaldoTablaCheque: ch ? Number(ch.SaldoTabla || 0) : 0,
                    MontoImputadoGlobal: gl ? Number(gl.MontoImputadoGlobal || 0) : 0,
                    TotalMovimientosGlobal: gl ? Number(gl.TotalMovimientosGlobal || 0) : 0,
                    PrimeraFechaDeposito: gl ? gl.PrimeraFechaDeposito : m.FechaDeposito,
                    UltimaFechaDeposito: gl ? gl.UltimaFechaDeposito : m.FechaDeposito,
                    FechaDepositoMinMes: m.FechaDeposito,
                    FechaDepositoMaxMes: m.FechaDeposito,
                    FechaRecepcionMinMes: m.FechaRecepcion,
                    FechaRecepcionMaxMes: m.FechaRecepcion,
                    CantMovimientosMes: 0,
                    licenciasSet: new Set(),
                    funcionariosSet: new Set(),
                    establecimientosSet: new Set(),
                    institucionesMap: new Map(),
                    observacionesSet: new Set(),
                    sectoresSet: new Set(),
                    TotalDiasPagadosMes: 0,
                    MontoTotalMes: 0,
                    MontoSubsidioMes: 0,
                    MontoAporteMes: 0,
                    MontoDescuentoMes: 0,
                    MontoDevolucionMes: 0
                });
            }

            const g = docGroups.get(docKey);
            g.CantMovimientosMes += 1;
            g.TotalDiasPagadosMes += dias;
            g.MontoTotalMes += monto;

            if (conceptoUpper === 'SUBSIDIO') g.MontoSubsidioMes += monto;
            else if (conceptoUpper === 'APORTE') g.MontoAporteMes += monto;
            else if (conceptoUpper === 'DESCUENTO') g.MontoDescuentoMes += monto;
            else if (conceptoUpper === 'DEVOLUCION' || conceptoUpper === 'DEVOLUCIÓN') g.MontoDevolucionMes += monto;

            if (m.NumeroLicencia) g.licenciasSet.add(m.NumeroLicencia);
            if (m.Rut) g.funcionariosSet.add(m.Rut);
            if (m.Establecimiento) g.establecimientosSet.add(m.Establecimiento);
            if (m.ObservacionPago) g.observacionesSet.add(m.ObservacionPago);
            g.sectoresSet.add(sectorNombre);

            const instName = m.Salud || 'SIN INSTITUCIÓN';
            g.institucionesMap.set(instName, (g.institucionesMap.get(instName) || 0) + monto);

            if (m.FechaDeposito) {
                if (!g.FechaDepositoMinMes || m.FechaDeposito < g.FechaDepositoMinMes) g.FechaDepositoMinMes = m.FechaDeposito;
                if (!g.FechaDepositoMaxMes || m.FechaDeposito > g.FechaDepositoMaxMes) g.FechaDepositoMaxMes = m.FechaDeposito;
            }
            if (m.FechaRecepcion) {
                if (!g.FechaRecepcionMinMes || m.FechaRecepcion < g.FechaRecepcionMinMes) g.FechaRecepcionMinMes = m.FechaRecepcion;
                if (!g.FechaRecepcionMaxMes || m.FechaRecepcion > g.FechaRecepcionMaxMes) g.FechaRecepcionMaxMes = m.FechaRecepcion;
            }

            return {
                ...m,
                DocKey: docKey,
                Banco: banco,
                NumeroDocumento: numDoc,
                Concepto: concepto,
                Monto: monto,
                DiasPagados: dias,
                NombreCompleto: nombreFuncionario,
                RutFormateado: rutFormateado,
                SectorNombre: sectorNombre
            };
        });

        // Incluir también cheques de DETALLE_CHEQUES cuya Fecha cae en el período pero aún no tienen movimientos en el mes
        for (const ch of (chequesRes.recordset || [])) {
            const docKey = normalizeKey(ch.Banco, ch.NumeroDocumento);
            const numUpper = String(ch.NumeroDocumento || '').trim().toUpperCase();
            const alreadyIncluded = docGroups.has(docKey) || Array.from(docGroups.values()).some(d => d.NumeroDocumento.toUpperCase() === numUpper);
            if (!alreadyIncluded && ch.FechaCheque && ch.FechaCheque >= fechaInicio && ch.FechaCheque < fechaFin) {
                const gl = globalByExactKey.get(docKey) || globalByNumDoc.get(numUpper) || null;
                docGroups.set(docKey, {
                    docKey,
                    Banco: ch.Banco || 'SIN BANCO',
                    NumeroDocumento: ch.NumeroDocumento || 'SIN DOCUMENTO',
                    EnTablaCheques: true,
                    TipoDocumento: ch.Tipo || 'Transferencia',
                    AreaCheque: ch.Area || '',
                    EstadoCheque: ch.Estado || 'Abierto',
                    FechaCheque: ch.FechaCheque,
                    MontoChequeOriginal: Number(ch.MontoCheque || 0),
                    SaldoTablaCheque: Number(ch.SaldoTabla || 0),
                    MontoImputadoGlobal: gl ? Number(gl.MontoImputadoGlobal || 0) : 0,
                    TotalMovimientosGlobal: gl ? Number(gl.TotalMovimientosGlobal || 0) : 0,
                    PrimeraFechaDeposito: gl ? gl.PrimeraFechaDeposito : ch.FechaCheque,
                    UltimaFechaDeposito: gl ? gl.UltimaFechaDeposito : ch.FechaCheque,
                    FechaDepositoMinMes: ch.FechaCheque,
                    FechaDepositoMaxMes: ch.FechaCheque,
                    FechaRecepcionMinMes: null,
                    FechaRecepcionMaxMes: null,
                    CantMovimientosMes: 0,
                    licenciasSet: new Set(),
                    funcionariosSet: new Set(),
                    establecimientosSet: new Set(),
                    institucionesMap: new Map(),
                    observacionesSet: new Set(),
                    sectoresSet: new Set(ch.Area ? [ch.Area] : []),
                    TotalDiasPagadosMes: 0,
                    MontoTotalMes: 0,
                    MontoSubsidioMes: 0,
                    MontoAporteMes: 0,
                    MontoDescuentoMes: 0,
                    MontoDevolucionMes: 0
                });
            }
        }

        // Construir arreglo final de documentos consolidados
        const documentos = Array.from(docGroups.values()).map((g) => {
            const institucionesOrdenadas = Array.from(g.institucionesMap.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([nombre, total]) => ({ nombre, total }));

            const institucionesResumen = institucionesOrdenadas
                .slice(0, 3)
                .map(i => i.nombre)
                .join(', ') + (institucionesOrdenadas.length > 3 ? ` (+${institucionesOrdenadas.length - 3})` : '');

            const diferenciaRealCheque = g.EnTablaCheques
                ? (g.MontoChequeOriginal - g.MontoImputadoGlobal)
                : 0;

            let estadoCuadratura = 'Nómina / Directo';
            if (g.EnTablaCheques) {
                if (Math.abs(diferenciaRealCheque) <= 5) {
                    estadoCuadratura = 'Cuadrado 100%';
                } else if (g.MontoImputadoGlobal === 0) {
                    estadoCuadratura = 'Sin Imputar';
                } else if (diferenciaRealCheque > 0) {
                    estadoCuadratura = 'Saldo por Imputar';
                } else {
                    estadoCuadratura = 'Sobre-Imputado';
                }
            } else if (g.Banco.toUpperCase() === 'DESCUENTO') {
                estadoCuadratura = 'Nómina Descuento RRHH';
            }

            // Actualizar contadores de resumen de documentos
            resumen.totalDocumentos += 1;
            if (g.EnTablaCheques) {
                resumen.documentosEnTablaCheques += 1;
                resumen.montoChequesRegistrados += g.MontoChequeOriginal;
                resumen.montoImputadoCheques += g.MontoImputadoGlobal;
                if (String(g.EstadoCheque).toUpperCase().includes('CERRAD')) {
                    resumen.documentosCerrados += 1;
                } else {
                    resumen.documentosAbiertos += 1;
                }
                if (Math.abs(diferenciaRealCheque) <= 5) {
                    resumen.documentosCuadrados += 1;
                } else {
                    resumen.documentosConDiferencia += 1;
                }
            } else if (g.Banco.toUpperCase() === 'DESCUENTO') {
                resumen.documentosNominaDescuento += 1;
            }

            return {
                DocKey: g.docKey,
                Banco: g.Banco,
                NumeroDocumento: g.NumeroDocumento,
                EnTablaCheques: g.EnTablaCheques,
                TipoDocumento: g.TipoDocumento,
                AreaCheque: g.AreaCheque || Array.from(g.sectoresSet).join(' / '),
                EstadoCheque: g.EstadoCheque,
                EstadoCuadratura: estadoCuadratura,
                FechaCheque: g.FechaCheque,
                FechaDeposito: g.FechaDepositoMaxMes || g.FechaCheque,
                FechaDepositoMin: g.FechaDepositoMinMes,
                FechaDepositoMax: g.FechaDepositoMaxMes,
                FechaRecepcion: g.FechaRecepcionMaxMes,
                FechaRecepcionMin: g.FechaRecepcionMinMes,
                FechaRecepcionMax: g.FechaRecepcionMaxMes,
                CantMovimientosMes: g.CantMovimientosMes,
                CantLicencias: g.licenciasSet.size,
                CantFuncionarios: g.funcionariosSet.size,
                CantEstablecimientos: g.establecimientosSet.size,
                TotalDiasPagadosMes: g.TotalDiasPagadosMes,
                InstitucionesResumen: institucionesResumen || '—',
                InstitucionesDesglose: institucionesOrdenadas,
                SectoresResumen: Array.from(g.sectoresSet).join(' / ') || '—',
                ObservacionesResumen: Array.from(g.observacionesSet).join(' | ') || '—',
                MontoTotalMes: g.MontoTotalMes,
                MontoSubsidioMes: g.MontoSubsidioMes,
                MontoAporteMes: g.MontoAporteMes,
                MontoDescuentoMes: g.MontoDescuentoMes,
                MontoDevolucionMes: g.MontoDevolucionMes,
                MontoChequeOriginal: g.MontoChequeOriginal,
                SaldoTablaCheque: g.SaldoTablaCheque,
                MontoImputadoGlobal: g.MontoImputadoGlobal,
                TotalMovimientosGlobal: g.TotalMovimientosGlobal,
                DiferenciaRealCheque: diferenciaRealCheque
            };
        }).sort((a, b) => {
            const fa = a.FechaDeposito || a.FechaCheque || '';
            const fb = b.FechaDeposito || b.FechaCheque || '';
            if (fa !== fb) return fb.localeCompare(fa);
            return b.MontoTotalMes - a.MontoTotalMes;
        });

        resumen.totalLicenciasDistintas = licenciasSetMes.size;
        resumen.totalFuncionariosDistintos = funcionariosSetMes.size;
        resumen.diferenciaGlobalCheques = resumen.montoChequesRegistrados - resumen.montoImputadoCheques;

        return res.json({
            status: 'ok',
            resumen,
            documentos,
            movimientos
        });
    } catch (err) {
        console.error('Error en GET /informes/documentos-pago-mes:', err);
        res.status(500).json({ error: 'Error consultando documentos de pago recibidos en el mes' });
    }
});

module.exports = router;
