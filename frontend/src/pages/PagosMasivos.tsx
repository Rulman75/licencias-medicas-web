import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { exportToExcel, exportToCorporatePDF, formatCurrencyCLP } from '../utils/exportUtils';

interface PagosMasivosProps {
  tabInicial?: 'importar' | 'auditar' | 'eliminar' | 'aut_pago';
}

export default function PagosMasivos({ tabInicial = 'importar' }: PagosMasivosProps) {
  const [tabActiva, setTabActiva] = useState<'importar' | 'auditar' | 'eliminar' | 'aut_pago'>(tabInicial);

  useEffect(() => {
    setTabActiva(tabInicial);
  }, [tabInicial]);

  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  // Listas de dominio (Bancos, Observaciones de cargas previas, última importación)
  const [bancos, setBancos] = useState<string[]>([]);
  const [observacionesCarga, setObservacionesCarga] = useState<any[]>([]);
  const [ultimaImportacion, setUltimaImportacion] = useState<any[]>([]);

  // --- ESTADO TAB 1: IMPORTAR PAGOS ---
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [registrosPreview, setRegistrosPreview] = useState<any[]>([]);
  const [resumenPreview, setResumenPreview] = useState<{
    totalLeidos: number;
    totalValidos: number;
    totalNoEncontrados: number;
    totalPasanAAutorizada?: number;
    montoTotalValidos: number;
  } | null>(null);
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'validos' | 'no_encontrados' | 'pasan_aut'>('todos');
  const [resultadoProceso, setResultadoProceso] = useState<{
    leidos: number;
    insertados: number;
    licenciasNoEncontradas: string[];
    licenciasAutorizadasPorPago: any[];
  } | null>(null);

  // --- ESTADO TAB 4: REPORTE AUTORIZADAS POR PAGO INST. SALUD ---
  const [anioAutPago, setAnioAutPago] = useState<string>('');
  const [registrosAutPago, setRegistrosAutPago] = useState<any[]>([]);
  const [cargandoAutPago, setCargandoAutPago] = useState(false);

  // --- ESTADO TAB 2: AUDITAR PAGOS ---
  const [auditNumDoc, setAuditNumDoc] = useState('');
  const [auditBanco, setAuditBanco] = useState('');
  const [auditArea, setAuditArea] = useState('Todos'); // Todos | Educacion | Salud
  const [auditObservacion, setAuditObservacion] = useState('');
  const [auditSoloDescuentos, setAuditSoloDescuentos] = useState(false);
  const [registrosAuditoria, setRegistrosAuditoria] = useState<any[]>([]);
  const [resumenAuditoria, setResumenAuditoria] = useState<{
    totalRegistros: number;
    totalMonto: number;
    totalDiasPagados: number;
    totalPagoEstimado: number;
    totalDescuento: number;
  } | null>(null);

  // --- ESTADO TAB 3: ELIMINAR PAGO MASIVO ---
  const [elimObservacion, setElimObservacion] = useState('');
  const [elimNumDoc, setElimNumDoc] = useState('');
  const [elimBanco, setElimBanco] = useState('');
  const [modoElimActivo, setModoElimActivo] = useState<'observacion' | 'documento'>('observacion');
  const [registrosEliminar, setRegistrosEliminar] = useState<any[]>([]);
  const [montoTotalEliminar, setMontoTotalEliminar] = useState<number>(0);

  useEffect(() => {
    cargarFiltros();
  }, []);

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'info', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => {
      setMensaje(prev => (prev?.texto === texto ? null : prev));
    }, 7000);
  };

  const formatDateDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return '';
    const clean = String(isoDate).split('T')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  const cargarFiltros = async () => {
    try {
      const res = await fetch('/api/pagos-masivos/filtros');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setBancos(data.bancos || []);
        setObservacionesCarga(data.observaciones || []);
        setUltimaImportacion(data.ultimaImportacion || []);
        if (data.bancos?.length > 0) {
          if (!auditBanco) setAuditBanco(data.bancos[0]);
          if (!elimBanco) setElimBanco(data.bancos[0]);
        }
        if (data.observaciones?.length > 0 && !elimObservacion) {
          setElimObservacion(data.observaciones[0].Observacion);
        }
      }
    } catch (e) {
      console.error('Error cargando filtros de pagos masivos:', e);
    }
  };

  // =========================================================================
  // LÓGICA TAB 1: IMPORTAR ARCHIVO CSV / EXCEL
  // =========================================================================
  const normalizarCeldaFecha = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' && val > 20000 && val < 90000) {
      // Serial de fecha Excel
      const utcDays = Math.floor(val - 25569);
      const dt = new Date(utcDays * 86400 * 1000);
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dt.getUTCFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
    return String(val).trim();
  };

  const mapearFilasAColumnas = (rawRows: any[][]) => {
    const mapped: any[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;
      const firstCell = String(row[0] ?? '').trim();
      if (!firstCell) continue;

      // Saltar fila de encabezado si existe
      if (
        i === 0 &&
        (firstCell.toLowerCase().includes('licencia') ||
          firstCell.toLowerCase().includes('col1') ||
          firstCell.toLowerCase() === 'n° lic')
      ) {
        continue;
      }

      // En el sistema legacy:
      // Si el archivo viene con 13 columnas (separadas por ;):
      // col1: N° Lic, col2: (vacío/aux), col3: N° Doc, col4: FechaDep, col5: DiasPag, col6: Desde, col7: Hasta, col8: Monto, col9: Observacion, col10: FechaRecep, col11: Concepto, col12: Banco, col13: Cenco
      // Si el usuario sube un Excel de 12 columnas (sin la col2 vacía), lo detectamos automáticamente
      if (row.length >= 13) {
        mapped.push({
          col1: String(row[0] ?? '').trim(),
          col2: String(row[1] ?? '').trim(),
          col3: String(row[2] ?? '').trim(),
          col4: normalizarCeldaFecha(row[3]),
          col5: String(row[4] ?? '0').trim(),
          col6: normalizarCeldaFecha(row[5]),
          col7: normalizarCeldaFecha(row[6]),
          col8: String(row[7] ?? '0').trim(),
          col9: String(row[8] ?? '').trim(),
          col10: normalizarCeldaFecha(row[9]),
          col11: String(row[10] ?? '').trim(),
          col12: String(row[11] ?? '').trim(),
          col13: String(row[12] ?? '').trim()
        });
      } else if (row.length === 12) {
        mapped.push({
          col1: String(row[0] ?? '').trim(),
          col2: '',
          col3: String(row[1] ?? '').trim(),
          col4: normalizarCeldaFecha(row[2]),
          col5: String(row[3] ?? '0').trim(),
          col6: normalizarCeldaFecha(row[4]),
          col7: normalizarCeldaFecha(row[5]),
          col8: String(row[6] ?? '0').trim(),
          col9: String(row[7] ?? '').trim(),
          col10: normalizarCeldaFecha(row[8]),
          col11: String(row[9] ?? '').trim(),
          col12: String(row[10] ?? '').trim(),
          col13: String(row[11] ?? '').trim()
        });
      }
    }
    return mapped;
  };

  const handleSeleccionarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    setResultadoProceso(null);
    setCargando(true);

    try {
      let filasCrudas: any[][] = [];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        filasCrudas = lines.map(line => (line.includes(';') ? line.split(';') : line.split(',')));
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        filasCrudas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      }

      const registrosMapeados = mapearFilasAColumnas(filasCrudas);
      if (registrosMapeados.length === 0) {
        mostrarAlerta(
          'error',
          'No se encontraron filas válidas en el archivo. Verifique que tenga las 12 o 13 columnas del formato de pagos.'
        );
        setCargando(false);
        return;
      }

      const res = await fetch('/api/pagos-masivos/previsualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registros: registrosMapeados })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosPreview(data.registros || []);
        setResumenPreview(data.resumen);
        mostrarAlerta(
          'info',
          `Archivo analizado: ${data.resumen.totalLeidos} leídos (${data.resumen.totalValidos} licencias existentes, ${data.resumen.totalNoEncontrados} no ingresadas)`
        );
      } else {
        mostrarAlerta('error', data.error || 'Error al previsualizar archivo');
      }
    } catch (err) {
      mostrarAlerta('error', 'Error leyendo el archivo seleccionado');
    } finally {
      setCargando(false);
    }
  };

  const ejecutarCargaMasiva = async () => {
    if (registrosPreview.length === 0) {
      mostrarAlerta('error', 'Primero seleccione un archivo válido para cargar');
      return;
    }
    if (
      !window.confirm(
        `¿Confirmar la carga masiva de pagos?\n\nTotal leídos: ${resumenPreview?.totalLeidos}\nSe insertarán en LIC_DETALLE_PAGO_ACTUAL: ${resumenPreview?.totalValidos} registros.`
      )
    ) {
      return;
    }

    setCargando(true);
    try {
      const res = await fetch('/api/pagos-masivos/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registros: registrosPreview })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setResultadoProceso({
          leidos: data.leidos,
          insertados: data.insertados,
          licenciasNoEncontradas: data.licenciasNoEncontradas || [],
          licenciasAutorizadasPorPago: data.licenciasAutorizadasPorPago || []
        });
        mostrarAlerta('ok', data.message);
        await cargarFiltros();
      } else {
        mostrarAlerta('error', data.error || 'Error ejecutando la carga masiva');
      }
    } catch {
      mostrarAlerta('error', 'Error de red durante la carga masiva');
    } finally {
      setCargando(false);
    }
  };

  const exportarPreviewExcel = (soloNoEncontradas = false) => {
    const lista = soloNoEncontradas
      ? registrosPreview.filter(r => !r.existeLicencia)
      : registrosPreview;
    if (lista.length === 0) return;

    const rows = lista.map(r => ({
      'Fila': r.fila,
      'Estado Licencia': r.existeLicencia ? 'EXISTE' : 'NO INGRESADA',
      'N° Licencia': r.col1,
      'RUT Funcionario': r.rutFuncionario,
      'Nombre Funcionario': r.nombreFuncionario,
      'N° Doc': r.col3,
      'Fecha Dep. CtaCte': r.col4,
      'Días Pagados': Number(r.col5 || 0),
      'Desde': r.col6,
      'Hasta': r.col7,
      'Monto Pagado ($)': Number(r.col8 || 0),
      'Observación': r.col9,
      'Fecha Recepción': r.col10,
      'Concepto': r.col11,
      'Banco': r.col12,
      'Cenco': r.col13
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Previsualizacion_Pagos');
    XLSX.writeFile(
      wb,
      soloNoEncontradas ? `Licencias_No_Ingresadas_${nombreArchivo}.xlsx` : `Previsualizacion_${nombreArchivo}.xlsx`
    );
  };

  // =========================================================================
  // LÓGICA TAB 2: AUDITAR PAGOS MASIVOS
  // =========================================================================
  const ejecutarAuditoria = async (forzarDescuentos?: boolean) => {
    const descFlag = forzarDescuentos !== undefined ? forzarDescuentos : auditSoloDescuentos;
    if (forzarDescuentos !== undefined) setAuditSoloDescuentos(forzarDescuentos);

    if (!auditNumDoc.trim() && !auditObservacion.trim()) {
      mostrarAlerta('error', 'Ingrese un N° de Documento o seleccione una Observación de Carga para auditar');
      return;
    }

    setCargando(true);
    try {
      const params = new URLSearchParams({
        numeroDocumento: auditNumDoc.trim(),
        banco: auditBanco,
        area: auditArea,
        observacion: auditObservacion,
        soloDescuentos: String(descFlag)
      });
      const res = await fetch(`/api/pagos-masivos/auditar?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosAuditoria(data.registros || []);
        setResumenAuditoria(data.resumen);
        if (data.registros.length === 0) {
          mostrarAlerta('info', 'No se encontraron pagos con los criterios seleccionados');
        }
      } else {
        mostrarAlerta('error', data.error || 'Error ejecutando auditoría');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión al auditar pagos');
    } finally {
      setCargando(false);
    }
  };

  const exportarAuditoriaExcel = () => {
    if (registrosAuditoria.length === 0) return;
    const rows = registrosAuditoria.map(r => ({
      'Correlativo': r.Correlativo,
      'RUT': r.Rut ? `${r.Rut}-${r.DV}` : '',
      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
      'Sector': r.Sector,
      'Cenco': r.CodUnidad,
      'Planta': r.DescripcionPlanta,
      'Unidad SEP/PIE': r.DesUnidadSepPie || '',
      'N° Licencia': r.NumeroLicencia,
      'Desde': formatDateDDMMYYYY(r.Desde),
      'Hasta': formatDateDDMMYYYY(r.Hasta),
      'Días Lic.': r.NumDias,
      'Días Aut.': r.DiasAutorizados,
      'Días Pagados': r.DiasPagados,
      'Monto Pagado ($)': r.Monto,
      'Pago Estimado ($)': r.PagoEstimado,
      'Monto Descuento ($)': r.MontoDesc,
      'Concepto': r.Concepto,
      'N° Documento': r.NumeroDocumento,
      'Banco': r.Banco,
      'Fecha Dep. CtaCte': formatDateDDMMYYYY(r.FechaDepCtaCte),
      'Salud': r.SaludDescripcion,
      'Previsión': r.PrevisionR2,
      'Modalidad': r.PagoDirecto,
      'Tipo Lic.': r.TipoLic,
      'Rechazo': r.Rechazo ? 'SI' : 'NO',
      'Observación Pago': r.ObservacionPago,
      'Obs. Apelación': r.ObserApelacion
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Pagos');
    XLSX.writeFile(wb, `Auditoria_Pagos_${auditNumDoc || auditObservacion || 'Reporte'}.xlsx`);
  };

  // =========================================================================
  // LÓGICA TAB 3: ELIMINAR PAGO MASIVO
  // =========================================================================
  const buscarPagosParaEliminar = async (modo: 'observacion' | 'documento') => {
    setModoElimActivo(modo);
    setCargando(true);
    try {
      const params = new URLSearchParams({
        modo,
        observacion: elimObservacion,
        numeroDocumento: elimNumDoc.trim(),
        banco: elimBanco
      });
      const res = await fetch(`/api/pagos-masivos/eliminar/buscar?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosEliminar(data.registros || []);
        setMontoTotalEliminar(data.totalMonto || 0);
        if (data.registros.length === 0) {
          mostrarAlerta('info', 'No se encontraron pagos registrados para ese criterio');
        } else {
          mostrarAlerta(
            'info',
            `Se encontraron ${data.cantidad} pagos por un total de $${Number(data.totalMonto || 0).toLocaleString('es-CL')}`
          );
        }
      } else {
        mostrarAlerta('error', data.error || 'Error buscando pagos');
      }
    } catch {
      mostrarAlerta('error', 'Error de red buscando pagos');
    } finally {
      setCargando(false);
    }
  };

  const ejecutarEliminacionMasiva = async (modo: 'observacion' | 'documento') => {
    const etiqueta =
      modo === 'observacion'
        ? `Observación "${elimObservacion}"`
        : `Documento #${elimNumDoc.trim()} (${elimBanco})`;

    if (
      !window.confirm(
        `¿Está completamente seguro de ELIMINAR todos los pagos asociados a ${etiqueta}?\n\nEsta acción eliminará los registros de LIC_DETALLE_PAGO_ACTUAL.`
      )
    ) {
      return;
    }

    setCargando(true);
    try {
      const res = await fetch('/api/pagos-masivos/eliminar', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo,
          observacion: elimObservacion,
          numeroDocumento: elimNumDoc.trim(),
          banco: elimBanco
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        mostrarAlerta('ok', data.message);
        setRegistrosEliminar([]);
        setMontoTotalEliminar(0);
        await cargarFiltros();
      } else {
        mostrarAlerta('error', data.error || 'Error al eliminar pagos');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión al eliminar pagos masivos');
    } finally {
      setCargando(false);
    }
  };

  const exportarEliminacionExcel = () => {
    if (registrosEliminar.length === 0) return;
    const rows = registrosEliminar.map(r => ({
      'Correlativo': r.Correlativo,
      'N° Licencia': r.NumeroLicencia,
      'RUT': r.RutFuncionario,
      'Funcionario': r.NombreFuncionario,
      'Desde': formatDateDDMMYYYY(r.Desde),
      'Hasta': formatDateDDMMYYYY(r.Hasta),
      'N° Doc': r.NumeroDocumento,
      'Banco': r.Banco,
      'Fecha Dep. CtaCte': formatDateDDMMYYYY(r.FechaDepCtaCte),
      'Días Pagados': r.DiasPagados,
      'Monto ($)': r.Monto,
      'Concepto': r.Concepto,
      'Observación': r.Observacion
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Respaldo_Pagos');
    XLSX.writeFile(wb, `Respaldo_Antes_Eliminar_${elimObservacion || elimNumDoc}.xlsx`);
  };

  const cargarReporteAutorizadasPorPago = async (yearParam = anioAutPago) => {
    setCargandoAutPago(true);
    try {
      const q = yearParam ? `?year=${encodeURIComponent(yearParam)}` : '';
      const res = await fetch(`/api/pagos-masivos/autorizadas-por-pago${q}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosAutPago(data.registros || []);
      } else {
        mostrarAlerta('error', data.error || 'Error obteniendo reporte de licencias autorizadas por pago');
      }
    } catch {
      mostrarAlerta('error', 'Error de red cargando reporte');
    } finally {
      setCargandoAutPago(false);
    }
  };

  const exportarAutorizadasPorPagoExcel = (lista: any[], sufijo = 'Historico') => {
    if (!lista || lista.length === 0) return;
    const rows = lista.map((r: any) => ({
      'N° Licencia': r.NumeroLicencia,
      'RUT': r.Rut || r.RutFuncionario || '',
      'DV': r.DV || '',
      'Funcionario': r.Funcionario || r.NombreFuncionario || '',
      'Sector': r.Sector || '',
      'Establecimiento': r.Establecimiento || '',
      'Inst. de Salud': r.Salud || '',
      'Desde': formatDateDDMMYYYY(r.Desde),
      'Hasta': formatDateDDMMYYYY(r.Hasta),
      'Días': Number(r.NumDias || 0),
      'Pago Estimado ($)': Number(r.PagoEstimado || 0),
      'Monto Descuento ($)': Number(r.MontoDesc || 0),
      'Pagado Subsidio ($)': Number(r.MontoSubsidio ?? r.MontoPago ?? 0),
      'Pagado Aporte ($)': Number(r.MontoAporte ?? 0),
      'Total Pagado Salud ($)': Number(r.MontoSaludTotal ?? r.MontoPago ?? 0),
      'Último Pago Salud': formatDateDDMMYYYY(r.UltimoPagoSalud || r.FechaDepCtaCte || ''),
      'Estado': r.Estado || 'AUT_PAGO_SALUD',
      'Observación COMPIN': r.Observacion_Compin || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Autorizadas_Por_Pago_Salud');
    XLSX.writeFile(wb, `Reporte_Licencias_Autorizadas_Por_Pago_Salud_${sufijo}.xlsx`);
  };

  const registrosPreviewFiltrados = registrosPreview.filter(r => {
    if (filtroPreview === 'validos') return r.existeLicencia;
    if (filtroPreview === 'no_encontrados') return !r.existeLicencia;
    if (filtroPreview === 'pasan_aut') return Boolean(r.pasaAAutorizada);
    return true;
  });

  return (
    <div className="space-y-6 pb-10">
      {/* Encabezado y Pestañas */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">Módulo de Pagos Masivos</h1>
          <p className="text-xs text-[#64748b] mt-1">
            Importación masiva de pagos desde archivo CSV/Excel, Auditoría por Documento/Área y Eliminación Masiva controlada
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex flex-wrap gap-2 bg-[#f1f5f9] p-1.5 rounded-xl">
          <button
            onClick={() => setTabActiva('importar')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'importar'
                ? 'bg-[#016098] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#016098]'
            }`}
          >
            Importar Pagos Masivos
          </button>
          <button
            onClick={() => setTabActiva('auditar')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'auditar'
                ? 'bg-[#016098] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#016098]'
            }`}
          >
            Auditar Pagos Masivos
          </button>
          <button
            onClick={() => setTabActiva('eliminar')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'eliminar'
                ? 'bg-[#EB567F] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#EB567F]'
            }`}
          >
            Eliminar Pago Masivo
          </button>
          <button
            onClick={() => {
              setTabActiva('aut_pago');
              if (registrosAutPago.length === 0) cargarReporteAutorizadasPorPago(anioAutPago);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'aut_pago'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            Autorizadas por Pago Inst. Salud
          </button>
        </div>
      </div>

      {/* Barra de Alertas */}
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

      {/* =====================================================================
          PESTAÑA 1: IMPORTAR PAGOS MASIVOS (Frm_importar_pagos.vb)
      ===================================================================== */}
      {tabActiva === 'importar' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
              Carga de Archivo de Pagos Masivos (`.csv` separado por `;` o `.xlsx` / `.xls`)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0]">
              <div className="md:col-span-7">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Seleccione Archivo desde su equipo (No requiere copiar a `C:\pagos\` en el servidor)
                </label>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={handleSeleccionarArchivo}
                  className="block w-full text-xs text-[#475569] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#016098] file:text-white hover:file:bg-[#014b78] cursor-pointer"
                />
              </div>

              <div className="md:col-span-5 flex flex-wrap gap-2 justify-end">
                {registrosPreview.length > 0 && (
                  <>
                    <button
                      onClick={() => exportarPreviewExcel(false)}
                      className="px-3.5 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                    >
                      Exportar Previsualización
                    </button>
                    <button
                      onClick={ejecutarCargaMasiva}
                      disabled={cargando || (resumenPreview?.totalValidos || 0) === 0}
                      className="px-5 py-2.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] shadow-sm disabled:opacity-50"
                    >
                      {cargando ? 'Procesando...' : `Confirmar e Insertar (${resumenPreview?.totalValidos || 0} Pagos)`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tarjetas de Resumen de Previsualización */}
            {resumenPreview && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
                <div
                  onClick={() => setFiltroPreview('todos')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    filtroPreview === 'todos' ? 'bg-slate-100 border-slate-400' : 'bg-[#f8fafc] border-[#e2e8f0]'
                  }`}
                >
                  <span className="text-xs text-[#64748b] block">Total Registros Leídos</span>
                  <span className="text-xl font-bold text-[#1e293b]">{resumenPreview.totalLeidos}</span>
                </div>

                <div
                  onClick={() => setFiltroPreview('validos')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    filtroPreview === 'validos'
                      ? 'bg-emerald-100 border-emerald-400'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <span className="text-xs text-emerald-800 block">Licencias Válidas (Se Insertarán)</span>
                  <span className="text-xl font-bold text-emerald-700">{resumenPreview.totalValidos}</span>
                </div>

                <div
                  onClick={() => setFiltroPreview('pasan_aut')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    filtroPreview === 'pasan_aut'
                      ? 'bg-amber-100 border-amber-400'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <span className="text-xs text-amber-900 block">Rechazadas → Pasan a Autorizadas</span>
                  <span className="text-xl font-bold text-amber-800">{resumenPreview.totalPasanAAutorizada || 0}</span>
                </div>

                <div
                  onClick={() => setFiltroPreview('no_encontrados')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    filtroPreview === 'no_encontrados'
                      ? 'bg-rose-100 border-rose-400'
                      : 'bg-rose-50 border-rose-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-rose-800 block">Licencias No Ingresadas</span>
                      <span className="text-xl font-bold text-rose-700">{resumenPreview.totalNoEncontrados}</span>
                    </div>
                    {resumenPreview.totalNoEncontrados > 0 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          exportarPreviewExcel(true);
                        }}
                        className="px-2 py-1 bg-rose-700 text-white text-[10px] font-bold rounded hover:bg-rose-800"
                      >
                        Descargar Excel
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-sky-50 border-sky-200">
                  <span className="text-xs text-sky-900 block">Monto Total Válido ($)</span>
                  <span className="text-xl font-bold text-[#016098]">
                    ${Number(resumenPreview.montoTotalValidos || 0).toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            )}

            {/* Resultado post-ejecución */}
            {resultadoProceso && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
                <div className="font-bold text-sm">
                  Proceso Terminado — Leídos: {resultadoProceso.leidos} | Insertados: {resultadoProceso.insertados}
                </div>
                {resultadoProceso.licenciasNoEncontradas.length > 0 && (
                  <div className="text-rose-700 font-semibold">
                    Licencias omitidas por no estar ingresadas en LIC_LICENCIA_ACTUAL (
                    {resultadoProceso.licenciasNoEncontradas.length}):{' '}
                    {resultadoProceso.licenciasNoEncontradas.join(', ')}
                  </div>
                )}
                {resultadoProceso.licenciasAutorizadasPorPago?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <span className="font-bold block text-amber-900">
                        ⚡ {resultadoProceso.licenciasAutorizadasPorPago.length} licencia(s) figuraban como Rechazadas y pasaron automáticamente a AUTORIZADAS (`AUT_PAGO_SALUD`) por recibo de pago de Inst. de Salud:
                      </span>
                      <span className="text-[11px] text-amber-800">
                        {resultadoProceso.licenciasAutorizadasPorPago.map((l: any) => l.NumeroLicencia).join(', ')}
                      </span>
                    </div>
                    <button
                      onClick={() => exportarAutorizadasPorPagoExcel(resultadoProceso.licenciasAutorizadasPorPago, 'Lote_Actual')}
                      className="px-3 py-1.5 bg-amber-700 text-white text-xs font-bold rounded-lg hover:bg-amber-800 whitespace-nowrap"
                    >
                      📥 Exportar Reporte Excel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tabla de Previsualización o Último Lote en Importar_Pago */}
            <div>
              <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                <h3 className="text-xs font-bold text-[#475569] uppercase">
                  {registrosPreview.length > 0
                    ? `Previsualización del Archivo "${nombreArchivo}" (${registrosPreviewFiltrados.length} filas)`
                    : `Último Lote Cargado en Tabla Importar_Pago (${ultimaImportacion.length} registros)`}
                </h3>
                {(registrosPreview.length > 0 ? registrosPreviewFiltrados : ultimaImportacion).length > 0 && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const rowsSrc = registrosPreview.length > 0 ? registrosPreviewFiltrados : ultimaImportacion;
                        exportToExcel(
                          rowsSrc.map(r => ({
                            'N° Licencia': r.col1,
                            'N° Transferencia / Doc.': r.col3,
                            'Fecha DepCta': r.col4,
                            'Días Pagados': r.col5,
                            'Desde': r.col6,
                            'Hasta': r.col7,
                            'Monto Pagado ($)': r.col8,
                            'Observación': r.col9,
                            'Fecha Recepción': r.col10,
                            'Concepto': r.col11,
                            'Banco': r.col12,
                            'Cenco': r.col13
                          })),
                          registrosPreview.length > 0 ? `Previsualizacion_${nombreArchivo}` : 'Ultimo_Lote_Importado'
                        );
                      }}
                      className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                    >
                      Exportar Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const rowsSrc = registrosPreview.length > 0 ? registrosPreviewFiltrados : ultimaImportacion;
                        const totM = rowsSrc.reduce(
                          (acc, r) => acc + Number(String(r.col8 || '0').replace(/\./g, '') || 0),
                          0
                        );
                        exportToCorporatePDF({
                          title:
                            registrosPreview.length > 0
                              ? `PREVISUALIZACIÓN DE CARGA MASIVA DE PAGOS — ${nombreArchivo}`
                              : 'ÚLTIMO LOTE CARGADO EN TABLA IMPORTAR_PAGO',
                          columns: [
                            { header: 'N° Licencia', key: 'col1' },
                            { header: 'N° Transf.', key: 'col3' },
                            { header: 'Fecha Dep.', key: 'col4', align: 'center' },
                            { header: 'Días Pag.', key: 'col5', align: 'center' },
                            { header: 'Desde', key: 'col6', align: 'center' },
                            { header: 'Hasta', key: 'col7', align: 'center' },
                            { header: 'Monto Pag.', key: 'MontoFmt', align: 'right' },
                            { header: 'Observación', key: 'col9' },
                            { header: 'Concepto', key: 'col11' },
                            { header: 'Banco', key: 'col12' }
                          ],
                          rows: rowsSrc.map(r => ({
                            ...r,
                            MontoFmt: formatCurrencyCLP(String(r.col8 || '0').replace(/\./g, ''))
                          })),
                          totalsRow: {
                            col1: 'TOTAL',
                            MontoFmt: formatCurrencyCLP(totM)
                          }
                        });
                      }}
                      className="px-3 py-1 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                    >
                      Exportar PDF
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                    <tr>
                      {registrosPreview.length > 0 && <th className="p-2.5">Estado</th>}
                      <th className="p-2.5">N° Lic</th>
                      {registrosPreview.length > 0 && <th className="p-2.5">Funcionario</th>}
                      <th className="p-2.5">N° Doc</th>
                      <th className="p-2.5">Fecha DepCta</th>
                      <th className="p-2.5 text-center">Días Pag</th>
                      <th className="p-2.5">Desde</th>
                      <th className="p-2.5">Hasta</th>
                      <th className="p-2.5 text-right">Monto Pag</th>
                      <th className="p-2.5">Observación</th>
                      <th className="p-2.5">Fecha Recep</th>
                      <th className="p-2.5">Concepto</th>
                      <th className="p-2.5">Banco</th>
                      <th className="p-2.5">Cenco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {(registrosPreview.length > 0 ? registrosPreviewFiltrados : ultimaImportacion).map((r, i) => (
                      <tr
                        key={i}
                        className={
                          registrosPreview.length > 0 && !r.existeLicencia
                            ? 'bg-rose-50/70 hover:bg-rose-100/70'
                            : r.pasaAAutorizada
                            ? 'bg-amber-50/70 hover:bg-amber-100/70'
                            : 'hover:bg-[#f8fafc]'
                        }
                      >
                        {registrosPreview.length > 0 && (
                          <td className="p-2.5">
                            {r.existeLicencia ? (
                              <div className="flex flex-wrap gap-1 items-center">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                  OK
                                </span>
                                {r.pasaAAutorizada && (
                                  <span
                                    className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-bold text-[10px]"
                                    title="Figuraba como Rechazada y pasará automáticamente a Autorizada al insertar este pago de Subsidio/Aporte"
                                  >
                                    RECHAZADA → PASARÁ A AUT.
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">
                                NO EXISTE LIC.
                              </span>
                            )}
                          </td>
                        )}
                        <td className="p-2.5 font-bold text-[#016098]">{r.col1}</td>
                        {registrosPreview.length > 0 && (
                          <td className="p-2.5 truncate max-w-[180px]" title={r.nombreFuncionario}>
                            {r.existeLicencia ? `${r.nombreFuncionario} (${r.rutFuncionario})` : 'No registrada'}
                          </td>
                        )}
                        <td className="p-2.5 font-semibold">{r.col3}</td>
                        <td className="p-2.5">{r.col4}</td>
                        <td className="p-2.5 text-center">{r.col5}</td>
                        <td className="p-2.5">{r.col6}</td>
                        <td className="p-2.5">{r.col7}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          ${Number(String(r.col8 || '0').replace(/\./g, '') || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5">{r.col9}</td>
                        <td className="p-2.5">{r.col10}</td>
                        <td className="p-2.5">{r.col11}</td>
                        <td className="p-2.5">{r.col12}</td>
                        <td className="p-2.5">{r.col13}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: AUDITAR PAGOS MASIVOS (AuditarPagos.vb)
      ===================================================================== */}
      {tabActiva === 'auditar' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
              Auditoría de Pagos por Documento, Banco, Sector u Observación de Carga
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">N° Documento</label>
                <input
                  type="text"
                  value={auditNumDoc}
                  onChange={e => setAuditNumDoc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && ejecutarAuditoria(false)}
                  placeholder="Ej: 3112026"
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Banco</label>
                <select
                  value={auditBanco}
                  onChange={e => setAuditBanco(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                >
                  <option value="">(Todos los Bancos)</option>
                  {bancos.map(b => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Área / Sector</label>
                <select
                  value={auditArea}
                  onChange={e => setAuditArea(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                >
                  <option value="Todos">Todos</option>
                  <option value="Educacion">Educacion</option>
                  <option value="Salud">Salud</option>
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  O Filtrar por Observación de Carga
                </label>
                <select
                  value={auditObservacion}
                  onChange={e => setAuditObservacion(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                >
                  <option value="">(Cualquier Observación)</option>
                  {observacionesCarga.map((o, idx) => (
                    <option key={idx} value={o.Observacion}>
                      {o.Observacion} ({o.Cantidad} reg.)
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3 flex flex-wrap gap-2">
                <button
                  onClick={() => ejecutarAuditoria(false)}
                  disabled={cargando}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Buscar
                </button>
                <button
                  onClick={() => ejecutarAuditoria(true)}
                  disabled={cargando}
                  className="px-3.5 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700"
                >
                  Descuentos
                </button>
                {registrosAuditoria.length > 0 && (
                  <>
                    <button
                      onClick={exportarAuditoriaExcel}
                      className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                    >
                      Excel
                    </button>
                    <button
                      onClick={() => {
                        const totM = registrosAuditoria.reduce((a, r) => a + Number(r.Monto || 0), 0);
                        const totEst = registrosAuditoria.reduce((a, r) => a + Number(r.PagoEstimado || 0), 0);
                        exportToCorporatePDF({
                          title: 'REPORTE DE AUDITORÍA DE PAGOS MASIVOS',
                          subtitle: `Filtro: ${auditNumDoc ? `Transf. #${auditNumDoc}` : ''} ${auditObservacion || ''} — Sector: ${auditArea}`,
                          kpis: resumenAuditoria
                            ? [
                                { label: 'Registros Auditados', value: resumenAuditoria.totalRegistros, color: 'blue' },
                                { label: 'Total Monto Pagado', value: formatCurrencyCLP(resumenAuditoria.totalMonto), color: 'emerald' },
                                { label: 'Total Días Pagados', value: resumenAuditoria.totalDiasPagados, color: 'slate' },
                                { label: 'Pago Estimado Acum.', value: formatCurrencyCLP(resumenAuditoria.totalPagoEstimado), color: 'indigo' }
                              ]
                            : undefined,
                          columns: [
                            { header: 'RUT', key: 'RutFmt' },
                            { header: 'Funcionario', key: 'NombreFmt' },
                            { header: 'Sector / Cenco', key: 'SectorFmt' },
                            { header: 'N° Licencia', key: 'NumeroLicencia' },
                            { header: 'Desde / Hasta', key: 'PeriodoFmt', align: 'center' },
                            { header: 'Días Lic/Pag', key: 'DiasFmt', align: 'center' },
                            { header: 'Concepto', key: 'Concepto' },
                            { header: 'Monto Pag.', key: 'MontoFmt', align: 'right' },
                            { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' },
                            { header: 'Transf. / Banco', key: 'DocFmt' }
                          ],
                          rows: registrosAuditoria.map(r => ({
                            RutFmt: r.Rut ? `${r.Rut}-${r.DV}` : '-',
                            NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim() || '-',
                            SectorFmt: `${r.Sector} (${r.CodUnidad})`,
                            NumeroLicencia: r.NumeroLicencia,
                            PeriodoFmt: `${formatDateDDMMYYYY(r.Desde)} al ${formatDateDDMMYYYY(r.Hasta)}`,
                            DiasFmt: `${r.NumDias} / ${r.DiasPagados}`,
                            Concepto: r.Concepto,
                            MontoFmt: formatCurrencyCLP(r.Monto),
                            EstimadoFmt: formatCurrencyCLP(r.PagoEstimado),
                            DocFmt: `#${r.NumeroDocumento} (${r.Banco})`
                          })),
                          totalsRow: {
                            RutFmt: 'TOTAL',
                            MontoFmt: formatCurrencyCLP(totM),
                            EstimadoFmt: formatCurrencyCLP(totEst)
                          }
                        });
                      }}
                      className="px-3.5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                    >
                      PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tarjetas Resumen Auditoría */}
            {resumenAuditoria && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0]">
                  <span className="text-[11px] text-[#64748b] block">Registros Auditados</span>
                  <span className="text-lg font-bold text-[#1e293b]">{resumenAuditoria.totalRegistros}</span>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                  <span className="text-[11px] text-emerald-800 block">Total Monto Pagado ($)</span>
                  <span className="text-lg font-bold text-emerald-700">
                    ${resumenAuditoria.totalMonto.toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="bg-sky-50 p-3.5 rounded-xl border border-sky-200">
                  <span className="text-[11px] text-sky-900 block">Total Días Pagados</span>
                  <span className="text-lg font-bold text-[#016098]">{resumenAuditoria.totalDiasPagados}</span>
                </div>
                <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-200">
                  <span className="text-[11px] text-indigo-900 block">Pago Estimado Acum. ($)</span>
                  <span className="text-lg font-bold text-indigo-700">
                    ${resumenAuditoria.totalPagoEstimado.toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200">
                  <span className="text-[11px] text-rose-900 block">Total Descuentos ($)</span>
                  <span className="text-lg font-bold text-rose-700">
                    ${resumenAuditoria.totalDescuento.toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            )}

            {/* Tabla de Auditoría */}
            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                  <tr>
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Funcionario</th>
                    <th className="p-2.5">Sector / Cenco</th>
                    <th className="p-2.5">N° Licencia</th>
                    <th className="p-2.5">Desde / Hasta</th>
                    <th className="p-2.5 text-center">Días Lic/Pag</th>
                    <th className="p-2.5">Concepto</th>
                    <th className="p-2.5 text-right">Monto Pag.</th>
                    <th className="p-2.5 text-right">Pago Estimado</th>
                    <th className="p-2.5">Doc / Banco</th>
                    <th className="p-2.5">Salud / AFP</th>
                    <th className="p-2.5">Observación Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {registrosAuditoria.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-[#94a3b8]">
                        Ingrese N° de Documento y Banco (o seleccione una Observación) y presione Buscar
                      </td>
                    </tr>
                  ) : (
                    registrosAuditoria.map((r, idx) => (
                      <tr key={idx} className="hover:bg-[#f8fafc]">
                        <td className="p-2.5 whitespace-nowrap font-semibold">
                          {r.Rut ? `${r.Rut}-${r.DV}` : '-'}
                        </td>
                        <td className="p-2.5 font-medium">
                          {`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim() || '-'}
                        </td>
                        <td className="p-2.5">
                          <span className="font-semibold">{r.Sector}</span> ({r.CodUnidad})
                        </td>
                        <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          {formatDateDDMMYYYY(r.Desde)} al {formatDateDDMMYYYY(r.Hasta)}
                        </td>
                        <td className="p-2.5 text-center">
                          {r.NumDias} / <span className="font-bold text-[#016098]">{r.DiasPagados}</span>
                        </td>
                        <td className="p-2.5">{r.Concepto}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          ${Number(r.Monto || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5 text-right">${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          #{r.NumeroDocumento} ({r.Banco})
                        </td>
                        <td className="p-2.5">
                          {r.SaludDescripcion || '-'} / {r.PrevisionR2 || '-'}
                        </td>
                        <td className="p-2.5 truncate max-w-[180px]" title={r.ObservacionPago}>
                          {r.ObservacionPago}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: ELIMINAR PAGO MASIVO (eliminar_pagomasivo.vb)
      ===================================================================== */}
      {tabActiva === 'eliminar' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Opción A: Eliminar por Observación */}
            <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
              <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
                Opción A — Buscar y Eliminar por Observación de Carga
              </h2>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Seleccione Observación de Carga Masiva (`LIC_DETALLE_PAGO_ACTUAL.Observacion`)
                </label>
                <select
                  value={elimObservacion}
                  onChange={e => setElimObservacion(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                >
                  <option value="">-- Seleccione una Observación --</option>
                  {observacionesCarga.map((o, idx) => (
                    <option key={idx} value={o.Observacion}>
                      {o.Observacion} — ({o.Cantidad} pagos | ${Number(o.TotalMonto || 0).toLocaleString('es-CL')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => buscarPagosParaEliminar('observacion')}
                  disabled={cargando}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  🔍 Previsualizar por Observación
                </button>
                <button
                  onClick={() => ejecutarEliminacionMasiva('observacion')}
                  disabled={cargando || !elimObservacion}
                  className="px-4 py-2 bg-[#EB567F] text-white text-xs font-bold rounded-lg hover:bg-[#d6416a] disabled:opacity-50"
                >
                  🗑️ Eliminar Pagos de esta Observación
                </button>
              </div>
            </div>

            {/* Opción B: Eliminar por N° Documento y Banco */}
            <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
              <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
                Opción B — Buscar y Eliminar por N° Documento y Banco
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">N° Documento</label>
                  <input
                    type="text"
                    value={elimNumDoc}
                    onChange={e => setElimNumDoc(e.target.value)}
                    placeholder="Ej: 3112026"
                    className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Banco</label>
                  <select
                    value={elimBanco}
                    onChange={e => setElimBanco(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                  >
                    {bancos.map(b => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => buscarPagosParaEliminar('documento')}
                  disabled={cargando}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  🔍 Previsualizar por Doc / Banco
                </button>
                <button
                  onClick={() => ejecutarEliminacionMasiva('documento')}
                  disabled={cargando || !elimNumDoc.trim()}
                  className="px-4 py-2 bg-[#EB567F] text-white text-xs font-bold rounded-lg hover:bg-[#d6416a] disabled:opacity-50"
                >
                  🗑️ Eliminar Pagos de este Documento
                </button>
              </div>
            </div>
          </div>

          {/* Grilla de Previsualización antes de Eliminar */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#016098] uppercase">
                  Registros Encontrados ({registrosEliminar.length}) — Total: $
                  {montoTotalEliminar.toLocaleString('es-CL')}
                </h3>
                <p className="text-xs text-[#64748b]">
                  Revise los pagos antes de confirmar la eliminación. Puede descargar un respaldo en Excel.
                </p>
              </div>
              <div className="flex gap-2">
                {registrosEliminar.length > 0 && (
                  <>
                    <button
                      onClick={exportarEliminacionExcel}
                      className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                    >
                      Descargar Respaldo Excel
                    </button>
                    <button
                      onClick={() => {
                        exportToCorporatePDF({
                          title: 'RESPALDO DE PAGOS PREVIO A ELIMINACIÓN MASIVA',
                          subtitle: `Criterio: ${modoElimActivo === 'observacion' ? elimObservacion : `${elimNumDoc} (${elimBanco})`}`,
                          columns: [
                            { header: 'N° Licencia', key: 'NumeroLicencia' },
                            { header: 'Funcionario', key: 'FuncFmt' },
                            { header: 'Desde', key: 'DesdeFmt', align: 'center' },
                            { header: 'Hasta', key: 'HastaFmt', align: 'center' },
                            { header: 'N° Transf.', key: 'NumeroDocumento' },
                            { header: 'Banco', key: 'Banco' },
                            { header: 'Días Pag.', key: 'DiasPagados', align: 'center' },
                            { header: 'Observación', key: 'Observacion' },
                            { header: 'Monto ($)', key: 'MontoFmt', align: 'right' },
                            { header: 'Concepto', key: 'Concepto' }
                          ],
                          rows: registrosEliminar.map(r => ({
                            ...r,
                            FuncFmt: r.NombreFuncionario || r.RutFuncionario,
                            DesdeFmt: formatDateDDMMYYYY(r.Desde),
                            HastaFmt: formatDateDDMMYYYY(r.Hasta),
                            MontoFmt: formatCurrencyCLP(r.Monto)
                          })),
                          totalsRow: {
                            NumeroLicencia: 'TOTAL',
                            MontoFmt: formatCurrencyCLP(montoTotalEliminar)
                          }
                        });
                      }}
                      className="px-3.5 py-1.5 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78]"
                    >
                      Exportar PDF
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setRegistrosEliminar([]);
                    setMontoTotalEliminar(0);
                  }}
                  className="px-3.5 py-1.5 border border-[#cbd5e1] text-[#475569] text-xs font-semibold rounded-lg hover:bg-[#f1f5f9]"
                >
                  Limpiar Grilla
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                  <tr>
                    <th className="p-2.5">Num Licencia</th>
                    <th className="p-2.5">Funcionario</th>
                    <th className="p-2.5">Desde</th>
                    <th className="p-2.5">Hasta</th>
                    <th className="p-2.5">Num Doc</th>
                    <th className="p-2.5">Banco</th>
                    <th className="p-2.5">Fecha Dep CtaCte</th>
                    <th className="p-2.5 text-center">Días Pagados</th>
                    <th className="p-2.5">Observación</th>
                    <th className="p-2.5 text-right">Monto ($)</th>
                    <th className="p-2.5">Concepto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {registrosEliminar.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-[#94a3b8]">
                        Utilice cualquiera de los dos paneles superiores para previsualizar los pagos que desea eliminar
                      </td>
                    </tr>
                  ) : (
                    registrosEliminar.map(r => (
                      <tr key={r.Correlativo} className="hover:bg-[#f8fafc]">
                        <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                        <td className="p-2.5">{r.NombreFuncionario || r.RutFuncionario}</td>
                        <td className="p-2.5">{formatDateDDMMYYYY(r.Desde)}</td>
                        <td className="p-2.5">{formatDateDDMMYYYY(r.Hasta)}</td>
                        <td className="p-2.5 font-semibold">{r.NumeroDocumento}</td>
                        <td className="p-2.5">{r.Banco}</td>
                        <td className="p-2.5">{formatDateDDMMYYYY(r.FechaDepCtaCte)}</td>
                        <td className="p-2.5 text-center">{r.DiasPagados}</td>
                        <td className="p-2.5">{r.Observacion}</td>
                        <td className="p-2.5 text-right font-bold text-rose-700">
                          ${Number(r.Monto || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5">{r.Concepto}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: REPORTE DE LICENCIAS AUTORIZADAS POR PAGO INST. SALUD
      ===================================================================== */}
      {tabActiva === 'aut_pago' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#f1f5f9] pb-3">
              <div>
                <h2 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">
                  Reporte de Licencias Autorizadas por Recibo de Pago de Institución de Salud (`AUT_PAGO_SALUD`)
                </h2>
                <p className="text-xs text-[#64748b] mt-1">
                  Licencias que figuraban como Rechazadas y pasaron automáticamente a Autorizadas al recibir pago de Subsidio o Aporte por parte de la Institución de Salud.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={anioAutPago}
                  onChange={e => {
                    setAnioAutPago(e.target.value);
                    cargarReporteAutorizadasPorPago(e.target.value);
                  }}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                >
                  <option value="">Todos los Años (Histórico)</option>
                  {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                    <option key={y} value={String(y)}>
                      Año {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => cargarReporteAutorizadasPorPago(anioAutPago)}
                  disabled={cargandoAutPago}
                  className="px-3.5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  {cargandoAutPago ? 'Cargando...' : 'Actualizar'}
                </button>
                <button
                  onClick={() => exportarAutorizadasPorPagoExcel(registrosAutPago, anioAutPago || 'Historico')}
                  disabled={registrosAutPago.length === 0}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  📥 Exportar a Excel ({registrosAutPago.length})
                </button>
                <button
                  onClick={() => {
                    const totSub = registrosAutPago.reduce((a, r) => a + Number(r.MontoSubsidio || 0), 0);
                    const totApo = registrosAutPago.reduce((a, r) => a + Number(r.MontoAporte || 0), 0);
                    const totSal = registrosAutPago.reduce((a, r) => a + Number(r.MontoSaludTotal || 0), 0);
                    exportToCorporatePDF({
                      title: 'REPORTE DE LICENCIAS AUTORIZADAS POR PAGO DE INSTITUCIÓN DE SALUD',
                      subtitle: `Filtro Año: ${anioAutPago || 'Histórico Completo'} — Estado AUT_PAGO_SALUD`,
                      kpis: [
                        { label: 'Licencias Regularizadas', value: registrosAutPago.length.toLocaleString('es-CL'), color: 'blue' },
                        { label: 'Total Pagado Subsidio', value: formatCurrencyCLP(totSub), color: 'indigo' },
                        { label: 'Total Pagado Aporte', value: formatCurrencyCLP(totApo), color: 'slate' },
                        { label: 'Total Pagado Salud', value: formatCurrencyCLP(totSal), color: 'emerald' }
                      ],
                      columns: [
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'Funcionario' },
                        { header: 'Sector / Estab.', key: 'SectorFmt' },
                        { header: 'Inst. Salud', key: 'Salud' },
                        { header: 'Desde / Hasta', key: 'PeriodoFmt', align: 'center' },
                        { header: 'Días', key: 'NumDias', align: 'center' },
                        { header: 'Subsidio', key: 'SubFmt', align: 'right' },
                        { header: 'Aporte', key: 'ApoFmt', align: 'right' },
                        { header: 'Total Pagado', key: 'TotFmt', align: 'right' }
                      ],
                      rows: registrosAutPago.slice(0, 1000).map(r => ({
                        ...r,
                        RutFmt: r.Rut ? `${r.Rut}-${r.DV}` : '-',
                        SectorFmt: `${r.Sector} — ${r.Establecimiento}`,
                        PeriodoFmt: `${formatDateDDMMYYYY(r.Desde)} al ${formatDateDDMMYYYY(r.Hasta)}`,
                        SubFmt: formatCurrencyCLP(r.MontoSubsidio),
                        ApoFmt: formatCurrencyCLP(r.MontoAporte),
                        TotFmt: formatCurrencyCLP(r.MontoSaludTotal)
                      })),
                      totalsRow: {
                        NumeroLicencia: 'TOTAL',
                        SubFmt: formatCurrencyCLP(totSub),
                        ApoFmt: formatCurrencyCLP(totApo),
                        TotFmt: formatCurrencyCLP(totSal)
                      }
                    });
                  }}
                  disabled={registrosAutPago.length === 0}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] disabled:opacity-50"
                >
                  📄 Exportar a PDF
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                  <tr>
                    <th className="p-2.5">N° Licencia</th>
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Funcionario</th>
                    <th className="p-2.5">Sector / Establecimiento</th>
                    <th className="p-2.5">Inst. Salud</th>
                    <th className="p-2.5">Desde / Hasta</th>
                    <th className="p-2.5 text-center">Días</th>
                    <th className="p-2.5 text-right">Pagado Subsidio</th>
                    <th className="p-2.5 text-right">Pagado Aporte</th>
                    <th className="p-2.5 text-right">Total Pagado Salud</th>
                    <th className="p-2.5">Último Pago</th>
                    <th className="p-2.5">Observación COMPIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {registrosAutPago.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-[#94a3b8]">
                        {cargandoAutPago ? 'Cargando registros...' : 'No se encontraron registros para el filtro seleccionado'}
                      </td>
                    </tr>
                  ) : (
                    registrosAutPago.map((r, idx) => (
                      <tr key={idx} className="hover:bg-[#f8fafc]">
                        <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                        <td className="p-2.5 whitespace-nowrap font-semibold">
                          {r.Rut ? `${r.Rut}-${r.DV}` : '-'}
                        </td>
                        <td className="p-2.5 font-medium">{r.Funcionario}</td>
                        <td className="p-2.5">
                          <span className="font-semibold">{r.Sector}</span> — {r.Establecimiento}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-700">{r.Salud}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          {formatDateDDMMYYYY(r.Desde)} al {formatDateDDMMYYYY(r.Hasta)}
                        </td>
                        <td className="p-2.5 text-center font-bold">{r.NumDias}</td>
                        <td className="p-2.5 text-right text-sky-700 font-semibold">
                          ${Number(r.MontoSubsidio || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5 text-right text-indigo-700 font-semibold">
                          ${Number(r.MontoAporte || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5 text-right text-emerald-700 font-bold">
                          ${Number(r.MontoSaludTotal || 0).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">{formatDateDDMMYYYY(r.UltimoPagoSalud)}</td>
                        <td className="p-2.5 max-w-[260px] truncate text-emerald-800 font-medium" title={r.Observacion_Compin}>
                          {r.Observacion_Compin}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
