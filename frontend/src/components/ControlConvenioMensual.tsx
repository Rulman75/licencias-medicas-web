import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { exportToCorporatePDF } from '../utils/exportUtils';
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
  LicenciasPagoParcialSalud?: number;
  LicenciasPorCobrarSalud: number;
  LicenciasSobrepago: number;
  LicenciasRechazadas: number;
  AutorizadasPorPagoSaludCant?: number;
  FalsosRechazosPagadosCant: number;
  FalsosRechazosDobleCobroCant: number;
  FalsosRechazosCompinCant: number;
  RechazadasRecuperadasDescCant: number;
  RechazadasRecuperablesCant: number;
  RechazadasIncobrablesCant: number;
  RechazadasRecuperadasCant: number;
  LicenciasReducidas: number;
  DiasSubsidio: number;
  DiasAporte: number;
  DiasDescuento: number;
  TotalEstimado: number;
  EstimadoNoRechazado: number;
  TotalPagado: number;
  PagadoNoRechazado: number;
  PagadoSubsidio: number;
  PagadoAporte: number;
  PagadoSaludTotal: number;
  PagadoDescuentoFunc: number;
  FaltaPorCobrar: number;
  ExcedenteSobreEstimado: number;
  MontoRechazado: number;
  MontoRechazadoRecuperable: number;
  MontoRechazadoIncobrable: number;
  MontoRechazadoRecuperado: number;
  MontoAutorizadasPorPagoSalud?: number;
  MontoFalsoRechazoSalud: number;
  MontoRechazadoDescuentoFunc: number;
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
  | 'falso-rechazo-salud'
  | 'falso-rechazo-doble'
  | 'falso-rechazo-compin'
  | 'rech-recuperables'
  | 'rech-incobrables'
  | 'rech-recuperadas';

const ETIQUETAS_FILTRO: Record<FiltroDetalleTipo, string> = {
  'todas': 'Todas las Licencias del Período',
  'por-cobrar': 'Pendientes por Cobrar a Instituciones de Salud (Según regla FONASA ≤3d / >3d e ISAPRE)',
  'sin-pago': 'Licencias No Rechazadas en $0 (Sin Pago de Inst. de Salud aún)',
  'pagadas': 'Licencias Válidas Saldadas por Inst. de Salud (FONASA ≤3d Aporte, >3d Aporte+Subsidio, ISAPRE Pago)',
  'rechazadas': 'Todas las Licencias Marcadas como Rechazadas',
  'falso-rechazo-salud': '⚡ Licencias Autorizadas Automáticamente por Recibo de Pago Inst. Salud (AUT_PAGO_SALUD)',
  'falso-rechazo-doble': '🚨 Doble Cobro: Pagadas por Inst. de Salud y además con Descuento al Funcionario',
  'falso-rechazo-compin': '✅ Observación COMPIN dice "Autorizada / Ampliada"',
  'rech-recuperables': 'Rechazadas Recuperables (Funcionario Vigente — Descuento por Remuneraciones)',
  'rech-incobrables': 'Rechazadas Incobrables (Funcionario No Vigente / Finiquitado)',
  'rech-recuperadas': 'Rechazadas Ya Recuperadas (Descuento por Remuneraciones)'
};

interface ControlConvenioMensualProps {
  initialYear?: string;
}

export default function ControlConvenioMensual({ initialYear }: ControlConvenioMensualProps) {
  const defaultYear =
    initialYear !== undefined ? (initialYear === '' ? 'historico' : initialYear) : String(new Date().getFullYear());
  const [anio, setAnio] = useState<string>(defaultYear);
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(0); // 0 = Acumulado Anual / Histórico
  const [criterio, setCriterio] = useState<'recepcion' | 'desde'>('desde');
  const [sector, setSector] = useState<string>('');
  const [vistaInferior, setVistaInferior] = useState<'tabla' | 'grafico'>('tabla');

  const [mesesData, setMesesData] = useState<MesConvenioRow[]>([]);
  const [totalesAnuales, setTotalesAnuales] = useState<any>(null);
  const [cargando, setCargando] = useState<boolean>(false);

  // Modal de Detalle de Licencias (Se abre en ventana modal centrada para no perderse en la página)
  const [mostrarDetalle, setMostrarDetalle] = useState<boolean>(false);
  const [mesDetalle, setMesDetalle] = useState<number>(0);
  const [registrosDetalle, setRegistrosDetalle] = useState<any[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);
  const [filtroEstadoDet, setFiltroEstadoDet] = useState<FiltroDetalleTipo>('todas');
  const [busquedaDet, setBusquedaDet] = useState<string>('');
  const [ordenCampoDet, setOrdenCampoDet] = useState<'fecha' | 'demora'>('fecha');
  const [ordenFechaDet, setOrdenFechaDet] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (initialYear !== undefined) {
      const normalized = initialYear === '' ? 'historico' : initialYear;
      if (normalized !== anio) {
        setAnio(normalized);
      }
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

  // Abre el modal de detalle cargando el mes/año solicitado y posicionando el filtro elegido
  const abrirModalDetalle = async (mesNum: number, filtroInicial: FiltroDetalleTipo = 'todas') => {
    setFiltroEstadoDet(filtroInicial);
    setBusquedaDet('');
    setMostrarDetalle(true);

    // Si ya tenemos cargado el mismo mes/año, no recargamos de nuevo innecesariamente
    if (registrosDetalle.length > 0 && mesDetalle === mesNum) {
      return;
    }

    setMesDetalle(mesNum);
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

  const esHistorico = anio === 'historico' || anio === '';
  const etiquetaAnioCorto = esHistorico ? 'Histórico' : anio;

  // Datos activos para los indicadores superiores (Mes seleccionado o Total Anual / Histórico)
  const kpiActivo =
    mesSeleccionado > 0
      ? mesesData.find(m => m.Mes === mesSeleccionado) || totalesAnuales
      : totalesAnuales;

  const tituloPeriodoActivo =
    mesSeleccionado > 0
      ? `${mesesData.find(m => m.Mes === mesSeleccionado)?.MesNombre || ''} (${etiquetaAnioCorto})`
      : esHistorico
      ? 'Histórico (Todos los años)'
      : `Año Completo ${anio}`;

  // Exportar tabla resumen mensual a Excel
  const exportarResumenExcel = () => {
    if (mesesData.length === 0) return;
    const armarFila = (m: any, nombreMes: string) => ({
      'Año / Período': esHistorico ? 'Histórico (Todos los años)' : anio,
      'Mes': nombreMes,
      'Criterio Fecha': criterio === 'recepcion' ? 'Mes Recepción (Tramitadas)' : 'Mes Inicio Reposo (Desde)',
      'Licencias Convenio Tramitadas': m.TotalLicencias,
      'Licencias con Pago': m.LicenciasPagadas,
      'Licencias Sin Pago ($0 No Rech.)': m.LicenciasSinPago,
      'Licencias Por Cobrar a Inst. de Salud': m.LicenciasPorCobrarSalud,
      'Licencias Rechazadas (Total)': m.LicenciasRechazadas,
      'Falsos Rechazos (Pagados por Inst. de Salud)': m.FalsosRechazosPagadosCant,
      'Falsos Rechazos con Doble Cobro (Inst. Salud + Desc.)': m.FalsosRechazosDobleCobroCant,
      'Falsos Rechazos (COMPIN Autorizada)': m.FalsosRechazosCompinCant,
      'Rech. Recuperables (Vigentes)': m.RechazadasRecuperablesCant,
      'Rech. Incobrables (No Vigentes)': m.RechazadasIncobrablesCant,
      'Rech. Recuperadas por Descuento/Devol.': m.RechazadasRecuperadasDescCant,
      'Pago Estimado Total ($)': m.TotalEstimado,
      'Pago Estimado No Rechazadas ($)': m.EstimadoNoRechazado,
      'Pago Estimado Rechazadas ($)': m.MontoRechazado,
      'Pagado por Inst. de Salud Total (Sub+Apo) ($)': m.PagadoSaludTotal,
      'Recibido Subsidio Inst. Salud ($)': m.PagadoSubsidio,
      'Recibido Aporte Inst. Salud ($)': m.PagadoAporte,
      'Recuperado por Descuento/Devol. Funcionario ($)': m.PagadoDescuentoFunc,
      'Falta por Cobrar a Inst. de Salud ($)': m.FaltaPorCobrar,
      'Monto Rech. Recuperable Vigentes ($)': m.MontoRechazadoRecuperable,
      'Monto Rech. Incobrable No Vigentes ($)': m.MontoRechazadoIncobrable,
      'Monto Pagado por Inst. de Salud en Falsos Rechazos ($)': m.MontoFalsoRechazoSalud,
      '% Pago Financiero': `${m.PorcentajePago}%`
    });

    const rows = mesesData.map(m => armarFila(m, m.MesNombre));
    if (totalesAnuales) {
      rows.push(armarFila(totalesAnuales, 'TOTAL ANUAL'));
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Convenio_Mensual_${anio}`);
    XLSX.writeFile(wb, `Control_Convenio_Mensual_${anio}.xlsx`);
  };

  // Exportar Guía de Cuadratura a Excel (.xlsx)
  const exportarGuiaCuadraturaExcel = () => {
    if (!kpiActivo) return;
    const hoy = new Date();
    const fechaEmision = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`;
    const criterioTexto =
      criterio === 'recepcion' ? 'Fecha Recepción (Tramitadas)' : 'Fecha Inicio Reposo (Desde)';
    const sectorTexto =
      sector === 'educacion'
        ? 'Sector Educación'
        : sector === 'salud'
        ? 'Sector Salud (APS)'
        : 'Todos (Educación + Salud APS)';
    const noRechCant = Number(kpiActivo.TotalLicencias || 0) - Number(kpiActivo.LicenciasRechazadas || 0);
    const saldadasRechCant =
      Number(kpiActivo.LicenciasRechazadas || 0) -
      Number(kpiActivo.RechazadasRecuperablesCant || 0) -
      Number(kpiActivo.RechazadasIncobrablesCant || 0);

    const filasGuia = [
      {
        'Sección': 'PARÁMETROS DEL REPORTE',
        'Concepto / Indicador': 'Período Analizado',
        'Cantidad Licencias': '',
        'Monto ($)': '',
        'Detalle / Explicación': tituloPeriodoActivo
      },
      {
        'Sección': 'PARÁMETROS DEL REPORTE',
        'Concepto / Indicador': 'Criterio de Fecha',
        'Cantidad Licencias': '',
        'Monto ($)': '',
        'Detalle / Explicación': criterioTexto
      },
      {
        'Sección': 'PARÁMETROS DEL REPORTE',
        'Concepto / Indicador': 'Sector CMDS',
        'Cantidad Licencias': '',
        'Monto ($)': '',
        'Detalle / Explicación': sectorTexto
      },
      {
        'Sección': 'PARÁMETROS DEL REPORTE',
        'Concepto / Indicador': 'Fecha de Emisión',
        'Cantidad Licencias': '',
        'Monto ($)': '',
        'Detalle / Explicación': fechaEmision
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': 'TOTAL LICENCIAS CONVENIO DEL PERÍODO',
        'Cantidad Licencias': Number(kpiActivo.TotalLicencias || 0),
        'Monto ($)': Number(kpiActivo.TotalEstimado || 0),
        'Detalle / Explicación': '100% del universo de licencias convenio (Válidas + Rechazadas)'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '1. Licencias Válidas / Autorizadas (Sin marca de rechazo)',
        'Cantidad Licencias': noRechCant,
        'Monto ($)': Number(kpiActivo.EstimadoNoRechazado || 0),
        'Detalle / Explicación': `Licencias con Rechazo = 0 (incluye ${kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0} autorizadas por recibo de pago de Inst. de Salud)`
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   • Saldadas según regla Inst. de Salud (FONASA ≤3d Aporte, >3d Aporte+Subsidio, ISAPRE Pago)',
        'Cantidad Licencias': Number(kpiActivo.LicenciasPagadas || 0),
        'Monto ($)': Number(kpiActivo.PagadoNoRechazado || 0),
        'Detalle / Explicación': 'Licencias válidas saldadas sin deuda pendiente de cobro a Inst. de Salud'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   • En $0 esperando pago de Inst. de Salud',
        'Cantidad Licencias': Number(kpiActivo.LicenciasSinPago || 0),
        'Monto ($)': '',
        'Detalle / Explicación': 'Licencias válidas sin ningún pago de Subsidio ni Aporte registrado aún'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   ↳ Total Válidas Pendientes por Cobrar a Inst. de Salud',
        'Cantidad Licencias': Number(kpiActivo.LicenciasPorCobrarSalud || 0),
        'Monto ($)': Number(kpiActivo.FaltaPorCobrar || 0),
        'Detalle / Explicación': `Licencias en $0 (${kpiActivo.LicenciasSinPago || 0}) + FONASA > 3 días con pago incompleto (${kpiActivo.LicenciasPagoParcialSalud || 0})`
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '2. Licencias Marcadas como Rechazadas (Rechazo = 1)',
        'Cantidad Licencias': Number(kpiActivo.LicenciasRechazadas || 0),
        'Monto ($)': Number(kpiActivo.MontoRechazado || 0),
        'Detalle / Explicación': 'Licencias rechazadas sin pago de Inst. de Salud (toma PagoEstimado o MontoDesc si Estimado = 0)'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   • A. Recuperables por Remuneraciones (Funcionario Vigente)',
        'Cantidad Licencias': Number(kpiActivo.RechazadasRecuperablesCant || 0),
        'Monto ($)': Number(kpiActivo.MontoRechazadoRecuperable || 0),
        'Detalle / Explicación': 'Funcionarios activos en CMDS (Vigencia = S) sujetos a descuento por planilla'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   • B. Incobrables (Ex-Funcionario No Vigente / Finiquitado)',
        'Cantidad Licencias': Number(kpiActivo.RechazadasIncobrablesCant || 0),
        'Monto ($)': Number(kpiActivo.MontoRechazadoIncobrable || 0),
        'Detalle / Explicación': 'Ex-funcionarios sin vínculo vigente (Vigencia <> S)'
      },
      {
        'Sección': 'A. COMPOSICIÓN DEL UNIVERSO DE LICENCIAS',
        'Concepto / Indicador': '   • C. Licencias Rechazadas ya Recuperadas por Descuento al Funcionario',
        'Cantidad Licencias': saldadasRechCant,
        'Monto ($)': Number(kpiActivo.MontoRechazadoRecuperado || 0),
        'Detalle / Explicación': `Descuento por remuneraciones aplicado al funcionario (${kpiActivo.RechazadasRecuperadasDescCant} licencias)`
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': 'Pago Estimado Total (Todas las licencias convenio)',
        'Cantidad Licencias': Number(kpiActivo.TotalLicencias || 0),
        'Monto ($)': Number(kpiActivo.TotalEstimado || 0),
        'Detalle / Explicación': 'Proyección total sobre el universo de licencias convenio (toma MontoDesc cuando PagoEstimado = 0)'
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': '(-) Menos Estimado de Licencias Rechazadas',
        'Cantidad Licencias': Number(kpiActivo.LicenciasRechazadas || 0),
        'Monto ($)': -Number(kpiActivo.MontoRechazado || 0),
        'Detalle / Explicación': 'Se descuenta de la meta de cobro a Instituciones de Salud'
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': '(=) Meta Estimada a Cobrar a Inst. de Salud (No Rechazadas)',
        'Cantidad Licencias': noRechCant,
        'Monto ($)': Number(kpiActivo.EstimadoNoRechazado || 0),
        'Detalle / Explicación': 'Monto esperado a recuperar desde FONASA / ISAPRE'
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': '(=) Total Pagado por Inst. de Salud (Exclusivamente Subsidio + Aporte)',
        'Cantidad Licencias': Number(kpiActivo.LicenciasPagadas || 0),
        'Monto ($)': Number(kpiActivo.PagadoSaludTotal || 0),
        'Detalle / Explicación': `Subsidio: ${formatCLP(kpiActivo.PagadoSubsidio)} + Aporte: ${formatCLP(kpiActivo.PagadoAporte)} (excluye Devoluciones y Descuentos)`
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': '   • Del cual: Licencias Autorizadas por Pago de Inst. de Salud (AUT_PAGO_SALUD)',
        'Cantidad Licencias': Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0),
        'Monto ($)': Number(kpiActivo.MontoAutorizadasPorPagoSalud || kpiActivo.MontoFalsoRechazoSalud || 0),
        'Detalle / Explicación': 'Licencias que figuraban rechazadas y pasaron a Autorizadas al recibir pago de Subsidio o Aporte'
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': '   • Falta por Cobrar a Inst. de Salud (Pendientes según regla FONASA / ISAPRE)',
        'Cantidad Licencias': Number(kpiActivo.LicenciasPorCobrarSalud || 0),
        'Monto ($)': Number(kpiActivo.FaltaPorCobrar || 0),
        'Detalle / Explicación': 'Deuda pendiente por cobrar a FONASA / ISAPRE en licencias aún no saldadas'
      },
      {
        'Sección': 'B. CUADRATURA FINANCIERA DE MONTOS ($)',
        'Concepto / Indicador': 'Aparte — Recuperado por Descuento a Funcionarios (Licencias Rechazadas)',
        'Cantidad Licencias': Number(kpiActivo.RechazadasRecuperadasDescCant || 0),
        'Monto ($)': Number(kpiActivo.PagadoDescuentoFunc || 0),
        'Detalle / Explicación': 'Recuperado por planilla en licencias rechazadas sin devolución (no se suma a pagos de Inst. de Salud)'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(filasGuia);
    ws['!cols'] = [{ wch: 38 }, { wch: 56 }, { wch: 18 }, { wch: 20 }, { wch: 68 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Guia_Cuadratura');
    XLSX.writeFile(wb, `Guia_Cuadratura_Convenio_${tituloPeriodoActivo.replace(/\s+/g, '_')}.xlsx`);
  };

  // Exportar / Imprimir Guía de Cuadratura en PDF
  const exportarGuiaCuadraturaPDF = () => {
    if (!kpiActivo) return;
    const hoy = new Date();
    const fechaEmision = `${String(hoy.getDate()).padStart(2, '0')}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getFullYear()}`;
    const criterioTexto =
      criterio === 'recepcion' ? 'Fecha Recepción (Tramitadas)' : 'Fecha Inicio Reposo (Desde)';
    const sectorTexto =
      sector === 'educacion'
        ? 'Sector Educación'
        : sector === 'salud'
        ? 'Sector Salud (APS)'
        : 'Todos (Educación + Salud APS)';
    const noRechCant = Number(kpiActivo.TotalLicencias || 0) - Number(kpiActivo.LicenciasRechazadas || 0);
    const saldadasRechCant =
      Number(kpiActivo.LicenciasRechazadas || 0) -
      Number(kpiActivo.RechazadasRecuperablesCant || 0) -
      Number(kpiActivo.RechazadasIncobrablesCant || 0);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Guía de Cuadratura Licencias Convenio — ${tituloPeriodoActivo}</title>
  <style>
    @page { size: letter portrait; margin: 14mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { margin: 0; color: #1e293b; font-size: 11px; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #016098; padding-bottom: 10px; margin-bottom: 14px; }
    .title { font-size: 16px; font-weight: 800; color: #016098; margin: 0 0 3px 0; text-transform: uppercase; }
    .subtitle { font-size: 11px; color: #475569; margin: 0; }
    .meta-box { text-align: right; font-size: 10px; color: #334155; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi-card { border: 1px solid #cbd5e1; border-left: 4px solid #016098; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
    .kpi-card.green { border-left-color: #059669; background: #ecfdf5; }
    .kpi-card.amber { border-left-color: #d97706; background: #fffbeb; }
    .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; }
    .kpi-val { font-size: 15px; font-weight: 800; color: #0f172a; margin: 3px 0; }
    .kpi-sub { font-size: 9px; color: #475569; }
    .section-title { font-size: 12px; font-weight: 800; color: #016098; text-transform: uppercase; margin: 12px 0 6px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px; }
    th { background: #016098; color: #ffffff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tr.highlight { background: #f0f9ff; font-weight: 700; }
    tr.highlight-green { background: #ecfdf5; font-weight: 700; color: #065f46; }
    tr.highlight-rose { background: #fff1f2; font-weight: 700; color: #9f1239; }
    tr.highlight-teal { background: #f0fdfa; font-weight: 700; color: #115e59; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="${window.location.origin}/logo.png" alt="Logo CMDS" style="height:46px; width:auto; object-fit:contain;" onerror="this.style.display='none'" />
      <div>
        <div class="title">Guía de Cuadratura — Control Licencias Médicas Convenio</div>
        <p class="subtitle">Corporación Municipal de Desarrollo Social de Antofagasta (CMDS) — Unidad de Licencias Médicas</p>
      </div>
    </div>
    <div class="meta-box">
      <div><b>Período:</b> ${tituloPeriodoActivo}</div>
      <div><b>Criterio:</b> ${criterioTexto}</div>
      <div><b>Sector CMDS:</b> ${sectorTexto}</div>
      <div><b>Fecha Emisión:</b> ${fechaEmision}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Licencias Convenio</div>
      <div class="kpi-val">${Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')}</div>
      <div class="kpi-sub">Válidas: <b>${noRechCant.toLocaleString('es-CL')}</b> | Rech.: <b>${Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')}</b></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Pago Estimado (No Rech.)</div>
      <div class="kpi-val">${formatCLP(kpiActivo.EstimadoNoRechazado)}</div>
      <div class="kpi-sub">+ Rech.: ${formatCLP(kpiActivo.MontoRechazado)} | Total: ${formatCLP(kpiActivo.TotalEstimado)}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Pagado por Inst. de Salud</div>
      <div class="kpi-val">${formatCLP(kpiActivo.PagadoSaludTotal)}</div>
      <div class="kpi-sub">Sub: ${formatCLP(kpiActivo.PagadoSubsidio)} | Apo: ${formatCLP(kpiActivo.PagadoAporte)}</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">Falta Cobrar (Inst. Salud)</div>
      <div class="kpi-val">${formatCLP(kpiActivo.FaltaPorCobrar)}</div>
      <div class="kpi-sub">En $0: <b>${Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')}</b> | Con saldo: <b>${Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')}</b></div>
    </div>
  </div>

  <div class="section-title">A. Composición del Universo de Licencias (Cantidades)</div>
  <table>
    <thead>
      <tr>
        <th>Concepto / Agrupación</th>
        <th class="text-right">Cantidad Licencias</th>
        <th>Explicación Operativa</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td>TOTAL UNIVERSO LICENCIAS CONVENIO</td>
        <td class="text-right">${Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')} lic.</td>
        <td>100% de las licencias convenio del período (Válidas + Rechazadas)</td>
      </tr>
      <tr class="highlight-green">
        <td>1. Licencias Válidas / Autorizadas (Sin marca de rechazo)</td>
        <td class="text-right">${noRechCant.toLocaleString('es-CL')} lic.</td>
        <td>Licencias con Rechazo = 0 (incluye ${Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0)} autorizadas por pago Inst. Salud)</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• Saldadas según regla Inst. de Salud (FONASA ≤3d Aporte, >3d Aporte+Subsidio, ISAPRE Pago)</td>
        <td class="text-right"><b>${Number(kpiActivo.LicenciasPagadas || 0).toLocaleString('es-CL')} lic.</b></td>
        <td>Licencias válidas consideradas saldadas (sin deuda exigible)</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• En $0 esperando pago de Inst. de Salud</td>
        <td class="text-right"><b>${Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} lic.</b></td>
        <td>Licencias válidas sin ningún pago de Subsidio ni Aporte aún</td>
      </tr>
      <tr>
        <td style="padding-left:22px; color:#016098; font-weight:700;">↳ Total Válidas Pendientes por Cobrar a Inst. de Salud</td>
        <td class="text-right" style="color:#016098; font-weight:700;">${Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} lic.</td>
        <td>Suma de licencias en $0 (${Number(kpiActivo.LicenciasSinPago || 0)}) + FONASA &gt; 3d con pago incompleto (${Number(kpiActivo.LicenciasPagoParcialSalud || 0)})</td>
      </tr>
      <tr class="highlight-rose">
        <td>2. Licencias Marcadas como Rechazadas (Rechazo = 1)</td>
        <td class="text-right">${Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} lic.</td>
        <td>Licencias rechazadas sin pago de Inst. de Salud (toma MontoDesc si PagoEstimado = 0)</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• A. Con saldo por descontar a Funcionario Vigente (Recuperables)</td>
        <td class="text-right"><b>${Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} lic.</b></td>
        <td>Funcionarios activos en la Corporación (Vigencia = S): recuperables vía remuneraciones</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• B. Con saldo de Ex-Funcionario No Vigente (Incobrables)</td>
        <td class="text-right"><b>${Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} lic.</b></td>
        <td>Ex-funcionarios finiquitados / no vigentes (Vigencia &lt;&gt; S)</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• C. Licencias Rechazadas ya Recuperadas por Descuento al Funcionario</td>
        <td class="text-right"><b>${saldadasRechCant.toLocaleString('es-CL')} lic.</b></td>
        <td>Descuento por remuneraciones aplicado al funcionario (${kpiActivo.RechazadasRecuperadasDescCant} licencias)</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">B. Cuadratura Financiera de Montos ($) — Fórmula de Conciliación</div>
  <table>
    <thead>
      <tr>
        <th>Línea de Conciliación Financiera</th>
        <th class="text-right">Monto ($)</th>
        <th>Detalle / Origen del Monto</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>Pago Estimado Total</b> (${Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')} licencias convenio)</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.TotalEstimado)}</b></td>
        <td>Suma total del subsidio estimado (toma MontoDesc cuando PagoEstimado = 0)</td>
      </tr>
      <tr class="highlight-rose">
        <td>(-) Menos Estimado de Licencias Rechazadas (${Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} lic.)</td>
        <td class="text-right">- ${formatCLP(kpiActivo.MontoRechazado)}</td>
        <td>Se resta de la meta de cobro a Instituciones de Salud</td>
      </tr>
      <tr class="highlight">
        <td>(=) Meta Estimada a Cobrar a Inst. de Salud (No Rechazadas)</td>
        <td class="text-right">${formatCLP(kpiActivo.EstimadoNoRechazado)}</td>
        <td>Meta real exigible a FONASA / ISAPRE sobre las ${noRechCant.toLocaleString('es-CL')} licencias válidas</td>
      </tr>
      <tr class="highlight-green">
        <td>(=) Total Pagado por Inst. de Salud (Exclusivamente Subsidio + Aporte)</td>
        <td class="text-right">${formatCLP(kpiActivo.PagadoSaludTotal)}</td>
        <td>Subsidio: ${formatCLP(kpiActivo.PagadoSubsidio)} + Aporte: ${formatCLP(kpiActivo.PagadoAporte)} (excluye Devoluciones y Descuentos)</td>
      </tr>
      <tr>
        <td style="padding-left:22px;">• Del cual: Licencias Autorizadas por Pago Inst. Salud (${Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0)} lic.)</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.MontoAutorizadasPorPagoSalud || kpiActivo.MontoFalsoRechazoSalud)}</b></td>
        <td>Licencias que figuraban rechazadas y pasaron a Autorizadas al recibir pago de Subsidio o Aporte</td>
      </tr>
      <tr>
        <td style="padding-left:22px; color:#b45309; font-weight:700;">• Falta por Cobrar a Inst. de Salud (${Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} lic. pendientes)</td>
        <td class="text-right" style="color:#b45309; font-weight:700;">${formatCLP(kpiActivo.FaltaPorCobrar)}</td>
        <td>Saldo pendiente según regla de negocio FONASA ≤3d / &gt;3d e ISAPRE</td>
      </tr>
      <tr class="highlight-teal">
        <td>Aparte — Recuperado por Descuento a Funcionarios en Lic. Rechazadas</td>
        <td class="text-right">${formatCLP(kpiActivo.PagadoDescuentoFunc)}</td>
        <td>Recuperado por descuento de remuneraciones (${kpiActivo.RechazadasRecuperadasDescCant} lic. rechazadas)</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">C. Resumen de Licencias Rechazadas y Autorizadas por Pago (${Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} lic. rech. · ${formatCLP(kpiActivo.MontoRechazado)})</div>
  <table>
    <thead>
      <tr>
        <th>Categoría</th>
        <th class="text-right">Licencias</th>
        <th class="text-right">Monto ($)</th>
        <th>Acción / Estado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>A. Recuperables (Funcionarios Vigentes)</b></td>
        <td class="text-right">${Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')}</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.MontoRechazadoRecuperable)}</b></td>
        <td>Funcionarios activos en CMDS: descontar por remuneraciones</td>
      </tr>
      <tr>
        <td><b>B. Incobrables (Ex-Funcionarios No Vigentes)</b></td>
        <td class="text-right">${Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')}</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.MontoRechazadoIncobrable)}</b></td>
        <td>Ex-funcionarios finiquitados: sin remuneración activa para descuento</td>
      </tr>
      <tr>
        <td><b>C. Ya Recuperadas por Descuento al Funcionario</b></td>
        <td class="text-right">${Number(kpiActivo.RechazadasRecuperadasDescCant || 0).toLocaleString('es-CL')}</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.MontoRechazadoDescuentoFunc)}</b></td>
        <td>Descuento por planilla ya aplicado al funcionario</td>
      </tr>
      <tr>
        <td><b>D. ⚡ Autorizadas por Pago Inst. de Salud (AUT_PAGO_SALUD)</b></td>
        <td class="text-right">${Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0).toLocaleString('es-CL')}</td>
        <td class="text-right"><b>${formatCLP(kpiActivo.MontoAutorizadasPorPagoSalud || kpiActivo.MontoFalsoRechazoSalud)}</b></td>
        <td>Pasaron automáticamente de Rechazadas a Autorizadas por recibir pago de Subsidio o Aporte</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Sistema de Gestión y Control de Licencias Médicas — CMDS Antofagasta</span>
    <span>Generado el ${fechaEmision}</span>
  </div>
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 250); };
  </script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=980,height=820');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  };

  // Filtrar y ordenar el detalle de licencias dentro del Modal
  const registrosDetalleFiltrados = registrosDetalle
    .filter(r => {
      if (filtroEstadoDet === 'por-cobrar' && !(r.EscenarioCobro === 'POR_COBRAR_SALUD' && !r.Rechazo)) return false;
      if (filtroEstadoDet === 'sin-pago' && !(Number(r.MontoPagado || 0) === 0 && !r.Rechazo && !r.EsSaldadaSalud)) return false;
      if (filtroEstadoDet === 'pagadas' && !(r.EsSaldadaSalud && !r.Rechazo)) return false;
      if (filtroEstadoDet === 'rechazadas' && !r.Rechazo) return false;
      if (filtroEstadoDet === 'falso-rechazo-salud' && !r.EsFalsoRechazoPagado) return false;
      if (filtroEstadoDet === 'falso-rechazo-doble' && !r.EsDobleCobro) return false;
      if (filtroEstadoDet === 'falso-rechazo-compin' && !r.EsFalsoRechazoCompin) return false;
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

  // Totales rápidos del listado filtrado en el modal
  const sumaEstimadoModal = registrosDetalleFiltrados.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0);
  const sumaSaludModal = registrosDetalleFiltrados.reduce((acc, r) => acc + Number(r.PagadoSalud || 0), 0);
  const sumaDescModal = registrosDetalleFiltrados.reduce((acc, r) => acc + Number(r.PagadoDescuento || 0), 0);
  const sumaPendModal = registrosDetalleFiltrados.reduce(
    (acc, r) => acc + Number(r.SaldoPendiente ?? r.FaltaPorCobrar ?? 0),
    0
  );

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
        'Días Descuento Func.': r.DiasDescuento || 0,
        'Pago Estimado ($)': est,
        'Pagado por Inst. de Salud (Sub+Apo) ($)': r.PagadoSalud || 0,
        'Pagado Subsidio Inst. Salud ($)': r.PagadoSubsidio,
        'Pagado Aporte Inst. Salud ($)': r.PagadoAporte,
        'Recuperado Descuento/Devol. Func. ($)': r.PagadoDescuento || 0,
        'Monto Total Registrado ($)': pag,
        'Falta Cobrar Inst. de Salud ($)': r.FaltaPorCobrar,
        'Saldo Pendiente Total ($)': r.SaldoPendiente,
        '% Pago': `${pct}%`,
        'Check Rechazo BD': r.Rechazo ? 'SÍ (Rechazo=1)' : 'NO',
        'Falso Rechazo (Pagó Inst. Salud)': r.EsFalsoRechazoPagado ? 'SÍ' : 'NO',
        'Doble Cobro (Inst. Salud + Desc. Func.)': r.EsDobleCobro ? 'SÍ' : 'NO',
        'Situación de Cobro / Recuperación': r.SituacionCobroLabel || '',
        'Observación Compin': r.Observacion_Compin || '',
        'Obs. Apelación': r.Obser_apelacion || '',
        'Observación': r.Observacion || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle_Convenio');
    XLSX.writeFile(wb, `Detalle_Licencias_Convenio_${mesNom}_${anio}_${filtroEstadoDet}.xlsx`);
  };

  const licenciasNoRechazadasCant = kpiActivo
    ? Number(kpiActivo.TotalLicencias || 0) - Number(kpiActivo.LicenciasRechazadas || 0)
    : 0;
  const pctRecuperoSalud =
    kpiActivo && Number(kpiActivo.EstimadoNoRechazado || 0) > 0
      ? Number(((Number(kpiActivo.PagadoNoRechazado || 0) / Number(kpiActivo.EstimadoNoRechazado || 1)) * 100).toFixed(1))
      : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-6 space-y-6">
      {/* 1. BARRA SUPERIOR: TÍTULO Y FILTROS SIMPLES */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#e2e8f0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#016098] text-white uppercase">
              Control Convenio
            </span>
            <h2 className="text-lg font-extrabold text-[#016098]">
              Resumen de Cobranza a Instituciones de Salud y Licencias Rechazadas
            </h2>
          </div>
          <p className="text-xs text-[#64748b] mt-0.5">
            Haga clic en cualquier tarjeta o mes para abrir la nómina detallada en pantalla y exportarla a Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-1">Año</label>
            <select
              value={anio}
              onChange={e => {
                setAnio(e.target.value);
                setRegistrosDetalle([]);
              }}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-bold text-[#016098] bg-[#f8fafc]"
            >
              <option value="historico">Histórico (Todos los años)</option>
              {['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'].map(y => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-1">Período en Tarjetas</label>
            <select
              value={mesSeleccionado}
              onChange={e => setMesSeleccionado(Number(e.target.value))}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc]"
            >
              <option value={0}>
                {esHistorico ? 'Total Histórico (Todos los años)' : `Año Completo (${anio})`}
              </option>
              {mesesData.map(m => (
                <option key={m.Mes} value={m.Mes}>
                  {m.MesNombre} ({m.TotalLicencias.toLocaleString('es-CL')} lic.)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-1">Criterio Fecha</label>
            <select
              value={criterio}
              onChange={e => {
                setCriterio(e.target.value as 'recepcion' | 'desde');
                setRegistrosDetalle([]);
              }}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc]"
            >
              <option value="desde">Fecha Inicio Reposo (Desde)</option>
              <option value="recepcion">Fecha Recepción (Tramitadas)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748b] uppercase mb-1">Sector CMDS</label>
            <select
              value={sector}
              onChange={e => {
                setSector(e.target.value);
                setRegistrosDetalle([]);
              }}
              className="border border-[#cbd5e1] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1e293b] bg-[#f8fafc]"
            >
              <option value="">Todos (Educación + Salud APS)</option>
              <option value="educacion">Sector Educación</option>
              <option value="salud">Sector Salud (APS)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportarResumenExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
            >
              📊 Resumen Anual Excel
            </button>
            <button
              onClick={() => {
                if (mesesData.length === 0) return;
                exportToCorporatePDF({
                  title: `Resumen Mensual Licencias Convenio — Año ${anio}`,
                  subtitle: `Criterio: ${criterio === 'recepcion' ? 'Fecha Recepción (Tramitadas)' : 'Fecha Inicio Reposo (Desde)'} · Sector: ${sector === 'educacion' ? 'Educación' : sector === 'salud' ? 'Salud APS' : 'Todos'}`,
                  orientation: 'landscape',
                  columns: [
                    { header: 'Mes', key: 'MesNombre' },
                    { header: 'Total Lic.', key: 'TotalLicencias', align: 'center', format: v => Number(v || 0).toLocaleString('es-CL') },
                    { header: 'Saldadas Salud', key: 'LicenciasPagadas', align: 'center', format: v => Number(v || 0).toLocaleString('es-CL') },
                    { header: 'Por Cobrar', key: 'LicenciasPorCobrarSalud', align: 'center', format: v => Number(v || 0).toLocaleString('es-CL') },
                    { header: 'Rechazadas', key: 'LicenciasRechazadas', align: 'center', format: v => Number(v || 0).toLocaleString('es-CL') },
                    { header: 'Aut. Pago Salud', key: 'AutorizadasPorPagoSaludCant', align: 'center', format: (v, r) => Number(v || r.FalsosRechazosPagadosCant || 0).toLocaleString('es-CL') },
                    { header: 'Estimado Total ($)', key: 'TotalEstimado', align: 'right', format: v => formatCLP(v) },
                    { header: 'Meta Salud ($)', key: 'EstimadoNoRechazado', align: 'right', format: v => formatCLP(v) },
                    { header: 'Pagado Salud ($)', key: 'PagadoSaludTotal', align: 'right', format: v => formatCLP(v) },
                    { header: 'Falta Cobrar ($)', key: 'FaltaPorCobrar', align: 'right', format: v => formatCLP(v) },
                    { header: 'Desc. Func. ($)', key: 'PagadoDescuentoFunc', align: 'right', format: v => formatCLP(v) }
                  ],
                  rows: mesesData,
                  totalsRow: totalesAnuales
                    ? {
                        MesNombre: 'TOTAL ANUAL',
                        TotalLicencias: Number(totalesAnuales.TotalLicencias || 0).toLocaleString('es-CL'),
                        LicenciasPagadas: Number(totalesAnuales.LicenciasPagadas || 0).toLocaleString('es-CL'),
                        LicenciasPorCobrarSalud: Number(totalesAnuales.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL'),
                        LicenciasRechazadas: Number(totalesAnuales.LicenciasRechazadas || 0).toLocaleString('es-CL'),
                        AutorizadasPorPagoSaludCant: Number(totalesAnuales.AutorizadasPorPagoSaludCant || totalesAnuales.FalsosRechazosPagadosCant || 0).toLocaleString('es-CL'),
                        TotalEstimado: formatCLP(totalesAnuales.TotalEstimado),
                        EstimadoNoRechazado: formatCLP(totalesAnuales.EstimadoNoRechazado),
                        PagadoSaludTotal: formatCLP(totalesAnuales.PagadoSaludTotal),
                        FaltaPorCobrar: formatCLP(totalesAnuales.FaltaPorCobrar),
                        PagadoDescuentoFunc: formatCLP(totalesAnuales.PagadoDescuentoFunc)
                      }
                    : undefined
                });
              }}
              className="px-3.5 py-1.5 bg-[#016098] hover:bg-[#014b78] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
            >
              📄 Resumen Anual PDF
            </button>
          </div>
        </div>
      </div>

      {kpiActivo && (
        <>
          {/* 2. NIVEL 1: 4 TARJETAS PRINCIPALES GRANDES Y CLARAS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#334155]">
                1. Resumen General de Licencias Convenio —{' '}
                <span className="text-[#016098]">{tituloPeriodoActivo}</span>
              </span>
              {mesSeleccionado > 0 && (
                <button
                  onClick={() => setMesSeleccionado(0)}
                  className="text-xs font-bold text-[#016098] hover:underline"
                >
                  ← Volver a ver {esHistorico ? 'Histórico (Todos los años)' : `Año Completo ${anio}`}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Tarjeta 1: Total Licencias Convenio */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'todas')}
                className="bg-[#f8fafc] hover:bg-sky-50/70 cursor-pointer transition-all rounded-xl p-4 border border-[#cbd5e1] border-l-4 border-l-[#016098] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#475569] uppercase">Total Licencias Convenio</span>
                    <span className="text-[11px] font-bold text-[#016098] bg-sky-100 px-2 py-0.5 rounded">
                      Ver todas →
                    </span>
                  </div>
                  <p className="text-3xl font-extrabold text-[#016098] mt-1.5">
                    {Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between text-xs">
                  <span className="text-[#334155]">
                    Válidas/Trámite: <b className="text-emerald-700">{licenciasNoRechazadasCant.toLocaleString('es-CL')}</b>
                  </span>
                  <span className="text-[#334155]">
                    Rechazadas: <b className="text-rose-600">{Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')}</b>
                  </span>
                </div>
              </div>

              {/* Tarjeta 2: Pago Estimado a Recuperar */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'todas')}
                className="bg-[#f8fafc] hover:bg-sky-50/70 cursor-pointer transition-all rounded-xl p-4 border border-[#cbd5e1] border-l-4 border-l-[#39BABD] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#475569] uppercase">Pago Estimado (No Rech.)</span>
                    <span className="text-[11px] font-semibold text-[#64748b]">Meta Inst. Salud</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1e293b] mt-1.5">
                    {formatCLP(kpiActivo.EstimadoNoRechazado)}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 text-xs text-[#475569] flex justify-between">
                  <span>+ Rechazadas: <b className="text-rose-600">{formatCLP(kpiActivo.MontoRechazado)}</b></span>
                  <span>Total: <b>{formatCLP(kpiActivo.TotalEstimado)}</b></span>
                </div>
              </div>

              {/* Tarjeta 3: Pago Recibido de Instituciones de Salud (Real) */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'pagadas')}
                className="bg-emerald-50/60 hover:bg-emerald-100/60 cursor-pointer transition-all rounded-xl p-4 border border-emerald-200 border-l-4 border-l-emerald-600 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 uppercase">Pagado por Inst. de Salud</span>
                    <span className="text-xs font-extrabold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                      {pctRecuperoSalud}% recup.
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-700 mt-1.5">
                    {formatCLP(kpiActivo.PagadoSaludTotal)}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-emerald-200 text-xs text-emerald-950 flex justify-between">
                  <span>Sub: <b>{formatCLP(kpiActivo.PagadoSubsidio)}</b></span>
                  <span>Apo: <b>{formatCLP(kpiActivo.PagadoAporte)}</b></span>
                </div>
              </div>

              {/* Tarjeta 4: Falta por Cobrar a Instituciones de Salud (No Rechazadas) */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'por-cobrar')}
                className="bg-amber-50/70 hover:bg-amber-100/70 cursor-pointer transition-all rounded-xl p-4 border border-amber-200 border-l-4 border-l-amber-500 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase">Falta Cobrar (Inst. de Salud)</span>
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-200 px-2 py-0.5 rounded">
                      Ver nómina →
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-amber-700 mt-1.5">
                    {formatCLP(kpiActivo.FaltaPorCobrar)}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-amber-200 text-xs text-amber-950 flex justify-between">
                  <span>
                    En $0 sin pago: <b>{Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} lic.</b>
                  </span>
                  <span>
                    Con saldo: <b>{Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} lic.</b>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* TARJETÓN RESUMEN EXPLICATIVO ÚNICO: ¿CÓMO SE FORMA Y CUADRA TODO? */}
          <div className="bg-linear-to-r from-[#f8fafc] to-sky-50/50 rounded-xl p-4 border border-sky-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-sky-200/80 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#016098] text-white uppercase">
                  Guía de Cuadratura
                </span>
                <h3 className="text-xs font-extrabold text-[#016098] uppercase tracking-wide">
                  ¿Cómo se forma el total y cómo cuadran las licencias y los montos en {tituloPeriodoActivo}?
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportarGuiaCuadraturaPDF}
                  className="px-3 py-1 bg-[#016098] hover:bg-[#014b78] text-white text-[11px] font-bold rounded-md transition-colors shadow-2xs cursor-pointer"
                >
                  📄 Exportar Guía a PDF
                </button>
                <button
                  type="button"
                  onClick={exportarGuiaCuadraturaExcel}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-colors shadow-2xs cursor-pointer"
                >
                  📊 Exportar Guía a Excel
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* Columna 1: Cómo se componen las Licencias (Cantidades) */}
              <div className="bg-white rounded-lg p-3.5 border border-slate-200 space-y-2">
                <div className="font-extrabold text-[#1e293b] border-b border-slate-100 pb-1.5 flex justify-between items-center">
                  <span>A. Composición del Universo de Licencias</span>
                  <span className="text-[#016098]">
                    Total: {Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')} lic.
                  </span>
                </div>

                <div className="space-y-1.5 text-[#334155]">
                  <div className="flex justify-between items-center bg-emerald-50/70 px-2.5 py-1.5 rounded border border-emerald-100">
                    <span>
                      <b>1. Licencias Válidas / Autorizadas</b> (Sin marca de rechazo):
                    </span>
                    <b className="text-emerald-800">{licenciasNoRechazadasCant.toLocaleString('es-CL')} lic.</b>
                  </div>
                  <div className="pl-4 space-y-1 text-[11px] text-[#475569]">
                    <div className="flex justify-between">
                      <span>• Saldadas según regla Inst. de Salud (FONASA ≤3d Aporte, &gt;3d Aporte+Subsidio, ISAPRE Pago):</span>
                      <b className="text-emerald-700">
                        {Number(kpiActivo.LicenciasPagadas || 0).toLocaleString('es-CL')} lic.
                      </b>
                    </div>
                    <div className="flex justify-between">
                      <span>• En $0 esperando pago de Inst. de Salud:</span>
                      <b className="text-amber-700">
                        {Number(kpiActivo.LicenciasSinPago || 0).toLocaleString('es-CL')} lic.
                      </b>
                    </div>
                    <div className="flex justify-between text-[#016098]">
                      <span>
                        ↳ Total Válidas Pendientes <b>Falta por Cobrar a Inst. de Salud</b> (en $0 + FONASA &gt;3d incompleto):
                      </span>
                      <b>{Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} lic.</b>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-rose-50/70 px-2.5 py-1.5 rounded border border-rose-100 mt-2">
                    <span>
                      <b>2. Licencias Marcadas como Rechazadas</b> (Rechazo = 1):
                    </span>
                    <b className="text-rose-700">
                      {Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} lic.
                    </b>
                  </div>
                  <div className="pl-4 space-y-1 text-[11px] text-[#475569]">
                    <div className="flex justify-between">
                      <span>• Con saldo por descontar a Funcionario Vigente (Recuperables):</span>
                      <b className="text-indigo-700">
                        {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} lic.
                      </b>
                    </div>
                    <div className="flex justify-between">
                      <span>• Con saldo de Ex-Funcionario No Vigente (Incobrables):</span>
                      <b className="text-rose-700">
                        {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} lic.
                      </b>
                    </div>
                    <div className="flex justify-between">
                      <span>• Recuperadas por Descuento al Funcionario ({Number(kpiActivo.RechazadasRecuperadasDescCant || 0)} lic.):</span>
                      <b className="text-teal-700">
                        {(
                          Number(kpiActivo.LicenciasRechazadas || 0) -
                          Number(kpiActivo.RechazadasRecuperablesCant || 0) -
                          Number(kpiActivo.RechazadasIncobrablesCant || 0)
                        ).toLocaleString('es-CL')}{' '}
                        lic. saldadas
                      </b>
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna 2: Cómo cuadran los Montos Financieros ($) */}
              <div className="bg-white rounded-lg p-3.5 border border-slate-200 space-y-2">
                <div className="font-extrabold text-[#1e293b] border-b border-slate-100 pb-1.5 flex justify-between items-center">
                  <span>B. Cuadratura Financiera de Montos ($)</span>
                  <span className="text-emerald-700">Fórmula de Conciliación</span>
                </div>

                <div className="space-y-1.5 text-[#334155]">
                  <div className="flex justify-between items-center text-[11px]">
                    <span>Pago Estimado Total ({Number(kpiActivo.TotalLicencias || 0).toLocaleString('es-CL')} lic., usa MontoDesc si Estimado=0):</span>
                    <b>{formatCLP(kpiActivo.TotalEstimado)}</b>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-rose-700">
                    <span>(-) Menos Estimado de Licencias Rechazadas ({Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} lic.):</span>
                    <b>- {formatCLP(kpiActivo.MontoRechazado)}</b>
                  </div>
                  <div className="flex justify-between items-center bg-sky-50 px-2.5 py-1.5 rounded border border-sky-200 font-bold text-[#016098]">
                    <span>(=) Meta Estimada a Cobrar a Inst. de Salud (No Rechazadas):</span>
                    <span>{formatCLP(kpiActivo.EstimadoNoRechazado)}</span>
                  </div>

                  <div className="pl-3 space-y-1 text-[11px] border-l-2 border-emerald-400 my-1">
                    <div className="flex justify-between font-bold text-emerald-900 bg-emerald-50/70 px-2 py-0.5 rounded">
                      <span>(=) Total Pagado por Inst. de Salud (Exclusivamente Subsidio + Aporte):</span>
                      <span>{formatCLP(kpiActivo.PagadoSaludTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Del cual: Autorizadas por Pago de Inst. de Salud ({Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0)} lic. `AUT_PAGO_SALUD`):</span>
                      <b className="text-emerald-700">{formatCLP(kpiActivo.MontoAutorizadasPorPagoSalud || kpiActivo.MontoFalsoRechazoSalud)}</b>
                    </div>
                    <div className="flex justify-between text-amber-800 pt-0.5">
                      <span>• Falta por Cobrar a Inst. de Salud ({Number(kpiActivo.LicenciasPorCobrarSalud || 0).toLocaleString('es-CL')} lic. pendientes según regla):</span>
                      <b>{formatCLP(kpiActivo.FaltaPorCobrar)}</b>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-teal-50/80 px-2.5 py-1.5 rounded border border-teal-200 text-[11px] text-teal-950">
                    <span>
                      <b>Aparte — Recuperado por Descuento a Funcionarios en Lic. Rechazadas</b> (Excluye Devoluciones):
                    </span>
                    <b className="text-teal-800">{formatCLP(kpiActivo.PagadoDescuentoFunc)}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. NIVEL 2: SEMÁFORO CLARO DE LICENCIAS RECHAZADAS (4 CAJAS DE 1 CLIC) */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                <h3 className="text-xs font-extrabold text-[#1e293b] uppercase tracking-wide">
                  2. Desglose de las {Number(kpiActivo.LicenciasRechazadas || 0).toLocaleString('es-CL')} Licencias Rechazadas ({formatCLP(kpiActivo.MontoRechazado)}) y Autorizadas por Pago Inst. Salud
                </h3>
              </div>
              <span className="text-[11px] text-[#64748b]">
                Presione cualquier recuadro para abrir la ventana con el listado de funcionarios y exportar a Excel
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Caja A: Recuperables por Remuneraciones (Vigentes) */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'rech-recuperables')}
                className="bg-white hover:bg-indigo-50/40 cursor-pointer transition-all rounded-xl p-4 border border-indigo-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900">
                      A. Recuperables (Vigentes)
                    </span>
                    <span className="text-xs font-extrabold text-indigo-700">
                      {Number(kpiActivo.RechazadasRecuperablesCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-indigo-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoRecuperable)}
                  </p>
                  <p className="text-xs text-[#475569] mt-1">
                    Funcionarios <b>activos en la Corporación</b>: se puede descontar de sus remuneraciones.
                  </p>
                </div>
                <div className="mt-3 text-xs font-bold text-indigo-700 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>Abrir listado de vigentes</span>
                  <span>→</span>
                </div>
              </div>

              {/* Caja B: Incobrables (No Vigentes / Finiquitados) */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'rech-incobrables')}
                className="bg-white hover:bg-rose-50/40 cursor-pointer transition-all rounded-xl p-4 border border-rose-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-900">
                      B. Incobrables (No Vigentes)
                    </span>
                    <span className="text-xs font-extrabold text-rose-700">
                      {Number(kpiActivo.RechazadasIncobrablesCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-rose-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoIncobrable)}
                  </p>
                  <p className="text-xs text-[#475569] mt-1">
                    Ex-funcionarios <b>finiquitados / no vigentes</b>: ya no es posible descontar por planilla.
                  </p>
                </div>
                <div className="mt-3 text-xs font-bold text-rose-700 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>Abrir listado incobrables</span>
                  <span>→</span>
                </div>
              </div>

              {/* Caja C: Ya Recuperadas por Descuento */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'rech-recuperadas')}
                className="bg-white hover:bg-emerald-50/40 cursor-pointer transition-all rounded-xl p-4 border border-emerald-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900">
                      C. Recuperadas (Descuento)
                    </span>
                    <span className="text-xs font-extrabold text-emerald-700">
                      {Number(kpiActivo.RechazadasRecuperadasDescCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-emerald-700 mt-2">
                    {formatCLP(kpiActivo.MontoRechazadoDescuentoFunc)}
                  </p>
                  <p className="text-xs text-[#475569] mt-1">
                    Monto ya recuperado del funcionario mediante <b>Descuento por Remuneraciones</b> (sin devolución).
                  </p>
                </div>
                <div className="mt-3 text-xs font-bold text-emerald-700 flex items-center justify-between pt-2 border-t border-slate-100">
                  <span>Abrir listado recuperadas</span>
                  <span>→</span>
                </div>
              </div>

              {/* Caja D: Autorizadas por Pago de Inst. de Salud (AUT_PAGO_SALUD) */}
              <div
                onClick={() => abrirModalDetalle(mesSeleccionado, 'falso-rechazo-salud')}
                className="bg-white hover:bg-amber-50/50 cursor-pointer transition-all rounded-xl p-4 border-2 border-amber-300 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900">
                      D. ⚡ Autorizadas por Pago Salud
                    </span>
                    <span className="text-xs font-extrabold text-amber-800">
                      {Number(kpiActivo.AutorizadasPorPagoSaludCant || kpiActivo.FalsosRechazosPagadosCant || 0).toLocaleString('es-CL')} lic.
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-amber-700 mt-2">
                    {formatCLP(kpiActivo.MontoAutorizadasPorPagoSalud || kpiActivo.MontoFalsoRechazoSalud)}
                  </p>
                  <p className="text-xs text-[#475569] mt-1">
                    Figuraban como Rechazadas y <b>pasaron automáticamente a Autorizadas</b> al recibir pago de Subsidio o Aporte.
                  </p>
                </div>
                <div className="mt-3 text-xs font-bold text-amber-800 flex items-center justify-between pt-2 border-t border-amber-100">
                  <span>Ver autorizadas por pago</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 4. DESGLOSE MENSUAL CON PESTAÑAS (TABLA MENSUAL O GRÁFICO) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-xs font-extrabold text-[#334155] uppercase tracking-wide">
            3. Detalle Mes a Mes ({esHistorico ? 'Acumulado Histórico Todos los Años' : `Año ${anio}`}) — Haga clic en &quot;Abrir Detalle&quot; en cualquier mes
          </h3>
          <div className="inline-flex rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-0.5 self-start">
            <button
              type="button"
              onClick={() => setVistaInferior('tabla')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                vistaInferior === 'tabla' ? 'bg-[#016098] text-white shadow-2xs' : 'text-[#475569] hover:text-[#016098]'
              }`}
            >
              📅 Ver Tabla Mensual
            </button>
            <button
              type="button"
              onClick={() => setVistaInferior('grafico')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                vistaInferior === 'grafico' ? 'bg-[#016098] text-white shadow-2xs' : 'text-[#475569] hover:text-[#016098]'
              }`}
            >
              📊 Ver Gráfico Comparativo
            </button>
          </div>
        </div>

        {vistaInferior === 'grafico' && mesesData.length > 0 ? (
          <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e2e8f0]">
            <div className="h-72 w-full">
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
                  <Bar dataKey="EstimadoNoRechazado" name="Estimado No Rechazadas ($)" fill="#016098" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="PagadoSaludTotal" name="Pagado por Inst. de Salud ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="FaltaPorCobrar" name="Falta por Cobrar Inst. Salud ($)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] font-bold">
                <tr>
                  <th className="p-2.5">Mes</th>
                  <th className="p-2.5 text-center">Lic. Tramitadas</th>
                  <th className="p-2.5 text-right">Estimado (No Rech.)</th>
                  <th className="p-2.5 text-right">Pagado Inst. Salud</th>
                  <th className="p-2.5 text-right">Falta Cobrar Inst. Salud</th>
                  <th className="p-2.5 text-right">Recup. Desc. Func.</th>
                  <th className="p-2.5 text-center">Rechazadas (Vig. / Incob.)</th>
                  <th className="p-2.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {cargando ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[#64748b]">
                      Calculando resumen mensual...
                    </td>
                  </tr>
                ) : (
                  mesesData.map(m => {
                    const activo = mesSeleccionado === m.Mes;
                    return (
                      <tr
                        key={m.Mes}
                        onClick={() => setMesSeleccionado(m.Mes === mesSeleccionado ? 0 : m.Mes)}
                        className={`cursor-pointer transition-colors ${
                          activo ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'
                        }`}
                      >
                        <td className="p-2.5 font-bold text-[#016098]">{m.MesNombre}</td>
                        <td className="p-2.5 text-center font-bold">{m.TotalLicencias.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-right font-semibold">{formatCLP(m.EstimadoNoRechazado)}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">{formatCLP(m.PagadoSaludTotal)}</td>
                        <td className="p-2.5 text-right font-bold text-amber-700">{formatCLP(m.FaltaPorCobrar)}</td>
                        <td className="p-2.5 text-right font-semibold text-indigo-700">
                          {formatCLP(m.PagadoDescuentoFunc)}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="font-bold text-slate-700">{m.LicenciasRechazadas}</span>{' '}
                          <span className="text-[11px] text-[#64748b]">
                            (<span className="text-indigo-700 font-bold">{m.RechazadasRecuperablesCant}</span> vig. /{' '}
                            <span className="text-rose-700 font-bold">{m.RechazadasIncobrablesCant}</span> incob.)
                          </span>
                        </td>
                        <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => abrirModalDetalle(m.Mes, 'todas')}
                            className="px-3 py-1 bg-[#016098] hover:bg-[#014b78] text-white text-[11px] font-bold rounded-md transition-colors"
                          >
                            Abrir Detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}

                {totalesAnuales && !cargando && (
                  <tr className="bg-[#f1f5f9] font-extrabold text-[#1e293b] border-t-2 border-[#cbd5e1]">
                    <td className="p-2.5 text-[#016098]">TOTAL {esHistorico ? 'HISTÓRICO' : anio}</td>
                    <td className="p-2.5 text-center">{totalesAnuales.TotalLicencias.toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right">{formatCLP(totalesAnuales.EstimadoNoRechazado)}</td>
                    <td className="p-2.5 text-right text-emerald-700">{formatCLP(totalesAnuales.PagadoSaludTotal)}</td>
                    <td className="p-2.5 text-right text-amber-700">{formatCLP(totalesAnuales.FaltaPorCobrar)}</td>
                    <td className="p-2.5 text-right text-indigo-700">{formatCLP(totalesAnuales.PagadoDescuentoFunc)}</td>
                    <td className="p-2.5 text-center">
                      {totalesAnuales.LicenciasRechazadas.toLocaleString('es-CL')} (
                      <span className="text-indigo-700">{totalesAnuales.RechazadasRecuperablesCant.toLocaleString('es-CL')}</span> vig. /{' '}
                      <span className="text-rose-700">{totalesAnuales.RechazadasIncobrablesCant.toLocaleString('es-CL')}</span> incob.)
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => abrirModalDetalle(0, 'todas')}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-md"
                      >
                        Abrir Todo ({esHistorico ? 'Histórico' : anio})
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. VENTANA MODAL FLOTANTE PARA VER EL DETALLE DE LICENCIAS SIN BAJAR EN LA PÁGINA */}
      {mostrarDetalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-6"
          onClick={() => setMostrarDetalle(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div className="bg-[#f8fafc] px-6 py-4 border-b border-[#e2e8f0] flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#016098] text-white uppercase">
                    {mesDetalle > 0
                      ? `${mesesData.find(m => m.Mes === mesDetalle)?.MesNombre || ''} (${etiquetaAnioCorto})`
                      : esHistorico
                      ? 'Histórico (Todos los años)'
                      : `Año Completo ${anio}`}
                  </span>
                  <h3 className="text-base font-extrabold text-[#1e293b]">
                    {ETIQUETAS_FILTRO[filtroEstadoDet]}
                  </h3>
                  {promedioDiasDemora !== null && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-[#016098]">
                      Demora Promedio Pago: {promedioDiasDemora} días
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#64748b] mt-1">
                  Mostrando <b>{registrosDetalleFiltrados.length.toLocaleString('es-CL')}</b> licencias · Estimado:{' '}
                  <b>{formatCLP(sumaEstimadoModal)}</b> · Pagado Inst. de Salud:{' '}
                  <b className="text-emerald-700">{formatCLP(sumaSaludModal)}</b> · Desc. Funcionario:{' '}
                  <b className="text-indigo-700">{formatCLP(sumaDescModal)}</b> · Saldo Pendiente:{' '}
                  <b className="text-amber-700">{formatCLP(sumaPendModal)}</b>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={exportarDetalleExcel}
                  disabled={registrosDetalleFiltrados.length === 0}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  📊 Excel ({registrosDetalleFiltrados.length})
                </button>
                <button
                  onClick={() => {
                    if (registrosDetalleFiltrados.length === 0) return;
                    exportToCorporatePDF({
                      title: `Detalle de Licencias Convenio — ${tituloPeriodoActivo}`,
                      subtitle: `Filtro activo: ${filtroEstadoDet.toUpperCase()}`,
                      orientation: 'landscape',
                      summaryCards: [
                        { label: 'Total Licencias', value: registrosDetalleFiltrados.length.toLocaleString('es-CL') },
                        { label: 'Estimado Total', value: formatCLP(sumaEstimadoModal) },
                        { label: 'Pagado Inst. Salud', value: formatCLP(sumaSaludModal), color: 'green' },
                        { label: 'Saldo Pendiente', value: formatCLP(sumaPendModal), color: 'amber' }
                      ],
                      columns: [
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'RUT', key: 'Rut' },
                        { header: 'Funcionario', key: 'Funcionario' },
                        { header: 'Vig.', key: 'Vigencia', align: 'center' },
                        { header: 'Establecimiento', key: 'Establecimiento' },
                        { header: 'Inst. Salud', key: 'InstitucionSalud' },
                        { header: 'Recepción', key: 'Recepcion', align: 'center', format: v => formatDateDDMMYYYY(v) },
                        { header: 'Desde', key: 'Desde', align: 'center', format: v => formatDateDDMMYYYY(v) },
                        { header: 'Días', key: 'NumDias', align: 'center' },
                        { header: 'Estimado ($)', key: 'PagoEstimado', align: 'right', format: v => formatCLP(v) },
                        { header: 'Pagado Salud ($)', key: 'MontoPagadoSalud', align: 'right', format: v => formatCLP(v) },
                        { header: 'Desc. Func. ($)', key: 'MontoDescuentoFunc', align: 'right', format: v => formatCLP(v) },
                        { header: 'Saldo Pend. ($)', key: 'SaldoPorCobrar', align: 'right', format: v => formatCLP(v) },
                        { header: 'Estado', key: 'EscenarioCobro' }
                      ],
                      rows: registrosDetalleFiltrados,
                      totalsRow: {
                        NumeroLicencia: 'TOTALES',
                        PagoEstimado: formatCLP(sumaEstimadoModal),
                        MontoPagadoSalud: formatCLP(sumaSaludModal),
                        MontoDescuentoFunc: formatCLP(sumaDescModal),
                        SaldoPorCobrar: formatCLP(sumaPendModal)
                      }
                    });
                  }}
                  disabled={registrosDetalleFiltrados.length === 0}
                  className="px-3.5 py-2 bg-[#016098] hover:bg-[#014b78] text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  📄 PDF ({registrosDetalleFiltrados.length})
                </button>
                <button
                  onClick={() => setMostrarDetalle(false)}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg"
                >
                  Cerrar Ventana ✕
                </button>
              </div>
            </div>

            {/* Barra de Filtros Rápidos y Buscador dentro del Modal */}
            <div className="px-6 py-3 bg-white border-b border-[#e2e8f0] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todas', label: `Todas (${registrosDetalle.length})` },
                  {
                    id: 'pagadas',
                    label: `✅ Saldadas Inst. Salud (${registrosDetalle.filter(r => r.EsSaldadaSalud && !r.Rechazo).length})`
                  },
                  {
                    id: 'por-cobrar',
                    label: `⏳ Por Cobrar Inst. Salud (${registrosDetalle.filter(r => r.EscenarioCobro === 'POR_COBRAR_SALUD' && !r.Rechazo).length})`
                  },
                  {
                    id: 'rech-recuperables',
                    label: `🟦 Rech. Recuperables Vigentes (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_RECUPERABLE').length})`
                  },
                  {
                    id: 'rech-incobrables',
                    label: `🟥 Rech. Incobrables No Vig. (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_INCOBRABLE').length})`
                  },
                  {
                    id: 'rech-recuperadas',
                    label: `🟩 Rech. Recuperadas Desc. (${registrosDetalle.filter(r => r.EscenarioCobro === 'RECHAZADA_RECUPERADA').length})`
                  },
                  {
                    id: 'falso-rechazo-salud',
                    label: `⚡ Autorizadas por Pago Salud (${registrosDetalle.filter(r => r.EsFalsoRechazoPagado).length})`
                  }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroEstadoDet(f.id as FiltroDetalleTipo)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      filtroEstadoDet === f.id
                        ? 'bg-[#016098] text-white shadow-2xs'
                        : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={busquedaDet}
                  onChange={e => setBusquedaDet(e.target.value)}
                  placeholder="Buscar licencia, RUT, funcionario, establecimiento..."
                  className="w-64 px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-[#f8fafc]"
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
                  className={`px-2.5 py-1.5 border text-xs font-bold rounded-lg ${
                    ordenCampoDet === 'fecha'
                      ? 'bg-[#016098] text-white border-[#016098]'
                      : 'bg-white border-[#cbd5e1] text-[#016098]'
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
                  className={`px-2.5 py-1.5 border text-xs font-bold rounded-lg ${
                    ordenCampoDet === 'demora'
                      ? 'bg-[#016098] text-white border-[#016098]'
                      : 'bg-white border-[#cbd5e1] text-[#016098]'
                  }`}
                >
                  Demora {ordenCampoDet === 'demora' ? (ordenFechaDet === 'desc' ? '▼' : '▲') : ''}
                </button>
              </div>
            </div>

            {/* Tabla con Scroll Interno dentro del Modal */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-bold sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="p-2.5">N° Licencia</th>
                    <th className="p-2.5">RUT</th>
                    <th className="p-2.5">Funcionario</th>
                    <th className="p-2.5 text-center">Vigencia</th>
                    <th className="p-2.5">Situación</th>
                    <th className="p-2.5">Inst. de Salud</th>
                    <th className="p-2.5">Desde</th>
                    <th className="p-2.5">Fecha Pago</th>
                    <th className="p-2.5 text-center">Demora</th>
                    <th className="p-2.5 text-center">Días</th>
                    <th className="p-2.5 text-right">Pago Estimado</th>
                    <th className="p-2.5 text-right">Pagado Inst. Salud</th>
                    <th className="p-2.5 text-right">Desc. Funcionario</th>
                    <th className="p-2.5 text-right">Saldo Pendiente</th>
                    <th className="p-2.5">Observación Compin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {cargandoDetalle ? (
                    <tr>
                      <td colSpan={15} className="p-12 text-center text-[#64748b] font-semibold">
                        Cargando listado de licencias...
                      </td>
                    </tr>
                  ) : registrosDetalleFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="p-12 text-center text-[#94a3b8]">
                        No hay registros para el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    registrosDetalleFiltrados.slice(0, 500).map(r => {
                      const est = Number(r.PagoEstimado || 0);
                      const pagSalud = Number(r.PagadoSalud || 0);
                      const pagDesc = Number(r.PagadoDescuento || 0);
                      const saldoPend = Number(r.SaldoPendiente ?? r.FaltaPorCobrar ?? 0);
                      const demora =
                        r.DiasDemoraPago !== null && r.DiasDemoraPago !== undefined ? Number(r.DiasDemoraPago) : null;
                      const esVigente = r.Vigencia === 'S';
                      return (
                        <tr key={r.NumeroLicencia} className="hover:bg-sky-50/50">
                          <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                          <td className="p-2.5 whitespace-nowrap">
                            {r.Rut}-{r.DV}
                          </td>
                          <td className="p-2.5 font-semibold truncate max-w-[180px]" title={r.Funcionario}>
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
                            {r.EsFalsoRechazoPagado ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                ⚡ {r.SituacionCobroLabel || 'Autorizada por Pago Salud'}
                              </span>
                            ) : r.EscenarioCobro === 'RECHAZADA_RECUPERABLE' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900">
                                {r.SituacionCobroLabel || 'Rech. Recuperable (Vigente)'}
                              </span>
                            ) : r.EscenarioCobro === 'RECHAZADA_INCOBRABLE' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900">
                                {r.SituacionCobroLabel || 'Rech. Incobrable (No Vigente)'}
                              </span>
                            ) : r.EscenarioCobro === 'RECHAZADA_RECUPERADA' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                {r.SituacionCobroLabel || 'Rech. Recuperada (Desc.)'}
                              </span>
                            ) : r.EscenarioCobro === 'POR_COBRAR_SALUD' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                {r.SituacionCobroLabel || 'Por Cobrar Inst. Salud'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {r.SituacionCobroLabel || 'Saldada'}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">{r.Salud}</td>
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
                              >
                                {demora} d
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">{r.NumDias}</td>
                          <td className="p-2.5 text-right">{formatCLP(est)}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-700">{formatCLP(pagSalud)}</td>
                          <td className="p-2.5 text-right font-bold text-indigo-700">{formatCLP(pagDesc)}</td>
                          <td className="p-2.5 text-right font-bold text-amber-700">{formatCLP(saldoPend)}</td>
                          <td className="p-2.5 truncate max-w-[200px] text-[#016098]" title={r.Observacion_Compin}>
                            {r.Observacion_Compin || r.Obser_apelacion || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {registrosDetalleFiltrados.length > 500 && (
              <div className="px-6 py-2 bg-amber-50 text-amber-900 text-xs text-center font-medium border-t border-amber-200 shrink-0">
                Mostrando las primeras 500 filas en pantalla para fluidez visual. Al presionar{' '}
                <b>Descargar a Excel</b> se exportan los <b>{registrosDetalleFiltrados.length}</b> registros completos.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
