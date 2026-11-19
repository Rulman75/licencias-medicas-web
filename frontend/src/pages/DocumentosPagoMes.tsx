import React, { useState, useEffect, useMemo } from 'react';
import {
  exportToCorporatePDF,
  exportToExcel,
  formatCurrencyCLP,
  formatDateDDMMYYYY
} from '../utils/exportUtils';

interface InstitucionDesglose {
  nombre: string;
  total: number;
}

interface DocumentoPagoMes {
  DocKey: string;
  Banco: string;
  NumeroDocumento: string;
  EnTablaCheques: boolean;
  TipoDocumento: string;
  AreaCheque: string;
  EstadoCheque: string;
  EstadoCuadratura: string;
  FechaCheque: string | null;
  FechaDeposito: string | null;
  FechaDepositoMin: string | null;
  FechaDepositoMax: string | null;
  FechaRecepcion: string | null;
  FechaRecepcionMin: string | null;
  FechaRecepcionMax: string | null;
  CantMovimientosMes: number;
  CantLicencias: number;
  CantFuncionarios: number;
  CantEstablecimientos: number;
  TotalDiasPagadosMes: number;
  InstitucionesResumen: string;
  InstitucionesDesglose: InstitucionDesglose[];
  SectoresResumen: string;
  ObservacionesResumen: string;
  MontoTotalMes: number;
  MontoSubsidioMes: number;
  MontoAporteMes: number;
  MontoDescuentoMes: number;
  MontoDevolucionMes: number;
  MontoChequeOriginal: number;
  SaldoTablaCheque: number;
  MontoImputadoGlobal: number;
  TotalMovimientosGlobal: number;
  DiferenciaRealCheque: number;
}

interface MovimientoPagoMes {
  Correlativo: number;
  DocKey: string;
  NumeroLicencia: string;
  NumeroDocumento: string;
  Banco: string;
  Concepto: string;
  FechaDeposito: string | null;
  FechaRecepcion: string | null;
  DiasPagados: number;
  PagoDesde: string | null;
  PagoHasta: string | null;
  Monto: number;
  ObservacionPago: string;
  CencoPago: string;
  Rut: string;
  DV: string;
  RutFormateado: string;
  Nombre: string;
  Paterno: string;
  Materno: string;
  NombreCompleto: string;
  CodUnidad: number;
  Establecimiento: string;
  CCosto: string;
  CodSector: number;
  SectorNombre: string;
  Planta: string;
  Salud: string;
  LicDesde: string | null;
  LicHasta: string | null;
  NumDiasLicencia: number;
  DiasAutorizados: number;
  Maternal: number | boolean;
  Rechazo: number | boolean;
  Parcial: number | boolean;
  Regularizado: number | boolean;
  PagoEstimado: number;
  SubsidioDiario: number;
  MontoNetoPromedio: number;
  PagoDirecto: string;
  TipoEnferm: string;
  ObservacionLicencia: string;
  TotalAcumuladoLicencia: number;
  DiasAcumuladosLicencia: number;
}

const MESES = [
  { valor: 1, nombre: 'Enero' },
  { valor: 2, nombre: 'Febrero' },
  { valor: 3, nombre: 'Marzo' },
  { valor: 4, nombre: 'Abril' },
  { valor: 5, nombre: 'Mayo' },
  { valor: 6, nombre: 'Junio' },
  { valor: 7, nombre: 'Julio' },
  { valor: 8, nombre: 'Agosto' },
  { valor: 9, nombre: 'Septiembre' },
  { valor: 10, nombre: 'Octubre' },
  { valor: 11, nombre: 'Noviembre' },
  { valor: 12, nombre: 'Diciembre' },
  { valor: 0, nombre: 'Todo el Año (Ene - Dic)' }
];

export default function DocumentosPagoMes() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [anio, setAnio] = useState<number>(currentYear);
  const [mes, setMes] = useState<number>(currentMonth);
  const [criterio, setCriterio] = useState<'deposito' | 'recepcion'>('deposito');

  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [documentos, setDocumentos] = useState<DocumentoPagoMes[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoPagoMes[]>([]);

  // Filtros en memoria para máxima velocidad e interactividad
  const [vistaActiva, setVistaActiva] = useState<'documentos' | 'movimientos'>('documentos');
  const [filtroBanco, setFiltroBanco] = useState<string>('TODOS');
  const [filtroConcepto, setFiltroConcepto] = useState<string>('TODOS');
  const [filtroSector, setFiltroSector] = useState<string>('TODOS');
  const [filtroSalud, setFiltroSalud] = useState<string>('TODOS');
  const [filtroCuadratura, setFiltroCuadratura] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');

  // Modal de máximo detalle de un documento específico
  const [docSeleccionadoKey, setDocSeleccionadoKey] = useState<string | null>(null);
  const [busquedaModal, setBusquedaModal] = useState<string>('');

  const aniosDisponibles = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= 2012; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  const nombreMesSeleccionado = useMemo(() => {
    return MESES.find(m => m.valor === mes)?.nombre || String(mes);
  }, [mes]);

  const consultarMes = async (anioParam = anio, mesParam = mes, criterioParam = criterio) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/informes/documentos-pago-mes?anio=${anioParam}&mes=${mesParam}&criterio=${criterioParam}`
      );
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.error || 'No se pudo obtener el detalle de documentos de pago del mes');
      }
      setDocumentos(data.documentos || []);
      setMovimientos(data.movimientos || []);
    } catch (err: any) {
      setError(err.message || 'Error de conexión al consultar documentos de pago');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    consultarMes(anio, mes, criterio);
  }, [anio, mes, criterio]);

  // Listas dinámicas para selectores de filtro
  const bancosUnicos = useMemo(() => {
    const s = new Set<string>();
    documentos.forEach(d => {
      if (d.Banco) s.add(d.Banco);
    });
    return Array.from(s).sort();
  }, [documentos]);

  const institucionesSaludUnicas = useMemo(() => {
    const s = new Set<string>();
    movimientos.forEach(m => {
      if (m.Salud) s.add(m.Salud);
    });
    return Array.from(s).sort();
  }, [movimientos]);

  // Filtrado de movimientos línea por línea
  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return movimientos.filter(m => {
      if (filtroBanco !== 'TODOS' && m.Banco !== filtroBanco) return false;
      if (filtroConcepto !== 'TODOS' && m.Concepto.toUpperCase() !== filtroConcepto.toUpperCase()) return false;
      if (filtroSector !== 'TODOS' && m.SectorNombre !== filtroSector) return false;
      if (filtroSalud !== 'TODOS' && (m.Salud || 'SIN INSTITUCIÓN') !== filtroSalud) return false;

      if (filtroCuadratura !== 'TODOS') {
        const docParent = documentos.find(d => d.DocKey === m.DocKey);
        if (!docParent || docParent.EstadoCuadratura !== filtroCuadratura) return false;
      }

      if (q) {
        const match =
          m.NumeroDocumento.toUpperCase().includes(q) ||
          m.Banco.toUpperCase().includes(q) ||
          m.NumeroLicencia.toUpperCase().includes(q) ||
          m.RutFormateado.toUpperCase().includes(q) ||
          m.NombreCompleto.toUpperCase().includes(q) ||
          (m.Establecimiento || '').toUpperCase().includes(q) ||
          (m.Salud || '').toUpperCase().includes(q) ||
          (m.ObservacionPago || '').toUpperCase().includes(q) ||
          (m.ObservacionLicencia || '').toUpperCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [movimientos, documentos, filtroBanco, filtroConcepto, filtroSector, filtroSalud, filtroCuadratura, busqueda]);

  // Filtrado de documentos agrupados
  const documentosFiltrados = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    const docKeysFromMovs = new Set(movimientosFiltrados.map(m => m.DocKey));
    const hayFiltroMovimiento =
      filtroConcepto !== 'TODOS' ||
      filtroSector !== 'TODOS' ||
      filtroSalud !== 'TODOS' ||
      q.length > 0;

    return documentos.filter(d => {
      if (filtroBanco !== 'TODOS' && d.Banco !== filtroBanco) return false;
      if (filtroCuadratura !== 'TODOS' && d.EstadoCuadratura !== filtroCuadratura) return false;

      if (hayFiltroMovimiento) {
        if (docKeysFromMovs.has(d.DocKey)) return true;
        // También permitir coincidencia directa en la cabecera del documento si aún no tiene movimientos
        if (
          d.CantMovimientosMes === 0 &&
          q &&
          (d.NumeroDocumento.toUpperCase().includes(q) ||
            d.Banco.toUpperCase().includes(q) ||
            (d.AreaCheque || '').toUpperCase().includes(q))
        ) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [documentos, movimientosFiltrados, filtroBanco, filtroConcepto, filtroSector, filtroSalud, filtroCuadratura, busqueda]);

  // Resumen ejecutivo dinámico según los filtros activos
  const kpisFiltrados = useMemo(() => {
    let montoTotal = 0;
    let montoSubsidio = 0;
    let montoAporte = 0;
    let montoDescuento = 0;
    let montoDevolucion = 0;
    let montoEducacion = 0;
    let montoSaludAPS = 0;
    let totalDias = 0;
    const lics = new Set<string>();
    const funcs = new Set<string>();

    for (const m of movimientosFiltrados) {
      montoTotal += m.Monto;
      totalDias += m.DiasPagados;
      if (m.NumeroLicencia) lics.add(m.NumeroLicencia);
      if (m.Rut) funcs.add(m.Rut);

      const c = m.Concepto.toUpperCase();
      if (c === 'SUBSIDIO') montoSubsidio += m.Monto;
      else if (c === 'APORTE') montoAporte += m.Monto;
      else if (c === 'DESCUENTO') montoDescuento += m.Monto;
      else if (c === 'DEVOLUCION' || c === 'DEVOLUCIÓN') montoDevolucion += m.Monto;

      if (m.CodSector === 1) montoEducacion += m.Monto;
      else if (m.CodSector === 2) montoSaludAPS += m.Monto;
    }

    let docsEnCheques = 0;
    let docsCuadrados = 0;
    let docsConDiferencia = 0;
    let docsNomina = 0;
    let montoChequesOrig = 0;
    let diferenciaCheques = 0;

    for (const d of documentosFiltrados) {
      if (d.EnTablaCheques) {
        docsEnCheques += 1;
        montoChequesOrig += d.MontoChequeOriginal;
        diferenciaCheques += d.DiferenciaRealCheque;
        if (d.EstadoCuadratura === 'Cuadrado 100%') docsCuadrados += 1;
        else docsConDiferencia += 1;
      } else if (d.Banco.toUpperCase() === 'DESCUENTO') {
        docsNomina += 1;
      }
    }

    return {
      totalDocumentos: documentosFiltrados.length,
      docsEnCheques,
      docsCuadrados,
      docsConDiferencia,
      docsNomina,
      montoChequesOrig,
      diferenciaCheques,
      totalMovimientos: movimientosFiltrados.length,
      totalLicencias: lics.size,
      totalFuncionarios: funcs.size,
      totalDias,
      montoTotal,
      montoSubsidio,
      montoAporte,
      montoDescuento,
      montoDevolucion,
      montoEducacion,
      montoSaludAPS
    };
  }, [documentosFiltrados, movimientosFiltrados]);

  // Documento activo en el Modal de Máximo Detalle
  const documentoModal = useMemo(() => {
    if (!docSeleccionadoKey) return null;
    return documentos.find(d => d.DocKey === docSeleccionadoKey) || null;
  }, [docSeleccionadoKey, documentos]);

  const movimientosModal = useMemo(() => {
    if (!docSeleccionadoKey) return [];
    const q = busquedaModal.trim().toUpperCase();
    return movimientos.filter(m => {
      if (m.DocKey !== docSeleccionadoKey) return false;
      if (!q) return true;
      return (
        m.NumeroLicencia.toUpperCase().includes(q) ||
        m.RutFormateado.toUpperCase().includes(q) ||
        m.NombreCompleto.toUpperCase().includes(q) ||
        (m.Establecimiento || '').toUpperCase().includes(q) ||
        (m.Salud || '').toUpperCase().includes(q) ||
        (m.Concepto || '').toUpperCase().includes(q) ||
        (m.ObservacionPago || '').toUpperCase().includes(q)
      );
    });
  }, [docSeleccionadoKey, movimientos, busquedaModal]);

  const desgloseEstablecimientosModal = useMemo(() => {
    const map = new Map<string, { nombre: string; ccosto: string; sector: string; cant: number; monto: number }>();
    for (const m of movimientosModal) {
      const key = m.Establecimiento || 'SIN ESTABLECIMIENTO';
      if (!map.has(key)) {
        map.set(key, {
          nombre: key,
          ccosto: m.CCosto || '—',
          sector: m.SectorNombre,
          cant: 0,
          monto: 0
        });
      }
      const item = map.get(key)!;
      item.cant += 1;
      item.monto += m.Monto;
    }
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [movimientosModal]);

  // Exportaciones Generales (Excel y PDF)
  const handleExportarDocumentosExcel = () => {
    const rows = documentosFiltrados.map(d => ({
      'Banco / Origen': d.Banco,
      'N° Documento': d.NumeroDocumento,
      'Tipo Documento': d.TipoDocumento,
      'Estado Tabla Cheques': d.EstadoCheque,
      'Estado Cuadratura': d.EstadoCuadratura,
      'Fecha Depósito': formatDateDDMMYYYY(d.FechaDeposito),
      'Fecha Recepción': formatDateDDMMYYYY(d.FechaRecepcion),
      'Sector / Área': d.AreaCheque || d.SectoresResumen,
      'Instituciones de Salud': d.InstitucionesResumen,
      'Cant. Movimientos Mes': d.CantMovimientosMes,
      'Cant. Licencias': d.CantLicencias,
      'Cant. Funcionarios': d.CantFuncionarios,
      'Cant. Establecimientos': d.CantEstablecimientos,
      'Total Días Pagados': d.TotalDiasPagadosMes,
      'Monto Subsidio ($)': d.MontoSubsidioMes,
      'Monto Aporte ($)': d.MontoAporteMes,
      'Monto Descuento ($)': d.MontoDescuentoMes,
      'Monto Devolución ($)': d.MontoDevolucionMes,
      'Total Recibido / Imputado Mes ($)': d.MontoTotalMes,
      'Monto Original Cheque ($)': d.MontoChequeOriginal,
      'Total Imputado Global ($)': d.MontoImputadoGlobal,
      'Diferencia Cheque ($)': d.DiferenciaRealCheque,
      'Observación / Lote': d.ObservacionesResumen
    }));
    exportToExcel(
      rows,
      `Maestro_Documentos_Pago_${nombreMesSeleccionado}_${anio}`,
      'Documentos_Mes'
    );
  };

  const handleExportarDocumentosPDF = () => {
    const rows = documentosFiltrados.map(d => ({
      banco: d.Banco,
      numDoc: d.NumeroDocumento,
      tipo: d.TipoDocumento,
      fechaDep: formatDateDDMMYYYY(d.FechaDeposito) || '—',
      fechaRec: formatDateDDMMYYYY(d.FechaRecepcion) || '—',
      instituciones: d.InstitucionesResumen,
      movs: d.CantMovimientosMes,
      lics: d.CantLicencias,
      dias: d.TotalDiasPagadosMes,
      subsidio: formatCurrencyCLP(d.MontoSubsidioMes),
      aporte: formatCurrencyCLP(d.MontoAporteMes),
      descuento: formatCurrencyCLP(d.MontoDescuentoMes),
      totalMes: formatCurrencyCLP(d.MontoTotalMes),
      montoCheque: d.EnTablaCheques ? formatCurrencyCLP(d.MontoChequeOriginal) : '—',
      cuadratura: d.EstadoCuadratura
    }));

    exportToCorporatePDF({
      title: `Maestro de Documentos de Pago Recibidos — ${nombreMesSeleccionado} ${anio}`,
      subtitle: `Criterio de Fecha: ${criterio === 'deposito' ? 'Fecha Depósito / Documento' : 'Fecha Recepción / Ingreso'}`,
      orientation: 'landscape',
      meta: [
        { label: 'Período Consultado', value: `${nombreMesSeleccionado} ${anio}` },
        { label: 'Total Documentos', value: kpisFiltrados.totalDocumentos },
        { label: 'Total Movimientos', value: kpisFiltrados.totalMovimientos },
        { label: 'Licencias / Funcionarios', value: `${kpisFiltrados.totalLicencias} / ${kpisFiltrados.totalFuncionarios}` }
      ],
      kpis: [
        { label: 'Total Recibido Mes', value: formatCurrencyCLP(kpisFiltrados.montoTotal), color: 'emerald' },
        { label: 'Subsidios Salud', value: formatCurrencyCLP(kpisFiltrados.montoSubsidio), color: 'blue' },
        { label: 'Aporte Previsional', value: formatCurrencyCLP(kpisFiltrados.montoAporte), color: 'indigo' },
        { label: 'Descuentos RRHH', value: formatCurrencyCLP(kpisFiltrados.montoDescuento), color: 'amber' }
      ],
      columns: [
        { header: 'Banco', key: 'banco' },
        { header: 'N° Documento', key: 'numDoc' },
        { header: 'Tipo', key: 'tipo' },
        { header: 'F. Depósito', key: 'fechaDep', align: 'center' },
        { header: 'F. Recepción', key: 'fechaRec', align: 'center' },
        { header: 'Instituciones', key: 'instituciones' },
        { header: 'Movs', key: 'movs', align: 'center' },
        { header: 'Lics', key: 'lics', align: 'center' },
        { header: 'Días', key: 'dias', align: 'center' },
        { header: 'Subsidio', key: 'subsidio', align: 'right' },
        { header: 'Aporte', key: 'aporte', align: 'right' },
        { header: 'Descuento', key: 'descuento', align: 'right' },
        { header: 'Total Mes', key: 'totalMes', align: 'right' },
        { header: 'Monto Cheque', key: 'montoCheque', align: 'right' },
        { header: 'Cuadratura', key: 'cuadratura', align: 'center' }
      ],
      rows,
      totalsRow: {
        banco: 'TOTALES DEL PERÍODO',
        numDoc: `${kpisFiltrados.totalDocumentos} docs`,
        movs: kpisFiltrados.totalMovimientos,
        lics: kpisFiltrados.totalLicencias,
        dias: kpisFiltrados.totalDias,
        subsidio: formatCurrencyCLP(kpisFiltrados.montoSubsidio),
        aporte: formatCurrencyCLP(kpisFiltrados.montoAporte),
        descuento: formatCurrencyCLP(kpisFiltrados.montoDescuento),
        totalMes: formatCurrencyCLP(kpisFiltrados.montoTotal),
        montoCheque: formatCurrencyCLP(kpisFiltrados.montoChequesOrig),
        cuadratura: ''
      }
    });
  };

  const handleExportarMovimientosExcel = (lista: MovimientoPagoMes[], sufijoNombre: string) => {
    const rows = lista.map(m => ({
      'Fecha Depósito': formatDateDDMMYYYY(m.FechaDeposito),
      'Fecha Recepción': formatDateDDMMYYYY(m.FechaRecepcion),
      'Banco': m.Banco,
      'N° Documento': m.NumeroDocumento,
      'Concepto Pago': m.Concepto,
      'N° Licencia': m.NumeroLicencia,
      'RUT Funcionario': m.RutFormateado,
      'Nombre Funcionario': m.NombreCompleto,
      'Cod. Unidad': m.CodUnidad,
      'Establecimiento': m.Establecimiento,
      'Centro Costo': m.CCosto,
      'Sector': m.SectorNombre,
      'Planta / Cargo': m.Planta,
      'Institución Salud': m.Salud,
      'Inicio Licencia': formatDateDDMMYYYY(m.LicDesde),
      'Término Licencia': formatDateDDMMYYYY(m.LicHasta),
      'Días Licencia': m.NumDiasLicencia,
      'Días Autorizados': m.DiasAutorizados,
      'Estado Licencia': m.Rechazo
        ? 'Rechazada'
        : m.Parcial
        ? 'Reducida'
        : m.Maternal
        ? 'Maternal'
        : 'Autorizada',
      'Modalidad': m.PagoDirecto === 'SI' ? 'Pago Directo' : 'Convenio',
      'Pago Desde': formatDateDDMMYYYY(m.PagoDesde),
      'Pago Hasta': formatDateDDMMYYYY(m.PagoHasta),
      'Días Pagados': m.DiasPagados,
      'Subsidio Diario ($)': m.SubsidioDiario,
      'Pago Estimado Licencia ($)': m.PagoEstimado,
      'Monto Pagado en Doc. ($)': m.Monto,
      'Total Acumulado Licencia ($)': m.TotalAcumuladoLicencia,
      'Observación Pago / Lote': m.ObservacionPago,
      'Observación Licencia': m.ObservacionLicencia
    }));
    exportToExcel(rows, sufijoNombre, 'Detalle_Movimientos');
  };

  const handleExportarMovimientosPDF = (lista: MovimientoPagoMes[], tituloReporte: string, subtituloReporte: string) => {
    let sumaMonto = 0;
    let sumaDias = 0;
    const rows = lista.map(m => {
      sumaMonto += m.Monto;
      sumaDias += m.DiasPagados;
      return {
        fechaDep: formatDateDDMMYYYY(m.FechaDeposito) || '—',
        fechaRec: formatDateDDMMYYYY(m.FechaRecepcion) || '—',
        banco: m.Banco,
        numDoc: m.NumeroDocumento,
        concepto: m.Concepto,
        licencia: m.NumeroLicencia,
        rut: m.RutFormateado,
        funcionario: m.NombreCompleto,
        establecimiento: m.Establecimiento || `Unidad ${m.CodUnidad}`,
        salud: m.Salud || '—',
        periodoLic: `${formatDateDDMMYYYY(m.LicDesde)} al ${formatDateDDMMYYYY(m.LicHasta)}`,
        diasLic: m.NumDiasLicencia,
        diasPag: m.DiasPagados,
        estimado: formatCurrencyCLP(m.PagoEstimado),
        monto: formatCurrencyCLP(m.Monto),
        obs: m.ObservacionPago || m.ObservacionLicencia || ''
      };
    });

    exportToCorporatePDF({
      title: tituloReporte,
      subtitle: subtituloReporte,
      orientation: 'landscape',
      meta: [
        { label: 'Período', value: `${nombreMesSeleccionado} ${anio}` },
        { label: 'Movimientos Detallados', value: lista.length },
        { label: 'Total Días Pagados', value: sumaDias },
        { label: 'Monto Total Imputado', value: formatCurrencyCLP(sumaMonto) }
      ],
      columns: [
        { header: 'F. Depósito', key: 'fechaDep', align: 'center' },
        { header: 'Banco', key: 'banco' },
        { header: 'N° Doc.', key: 'numDoc' },
        { header: 'Concepto', key: 'concepto', align: 'center' },
        { header: 'N° Licencia', key: 'licencia' },
        { header: 'RUT', key: 'rut' },
        { header: 'Funcionario', key: 'funcionario' },
        { header: 'Establecimiento', key: 'establecimiento' },
        { header: 'Salud', key: 'salud' },
        { header: 'Período Licencia', key: 'periodoLic', align: 'center' },
        { header: 'D.Lic', key: 'diasLic', align: 'center' },
        { header: 'D.Pag', key: 'diasPag', align: 'center' },
        { header: 'Estimado', key: 'estimado', align: 'right' },
        { header: 'Monto Pagado', key: 'monto', align: 'right' },
        { header: 'Observación', key: 'obs' }
      ],
      rows,
      totalsRow: {
        fechaDep: 'TOTALES',
        banco: `${lista.length} movs`,
        diasPag: sumaDias,
        monto: formatCurrencyCLP(sumaMonto)
      }
    });
  };

  const badgeConcepto = (concepto: string) => {
    const c = (concepto || '').toUpperCase();
    if (c === 'SUBSIDIO') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (c === 'APORTE') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (c === 'DESCUENTO') {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (c === 'DEVOLUCION' || c === 'DEVOLUCIÓN') {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const badgeCuadratura = (estado: string) => {
    if (estado === 'Cuadrado 100%') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
    if (estado === 'Saldo por Imputar') {
      return 'bg-amber-100 text-amber-800 border-amber-300';
    }
    if (estado === 'Sin Imputar' || estado === 'Sobre-Imputado') {
      return 'bg-rose-100 text-rose-800 border-rose-300';
    }
    if (estado === 'Nómina Descuento RRHH') {
      return 'bg-purple-100 text-purple-800 border-purple-300';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-5">
      {/* Encabezado Principal Corporativo */}
      <div className="bg-gradient-to-r from-[#016098] via-[#024a8d] to-[#0f172a] rounded-xl p-5 text-white shadow-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏦</span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              Documentos de Pago Recibidos por Mes (Máximo Detalle)
            </h1>
          </div>
          <p className="text-xs md:text-sm text-blue-100 mt-1">
            Control integral de transferencias bancarias, cheques, aportes previsionales, subsidios y nóminas de descuento recibidos en el período, con desglose línea por línea de cada licencia y funcionario.
          </p>
        </div>

        {/* Selector Rápido de Año, Mes y Criterio de Fecha */}
        <div className="flex flex-wrap items-center gap-2.5 bg-white/10 p-2.5 rounded-xl border border-white/15">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-blue-200 font-bold mb-0.5">
              Año
            </label>
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="bg-white text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 border border-slate-300 focus:outline-none"
            >
              {aniosDisponibles.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-blue-200 font-bold mb-0.5">
              Mes a Consultar
            </label>
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              className="bg-white text-slate-800 text-xs font-bold rounded-lg px-3 py-1.5 border border-slate-300 focus:outline-none"
            >
              {MESES.map(m => (
                <option key={m.valor} value={m.valor}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-blue-200 font-bold mb-0.5">
              Criterio de Fecha
            </label>
            <select
              value={criterio}
              onChange={e => setCriterio(e.target.value as 'deposito' | 'recepcion')}
              className="bg-white text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-slate-300 focus:outline-none"
            >
              <option value="deposito">Fecha Depósito / Documento</option>
              <option value="recepcion">Fecha Recepción / Ingreso</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => consultarMes(anio, mes, criterio)}
            disabled={cargando}
            className="mt-3.5 px-3.5 py-1.5 rounded-lg bg-[#39BABD] hover:bg-[#2fa5a8] text-white text-xs font-bold shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            {cargando ? 'Consultando...' : '🔄 Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Tarjetas Ejecutivas de Resumen del Mes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
        {/* KPI 1: Total Documentos */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm border-l-4 border-l-[#016098]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Documentos en {nombreMesSeleccionado} {anio}
          </div>
          <div className="text-2xl font-extrabold text-[#016098] mt-1">
            {kpisFiltrados.totalDocumentos.toLocaleString('es-CL')}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap justify-between text-[11px] text-slate-600 gap-1">
            <span>
              🏦 Cheques/Transf: <strong className="text-slate-800">{kpisFiltrados.docsEnCheques}</strong>
            </span>
            <span>
              📋 Nóminas RRHH: <strong className="text-purple-700">{kpisFiltrados.docsNomina}</strong>
            </span>
          </div>
        </div>

        {/* KPI 2: Monto Total Recibido en el Mes */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm border-l-4 border-l-emerald-600">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Monto Total Recibido / Imputado
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-emerald-700 mt-1">
            {formatCurrencyCLP(kpisFiltrados.montoTotal)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap justify-between text-[11px] text-slate-600 gap-1">
            <span>
              Movs: <strong className="text-slate-800">{kpisFiltrados.totalMovimientos.toLocaleString('es-CL')}</strong>
            </span>
            <span>
              Lics: <strong className="text-slate-800">{kpisFiltrados.totalLicencias.toLocaleString('es-CL')}</strong>
            </span>
            <span>
              Func: <strong className="text-slate-800">{kpisFiltrados.totalFuncionarios.toLocaleString('es-CL')}</strong>
            </span>
          </div>
        </div>

        {/* KPI 3: Subsidio + Aporte Previsional */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm border-l-4 border-l-blue-600">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pagos Inst. Salud (Subsidio + Aporte)
          </div>
          <div className="text-xl font-extrabold text-blue-700 mt-1">
            {formatCurrencyCLP(kpisFiltrados.montoSubsidio + kpisFiltrados.montoAporte)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span>Subsidio:</span>
              <strong className="text-emerald-700">{formatCurrencyCLP(kpisFiltrados.montoSubsidio)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Aporte Previsional:</span>
              <strong className="text-blue-700">{formatCurrencyCLP(kpisFiltrados.montoAporte)}</strong>
            </div>
          </div>
        </div>

        {/* KPI 4: Descuentos y Distribución Sectorial */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Descuentos RRHH y Sectores
          </div>
          <div className="text-xl font-extrabold text-amber-700 mt-1">
            {formatCurrencyCLP(kpisFiltrados.montoDescuento)}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span>🎓 Educación:</span>
              <strong className="text-slate-800">{formatCurrencyCLP(kpisFiltrados.montoEducacion)}</strong>
            </div>
            <div className="flex justify-between">
              <span>🏥 Salud APS:</span>
              <strong className="text-slate-800">{formatCurrencyCLP(kpisFiltrados.montoSaludAPS)}</strong>
            </div>
          </div>
        </div>

        {/* KPI 5: Cuadratura contra DETALLE_CHEQUES */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm border-l-4 border-l-indigo-600">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Cuadratura Transferencias / Cheques
          </div>
          <div className="text-xl font-extrabold text-indigo-700 mt-1">
            {kpisFiltrados.docsCuadrados} / {kpisFiltrados.docsEnCheques} Cuadrados
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span>Total Cheques:</span>
              <strong className="text-slate-800">{formatCurrencyCLP(kpisFiltrados.montoChequesOrig)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Diferencia Global:</span>
              <strong className={kpisFiltrados.diferenciaCheques === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                {formatCurrencyCLP(kpisFiltrados.diferenciaCheques)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Avanzados y Selector de Vista */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Switcher de Vista */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setVistaActiva('documentos')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                vistaActiva === 'documentos'
                  ? 'bg-[#016098] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📑 Vista 1: Maestro de Documentos ({documentosFiltrados.length})
            </button>
            <button
              type="button"
              onClick={() => setVistaActiva('movimientos')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                vistaActiva === 'movimientos'
                  ? 'bg-[#016098] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📋 Vista 2: Sábana Detallada Línea por Línea ({movimientosFiltrados.length})
            </button>
          </div>

          {/* Botones de Exportación según Vista Activa */}
          <div className="flex flex-wrap items-center gap-2">
            {vistaActiva === 'documentos' ? (
              <>
                <button
                  type="button"
                  onClick={handleExportarDocumentosExcel}
                  disabled={documentosFiltrados.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  📊 Exportar Maestro Docs (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExportarDocumentosPDF}
                  disabled={documentosFiltrados.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  🖨️ Imprimir / PDF Maestro Docs
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleExportarMovimientosExcel(
                      movimientosFiltrados,
                      `Sabana_Detallada_Pagos_${nombreMesSeleccionado}_${anio}`
                    )
                  }
                  disabled={movimientosFiltrados.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  📊 Exportar Sábana Detallada (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleExportarMovimientosPDF(
                      movimientosFiltrados,
                      `Sábana Detallada de Pagos Recibidos — ${nombreMesSeleccionado} ${anio}`,
                      `Detalle Línea por Línea de Licencias Pagadas (${movimientosFiltrados.length} movimientos)`
                    )
                  }
                  disabled={movimientosFiltrados.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  🖨️ Imprimir / PDF Sábana Detallada
                </button>
              </>
            )}
          </div>
        </div>

        {/* Controles de Filtro Rápido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <div className="xl:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              🔎 Buscar N° Documento, Licencia, RUT, Funcionario, Colegio o Lote
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Ej: 28061472, 11734745, RUT, Apellido, INGRESO 10-11-2026..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Banco / Origen
            </label>
            <select
              value={filtroBanco}
              onChange={e => setFiltroBanco(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="TODOS">Todos ({bancosUnicos.length})</option>
              {bancosUnicos.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Concepto de Pago
            </label>
            <select
              value={filtroConcepto}
              onChange={e => setFiltroConcepto(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="TODOS">Todos los Conceptos</option>
              <option value="Subsidio">Subsidio</option>
              <option value="Aporte">Aporte Previsional</option>
              <option value="Descuento">Descuento RRHH</option>
              <option value="Devolucion">Devolución</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Sector / Institución Salud
            </label>
            <div className="flex gap-1">
              <select
                value={filtroSector}
                onChange={e => setFiltroSector(e.target.value)}
                className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="TODOS">Sector: Todos</option>
                <option value="Educación">Educación</option>
                <option value="Salud APS">Salud APS</option>
              </select>
              <select
                value={filtroSalud}
                onChange={e => setFiltroSalud(e.target.value)}
                className="w-1/2 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="TODOS">Salud: Todas</option>
                {institucionesSaludUnicas.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Estado Cuadratura
            </label>
            <div className="flex gap-1">
              <select
                value={filtroCuadratura}
                onChange={e => setFiltroCuadratura(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="Cuadrado 100%">Cuadrado 100%</option>
                <option value="Saldo por Imputar">Saldo por Imputar</option>
                <option value="Sin Imputar">Sin Imputar</option>
                <option value="Sobre-Imputado">Sobre-Imputado</option>
                <option value="Nómina Descuento RRHH">Nómina Descuento RRHH</option>
                <option value="Nómina / Directo">Nómina / Directo</option>
              </select>
              {(filtroBanco !== 'TODOS' ||
                filtroConcepto !== 'TODOS' ||
                filtroSector !== 'TODOS' ||
                filtroSalud !== 'TODOS' ||
                filtroCuadratura !== 'TODOS' ||
                busqueda !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroBanco('TODOS');
                    setFiltroConcepto('TODOS');
                    setFiltroSector('TODOS');
                    setFiltroSalud('TODOS');
                    setFiltroCuadratura('TODOS');
                    setBusqueda('');
                  }}
                  title="Limpiar filtros"
                  className="px-2 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* VISTA 1: MAESTRO DE DOCUMENTOS DE PAGO DEL MES */}
      {vistaActiva === 'documentos' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                📑 Maestro de Documentos de Pago Recibidos — {nombreMesSeleccionado} {anio}
              </h2>
              <p className="text-[11px] text-slate-500">
                Haz clic en cualquier fila o en el botón <strong>"🔍 Ver Detalle"</strong> para abrir el comprobante completo con todas las licencias y funcionarios pagados en ese documento.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              Mostrando <strong>{documentosFiltrados.length}</strong> documentos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#016098] text-white uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Banco / Tipo</th>
                  <th className="py-2.5 px-3">N° Documento</th>
                  <th className="py-2.5 px-2.5 text-center">F. Depósito</th>
                  <th className="py-2.5 px-2.5 text-center">F. Recepción</th>
                  <th className="py-2.5 px-3">Sector / Inst. Salud</th>
                  <th className="py-2.5 px-2 text-center">Movs</th>
                  <th className="py-2.5 px-2 text-center">Lics / Func</th>
                  <th className="py-2.5 px-2 text-center">Días</th>
                  <th className="py-2.5 px-2.5 text-right">Subsidio</th>
                  <th className="py-2.5 px-2.5 text-right">Aporte</th>
                  <th className="py-2.5 px-2.5 text-right">Descuento</th>
                  <th className="py-2.5 px-3 text-right bg-[#024a8d]">Total Mes ($)</th>
                  <th className="py-2.5 px-2.5 text-right">Monto Cheque</th>
                  <th className="py-2.5 px-2.5 text-center">Cuadratura / Estado</th>
                  <th className="py-2.5 px-3">Observación / Lote</th>
                  <th className="py-2.5 px-2.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cargando ? (
                  <tr>
                    <td colSpan={16} className="py-12 text-center text-slate-500 font-medium">
                      Cargando documentos de pago recibidos en {nombreMesSeleccionado} {anio}...
                    </td>
                  </tr>
                ) : documentosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="py-12 text-center text-slate-500">
                      No se encontraron documentos de pago para los filtros seleccionados en {nombreMesSeleccionado} {anio}.
                    </td>
                  </tr>
                ) : (
                  documentosFiltrados.map(doc => (
                    <tr
                      key={doc.DocKey}
                      onClick={() => {
                        setDocSeleccionadoKey(doc.DocKey);
                        setBusquedaModal('');
                      }}
                      className="hover:bg-blue-50/60 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{doc.Banco}</div>
                        <div className="text-[10px] text-slate-500">{doc.TipoDocumento}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-[#016098] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {doc.NumeroDocumento}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap font-medium text-slate-700">
                        {formatDateDDMMYYYY(doc.FechaDeposito) || '—'}
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap text-slate-600">
                        {formatDateDDMMYYYY(doc.FechaRecepcion) || '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <div className="font-semibold text-slate-800 truncate" title={doc.InstitucionesResumen}>
                          {doc.InstitucionesResumen}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {doc.AreaCheque || doc.SectoresResumen}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                        {doc.CantMovimientosMes}
                      </td>
                      <td className="py-2.5 px-2 text-center whitespace-nowrap text-slate-700">
                        <span className="font-bold">{doc.CantLicencias}</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span>{doc.CantFuncionarios}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-slate-700">
                        {doc.TotalDiasPagadosMes}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-emerald-700 font-semibold">
                        {doc.MontoSubsidioMes > 0 ? formatCurrencyCLP(doc.MontoSubsidioMes) : '—'}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-blue-700 font-semibold">
                        {doc.MontoAporteMes > 0 ? formatCurrencyCLP(doc.MontoAporteMes) : '—'}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-amber-700 font-semibold">
                        {doc.MontoDescuentoMes > 0 ? formatCurrencyCLP(doc.MontoDescuentoMes) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-extrabold text-slate-900 bg-slate-50">
                        {formatCurrencyCLP(doc.MontoTotalMes)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        {doc.EnTablaCheques ? (
                          <div>
                            <div className="font-bold text-slate-800">
                              {formatCurrencyCLP(doc.MontoChequeOriginal)}
                            </div>
                            {doc.DiferenciaRealCheque !== 0 && (
                              <div className="text-[10px] text-amber-700 font-semibold">
                                Dif: {formatCurrencyCLP(doc.DiferenciaRealCheque)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeCuadratura(
                            doc.EstadoCuadratura
                          )}`}
                        >
                          {doc.EstadoCuadratura}
                        </span>
                        {doc.EnTablaCheques && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Tabla: {doc.EstadoCheque}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[170px] truncate text-slate-600" title={doc.ObservacionesResumen}>
                        {doc.ObservacionesResumen}
                      </td>
                      <td className="py-2.5 px-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setDocSeleccionadoKey(doc.DocKey);
                            setBusquedaModal('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                        >
                          🔍 Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {documentosFiltrados.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={5} className="py-3 px-3 text-right uppercase text-[11px]">
                      Totales del Período ({documentosFiltrados.length} documentos):
                    </td>
                    <td className="py-3 px-2 text-center">{kpisFiltrados.totalMovimientos}</td>
                    <td className="py-3 px-2 text-center">
                      {kpisFiltrados.totalLicencias} / {kpisFiltrados.totalFuncionarios}
                    </td>
                    <td className="py-3 px-2 text-center">{kpisFiltrados.totalDias}</td>
                    <td className="py-3 px-2.5 text-right text-emerald-800">
                      {formatCurrencyCLP(kpisFiltrados.montoSubsidio)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-blue-800">
                      {formatCurrencyCLP(kpisFiltrados.montoAporte)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-amber-800">
                      {formatCurrencyCLP(kpisFiltrados.montoDescuento)}
                    </td>
                    <td className="py-3 px-3 text-right text-[#016098] bg-blue-50">
                      {formatCurrencyCLP(kpisFiltrados.montoTotal)}
                    </td>
                    <td className="py-3 px-2.5 text-right">
                      {formatCurrencyCLP(kpisFiltrados.montoChequesOrig)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: SÁBANA DETALLADA DE MOVIMIENTOS LÍNEA POR LÍNEA */}
      {vistaActiva === 'movimientos' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                📋 Sábana Detallada de Todos los Movimientos de Pago — {nombreMesSeleccionado} {anio}
              </h2>
              <p className="text-[11px] text-slate-500">
                Detalle individual de cada pago imputado a licencias médicas en el mes. Haz clic en cualquier <strong>N° de Documento</strong> para inspeccionar el documento completo.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              Mostrando <strong>{movimientosFiltrados.length.toLocaleString('es-CL')}</strong> movimientos individuales
            </span>
          </div>

          <div className="overflow-x-auto max-h-[68vh]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#016098] text-white uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-2.5 text-center">F. Depósito</th>
                  <th className="py-2.5 px-2.5 text-center">F. Recepción</th>
                  <th className="py-2.5 px-2.5">Banco</th>
                  <th className="py-2.5 px-2.5">N° Documento</th>
                  <th className="py-2.5 px-2 text-center">Concepto</th>
                  <th className="py-2.5 px-2.5">N° Licencia</th>
                  <th className="py-2.5 px-2.5">RUT / Funcionario</th>
                  <th className="py-2.5 px-2.5">Establecimiento / Sector</th>
                  <th className="py-2.5 px-2.5">Inst. Salud</th>
                  <th className="py-2.5 px-2.5 text-center">Período Licencia</th>
                  <th className="py-2.5 px-2 text-center">D.Lic</th>
                  <th className="py-2.5 px-2 text-center">D.Pag</th>
                  <th className="py-2.5 px-2.5 text-right">Estimado ($)</th>
                  <th className="py-2.5 px-3 text-right bg-[#024a8d]">Monto Doc ($)</th>
                  <th className="py-2.5 px-2.5">Observación / Lote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cargando ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-slate-500 font-medium">
                      Cargando movimientos detallados de {nombreMesSeleccionado} {anio}...
                    </td>
                  </tr>
                ) : movimientosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-slate-500">
                      No se encontraron movimientos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  movimientosFiltrados.map(m => (
                    <tr key={`${m.Correlativo}-${m.NumeroLicencia}-${m.NumeroDocumento}`} className="hover:bg-blue-50/50">
                      <td className="py-2 px-2.5 text-center whitespace-nowrap font-medium text-slate-700">
                        {formatDateDDMMYYYY(m.FechaDeposito) || '—'}
                      </td>
                      <td className="py-2 px-2.5 text-center whitespace-nowrap text-slate-500">
                        {formatDateDDMMYYYY(m.FechaRecepcion) || '—'}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-slate-800">{m.Banco}</td>
                      <td className="py-2 px-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDocSeleccionadoKey(m.DocKey);
                            setBusquedaModal('');
                          }}
                          className="font-mono font-bold text-[#016098] hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-200 cursor-pointer"
                          title="Ver comprobante completo de este documento"
                        >
                          {m.NumeroDocumento}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeConcepto(
                            m.Concepto
                          )}`}
                        >
                          {m.Concepto}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-mono font-bold text-slate-900">{m.NumeroLicencia}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {Boolean(m.Rechazo) && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded font-bold">
                              Rechazada
                            </span>
                          )}
                          {Boolean(m.Parcial) && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-700 rounded font-bold">
                              Reducida
                            </span>
                          )}
                          {Boolean(m.Maternal) && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-pink-100 text-pink-700 rounded font-bold">
                              Maternal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-800">{m.NombreCompleto || '—'}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {m.RutFormateado} {m.Planta ? `• ${m.Planta}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-medium text-slate-800">
                          {m.Establecimiento || (m.CodUnidad ? `Unidad ${m.CodUnidad}` : '—')}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {m.SectorNombre} {m.CCosto ? `• CC ${m.CCosto}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-slate-700">{m.Salud || '—'}</td>
                      <td className="py-2 px-2.5 text-center whitespace-nowrap text-[11px] text-slate-600">
                        {formatDateDDMMYYYY(m.LicDesde)} al {formatDateDDMMYYYY(m.LicHasta)}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-700">{m.NumDiasLicencia}</td>
                      <td className="py-2 px-2 text-center font-bold text-slate-800">{m.DiasPagados}</td>
                      <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-600">
                        {formatCurrencyCLP(m.PagoEstimado)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-extrabold text-slate-900 bg-slate-50">
                        {formatCurrencyCLP(m.Monto)}
                      </td>
                      <td className="py-2 px-2.5 max-w-[180px] truncate text-slate-600" title={m.ObservacionPago || m.ObservacionLicencia}>
                        {m.ObservacionPago || m.ObservacionLicencia || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {movimientosFiltrados.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={11} className="py-3 px-3 text-right uppercase text-[11px]">
                      Totales ({movimientosFiltrados.length.toLocaleString('es-CL')} movimientos):
                    </td>
                    <td className="py-3 px-2 text-center">{kpisFiltrados.totalDias}</td>
                    <td></td>
                    <td className="py-3 px-3 text-right text-[#016098] bg-blue-50">
                      {formatCurrencyCLP(kpisFiltrados.montoTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE MÁXIMO DETALLE DE UN DOCUMENTO DE PAGO ESPECÍFICO */}
      {documentoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 md:p-6"
          onClick={() => setDocSeleccionadoKey(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div className="bg-gradient-to-r from-[#016098] to-[#024a8d] text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xl">🧾</span>
                  <h3 className="text-base md:text-lg font-extrabold">
                    Detalle Completo del Documento N° {documentoModal.NumeroDocumento}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/15 border border-white/20">
                    {documentoModal.Banco} • {documentoModal.TipoDocumento}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeCuadratura(
                      documentoModal.EstadoCuadratura
                    )}`}
                  >
                    {documentoModal.EstadoCuadratura}
                  </span>
                </div>
                <p className="text-xs text-blue-100 mt-1">
                  Fecha Depósito: <strong>{formatDateDDMMYYYY(documentoModal.FechaDeposito) || '—'}</strong> •
                  Fecha Recepción: <strong>{formatDateDDMMYYYY(documentoModal.FechaRecepcion) || '—'}</strong> •
                  Sector / Área: <strong>{documentoModal.AreaCheque || documentoModal.SectoresResumen}</strong> •
                  Lote / Obs: <strong>{documentoModal.ObservacionesResumen}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleExportarMovimientosExcel(
                      movimientosModal,
                      `Detalle_Documento_${documentoModal.Banco}_${documentoModal.NumeroDocumento}`
                    )
                  }
                  disabled={movimientosModal.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                >
                  📊 Exportar Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleExportarMovimientosPDF(
                      movimientosModal,
                      `Comprobante Detallado de Documento de Pago N° ${documentoModal.NumeroDocumento}`,
                      `Banco / Origen: ${documentoModal.Banco} (${documentoModal.TipoDocumento}) — Fecha Depósito: ${
                        formatDateDDMMYYYY(documentoModal.FechaDeposito) || '—'
                      } — Estado: ${documentoModal.EstadoCuadratura}`
                    )
                  }
                  disabled={movimientosModal.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                >
                  🖨️ Imprimir / PDF Comprobante
                </button>
                <button
                  type="button"
                  onClick={() => setDocSeleccionadoKey(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold cursor-pointer"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-4 md:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Resumen Financiero del Documento */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Total Imputado Mes</div>
                  <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                    {formatCurrencyCLP(documentoModal.MontoTotalMes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {documentoModal.CantMovimientosMes} movs en el período
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Subsidios Salud</div>
                  <div className="text-base font-extrabold text-blue-700 mt-0.5">
                    {formatCurrencyCLP(documentoModal.MontoSubsidioMes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {documentoModal.TotalDiasPagadosMes} días pagados
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Aporte Previsional</div>
                  <div className="text-base font-extrabold text-indigo-700 mt-0.5">
                    {formatCurrencyCLP(documentoModal.MontoAporteMes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Cotizaciones AFP/Salud</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Descuentos / Dev.</div>
                  <div className="text-base font-extrabold text-amber-700 mt-0.5">
                    {formatCurrencyCLP(documentoModal.MontoDescuentoMes + documentoModal.MontoDevolucionMes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Reintegros trabajador</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Cobertura</div>
                  <div className="text-base font-extrabold text-slate-800 mt-0.5">
                    {documentoModal.CantLicencias} Licencias
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {documentoModal.CantFuncionarios} func. • {documentoModal.CantEstablecimientos} estab.
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Cuadratura Cheque</div>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    {documentoModal.EnTablaCheques
                      ? formatCurrencyCLP(documentoModal.MontoChequeOriginal)
                      : 'Nómina Directa'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {documentoModal.EnTablaCheques
                      ? `Diferencia: ${formatCurrencyCLP(documentoModal.DiferenciaRealCheque)}`
                      : 'Sin registro en DETALLE_CHEQUES'}
                  </div>
                </div>
              </div>

              {/* Desglose por Institución de Salud y por Establecimiento */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700 mb-2">
                    🏥 Desglose por Institución de Salud en este Documento
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {documentoModal.InstitucionesDesglose.length === 0 ? (
                      <span className="text-xs text-slate-400">Sin instituciones asociadas</span>
                    ) : (
                      documentoModal.InstitucionesDesglose.map(inst => (
                        <span
                          key={inst.nombre}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs"
                        >
                          <strong className="text-slate-800">{inst.nombre}:</strong>
                          <span className="font-bold text-[#016098]">{formatCurrencyCLP(inst.total)}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700 mb-2">
                    🏫 Establecimientos / Unidades Incluidas ({desgloseEstablecimientosModal.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {desgloseEstablecimientosModal.map(est => (
                      <span
                        key={est.nombre}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]"
                      >
                        <strong className="text-slate-800">{est.nombre}</strong>
                        <span className="text-slate-400">({est.cant})</span>
                        <span className="font-bold text-emerald-700">{formatCurrencyCLP(est.monto)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Buscador interno del documento */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={busquedaModal}
                  onChange={e => setBusquedaModal(e.target.value)}
                  placeholder="🔎 Filtrar dentro de este documento por N° Licencia, RUT, Nombre Funcionario, Establecimiento o Concepto..."
                  className="w-full md:w-96 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098]"
                />
                <span className="text-xs text-slate-600 font-semibold">
                  Mostrando <strong>{movimientosModal.length}</strong> movimientos del documento N°{' '}
                  <strong>{documentoModal.NumeroDocumento}</strong>
                </span>
              </div>

              {/* Tabla de Movimientos del Documento */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-[#016098] text-white uppercase text-[10px] tracking-wider">
                      <th className="py-2 px-2.5">#</th>
                      <th className="py-2 px-2.5">Concepto</th>
                      <th className="py-2 px-2.5">N° Licencia</th>
                      <th className="py-2 px-2.5">RUT</th>
                      <th className="py-2 px-2.5">Funcionario</th>
                      <th className="py-2 px-2.5">Establecimiento (CC)</th>
                      <th className="py-2 px-2.5">Salud</th>
                      <th className="py-2 px-2.5 text-center">Período Licencia</th>
                      <th className="py-2 px-2 text-center">D.Lic</th>
                      <th className="py-2 px-2 text-center">D.Pag</th>
                      <th className="py-2 px-2.5 text-right">Sub. Diario</th>
                      <th className="py-2 px-2.5 text-right">Estimado</th>
                      <th className="py-2 px-3 text-right bg-[#024a8d]">Monto Pagado ($)</th>
                      <th className="py-2 px-2.5">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {movimientosModal.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="py-8 text-center text-slate-500">
                          Este documento no registra movimientos individuales en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      movimientosModal.map((m, idx) => (
                        <tr key={`${m.Correlativo}-${idx}`} className="hover:bg-blue-50/50">
                          <td className="py-2 px-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeConcepto(
                                m.Concepto
                              )}`}
                            >
                              {m.Concepto}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold text-slate-900">
                            {m.NumeroLicencia}
                          </td>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap text-slate-700">
                            {m.RutFormateado}
                          </td>
                          <td className="py-2 px-2.5 font-bold text-slate-800">
                            {m.NombreCompleto || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-slate-700">
                            {m.Establecimiento || `Unidad ${m.CodUnidad}`}
                            {m.CCosto ? <span className="text-[10px] text-slate-400"> ({m.CCosto})</span> : null}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-slate-700">{m.Salud || '—'}</td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap text-[11px] text-slate-600">
                            {formatDateDDMMYYYY(m.LicDesde)} al {formatDateDDMMYYYY(m.LicHasta)}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600">{m.NumDiasLicencia}</td>
                          <td className="py-2 px-2 text-center font-bold text-slate-800">{m.DiasPagados}</td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-600">
                            {m.SubsidioDiario > 0 ? formatCurrencyCLP(m.SubsidioDiario) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right whitespace-nowrap text-slate-600">
                            {formatCurrencyCLP(m.PagoEstimado)}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap font-extrabold text-slate-900 bg-slate-50">
                            {formatCurrencyCLP(m.Monto)}
                          </td>
                          <td className="py-2 px-2.5 text-slate-600 max-w-[160px] truncate" title={m.ObservacionPago || m.ObservacionLicencia}>
                            {m.ObservacionPago || m.ObservacionLicencia || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {movimientosModal.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={9} className="py-2.5 px-3 text-right uppercase text-[11px]">
                          Total Documento N° {documentoModal.NumeroDocumento}:
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {movimientosModal.reduce((acc, r) => acc + r.DiasPagados, 0)}
                        </td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right text-[#016098] bg-blue-50">
                          {formatCurrencyCLP(movimientosModal.reduce((acc, r) => acc + r.Monto, 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
