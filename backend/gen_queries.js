const buildInsert = (isNewExistente = false) => `
                const reqDb = new sql.Request(transaction);
                reqDb.input('NumeroLicencia', sql.NVarChar, ${isNewExistente ? 'newNumero' : 'item.NumeroLicencia'});
                reqDb.input('RutFuncionario', sql.NVarChar, item.RutFuncionario || null);
                reqDb.input('Desde', sql.Date, item.Desde || null);
                reqDb.input('Hasta', sql.Date, item.Hasta || null);
                reqDb.input('NumDias', sql.Int, item.NumDias || 0);
                
                reqDb.input('Recepcion', sql.Date, item.Recepcion || null);
                reqDb.input('Remision', sql.Date, item.Recepcion || null); // Same as Recepcion
                reqDb.input('Tipo_enferm', sql.NVarChar, item.Tipo_enferm || '');
                reqDb.input('Obser_apelacion', sql.NVarChar, item.Obser_apelacion || '');
                reqDb.input('altaAchs', sql.NVarChar, item.altaAchs || 'NI');
                
                reqDb.input('Usuario', sql.NVarChar, (userName || 'Sistema') + ' LMW');

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
                        @Usuario, SYSDATETIME(), '', '', 0, '',
                        '', 0, NULL
                    )
                \`);
`;

console.log(buildInsert(false));
console.log("===============================");
console.log(buildInsert(true));
