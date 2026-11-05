import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface MesConvenioRow {
  Mes: number;
  MesNombre: string;
  MesCorto: string;
  TotalLicencias: number;
  TotalFuncionarios: number;
  TotalDias: number;
  TotalDiasAut: number;
  LicenciasPagadas: number;
  LicenciasSinPago: number;
  LicenciasPorCobrarSalud: number;
  LicenciasRechazadas: number;
  RechazadasRecuperablesCant: number;
  RechazadasIncobrablesCant: number;
  RechazadasRecuperadasCant: number;
  LicenciasReducidas: number;
  DiasSubsidio: number;
  DiasAporte: number;
  TotalEstimado: number;
  TotalPagado: number;
  PagadoSubsidio: number;
  PagadoAporte: number;
  FaltaPorCobrar: number;
  MontoRechazado: number;
  MontoRechazadoRecuperable: number;
  MontoRechazadoIncobrable: number;
  MontoRechazadoRecuperado: number;
  FaltaPorCobrarTotal: number;
  PorcentajePago: number;
  PorcentajeCobertura: number;
}

type FiltroDetalleTipo =
  | 'todas'
  | 'por-cobrar'
  | 'sin-pago'
  | 'pagadas'
  | 'rechazadas'
  | 'rech-recuperables'
  | 'rech-incobrables'
  | 'rech-recuperadas';

interface ControlConvenioMensualProps {
  initialYear?: string;
}

export default function ControlConvenioMensual({ initialYear }: ControlConvenioMensualProps) {
  const defaultYear = initialYear && initialYear !== '' ? initialYear : String(new Date().getFullYear());
  const [anio, setAnio] = useState<string>(defaultYear);
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(0); // 0 = Acumulado Anual (Todos los meses)
  // Por defecto usamos 'desde' (Fecha Inicio Reposo) para cuadrar con el tarjetón superior del Dashboard
  const [criterio, setCriterio] = useState<'recepcion' | 'desde'>('desde');
  const [sector, setSector] = useState<string>('');

  const [mesesData, setMesesData] = useState<MesConvenioRow[]>([]);
  const [totalesAnuales, setTotalesAnuales] = useState<any>(null);
  const [cargando, setCargando] = useState<boolean>(false);

  // Modal de desglose de Saldos por Cobrar y Licencias Rechazadas (Recuperables vs Incobrables)
  const [mostrarModalCobro, setMostrarModalCobro] = useState<boolean>(false);

  // Estado del Detalle de Licencias
  const [mostrarDetalle, setMostrarDetalle] = useState<boolean>(false);
  const [mesDetalle, setMesDetalle] = useState<number>(0);
  const [registrosDetalle, setRegistrosDetalle] = useState<any[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);
  const [filtroEstadoDet, setFiltroEstadoDet] = useState<FiltroDetalleTipo>('todas');
  const [busquedaDet, setBusquedaDet] = useState<string>('');
  const [ordenCampoDet, setOrdenCampoDet] = useState<'fecha' | 'demora'>('fecha');
  const [ordenFechaDet, setOrdenFechaDet] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (initialYear && initialYear !== '' && initialYear !== anio) {
      setAnio(initialYear);
    }
  }, [initialYear]);

  const formatCLP = (val: number) => `$${Math.round(Number(val || 0)).toLocaleString('es-CL')}`;

  const formatDateDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return '-';
    const clean = String(isoDate).split('T')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  const cargarResumenMensual = async () => {
    setCargando(true);
    try {
      const res = await axios.get('/api/dashboard/convenio-mensual', {
        params: { year: anio, criterio, sector }
      });
      if (res.data && res.data.status === 'ok') {
        setMesesData(res.data.meses || []);
        setTotalesAnuales(res.data.totales || null);
      }
    } catch (err) {
      console.error('Error cargando resumen mensual convenio:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarResumenMensual();
    setMostrarDetalle(false);
  }, [anio, criterio, sector]);

  const abrirDetalleMes = async (mesNum: number, filtroInicial?: FiltroDetalleTipo) => {
    setMesSeleccionado(mesNum);
    setMesDetalle(mesNum);
    if (filtroInicial) {
      setFiltroEstadoDet(filtroInicial);
    }
    setMostrarDetalle(true);
    setCargandoDetalle(true);
    try {
      const res = await axios.get('/api/dashboard/convenio-mensual/detalle', {
        params: {
          year: anio,
          month: mesNum,
          criterio,
          sector
        }
      });
      if (res.data && res.data.status === 'ok') {
        setRegistrosDetalle(res.data.registros || []);
      }
    } catch (err) {
      console.error('Error cargando detalle convenio mensual:', err);
    } finally {
      setCargandoDetalle(false);
    }
  };

  // Datos activos para las tarjetas KPI superiores (Mes seleccionado o Total Anual)
  const kpiActivo =
    mesSeleccionado > 0
      ? mesesData.find(m => m.Mes === mesSeleccionado) || totalesAnuales
      : totalesAnuales;

  const tituloPeriodoActivo =
    mesSeleccionado > 0
      ? `${mesesData.find(m => m.Mes === mesSeleccionado)?.MesNombre || ''} ${anio}`
      : `Acumulado Anual ${anio}`;

  // Exportar tabla resumen mensual a Excel
  const exportarResumenExcel = () => {
    if (mesesData.length === 0) return;
    const rows = mesesData.map(m => ({
      'Año': anio,
      'Mes': m.MesNombre,
      'Criterio Fecha': criterio === 'recepcion' ? 'Mes Recepción (Tramitadas)' : 'Mes Inicio Reposo (Desde)',
      'Licencias Convenio Tramitadas': m.TotalLicencias,
      'Licencias con Pago': m.LicenciasPagadas,
      'Licencias Sin Pago ($0 No Rech.)': m.LicenciasSinPago,
      'Licencias Por Cobrar Salud': m.LicenciasPorCobrarSalud,
      'Licencias Rechazadas (Total)': m.LicenciasRechazadas,
      'Rech. Recuperables (Vigentes)': m.RechazadasRecuperablesCant,
      'Rech. Incobrables (No Vigentes)': m.RechazadasIncobrablesCant,
      'Rech. Ya Recuperadas': m.RechazadasRecuperadasCant,
      'Licencias Reducidas': m.LicenciasReducidas,
      'Días Otorgados': m.TotalDias,
      'Días Autorizados': m.TotalDiasAut,
      'Días Pag. Subsidio': m.DiasSubsidio,
      'Días Pag. Aporte': m.DiasAporte,
      'Pago Estimado Total ($)': m.TotalEstimado,
      'Pago Recibido Total ($)': m.TotalPagado,
      'Recibido Subsidio ($)': m.PagadoSubsidio,
      'Recibido Aporte ($)': m.PagadoAporte,
      'Falta por Cobrar Salud ($)': m.FaltaPorCobrar,
      'Monto Rech. Recuperable Vigentes ($)': m.MontoRechazadoRecuperable,
      'Monto Rech. Incobrable No Vigentes ($)': m.MontoRechazadoIncobrable,
      'Monto Rech. Ya Recuperado ($)': m.MontoRechazadoRecuperado,
      'Monto Total Rechazadas ($)': m.MontoRechazado,
      '% Pago Financiero': `${m.PorcentajePago}%`,
      '% Cobertura Licencias Pagadas': `${m.PorcentajeCobertura}%`
    }));

    if (totalesAnuales) {
      rows.push({
        'Año': anio,
        'Mes': 'TOTAL ANUAL',
        'Criterio Fecha': criterio === 'recepcion' ? 'Mes Recepción (Tramitadas)' : 'Mes Inicio Reposo (Desde)',
        'Licencias Convenio Tramitadas': totalesAnuales.TotalLicencias,
        'Licencias con Pago': totalesAnuales.LicenciasPagadas,
        'Licencias Sin Pago ($0 No Rech.)': totalesAnuales.LicenciasSinPago,
        'Licencias Por Cobrar Salud': totalesAnuales.LicenciasPorCobrarSalud,
        'Licencias Rechazadas (Total)': totalesAnuales.LicenciasRechazadas,
        'Rech. Recuperables (Vigentes)': totalesAnuales.RechazadasRecuperablesCant,
        'Rech. Incobrables (No Vigentes)': totalesAnuales.RechazadasIncobrablesCant,
        'Rech. Ya Recuperadas': totalesAnuales.RechazadasRecuperadasCant,
        'Licencias Reducidas': totalesAnuales.LicenciasReducidas,
        'Días Otorgados': totalesAnuales.TotalDias,
        'Días Autorizados': totalesAnuales.TotalDiasAut,
        'Días Pag. Subsidio': totalesAnuales.DiasSubsidio,
        'Días Pag. Aporte': totalesAnuales.DiasAporte,
        'Pago Estimado Total ($)': totalesAnuales.TotalEstimado,
        'Pago Recibido Total ($)': totalesAnuales.TotalPagado,
        'Recibido Subsidio ($)': totalesAnuales.PagadoSubsidio,
        'Recibido Aporte ($)': totalesAnuales.PagadoAporte,
        'Falta por Cobrar Salud ($)': totalesAnuales.FaltaPorCobrar,
        'Monto Rech. Recuperable Vigentes ($)': totalesAnuales.MontoRechazadoRecuperable,
        'Monto Rech. Incobrable No Vigentes ($)': totalesAnuales.MontoRechazadoIncobrable,
        'Monto Rech. Ya Recuperado ($)': totalesAnuales.MontoRechazadoRecuperado,
        'Monto Total Rechazadas ($)': totalesAnuales.MontoRechazado,
        '% Pago Financiero': `${totalesAnuales.PorcentajePago}%`,
        '% Cobertura Licencias Pagadas': `${totalesAnuales.PorcentajeCobertura}%`
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Convenio_Mensual_${anio}`);
    XLSX.writeFile(wb, `Control_Convenio_Mensual_${anio}.xlsx`);
  };

  // Filtrar y ordenar el detalle de licencias
  const registrosDetalleFiltrados = registrosDetalle
    .filter(r => {
      if (filtroEstadoDet === 'por-cobrar' && !(Number(r.FaltaPorCobrar || 0) > 0 && !r.Rechazo)) return false;
      if (filtroEstadoDet === 'sin-pago' && !(Number(r.MontoPagado || 0) === 0 && !r.Rechazo)) return false;
      if (filtroEstadoDet === 'pagadas' && !(Number(r.MontoPagado || 0) > 0)) return false;
      if (filtroEstadoDet === 'rechazadas' && !r.Rechazo) return false;
      if (filtroEstadoDet === 'rech-recuperables' && r.EscenarioCobro !== 'RECHAZADA_RECUPERABLE') return false;
      if (filtroEstadoDet === 'rech-incobrables' && r.EscenarioCobro !== 'RECHAZADA_INCOBRABLE') return false;
      if (filtroEstadoDet === 'rech-recuperadas' && r.EscenarioCobro !== 'RECHAZADA_RECUPERADA') return false;

      if (busquedaDet.trim()) {
        const q = busquedaDet.toLowerCase().trim();
        const match =
          String(r.NumeroLicencia || '').toLowerCase().includes(q) ||
          String(r.Rut || '').toLowerCase().includes(q) ||
          String(r.Funcionario || '').toLowerCase().includes(q) ||
          String(r.Establecimiento || '').toLowerCase().includes(q) ||
          String(r.Salud || '').toLowerCase().includes(q) ||
          String(r.SituacionCobroLabel || '').toLowerCase().includes(q) ||
          String(r.Observacion_Compin || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (ordenCampoDet === 'demora') {
        const dA = a.DiasDemoraPago !== null && a.DiasDemoraPago !== undefined ? Number(a.DiasDemoraPago) : -1;
        const dB = b.DiasDemoraPago !== null && b.DiasDemoraPago !== undefined ? Number(b.DiasDemoraPago) : -1;
        return ordenFechaDet === 'asc' ? dA - dB : dB - dA;
      }
      const campo = criterio === 'desde' ? 'Desde' : 'Recepcion';
      const fA = String(a[campo] || '');
      const fB = String(b[campo] || '');
      return ordenFechaDet === 'asc' ? fA.localeCompare(fB) : fB.localeCompare(fA);
    });

  // Promedio de días de demora de pago en el detalle filtrado
  const pagadasConDemora = registrosDetalleFiltrados.filter(
    r => r.DiasDemoraPago !== null && r.DiasDemoraPago !== undefined && Number(r.MontoPagado || 0) > 0
  );
  const promedioDiasDemora =
    pagadasConDemora.length > 0
      ? Math.round(pagadasConDemora.reduce((acc, r) => acc + Number(r.DiasDemoraPago || 0), 0) / pagadasConDemora.length)
      : null;

  // Exportar el detalle de licencias a Excel
  const exportarDetalleExcel = () => {
    if (registrosDetalleFiltrados.length === 0) return;
    const mesNom =
      mesDetalle > 0 ? mesesData.find(m => m.Mes === mesDetalle)?.MesNombre || `Mes_${mesDetalle}` : 'Anual';
    const rows = registrosDetalleFiltrados.map(r => {
      const est = Number(r.PagoEstimado || 0);
      const pag = Number(r.MontoPagado || 0);
      const pct = est > 0 ? Number(((pag / est) * 100).toFixed(1)) : 0;
      return {
        'N° Licencia': r.NumeroLicencia,
        'RUT': `${r.Rut}-${r.DV}`,
        'Funcionario': (r.Funcionario || '').trim(),
        'Vigencia Funcionario': r.VigenciaLabel || (r.Vigencia === 'S' ? 'Vigente' : 'No Vigente'),
        'Sector': r.Sector,
        'Cenco': r.CodUnidad,
        'Establecimiento': r.Establecimiento,
        'Institución Salud': r.Salud,
        'Fecha Recepción': formatDateDDMMYYYY(r.Recepcion),
        'Fecha Desde': formatDateDDMMYYYY(r.Desde),
        'Fecha Hasta': formatDateDDMMYYYY(r.Hasta),
        'Fecha Pago': r.FechaPago ? formatDateDDMMYYYY(r.FechaPago) : 'SIN PAGO',
        'Días Demora Pago': r.DiasDemoraPago !== null && r.DiasDemoraPago !== undefined ? r.DiasDemoraPago : '',
        'Días Licencia': r.NumDias,
        'Días Autorizados': r.DiasAutorizados,
        'Días Pag. Subsidio': r.DiasSubsidio,
        'Días Pag. Aporte': r.DiasAporte,
        'Pago Estimado ($)': est,
        'Monto Pagado Total ($)': pag,
        'Pagado Subsidio ($)': r.PagadoSubsidio,
        'Pagado Aporte ($)': r.PagadoAporte,
        'Falta Cobrar Salud ($)': r.FaltaPorCobrar,
        'Saldo Pendiente Total ($)': r.SaldoPendiente,
        '% Pago': `${pct}%`,
        'Cant. Pagos': r.CantidadPagos,
        'Estado': r.Rechazo ? 'RECHAZADA' : r.Reducida ? 'REDUCIDA' : pag > 0 ? 'CON PAGO' : 'PENDIENTE COBRO',
        'Situación de Cobro / Recuperación': r.SituacionCobroLabel || '',
        'Observación Compin': r.Observacion_Compin || '',
        'Obs. Apelación': r.Obser_apelacion || '',
        'Observación': r.Observacion || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle_Convenio');
    XLSX.writeFile(wb, `Detalle_Licencias_Convenio_${mesNom}_${anio}.xlsx`);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-6 space-y-6">
      {/* Encabezado y Controles de Filtro */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#f1f5f9] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#016098] text-white uppercase tracking-wide">
              Control Financiero Convenio
            </span>
            <h2 className="text-lg font-bold text-[#016098]">
              Control Mensual de Licencias con Convenio Tramitadas y Recuperación de Subsidios
            </h2>
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            Seguimiento mensual de licencias con convenio, Pago Estimado Total, Pago Recibido, Saldo por Cobrar, análisis de Rechazadas (Recuperables vs. Incobrables) y exportación a Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de Año */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-0.5">Año</label>
            <select
              value={anio}
              onChange={e => setAnio(e.target.value)}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-bold text-[#016098] bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              {['2026', '2025', '2024', '2023', '2022', '2021', '2020'].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Mes */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-0.5">Mes en Foco (KPIs)</label>
            <select
              value={mesSeleccionado}
              onChange={e => {
                const m = Number(e.target.value);
                setMesSeleccionado(m);
                if (mostrarDetalle) abrirDetalleMes(m);
              }}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value={0}>Todo el Año ({anio})</option>
              {mesesData.map(m => (
                <option key={m.Mes} value={m.Mes}>
                  {m.MesNombre} ({m.TotalLicencias} lic.)
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Criterio de Fecha */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-0.5">Criterio Mes</label>
            <select
              value={criterio}
              onChange={e => setCriterio(e.target.value as 'recepcion' | 'desde')}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="desde">Por Fecha Inicio Reposo (Desde)</option>
              <option value="recepcion">Por Fecha Recepción (Tramitadas)</option>
            </select>
          </div>

          {/* Selector de Sector */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-0.5">Sector</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Todos (Educación + Salud)</option>
              <option value="educacion">Solo Educación</option>
              <option value="salud">Solo Salud</option>
            </select>
          </div>

          <div className="pt-3.5 flex gap-2">
            <button
              onClick={() => setMostrarModalCobro(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Análisis Por Cobrar / Rechazadas
            </button>
            <button
              onClick={() => abrirDetalleMes(mesSeleccionado)}
              className="px-3.5 py-1.5 bg-[#016098] hover:bg-[#014b78] text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Ver Detalle ({tituloPeriodoActivo})
            </button>
            <button
              onClick={exportarResumenExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Exportar Resumen Excel
            </button>
          </div>
        </div>
      </div>

      {/* Tarjetas KPI del Período en Foco */}
      {kpiActivo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#475569]">
              Indicadores del Período Seleccionado:{' '}
              <span className="text-[#016098] underline">{tituloPeriodoActivo}</span>{' '}
              <span className="text-[#64748b] font-normal">
                ({criterio === 'desde' ? 'Criterio: Fecha Inicio Reposo' : 'Criterio: Fecha Recepción'})
              </span>
            </span>
            {mesSeleccionado > 0 && (
              <button
                onClick={() => setMesSeleccionado(0)}
                className="text-xs font-semibold text-[#016098] hover:underline"
              >
                Volver a ver Acumulado Anual {anio}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            {/* KPI 1: Total Licencias Convenio Tramitadas */}
            <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e2e8f0] border-l-4 border-l-[#016098]">
              <p className="text-[11px] font-bold text-[#64748b] uppercase">Lic. Convenio Tramitadas</p>
              <p className="text-2xl font-extrabold text-[#016098] mt-1">
                {Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] text-[#475569] mt-1">
                <span className="font-semibold">{Number(kpiActivo.TotalDias || 0).toLocaleString('es-CL')}</span> días otorg. ·{' '}
                <span className="font-semibold">{Number(kpiActivo.TotalDiasAut || 0).toLocaleString('es-CL')}</span> aut.
              </p>
            </div>

            {/* KPI 2: Pago Estimado Total */}
            <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e2e8f0] border-l-4 border-l-[#39BABD]">
              <p className="text-[11px] font-bold text-[#64748b] uppercase">Pago Estimado Total</p>
              <p className="text-xl font-extrabold text-[#1e293b] mt-1">{formatCLP(kpiActivo.TotalEstimado)}</p>
              <p className="text-[11px] text-[#64748b] mt-1">
                Subsidio estimado a recuperar
              </p>
            </div>

            {/* KPI 3: Pago Recibido */}
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200 border-l-4 border-l-emerald-600">
              <p className="text-[11px] font-bold text-emerald-800 uppercase">Pago Recibido (Real)</p>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">{formatCLP(kpiActivo.TotalPagado)}</p>
              <p className="text-[10px] text-emerald-900 mt-1">
                Sub: <span className="font-bold">{formatCLP(kpiActivo.PagadoSubsidio)}</span> · Apo:{' '}
                <span className="font-bold">{formatCLP(kpiActivo.PagadoAporte)}</span>
              </p>
            </div>

            {/* KPI 4: Falta por Cobrar (Interactivo -> abre Modal de Desglose) */}
            <div
              onClick={() => setMostrarModalCobro(true)}
              className="bg-amber-50/60 hover:bg-amber-100/70 cursor-pointer transition-colors rounded-xl p-4 border border-amber-200 border-l-4 border-l-amber-500"
              title="Haga clic para ver el desglose entre Entidades de Salud y Licencias Rechazadas (Recuperables vs. Incobrables)"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-amber-900 uppercase">Falta por Cobrar (Salud)</p>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                  Ver Desglose 🔍
                </span>
              </div>
              <p className="text-xl font-extrabold text-amber-700 mt-1">{formatCLP(kpiActivo.FaltaPorCobrar)}</p>
              <p className="text-[11px] text-amber-900 mt-1">
                <span className="font-bold">{Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')}</span> lic. no rechazadas en $0
              </p>
            </div>

            {/* KPI 5: % Pago Financiero */}
            <div className="bg-sky-50/60 rounded-xl p-4 border border-sky-200 border-l-4 border-l-[#016098]">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-[#016098] uppercase">% Pago (Monto)</p>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {kpiActivo.PorcentajePago}%
                </span>
              </div>
              <p className="text-2xl font-extrabold text-[#016098] mt-1">{kpiActivo.PorcentajePago}%</p>
              <div className="w-full bg-slate-200 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(Number(kpiActivo.PorcentajePago || 0), 100)}%` }}
                />
              </div>
            </div>

            {/* KPI 6: Cobertura y Rechazos (Interactivo -> abre Modal de Desglose) */}
            <div
              onClick={() => setMostrarModalCobro(true)}
              className="bg-[#f8fafc] hover:bg-rose-50/50 cursor-pointer transition-colors rounded-xl p-4 border border-[#e2e8f0] border-l-4 border-l-[#EB567F]"
              title="Haga clic para ver el desglose de Licencias Rechazadas: Recuperables (Vigentes) vs. Incobrables (No Vigentes)"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-[#64748b] uppercase">Cobertura y Rechazos</p>
                <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                  Desglose 🔍
                </span>
              </div>
              <div className="mt-1 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#475569]">Cobertura Lic. Pagadas:</span>
                  <span className="font-bold text-emerald-700">{kpiActivo.PorcentajeCobertura}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rose-700 font-semibold">
                    Rechazadas ({Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')}):
                  </span>
                  <span className="font-bold text-rose-700">{formatCLP(kpiActivo.MontoRechazado)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-0.5 border-t border-slate-200">
                  <span className="text-indigo-700 font-semibold" title="Funcionarios Vigentes (Descuento por Remuneraciones)">
                    Recup. Vig.: {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')}
                  </span>
                  <span className="text-rose-800 font-semibold" title="Funcionarios No Vigentes (Incobrables)">
                    Incob.: {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjetones de Desglose: Relación Falta por Cobrar vs. Licencias Rechazadas (Recuperables e Incobrables) */}
          <div className="bg-slate-50/90 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-[#016098] uppercase tracking-wide">
                  Desglose de Licencias por Cobrar y Escenarios de Licencias Rechazadas ({tituloPeriodoActivo})
                </h3>
                <p className="text-[11px] text-[#64748b]">
                  Separación entre saldos pendientes de pago por instituciones de salud y licencias rechazadas según vigencia del funcionario (recuperables por remuneraciones vs. incobrables).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalCobro(true)}
                className="px-3 py-1 bg-white border border-[#016098] text-[#016098] hover:bg-[#016098] hover:text-white text-xs font-bold rounded-lg transition-colors self-start sm:self-auto"
              >
                Abrir Resumen Explicativo en Modal
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Tarjeta A: Pendientes de Cobro a Entidad de Salud (No Rechazadas) */}
              <div className="bg-white rounded-lg p-3.5 border border-amber-200 border-l-4 border-l-amber-500 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                      1. Entidades de Salud (No Rech.)
                    </span>
                    <span className="text-xs font-bold text-amber-800">
                      {Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} en $0
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-amber-700 mt-2">{formatCLP(kpiActivo.FaltaPorCobrar)}</p>
                  <p className="text-[11px] text-[#475569] mt-1">
                    <b>{Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')}</b> licencias sin pago ($0) y{' '}
                    <b>{Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')}</b> con saldo pendiente de FONASA / ISAPRE.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => abrirDetalleMes(mesSeleccionado, 'por-cobrar')}
                  className="mt-2.5 w-full py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold transition-colors"
                >
                  Ver Nómina Por Cobrar Salud →
                </button>
              </div>

              {/* Tarjeta B: Rechazadas Recuperables (Funcionario Vigente - Descuento Remuneraciones) */}
              <div className="bg-white rounded-lg p-3.5 border border-indigo-200 border-l-4 border-l-indigo-600 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                      2. Rechazadas Recuperables
                    </span>
                    <span className="text-xs font-bold text-indigo-800">
                      {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-indigo-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoRecuperable)}
                  </p>
                  <p className="text-[11px] text-[#475569] mt-1">
                    <b>Funcionario Vigente:</b> Susceptible de recuperar mediante descuento por remuneraciones al trabajador activo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => abrirDetalleMes(mesSeleccionado, 'rech-recuperables')}
                  className="mt-2.5 w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-md text-[11px] font-bold transition-colors"
                >
                  Ver Rechazadas Recuperables ({Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')}) →
                </button>
              </div>

              {/* Tarjeta C: Rechazadas Incobrables (Funcionario No Vigente / Finiquitado) */}
              <div className="bg-white rounded-lg p-3.5 border border-rose-200 border-l-4 border-l-rose-600 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-900">
                      3. Rechazadas Incobrables
                    </span>
                    <span className="text-xs font-bold text-rose-800">
                      {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-rose-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoIncobrable)}
                  </p>
                  <p className="text-[11px] text-[#475569] mt-1">
                    <b>Funcionario No Vigente:</b> Ex-funcionarios desvinculados de la Corporación (no se puede descontar por planilla).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => abrirDetalleMes(mesSeleccionado, 'rech-incobrables')}
                  className="mt-2.5 w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 rounded-md text-[11px] font-bold transition-colors"
                >
                  Ver Rechazadas Incobrables ({Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')}) →
                </button>
              </div>

              {/* Tarjeta D: Rechazadas Ya Recuperadas / Pagadas */}
              <div className="bg-white rounded-lg p-3.5 border border-emerald-200 border-l-4 border-l-emerald-600 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                      4. Rechazadas Recuperadas
                    </span>
                    <span className="text-xs font-bold text-emerald-800">
                      {Number(kpiActivo.RechazadasRecuperadasCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-lg font-extrabold text-emerald-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoRecuperado)}
                  </p>
                  <p className="text-[11px] text-[#475569] mt-1">
                    Licencias marcadas con rechazo que ya registran pago/reintegro en el sistema (de un total de{' '}
                    <b>{Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')}</b> rechazadas).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => abrirDetalleMes(mesSeleccionado, 'rech-recuperadas')}
                  className="mt-2.5 w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md text-[11px] font-bold transition-colors"
                >
                  Ver Rechazadas Recuperadas ({Number(kpiActivo.RechazadasRecuperadasCant || 0).toLocaleString('es-CL')}) →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Explicativo e Interactivo de Saldos por Cobrar y Licencias Rechazadas */}
      {mostrarModalCobro && kpiActivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#016098] text-white uppercase">
                  Radiografía de Cobranza y Rechazos
                </span>
                <h3 className="text-lg font-extrabold text-[#1e293b] mt-1">
                  Desglose de Licencias por Cobrar y Escenarios de Rechazo — {tituloPeriodoActivo}
                </h3>
                <p className="text-xs text-[#64748b]">
                  Cuadratura completa de licencias pendientes de pago y clasificación de licencias rechazadas según vigencia del funcionario en la Corporación.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalCobro(false)}
                className="px-3 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                Cerrar ✕
              </button>
            </div>

            {/* Resumen Cuadratura de Rechazadas */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1e293b] uppercase">
                  Cuadratura Total Licencias Rechazadas del Período:{' '}
                  <span className="text-rose-700 text-sm font-extrabold">
                    {Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} licencias
                  </span>{' '}
                  ({formatCLP(kpiActivo.MontoRechazado)} estimado)
                </span>
                <span className="text-xs font-semibold text-[#475569]">
                  = {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} Recuperables (Vigentes) +{' '}
                  {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} Incobrables (No Vigentes) +{' '}
                  {Number(kpiActivo.RechazadasRecuperadasCant || 0).toLocaleString('es-CL')} Ya Recuperadas
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] font-bold text-[#64748b] uppercase">
                    Saldo Pendiente Entidades Salud (No Rechazadas)
                  </p>
                  <p className="text-xl font-extrabold text-amber-700 mt-0.5">{formatCLP(kpiActivo.FaltaPorCobrar)}</p>
                  <p className="text-[11px] text-[#475569]">
                    {Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} licencias en $0 ·{' '}
                    {Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} con saldo por cobrar a FONASA/ISAPRE
                  </p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] font-bold text-[#64748b] uppercase">
                    Saldo Total General sin Recuperar (Salud + Rechazadas Pend.)
                  </p>
                  <p className="text-xl font-extrabold text-[#016098] mt-0.5">
                    {formatCLP(kpiActivo.FaltaPorCobrarTotal)}
                  </p>
                  <p className="text-[11px] text-[#475569]">
                    Incluye {formatCLP(kpiActivo.MontoRechazadoRecuperable)} recuperable por planilla y{' '}
                    {formatCLP(kpiActivo.MontoRechazadoIncobrable)} incobrable
                  </p>
                </div>
              </div>
            </div>

            {/* Tarjetas de Acción Rápida del Modal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Escenario 1: Rechazadas Recuperables */}
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white">
                    Escenario A · Recuperables (Funcionario Vigente)
                  </span>
                  <span className="text-sm font-extrabold text-indigo-900">
                    {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} licencias
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-indigo-700">
                  {formatCLP(kpiActivo.MontoRechazadoRecuperable)}
                </p>
                <p className="text-xs text-[#334155]">
                  Corresponde a licencias rechazadas con saldo pendiente cuyos funcionarios se encuentran{' '}
                  <b>Vigentes (&apos;S&apos;)</b> en la Corporación. Este monto <b>se puede recuperar</b> mediante descuento en sus remuneraciones.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalCobro(false);
                    abrirDetalleMes(mesSeleccionado, 'rech-recuperables');
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                >
                  Ver Detalle y Exportar a Excel ({Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} lic.)
                </button>
              </div>

              {/* Escenario 2: Rechazadas Incobrables */}
              <div className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                    Escenario B · Incobrables (Funcionario No Vigente)
                  </span>
                  <span className="text-sm font-extrabold text-rose-900">
                    {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} licencias
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-rose-700">
                  {formatCLP(kpiActivo.MontoRechazadoIncobrable)}
                </p>
                <p className="text-xs text-[#334155]">
                  Corresponde a licencias rechazadas con saldo pendiente de ex-funcionarios que{' '}
                  <b>Ya No Pertenecen a la Corporación (No Vigentes)</b>. No es posible descontar por remuneraciones (riesgo de incobrabilidad).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalCobro(false);
                    abrirDetalleMes(mesSeleccionado, 'rech-incobrables');
                  }}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                >
                  Ver Detalle y Exportar a Excel ({Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} lic.)
                </button>
              </div>

              {/* Escenario 3: Por Cobrar a Entidad de Salud (No Rechazadas) */}
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-600 text-white">
                    Por Cobrar a Entidad de Salud (No Rechazadas)
                  </span>
                  <span className="text-sm font-extrabold text-amber-900">
                    {Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} lic. en $0
                  </span>
                </div>
                <p className="text-xl font-extrabold text-amber-700">{formatCLP(kpiActivo.FaltaPorCobrar)}</p>
                <p className="text-xs text-[#334155]">
                  Licencias tramitadas sin rechazo pendientes de pago o reembolso por parte de FONASA, ISAPRE o CCAF.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalCobro(false);
                    abrirDetalleMes(mesSeleccionado, 'por-cobrar');
                  }}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                >
                  Ver Nómina Por Cobrar Salud
                </button>
              </div>

              {/* Escenario 4: Rechazadas Ya Recuperadas */}
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">
                    Rechazadas Ya Recuperadas / Regularizadas
                  </span>
                  <span className="text-sm font-extrabold text-emerald-900">
                    {Number(kpiActivo.RechazadasRecuperadasCant || 0).toLocaleString('es-CL')} licencias
                  </span>
                </div>
                <p className="text-xl font-extrabold text-emerald-700">
                  {formatCLP(kpiActivo.MontoRechazadoRecuperado)}
                </p>
                <p className="text-xs text-[#334155]">
                  Licencias que tuvieron rechazo pero ya cuentan con pago o reintegro registrado por apelación o descuento.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalCobro(false);
                    abrirDetalleMes(mesSeleccionado, 'rech-recuperadas');
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                >
                  Ver Rechazadas Ya Recuperadas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico Mensual: Pago Estimado vs Pago Recibido vs Falta por Cobrar */}
      {mesesData.length > 0 && (
        <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e2e8f0]">
          <h3 className="text-xs font-bold text-[#016098] uppercase tracking-wider mb-3">
            Comparativa Mensual {anio}: Pago Estimado vs Pago Recibido vs Falta por Cobrar ($)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mesesData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="MesCorto" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={val => `$${Math.round(val / 1000000)}M`}
                />
                <RechartsTooltip
                  formatter={(value: any) => formatCLP(Number(value))}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="TotalEstimado" name="Pago Estimado ($)" fill="#016098" radius={[4, 4, 0, 0]} />
                <Bar dataKey="TotalPagado" name="Pago Recibido ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="FaltaPorCobrar" name="Falta por Cobrar Salud ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla Resumen Mensual (Enero a Diciembre) */}
      <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f1f5f9] text-[#475569] font-bold">
            <tr>
              <th className="p-2.5">Mes</th>
              <th className="p-2.5 text-center">Lic. Tramitadas</th>
              <th className="p-2.5 text-center">Con Pago / $0 / Rech.</th>
              <th className="p-2.5 text-center" title="Rechazadas Recuperables (Vigentes) vs Incobrables (No Vigentes)">
                Rech: Recup. / Incob.
              </th>
              <th className="p-2.5 text-right">Pago Estimado ($)</th>
              <th className="p-2.5 text-right">Pago Recibido ($)</th>
              <th className="p-2.5 text-right">Falta Cobrar Salud ($)</th>
              <th className="p-2.5 text-right">Rech. Recuperable ($)</th>
              <th className="p-2.5 text-right">Rech. Incobrable ($)</th>
              <th className="p-2.5 text-center">% Pago ($)</th>
              <th className="p-2.5 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0]">
            {cargando ? (
              <tr>
                <td colSpan={11} className="p-6 text-center text-[#64748b]">
                  Calculando indicadores mensuales de licencias con convenio...
                </td>
              </tr>
            ) : (
              mesesData.map(m => {
                const activo = mesSeleccionado === m.Mes;
                return (
                  <tr
                    key={m.Mes}
                    onClick={() => setMesSeleccionado(m.Mes)}
                    className={`cursor-pointer transition-colors ${
                      activo ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    <td className="p-2.5 font-bold text-[#016098]">{m.MesNombre}</td>
                    <td className="p-2.5 text-center font-bold">{m.TotalLicencias.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-center">
                      <span className="text-emerald-700 font-semibold">{m.LicenciasPagadas}</span> /{' '}
                      <span className="text-amber-700 font-semibold">{m.LicenciasSinPago}</span> /{' '}
                      <span className="text-rose-700 font-semibold">{m.LicenciasRechazadas}</span>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="text-indigo-700 font-bold" title="Funcionarios Vigentes (Descuento Remuneraciones)">
                        {m.RechazadasRecuperablesCant}
                      </span>{' '}
                      /{' '}
                      <span className="text-rose-700 font-bold" title="Funcionarios No Vigentes (Incobrables)">
                        {m.RechazadasIncobrablesCant}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-semibold">{formatCLP(m.TotalEstimado)}</td>
                    <td className="p-2.5 text-right font-bold text-emerald-700">{formatCLP(m.TotalPagado)}</td>
                    <td className="p-2.5 text-right font-bold text-amber-700">{formatCLP(m.FaltaPorCobrar)}</td>
                    <td className="p-2.5 text-right font-semibold text-indigo-700">
                      {formatCLP(m.MontoRechazadoRecuperable)}
                    </td>
                    <td className="p-2.5 text-right font-semibold text-rose-700">
                      {formatCLP(m.MontoRechazadoIncobrable)}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          m.PorcentajePago >= 85
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.PorcentajePago >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.PorcentajePago}%
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          abrirDetalleMes(m.Mes);
                        }}
                        className="px-2.5 py-1 bg-[#016098] hover:bg-[#014b78] text-white text-[11px] font-bold rounded-md transition-colors"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {/* Fila TOTAL ANUAL */}
            {totalesAnuales && !cargando && (
              <tr className="bg-[#f1f5f9] font-extrabold text-[#1e293b] border-t-2 border-[#cbd5e1]">
                <td className="p-2.5 text-[#016098]">TOTAL ANUAL {anio}</td>
                <td className="p-2.5 text-center">{totalesAnuales.TotalLicencias.toLocaleString('es-CL')}</td>
                <td className="p-2.5 text-center">
                  <span className="text-emerald-700">{totalesAnuales.LicenciasPagadas}</span> /{' '}
                  <span className="text-amber-700">{totalesAnuales.LicenciasSinPago}</span> /{' '}
                  <span className="text-rose-700">{totalesAnuales.LicenciasRechazadas}</span>
                </td>
                <td className="p-2.5 text-center">
                  <span className="text-indigo-700">{totalesAnuales.RechazadasRecuperablesCant}</span> /{' '}
                  <span className="text-rose-700">{totalesAnuales.RechazadasIncobrablesCant}</span>
                </td>
                <td className="p-2.5 text-right">{formatCLP(totalesAnuales.TotalEstimado)}</td>
                <td className="p-2.5 text-right text-emerald-700">{formatCLP(totalesAnuales.TotalPagado)}</td>
                <td className="p-2.5 text-right text-amber-700">{formatCLP(totalesAnuales.FaltaPorCobrar)}</td>
                <td className="p-2.5 text-right text-indigo-700">
                  {formatCLP(totalesAnuales.MontoRechazadoRecuperable)}
                </td>
                <td className="p-2.5 text-right text-rose-700">
                  {formatCLP(totalesAnuales.MontoRechazadoIncobrable)}
                </td>
                <td className="p-2.5 text-center text-[#016098]">{totalesAnuales.PorcentajePago}%</td>
                <td className="p-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => abrirDetalleMes(0)}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold rounded-md"
                  >
                    Ver Todo {anio}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Panel Desplegable de Detalle de Licencias del Mes / Año */}
      {mostrarDetalle && (
        <div className="bg-[#f8fafc] rounded-xl border-2 border-[#016098]/30 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[#e2e8f0] pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-[#016098] uppercase">
                  Detalle de Licencias con Convenio —{' '}
                  {mesDetalle > 0
                    ? `${mesesData.find(m => m.Mes === mesDetalle)?.MesNombre || ''} ${anio}`
                    : `Año Completo ${anio}`}{' '}
                  ({registrosDetalleFiltrados.length} registros)
                </h3>
                {promedioDiasDemora !== null && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-[#016098]">
                    Promedio Demora de Pago: {promedioDiasDemora} días
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748b] mt-0.5">
                Filtre por situación de cobro o escenario de rechazo (Recuperables Vigentes vs. Incobrables No Vigentes), ordene por demora o exporte a Excel
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportarDetalleExcel}
                disabled={registrosDetalleFiltrados.length === 0}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
              >
                Exportar Detalle a Excel ({registrosDetalleFiltrados.length})
              </button>
              <button
                onClick={() => setMostrarDetalle(false)}
                className="px-3 py-1.5 border border-[#cbd5e1] text-[#475569] text-xs font-bold rounded-lg hover:bg-white"
              >
                Cerrar Detalle ✕
              </button>
            </div>
          </div>

          {/* Barra de filtros del detalle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'todas', label: `Todas (${registrosDetalle.length})` },
                {
                  id: 'por-cobrar',
                  label: `Por Cobrar Salud (${registrosDetalle.filter(r => Number(r.FaltaPorCobrar || 0) > 0 && !r.Rechazo).length})`
                },
                {
                  id: 'sin-pago',
                  label: `Sin Pago $0 No Rech. (${registrosDetalle.filter(r => Number(r.MontoPagado || 0) === 0 && !r.Rechazo).length})`
                },
                {
                  id: 'rech-recuperables',
                  label: `Rech. Recuperables Vigentes (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_RECUPERABLE').length})`
                },
                {
                  id: 'rech-incobrables',
                  label: `Rech. Incobrables No Vig. (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_INCOBRABLE').length})`
                },
                {
                  id: 'rech-recuperadas',
                  label: `Rech. Recuperadas (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_RECUPERADA').length})`
                },
                {
                  id: 'rechazadas',
                  label: `Total Rechazadas (${registrosDetalle.filter(r => r.Rechazo).length})`
                },
                {
                  id: 'pagadas',
                  label: `Con Pago (${registrosDetalle.filter(r => Number(r.MontoPagado || 0) > 0).length})`
                }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroEstadoDet(f.id as FiltroDetalleTipo)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    filtroEstadoDet === f.id
                      ? 'bg-[#016098] text-white shadow-sm'
                      : 'bg-white border border-[#cbd5e1] text-[#475569] hover:bg-[#f1f5f9]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={busquedaDet}
                onChange={e => setBusquedaDet(e.target.value)}
                placeholder="Buscar N° Licencia, RUT, Nombre, Salud, Obs Compin..."
                className="w-72 px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (ordenCampoDet === 'fecha') {
                    setOrdenFechaDet(prev => (prev === 'desc' ? 'asc' : 'desc'));
                  } else {
                    setOrdenCampoDet('fecha');
                    setOrdenFechaDet('desc');
                  }
                }}
                className={`px-3 py-1.5 border text-xs font-bold rounded-lg ${
                  ordenCampoDet === 'fecha'
                    ? 'bg-[#016098] text-white border-[#016098]'
                    : 'bg-white border-[#cbd5e1] text-[#016098] hover:bg-[#f1f5f9]'
                }`}
              >
                Fecha {ordenCampoDet === 'fecha' ? (ordenFechaDet === 'desc' ? '▼' : '▲') : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ordenCampoDet === 'demora') {
                    setOrdenFechaDet(prev => (prev === 'desc' ? 'asc' : 'desc'));
                  } else {
                    setOrdenCampoDet('demora');
                    setOrdenFechaDet('desc');
                  }
                }}
                className={`px-3 py-1.5 border text-xs font-bold rounded-lg ${
                  ordenCampoDet === 'demora'
                    ? 'bg-[#016098] text-white border-[#016098]'
                    : 'bg-white border-[#cbd5e1] text-[#016098] hover:bg-[#f1f5f9]'
                }`}
              >
                Demora Pago {ordenCampoDet === 'demora' ? (ordenFechaDet === 'desc' ? '▼' : '▲') : ''}
              </button>
            </div>
          </div>

          {/* Grilla Detalle */}
          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white max-h-[480px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] font-bold sticky top-0">
                <tr>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5 text-center">Vigencia</th>
                  <th className="p-2.5">Situación Cobro / Rechazo</th>
                  <th className="p-2.5">Establecimiento</th>
                  <th className="p-2.5">Salud</th>
                  <th className="p-2.5">Recepción</th>
                  <th className="p-2.5">Desde</th>
                  <th className="p-2.5">Fecha Pago</th>
                  <th className="p-2.5 text-center">Demora Pago</th>
                  <th className="p-2.5 text-center">Días</th>
                  <th className="p-2.5 text-right">Pago Estimado</th>
                  <th className="p-2.5 text-right">Pago Recibido</th>
                  <th className="p-2.5 text-right">Saldo Pendiente</th>
                  <th className="p-2.5 text-center">% Pago</th>
                  <th className="p-2.5">Observación Compin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {cargandoDetalle ? (
                  <tr>
                    <td colSpan={17} className="p-6 text-center text-[#64748b]">
                      Cargando detalle de licencias con convenio...
                    </td>
                  </tr>
                ) : registrosDetalleFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-6 text-center text-[#94a3b8]">
                      No se encontraron licencias para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  registrosDetalleFiltrados.slice(0, 500).map(r => {
                    const est = Number(r.PagoEstimado || 0);
                    const pag = Number(r.MontoPagado || 0);
                    const saldoPend = Number(r.SaldoPendiente ?? r.FaltaPorCobrar ?? 0);
                    const pct = est > 0 ? Math.round((pag / est) * 100) : 0;
                    const demora =
                      r.DiasDemoraPago !== null && r.DiasDemoraPago !== undefined ? Number(r.DiasDemoraPago) : null;
                    const esVigente = r.Vigencia === 'S';
                    return (
                      <tr key={r.NumeroLicencia} className="hover:bg-[#f8fafc]">
                        <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          {r.Rut}-{r.DV}
                        </td>
                        <td className="p-2.5 font-semibold truncate max-w-[170px]" title={r.Funcionario}>
                          {r.Funcionario}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              esVigente ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {esVigente ? 'Vigente' : 'No Vigente'}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {r.EscenarioCobro === 'RECHAZADA_RECUPERABLE' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900">
                              Rech. Recuperable (Desc. Remun.)
                            </span>
                          ) : r.EscenarioCobro === 'RECHAZADA_INCOBRABLE' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900">
                              Rech. Incobrable (No Vigente)
                            </span>
                          ) : r.EscenarioCobro === 'RECHAZADA_RECUPERADA' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                              Rech. Ya Recuperada
                            </span>
                          ) : r.EscenarioCobro === 'POR_COBRAR_SALUD' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                              Por Cobrar Salud
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {r.SituacionCobroLabel || 'Pagada'}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 truncate max-w-[140px]" title={r.Establecimiento}>
                          {r.Establecimiento}
                        </td>
                        <td className="p-2.5">{r.Salud}</td>
                        <td className="p-2.5 whitespace-nowrap">{formatDateDDMMYYYY(r.Recepcion)}</td>
                        <td className="p-2.5 whitespace-nowrap">{formatDateDDMMYYYY(r.Desde)}</td>
                        <td className="p-2.5 whitespace-nowrap font-semibold text-emerald-700">
                          {r.FechaPago ? (
                            formatDateDDMMYYYY(r.FechaPago)
                          ) : (
                            <span className="text-slate-400 font-normal">Sin pago</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {demora !== null ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                demora <= 30
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : demora <= 60
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                              title="Días transcurridos entre Fecha de Recepción de la licencia y Fecha de Pago"
                            >
                              {demora} días
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">{r.NumDias}</td>
                        <td className="p-2.5 text-right">{formatCLP(est)}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">{formatCLP(pag)}</td>
                        <td className="p-2.5 text-right font-bold text-amber-700">{formatCLP(saldoPend)}</td>
                        <td className="p-2.5 text-center font-bold">{pct}%</td>
                        <td className="p-2.5 truncate max-w-[200px] text-[#016098]" title={r.Observacion_Compin}>
                          {r.Observacion_Compin || r.Obser_apelacion || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {registrosDetalleFiltrados.length > 500 && (
              <div className="p-2.5 bg-amber-50 text-amber-900 text-xs text-center font-medium border-t border-amber-200">
                Mostrando las primeras 500 filas en pantalla para fluidez visual. Al presionar{' '}
                <b>Exportar Detalle a Excel</b> se descargan los <b>{registrosDetalleFiltrados.length}</b> registros completos.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
