import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';

interface DashboardData {
  Convenio: number;
  PagoDirecto: number;
  Reposo: number;
  TotalRegistros: number;
  TotalFuncionarios: number;
  TotalDias: number;
  Rechazadas: number;
  Reducidas: number;
  Maternales: number;
  SectorEducacion: number;
  SectorSalud: number;
  TotalEstimado: number;
  TotalPagado: number;
  LicenciasPagadas: number;
  LicenciasPendientesPago: number;
  cheques: {
    TotalCheques: number;
    ChequesAbiertos: number;
    ChequesCerrados: number;
    SaldoPorCuadrar: number;
  };
  evolucion: {
    periodo: string;
    Convenio: number;
    PagoDirecto: number;
    Reposo: number;
    Total: number;
    Estimado: number;
    Pagado: number;
  }[];
  topSalud: {
    Institucion: string;
    Cantidad: number;
    Dias: number;
    Estimado: number;
    Pagado: number;
  }[];
  topEstablecimientos: {
    CodUnidad: number;
    Establecimiento: string;
    Cantidad: number;
    Funcionarios: number;
    Dias: number;
  }[];
  recientes: {
    NumeroLicencia: string;
    Rut: string;
    DV: string;
    Funcionario: string;
    CodUnidad: number;
    Establecimiento: string;
    Salud: string;
    Desde: string;
    Hasta: string;
    Recepcion: string;
    NumDias: number;
    Modalidad: string;
    Rechazo: number;
    Reducida: number;
    Maternal: number;
    PagoEstimado: number;
    TotalPagado: number;
  }[];
}

export default function Inicio() {
  const currentYear = String(new Date().getFullYear());
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(currentYear);
  const [tipoUsuario, setTipoUsuario] = useState('A');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setTipoUsuario((payload.tipo || 'A').trim().toUpperCase());
      } catch {}
    }
  }, []);

  const fetchStats = async (selectedYear = year) => {
    setLoading(true);
    try {
      const url = selectedYear
        ? `/api/dashboard/inicio-stats?year=${selectedYear}`
        : '/api/dashboard/inicio-stats';
      const res = await axios.get(url);
      if (res.data.status === 'ok') {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error al obtener estadísticas de inicio', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(year);
  }, [year]);

  const formatCLP = (val: number) =>
    `$${Math.round(Number(val || 0)).toLocaleString('es-CL')}`;

  const formatDateDDMMYYYY = (isoStr: string) => {
    if (!isoStr) return '-';
    const p = String(isoStr).split('T')[0].split('-');
    if (p.length !== 3) return isoStr;
    return `${p[2]}-${p[1]}-${p[0]}`;
  };

  const esAdmin = tipoUsuario === 'A' || !['G', 'M', 'U', 'P'].includes(tipoUsuario);
  const esGestionAnterior = tipoUsuario === 'G';

  const pieModalidad = stats
    ? [
        { name: 'Convenio', value: stats.Convenio, color: '#016098' },
        { name: 'Pago Directo', value: stats.PagoDirecto, color: '#22c55e' },
        { name: 'Órdenes de Reposo', value: stats.Reposo, color: '#f59e0b' }
      ]
    : [];

  const tasaRecupero =
    stats && stats.TotalEstimado > 0
      ? Math.min(100, (stats.TotalPagado / stats.TotalEstimado) * 100)
      : 0;

  const saldoPendiente =
    stats ? Math.max(0, stats.TotalEstimado - stats.TotalPagado) : 0;

  const promedioDias =
    stats && stats.TotalRegistros > 0
      ? (stats.TotalDias / stats.TotalRegistros).toFixed(1)
      : '0';

  const totalSector =
    stats ? stats.SectorEducacion + stats.SectorSalud : 0;
  const pctEducacion =
    totalSector > 0 && stats ? ((stats.SectorEducacion / totalSector) * 100).toFixed(1) : '0';
  const pctSalud =
    totalSector > 0 && stats ? ((stats.SectorSalud / totalSector) * 100).toFixed(1) : '0';

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Encabezado Principal + Accesos Rápidos + Selector de Año */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-xl shadow-sm border border-[#e2e8f0] gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#016098] mb-1">
            Dashboard General de Licencias Médicas y Reposos
          </h1>
          <p className="text-sm text-[#64748b]">
            Resumen ejecutivo, financiero, institucional y operativo en tiempo real — CMDS Antofagasta
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
          {esAdmin && (
            <>
              <Link
                to="/mantencion/licencias"
                className="px-3.5 py-2 bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                + Ingresar Licencia
              </Link>
              <Link
                to="/mantencion/pagos"
                className="px-3.5 py-2 bg-[#39BABD] hover:bg-[#2da3a6] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                + Ingresar Pago / Cheque
              </Link>
            </>
          )}
          {!esGestionAnterior && (
            <Link
              to="/certificados/licencia"
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
            >
              Emitir Certificado
            </Link>
          )}

          <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#cbd5e1] rounded-lg px-3 py-1.5">
            <span className="text-xs font-bold text-[#475569] uppercase">Periodo:</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#016098] focus:outline-none cursor-pointer"
            >
              <option value="">Histórico (Todos los años)</option>
              <option value="2026">Año 2026</option>
              <option value="2025">Año 2025</option>
              <option value="2024">Año 2024</option>
              <option value="2023">Año 2023</option>
              <option value="2022">Año 2022</option>
              <option value="2021">Año 2021</option>
              <option value="2020">Año 2020</option>
            </select>
          </div>

          <button
            onClick={() => fetchStats(year)}
            className="px-3 py-2 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] text-xs font-bold rounded-lg transition-colors cursor-pointer"
            title="Actualizar indicadores"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div
        className={`transition-opacity duration-300 space-y-6 ${
          loading ? 'opacity-50 pointer-events-none' : 'opacity-100'
        }`}
      >
        {stats && (
          <>
            {/* BLOQUE 1: 6 KPIs Operativos y de Ausentismo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Total Licencias y Funcionarios */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-[#016098] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Total Registros
                  </span>
                  <span className="p-2 rounded-lg bg-[#e0f2fe] text-[#016098]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#1e293b] mt-2">
                  {stats.TotalRegistros.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-[#016098] font-semibold mt-1">
                  {stats.TotalFuncionarios.toLocaleString('es-CL')} funcionarios con licencia
                </p>
              </div>

              {/* Días de Ausentismo */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-[#39BABD] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Días Otorgados
                  </span>
                  <span className="p-2 rounded-lg bg-cyan-50 text-[#39BABD]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#1e293b] mt-2">
                  {stats.TotalDias.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-[#64748b] mt-1">
                  Promedio: <strong className="text-[#1e293b]">{promedioDias} días</strong> / licencia
                </p>
              </div>

              {/* Licencias Convenio */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-indigo-600 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Licencias Convenio
                  </span>
                  <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#1e293b] mt-2">
                  {stats.Convenio.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-indigo-700 font-semibold mt-1">
                  Maternales: {stats.Maternales.toLocaleString('es-CL')}
                </p>
              </div>

              {/* Pago Directo */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-emerald-500 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Licencias P. Directo
                  </span>
                  <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#1e293b] mt-2">
                  {stats.PagoDirecto.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  Subsidio directo Fonasa / Isapre
                </p>
              </div>

              {/* Órdenes de Reposo */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Órdenes de Reposo
                  </span>
                  <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#1e293b] mt-2">
                  {stats.Reposo.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-amber-700 font-semibold mt-1">
                  Mutual / ACHS (Ley 16.744)
                </p>
              </div>

              {/* Rechazadas y Reducidas */}
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-[#EB567F] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide">
                    Rechazadas / Reduc.
                  </span>
                  <span className="p-2 rounded-lg bg-rose-50 text-[#EB567F]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </span>
                </div>
                <p className="text-2xl font-black text-[#EB567F] mt-2">
                  {stats.Rechazadas.toLocaleString('es-CL')}
                </p>
                <p className="text-[11px] text-[#64748b] mt-1">
                  Reducidas: <strong className="text-[#1e293b]">{stats.Reducidas.toLocaleString('es-CL')}</strong> licencias
                </p>
              </div>
            </div>

            {/* BLOQUE 2: Resumen Financiero y Recupero de Subsidios */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Subsidio Estimado */}
              <div className="bg-white rounded-xl shadow-sm p-5 border border-[#e2e8f0] flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#64748b] uppercase">
                    Subsidio Estimado Total
                  </span>
                  <p className="text-2xl font-black text-[#016098] mt-1">
                    {formatCLP(stats.TotalEstimado)}
                  </p>
                </div>
                <p className="text-xs text-[#64748b] mt-3">
                  Proyección base sobre {stats.TotalRegistros.toLocaleString('es-CL')} licencias del periodo
                </p>
              </div>

              {/* Total Recuperado / Pagado */}
              <div className="bg-white rounded-xl shadow-sm p-5 border border-[#e2e8f0] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#64748b] uppercase">
                      Total Recuperado (Pagado)
                    </span>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      {tasaRecupero.toFixed(1)}% recupero
                    </span>
                  </div>
                  <p className="text-2xl font-black text-emerald-600 mt-1">
                    {formatCLP(stats.TotalPagado)}
                  </p>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${Math.min(100, tasaRecupero)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[#64748b] mt-1">
                    {stats.LicenciasPagadas.toLocaleString('es-CL')} licencias con pago registrado
                  </p>
                </div>
              </div>

              {/* Saldo Pendiente por Recuperar */}
              <div className="bg-white rounded-xl shadow-sm p-5 border border-[#e2e8f0] flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#64748b] uppercase">
                    Diferencia / Por Recuperar
                  </span>
                  <p className="text-2xl font-black text-amber-600 mt-1">
                    {formatCLP(saldoPendiente)}
                  </p>
                </div>
                <p className="text-xs text-[#64748b] mt-3">
                  <strong className="text-[#1e293b]">
                    {stats.LicenciasPendientesPago.toLocaleString('es-CL')}
                  </strong>{' '}
                  licencias activas pendientes de pago
                </p>
              </div>

              {/* Estado de Cheques */}
              <div className="bg-white rounded-xl shadow-sm p-5 border border-[#e2e8f0] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#64748b] uppercase">
                      Control de Cheques
                    </span>
                    <span className="text-xs font-bold bg-sky-100 text-[#016098] px-2 py-0.5 rounded-full">
                      {stats.cheques.TotalCheques.toLocaleString('es-CL')} registrados
                    </span>
                  </div>
                  <div className="flex items-baseline gap-4 mt-2">
                    <div>
                      <span className="text-xl font-black text-amber-600">
                        {stats.cheques.ChequesAbiertos.toLocaleString('es-CL')}
                      </span>
                      <span className="text-xs text-[#64748b] ml-1">Abiertos</span>
                    </div>
                    <div>
                      <span className="text-xl font-black text-emerald-600">
                        {stats.cheques.ChequesCerrados.toLocaleString('es-CL')}
                      </span>
                      <span className="text-xs text-[#64748b] ml-1">Cerrados</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-[#64748b] mt-3">
                  Documentos controlados en módulo de Ingreso de Pagos
                </p>
              </div>
            </div>

            {/* BLOQUE 3: Gráficos de Evolución y Distribución */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Evolución Mensual / Anual (Ocupa 2 columnas) */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 border border-[#e2e8f0]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#016098] uppercase">
                      {year
                        ? `Evolución Mensual de Licencias y Reposos — Año ${year}`
                        : 'Evolución Histórica Anual (2020 - Actual)'}
                    </h3>
                    <p className="text-xs text-[#64748b]">
                      Comparativa volumétrica por modalidad (Convenio, Pago Directo y Órdenes de Reposo)
                    </p>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.evolucion} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                      <RechartsTooltip
                        formatter={(value: any, name: any) => [
                          Number(value).toLocaleString('es-CL'),
                          name
                        ]}
                        contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="Convenio" name="Convenio" stackId="a" fill="#016098" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="PagoDirecto" name="Pago Directo" stackId="a" fill="#22c55e" />
                      <Bar dataKey="Reposo" name="Órdenes Reposo" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Distribución por Modalidad + Sector Educación vs Salud */}
              <div className="bg-white rounded-xl shadow-sm p-6 border border-[#e2e8f0] flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#016098] uppercase mb-1">
                    Distribución por Modalidad
                  </h3>
                  <p className="text-xs text-[#64748b] mb-2">
                    Proporción sobre el total del periodo
                  </p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieModalidad}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ percent }) =>
                            (percent || 0) > 0.03 ? `${((percent || 0) * 100).toFixed(1)}%` : ''
                          }
                        >
                          {pieModalidad.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any) => [Number(value).toLocaleString('es-CL'), 'Licencias']}
                          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distribución por Sector: Educación vs Salud */}
                <div className="pt-4 border-t border-[#e2e8f0]">
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-[#016098]">
                      Educación: {stats.SectorEducacion.toLocaleString('es-CL')} ({pctEducacion}%)
                    </span>
                    <span className="text-[#39BABD]">
                      Salud/Adm: {stats.SectorSalud.toLocaleString('es-CL')} ({pctSalud}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-[#016098] h-full"
                      style={{ width: `${pctEducacion}%` }}
                      title={`Sector Educación: ${pctEducacion}%`}
                    />
                    <div
                      className="bg-[#39BABD] h-full"
                      style={{ width: `${pctSalud}%` }}
                      title={`Sector Salud: ${pctSalud}%`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BLOQUE 4: Rankings Institucionales (Salud / Isapres y Establecimientos) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Instituciones de Salud / Isapres */}
              <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] overflow-hidden">
                <div className="p-5 border-b border-[#e2e8f0]">
                  <h3 className="text-sm font-bold text-[#016098] uppercase">
                    Principales Instituciones de Salud (Fonasa / Isapres)
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Volumen de licencias, días otorgados y montos estimados vs. recuperados
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#f8fafc] text-[#475569] uppercase border-b border-[#e2e8f0]">
                      <tr>
                        <th className="py-2.5 px-4">Institución Salud</th>
                        <th className="py-2.5 px-3 text-right">Licencias</th>
                        <th className="py-2.5 px-3 text-right">Días</th>
                        <th className="py-2.5 px-3 text-right">Subsidio Est.</th>
                        <th className="py-2.5 px-4 text-right">Recuperado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {stats.topSalud.map((s, idx) => (
                        <tr key={idx} className="hover:bg-[#f8fafc]">
                          <td className="py-2.5 px-4 font-bold text-[#1e293b]">{s.Institucion}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-[#016098]">
                            {Number(s.Cantidad).toLocaleString('es-CL')}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#64748b]">
                            {Number(s.Dias).toLocaleString('es-CL')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {formatCLP(s.Estimado)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-600">
                            {formatCLP(s.Pagado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 10 Establecimientos / Unidades */}
              <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] overflow-hidden">
                <div className="p-5 border-b border-[#e2e8f0]">
                  <h3 className="text-sm font-bold text-[#016098] uppercase">
                    Top 10 Establecimientos / Unidades con Mayor Ausentismo
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Unidades con mayor cantidad de licencias y días otorgados en el periodo
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#f8fafc] text-[#475569] uppercase border-b border-[#e2e8f0]">
                      <tr>
                        <th className="py-2.5 px-4">Cenco</th>
                        <th className="py-2.5 px-3">Establecimiento / Unidad</th>
                        <th className="py-2.5 px-3 text-right">Funcionarios</th>
                        <th className="py-2.5 px-3 text-right">Licencias</th>
                        <th className="py-2.5 px-4 text-right">Total Días</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {stats.topEstablecimientos.map((u, idx) => (
                        <tr key={idx} className="hover:bg-[#f8fafc]">
                          <td className="py-2.5 px-4 font-bold text-[#016098]">#{u.CodUnidad}</td>
                          <td className="py-2.5 px-3 font-medium text-[#1e293b] truncate max-w-[220px]">
                            {u.Establecimiento}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#64748b]">
                            {Number(u.Funcionarios).toLocaleString('es-CL')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#1e293b]">
                            {Number(u.Cantidad).toLocaleString('es-CL')}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-amber-600">
                            {Number(u.Dias).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* BLOQUE 5: Últimas 10 Licencias Recepcionadas */}
            <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] overflow-hidden">
              <div className="p-5 border-b border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#016098]">
                    Últimas Licencias Recepcionadas en el Sistema
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Actividad reciente registrada en la base de datos de licencias médicas
                  </p>
                </div>
                {esAdmin && (
                  <Link
                    to="/informes/diarias"
                    className="text-xs font-bold text-[#016098] hover:underline"
                  >
                    Ver informe de recepción diaria &rarr;
                  </Link>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[#f8fafc] text-[#475569] uppercase border-b border-[#e2e8f0]">
                    <tr>
                      <th className="py-3 px-4">N° Licencia</th>
                      <th className="py-3 px-3">Recepción</th>
                      <th className="py-3 px-3">RUT</th>
                      <th className="py-3 px-3">Funcionario</th>
                      <th className="py-3 px-3">Establecimiento</th>
                      <th className="py-3 px-3">Salud</th>
                      <th className="py-3 px-3">Desde / Hasta</th>
                      <th className="py-3 px-2 text-center">Días</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-4 text-right">Subsidio Est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {stats.recientes.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-[#64748b]">
                          No se encontraron licencias para el periodo seleccionado.
                        </td>
                      </tr>
                    ) : (
                      stats.recientes.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="py-2.5 px-4 font-bold text-[#016098]">
                            {item.NumeroLicencia}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[#64748b]">
                            {formatDateDDMMYYYY(item.Recepcion)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                            {item.Rut}
                            {item.DV ? `-${item.DV}` : ''}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#1e293b]">
                            {item.Funcionario.trim() || 'Sin nombre'}
                          </td>
                          <td className="py-2.5 px-3 truncate max-w-[180px]" title={item.Establecimiento}>
                            {item.CodUnidad ? `#${item.CodUnidad} ` : ''}
                            {item.Establecimiento}
                          </td>
                          <td className="py-2.5 px-3">{item.Salud || '-'}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {formatDateDDMMYYYY(item.Desde)} al {formatDateDDMMYYYY(item.Hasta)}
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold">{item.NumDias}</td>
                          <td className="py-2.5 px-3">
                            {item.Rechazo === 1 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                RECHAZADA
                              </span>
                            ) : item.Reducida === 1 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                REDUCIDA
                              </span>
                            ) : item.TotalPagado > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                PAGADA
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-[#016098]">
                                VIGENTE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-[#1e293b]">
                            {formatCLP(item.PagoEstimado)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
