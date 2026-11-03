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

        // Si busca por apellido paterno, devolver lista de coincidencias
        if (!rut && paterno) {
            const listRes = await pool.request()
                .input('Pat', sql.NVarChar, `%${paterno}%`)
                .query(`
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
                    WHERE F.Paterno LIKE @Pat
                    ORDER BY F.Paterno ASC, F.Materno ASC, F.Nombre ASC
                `);
            return res.json({ status: 'ok', modo: 'lista', funcionarios: listRes.recordset });
        }

        if (!rut) {
            return res.status(400).json({ error: 'Ingrese un RUT o Apellido Paterno para consultar' });
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

        // Licencias del funcionario (LicenciasPorFuncionarioTableAdapter)
        const licRes = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
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
                    ISNULL(SUM(D.Monto), 0) as MontoPagadoDetalle
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_PAGO_ACTUAL P ON L.NumeroLicencia = P.NumeroLicencia
                LEFT JOIN LIC_DETALLE_PAGO_ACTUAL D ON L.NumeroLicencia = D.NumeroLicencia
                WHERE L.RutFuncionario = @Rut
                GROUP BY
                    L.NumeroLicencia, L.Desde, L.Hasta, L.NumDias, L.DiasAutorizados,
                    L.Rechazo, L.Parcial, L.regularizado, L.Observacion, L.Obser_apelacion,
                    L.PagoDirecto, L.Tipo_enferm, L.PagoEstimado, L.MontoDesc, P.TotalPagado
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
                LEFT JOIN LIC_SALUD S ON HP.CodSalud = S.CodSalud
                WHERE YEAR(L.Desde) = @Anio AND MONTH(L.Desde) = @Mes
                  AND (
                    (F.CodUnidad IN (530, 384) AND HP.CodSalud = 41 AND RTRIM(ISNULL(F.descripcionPlanta, '')) <> 'DOCENTE')
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
            LEFT JOIN LIC_SALUD S ON HP.CodSalud = S.CodSalud
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

module.exports = router;
