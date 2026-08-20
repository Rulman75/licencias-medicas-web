const xlsx = require('xlsx');

function analyzeFile(filename) {
    console.log(`\n\n--- Analyzing: ${filename} ---`);
    try {
        const workbook = xlsx.readFile(filename);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Get raw JSON
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
        
        // Output the first 5 rows to see what the headers and data look like
        // Sometimes Excel files have empty rows or titles at the top, so we look at the first 15 rows.
        console.log(JSON.stringify(rawData.slice(0, 15), null, 2));
    } catch (e) {
        console.error("Error reading file", e);
    }
}

analyzeFile("Planilla de Accidentabilidad CMDS - Junio 2024 al  17 de Agosto 2026.xlsx");
analyzeFile("Siniestros - CORPORACION MUNICIPAL DESARROLLO SOCIAL ANTOFAGAS hasta el 18-08-2026.xlsx");
