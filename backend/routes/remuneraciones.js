const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const sql = require('mssql');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Columnas exactas de la tabla Personal en SQL Server y PostgreSQL (68 columnas)
const PERSONAL_DB_COLS = [
    'CODIGO', 'NOMBRE_SUCURSAL', 'codigoe', 'NOMBRE UNIDAD', 'RUT EMPLEADO',
    'DV', 'PATERNO', 'MATERNO', 'NOMBRE', 'SEXO',
    'F NACIMIENTO', 'EDAD', 'DETALLE', 'PLANTA', 'ESCALA',
    'CATEGORIA', 'DESCRIPCION', 'HORAS', 'Campo19', 'BIENIOS',
    'PROX BIENIO', 'GRADO', 'LETRA', 'INICIO', 'TERMINO',
    'ANTIGUEDAD', 'VIGENCIA', 'TOTAL NORMAL', 'TOTAL INVALIDA', 'TOTAL MATERNAL',
    'E2', 'R2', 'PORC', 'PORC ADICIONAL', 'INVA',
    'ADMIN', 'REBAJA', 'E1', 'R1', 'PORC FIJO',
    'MONTO FIJO', 'MONTO PESO', 'PORC APORTE PAT', 'MTO APORTE PAT', 'TOT HABERES',
    'TOT DESCTOS', 'SDO IMPONIB', 'MONTO IMPONI', 'MTO COTIZA', 'MTO ADIC',
    'MTO SALUD', 'TRIBUTA', 'DIAS TRAB', 'MTO PORCEN', 'CESEMPLEADO',
    'CESEMPLEADOR', 'INVEMPLEADOR', 'DIRECCION', 'TELEFONO', 'NACIONALIDAD',
    'ESTADO CIVIL', 'NUMERO CUENTA', 'RAZON SOCIAL', 'ESCOLARIDAD', 'COD T',
    'DESC TITULO', 'COD E', 'DESC ESPEC'
];

// Índices 0-based en la planilla de Personal que contienen fechas seriales de Excel
const PERSONAL_DATE_COL_INDICES = new Set([10, 20, 23, 24, 25]); // F.NACIMIENTO, PROX.BIENIO, INICIO, TERMINO, ANTIGUEDAD

// Convierte serial de Excel (ej. 46148) o string de fecha a formato DD-MM-YYYY (para tabla Personal)
function excelDateToDDMMYYYY(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        const utcMs = Math.round((val - 25569) * 86400 * 1000);
        const dt = new Date(utcMs);
        if (!isNaN(dt.getTime())) {
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = dt.getUTCFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }
    }
    const str = String(val).trim();
    if (!str || str.toUpperCase() === 'NULL') return '';
    // Si es un número en string (ej. "46148")
    if (/^\d{5}$/.test(str)) {
        const num = parseInt(str, 10);
        if (num > 10000 && num < 90000) {
            return excelDateToDDMMYYYY(num);
        }
    }
    // Si viene como YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
    }
    // Si viene como DD/MM/YYYY
    const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (slashMatch) {
        return `${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3]}`;
    }
    return str;
}

// Convierte serial de Excel o string de fecha a YYYY-MM-DD (o null) para columnas DATETIME (FechaInicio, FechaTermino en LIC_FUNCIONARIO)
function excelDateToISO(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        const utcMs = Math.round((val - 25569) * 86400 * 1000);
        const dt = new Date(utcMs);
        if (!isNaN(dt.getTime())) {
            return dt.toISOString().split('T')[0];
        }
    }
    const str = String(val).trim();
    if (!str || str.toUpperCase() === 'NULL') return null;
    if (/^\d{5}$/.test(str)) {
        const num = parseInt(str, 10);
        if (num > 10000 && num < 90000) {
            return excelDateToISO(num);
        }
    }
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
        const p1 = parseInt(dmyMatch[1], 10);
        const p2 = parseInt(dmyMatch[2], 10);
        const yyyy = dmyMatch[3];
        // En Chile es DD-MM-YYYY; si por error p2 > 12 es MM-DD-YYYY
        const dd = p2 > 12 ? String(p2).padStart(2, '0') : String(p1).padStart(2, '0');
        const mm = p2 > 12 ? String(p1).padStart(2, '0') : String(p2).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    return null;
}

function parseNum(val, decimals = false) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = String(val).trim().replace(/\s+/g, '').replace(',', '.');
    const n = decimals ? parseFloat(clean) : parseInt(clean, 10);
    return isNaN(n) ? 0 : n;
}

function mapCodContrato(detalleRaw) {
    const d = String(detalleRaw || '').trim().toUpperCase();
    if (d === 'INDEFINIDO' || d === '1') return '1';
    if (d === 'PLAZO FIJO' || d === '2') return '2';
    if (d === 'REEMPLAZO' || d === '3') return '3';
    return d;
}

// Helper para formatear literales SQL seguros en inserciones masivas por lotes
function sqlVal(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '0';
    return `N'${String(v).replace(/'/g, "''")}'`;
}

// Función central que ejecuta exactamente la lógica de la macro Sub separaData() de Formato Licencias_.xlsm
async function construirDatosDesdeExcel(buffer, anio, mes, pool) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    // Si suben un archivo que ya tiene hoja "Original", usamos esa; si no, la primera hoja (ej. "Hoja1")
    const targetSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'original') || wb.SheetNames[0];
    const ws = wb.Sheets[targetSheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) {
        throw new Error('El archivo Excel está vacío o no contiene filas de trabajadores.');
    }

    const headerRow = rows[0].map(h => String(h || '').trim().toUpperCase());
    if (headerRow.length < 53 || !headerRow[4].includes('RUT')) {
        throw new Error(
            `El formato del archivo no coincide con la planilla de Personal de Remuneraciones (se encontraron ${headerRow.length} columnas; columna E debe ser "RUT EMPLEADO").`
        );
    }

    const rawPool = pool.mssqlPool || pool;

    // 1. Obtener todos los registros actuales de LIC_FUNCIONARIO (equivalente a la hoja "Funcionario serv")
    const funcActualRes = await rawPool.request().query(`
        SELECT
            RTRIM(ISNULL(Rut, '')) as Rut,
            RTRIM(ISNULL(DV, '')) as DV,
            RTRIM(ISNULL(Nombre, '')) as Nombre,
            RTRIM(ISNULL(Paterno, '')) as Paterno,
            RTRIM(ISNULL(Materno, '')) as Materno,
            RTRIM(ISNULL(Jornada, '')) as Jornada,
            CONVERT(varchar, FechaInicio, 23) as FechaInicio,
            CONVERT(varchar, FechaTermino, 23) as FechaTermino,
            RTRIM(ISNULL(CodUnidad, '')) as CodUnidad,
            RTRIM(ISNULL(CodContrato, '')) as CodContrato,
            RTRIM(ISNULL(CodPlanta, '')) as CodPlanta,
            RTRIM(ISNULL(Categoria, '')) as Categoria,
            RTRIM(ISNULL(descripcionPlanta, '')) as descripcionPlanta,
            RTRIM(ISNULL(UltimaPrev, '')) as UltimaPrev,
            RTRIM(ISNULL(vigencia, '')) as vigencia,
            RTRIM(ISNULL(fAfiliacion, '')) as fAfiliacion,
            RTRIM(ISNULL(DESCRIPCION, '')) as DESCRIPCION
        FROM LIC_FUNCIONARIO
    `);

    const funcServMap = new Map();
    for (const f of funcActualRes.recordset) {
        if (f.Rut) {
            funcServMap.set(f.Rut, f);
        }
    }

    // 2. Obtener catálogos LIC_PREVISION y LIC_SALUD para validar Foreign Keys
    const [catPrevRes, catSaludRes, existPrevRes, existRentaRes] = await Promise.all([
        rawPool.request().query(`SELECT CodPrevision, RTRIM(ISNULL(Descripcion, '')) as Descripcion FROM LIC_PREVISION`),
        rawPool.request().query(`SELECT CodSalud, RTRIM(ISNULL(Descripcion, '')) as Descripcion FROM LIC_SALUD`),
        rawPool.request().input('A', sql.Int, anio).input('M', sql.Int, mes)
            .query(`SELECT COUNT(*) as cnt FROM LIC_HISTORICO_PREVISION_ACTUAL WHERE Anio = @A AND Mes = @M`),
        rawPool.request().input('A', sql.Int, anio).input('M', sql.Int, mes)
            .query(`SELECT COUNT(*) as cnt FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL WHERE Anio = @A AND Mes = @M`)
    ]);

    const codPrevExistentes = new Set(catPrevRes.recordset.map(r => Number(r.CodPrevision)));
    const codSaludExistentes = new Set(catSaludRes.recordset.map(r => Number(r.CodSalud)));
    const nuevosPrevMap = new Map();
    const nuevosSaludMap = new Map();

    const listaPrevision = [];
    const listaRenta = [];
    const listaFuncionario = [];
    const listaPersonal = [];
    const rutsVigentesMes = new Set();

    let totalMontoImponible = 0;
    let totalDescPrevision = 0;
    let totalDescSalud = 0;
    let totalMontoNeto = 0;
    let funcionariosConAfiliacionRescatada = 0;

    // Bucle principal (equivalente a For i = 2 To fin_v en Sub separaData)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const rut = String(row[4] ?? '').trim();
        if (!rut) continue;

        // Evitar duplicados de RUT dentro del mismo mes por llave primaria (Anio, Mes, Rut)
        if (rutsVigentesMes.has(rut)) continue;
        rutsVigentesMes.add(rut);

        // --- Variables Previsión (Hojas "Original" -> "Prevision") ---
        const porcPrevision = parseNum(row[32], true); // Col 33 (AG) - PORC
        const porcAdicional = parseNum(row[33], true); // Col 34 (AH) - PORC. ADICIONAL
        const porcFijo = parseNum(row[39], true);      // Col 40 (AN) - PORC. FIJO
        const montoUf = parseNum(row[40], true);       // Col 41 (AO) - MONTO FIJO
        const montoPeso = parseNum(row[41], false);    // Col 42 (AP) - MONTO PESO
        const codPrevision = parseNum(row[30], false); // Col 31 (AE) - E2
        const descCodPrev = String(row[31] ?? '').trim(); // Col 32 (AF) - R2
        const codSalud = parseNum(row[37], false);     // Col 38 (AL) - E1
        const descCodSalud = String(row[38] ?? '').trim(); // Col 39 (AM) - R1
        const diasTrab = String(row[52] ?? '').trim().substring(0, 10); // Col 53 (BA) - DIAS TRAB.

        if (codPrevision > 0 && !codPrevExistentes.has(codPrevision)) {
            nuevosPrevMap.set(codPrevision, descCodPrev || `PREVISION COD ${codPrevision}`);
        }
        if (codSalud > 0 && !codSaludExistentes.has(codSalud)) {
            nuevosSaludMap.set(codSalud, descCodSalud || `SALUD COD ${codSalud}`);
        }

        listaPrevision.push({
            Anio: anio,
            Mes: mes,
            Rut: rut.substring(0, 10),
            PorcPrevision: porcPrevision,
            PorcAdicional: porcAdicional,
            PorcFijo: porcFijo,
            MontoUF: montoUf,
            MontoPeso: montoPeso,
            CodPrevision: codPrevision,
            CodSalud: codSalud,
            diasTrab
        });

        // --- Variables Renta (Hojas "Original" -> "Renta") ---
        const montoImponible = parseNum(row[47], false); // Col 48 (AV) - MONTO IMPONI
        const descPrevision = parseNum(row[48], false);  // Col 49 (AW) - MTO. COTIZA
        const descSalud = parseNum(row[50], false);      // Col 51 (AY) - MTO. SALUD
        const montoNeto = montoImponible - descPrevision - descSalud;

        totalMontoImponible += montoImponible;
        totalDescPrevision += descPrevision;
        totalDescSalud += descSalud;
        totalMontoNeto += montoNeto;

        listaRenta.push({
            Anio: anio,
            Mes: mes,
            RutFuncionario: rut.substring(0, 10),
            MontoImponible: montoImponible,
            descPrevision: descPrevision,
            descSalud: descSalud,
            impuestoUnico: null,
            montoNeto: montoNeto
        });

        // --- Variables Funcionario (Hojas "Original" + rescate fAfiliacion desde "Funcionario serv") ---
        const dv = String(row[5] ?? '').trim().substring(0, 1);
        const paterno = String(row[6] ?? '').trim().substring(0, 30);
        const materno = String(row[7] ?? '').trim().substring(0, 30);
        const nombre = String(row[8] ?? '').trim().substring(0, 50);
        const jornada = String(row[17] ?? '').trim().substring(0, 50);
        const fechaInicioISO = excelDateToISO(row[23]); // Col 24 (X) - INICIO
        const fechaTerminoISO = excelDateToISO(row[24]); // Col 25 (Y) - TERMINO
        const codUnidad = String(row[2] ?? '').trim().substring(0, 50); // Col 3 (C) - CODIGO unidad
        const codContrato = mapCodContrato(row[12]); // Col 13 (M) - DETALLE -> 1, 2, 3
        const codPlanta = String(row[13] ?? '').trim().substring(0, 50); // Col 14 (N) - PLANTA
        const categoria = String(row[15] ?? '').trim().substring(0, 1);  // Col 16 (P) - CATEGORIA
        const descripcionPlanta = String(row[16] ?? '').trim().substring(0, 150); // Col 17 (Q) - DESCRIPCION
        const ultimaPrev = String(row[37] ?? '').trim().substring(0, 50); // Col 38 (AL) - E1

        const prevFunc = funcServMap.get(rut);
        let fAfiliacion = '';
        if (prevFunc && prevFunc.fAfiliacion && prevFunc.fAfiliacion.toUpperCase() !== 'NULL') {
            fAfiliacion = prevFunc.fAfiliacion;
            funcionariosConAfiliacionRescatada++;
        }

        listaFuncionario.push({
            Rut: rut.substring(0, 10),
            DV: dv,
            Nombre: nombre,
            Paterno: paterno,
            Materno: materno,
            Jornada: jornada,
            FechaInicio: fechaInicioISO,
            FechaTermino: fechaTerminoISO,
            CodUnidad: codUnidad,
            CodContrato: codContrato,
            CodPlanta: codPlanta,
            Categoria: categoria,
            descripcionPlanta: descripcionPlanta,
            UltimaPrev: ultimaPrev,
            vigencia: 'S',
            fAfiliacion: fAfiliacion.substring(0, 50),
            DESCRIPCION: null
        });

        // --- Fila para tabla Personal (68 columnas de "Original" con DETALLE=1/2/3 y fechas DD-MM-YYYY) ---
        const personalValues = [];
        for (let c = 0; c < 68; c++) {
            let cellVal = row[c];
            if (c === 12) {
                // Col 13 (DETALLE) -> codContrato (1, 2, 3)
                cellVal = codContrato;
            } else if (c === 15) {
                // Col 16 (CATEGORIA) -> Trim
                cellVal = categoria;
            } else if (PERSONAL_DATE_COL_INDICES.has(c)) {
                const formattedDate = excelDateToDDMMYYYY(cellVal);
                cellVal = formattedDate || (typeof cellVal === 'string' ? cellVal : '');
            } else if (cellVal === null || cellVal === undefined) {
                cellVal = '';
            } else {
                cellVal = String(cellVal);
            }
            const maxLen = c === 4 ? 10 : 255;
            personalValues.push(String(cellVal).substring(0, maxLen));
        }
        listaPersonal.push(personalValues);
    }

    // Segundo bucle de la macro (For h = 2 To fin_fs):
    // Agregar al final de LIC_FUNCIONARIO los trabajadores históricos que estaban en LIC_FUNCIONARIO
    // pero que NO vienen en el archivo del mes actual, dejándolos con vigencia = 'N'
    let funcionariosHistoricosConservados = 0;
    for (const [rutHist, fHist] of funcServMap.entries()) {
        if (!rutsVigentesMes.has(rutHist)) {
            const fAfilHist = fHist.fAfiliacion && fHist.fAfiliacion.toUpperCase() !== 'NULL' ? fHist.fAfiliacion : '';
            const catHist = fHist.Categoria && fHist.Categoria.toUpperCase() !== 'NULL' ? fHist.Categoria.substring(0, 1) : '';
            listaFuncionario.push({
                Rut: rutHist.substring(0, 10),
                DV: (fHist.DV || '').substring(0, 1),
                Nombre: (fHist.Nombre || '').substring(0, 50),
                Paterno: (fHist.Paterno || '').substring(0, 30),
                Materno: (fHist.Materno || '').substring(0, 30),
                Jornada: (fHist.Jornada || '').substring(0, 50),
                FechaInicio: excelDateToISO(fHist.FechaInicio),
                FechaTermino: excelDateToISO(fHist.FechaTermino),
                CodUnidad: (fHist.CodUnidad || '').substring(0, 50),
                CodContrato: (fHist.CodContrato || '').substring(0, 50),
                CodPlanta: (fHist.CodPlanta || '').substring(0, 50),
                Categoria: catHist,
                descripcionPlanta: (fHist.descripcionPlanta || '').substring(0, 150),
                UltimaPrev: (fHist.UltimaPrev || '').substring(0, 50),
                vigencia: 'N',
                fAfiliacion: fAfilHist.substring(0, 50),
                DESCRIPCION: null
            });
            funcionariosHistoricosConservados++;
        }
    }

    const cantPrevExistente = Number(existPrevRes.recordset[0]?.cnt || 0);
    const cantRentaExistente = Number(existRentaRes.recordset[0]?.cnt || 0);

    return {
        resumen: {
            anio,
            mes,
            hojaOrigen: targetSheetName,
            periodoYaExiste: cantPrevExistente > 0 || cantRentaExistente > 0,
            cantPrevExistente,
            cantRentaExistente,
            totalFilasArchivo: listaPrevision.length,
            totalMontoImponible,
            totalDescPrevision,
            totalDescSalud,
            totalMontoNeto,
            funcionariosVigentes: listaPrevision.length,
            funcionariosHistoricosConservados,
            funcionariosConAfiliacionRescatada,
            totalFuncionariosFinal: listaFuncionario.length,
            codigosPrevisionNuevos: Array.from(nuevosPrevMap.entries()).map(([codigo, descripcion]) => ({ codigo, descripcion })),
            codigosSaludNuevos: Array.from(nuevosSaludMap.entries()).map(([codigo, descripcion]) => ({ codigo, descripcion }))
        },
        listaPrevision,
        listaRenta,
        listaFuncionario,
        listaPersonal,
        rawHeaderRow: rows[0]
    };
}

// 1. Obtener historial de cargas mensuales y estado actual de las 4 tablas
router.get('/historial', async (req, res) => {
    try {
        const pool = req.db;
        const rawPool = pool.mssqlPool || pool;

        const [rentaPerRes, prevPerRes, funcStatsRes, persCountRes] = await Promise.all([
            rawPool.request().query(`
                SELECT TOP 18
                    Anio,
                    Mes,
                    COUNT(*) as CantidadRenta,
                    SUM(ISNULL(MontoImponible, 0)) as TotalImponible,
                    SUM(ISNULL(descPrevision, 0)) as TotalDescPrevision,
                    SUM(ISNULL(descSalud, 0)) as TotalDescSalud,
                    SUM(ISNULL(montoNeto, 0)) as TotalMontoNeto
                FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL
                GROUP BY Anio, Mes
                ORDER BY Anio DESC, Mes DESC
            `),
            rawPool.request().query(`
                SELECT TOP 18
                    Anio,
                    Mes,
                    COUNT(*) as CantidadPrevision
                FROM LIC_HISTORICO_PREVISION_ACTUAL
                GROUP BY Anio, Mes
                ORDER BY Anio DESC, Mes DESC
            `),
            rawPool.request().query(`
                SELECT
                    COUNT(*) as TotalFuncionarios,
                    SUM(CASE WHEN RTRIM(ISNULL(vigencia, '')) = 'S' THEN 1 ELSE 0 END) as Vigentes,
                    SUM(CASE WHEN RTRIM(ISNULL(vigencia, '')) <> 'S' THEN 1 ELSE 0 END) as Historicos
                FROM LIC_FUNCIONARIO
            `),
            rawPool.request().query(`SELECT COUNT(*) as TotalPersonal FROM Personal`)
        ]);

        const prevMap = new Map();
        for (const p of prevPerRes.recordset) {
            prevMap.set(`${p.Anio}-${p.Mes}`, Number(p.CantidadPrevision || 0));
        }

        const periodos = rentaPerRes.recordset.map(r => ({
            Anio: r.Anio,
            Mes: r.Mes,
            CantidadRenta: Number(r.CantidadRenta || 0),
            CantidadPrevision: prevMap.get(`${r.Anio}-${r.Mes}`) || 0,
            TotalImponible: Number(r.TotalImponible || 0),
            TotalDescPrevision: Number(r.TotalDescPrevision || 0),
            TotalDescSalud: Number(r.TotalDescSalud || 0),
            TotalMontoNeto: Number(r.TotalMontoNeto || 0)
        }));

        const fStats = funcStatsRes.recordset[0] || {};
        res.json({
            status: 'ok',
            periodos,
            estadoTablas: {
                totalPersonal: Number(persCountRes.recordset[0]?.TotalPersonal || 0),
                totalFuncionarios: Number(fStats.TotalFuncionarios || 0),
                funcionariosVigentes: Number(fStats.Vigentes || 0),
                funcionariosHistoricos: Number(fStats.Historicos || 0)
            }
        });
    } catch (err) {
        console.error('Error en GET /api/remuneraciones/historial:', err);
        res.status(500).json({ error: 'Error consultando el historial de remuneraciones' });
    }
});

// 2. Previsualizar y validar el archivo Excel de Personal antes de cargar en BD
router.post('/previsualizar', upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'Debe adjuntar el archivo Excel (.xlsx) de Personal' });
        }
        const anio = parseInt(req.body.anio, 10);
        const mes = parseInt(req.body.mes, 10);
        if (!anio || !mes || mes < 1 || mes > 12) {
            return res.status(400).json({ error: 'Año y Mes válidos son obligatorios' });
        }

        const resultado = await construirDatosDesdeExcel(req.file.buffer, anio, mes, req.db);

        res.json({
            status: 'ok',
            resumen: resultado.resumen,
            muestra: {
                prevision: resultado.listaPrevision.slice(0, 50),
                renta: resultado.listaRenta.slice(0, 50),
                funcionario: resultado.listaFuncionario.slice(0, 50),
                personal: resultado.listaPersonal.slice(0, 30).map(vals => ({
                    CodigoSector: vals[0],
                    Sucursal: vals[1]?.trim(),
                    CodUnidad: vals[2],
                    NombreUnidad: vals[3]?.trim(),
                    Rut: vals[4],
                    DV: vals[5]?.trim(),
                    Paterno: vals[6]?.trim(),
                    Materno: vals[7]?.trim(),
                    Nombre: vals[8]?.trim(),
                    CodContrato: vals[12],
                    DescripcionCargo: vals[16]?.trim(),
                    Inicio: vals[23],
                    Termino: vals[24]?.trim(),
                    CodAFP: vals[30],
                    NombreAFP: vals[31]?.trim(),
                    CodSalud: vals[37],
                    NombreSalud: vals[38]?.trim(),
                    MontoImponible: vals[47],
                    DiasTrab: vals[52]
                }))
            }
        });
    } catch (err) {
        console.error('Error en POST /api/remuneraciones/previsualizar:', err);
        res.status(400).json({ error: err.message || 'Error al procesar el archivo Excel' });
    }
});

// 3. Ejecutar la carga completa en las 4 tablas (SQL Server + PostgreSQL)
router.post('/procesar', upload.single('archivo'), async (req, res) => {
    const startTime = Date.now();
    const pool = req.db;
    const rawPool = pool.mssqlPool || pool;

    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'Debe adjuntar el archivo Excel (.xlsx) de Personal' });
        }
        const anio = parseInt(req.body.anio, 10);
        const mes = parseInt(req.body.mes, 10);
        const reprocesar = String(req.body.reprocesar || 'false').toLowerCase() === 'true';

        if (!anio || !mes || mes < 1 || mes > 12) {
            return res.status(400).json({ error: 'Año y Mes válidos son obligatorios' });
        }

        const datos = await construirDatosDesdeExcel(req.file.buffer, anio, mes, pool);
        const { resumen, listaPrevision, listaRenta, listaFuncionario, listaPersonal } = datos;

        if (resumen.periodoYaExiste && !reprocesar) {
            return res.status(409).json({
                error: `El período ${mes}/${anio} ya registra datos cargados (${resumen.cantRentaExistente} registros). Active la casilla "Reprocesar / Sobrescribir mes existente" si desea actualizarlo.`,
                periodoYaExiste: true
            });
        }

        const transaction = new sql.Transaction(rawPool);
        await transaction.begin();

        try {
            // 0. Si vienen códigos nuevos de AFP o Salud, insertarlos automáticamente en LIC_PREVISION / LIC_SALUD
            for (const np of resumen.codigosPrevisionNuevos) {
                await new sql.Request(transaction)
                    .input('Cod', sql.TinyInt, np.codigo)
                    .input('Desc', sql.NVarChar, np.descripcion.substring(0, 50))
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM LIC_PREVISION WHERE CodPrevision = @Cod)
                        INSERT INTO LIC_PREVISION (CodPrevision, Descripcion) VALUES (@Cod, @Desc)
                    `);
            }
            for (const ns of resumen.codigosSaludNuevos) {
                await new sql.Request(transaction)
                    .input('Cod', sql.TinyInt, ns.codigo)
                    .input('Desc', sql.NVarChar, ns.descripcion.substring(0, 50))
                    .input('CodStr', sql.NChar, String(ns.codigo))
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM LIC_SALUD WHERE CodSalud = @Cod)
                        INSERT INTO LIC_SALUD (CodSalud, Descripcion, codigo) VALUES (@Cod, @Desc, @CodStr)
                    `);
            }

            // 1. LIC_HISTORICO_PREVISION_ACTUAL
            await new sql.Request(transaction)
                .input('A', sql.Int, anio)
                .input('M', sql.Int, mes)
                .query(`DELETE FROM LIC_HISTORICO_PREVISION_ACTUAL WHERE Anio = @A AND Mes = @M`);

            const BATCH_SIZE = 400;
            for (let i = 0; i < listaPrevision.length; i += BATCH_SIZE) {
                const chunk = listaPrevision.slice(i, i + BATCH_SIZE);
                const valuesSql = chunk.map(r =>
                    `(${sqlVal(r.Anio)},${sqlVal(r.Mes)},${sqlVal(r.Rut)},${sqlVal(r.PorcPrevision)},${sqlVal(r.PorcAdicional)},${sqlVal(r.PorcFijo)},${sqlVal(r.MontoUF)},${sqlVal(r.MontoPeso)},${sqlVal(r.CodPrevision)},${sqlVal(r.CodSalud)},${sqlVal(r.diasTrab)})`
                ).join(',');
                await new sql.Request(transaction).query(`
                    INSERT INTO LIC_HISTORICO_PREVISION_ACTUAL (
                        Anio, Mes, Rut, PorcPrevision, PorcAdicional, PorcFijo, MontoUF, MontoPeso, CodPrevision, CodSalud, diasTrab
                    ) VALUES ${valuesSql}
                `);
            }

            // 2. LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL
            await new sql.Request(transaction)
                .input('A', sql.Int, anio)
                .input('M', sql.Int, mes)
                .query(`DELETE FROM LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL WHERE Anio = @A AND Mes = @M`);

            for (let i = 0; i < listaRenta.length; i += BATCH_SIZE) {
                const chunk = listaRenta.slice(i, i + BATCH_SIZE);
                const valuesSql = chunk.map(r =>
                    `(${sqlVal(r.Anio)},${sqlVal(r.Mes)},${sqlVal(r.RutFuncionario)},${sqlVal(r.MontoImponible)},${sqlVal(r.descPrevision)},${sqlVal(r.descSalud)},NULL,${sqlVal(r.montoNeto)})`
                ).join(',');
                await new sql.Request(transaction).query(`
                    INSERT INTO LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL (
                        Anio, Mes, RutFuncionario, MontoImponible, descPrevision, descSalud, impuestoUnico, montoNeto
                    ) VALUES ${valuesSql}
                `);
            }

            // 3. LIC_FUNCIONARIO (Elimina e inserta vigentes 'S' + históricos 'N' con fAfiliacion preservada)
            await new sql.Request(transaction).query(`DELETE FROM LIC_FUNCIONARIO`);

            for (let i = 0; i < listaFuncionario.length; i += BATCH_SIZE) {
                const chunk = listaFuncionario.slice(i, i + BATCH_SIZE);
                const valuesSql = chunk.map(f =>
                    `(${sqlVal(f.Rut)},${sqlVal(f.DV)},${sqlVal(f.Nombre)},${sqlVal(f.Paterno)},${sqlVal(f.Materno)},${sqlVal(f.Jornada)},${sqlVal(f.FechaInicio)},${sqlVal(f.FechaTermino)},${sqlVal(f.CodUnidad)},${sqlVal(f.CodContrato)},${sqlVal(f.CodPlanta)},${sqlVal(f.Categoria)},${sqlVal(f.descripcionPlanta)},${sqlVal(f.UltimaPrev)},${sqlVal(f.vigencia)},${sqlVal(f.fAfiliacion)},NULL)`
                ).join(',');
                await new sql.Request(transaction).query(`
                    INSERT INTO LIC_FUNCIONARIO (
                        Rut, DV, Nombre, Paterno, Materno, Jornada, FechaInicio, FechaTermino,
                        CodUnidad, CodContrato, CodPlanta, Categoria, descripcionPlanta,
                        UltimaPrev, vigencia, fAfiliacion, DESCRIPCION
                    ) VALUES ${valuesSql}
                `);
            }

            // 4. Tabla Personal (Elimina e inserta las 68 columnas de Original con DETALLE=1/2/3 y fechas DD-MM-YYYY)
            await new sql.Request(transaction).query(`DELETE FROM Personal`);

            const mssqlPersonalCols = PERSONAL_DB_COLS.map(c => `[${c}]`).join(',');
            const PERS_BATCH = 150;
            for (let i = 0; i < listaPersonal.length; i += PERS_BATCH) {
                const chunk = listaPersonal.slice(i, i + PERS_BATCH);
                const valuesSql = chunk.map(rowVals =>
                    `(${rowVals.map(v => sqlVal(v)).join(',')})`
                ).join(',');
                await new sql.Request(transaction).query(`
                    INSERT INTO Personal (${mssqlPersonalCols}) VALUES ${valuesSql}
                `);
            }

            await transaction.commit();
        } catch (txErr) {
            await transaction.rollback().catch(() => {});
            throw txErr;
        }

        // 5. Sincronizar con PostgreSQL en Modo Dual
        let pgSynced = false;
        if (pool.pgPool) {
            const pgClient = await pool.pgPool.connect();
            try {
                await pgClient.query('BEGIN');

                const pgVal = (v) => {
                    if (v === null || v === undefined) return 'NULL';
                    if (typeof v === 'number') return isFinite(v) ? String(v) : '0';
                    return `'${String(v).replace(/'/g, "''")}'`;
                };

                for (const np of resumen.codigosPrevisionNuevos) {
                    await pgClient.query(
                        `INSERT INTO lic_prevision (codprevision, descripcion)
                         SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM lic_prevision WHERE codprevision = $1)`,
                        [np.codigo, np.descripcion.substring(0, 50)]
                    );
                }
                for (const ns of resumen.codigosSaludNuevos) {
                    await pgClient.query(
                        `INSERT INTO lic_salud (codsalud, descripcion, codigo)
                         SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM lic_salud WHERE codsalud = $1)`,
                        [ns.codigo, ns.descripcion.substring(0, 50), String(ns.codigo)]
                    );
                }

                // 1. lic_historico_prevision_actual
                await pgClient.query(`DELETE FROM lic_historico_prevision_actual WHERE anio = $1 AND mes = $2`, [anio, mes]);
                const PG_BATCH = 400;
                for (let i = 0; i < listaPrevision.length; i += PG_BATCH) {
                    const chunk = listaPrevision.slice(i, i + PG_BATCH);
                    const valuesSql = chunk.map(r =>
                        `(${pgVal(r.Anio)},${pgVal(r.Mes)},${pgVal(r.Rut)},${pgVal(r.PorcPrevision)},${pgVal(r.PorcAdicional)},${pgVal(r.PorcFijo)},${pgVal(r.MontoUF)},${pgVal(r.MontoPeso)},${pgVal(r.CodPrevision)},${pgVal(r.CodSalud)},${pgVal(r.diasTrab)})`
                    ).join(',');
                    await pgClient.query(`
                        INSERT INTO lic_historico_prevision_actual (
                            anio, mes, rut, porcprevision, porcadicional, porcfijo, montouf, montopeso, codprevision, codsalud, diastrab
                        ) VALUES ${valuesSql}
                    `);
                }

                // 2. lic_historico_renta_imponible_actual
                await pgClient.query(`DELETE FROM lic_historico_renta_imponible_actual WHERE anio = $1 AND mes = $2`, [anio, mes]);
                for (let i = 0; i < listaRenta.length; i += PG_BATCH) {
                    const chunk = listaRenta.slice(i, i + PG_BATCH);
                    const valuesSql = chunk.map(r =>
                        `(${pgVal(r.Anio)},${pgVal(r.Mes)},${pgVal(r.RutFuncionario)},${pgVal(r.MontoImponible)},${pgVal(r.descPrevision)},${pgVal(r.descSalud)},NULL,${pgVal(r.montoNeto)})`
                    ).join(',');
                    await pgClient.query(`
                        INSERT INTO lic_historico_renta_imponible_actual (
                            anio, mes, rutfuncionario, montoimponible, descprevision, descsalud, impuestounico, montoneto
                        ) VALUES ${valuesSql}
                    `);
                }

                // 3. lic_funcionario
                await pgClient.query(`DELETE FROM lic_funcionario`);
                for (let i = 0; i < listaFuncionario.length; i += PG_BATCH) {
                    const chunk = listaFuncionario.slice(i, i + PG_BATCH);
                    const valuesSql = chunk.map(f =>
                        `(${pgVal(f.Rut)},${pgVal(f.DV)},${pgVal(f.Nombre)},${pgVal(f.Paterno)},${pgVal(f.Materno)},${pgVal(f.Jornada)},${pgVal(f.FechaInicio)},${pgVal(f.FechaTermino)},${pgVal(f.CodUnidad)},${pgVal(f.CodContrato)},${pgVal(f.CodPlanta)},${pgVal(f.Categoria)},${pgVal(f.descripcionPlanta)},${pgVal(f.UltimaPrev)},${pgVal(f.vigencia)},${pgVal(f.fAfiliacion)},NULL)`
                    ).join(',');
                    await pgClient.query(`
                        INSERT INTO lic_funcionario (
                            rut, dv, nombre, paterno, materno, jornada, fechainicio, fechatermino,
                            codunidad, codcontrato, codplanta, categoria, descripcionplanta,
                            ultimaprev, vigencia, fafiliacion, descripcion
                        ) VALUES ${valuesSql}
                    `);
                }

                // 4. personal
                await pgClient.query(`DELETE FROM personal`);
                const pgPersonalCols = PERSONAL_DB_COLS.map(c => `"${c.toLowerCase()}"`).join(',');
                const PG_PERS_BATCH = 150;
                for (let i = 0; i < listaPersonal.length; i += PG_PERS_BATCH) {
                    const chunk = listaPersonal.slice(i, i + PG_PERS_BATCH);
                    const valuesSql = chunk.map(rowVals =>
                        `(${rowVals.map(v => pgVal(v)).join(',')})`
                    ).join(',');
                    await pgClient.query(`
                        INSERT INTO personal (${pgPersonalCols}) VALUES ${valuesSql}
                    `);
                }

                await pgClient.query('COMMIT');
                pgSynced = true;
            } catch (pgErr) {
                await pgClient.query('ROLLBACK').catch(() => {});
                console.error('[PG Sync Remuneraciones Error]:', pgErr.message);
            } finally {
                pgClient.release();
            }
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

        res.json({
            status: 'ok',
            elapsedSeconds: Number(elapsedSec),
            pgSynced,
            resumen,
            message: `Carga mensual ${mes}/${anio} completada exitosamente en ${elapsedSec}s: ${listaPrevision.length.toLocaleString('es-CL')} registros en Previsión, Renta y Personal, y ${listaFuncionario.length.toLocaleString('es-CL')} en LIC_FUNCIONARIO.`
        });
    } catch (err) {
        console.error('Error en POST /api/remuneraciones/procesar:', err);
        res.status(500).json({ error: err.message || 'Error ejecutando la carga mensual de remuneraciones' });
    }
});

// 4. Descargar archivo Excel con las 4 hojas procesadas (Original, Prevision, Renta, Funcionario) igual que Formato Licencias_.xlsm
router.post('/descargar-excel', upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'Debe adjuntar el archivo Excel (.xlsx) de Personal' });
        }
        const anio = parseInt(req.body.anio, 10);
        const mes = parseInt(req.body.mes, 10);
        if (!anio || !mes) {
            return res.status(400).json({ error: 'Año y Mes son obligatorios' });
        }

        const datos = await construirDatosDesdeExcel(req.file.buffer, anio, mes, req.db);
        const outWb = XLSX.utils.book_new();

        // 1. Hoja Original (con DETALLE cambiado a 1, 2, 3)
        const origAoA = [datos.rawHeaderRow, ...datos.listaPersonal];
        const wsOrig = XLSX.utils.aoa_to_sheet(origAoA);
        XLSX.utils.book_append_sheet(outWb, wsOrig, 'Original');

        // 2. Hoja Prevision
        const prevAoA = [
            ['LIC_HISTORICO_PREVISION_ACTUAL'],
            ['Anio', 'Mes', 'Rut', 'PorcPrevision', 'PorcAdicional', 'PorcFijo', 'MontoUF', 'MontoPeso', 'CodPrevision', 'CodSalud', 'diasTrab'],
            ...datos.listaPrevision.map(r => [
                r.Anio, r.Mes, r.Rut, r.PorcPrevision, r.PorcAdicional, r.PorcFijo,
                r.MontoUF, r.MontoPeso, r.CodPrevision, r.CodSalud, r.diasTrab
            ])
        ];
        const wsPrev = XLSX.utils.aoa_to_sheet(prevAoA);
        XLSX.utils.book_append_sheet(outWb, wsPrev, 'Prevision');

        // 3. Hoja Renta
        const rentaAoA = [
            ['LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL', '', '', '', '', '', 'blanco', ''],
            ['Anio', 'Mes', 'RutFuncionario', 'MontoImponible', 'descPrevision', 'descSalud', 'impuestoUnico', 'montoNeto'],
            ...datos.listaRenta.map(r => [
                r.Anio, r.Mes, r.RutFuncionario, r.MontoImponible, r.descPrevision, r.descSalud, '', r.montoNeto
            ])
        ];
        const wsRenta = XLSX.utils.aoa_to_sheet(rentaAoA);
        XLSX.utils.book_append_sheet(outWb, wsRenta, 'Renta');

        // 4. Hoja Funcionario
        const funcAoA = [
            ['LIC_FUNCIONARIO'],
            ['RUT EMPLEADO', 'DV', 'NOMBRE', 'PATERNO', 'MATERNO', 'HORAS', 'INICIO', 'TERMINO', 'CodUndidad', 'CodContrato', 'PLANTA', 'CATEGORIA', 'DESCRIPCION', 'E1', 'VIGENCIA', 'fafiliacion', 'ESTA'],
            ...datos.listaFuncionario.map(f => [
                f.Rut, f.DV, f.Nombre, f.Paterno, f.Materno, f.Jornada,
                f.FechaInicio || '', f.FechaTermino || '', f.CodUnidad, f.CodContrato,
                f.CodPlanta, f.Categoria, f.descripcionPlanta, f.UltimaPrev, f.vigencia, f.fAfiliacion || '', ''
            ])
        ];
        const wsFunc = XLSX.utils.aoa_to_sheet(funcAoA);
        XLSX.utils.book_append_sheet(outWb, wsFunc, 'Funcionario');

        const outBuffer = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Formato_Licencias_${anio}_${String(mes).padStart(2, '0')}.xlsx"`);
        res.send(outBuffer);
    } catch (err) {
        console.error('Error generando Excel procesado:', err);
        res.status(500).json({ error: err.message || 'Error generando el archivo Excel' });
    }
});

module.exports = router;
