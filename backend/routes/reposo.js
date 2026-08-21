const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const sql = require('mssql');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// Helper para limpiar numero de licencia (quitar ceros a la izquierda)
const formatLicencia = (num) => {
    if (!num) return '';
    return String(num).replace(/^0+/, '').trim();
};

// Helper para convertir fecha Excel o String a YYYY-MM-DD
const parseDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') {
        // Excel serial date
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    if (typeof val === 'string') {
        const parts = val.split(/[-/]/);
        if (parts.length === 3) {
            // DD/MM/YYYY to YYYY-MM-DD
            if (parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            // YYYY-MM-DD
            if (parts[0].length === 4) return val;
        }
    }
    return null;
};

const mapTipoAlta = (tipo) => {
    if (!tipo) return 'NI';
    const t = tipo.trim().toLowerCase();
    if (t === 'alta diferida') return 'ADF';
    if (t === 'alta en el día') return 'ADI';
    if (t === 'término reposo por inasistencia') return 'TIN';
    if (t === 'término reposo administrativo') return 'TAD';
    if (t === 'alta inmediata') return 'ADI';
    if (t === '-') return 'NI';
    return 'NI';
};

router.post('/preview', upload.fields([{ name: 'fileSiniestros', maxCount: 1 }, { name: 'fileAccidentabilidad', maxCount: 1 }]), async (req, res) => {
    try {
        if (!req.files || !req.files['fileSiniestros'] || !req.files['fileAccidentabilidad']) {
            return res.status(400).json({ error: 'Debes subir ambos archivos (Siniestros y Accidentabilidad).' });
        }

        const pool = req.db;
        
        // 0. Check if already processed
        const combinedFileName = `${req.files['fileSiniestros'][0].originalname} | ${req.files['fileAccidentabilidad'][0].originalname}`;
        const reqCheck = await pool.request()
            .input('FileName', sql.NVarChar, combinedFileName)
            .query(`SELECT TOP 1 Id FROM LIC_BITACORA_ARCHIVOS WHERE NombreArchivo = @FileName`);
            
        if (reqCheck.recordset.length > 0) {
            return res.status(400).json({ error: `Estos archivos ya fueron procesados previamente. Revisa la Bitácora de Cargas.` });
        }

        // Leer Accidentabilidad
        const wbAcc = xlsx.read(req.files['fileAccidentabilidad'][0].buffer, { type: 'buffer' });
        const rowsAcc = xlsx.utils.sheet_to_json(wbAcc.Sheets[wbAcc.SheetNames[0]]);
        const accMap = {};
        for (const row of rowsAcc) {
            let siniestro = row['SINIESTRO'];
            if (siniestro) {
                siniestro = formatLicencia(siniestro);
                accMap[siniestro] = row;
            }
        }

        // Leer Siniestros
        const wbSin = xlsx.read(req.files['fileSiniestros'][0].buffer, { type: 'buffer' });
        const rowsSin = xlsx.utils.sheet_to_json(wbSin.Sheets[wbSin.SheetNames[0]]);

        if (rowsSin.length === 0) return res.status(400).json({ error: 'El archivo de siniestros está vacío' });

        const extractedData = [];
        const licenciasToCheck = [];

        for (const row of rowsSin) {
            let numero = row['ID del siniestro'];
            if (!numero) continue;
            numero = formatLicencia(numero);

            let rut = row['Rut usuario'];
            let nombre = row['Nombre de usuario'];
            let desde = parseDate(row['Fecha de inicio del reposo']);
            let hasta = parseDate(row['Fecha de alta']);
            let dias = row['Días de reposo'];
            let recepcion = parseDate(row['Fecha de presentación']);
            let tipoEnferm = row['Tipo de siniestro'];

            if (!hasta && desde && dias) {
                const d = new Date(desde);
                d.setDate(d.getDate() + parseInt(dias, 10) - 1);
                hasta = d.toISOString().split('T')[0];
            }

            // Cruzar con Accidentabilidad
            const accRow = accMap[numero] || {};
            const obserApelacion = ((accRow['MOTIVO DE ASISTENCIA'] || '') + ' ' + (accRow['OBSERVACIONES'] || '')).trim();
            const altaAchs = mapTipoAlta(accRow['TIPO DE ALTA']);
            const tipoSiniestroAcc = accRow['TIPO SINIESTRO'] || '';

            extractedData.push({
                NumeroLicencia: numero,
                Tipo_Siniestro: tipoSiniestroAcc,
                RutFuncionario: rut,
                Nombre: nombre,
                Desde: desde,
                Hasta: hasta,
                NumDias: dias || 0,
                Recepcion: recepcion,
                Tipo_enferm: tipoEnferm,
                Obser_apelacion: obserApelacion,
                altaAchs: altaAchs
            });
            licenciasToCheck.push(`'${numero}'`);
        }

        if (licenciasToCheck.length === 0) return res.json({ nuevos: [], modificados: [], ignorados: [] });

        // Consultar base de datos para todas estas licencias
        // Solo necesitamos el registro más reciente para cada número base (el que tiene el mayor sufijo)
        // Para simplificar el preview, traemos todas las versiones que coinciden con los números base.
        const query = `
            SELECT NumeroLicencia, Desde, Hasta, NumDias 
            FROM LIC_LICENCIA_ACTUAL 
            WHERE NumeroLicencia IN (${licenciasToCheck.join(',')})
               OR NumeroLicencia LIKE ANY (SELECT val + '-%' FROM (VALUES (${licenciasToCheck.join('),(')})) AS X(val))
        `;
        
        // El LIKE ANY no es válido en SQL Server, usaremos un enfoque más simple:
        // Traemos las coincidencias exactas primero para comparar. Si la licencia base existe, revisamos modificaciones.
        // Si hay sufijos, es más complejo en un solo query IN. Mejor cruzamos exactos y luego en el procesar resolvemos el sufijo final.
        
        const dbResult = await pool.request().query(`
            SELECT NumeroLicencia, CONVERT(varchar, Desde, 23) as Desde, CONVERT(varchar, Hasta, 23) as Hasta, NumDias 
            FROM LIC_LICENCIA_ACTUAL 
            WHERE NumeroLicencia IN (${licenciasToCheck.join(',')})
        `);
        
        const dbMap = {};
        dbResult.recordset.forEach(r => {
            dbMap[r.NumeroLicencia] = r;
        });

        const nuevos = [];
        const nuevos_existentes = [];
        const actualizados = [];
        const ignorados = [];

        // Deduplicar excel en caso de que vengan repetidas en el mismo excel
        const seen = new Set();

        extractedData.forEach(row => {
            if (seen.has(row.NumeroLicencia)) return;
            seen.add(row.NumeroLicencia);

            const dbRow = dbMap[row.NumeroLicencia];
            if (!dbRow) {
                nuevos.push(row);
            } else {
                // Comparar
                let changedDesde = false;
                let changedHasta = false;
                if (row.Desde && dbRow.Desde !== row.Desde) changedDesde = true;
                if (row.Hasta && dbRow.Hasta !== row.Hasta) changedHasta = true;
                
                if (changedDesde) {
                    nuevos_existentes.push({
                        ...row,
                        DbDesde: dbRow.Desde,
                        DbHasta: dbRow.Hasta
                    });
                } else if (changedHasta) {
                    actualizados.push({
                        ...row,
                        DbDesde: dbRow.Desde,
                        DbHasta: dbRow.Hasta
                    });
                } else {
                    ignorados.push(row);
                }
            }
        });

        res.json({ status: 'ok', data: { nuevos, nuevos_existentes, actualizados, ignorados } });

    } catch (err) {
        console.error("Error preview reposo:", err);
        res.status(500).json({ error: 'Error procesando archivo' });
    }
});

router.post('/procesar', async (req, res) => {
    const { nuevos, nuevos_existentes, actualizados, fileName, userName } = req.body;
    const pool = req.db;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // 1. Crear registro en Bitácora primero para obtener el ID
        const finalUserName = (userName || 'Sistema') + ' LMW';
        const reqLog = new sql.Request(transaction);
        reqLog.input('NombreArchivo', sql.NVarChar, fileName || '');
        reqLog.input('Total', sql.Int, nuevos.length + nuevos_existentes.length + actualizados.length);
        reqLog.input('Nuevos', sql.Int, nuevos.length);
        reqLog.input('Act', sql.Int, actualizados.length);
        reqLog.input('NuevosExt', sql.Int, nuevos_existentes.length);
        reqLog.input('User', sql.NVarChar, finalUserName);
        const bitacoraRes = await reqLog.query(`
            INSERT INTO LIC_BITACORA_ARCHIVOS (NombreArchivo, TotalRegistros, RegistrosNuevos, RegistrosActualizados, RegistrosNuevosReposos, Usuario, FechaProceso)
            OUTPUT inserted.Id
            VALUES (@NombreArchivo, @Total, @Nuevos, @Act, @NuevosExt, @User, GETDATE())
        `);
        const idBitacora = bitacoraRes.recordset[0].Id;

        let countNuevos = 0;
        let countNuevosExistentes = 0;
        let countActualizados = 0;

        for (const item of nuevos) {
            try {
                const reqDb = new sql.Request(transaction);
                reqDb.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                reqDb.input('RutFuncionario', sql.NVarChar, item.RutFuncionario || null);
                reqDb.input('Desde', sql.Date, item.Desde || null);
                reqDb.input('Hasta', sql.Date, item.Hasta || null);
                reqDb.input('NumDias', sql.Int, item.NumDias || 0);
                
                reqDb.input('Recepcion', sql.Date, item.Recepcion || null);
                reqDb.input('Remision', sql.Date, item.Recepcion || null);
                reqDb.input('Tipo_enferm', sql.NVarChar, item.Tipo_enferm || '');
                reqDb.input('Tipo_Siniestro', sql.NVarChar, item.Tipo_Siniestro || '');
                reqDb.input('Obser_apelacion', sql.NVarChar, item.Obser_apelacion || '');
                reqDb.input('altaAchs', sql.NVarChar, item.altaAchs || 'NI');
                
                reqDb.input('Usuario', sql.NVarChar, finalUserName);

                await reqDb.query(`
                    INSERT INTO LIC_LICENCIA_ACTUAL (
                        NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias,
                        Recepcion, Remision, Tipo_enferm, Tipo_Siniestro, Obser_apelacion, altaAchs,
                        DiasAutorizados, CodDiagnostico, DetalleDiagnostico, Maternal, Rechazo, Parcial,
                        Observacion, MontoNetoPromedio, SubsidioDiario, PagoEstimado, RutMedico, nombreMedico,
                        regularizado, dv, PagoDirecto, Cod_Salud, Descuento, MontoDesc, Estado,
                        Apelacion, Suseso, Compin, Autorizada, Direccion, telefono, TipoLic,
                        Usuario, FechaHora, fafiliacion, observ_mutual, Retenida, JornadaParcial,
                        Observacion_CajaLA, Pendiente, PagoEstimadoOld
                    ) VALUES (
                        @NumeroLicencia, @RutFuncionario, @Desde, @Hasta, @NumDias,
                        @Recepcion, @Remision, @Tipo_enferm, @Tipo_Siniestro, @Obser_apelacion, @altaAchs,
                        NULL, NULL, '', 0, 0, 0,
                        'ACHS OR', NULL, NULL, NULL, '', '',
                        0, '', 'ACHS OR', '', 0, NULL, '',
                        'false', 'false', 'false', 'false', '', '', 'Oden Reposo',
                        @Usuario, CONVERT(varchar, GETDATE(), 20), '', '', 0, '',
                        '', 0, NULL
                    )
                `);
                
                const reqPago = new sql.Request(transaction);
                reqPago.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                await reqPago.query(`
                    INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                    VALUES (@NumeroLicencia, @NumDiasLicencia)
                `);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'INSERT');
                reqRb.input('Num', sql.NVarChar, item.NumeroLicencia);
                await reqRb.query(`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia) VALUES (@IdB, @Acc, @Num)`);

                countNuevos++;
            } catch (err) {
                console.error("Error inserting nuevo:", err.message);
                throw err;
            }
        }

        for (const item of nuevos_existentes) {
            try {
                const reqSuffix = new sql.Request(transaction);
                reqSuffix.input('BaseNum', sql.NVarChar, item.NumeroLicencia);
                reqSuffix.input('LikeNum', sql.NVarChar, `${item.NumeroLicencia}-%`);
                const suffRes = await reqSuffix.query(`
                    SELECT NumeroLicencia FROM LIC_LICENCIA_ACTUAL 
                    WHERE NumeroLicencia = @BaseNum OR NumeroLicencia LIKE @LikeNum
                `);
                
                let maxSuffix = 0;
                suffRes.recordset.forEach(r => {
                    if (r.NumeroLicencia.includes('-')) {
                        const parts = r.NumeroLicencia.split('-');
                        const num = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                    }
                });

                const newNumero = `${item.NumeroLicencia}-${maxSuffix + 1}`;

                const reqDb = new sql.Request(transaction);
                reqDb.input('NumeroLicencia', sql.NVarChar, newNumero);
                reqDb.input('RutFuncionario', sql.NVarChar, item.RutFuncionario || null);
                reqDb.input('Desde', sql.Date, item.Desde || null);
                reqDb.input('Hasta', sql.Date, item.Hasta || null);
                reqDb.input('NumDias', sql.Int, item.NumDias || 0);
                
                reqDb.input('Recepcion', sql.Date, item.Recepcion || null);
                reqDb.input('Remision', sql.Date, item.Recepcion || null);
                reqDb.input('Tipo_enferm', sql.NVarChar, item.Tipo_enferm || '');
                reqDb.input('Tipo_Siniestro', sql.NVarChar, item.Tipo_Siniestro || '');
                reqDb.input('Obser_apelacion', sql.NVarChar, item.Obser_apelacion || '');
                reqDb.input('altaAchs', sql.NVarChar, item.altaAchs || 'NI');
                
                reqDb.input('Usuario', sql.NVarChar, finalUserName);

                await reqDb.query(`
                    INSERT INTO LIC_LICENCIA_ACTUAL (
                        NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias,
                        Recepcion, Remision, Tipo_enferm, Tipo_Siniestro, Obser_apelacion, altaAchs,
                        DiasAutorizados, CodDiagnostico, DetalleDiagnostico, Maternal, Rechazo, Parcial,
                        Observacion, MontoNetoPromedio, SubsidioDiario, PagoEstimado, RutMedico, nombreMedico,
                        regularizado, dv, PagoDirecto, Cod_Salud, Descuento, MontoDesc, Estado,
                        Apelacion, Suseso, Compin, Autorizada, Direccion, telefono, TipoLic,
                        Usuario, FechaHora, fafiliacion, observ_mutual, Retenida, JornadaParcial,
                        Observacion_CajaLA, Pendiente, PagoEstimadoOld
                    ) VALUES (
                        @NumeroLicencia, @RutFuncionario, @Desde, @Hasta, @NumDias,
                        @Recepcion, @Remision, @Tipo_enferm, @Tipo_Siniestro, @Obser_apelacion, @altaAchs,
                        NULL, NULL, '', 0, 0, 0,
                        'ACHS OR', NULL, NULL, NULL, '', '',
                        0, '', 'ACHS OR', '', 0, NULL, '',
                        'false', 'false', 'false', 'false', '', '', 'Oden Reposo',
                        @Usuario, CONVERT(varchar, GETDATE(), 20), '', '', 0, '',
                        '', 0, NULL
                    )
                `);

                const reqPago = new sql.Request(transaction);
                reqPago.input('NumeroLicencia', sql.NVarChar, newNumero);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                await reqPago.query(`
                    INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                    VALUES (@NumeroLicencia, @NumDiasLicencia)
                `);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'INSERT');
                reqRb.input('Num', sql.NVarChar, newNumero);
                await reqRb.query(`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia) VALUES (@IdB, @Acc, @Num)`);

                countNuevosExistentes++;
            } catch (err) {
                console.error("Error inserting nuevo_existente:", err.message);
                throw err;
            }
        }

        for (const item of actualizados) {
            try {
                // Get previous values for rollback
                const reqPrev = new sql.Request(transaction);
                reqPrev.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                const prevRes = await reqPrev.query(`SELECT Hasta, NumDias FROM LIC_LICENCIA_ACTUAL WHERE NumeroLicencia = @NumeroLicencia`);
                
                let prevHasta = null;
                let prevNumDias = null;
                if (prevRes.recordset.length > 0) {
                    prevHasta = prevRes.recordset[0].Hasta;
                    prevNumDias = prevRes.recordset[0].NumDias;
                }

                const reqDb = new sql.Request(transaction);
                reqDb.input('Hasta', sql.Date, item.Hasta || null);
                reqDb.input('NumDias', sql.Int, item.NumDias || 0);
                reqDb.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                await reqDb.query(`
                    UPDATE LIC_LICENCIA_ACTUAL 
                    SET Hasta = @Hasta, NumDias = @NumDias 
                    WHERE NumeroLicencia = @NumeroLicencia
                `);
                const reqPago = new sql.Request(transaction);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                reqPago.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                await reqPago.query(`
                    UPDATE LIC_PAGO_ACTUAL 
                    SET NumDiasLicencia = @NumDiasLicencia 
                    WHERE NumeroLicencia = @NumeroLicencia
                `);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'UPDATE');
                reqRb.input('Num', sql.NVarChar, item.NumeroLicencia);
                reqRb.input('PrevHasta', sql.Date, prevHasta);
                reqRb.input('PrevNum', sql.Int, prevNumDias);
                await reqRb.query(`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia, ValorAnterior_Hasta, ValorAnterior_NumDias) VALUES (@IdB, @Acc, @Num, @PrevHasta, @PrevNum)`);

                countActualizados++;
            } catch (err) {
                console.error("Error updating actualizado:", err.message);
                throw err;
            }
        }

        await transaction.commit();
        res.json({ status: 'ok', message: 'Procesado correctamente', nuevos: countNuevos, nuevos_existentes: countNuevosExistentes, actualizados: countActualizados });

    } catch (err) {
        await transaction.rollback();
        console.error("Error procesando reposo:", err);
        res.status(500).json({ error: 'Error guardando en base de datos' });
    }
});


router.get('/auditoria', async (req, res) => {
    try {
        const pool = req.db;
        const result = await pool.request().query(`
            SELECT Id, NombreArchivo, CONVERT(varchar, FechaProceso, 120) as FechaProceso, TotalRegistros, RegistrosNuevos, RegistrosActualizados, ISNULL(RegistrosNuevosReposos, 0) as RegistrosNuevosReposos, Usuario 
            FROM LIC_BITACORA_ARCHIVOS 
            ORDER BY FechaProceso DESC
        `);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error fetching auditoria:", err);
        res.status(500).json({ error: 'Error fetching bitacora' });
    }
});

router.post('/rollback/:id', async (req, res) => {
    const { id } = req.params;
    const pool = req.db;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const reqLogs = new sql.Request(transaction);
        reqLogs.input('IdB', sql.Int, id);
        const logsRes = await reqLogs.query(`
            SELECT 
                SUM(CASE WHEN Accion = 'INSERT' THEN 1 ELSE 0 END) as deletedCount,
                SUM(CASE WHEN Accion = 'UPDATE' THEN 1 ELSE 0 END) as revertedCount
            FROM LIC_ROLLBACK_LOG WHERE IdBitacora = @IdB
        `);
        
        const deleted = logsRes.recordset[0].deletedCount || 0;
        const reverted = logsRes.recordset[0].revertedCount || 0;

        if (deleted === 0 && reverted === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'No hay logs de rollback para esta carga.' });
        }

        if (deleted > 0) {
            const reqDel1 = new sql.Request(transaction);
            reqDel1.input('IdB', sql.Int, id);
            await reqDel1.query(`
                DELETE FROM LIC_PAGO_ACTUAL 
                WHERE NumeroLicencia IN (SELECT NumeroLicencia FROM LIC_ROLLBACK_LOG WHERE IdBitacora = @IdB AND Accion = 'INSERT')
            `);

            const reqDel2 = new sql.Request(transaction);
            reqDel2.input('IdB', sql.Int, id);
            await reqDel2.query(`
                DELETE FROM LIC_LICENCIA_ACTUAL 
                WHERE NumeroLicencia IN (SELECT NumeroLicencia FROM LIC_ROLLBACK_LOG WHERE IdBitacora = @IdB AND Accion = 'INSERT')
            `);
        }

        if (reverted > 0) {
            const reqUpd1 = new sql.Request(transaction);
            reqUpd1.input('IdB', sql.Int, id);
            await reqUpd1.query(`
                UPDATE L
                SET L.Hasta = R.ValorAnterior_Hasta,
                    L.NumDias = R.ValorAnterior_NumDias
                FROM LIC_LICENCIA_ACTUAL L
                INNER JOIN LIC_ROLLBACK_LOG R ON L.NumeroLicencia = R.NumeroLicencia
                WHERE R.IdBitacora = @IdB AND R.Accion = 'UPDATE'
            `);

            const reqUpd2 = new sql.Request(transaction);
            reqUpd2.input('IdB', sql.Int, id);
            await reqUpd2.query(`
                UPDATE P
                SET P.NumDiasLicencia = R.ValorAnterior_NumDias
                FROM LIC_PAGO_ACTUAL P
                INNER JOIN LIC_ROLLBACK_LOG R ON P.NumeroLicencia = R.NumeroLicencia
                WHERE R.IdBitacora = @IdB AND R.Accion = 'UPDATE'
            `);
        }

        // Marcar la bitácora como revertida modificando el nombre de archivo
        const reqBit = new sql.Request(transaction);
        reqBit.input('IdB', sql.Int, id);
        await reqBit.query(`UPDATE LIC_BITACORA_ARCHIVOS SET NombreArchivo = NombreArchivo + ' (REVERTIDO)' WHERE Id = @IdB`);

        // Eliminar los logs
        const reqDelLog = new sql.Request(transaction);
        reqDelLog.input('IdB', sql.Int, id);
        await reqDelLog.query(`DELETE FROM LIC_ROLLBACK_LOG WHERE IdBitacora = @IdB`);

        await transaction.commit();
        res.json({ status: 'ok', message: `Rollback exitoso. Eliminados: ${deleted}, Revertidos: ${reverted}.` });

    } catch (err) {
        await transaction.rollback();
        console.error("Error en rollback:", err);
        res.status(500).json({ error: 'Error al intentar deshacer la carga.' });
    }
});

module.exports = router;
