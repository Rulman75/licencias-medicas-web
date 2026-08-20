const fs = require('fs');

const file = 'routes/reposo.js';
let content = fs.readFileSync(file, 'utf8');

const newProcesar = `router.post('/procesar', async (req, res) => {
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
        const bitacoraRes = await reqLog.query(\`
            INSERT INTO LIC_BITACORA_ARCHIVOS (NombreArchivo, TotalRegistros, RegistrosNuevos, RegistrosActualizados, RegistrosNuevosReposos, Usuario, FechaProceso)
            OUTPUT inserted.Id
            VALUES (@NombreArchivo, @Total, @Nuevos, @Act, @NuevosExt, @User, GETDATE())
        \`);
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
                reqDb.input('Obser_apelacion', sql.NVarChar, item.Obser_apelacion || '');
                reqDb.input('altaAchs', sql.NVarChar, item.altaAchs || 'NI');
                
                reqDb.input('Usuario', sql.NVarChar, finalUserName);

                await reqDb.query(\`
                    INSERT INTO LIC_LICENCIA_ACTUAL (
                        NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias,
                        Recepcion, Remision, Tipo_enferm, Obser_apelacion, altaAchs,
                        DiasAutorizados, CodDiagnostico, DetalleDiagnostico, Maternal, Rechazo, Parcial,
                        Observacion, MontoNetoPromedio, SubsidioDiario, PagoEstimado, RutMedico, nombreMedico,
                        regularizado, dv, PagoDirecto, Cod_Salud, Descuento, MontoDesc, Estado,
                        Apelacion, Suseso, Compin, Autorizada, Direccion, telefono, TipoLic,
                        Usuario, FechaHora, fafiliacion, observ_mutual, Retenida, JornadaParcial,
                        Observacion_CajaLA, Pendiente, PagoEstimadoOld
                    ) VALUES (
                        @NumeroLicencia, @RutFuncionario, @Desde, @Hasta, @NumDias,
                        @Recepcion, @Remision, @Tipo_enferm, @Obser_apelacion, @altaAchs,
                        NULL, NULL, '', 0, 0, 0,
                        'ACHS OR', NULL, NULL, NULL, '', '',
                        0, '', 'ACHS OR', '', 0, NULL, '',
                        'false', 'false', 'false', 'false', '', '', 'Oden Reposo',
                        @Usuario, CONVERT(varchar, GETDATE(), 20), '', '', 0, '',
                        '', 0, NULL
                    )
                \`);
                
                const reqPago = new sql.Request(transaction);
                reqPago.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                await reqPago.query(\`
                    INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                    VALUES (@NumeroLicencia, @NumDiasLicencia)
                \`);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'INSERT');
                reqRb.input('Num', sql.NVarChar, item.NumeroLicencia);
                await reqRb.query(\`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia) VALUES (@IdB, @Acc, @Num)\`);

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
                reqSuffix.input('LikeNum', sql.NVarChar, \`\${item.NumeroLicencia}-%\`);
                const suffRes = await reqSuffix.query(\`
                    SELECT NumeroLicencia FROM LIC_LICENCIA_ACTUAL 
                    WHERE NumeroLicencia = @BaseNum OR NumeroLicencia LIKE @LikeNum
                \`);
                
                let maxSuffix = 0;
                suffRes.recordset.forEach(r => {
                    if (r.NumeroLicencia.includes('-')) {
                        const parts = r.NumeroLicencia.split('-');
                        const num = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
                    }
                });

                const newNumero = \`\${item.NumeroLicencia}-\${maxSuffix + 1}\`;

                const reqDb = new sql.Request(transaction);
                reqDb.input('NumeroLicencia', sql.NVarChar, newNumero);
                reqDb.input('RutFuncionario', sql.NVarChar, item.RutFuncionario || null);
                reqDb.input('Desde', sql.Date, item.Desde || null);
                reqDb.input('Hasta', sql.Date, item.Hasta || null);
                reqDb.input('NumDias', sql.Int, item.NumDias || 0);
                
                reqDb.input('Recepcion', sql.Date, item.Recepcion || null);
                reqDb.input('Remision', sql.Date, item.Recepcion || null);
                reqDb.input('Tipo_enferm', sql.NVarChar, item.Tipo_enferm || '');
                reqDb.input('Obser_apelacion', sql.NVarChar, item.Obser_apelacion || '');
                reqDb.input('altaAchs', sql.NVarChar, item.altaAchs || 'NI');
                
                reqDb.input('Usuario', sql.NVarChar, finalUserName);

                await reqDb.query(\`
                    INSERT INTO LIC_LICENCIA_ACTUAL (
                        NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias,
                        Recepcion, Remision, Tipo_enferm, Obser_apelacion, altaAchs,
                        DiasAutorizados, CodDiagnostico, DetalleDiagnostico, Maternal, Rechazo, Parcial,
                        Observacion, MontoNetoPromedio, SubsidioDiario, PagoEstimado, RutMedico, nombreMedico,
                        regularizado, dv, PagoDirecto, Cod_Salud, Descuento, MontoDesc, Estado,
                        Apelacion, Suseso, Compin, Autorizada, Direccion, telefono, TipoLic,
                        Usuario, FechaHora, fafiliacion, observ_mutual, Retenida, JornadaParcial,
                        Observacion_CajaLA, Pendiente, PagoEstimadoOld
                    ) VALUES (
                        @NumeroLicencia, @RutFuncionario, @Desde, @Hasta, @NumDias,
                        @Recepcion, @Remision, @Tipo_enferm, @Obser_apelacion, @altaAchs,
                        NULL, NULL, '', 0, 0, 0,
                        'ACHS OR', NULL, NULL, NULL, '', '',
                        0, '', 'ACHS OR', '', 0, NULL, '',
                        'false', 'false', 'false', 'false', '', '', 'Oden Reposo',
                        @Usuario, CONVERT(varchar, GETDATE(), 20), '', '', 0, '',
                        '', 0, NULL
                    )
                \`);

                const reqPago = new sql.Request(transaction);
                reqPago.input('NumeroLicencia', sql.NVarChar, newNumero);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                await reqPago.query(\`
                    INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                    VALUES (@NumeroLicencia, @NumDiasLicencia)
                \`);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'INSERT');
                reqRb.input('Num', sql.NVarChar, newNumero);
                await reqRb.query(\`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia) VALUES (@IdB, @Acc, @Num)\`);

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
                const prevRes = await reqPrev.query(\`SELECT Hasta, NumDias FROM LIC_LICENCIA_ACTUAL WHERE NumeroLicencia = @NumeroLicencia\`);
                
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
                await reqDb.query(\`
                    UPDATE LIC_LICENCIA_ACTUAL 
                    SET Hasta = @Hasta, NumDias = @NumDias 
                    WHERE NumeroLicencia = @NumeroLicencia
                \`);
                const reqPago = new sql.Request(transaction);
                reqPago.input('NumDiasLicencia', sql.Int, item.NumDias || 0);
                reqPago.input('NumeroLicencia', sql.NVarChar, item.NumeroLicencia);
                await reqPago.query(\`
                    UPDATE LIC_PAGO_ACTUAL 
                    SET NumDiasLicencia = @NumDiasLicencia 
                    WHERE NumeroLicencia = @NumeroLicencia
                \`);

                // Insert into Rollback Log
                const reqRb = new sql.Request(transaction);
                reqRb.input('IdB', sql.Int, idBitacora);
                reqRb.input('Acc', sql.NVarChar, 'UPDATE');
                reqRb.input('Num', sql.NVarChar, item.NumeroLicencia);
                reqRb.input('PrevHasta', sql.Date, prevHasta);
                reqRb.input('PrevNum', sql.Int, prevNumDias);
                await reqRb.query(\`INSERT INTO LIC_ROLLBACK_LOG (IdBitacora, Accion, NumeroLicencia, ValorAnterior_Hasta, ValorAnterior_NumDias) VALUES (@IdB, @Acc, @Num, @PrevHasta, @PrevNum)\`);

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
});`;

// Regex to replace from router.post('/procesar'... up to the end of the block
const startIdx = content.indexOf("router.post('/procesar'");
const endStr = "});\n\nrouter.get('/auditoria'";
const endIdx = content.indexOf(endStr);
if (startIdx !== -1 && endIdx !== -1) {
    const newContent = content.substring(0, startIdx) + newProcesar + "\n\n" + content.substring(endIdx + 4);
    fs.writeFileSync(file, newContent, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Could not find start or end index.");
}
