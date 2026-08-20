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

router.post('/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (rows.length === 0) return res.status(400).json({ error: 'Empty file' });

        // Identificar formato
        const firstRow = rows[0];
        const isSiniestrosFormat = firstRow['ID del siniestro'] !== undefined;
        const isAccidentabilidadFormat = firstRow['N° Siniestro'] !== undefined;

        if (!isSiniestrosFormat && !isAccidentabilidadFormat) {
            return res.status(400).json({ error: 'Formato de Excel no reconocido. Debe contener "ID del siniestro" o "N° Siniestro".' });
        }

        const pool = req.db; // Passed via middleware in server.js
        const extractedData = [];
        const licenciasToCheck = [];

        for (const row of rows) {
            let numero = isSiniestrosFormat ? row['ID del siniestro'] : row['N° Siniestro'];
            let rut = isSiniestrosFormat ? row['Rut usuario'] : row['Rut Trabajador'];
            let nombre = isSiniestrosFormat ? row['Nombre de usuario'] : row['Nombres y Apellidos'];
            let desde = parseDate(isSiniestrosFormat ? row['Fecha de inicio del reposo'] : row['Fecha Inicio Reposo']);
            let hasta = parseDate(isSiniestrosFormat ? row['Fecha de alta'] : row['Fecha Término Reposo']);
            let dias = isSiniestrosFormat ? row['Días de reposo'] : row['Días Perdidos'];

            if (!numero) continue;
            
            numero = formatLicencia(numero);
            if (!hasta && desde && dias) {
                // Calcular 'hasta' si viene vacío en formato Siniestros
                const d = new Date(desde);
                d.setDate(d.getDate() + parseInt(dias, 10) - 1);
                hasta = d.toISOString().split('T')[0];
            }

            extractedData.push({
                NumeroLicencia: numero,
                RutFuncionario: rut,
                Nombre: nombre,
                Desde: desde,
                Hasta: hasta,
                NumDias: dias || 0
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
        const modificados = [];
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
                let changed = false;
                if (row.Desde && dbRow.Desde !== row.Desde) changed = true;
                if (row.Hasta && dbRow.Hasta !== row.Hasta) changed = true;
                
                if (changed) {
                    modificados.push({
                        ...row,
                        DbDesde: dbRow.Desde,
                        DbHasta: dbRow.Hasta
                    });
                } else {
                    ignorados.push(row);
                }
            }
        });

        res.json({ status: 'ok', data: { nuevos, modificados, ignorados } });

    } catch (err) {
        console.error("Error preview reposo:", err);
        res.status(500).json({ error: 'Error procesando archivo' });
    }
});

router.post('/procesar', async (req, res) => {
    const { nuevos, modificados, fileName, userName } = req.body;
    const pool = req.db;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let countNuevos = 0;
        let countModificados = 0;

        for (const item of nuevos) {
            const reqDb = new sql.Request(transaction);
            await reqDb.query(`
                INSERT INTO LIC_LICENCIA_ACTUAL (NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias, PagoDirecto)
                VALUES ('${item.NumeroLicencia}', '${item.RutFuncionario}', '${item.Desde}', '${item.Hasta}', ${item.NumDias}, 'ACHS')
            `);
            
            const reqPago = new sql.Request(transaction);
            await reqPago.query(`
                INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                VALUES ('${item.NumeroLicencia}', ${item.NumDias})
            `);
            countNuevos++;
        }

        for (const item of modificados) {
            // Find max suffix
            const reqSuffix = new sql.Request(transaction);
            const suffRes = await reqSuffix.query(`
                SELECT NumeroLicencia FROM LIC_LICENCIA_ACTUAL 
                WHERE NumeroLicencia = '${item.NumeroLicencia}' OR NumeroLicencia LIKE '${item.NumeroLicencia}-%'
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
            await reqDb.query(`
                INSERT INTO LIC_LICENCIA_ACTUAL (NumeroLicencia, RutFuncionario, Desde, Hasta, NumDias, PagoDirecto)
                VALUES ('${newNumero}', '${item.RutFuncionario}', '${item.Desde}', '${item.Hasta}', ${item.NumDias}, 'ACHS')
            `);

            const reqPago = new sql.Request(transaction);
            await reqPago.query(`
                INSERT INTO LIC_PAGO_ACTUAL (NumeroLicencia, NumDiasLicencia)
                VALUES ('${newNumero}', ${item.NumDias})
            `);
            countModificados++;
        }

        // Registrar en Bitácora
        const reqLog = new sql.Request(transaction);
        await reqLog.query(`
            INSERT INTO LIC_BITACORA_ARCHIVOS (NombreArchivo, TotalRegistros, RegistrosNuevos, RegistrosActualizados, Usuario)
            VALUES ('${fileName}', ${nuevos.length + modificados.length}, ${countNuevos}, ${countModificados}, '${userName || 'Sistema'}')
        `);

        await transaction.commit();
        res.json({ status: 'ok', message: 'Procesado correctamente', nuevos: countNuevos, modificados: countModificados });

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
            SELECT Id, NombreArchivo, CONVERT(varchar, FechaProceso, 120) as FechaProceso, TotalRegistros, RegistrosNuevos, RegistrosActualizados, Usuario 
            FROM LIC_BITACORA_ARCHIVOS 
            ORDER BY FechaProceso DESC
        `);
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        console.error("Error fetching auditoria:", err);
        res.status(500).json({ error: 'Error fetching bitacora' });
    }
});

module.exports = router;
