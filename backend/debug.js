const sql = require('mssql');
require('dotenv').config();

async function run() {
    const pool = await sql.connect({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    });

    console.log("Checking full query with corrected WHERE...");
    const fullCount = await pool.request().query(`
        SELECT COUNT(*) as cnt FROM (
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
                L.Apelacion, L.Tipo_enferm, L.MontoDesc, L.regularizado, L.PagoEstimado, L.Descuento, 
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
                END AS ALTA_ACHS
            FROM LIC_LICENCIA_ACTUAL L
            LEFT JOIN LIC_HISTORICO_PREVISION_ACTUAL HPA 
                ON HPA.Rut = L.RutFuncionario 
                AND HPA.Anio = YEAR(L.Desde) 
                AND HPA.Mes = MONTH(L.Desde)
            LEFT JOIN LIC_FUNCIONARIO F ON L.RutFuncionario = F.Rut
            LEFT JOIN LIC_SALUD S ON HPA.CodSalud = S.CodSalud
            LEFT JOIN LIC_PREVISION P ON HPA.CodPrevision = P.CodPrevision
            WHERE RTRIM(L.PagoDirecto) NOT IN ('Nula', 'Pago Directo')
            AND L.NumeroLicencia NOT IN (SELECT b.NumeroLicencia FROM LIC_DETALLE_PAGO_ACTUAL b)
            GROUP BY 
                F.Rut, F.DV, F.Nombre, F.Paterno, F.Materno, F.CodUnidad, 
                L.PagoDirecto, L.Desde, L.Hasta, L.NumeroLicencia, L.Maternal, L.Parcial, 
                L.Rechazo, L.Observacion, L.Estado, L.Autorizada, L.Obser_apelacion, L.Compin, 
                L.Apelacion, L.Tipo_enferm, L.MontoDesc, L.PagoEstimado, L.regularizado, 
                L.Descuento, L.TipoLic, L.NumDias, F.vigencia, L.Retenida, 
                L.Pendiente, L.Observacion_CajaLA, L.altaAchs
        ) T
    `);
    console.log("Full count:", fullCount.recordset[0].cnt);
    process.exit(0);
}
run();
