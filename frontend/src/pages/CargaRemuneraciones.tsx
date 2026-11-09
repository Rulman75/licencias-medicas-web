import React, { useState, useEffect, useRef } from 'react';
import { exportToExcel, exportToCorporatePDF, formatCurrencyCLP, formatDateDDMMYYYY } from '../utils/exportUtils';

interface PeriodoHistorial {
  Anio: number;
  Mes: number;
  CantidadRenta: number;
  CantidadPrevision: number;
  TotalImponible: number;
  TotalDescPrevision: number;
  TotalDescSalud: number;
  TotalMontoNeto: number;
}

interface EstadoTablas {
  totalPersonal: number;
  totalFuncionarios: number;
  funcionariosVigentes: number;
  funcionariosHistoricos: number;
}

interface ResumenPrevisualizacion {
  anio: number;
  mes: number;
  hojaOrigen: string;
  periodoYaExiste: boolean;
  cantPrevExistente: number;
  cantRentaExistente: number;
  totalFilasArchivo: number;
  totalMontoImponible: number;
  totalDescPrevision: number;
  totalDescSalud: number;
  totalMontoNeto: number;
  funcionariosVigentes: number;
  funcionariosHistoricosConservados: number;
  funcionariosConAfiliacionRescatada: number;
  totalFuncionariosFinal: number;
  codigosPrevisionNuevos: { codigo: number; descripcion: string }[];
  codigosSaludNuevos: { codigo: number; descripcion: string }[];
}

const MESES_NOMBRES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

export default function CargaRemuneraciones() {
  const now = new Date();
  const [anio, setAnio] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reprocesar, setReprocesar] = useState<boolean>(false);

  const [periodos, setPeriodos] = useState<PeriodoHistorial[]>([]);
  const [estadoTablas, setEstadoTablas] = useState<EstadoTablas>({
    totalPersonal: 0,
    totalFuncionarios: 0,
    funcionariosVigentes: 0,
    funcionariosHistoricos: 0
  });

  const [resumenPrev, setResumenPrev] = useState<ResumenPrevisualizacion | null>(null);
  const [muestraPrev, setMuestraPrev] = useState<{
    prevision: any[];
    renta: any[];
    funcionario: any[];
    personal: any[];
  } | null>(null);

  const [tabMuestra, setTabMuestra] = useState<'prevision' | 'renta' | 'funcionario' | 'personal'>('renta');
  const [cargandoHistorial, setCargandoHistorial] = useState<boolean>(false);
  const [previsualizando, setPrevisualizando] = useState<boolean>(false);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [descargandoExcel, setDescargandoExcel] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'info', texto: string) => {
    setMensaje({ tipo, texto });
  };

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const res = await fetch('/api/remuneraciones/historial');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setPeriodos(data.periodos || []);
        if (data.estadoTablas) {
          setEstadoTablas(data.estadoTablas);
        }
      }
    } catch (e) {
      console.error('Error cargando historial de remuneraciones:', e);
    } finally {
      setCargandoHistorial(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  // Autodetectar Año y Mes desde el nombre del archivo (ej. "OCTUBRE 2026 PERSONAL 2.xlsx")
  const detectarPeriodoDesdeNombre = (fileName: string): { anioDet: number; mesDet: number } => {
    const upper = fileName.toUpperCase();
    let anioDet = anio;
    let mesDet = mes;

    const yearMatch = upper.match(/\b(202\d|203\d)\b/);
    if (yearMatch) {
      anioDet = parseInt(yearMatch[1], 10);
    }

    const mapaMeses: Record<string, number> = {
      ENERO: 1,
      FEBRERO: 2,
      MARZO: 3,
      ABRIL: 4,
      MAYO: 5,
      JUNIO: 6,
      JULIO: 7,
      AGOSTO: 8,
      SEPTIEMBRE: 9,
      SETIEMBRE: 9,
      OCTUBRE: 10,
      NOVIEMBRE: 11,
      DICIEMBRE: 12
    };

    for (const [nombreMes, numMes] of Object.entries(mapaMeses)) {
      if (upper.includes(nombreMes)) {
        mesDet = numMes;
        break;
      }
    }

    return { anioDet, mesDet };
  };

  const ejecutarPrevisualizacion = async (fileToUse: File, anioToUse: number, mesToUse: number) => {
    setPrevisualizando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('archivo', fileToUse);
      formData.append('anio', String(anioToUse));
      formData.append('mes', String(mesToUse));

      const res = await fetch('/api/remuneraciones/previsualizar', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setResumenPrev(data.resumen);
        setMuestraPrev(data.muestra);
        if (data.resumen.periodoYaExiste) {
          setReprocesar(true);
          mostrarAlerta(
            'info',
            `Archivo validado correctamente (${data.resumen.totalFilasArchivo.toLocaleString('es-CL')} trabajadores). Nota: El período ${MESES_NOMBRES[mesToUse]} ${anioToUse} ya tiene registros cargados; se activó la opción de Reprocesar/Actualizar.`
          );
        } else {
          setReprocesar(false);
          mostrarAlerta(
            'ok',
            `Archivo validado correctamente: ${data.resumen.totalFilasArchivo.toLocaleString('es-CL')} trabajadores vigentes listos para cargar en ${MESES_NOMBRES[mesToUse]} ${anioToUse}.`
          );
        }
      } else {
        setResumenPrev(null);
        setMuestraPrev(null);
        mostrarAlerta('error', data.error || 'No se pudo validar el archivo Excel');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión al validar el archivo Excel');
    } finally {
      setPrevisualizando(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setArchivo(f);
    const { anioDet, mesDet } = detectarPeriodoDesdeNombre(f.name);
    setAnio(anioDet);
    setMes(mesDet);
    ejecutarPrevisualizacion(f, anioDet, mesDet);
  };

  const ejecutarCargaEnBD = async () => {
    if (!archivo) {
      mostrarAlerta('error', 'Primero seleccione el archivo Excel (.xlsx) de Personal enviado por Remuneraciones');
      return;
    }

    const nombreMes = MESES_NOMBRES[mes] || String(mes);
    const msgConfirm = resumenPrev?.periodoYaExiste
      ? `¿Confirma REPROCESAR el período ${nombreMes} ${anio}?\n\nSe actualizarán:\n1. LIC_HISTORICO_PREVISION_ACTUAL (${nombreMes} ${anio})\n2. LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL (${nombreMes} ${anio})\n3. LIC_FUNCIONARIO (Vigentes 'S' + Históricos 'N' conservando fAfiliacion)\n4. Tabla Personal (68 columnas)`
      : `¿Confirma ejecutar la Carga Mensual de Remuneraciones para ${nombreMes} ${anio}?\n\nSe actualizarán automáticamente las 4 tablas en SQL Server y PostgreSQL:\n1. LIC_HISTORICO_PREVISION_ACTUAL\n2. LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL\n3. LIC_FUNCIONARIO\n4. Personal`;

    if (!window.confirm(msgConfirm)) return;

    setProcesando(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('anio', String(anio));
      formData.append('mes', String(mes));
      formData.append('reprocesar', String(reprocesar));

      const res = await fetch('/api/remuneraciones/procesar', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        mostrarAlerta('ok', data.message || 'Carga mensual ejecutada exitosamente');
        await cargarHistorial();
        await ejecutarPrevisualizacion(archivo, anio, mes);
      } else {
        mostrarAlerta('error', data.error || 'Error ejecutando la carga mensual en base de datos');
      }
    } catch {
      mostrarAlerta('error', 'Error de red durante el procesamiento de la carga mensual');
    } finally {
      setProcesando(false);
    }
  };

  const descargarExcel4Hojas = async () => {
    if (!archivo) {
      mostrarAlerta('error', 'Seleccione primero el archivo Excel de Personal');
      return;
    }
    setDescargandoExcel(true);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('anio', String(anio));
      formData.append('mes', String(mes));

      const res = await fetch('/api/remuneraciones/descargar-excel', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        mostrarAlerta('error', errData.error || 'Error generando el archivo Excel');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Formato_Licencias_${MESES_NOMBRES[mes]?.toUpperCase() || mes}_${anio}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      mostrarAlerta('error', 'Error descargando el Excel procesado');
    } finally {
      setDescargandoExcel(false);
    }
  };

  const exportarHistorialExcel = () => {
    if (periodos.length === 0) return;
    exportToExcel(
      periodos.map(p => ({
        'Año': p.Anio,
        'Mes': MESES_NOMBRES[p.Mes] || p.Mes,
        'Registros Renta': p.CantidadRenta,
        'Registros Previsión': p.CantidadPrevision,
        'Total Monto Imponible ($)': p.TotalImponible,
        'Total Desc. Previsión ($)': p.TotalDescPrevision,
        'Total Desc. Salud ($)': p.TotalDescSalud,
        'Total Monto Neto ($)': p.TotalMontoNeto
      })),
      `Historial_Remuneraciones_Cargadas`
    );
  };

  const exportarHistorialPDF = () => {
    if (periodos.length === 0) return;
    exportToCorporatePDF({
      title: 'HISTORIAL DE CARGAS MENSUALES DE REMUNERACIONES Y PREVISIÓN',
      subtitle: 'Control de Períodos Cargados para Cálculo de Subsidios de Licencias Médicas',
      kpis: [
        { label: 'Tabla Personal Actual', value: estadoTablas.totalPersonal.toLocaleString('es-CL'), color: 'blue' },
        { label: 'Funcionarios Vigentes (S)', value: estadoTablas.funcionariosVigentes.toLocaleString('es-CL'), color: 'emerald' },
        { label: 'Históricos Conservados (N)', value: estadoTablas.funcionariosHistoricos.toLocaleString('es-CL'), color: 'indigo' },
        { label: 'Total LIC_FUNCIONARIO', value: estadoTablas.totalFuncionarios.toLocaleString('es-CL'), color: 'slate' }
      ],
      columns: [
        { header: 'Año', key: 'Anio', align: 'center' },
        { header: 'Mes', key: 'MesNombre' },
        { header: 'Reg. Renta', key: 'CantRentaFmt', align: 'right' },
        { header: 'Reg. Previsión', key: 'CantPrevFmt', align: 'right' },
        { header: 'Total Imponible ($)', key: 'ImponibleFmt', align: 'right' },
        { header: 'Desc. Previsión ($)', key: 'DescPrevFmt', align: 'right' },
        { header: 'Desc. Salud ($)', key: 'DescSaludFmt', align: 'right' },
        { header: 'Total Neto ($)', key: 'NetoFmt', align: 'right' }
      ],
      rows: periodos.map(p => ({
        ...p,
        MesNombre: MESES_NOMBRES[p.Mes] || p.Mes,
        CantRentaFmt: p.CantidadRenta.toLocaleString('es-CL'),
        CantPrevFmt: p.CantidadPrevision.toLocaleString('es-CL'),
        ImponibleFmt: formatCurrencyCLP(p.TotalImponible),
        DescPrevFmt: formatCurrencyCLP(p.TotalDescPrevision),
        DescSaludFmt: formatCurrencyCLP(p.TotalDescSalud),
        NetoFmt: formatCurrencyCLP(p.TotalMontoNeto)
      }))
    });
  };

  const ultimoPeriodo = periodos[0];

  return (
    <div className="space-y-6 pb-10">
      {/* Encabezado */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">
            Mantenedor — Carga Mensual de Remuneraciones y Personal
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            Proceso automatizado que reemplaza la macro `Formato Licencias_.xlsm` e impacta `LIC_HISTORICO_PREVISION_ACTUAL`, `LIC_HISTORICO_RENTA_IMPONIBLE_ACTUAL`, `LIC_FUNCIONARIO` y `Personal`.
          </p>
        </div>
        <button
          onClick={cargarHistorial}
          disabled={cargandoHistorial}
          className="px-3.5 py-2 text-xs font-semibold border border-[#cbd5e1] rounded-lg text-[#016098] hover:bg-[#f1f5f9] self-start md:self-auto"
        >
          ↻ Actualizar Estado BD
        </button>
      </div>

      {/* Tarjetas de Estado Actual en Base de Datos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-4">
          <span className="text-xs font-semibold text-[#64748b] block">Último Período en BD</span>
          <span className="text-lg font-bold text-[#016098] mt-1 block">
            {ultimoPeriodo ? `${MESES_NOMBRES[ultimoPeriodo.Mes]} ${ultimoPeriodo.Anio}` : 'Sin registros'}
          </span>
          <span className="text-[11px] text-emerald-700 font-medium">
            {ultimoPeriodo ? `${ultimoPeriodo.CantidadRenta.toLocaleString('es-CL')} remuneraciones registradas` : '-'}
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-4">
          <span className="text-xs font-semibold text-[#64748b] block">Tabla `Personal` (Mes Activo)</span>
          <span className="text-lg font-bold text-[#1e293b] mt-1 block">
            {estadoTablas.totalPersonal.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] text-[#64748b]">Trabajadores en nómina activa (68 cols)</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-4">
          <span className="text-xs font-semibold text-[#64748b] block">`LIC_FUNCIONARIO` Vigentes (`S`)</span>
          <span className="text-lg font-bold text-emerald-700 mt-1 block">
            {estadoTablas.funcionariosVigentes.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] text-[#64748b]">Funcionarios con contrato vigente</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-4">
          <span className="text-xs font-semibold text-[#64748b] block">`LIC_FUNCIONARIO` Total (Vig. + Hist.)</span>
          <span className="text-lg font-bold text-indigo-700 mt-1 block">
            {estadoTablas.totalFuncionarios.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] text-[#64748b]">
            Incluye {estadoTablas.funcionariosHistoricos.toLocaleString('es-CL')} históricos (`vigencia = N`)
          </span>
        </div>
      </div>

      {/* Alertas */}
      {mensaje && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex justify-between items-center ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : mensaje.tipo === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="text-xs font-bold ml-4 opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* PANEL 1: SELECCIÓN DE ARCHIVO Y PERÍODO */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-5">
        <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
          1. Subir Planilla Mensual de Personal (Remuneraciones)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Selector de Archivo */}
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              Archivo Excel de Personal (`.xlsx` enviado por Remuneraciones)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              onChange={handleFileChange}
              className="w-full text-xs text-[#475569] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#016098] file:text-white hover:file:bg-[#014b78] border border-[#cbd5e1] rounded-lg p-1 bg-[#f8fafc]"
            />
          </div>

          {/* Selector de Mes */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Mes de Remuneración</label>
            <select
              value={mes}
              onChange={e => {
                const nuevoMes = parseInt(e.target.value, 10);
                setMes(nuevoMes);
                if (archivo) ejecutarPrevisualizacion(archivo, anio, nuevoMes);
              }}
              className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-bold text-[#016098]"
            >
              {MESES_NOMBRES.slice(1).map((nombre, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {String(idx + 1).padStart(2, '0')} - {nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Año */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Año</label>
            <select
              value={anio}
              onChange={e => {
                const nuevoAnio = parseInt(e.target.value, 10);
                setAnio(nuevoAnio);
                if (archivo) ejecutarPrevisualizacion(archivo, nuevoAnio, mes);
              }}
              className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-bold text-[#016098]"
            >
              {[2024, 2025, 2026, 2027, 2028].map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Botón Validar */}
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => archivo && ejecutarPrevisualizacion(archivo, anio, mes)}
              disabled={!archivo || previsualizando || procesando}
              className="w-full py-2 px-3 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40"
            >
              {previsualizando ? 'Validando...' : '🔍 Re-validar'}
            </button>
          </div>
        </div>

        {/* Opciones de Reproceso y Botones de Ejecución */}
        <div className="pt-2 border-t border-[#f1f5f9] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={reprocesar}
              onChange={e => setReprocesar(e.target.checked)}
              className="rounded border-[#cbd5e1] text-[#016098]"
            />
            <span>
              Permitir reprocesar / sobrescribir si el período{' '}
              <strong className="text-[#016098]">
                {MESES_NOMBRES[mes]} {anio}
              </strong>{' '}
              ya fue cargado anteriormente
            </span>
          </label>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={descargarExcel4Hojas}
              disabled={!archivo || descargandoExcel || procesando}
              className="px-4 py-2.5 bg-[#39BABD] text-white text-xs font-bold rounded-lg hover:bg-[#2da1a4] disabled:opacity-40 shadow-xs"
              title="Genera y descarga un Excel con las 4 hojas (Original, Prevision, Renta, Funcionario) igual que Formato Licencias_.xlsm"
            >
              {descargandoExcel ? 'Generando Excel...' : '📥 Descargar Excel Procesado (4 Hojas)'}
            </button>

            <button
              type="button"
              onClick={ejecutarCargaEnBD}
              disabled={!archivo || !resumenPrev || procesando || previsualizando}
              className="px-5 py-2.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] disabled:opacity-40 shadow-sm"
            >
              {procesando
                ? `Procesando y Cargando 4 Tablas (${MESES_NOMBRES[mes]} ${anio})...`
                : `🚀 Ejecutar Carga Mensual en BD (${MESES_NOMBRES[mes]} ${anio})`}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL 2: PREVISUALIZACIÓN DE LAS 4 TABLAS GENERADAS */}
      {resumenPrev && muestraPrev && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#f1f5f9] pb-3 gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider">
                2. Vista Previa del Procesamiento — {MESES_NOMBRES[resumenPrev.mes]} {resumenPrev.anio}
              </h2>
              <p className="text-xs text-[#64748b]">
                Archivo: <strong>{archivo?.name}</strong> (Hoja leída: `{resumenPrev.hojaOrigen}`)
              </p>
            </div>
            {resumenPrev.periodoYaExiste && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                Período ya registrado en BD ({resumenPrev.cantRentaExistente.toLocaleString('es-CL')} filas) — Modo Reproceso
              </span>
            )}
          </div>

          {/* Tarjetas Resumen de la Simulación */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-sky-50 p-3 rounded-xl border border-sky-200">
              <span className="text-sky-800 block">Vigentes del Mes (`S`)</span>
              <span className="font-bold text-base text-[#016098]">
                {resumenPrev.funcionariosVigentes.toLocaleString('es-CL')}
              </span>
              <span className="block text-[10px] text-sky-700">Previsión, Renta y Personal</span>
            </div>

            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
              <span className="text-indigo-800 block">Históricos Conservados (`N`)</span>
              <span className="font-bold text-base text-indigo-700">
                {resumenPrev.funcionariosHistoricosConservados.toLocaleString('es-CL')}
              </span>
              <span className="block text-[10px] text-indigo-700">Desde `LIC_FUNCIONARIO` actual</span>
            </div>

            <div className="bg-purple-50 p-3 rounded-xl border border-purple-200">
              <span className="text-purple-800 block">Total `LIC_FUNCIONARIO`</span>
              <span className="font-bold text-base text-purple-700">
                {resumenPrev.totalFuncionariosFinal.toLocaleString('es-CL')}
              </span>
              <span className="block text-[10px] text-purple-700">
                {resumenPrev.funcionariosConAfiliacionRescatada.toLocaleString('es-CL')} con `fAfiliacion`
              </span>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-emerald-900 block">Total Renta Imponible</span>
              <span className="font-bold text-sm text-emerald-700">
                {formatCurrencyCLP(resumenPrev.totalMontoImponible)}
              </span>
              <span className="block text-[10px] text-emerald-700">Suma `MontoImponible`</span>
            </div>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
              <span className="text-amber-900 block">Total Cotiz. AFP + Salud</span>
              <span className="font-bold text-sm text-amber-800">
                {formatCurrencyCLP(resumenPrev.totalDescPrevision + resumenPrev.totalDescSalud)}
              </span>
              <span className="block text-[10px] text-amber-700">Previsión + Salud</span>
            </div>

            <div className="bg-teal-50 p-3 rounded-xl border border-teal-200">
              <span className="text-teal-900 block">Total Monto Neto</span>
              <span className="font-bold text-sm text-teal-800">
                {formatCurrencyCLP(resumenPrev.totalMontoNeto)}
              </span>
              <span className="block text-[10px] text-teal-700">Imponible - AFP - Salud</span>
            </div>
          </div>

          {/* Pestañas de Previsualización de las 4 Hojas/Tablas */}
          <div className="flex flex-wrap gap-2 pt-2 border-b border-[#e2e8f0] pb-2">
            {[
              { id: 'renta', label: `1. Hoja Renta (${resumenPrev.totalFilasArchivo.toLocaleString('es-CL')})` },
              { id: 'prevision', label: `2. Hoja Previsión (${resumenPrev.totalFilasArchivo.toLocaleString('es-CL')})` },
              { id: 'funcionario', label: `3. Hoja Funcionario (${resumenPrev.totalFuncionariosFinal.toLocaleString('es-CL')})` },
              { id: 'personal', label: `4. Tabla Personal / Original (${resumenPrev.totalFilasArchivo.toLocaleString('es-CL')})` }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTabMuestra(t.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  tabMuestra === t.id
                    ? 'bg-[#016098] text-white'
                    : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Contenido de la Muestra (Primeras 50 filas) */}
          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[300px]">
            {tabMuestra === 'renta' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                  <tr>
                    <th className="p-2">Año</th>
                    <th className="p-2">Mes</th>
                    <th className="p-2">RUT Funcionario</th>
                    <th className="p-2 text-right">Monto Imponible ($)</th>
                    <th className="p-2 text-right">Desc. Previsión ($)</th>
                    <th className="p-2 text-right">Desc. Salud ($)</th>
                    <th className="p-2 text-right">Monto Neto ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {muestraPrev.renta.map((r, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="p-2">{r.Anio}</td>
                      <td className="p-2">{r.Mes}</td>
                      <td className="p-2 font-bold text-[#016098]">{r.RutFuncionario}</td>
                      <td className="p-2 text-right">{formatCurrencyCLP(r.MontoImponible)}</td>
                      <td className="p-2 text-right">{formatCurrencyCLP(r.descPrevision)}</td>
                      <td className="p-2 text-right">{formatCurrencyCLP(r.descSalud)}</td>
                      <td className="p-2 text-right font-bold text-emerald-700">{formatCurrencyCLP(r.montoNeto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tabMuestra === 'prevision' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                  <tr>
                    <th className="p-2">Año</th>
                    <th className="p-2">Mes</th>
                    <th className="p-2">RUT</th>
                    <th className="p-2 text-right">% Prev.</th>
                    <th className="p-2 text-right">% Adic.</th>
                    <th className="p-2 text-right">% Fijo Salud</th>
                    <th className="p-2 text-right">Monto UF</th>
                    <th className="p-2 text-right">Monto Peso</th>
                    <th className="p-2 text-center">Cód. Prev (E2)</th>
                    <th className="p-2 text-center">Cód. Salud (E1)</th>
                    <th className="p-2 text-center">Días Trab.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {muestraPrev.prevision.map((p, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="p-2">{p.Anio}</td>
                      <td className="p-2">{p.Mes}</td>
                      <td className="p-2 font-bold text-[#016098]">{p.Rut}</td>
                      <td className="p-2 text-right">{p.PorcPrevision}</td>
                      <td className="p-2 text-right">{p.PorcAdicional}</td>
                      <td className="p-2 text-right">{p.PorcFijo}</td>
                      <td className="p-2 text-right">{p.MontoUF}</td>
                      <td className="p-2 text-right">{p.MontoPeso}</td>
                      <td className="p-2 text-center font-semibold">{p.CodPrevision}</td>
                      <td className="p-2 text-center font-semibold">{p.CodSalud}</td>
                      <td className="p-2 text-center">{p.diasTrab}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tabMuestra === 'funcionario' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                  <tr>
                    <th className="p-2">RUT</th>
                    <th className="p-2">Nombre Completo</th>
                    <th className="p-2 text-center">Unidad</th>
                    <th className="p-2 text-center">Contrato</th>
                    <th className="p-2">Planta / Cargo</th>
                    <th className="p-2">Inicio</th>
                    <th className="p-2">Término</th>
                    <th className="p-2 text-center">Salud (E1)</th>
                    <th className="p-2 text-center">Vigencia</th>
                    <th className="p-2">F. Afiliación (Rescatada)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {muestraPrev.funcionario.map((f, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="p-2 font-bold text-[#016098]">
                        {f.Rut}-{f.DV}
                      </td>
                      <td className="p-2">
                        {f.Nombre} {f.Paterno} {f.Materno}
                      </td>
                      <td className="p-2 text-center">{f.CodUnidad}</td>
                      <td className="p-2 text-center">{f.CodContrato}</td>
                      <td className="p-2">{f.descripcionPlanta}</td>
                      <td className="p-2">{formatDateDDMMYYYY(f.FechaInicio)}</td>
                      <td className="p-2">{formatDateDDMMYYYY(f.FechaTermino)}</td>
                      <td className="p-2 text-center">{f.UltimaPrev}</td>
                      <td className="p-2 text-center font-bold text-emerald-700">{f.vigencia}</td>
                      <td className="p-2">{f.fAfiliacion || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tabMuestra === 'personal' && (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                  <tr>
                    <th className="p-2">Sucursal</th>
                    <th className="p-2">Unidad</th>
                    <th className="p-2">RUT</th>
                    <th className="p-2">Trabajador</th>
                    <th className="p-2 text-center">Detalle (1/2/3)</th>
                    <th className="p-2">Cargo</th>
                    <th className="p-2">Inicio</th>
                    <th className="p-2">Término</th>
                    <th className="p-2">AFP (R2)</th>
                    <th className="p-2">Salud (R1)</th>
                    <th className="p-2 text-right">Imponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {muestraPrev.personal.map((p, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="p-2">{p.Sucursal}</td>
                      <td className="p-2">
                        {p.CodUnidad} - {p.NombreUnidad}
                      </td>
                      <td className="p-2 font-bold text-[#016098]">
                        {p.Rut}-{p.DV}
                      </td>
                      <td className="p-2">
                        {p.Nombre} {p.Paterno} {p.Materno}
                      </td>
                      <td className="p-2 text-center font-bold">{p.CodContrato}</td>
                      <td className="p-2">{p.DescripcionCargo}</td>
                      <td className="p-2">{p.Inicio}</td>
                      <td className="p-2">{p.Termino || '-'}</td>
                      <td className="p-2">
                        ({p.CodAFP}) {p.NombreAFP}
                      </td>
                      <td className="p-2">
                        ({p.CodSalud}) {p.NombreSalud}
                      </td>
                      <td className="p-2 text-right font-semibold">{formatCurrencyCLP(p.MontoImponible)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* PANEL 3: HISTORIAL DE PERÍODOS CARGADOS EN BASE DE DATOS */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[#f1f5f9] pb-2">
          <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider">
            3. Historial de Períodos Mensuales Cargados en Base de Datos
          </h2>
          {periodos.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportarHistorialExcel}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
              >
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={exportarHistorialPDF}
                className="px-3 py-1.5 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78]"
              >
                Exportar PDF
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f1f5f9] text-[#475569] font-semibold">
              <tr>
                <th className="p-2.5 text-center">Año</th>
                <th className="p-2.5">Mes</th>
                <th className="p-2.5 text-right">Trabajadores (`Renta`)</th>
                <th className="p-2.5 text-right">Trabajadores (`Previsión`)</th>
                <th className="p-2.5 text-right">Total Monto Imponible ($)</th>
                <th className="p-2.5 text-right">Total Desc. Previsión ($)</th>
                <th className="p-2.5 text-right">Total Desc. Salud ($)</th>
                <th className="p-2.5 text-right">Total Monto Neto ($)</th>
                <th className="p-2.5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {periodos.map(p => (
                <tr key={`${p.Anio}-${p.Mes}`} className="hover:bg-[#f8fafc]">
                  <td className="p-2.5 text-center font-bold text-[#1e293b]">{p.Anio}</td>
                  <td className="p-2.5 font-bold text-[#016098]">
                    {String(p.Mes).padStart(2, '0')} - {MESES_NOMBRES[p.Mes] || p.Mes}
                  </td>
                  <td className="p-2.5 text-right font-semibold">{p.CantidadRenta.toLocaleString('es-CL')}</td>
                  <td className="p-2.5 text-right font-semibold">{p.CantidadPrevision.toLocaleString('es-CL')}</td>
                  <td className="p-2.5 text-right">{formatCurrencyCLP(p.TotalImponible)}</td>
                  <td className="p-2.5 text-right">{formatCurrencyCLP(p.TotalDescPrevision)}</td>
                  <td className="p-2.5 text-right">{formatCurrencyCLP(p.TotalDescSalud)}</td>
                  <td className="p-2.5 text-right font-bold text-emerald-700">
                    {formatCurrencyCLP(p.TotalMontoNeto)}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      CARGADO
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
