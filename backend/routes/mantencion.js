const express = require('express');
const sql = require('mssql');
const nodemailer = require('nodemailer');
const router = express.Router();

const cleanRut = (rawRut) => {
    if (!rawRut) return '';
    return String(rawRut).split('-')[0].replace(/\./g, '').trim();
};

// 1. Obtener ficha completa del funcionario por RUT
router.get('/funcionario/:rut', async (req, res) => {
    try {
        const pool = req.db;
        const rut = cleanRut(req.params.rut);
        if (!rut) return res.status(400).json({ error: 'RUT requerido' });

        // Buscar en Personal (vigente/actual)
        const reqPers = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT TOP 1
                    RTRIM(ISNULL([NOMBRE], '')) as Nombre,
                    RTRIM(ISNULL([PATERNO], '')) as Paterno,
                    RTRIM(ISNULL([MATERNO], '')) as Materno,
                    RTRIM(ISNULL([codigoe], '')) as Cenco,
                    RTRIM(ISNULL([DV], '')) as DV,
                    RTRIM(ISNULL([INICIO], '')) as FechaInicio,
                    RTRIM(ISNULL([TERMINO], '')) as FechaTermino,
                    RTRIM(ISNULL([R1], '')) as Salud,
                    RTRIM(ISNULL([R2], '')) as Prevision,
                    RTRIM(ISNULL([DIAS TRAB], '')) as DiasTrabajados,
                    RTRIM(ISNULL([DETALLE], '')) as DetalleContrato,
                    RTRIM(ISNULL([CESEMPLEADO], '0')) as CesEmpleadoRaw,
                    RTRIM(ISNULL([CESEMPLEADOR], '0')) as CesEmpleadorRaw,
                    RTRIM(ISNULL([CODIGO], '')) as CodigoSector,
                    RTRIM(ISNULL([DESCRIPCION], '')) as Planta,
                    RTRIM(ISNULL([NOMBRE UNIDAD], '')) as NombreUnidad,
                    RTRIM(ISNULL([DIRECCION], '')) as Direccion,
                    RTRIM(ISNULL([TELEFONO], '')) as Telefono,
                    RTRIM(ISNULL([VIGENCIA], '')) as Vigencia
                FROM Personal
                WHERE RTRIM([RUT EMPLEADO]) = @Rut
            `);

        let funcionario = null;
        let enPersonal = false;

        if (reqPers.recordset.length > 0) {
            const p = reqPers.recordset[0];
            enPersonal = true;

            let tipoContrato = p.DetalleContrato;
            if (p.DetalleContrato === '1') tipoContrato = 'Indefinido';
            else if (p.DetalleContrato === '2') tipoContrato = 'Plazo Fijo';
            else if (p.DetalleContrato === '3') tipoContrato = 'Reemplazo';

            const cesEmpNum = parseFloat(String(p.CesEmpleadoRaw || '0').replace(',', '.')) || 0;
            const cesEmplNum = parseFloat(String(p.CesEmpleadorRaw || '0').replace(',', '.')) || 0;

            let unidad = p.NombreUnidad;
            // Lógica SEP (384) y PIE (530)
            if (p.Cenco === '384' || p.Cenco === '530') {
                const reqSep = await pool.request()
                    .input('Rut', sql.NVarChar, rut)
                    .query(`
                        SELECT RTRIM(ISNULL(DES_UNIDAD_TRAB, '')) as DesUnidad
                        FROM LIC_CARGA_HORARIA_SEP_PIE
                        WHERE RTRIM(RUT) = @Rut
                    `);
                const unidadesSep = reqSep.recordset
                    .map(r => r.DesUnidad)
                    .filter(Boolean);
                unidad = unidadesSep.length > 0 ? unidadesSep.join(' | ') : 'CASA CENTRAL';
            }

            funcionario = {
                Rut: rut,
                DV: p.DV,
                Nombre: p.Nombre,
                Paterno: p.Paterno,
                Materno: p.Materno,
                NombreCompleto: `${p.Nombre} ${p.Paterno} ${p.Materno}`.trim(),
                Cenco: p.Cenco,
                FechaInicio: p.FechaInicio,
                FechaTermino: p.FechaTermino,
                Salud: p.Salud,
                Prevision: p.Prevision,
                DiasTrabajados: p.DiasTrabajados,
                TipoContrato: tipoContrato,
                CesantiaEmpleado: cesEmpNum > 0 ? 'S' : 'N',
                CesantiaEmpleador: cesEmplNum > 0 ? 'S' : 'N',
                Sector: p.CodigoSector === '1' ? 'Educacion' : 'Salud',
                Planta: p.Planta,
                Unidad: unidad,
                Direccion: p.Direccion,
                Telefono: p.Telefono,
                Vigencia: p.Vigencia
            };
        } else {
            // Fallback a LIC_FUNCIONARIO para consultas de pagos históricos
            const reqFun = await pool.request()
                .input('Rut', sql.NVarChar, rut)
                .query(`
                    SELECT TOP 1
                        RTRIM(ISNULL(Rut, '')) as Rut,
                        RTRIM(ISNULL(DV, '')) as DV,
                        RTRIM(ISNULL(Nombre, '')) as Nombre,
                        RTRIM(ISNULL(Paterno, '')) as Paterno,
                        RTRIM(ISNULL(Materno, '')) as Materno,
                        RTRIM(ISNULL(CodUnidad, '')) as Cenco,
                        RTRIM(ISNULL(descripcionPlanta, '')) as Planta,
                        RTRIM(ISNULL(fAfiliacion, '')) as FAfiliacion
                    FROM LIC_FUNCIONARIO
                    WHERE RTRIM(Rut) = @Rut
                `);
            if (reqFun.recordset.length > 0) {
                const f = reqFun.recordset[0];
                funcionario = {
                    Rut: rut,
                    DV: f.DV,
                    Nombre: f.Nombre,
                    Paterno: f.Paterno,
                    Materno: f.Materno,
                    NombreCompleto: `${f.Nombre} ${f.Paterno} ${f.Materno}`.trim(),
                    Cenco: f.Cenco,
                    FechaInicio: '',
                    FechaTermino: '',
                    Salud: '',
                    Prevision: '',
                    DiasTrabajados: '',
                    TipoContrato: '',
                    CesantiaEmpleado: '',
                    CesantiaEmpleador: '',
                    Sector: '',
                    Planta: f.Planta,
                    Unidad: '',
                    Direccion: '',
                    Telefono: '',
                    Vigencia: 'N'
                };
            }
        }

        // Fecha Afiliación desde LIC_FUNCIONARIO
        const reqAfil = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`SELECT TOP 1 RTRIM(ISNULL(fAfiliacion, '')) as FAfiliacion FROM LIC_FUNCIONARIO WHERE RTRIM(Rut) = @Rut`);
        const fAfiliacion = reqAfil.recordset.length > 0 ? reqAfil.recordset[0].FAfiliacion : '';

        // Observación Funcionario desde LIC_OBSERVACIONES
        const reqObs = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`SELECT TOP 1 RTRIM(ISNULL(Observacion, '')) as Observacion FROM LIC_OBSERVACIONES WHERE RTRIM(Rut) = @Rut`);
        const observacionFuncionario = reqObs.recordset.length > 0 ? reqObs.recordset[0].Observacion : '';

        // Correo Establecimiento desde LIC_ESTABLECIMIENTO
        let correoEstablecimiento = '';
        if (funcionario && funcionario.Cenco && !isNaN(parseInt(funcionario.Cenco, 10))) {
            const reqMail = await pool.request()
                .input('CodUnidad', sql.Int, parseInt(funcionario.Cenco, 10))
                .query(`SELECT TOP 1 RTRIM(ISNULL(Mail, '')) as Mail FROM LIC_ESTABLECIMIENTO WHERE CodUnidad = @CodUnidad`);
            if (reqMail.recordset.length > 0) {
                correoEstablecimiento = reqMail.recordset[0].Mail;
            }
        }

        // Historial de licencias del funcionario (replica resumenpagosTableAdapter: suma desde LIC_DETALLE_PAGO_ACTUAL)
        const reqLic = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT 
                    RTRIM(L.NumeroLicencia) as NumeroLicencia,
                    CONVERT(varchar, L.Desde, 23) as Desde,
                    CONVERT(varchar, L.Hasta, 23) as Hasta,
                    ISNULL(L.NumDias, 0) as NumDias,
                    ISNULL(L.DiasAutorizados, 0) as DiasAutorizados,
                    CONVERT(varchar, L.Recepcion, 23) as Recepcion,
                    CONVERT(varchar, L.Remision, 23) as Remision,
                    RTRIM(ISNULL(L.PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(L.Tipo_enferm, '')) as Tipo_enferm,
                    RTRIM(ISNULL(L.TipoLic, '')) as TipoLic,
                    ISNULL(L.PagoEstimado, 0) as PagoEstimado,
                    ISNULL(L.SubsidioDiario, 0) as SubsidioDiario,
                    ISNULL(L.MontoNetoPromedio, 0) as MontoNetoPromedio,
                    ISNULL(L.MontoDesc, 0) as MontoDesc,
                    ISNULL(L.Rechazo, 0) as Rechazo,
                    ISNULL(L.regularizado, 0) as Regularizado,
                    ISNULL(L.Retenida, 0) as Retenida,
                    ISNULL(L.Maternal, 0) as Maternal,
                    ISNULL(L.Parcial, 0) as Parcial,
                    ISNULL(L.Pendiente, 0) as Pendiente,
                    RTRIM(ISNULL(L.Autorizada, '')) as Autorizada,
                    RTRIM(ISNULL(L.Observacion, '')) as Observacion,
                    RTRIM(ISNULL(L.Obser_apelacion, '')) as Obser_apelacion,
                    RTRIM(ISNULL(L.Observacion_Compin, '')) as Observacion_Compin,
                    RTRIM(ISNULL(L.Observacion_CajaLA, '')) as Observacion_CajaLA,
                    RTRIM(ISNULL(L.observ_mutual, '')) as ObservMutual,
                    CASE WHEN ISNULL(DP.CantPagos, 0) > 0 THEN ISNULL(DP.SumaDias, 0) ELSE ISNULL(P.NumDiasPagados, 0) END as NumDiasPagados,
                    CASE WHEN ISNULL(DP.CantPagos, 0) > 0 THEN ISNULL(DP.DiasSubsidio, 0) ELSE ISNULL(P.NumDiasPagados, 0) END as DiasPagadosSubsidio,
                    ISNULL(DP.DiasAporte, 0) as DiasPagadosAporte,
                    ISNULL(P.DiasCobrar, 0) as DiasCobrar,
                    CASE WHEN ISNULL(DP.CantPagos, 0) > 0 THEN ISNULL(DP.SumaMonto, 0) ELSE ISNULL(P.TotalPagado, 0) END as TotalPagado,
                    ISNULL(DP.SumaMonto, 0) as TotalDetallePagado,
                    ISNULL(DP.CantPagos, 0) as CantidadPagos
                FROM LIC_LICENCIA_ACTUAL L
                LEFT JOIN LIC_PAGO_ACTUAL P ON L.NumeroLicencia = P.NumeroLicencia
                LEFT JOIN (
                    SELECT 
                        NumeroLicencia,
                        SUM(ISNULL(Monto, 0)) as SumaMonto,
                        SUM(ISNULL(DiasPagados, 0)) as SumaDias,
                        SUM(CASE WHEN RTRIM(ISNULL(concepto, '')) = 'Aporte' THEN ISNULL(DiasPagados, 0) ELSE 0 END) as DiasAporte,
                        SUM(CASE WHEN RTRIM(ISNULL(concepto, '')) <> 'Aporte' THEN ISNULL(DiasPagados, 0) ELSE 0 END) as DiasSubsidio,
                        COUNT(*) as CantPagos
                    FROM LIC_DETALLE_PAGO_ACTUAL
                    GROUP BY NumeroLicencia
                ) DP ON L.NumeroLicencia = DP.NumeroLicencia
                WHERE L.RutFuncionario = @Rut
                ORDER BY L.Desde DESC
            `);

        // Últimas rentas imponibles del funcionario
        const reqRentas = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT TOP 12
                    Anio, Mes,
                    ISNULL(MontoImponible, 0) as MontoImponible,
                    ISNULL(descPrevision, 0) as descPrevision,
                    ISNULL(descSalud, 0) as descSalud,
                    ISNULL(impuestoUnico, 0) as impuestoUnico,
                    ISNULL(montoNeto, 0) as montoNeto
                FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL
                WHERE RTRIM(RutFuncionario) = @Rut
                ORDER BY Anio DESC, Mes DESC
            `);

        res.json({
            status: 'ok',
            enPersonal,
            funcionario: funcionario ? {
                ...funcionario,
                FAfiliacion: fAfiliacion,
                ObservacionFuncionario: observacionFuncionario,
                CorreoEstablecimiento: correoEstablecimiento
            } : null,
            licencias: reqLic.recordset,
            rentas: reqRentas.recordset
        });
    } catch (err) {
        console.error('Error en GET /funcionario/:rut:', err);
        res.status(500).json({ error: 'Error consultando datos del funcionario' });
    }
});

// 2. Guardar Observación permanente del funcionario (LIC_OBSERVACIONES)
router.post('/funcionario/observacion', async (req, res) => {
    try {
        const pool = req.db;
        const rut = cleanRut(req.body.rut);
        const observacion = req.body.observacion || '';
        if (!rut) return res.status(400).json({ error: 'RUT requerido' });

        const check = await pool.request()
            .input('Rut', sql.VarChar, rut)
            .query(`SELECT TOP 1 Rut FROM LIC_OBSERVACIONES WHERE RTRIM(Rut) = @Rut`);

        if (check.recordset.length > 0) {
            await pool.request()
                .input('Rut', sql.VarChar, rut)
                .input('Obs', sql.VarChar, observacion)
                .query(`UPDATE LIC_OBSERVACIONES SET Observacion = @Obs WHERE RTRIM(Rut) = @Rut`);
            res.json({ status: 'ok', message: 'Observación del funcionario fue actualizada' });
        } else {
            await pool.request()
                .input('Rut', sql.VarChar, rut)
                .input('Obs', sql.VarChar, observacion)
                .query(`INSERT INTO LIC_OBSERVACIONES (Rut, Observacion) VALUES (@Rut, @Obs)`);
            res.json({ status: 'ok', message: 'Observación del funcionario ha sido ingresada' });
        }
    } catch (err) {
        console.error('Error guardando observación funcionario:', err);
        res.status(500).json({ error: 'Error guardando observación del funcionario' });
    }
});

// 3. Guardar Fecha de Afiliación (LIC_FUNCIONARIO)
router.post('/funcionario/afiliacion', async (req, res) => {
    try {
        const pool = req.db;
        const rut = cleanRut(req.body.rut);
        const fAfiliacion = req.body.fAfiliacion || '';
        if (!rut) return res.status(400).json({ error: 'RUT requerido' });

        await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .input('FAfil', sql.NVarChar, fAfiliacion)
            .query(`UPDATE LIC_FUNCIONARIO SET fAfiliacion = @FAfil WHERE RTRIM(Rut) = @Rut`);

        res.json({ status: 'ok', message: 'Fecha de afiliación actualizada' });
    } catch (err) {
        console.error('Error guardando afiliación:', err);
        res.status(500).json({ error: 'Error actualizando fecha de afiliación' });
    }
});

// 4. Buscar y Registrar Médico Tratante (LIC_PROFESIONAL_TRATANTE)
router.get('/medico/:rut', async (req, res) => {
    try {
        const pool = req.db;
        const rut = req.params.rut.trim();
        const result = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .query(`
                SELECT TOP 1 RTRIM(ISNULL(RutProfesional, '')) as RutProfesional, RTRIM(ISNULL(Nombre, '')) as Nombre
                FROM LIC_PROFESIONAL_TRATANTE
                WHERE RTRIM(RutProfesional) = @Rut OR RTRIM(RutProfesional) = REPLACE(@Rut, '-', '')
            `);
        res.json({ status: 'ok', medico: result.recordset[0] || null });
    } catch (err) {
        console.error('Error buscando médico:', err);
        res.status(500).json({ error: 'Error buscando médico tratante' });
    }
});

router.post('/medico', async (req, res) => {
    try {
        const pool = req.db;
        const { rutProfesional, nombre } = req.body;
        if (!rutProfesional || !nombre) {
            return res.status(400).json({ error: 'RUT y Nombre del médico son requeridos' });
        }
        const check = await pool.request()
            .input('Rut', sql.NVarChar, rutProfesional.trim())
            .query(`SELECT TOP 1 RutProfesional FROM LIC_PROFESIONAL_TRATANTE WHERE RTRIM(RutProfesional) = @Rut`);

        if (check.recordset.length > 0) {
            await pool.request()
                .input('Rut', sql.NVarChar, rutProfesional.trim())
                .input('Nombre', sql.NVarChar, nombre.trim())
                .query(`UPDATE LIC_PROFESIONAL_TRATANTE SET Nombre = @Nombre WHERE RTRIM(RutProfesional) = @Rut`);
            return res.json({ status: 'ok', message: 'Médico actualizado correctamente' });
        }

        await pool.request()
            .input('Rut', sql.NVarChar, rutProfesional.trim())
            .input('Nombre', sql.NVarChar, nombre.trim())
            .query(`INSERT INTO LIC_PROFESIONAL_TRATANTE (RutProfesional, Nombre) VALUES (@Rut, @Nombre)`);

        res.json({ status: 'ok', message: 'Médico ingresado correctamente' });
    } catch (err) {
        console.error('Error guardando médico:', err);
        res.status(500).json({ error: 'Error guardando médico tratante' });
    }
});

// 5. Calcular Pago Estimado, Subsidio Diario, Monto Neto Promedio y Descuento (replica exacta de Calcular_PagoEstimado VB.NET)
router.post('/calcular-estimado', async (req, res) => {
    try {
        const pool = req.db;
        const rut = cleanRut(req.body.rut);
        const { fechaBase, numDias, diasAutorizados } = req.body;
        if (!rut || !fechaBase) {
            return res.status(400).json({ error: 'RUT y Fecha Desde/Concesión son requeridos para el cálculo' });
        }

        const baseDate = new Date(`${fechaBase}T00:00:00`);
        if (isNaN(baseDate.getTime())) {
            return res.status(400).json({ error: 'Fecha inválida' });
        }

        const getPrevMonth = (d, monthsBack) => {
            const copy = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
            return { mes: copy.getMonth() + 1, anio: copy.getFullYear() };
        };

        const m1 = getPrevMonth(baseDate, 1);
        const m2 = getPrevMonth(baseDate, 2);
        const m3 = getPrevMonth(baseDate, 3);

        const rentasRes = await pool.request()
            .input('Rut', sql.NVarChar, rut)
            .input('M1', sql.Int, m1.mes).input('A1', sql.Int, m1.anio)
            .input('M2', sql.Int, m2.mes).input('A2', sql.Int, m2.anio)
            .input('M3', sql.Int, m3.mes).input('A3', sql.Int, m3.anio)
            .query(`
                SELECT Anio, Mes,
                    ISNULL(MontoImponible, 0) as MontoImponible,
                    ISNULL(descPrevision, 0) as descPrevision,
                    ISNULL(descSalud, 0) as descSalud,
                    ISNULL(impuestoUnico, 0) as impuestoUnico,
                    ISNULL(montoNeto, 0) as montoNeto
                FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL
                WHERE RTRIM(RutFuncionario) = @Rut
                  AND ((Mes = @M1 AND Anio = @A1) OR (Mes = @M2 AND Anio = @A2) OR (Mes = @M3 AND Anio = @A3))
                ORDER BY Anio DESC, Mes DESC
            `);

        const rentas = rentasRes.recordset;
        let sumimp = 0, sumnet = 0, sumprev = 0, sumsal = 0, sumimpunico = 0;

        if (rentas.length > 0) {
            for (const r of rentas) {
                sumimp += Number(r.MontoImponible || 0) / 30;
                sumnet += Number(r.montoNeto || 0) / 30;
                sumprev += Number(r.descPrevision || 0) / 30;
                sumsal += Number(r.descSalud || 0) / 30;
                sumimpunico += Number(r.impuestoUnico || 0) / 30;
            }
            sumimp = Math.floor(sumimp / 3);
            sumnet = Math.floor(sumnet / 3);
            sumprev = Math.floor(sumprev / 3);
            sumsal = Math.floor(sumsal / 3);
            sumimpunico = Math.floor(sumimpunico);
        }

        const nDiasLic = parseInt(numDias || 0, 10);
        const nDiasAut = diasAutorizados !== undefined && diasAutorizados !== '' ? parseInt(diasAutorizados, 10) : nDiasLic;

        const parcial = (sumprev + sumsal) * nDiasAut;
        const sumimp_neto = sumimp - (sumprev + sumsal + sumimpunico);
        const difdesc = nDiasLic - nDiasAut;
        const descuento = sumimp * difdesc;

        let pagoEstimado = 0;
        if (rentas.length > 0) {
            if (nDiasAut > 10) {
                const total1 = sumimp_neto * nDiasAut;
                pagoEstimado = total1 + parcial;
            } else if (nDiasAut <= 3) {
                pagoEstimado = parcial;
            } else {
                const saldo = nDiasAut - 3;
                pagoEstimado = ((sumprev + sumsal) * nDiasAut) + (sumimp_neto * saldo);
            }
        }

        res.json({
            status: 'ok',
            rentas,
            calculo: {
                montoNetoPromedio: sumnet,
                subsidioDiario: sumimp_neto,
                pagoEstimado: Math.round(pagoEstimado),
                descuento: Math.round(descuento),
                sumimp,
                sumprev,
                sumsal
            }
        });
    } catch (err) {
        console.error('Error en calcular-estimado:', err);
        res.status(500).json({ error: 'Error al calcular pago estimado' });
    }
});

// 6. Obtener una licencia por Número (incluyendo resumen de pagos y detalle de pagos)
router.get('/licencia/:numero', async (req, res) => {
    try {
        const pool = req.db;
        const numero = req.params.numero.trim();

        const licRes = await pool.request()
            .input('Num', sql.NVarChar, numero)
            .query(`
                SELECT TOP 1
                    RTRIM(NumeroLicencia) as NumeroLicencia,
                    RTRIM(ISNULL(RutFuncionario, '')) as RutFuncionario,
                    RTRIM(ISNULL(dv, '')) as DV,
                    CONVERT(varchar, Desde, 23) as Desde,
                    CONVERT(varchar, Hasta, 23) as Hasta,
                    ISNULL(NumDias, 0) as NumDias,
                    ISNULL(DiasAutorizados, 0) as DiasAutorizados,
                    ISNULL(Maternal, 0) as Maternal,
                    CONVERT(varchar, Recepcion, 23) as Recepcion,
                    CONVERT(varchar, Remision, 23) as Remision,
                    ISNULL(Rechazo, 0) as Rechazo,
                    ISNULL(Parcial, 0) as Parcial,
                    ISNULL(regularizado, 0) as Regularizado,
                    ISNULL(Retenida, 0) as Retenida,
                    ISNULL(Pendiente, 0) as Pendiente,
                    ISNULL(Descuento, 0) as DescuentoCheck,
                    ISNULL(MontoDesc, 0) as MontoDesc,
                    ISNULL(MontoNetoPromedio, 0) as MontoNetoPromedio,
                    ISNULL(SubsidioDiario, 0) as SubsidioDiario,
                    ISNULL(PagoEstimado, 0) as PagoEstimado,
                    RTRIM(ISNULL(Observacion, '')) as Observacion,
                    RTRIM(ISNULL(Observacion_CajaLA, '')) as Observacion_CajaLA,
                    RTRIM(ISNULL(Obser_apelacion, '')) as Obser_apelacion,
                    RTRIM(ISNULL(Observacion_Compin, '')) as Observacion_Compin,
                    RTRIM(ISNULL(observ_mutual, '')) as ObservMutual,
                    RTRIM(ISNULL(RutMedico, '')) as RutMedico,
                    RTRIM(ISNULL(nombreMedico, '')) as NombreMedico,
                    RTRIM(ISNULL(PagoDirecto, '')) as PagoDirecto,
                    RTRIM(ISNULL(Tipo_enferm, '')) as Tipo_enferm,
                    RTRIM(ISNULL(TipoLic, '')) as TipoLic,
                    RTRIM(ISNULL(Apelacion, '')) as Apelacion,
                    RTRIM(ISNULL(Suseso, '')) as Suseso,
                    RTRIM(ISNULL(Compin, '')) as Compin,
                    RTRIM(ISNULL(Autorizada, '')) as Autorizada,
                    RTRIM(ISNULL(Direccion, '')) as Direccion,
                    RTRIM(ISNULL(telefono, '')) as Telefono,
                    RTRIM(ISNULL(JornadaParcial, '')) as JornadaParcial,
                    RTRIM(ISNULL(altaAchs, '')) as AltaAchs,
                    RTRIM(ISNULL(Usuario, '')) as Usuario,
                    RTRIM(ISNULL(FechaHora, '')) as FechaHora
                FROM LIC_LICENCIA_ACTUAL
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        if (licRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Licencia no encontrada' });
        }

        const licencia = licRes.recordset[0];

        const pagoActualRes = await pool.request()
            .input('Num', sql.NVarChar, numero)
            .query(`
                SELECT TOP 1
                    ISNULL(NumDiasLicencia, 0) as NumDiasLicencia,
                    ISNULL(NumDiasPagados, 0) as NumDiasPagados,
                    ISNULL(DiasCobrar, 0) as DiasCobrar,
                    ISNULL(TotalPagado, 0) as TotalPagado,
                    ISNULL(Descuento, 0) as Descuento
                FROM LIC_PAGO_ACTUAL
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        const detallePagosRes = await pool.request()
            .input('Num', sql.NVarChar, numero)
            .query(`
                SELECT 
                    Correlativo,
                    RTRIM(ISNULL(CONVERT(varchar(50), NumeroLicencia), '')) as NumeroLicencia,
                    RTRIM(ISNULL(NumeroDocumento, '')) as NumeroDocumento,
                    CONVERT(varchar, FechaDepCtaCte, 23) as FechaDepCtaCte,
                    ISNULL(DiasPagados, 0) as DiasPagados,
                    CONVERT(varchar, Desde, 23) as Desde,
                    CONVERT(varchar, Hasta, 23) as Hasta,
                    ISNULL(Monto, 0) as Monto,
                    RTRIM(ISNULL(Observacion, '')) as Observacion,
                    CONVERT(varchar, recepcion, 23) as Recepcion,
                    RTRIM(ISNULL(concepto, '')) as Concepto,
                    RTRIM(ISNULL(Banco, '')) as Banco,
                    RTRIM(ISNULL(cenco, '')) as Cenco
                FROM LIC_DETALLE_PAGO_ACTUAL
                WHERE NumeroLicencia = @Num
                ORDER BY Correlativo DESC
            `);

        // Calcular resumen de días pagados igual que en Frm_IngresoPago.vb
        let diasSubsidio = 0;
        let diasDescuento = 0;
        let diasAporte = 0;
        let diasSinConcepto = 0;
        let totalMontoDetalle = 0;
        let totalDiasDetalle = 0;

        for (const d of detallePagosRes.recordset) {
            const c = (d.Concepto || '').trim();
            const dp = Number(d.DiasPagados || 0);
            if (c === 'Subsidio' || c === 'Ampliación Dias') diasSubsidio += dp;
            else if (c === 'Descuento') diasDescuento += dp;
            else if (c === 'Aporte') diasAporte += dp;
            else if (!c) diasSinConcepto += dp;
            totalDiasDetalle += dp;
            totalMontoDetalle += Number(d.Monto || 0);
        }

        const diasCobrarCalc = Number(licencia.NumDias || 0) - (diasSubsidio + diasDescuento);
        const paRow = pagoActualRes.recordset[0];
        const tieneDetalles = detallePagosRes.recordset.length > 0;

        res.json({
            status: 'ok',
            licencia,
            pagoActual: {
                NumDiasLicencia: paRow ? paRow.NumDiasLicencia : licencia.NumDias,
                NumDiasPagados: tieneDetalles ? totalDiasDetalle : (paRow ? paRow.NumDiasPagados : 0),
                DiasCobrar: tieneDetalles ? diasCobrarCalc : (paRow ? paRow.DiasCobrar : diasCobrarCalc),
                TotalPagado: tieneDetalles ? totalMontoDetalle : (paRow ? paRow.TotalPagado : 0),
                Descuento: paRow ? paRow.Descuento : licencia.MontoDesc
            },
            resumenDetalle: {
                diasSubsidio,
                diasDescuento,
                diasAporte,
                diasSinConcepto,
                diasCobrar: diasCobrarCalc,
                totalPagado: tieneDetalles ? totalMontoDetalle : (paRow ? paRow.TotalPagado : 0)
            },
            detallePagos: detallePagosRes.recordset
        });
    } catch (err) {
        console.error('Error obteniendo licencia:', err);
        res.status(500).json({ error: 'Error consultando la licencia' });
    }
});

// 7. Crear o Modificar Licencia (Frm_IngresoLicencias y Frm_IngresoLicenciasMutual)
router.post('/licencia', async (req, res) => {
    const pool = req.db;
    const transaction = new sql.Transaction(pool);
    try {
        const b = req.body;
        const numeroLicencia = String(b.numeroLicencia || '').trim();
        const rutFuncionario = cleanRut(b.rutFuncionario);

        if (!numeroLicencia || !rutFuncionario) {
            return res.status(400).json({ error: 'Número de Licencia y RUT del funcionario son obligatorios' });
        }

        await transaction.begin();

        const checkRes = await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numeroLicencia)
            .query(`SELECT TOP 1 NumeroLicencia FROM LIC_LICENCIA_ACTUAL WHERE RTRIM(NumeroLicencia) = @Num`);

        const exists = checkRes.recordset.length > 0;
        const numDias = parseInt(b.numDias || 0, 10);
        const diasAutorizados = b.diasAutorizados !== undefined && b.diasAutorizados !== '' ? parseInt(b.diasAutorizados, 10) : numDias;
        const montoNetoPromedio = parseFloat(b.montoNetoPromedio || 0) || 0;
        const subsidioDiario = parseFloat(b.subsidioDiario || 0) || 0;
        const pagoEstimado = parseFloat(b.pagoEstimado || 0) || 0;
        const montoDesc = parseInt(b.montoDesc || 0, 10) || 0;

        const reqLic = new sql.Request(transaction);
        reqLic.input('NumeroLicencia', sql.NVarChar, numeroLicencia);
        reqLic.input('RutFuncionario', sql.NVarChar, rutFuncionario);
        reqLic.input('DV', sql.NVarChar, String(b.dv || '').trim());
        reqLic.input('Desde', sql.Date, b.desde || null);
        reqLic.input('Hasta', sql.Date, b.hasta || null);
        reqLic.input('NumDias', sql.Int, numDias);
        reqLic.input('DiasAutorizados', sql.Int, diasAutorizados);
        reqLic.input('Maternal', sql.Bit, b.maternal ? 1 : 0);
        reqLic.input('Recepcion', sql.Date, b.recepcion || null);
        reqLic.input('Remision', sql.Date, b.remision || null);
        reqLic.input('Rechazo', sql.Bit, b.rechazo ? 1 : 0);
        reqLic.input('Parcial', sql.Bit, b.parcial ? 1 : 0);
        reqLic.input('Regularizado', sql.Bit, b.regularizado ? 1 : 0);
        reqLic.input('Retenida', sql.Bit, b.retenida ? 1 : 0);
        reqLic.input('Pendiente', sql.Bit, b.pendiente ? 1 : 0);
        reqLic.input('Descuento', sql.Bit, b.descuentoCheck ? 1 : 0);
        reqLic.input('MontoDesc', sql.Int, montoDesc);
        reqLic.input('Observacion', sql.NVarChar, String(b.observacion || ''));
        reqLic.input('ObservacionCajaLA', sql.VarChar, String(b.observacionCajaLA || ''));
        reqLic.input('ObservMutual', sql.NChar, String(b.observMutual || ''));
        reqLic.input('MontoNetoPromedio', sql.Decimal(18, 0), montoNetoPromedio);
        reqLic.input('SubsidioDiario', sql.Decimal(18, 0), subsidioDiario);
        reqLic.input('PagoEstimado', sql.Decimal(18, 0), pagoEstimado);
        reqLic.input('RutMedico', sql.NVarChar, String(b.rutMedico || '').trim());
        reqLic.input('NombreMedico', sql.NVarChar, String(b.nombreMedico || '').trim());
        reqLic.input('PagoDirecto', sql.NChar, String(b.pagoDirecto || 'Normal').trim());
        reqLic.input('TipoEnferm', sql.NChar, String(b.tipoEnferm || '').trim());
        reqLic.input('Apelacion', sql.NChar, b.apelacion ? 'True' : 'False');
        reqLic.input('Suseso', sql.NChar, b.suseso ? 'True' : 'False');
        reqLic.input('Compin', sql.NChar, b.compin ? 'True' : 'False');
        reqLic.input('Autorizada', sql.NChar, b.autorizada ? 'True' : 'False');
        reqLic.input('ObserApelacion', sql.NVarChar, String(b.obserApelacion || ''));
        reqLic.input('ObservacionCompin', sql.NVarChar, String(b.observacionCompin || ''));
        reqLic.input('Direccion', sql.NChar, String(b.direccion || ''));
        reqLic.input('Telefono', sql.NChar, String(b.telefono || ''));
        reqLic.input('TipoLic', sql.NChar, String(b.tipoLic || ''));
        reqLic.input('Usuario', sql.NChar, String(b.usuario || 'Sistema'));
        reqLic.input('JornadaParcial', sql.VarChar, String(b.jornadaParcial || ''));
        reqLic.input('AltaAchs', sql.NChar, String(b.altaAchs || ''));

        if (!exists) {
            await reqLic.query(`
                INSERT INTO LIC_LICENCIA_ACTUAL (
                    NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias, DiasAutorizados,
                    Maternal, Recepcion, Remision, Rechazo, Parcial, Observacion,
                    MontoNetoPromedio, SubsidioDiario, PagoEstimado, RutMedico, nombreMedico,
                    regularizado, dv, PagoDirecto, Descuento, MontoDesc, Tipo_enferm,
                    Apelacion, Suseso, Compin, Autorizada, Obser_apelacion, Observacion_Compin,
                    Direccion, telefono, TipoLic, Usuario, FechaHora,
                    Retenida, JornadaParcial, Pendiente, altaAchs, Observacion_CajaLA, observ_mutual
                ) VALUES (
                    @NumeroLicencia, @RutFuncionario, @Desde, @Hasta, @NumDias, @DiasAutorizados,
                    @Maternal, @Recepcion, @Remision, @Rechazo, @Parcial, @Observacion,
                    @MontoNetoPromedio, @SubsidioDiario, @PagoEstimado, @RutMedico, @NombreMedico,
                    @Regularizado, @DV, @PagoDirecto, @Descuento, @MontoDesc, @TipoEnferm,
                    @Apelacion, @Suseso, @Compin, @Autorizada, @ObserApelacion, @ObservacionCompin,
                    @Direccion, @Telefono, @TipoLic, @Usuario, CONVERT(varchar, GETDATE(), 20),
                    @Retenida, @JornadaParcial, @Pendiente, @AltaAchs, @ObservacionCajaLA, @ObservMutual
                )
            `);

            await new sql.Request(transaction)
                .input('NumeroLicencia', sql.NVarChar, numeroLicencia)
                .input('NumDias', sql.Int, numDias)
                .input('Descuento', sql.Int, montoDesc)
                .query(`
                    INSERT INTO LIC_PAGO_ACTUAL (
                        NumeroLicencia, NumDiasLicencia, NumDiasPagados, DiasCobrar, TotalPagado, Descuento
                    ) VALUES (
                        @NumeroLicencia, @NumDias, 0, @NumDias, 0, @Descuento
                    )
                `);
        } else {
            await reqLic.query(`
                UPDATE LIC_LICENCIA_ACTUAL SET
                    RutFuncionario = @RutFuncionario,
                    Desde = @Desde,
                    Hasta = @Hasta,
                    NumDias = @NumDias,
                    DiasAutorizados = @DiasAutorizados,
                    Maternal = @Maternal,
                    Recepcion = @Recepcion,
                    Remision = @Remision,
                    Rechazo = @Rechazo,
                    Parcial = @Parcial,
                    Retenida = @Retenida,
                    Observacion = @Observacion,
                    Observacion_CajaLA = @ObservacionCajaLA,
                    observ_mutual = @ObservMutual,
                    MontoNetoPromedio = @MontoNetoPromedio,
                    SubsidioDiario = @SubsidioDiario,
                    PagoEstimado = @PagoEstimado,
                    RutMedico = @RutMedico,
                    nombreMedico = @NombreMedico,
                    regularizado = @Regularizado,
                    PagoDirecto = @PagoDirecto,
                    Descuento = @Descuento,
                    MontoDesc = @MontoDesc,
                    Tipo_enferm = @TipoEnferm,
                    Apelacion = @Apelacion,
                    Suseso = @Suseso,
                    Compin = @Compin,
                    Autorizada = @Autorizada,
                    Pendiente = @Pendiente,
                    Obser_apelacion = @ObserApelacion,
                    Observacion_Compin = @ObservacionCompin,
                    Direccion = @Direccion,
                    telefono = @Telefono,
                    TipoLic = @TipoLic,
                    JornadaParcial = @JornadaParcial,
                    altaAchs = @AltaAchs
                WHERE RTRIM(NumeroLicencia) = @NumeroLicencia
            `);

            const pagoRes = await new sql.Request(transaction)
                .input('NumeroLicencia', sql.NVarChar, numeroLicencia)
                .query(`SELECT TOP 1 ISNULL(NumDiasPagados, 0) as NumDiasPagados FROM LIC_PAGO_ACTUAL WHERE RTRIM(NumeroLicencia) = @NumeroLicencia`);

            if (pagoRes.recordset.length > 0) {
                const diasCobrar = numDias - Number(pagoRes.recordset[0].NumDiasPagados || 0);
                await new sql.Request(transaction)
                    .input('NumeroLicencia', sql.NVarChar, numeroLicencia)
                    .input('NumDias', sql.Int, numDias)
                    .input('DiasCobrar', sql.Int, diasCobrar)
                    .input('Descuento', sql.Int, montoDesc)
                    .query(`
                        UPDATE LIC_PAGO_ACTUAL
                        SET NumDiasLicencia = @NumDias, DiasCobrar = @DiasCobrar, Descuento = @Descuento
                        WHERE RTRIM(NumeroLicencia) = @NumeroLicencia
                    `);
            } else {
                await new sql.Request(transaction)
                    .input('NumeroLicencia', sql.NVarChar, numeroLicencia)
                    .input('NumDias', sql.Int, numDias)
                    .input('Descuento', sql.Int, montoDesc)
                    .query(`
                        INSERT INTO LIC_PAGO_ACTUAL (
                            NumeroLicencia, NumDiasLicencia, NumDiasPagados, DiasCobrar, TotalPagado, Descuento
                        ) VALUES (
                            @NumeroLicencia, @NumDias, 0, @NumDias, 0, @Descuento
                        )
                    `);
            }
        }

        // Actualizar fAfiliacion si viene informada
        if (b.fAfiliacion !== undefined) {
            await new sql.Request(transaction)
                .input('Rut', sql.NVarChar, rutFuncionario)
                .input('FAfil', sql.NVarChar, String(b.fAfiliacion || ''))
                .query(`UPDATE LIC_FUNCIONARIO SET fAfiliacion = @FAfil WHERE RTRIM(Rut) = @Rut`);
        }

        await transaction.commit();
        res.json({
            status: 'ok',
            accion: exists ? 'MODIFICADA' : 'INGRESADA',
            message: exists ? 'Licencia modificada correctamente' : 'Licencia ingresada correctamente'
        });
    } catch (err) {
        await transaction.rollback();
        console.error('Error guardando licencia:', err);
        res.status(500).json({ error: 'Error al guardar la licencia en base de datos' });
    }
});

// 8. Eliminar Licencia (solo si totalpagado == 0, igual que Frm_IngresoLicencias.vb Button7_Click_1)
router.delete('/licencia/:numero', async (req, res) => {
    const pool = req.db;
    const transaction = new sql.Transaction(pool);
    try {
        const numero = req.params.numero.trim();
        await transaction.begin();

        const pagoRes = await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numero)
            .query(`SELECT TOP 1 ISNULL(TotalPagado, 0) as TotalPagado FROM LIC_PAGO_ACTUAL WHERE RTRIM(NumeroLicencia) = @Num`);

        const detRes = await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numero)
            .query(`SELECT COUNT(*) as cnt FROM LIC_DETALLE_PAGO_ACTUAL WHERE RTRIM(NumeroLicencia) = @Num`);

        const totalPagado = pagoRes.recordset.length > 0 ? Number(pagoRes.recordset[0].TotalPagado || 0) : 0;
        const countDetalles = detRes.recordset[0].cnt || 0;

        if (totalPagado > 0 || countDetalles > 0) {
            await transaction.rollback();
            return res.status(400).json({ error: 'No se puede eliminar la licencia, tiene pagos ingresados' });
        }

        await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numero)
            .query(`DELETE FROM LIC_PAGO_ACTUAL WHERE RTRIM(NumeroLicencia) = @Num`);

        await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numero)
            .query(`DELETE FROM LIC_LICENCIA_ACTUAL WHERE RTRIM(NumeroLicencia) = @Num`);

        await transaction.commit();
        res.json({ status: 'ok', message: 'Licencia eliminada correctamente' });
    } catch (err) {
        await transaction.rollback();
        console.error('Error eliminando licencia:', err);
        res.status(500).json({ error: 'Error al eliminar la licencia' });
    }
});

// 9. Envío de Correos (Recepción y Rechazo de Licencia - replica exacta de Frm_IngresoLicencias.vb)
const createSmtpTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-legacy.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: {
            user: process.env.SMTP_USER || 'licenciasmedicas@cmds.cl',
            pass: process.env.SMTP_PASS || 'Medicas2025.'
        },
        tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
        }
    });
};

router.post('/correo/recepcion', async (req, res) => {
    try {
        const pool = req.db;
        const b = req.body;
        if (!b.correoFuncionario) {
            return res.status(400).json({ error: 'Complete correo del establecimiento/funcionario' });
        }

        let mailCCList = ['ctoro@cmds.cl', 'adorador@cmds.cl', 'cfredes@cmds.cl', b.correoFuncionario];

        // Lógica de búsqueda de correos en copia (SEP 384 / PIE 530 o LIC_MAIL_ENVIO)
        const cenco = String(b.cenco || '').trim();
        const rut = cleanRut(b.rut);
        const sector = String(b.sector || '').trim();
        const planta = String(b.planta || '').trim();

        if (cenco === '384' || cenco === '530') {
            const sepRes = await pool.request()
                .input('Rut', sql.NVarChar, rut)
                .query(`SELECT RTRIM(ISNULL(COD_UNIDAD_TRAB, '')) as codUnidad FROM LIC_CARGA_HORARIA_SEP_PIE WHERE RTRIM(RUT) = @Rut`);

            if (sepRes.recordset.length > 0) {
                for (const row of sepRes.recordset) {
                    const codU = parseInt(row.codUnidad, 10);
                    if (!isNaN(codU)) {
                        const estRes = await pool.request()
                            .input('CodU', sql.Int, codU)
                            .query(`SELECT RTRIM(ISNULL(Mail, '')) as Mail FROM LIC_ESTABLECIMIENTO WHERE CodUnidad = @CodU`);
                        estRes.recordset.forEach(r => {
                            if (r.Mail) mailCCList.push(r.Mail);
                        });
                    }
                }
            } else {
                const envRes = await pool.request()
                    .input('Sucursal', sql.VarChar, sector)
                    .input('CodU', sql.VarChar, cenco)
                    .input('Cargo', sql.VarChar, planta)
                    .query(`SELECT RTRIM(ISNULL(mail, '')) as mail FROM LIC_MAIL_ENVIO WHERE RTRIM(sucursal) = @Sucursal AND RTRIM(cod_unidad) = @CodU AND RTRIM(cargo) = @Cargo`);
                envRes.recordset.forEach(r => {
                    if (r.mail) mailCCList.push(r.mail);
                });
            }
        } else {
            const envRes = await pool.request()
                .input('Sucursal', sql.VarChar, sector)
                .input('Cargo', sql.VarChar, planta)
                .query(`SELECT RTRIM(ISNULL(mail, '')) as mail FROM LIC_MAIL_ENVIO WHERE RTRIM(sucursal) = @Sucursal AND RTRIM(cod_unidad) = '0' AND RTRIM(cargo) = @Cargo`);
            envRes.recordset.forEach(r => {
                if (r.mail) mailCCList.push(r.mail);
            });
        }

        const tipoLic = b.parcial ? 'Parcial' : 'Total';
        let jornada = '';
        if (b.parcial) {
            if (b.jornadaParcial === 'M') jornada = 'Mañana';
            else if (b.jornadaParcial === 'T') jornada = 'Tarde';
            else if (b.jornadaParcial === 'N') jornada = 'Noche';
        }

        let altaAchs = 'No Aplica';
        if (String(b.pagoDirecto || '').trim() === 'ACHS OR') {
            if (b.altaAchs === 'ADF') altaAchs = 'Alta Diferida';
            else if (b.altaAchs === 'ADI') altaAchs = 'Alta en el Día';
            else if (b.altaAchs === 'AIN') altaAchs = 'Alta Inmediata';
            else if (b.altaAchs === 'TAD') altaAchs = 'Termino Reposo Administrativo';
            else if (b.altaAchs === 'TIN') altaAchs = 'Termino Reposo por Inasistencia';
            else altaAchs = 'No Informado';
        }

        const htmlBody = `
            <HTML><BODY>
            <p>Estimad@ junto con saludar, se informa la recepcion de licencia medica electronica del funcionario(a):</p><BR>
            <table border="1" style="text-align:center; border-collapse: collapse;" cellpadding="6">
                <tr><th scope="col">Nombre Funcionario</th><th scope="col">Rut</th><th scope="col">Cargo</th></tr>
                <tr><td>${b.nombreCompleto || ''}</td><td>${rut}</td><td>${planta}</td></tr>
            </table><BR>
            <p>Los datos de la licencia son los siguientes:</p><BR>
            <table border="1" style="text-align:center; border-collapse: collapse;" cellpadding="6">
                <tr>
                    <th scope="col">Nº Licencia</th><th scope="col">Cant. Dias</th><th scope="col">Desde</th><th scope="col">Hasta</th>
                    <th scope="col">Tipo Enfermedad</th><th scope="col">Tipo Reposo</th><th scope="col">Jornada</th>
                    <th scope="col">Tipo Licencia</th><th scope="col">Tipo Alta ACHS</th>
                </tr>
                <tr>
                    <td>${b.numeroLicencia || ''}</td><td>${b.numDias || ''}</td><td>${b.desde || ''}</td><td>${b.hasta || ''}</td>
                    <td>${b.tipoEnferm || ''}</td><td>${jornada}</td><td>${tipoLic}</td>
                    <td>${b.pagoDirecto || ''}</td><td>${altaAchs}</td>
                </tr>
            </table><BR>
            <p>Atte.</p>
            <p align="center"><B>DEPARTAMENTO RRHH - UNIDAD LICENCIAS MEDICAS</B></p>
            <p align="center"><B>CORPORACION MUNICIPAL DE DESARROLLO SOCIAL DE ANTOFAGASTA</B></p>
            </BODY></HTML>
        `;

        const transporter = createSmtpTransporter();
        await transporter.sendMail({
            from: '"Licencias Medicas CMDS" <licenciasmedicas@cmds.cl>',
            to: b.correoFuncionario,
            cc: [...new Set(mailCCList.filter(Boolean))].join(', '),
            subject: `Recepción Licencias Medica ${b.nombreCompleto || ''}`,
            html: htmlBody
        });

        res.json({ status: 'ok', message: 'Correo de recepción fue enviado con éxito' });
    } catch (err) {
        console.error('Error enviando correo recepción:', err);
        res.status(500).json({ error: `Error al enviar correo: ${err.message}` });
    }
});

router.post('/correo/rechazo', async (req, res) => {
    try {
        const b = req.body;
        if (!b.correoRechazo) {
            return res.status(400).json({ error: 'Complete dirección de correo para aviso de rechazo' });
        }

        const diasLic = parseInt(b.numDias || 0, 10);
        const diasAuto = parseInt(b.diasAutorizados || 0, 10);
        const diasRech = diasLic - diasAuto;

        const htmlBody = `
            <HTML><BODY>
            <p>Estimad@ Director junto con saludar, solicito informar al funcionario(a) <B>${b.nombreCompleto || ''}</B>, que su licencia médica se encuentra retenida por la institución de Salud a la cual pertenece.</p><BR>
            <table border="1" style="text-align:center; border-collapse: collapse;" cellpadding="6">
                <tr>
                    <th scope="col">Licencia Médica N°</th><th scope="col">Desde</th><th scope="col">Hasta</th>
                    <th scope="col">Dias Licencia</th><th scope="col">Dias Autorizados</th>
                    <th scope="col">Dias Rechazados/Reducidos</th><th scope="col">Institución</th>
                </tr>
                <tr>
                    <td>${b.numeroLicencia || ''}</td><td>${b.desde || ''}</td><td>${b.hasta || ''}</td>
                    <td>${diasLic}</td><td>${diasAuto}</td><td>${diasRech}</td><td>${b.salud || ''}</td>
                </tr>
            </table><BR><BR>
            <P><B>CAUSA DE MODIFICACIÓN O RECHAZO</B></P>
            <B>${b.obserApelacion || ''}</B><BR><BR>
            <P>Sin embargo, Usted puede ejercer su derecho de reclamo ante la Comisión de Medicina Preventiva e Invalidez COMPIN, correspondiente al Art. 37 Ley 18.933.</P>
            <P>Cabe mencionar que una vez realizada la apelación ante la entidad correspondiente, debe presentar documentación timbrada en nuestras oficinas de CMDS en horario de atención de público.</P>
            <P>Observación: Si no se ha resuelto el estado de su licencia médica pasado los tres meses posteriores a la fecha de inicio de reposo, se procederá a efectuar el descuento correspondiente en sus remuneraciones.</P>
            <p>Atte.</p>
            <p align="center"><B>DEPARTAMENTO RRHH - UNIDAD LICENCIAS MEDICAS</B></p>
            <p align="center"><B>CORPORACION MUNICIPAL DE DESARROLLO SOCIAL DE ANTOFAGASTA</B></p>
            </BODY></HTML>
        `;

        const transporter = createSmtpTransporter();
        await transporter.sendMail({
            from: '"Licencias Medicas CMDS" <licenciasmedicas@cmds.cl>',
            to: b.correoRechazo,
            cc: 'ctoro@cmds.cl, adorador@cmds.cl, cfredes@cmds.cl',
            subject: `Rechazo Licencias Medica ${b.nombreCompleto || ''}`,
            html: htmlBody
        });

        res.json({ status: 'ok', message: 'Correo de rechazo fue enviado con éxito' });
    } catch (err) {
        console.error('Error enviando correo rechazo:', err);
        res.status(500).json({ error: `Error al enviar correo: ${err.message}` });
    }
});

// =========================================================================
// ENDPOINTS DE INGRESO DE PAGOS Y GESTIÓN DE CHEQUES (Frm_IngresoPago.vb)
// =========================================================================

// 10. Listar Bancos
router.get('/bancos', async (req, res) => {
    try {
        const pool = req.db;
        const result = await pool.request().query(`SELECT RTRIM(banco) as banco FROM BANCOS WHERE banco IS NOT NULL`);
        res.json({ status: 'ok', bancos: result.recordset.map(r => r.banco) });
    } catch (err) {
        console.error('Error obteniendo bancos:', err);
        res.status(500).json({ error: 'Error obteniendo lista de bancos' });
    }
});

// 11. Consultar Cheque / Documento (DETALLE_CHEQUES + LIC_DETALLE_PAGO_ACTUAL)
router.get('/cheque', async (req, res) => {
    try {
        const pool = req.db;
        const banco = String(req.query.banco || '').trim();
        const num = String(req.query.num || '').trim();
        if (!banco || !num) {
            return res.status(400).json({ error: 'Banco y N° de Cheque/Documento son requeridos' });
        }

        const chRes = await pool.request()
            .input('Banco', sql.NVarChar, banco)
            .input('Num', sql.NVarChar, num)
            .query(`
                SELECT TOP 1
                    RTRIM(banco) as Banco,
                    RTRIM(num) as Num,
                    ISNULL(monto, 0) as Monto,
                    ISNULL(saldo, 0) as SaldoTabla,
                    CONVERT(varchar, Fecha, 23) as Fecha,
                    RTRIM(ISNULL(Tipo, 'Cheque')) as Tipo,
                    RTRIM(ISNULL(area, 'Educacion')) as Area,
                    RTRIM(ISNULL(estado, 'Abierto')) as Estado
                FROM DETALLE_CHEQUES
                WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num
            `);

        const movRes = await pool.request()
            .input('Banco', sql.NVarChar, banco)
            .input('Num', sql.NVarChar, num)
            .query(`
                SELECT 
                    Correlativo,
                    RTRIM(ISNULL(NumeroLicencia, '')) as NumeroLicencia,
                    RTRIM(ISNULL(NumeroDocumento, '')) as NumeroDocumento,
                    CONVERT(varchar, FechaDepCtaCte, 23) as FechaDepCtaCte,
                    ISNULL(DiasPagados, 0) as DiasPagados,
                    CONVERT(varchar, Desde, 23) as Desde,
                    CONVERT(varchar, Hasta, 23) as Hasta,
                    ISNULL(Monto, 0) as Monto,
                    RTRIM(ISNULL(Observacion, '')) as Observacion,
                    CONVERT(varchar, recepcion, 23) as Recepcion,
                    RTRIM(ISNULL(concepto, '')) as Concepto,
                    RTRIM(ISNULL(Banco, '')) as Banco,
                    RTRIM(ISNULL(cenco, '')) as Cenco
                FROM LIC_DETALLE_PAGO_ACTUAL
                WHERE RTRIM(Banco) = @Banco AND RTRIM(NumeroDocumento) = @Num
                ORDER BY Correlativo DESC
            `);

        const sumaOcupada = movRes.recordset.reduce((acc, r) => acc + Number(r.Monto || 0), 0);
        const cantidad = movRes.recordset.length;

        if (chRes.recordset.length === 0) {
            return res.json({
                status: 'ok',
                encontrado: false,
                cheque: null,
                sumaOcupada,
                cantidad,
                movimientos: movRes.recordset
            });
        }

        res.json({
            status: 'ok',
            encontrado: true,
            cheque: {
                ...chRes.recordset[0],
                SaldoCalculado: sumaOcupada,
                CantidadDocumentos: cantidad
            },
            sumaOcupada,
            cantidad,
            movimientos: movRes.recordset
        });
    } catch (err) {
        console.error('Error consultando cheque:', err);
        res.status(500).json({ error: 'Error consultando cheque/documento' });
    }
});

// 12. Registrar o Modificar Cheque (DETALLE_CHEQUES)
router.post('/cheque', async (req, res) => {
    try {
        const pool = req.db;
        const { banco, num, monto, saldo, fecha, tipo, estado, area } = req.body;
        if (!banco || !num) {
            return res.status(400).json({ error: 'Banco y N° de Cheque son obligatorios' });
        }

        const checkRes = await pool.request()
            .input('Banco', sql.NVarChar, banco.trim())
            .input('Num', sql.NVarChar, num.trim())
            .query(`SELECT TOP 1 RTRIM(ISNULL(estado, '')) as Estado FROM DETALLE_CHEQUES WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num`);

        if (checkRes.recordset.length > 0) {
            await pool.request()
                .input('Banco', sql.NVarChar, banco.trim())
                .input('Num', sql.NVarChar, num.trim())
                .input('Monto', sql.Int, parseInt(monto || 0, 10))
                .input('Saldo', sql.Int, parseInt(saldo || 0, 10))
                .input('Fecha', sql.Date, fecha || new Date())
                .input('Tipo', sql.NChar, String(tipo || 'Cheque').trim())
                .input('Estado', sql.NChar, String(estado || 'Abierto').trim())
                .input('Area', sql.NChar, String(area || 'Educacion').trim())
                .query(`
                    UPDATE DETALLE_CHEQUES
                    SET monto = @Monto, saldo = @Saldo, Fecha = @Fecha, Tipo = @Tipo, estado = @Estado, area = @Area
                    WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num
                `);
            res.json({ status: 'ok', message: 'Documento modificado correctamente' });
        } else {
            await pool.request()
                .input('Banco', sql.NChar, banco.trim())
                .input('Num', sql.NChar, num.trim())
                .input('Monto', sql.Int, parseInt(monto || 0, 10))
                .input('Saldo', sql.Int, parseInt(saldo || 0, 10))
                .input('Fecha', sql.Date, fecha || new Date())
                .input('Tipo', sql.NChar, String(tipo || 'Cheque').trim())
                .input('Estado', sql.NChar, String(estado || 'Abierto').trim())
                .input('Area', sql.NChar, String(area || 'Educacion').trim())
                .query(`
                    INSERT INTO DETALLE_CHEQUES (banco, num, monto, saldo, Fecha, Tipo, estado, area)
                    VALUES (@Banco, @Num, @Monto, @Saldo, @Fecha, @Tipo, @Estado, @Area)
                `);
            res.json({ status: 'ok', message: 'Documento registrado correctamente' });
        }
    } catch (err) {
        console.error('Error guardando cheque:', err);
        res.status(500).json({ error: 'Error al guardar el documento/cheque' });
    }
});

// 13. Ingresar Pago de Licencia (Frm_IngresoPago.vb Btn_Grabar_Click)
router.post('/pago', async (req, res) => {
    const pool = req.db;
    const transaction = new sql.Transaction(pool);
    try {
        const b = req.body;
        const numeroLicencia = String(b.numeroLicencia || '').trim();
        const numeroDocumento = String(b.numeroDocumento || '').trim();
        const banco = String(b.banco || '').trim();
        const concepto = String(b.concepto || 'Subsidio').trim();
        const diasPagados = parseInt(b.diasPagados || 0, 10);
        const monto = parseInt(b.monto || 0, 10);

        if (!numeroLicencia || !numeroDocumento) {
            return res.status(400).json({ error: 'N° de Licencia y N° de Documento son obligatorios' });
        }

        await transaction.begin();

        // Verificar cheque si está asociado
        const chRes = await new sql.Request(transaction)
            .input('Banco', sql.NVarChar, banco)
            .input('Num', sql.NVarChar, numeroDocumento)
            .query(`
                SELECT TOP 1 ISNULL(monto, 0) as Monto, ISNULL(saldo, 0) as Saldo, RTRIM(ISNULL(estado, '')) as Estado
                FROM DETALLE_CHEQUES
                WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num
            `);

        if (chRes.recordset.length > 0) {
            const ch = chRes.recordset[0];
            if (ch.Estado === 'Cerrado') {
                await transaction.rollback();
                return res.status(400).json({ error: 'El cheque está cerrado, no puede ingresar más documentos' });
            }
            if (ch.Monto > 0 && monto > ch.Monto) {
                await transaction.rollback();
                return res.status(400).json({ error: 'No puede ingresar el pago: el monto es superior al monto del cheque' });
            }
        }

        // Verificar LIC_PAGO_ACTUAL y LIC_LICENCIA_ACTUAL
        const licRes = await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numeroLicencia)
            .query(`
                SELECT TOP 1 ISNULL(NumDias, 0) as NumDias, RTRIM(ISNULL(Obser_apelacion, '')) as ObserApelacion
                FROM LIC_LICENCIA_ACTUAL
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        if (licRes.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'La licencia no existe en LIC_LICENCIA_ACTUAL' });
        }

        if (licRes.recordset[0].ObserApelacion.toUpperCase() === 'PAGO DIRECTO') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Licencia con Pago Directo' });
        }

        if (diasPagados > Number(licRes.recordset[0].NumDias || 0)) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Días por pagar no puede ser mayor a los días de licencia' });
        }

        const pagoActualRes = await new sql.Request(transaction)
            .input('Num', sql.NVarChar, numeroLicencia)
            .query(`
                SELECT TOP 1
                    ISNULL(NumDiasLicencia, 0) as NumDiasLicencia,
                    ISNULL(NumDiasPagados, 0) as NumDiasPagados,
                    ISNULL(DiasCobrar, 0) as DiasCobrar,
                    ISNULL(TotalPagado, 0) as TotalPagado
                FROM LIC_PAGO_ACTUAL
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        if (concepto !== 'Devolucion') {
            if (pagoActualRes.recordset.length > 0) {
                const pa = pagoActualRes.recordset[0];
                const nuevoDiasCobrar = concepto !== 'Aporte'
                    ? Number(pa.DiasCobrar || 0) - diasPagados
                    : Number(pa.DiasCobrar || 0);
                const nuevoDiasPagados = Number(pa.NumDiasPagados || 0) + diasPagados;
                const nuevoTotalPagado = Number(pa.TotalPagado || 0) + monto;

                await new sql.Request(transaction)
                    .input('Num', sql.NVarChar, numeroLicencia)
                    .input('DiasPag', sql.Int, nuevoDiasPagados)
                    .input('DiasCob', sql.Int, nuevoDiasCobrar)
                    .input('TotalPag', sql.Decimal(18, 0), nuevoTotalPagado)
                    .query(`
                        UPDATE LIC_PAGO_ACTUAL
                        SET NumDiasPagados = @DiasPag, DiasCobrar = @DiasCob, TotalPagado = @TotalPag
                        WHERE RTRIM(NumeroLicencia) = @Num
                    `);
            } else {
                const numDiasLic = Number(licRes.recordset[0].NumDias || 0);
                await new sql.Request(transaction)
                    .input('Num', sql.NVarChar, numeroLicencia)
                    .input('NumDiasLic', sql.Int, numDiasLic)
                    .input('DiasPag', sql.Int, diasPagados)
                    .input('DiasCob', sql.Int, numDiasLic - diasPagados)
                    .input('TotalPag', sql.Decimal(18, 0), monto)
                    .query(`
                        INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia, NumDiasPagados, DiasCobrar, TotalPagado, Descuento)
                        VALUES (@Num, @NumDiasLic, @DiasPag, @DiasCob, @TotalPag, 0)
                    `);
            }
        }

        // Insertar en LIC_DETALLE_PAGO_ACTUAL usando secuencia dbo.correlativo
        await new sql.Request(transaction)
            .input('NumeroLicencia', sql.NVarChar, numeroLicencia)
            .input('NumeroDocumento', sql.NVarChar, numeroDocumento)
            .input('FechaDep', sql.Date, b.fechaDocumento || new Date())
            .input('DiasPagados', sql.Int, diasPagados)
            .input('Desde', sql.Date, b.desde || null)
            .input('Hasta', sql.Date, b.hasta || null)
            .input('Monto', sql.Decimal(18, 0), monto)
            .input('Observacion', sql.NVarChar, String(b.observacionPago || ''))
            .input('Recepcion', sql.Date, b.fechaRecepcion || new Date())
            .input('Concepto', sql.NVarChar, concepto)
            .input('Banco', sql.NVarChar, banco)
            .input('Cenco', sql.NVarChar, String(b.cenco || ''))
            .query(`
                INSERT INTO LIC_DETALLE_PAGO_ACTUAL (
                    NumeroLicencia, NumeroDocumento, FechaDepCtaCte, DiasPagados,
                    Desde, Hasta, Monto, Observacion, recepcion, concepto, Banco, cenco, Correlativo
                ) VALUES (
                    @NumeroLicencia, @NumeroDocumento, @FechaDep, @DiasPagados,
                    @Desde, @Hasta, @Monto, @Observacion, @Recepcion, @Concepto, @Banco, @Cenco,
                    NEXT VALUE FOR dbo.correlativo
                )
            `);

        // Actualizar saldo en DETALLE_CHEQUES si existe el cheque
        if (chRes.recordset.length > 0 && concepto !== 'Devolucion') {
            const sumRes = await new sql.Request(transaction)
                .input('Banco', sql.NVarChar, banco)
                .input('Num', sql.NVarChar, numeroDocumento)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as Suma
                    FROM LIC_DETALLE_PAGO_ACTUAL
                    WHERE RTRIM(Banco) = @Banco AND RTRIM(NumeroDocumento) = @Num
                `);
            const nuevoSaldo = Number(sumRes.recordset[0].Suma || 0);
            await new sql.Request(transaction)
                .input('Banco', sql.NVarChar, banco)
                .input('Num', sql.NVarChar, numeroDocumento)
                .input('Saldo', sql.Int, nuevoSaldo)
                .query(`
                    UPDATE DETALLE_CHEQUES
                    SET saldo = @Saldo
                    WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num
                `);
        }

        await transaction.commit();
        res.json({ status: 'ok', message: 'Pago ingresado correctamente' });
    } catch (err) {
        await transaction.rollback();
        console.error('Error ingresando pago:', err);
        res.status(500).json({ error: 'Error al registrar el pago en la base de datos' });
    }
});

// 14. Actualizar estado/observación de apelación desde pantalla de pagos (Button4_Click_1 en Frm_IngresoPago.vb)
router.put('/licencia-estado-pago', async (req, res) => {
    try {
        const pool = req.db;
        const b = req.body;
        const numeroLicencia = String(b.numeroLicencia || '').trim();
        if (!numeroLicencia) return res.status(400).json({ error: 'Número de licencia requerido' });

        await pool.request()
            .input('Num', sql.NVarChar, numeroLicencia)
            .input('ObserApelacion', sql.NVarChar, String(b.obserApelacion || ''))
            .input('ObservacionCajaLA', sql.VarChar, String(b.observacionCajaLA || ''))
            .input('Rechazo', sql.Bit, b.rechazo ? 1 : 0)
            .input('Retenida', sql.Bit, b.retenida ? 1 : 0)
            .input('Autorizada', sql.NChar, b.autorizada ? 'True' : 'False')
            .input('Pendiente', sql.Bit, b.pendiente ? 1 : 0)
            .input('DiasAutorizados', sql.Int, parseInt(b.diasAutorizados || 0, 10))
            .query(`
                UPDATE LIC_LICENCIA_ACTUAL
                SET Obser_apelacion = @ObserApelacion,
                    Observacion_CajaLA = @ObservacionCajaLA,
                    Rechazo = @Rechazo,
                    Retenida = @Retenida,
                    Autorizada = @Autorizada,
                    Pendiente = @Pendiente,
                    DiasAutorizados = @DiasAutorizados
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        res.json({ status: 'ok', message: 'Estado y observación de la licencia actualizados' });
    } catch (err) {
        console.error('Error actualizando estado desde pagos:', err);
        res.status(500).json({ error: 'Error actualizando observación de la licencia' });
    }
});

// 15. Modificar Concepto de un pago (Button3_Click en Frm_IngresoPago.vb)
router.put('/pago/concepto', async (req, res) => {
    try {
        const pool = req.db;
        const { correlativo, concepto } = req.body;
        if (!correlativo) return res.status(400).json({ error: 'Correlativo requerido' });

        await pool.request()
            .input('Correlativo', sql.BigInt, correlativo)
            .input('Concepto', sql.NVarChar, String(concepto || '').trim())
            .query(`UPDATE LIC_DETALLE_PAGO_ACTUAL SET concepto = @Concepto WHERE Correlativo = @Correlativo`);

        res.json({ status: 'ok', message: 'Concepto del pago actualizado' });
    } catch (err) {
        console.error('Error actualizando concepto pago:', err);
        res.status(500).json({ error: 'Error actualizando concepto del pago' });
    }
});

// 16. Eliminar un movimiento de pago individual (Button10_Click en Frm_IngresoPago.vb)
router.delete('/pago/:correlativo', async (req, res) => {
    const pool = req.db;
    const transaction = new sql.Transaction(pool);
    try {
        const correlativo = req.params.correlativo;
        await transaction.begin();

        const detRes = await new sql.Request(transaction)
            .input('Corr', sql.BigInt, correlativo)
            .query(`
                SELECT TOP 1
                    RTRIM(ISNULL(NumeroLicencia, '')) as NumeroLicencia,
                    RTRIM(ISNULL(NumeroDocumento, '')) as NumeroDocumento,
                    RTRIM(ISNULL(Banco, '')) as Banco,
                    ISNULL(Monto, 0) as Monto,
                    ISNULL(DiasPagados, 0) as DiasPagados
                FROM LIC_DETALLE_PAGO_ACTUAL
                WHERE Correlativo = @Corr
            `);

        if (detRes.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Movimiento de pago no encontrado' });
        }

        const mov = detRes.recordset[0];

        // Verificar si el cheque está cerrado
        const chRes = await new sql.Request(transaction)
            .input('Banco', sql.NVarChar, mov.Banco)
            .input('Num', sql.NVarChar, mov.NumeroDocumento)
            .query(`SELECT TOP 1 RTRIM(ISNULL(estado, '')) as Estado FROM DETALLE_CHEQUES WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num`);

        if (chRes.recordset.length > 0 && chRes.recordset[0].Estado === 'Cerrado') {
            await transaction.rollback();
            return res.status(400).json({ error: 'El cheque está cerrado, no puede eliminar un pago' });
        }

        // Restar de LIC_PAGO_ACTUAL
        await new sql.Request(transaction)
            .input('Num', sql.NVarChar, mov.NumeroLicencia)
            .input('Monto', sql.Decimal(18, 0), Number(mov.Monto || 0))
            .input('Dias', sql.Int, Number(mov.DiasPagados || 0))
            .query(`
                UPDATE LIC_PAGO_ACTUAL
                SET TotalPagado = CASE WHEN ISNULL(TotalPagado, 0) - @Monto < 0 THEN 0 ELSE ISNULL(TotalPagado, 0) - @Monto END,
                    NumDiasPagados = CASE WHEN ISNULL(NumDiasPagados, 0) - @Dias < 0 THEN 0 ELSE ISNULL(NumDiasPagados, 0) - @Dias END,
                    DiasCobrar = ISNULL(DiasCobrar, 0) + @Dias
                WHERE RTRIM(NumeroLicencia) = @Num
            `);

        // Eliminar el registro de LIC_DETALLE_PAGO_ACTUAL
        await new sql.Request(transaction)
            .input('Corr', sql.BigInt, correlativo)
            .query(`DELETE FROM LIC_DETALLE_PAGO_ACTUAL WHERE Correlativo = @Corr`);

        // Recalcular saldo en DETALLE_CHEQUES
        if (chRes.recordset.length > 0) {
            const sumRes = await new sql.Request(transaction)
                .input('Banco', sql.NVarChar, mov.Banco)
                .input('Num', sql.NVarChar, mov.NumeroDocumento)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as Suma
                    FROM LIC_DETALLE_PAGO_ACTUAL
                    WHERE RTRIM(Banco) = @Banco AND RTRIM(NumeroDocumento) = @Num
                `);
            const nuevoSaldo = Number(sumRes.recordset[0].Suma || 0);
            await new sql.Request(transaction)
                .input('Banco', sql.NVarChar, mov.Banco)
                .input('Num', sql.NVarChar, mov.NumeroDocumento)
                .input('Saldo', sql.Int, nuevoSaldo)
                .query(`UPDATE DETALLE_CHEQUES SET saldo = @Saldo WHERE RTRIM(banco) = @Banco AND RTRIM(num) = @Num`);
        }

        await transaction.commit();
        res.json({ status: 'ok', message: 'Pago eliminado correctamente' });
    } catch (err) {
        await transaction.rollback();
        console.error('Error eliminando pago:', err);
        res.status(500).json({ error: 'Error al eliminar el pago' });
    }
});

module.exports = router;
