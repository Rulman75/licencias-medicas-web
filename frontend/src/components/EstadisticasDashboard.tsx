import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import * as htmlToImage from 'html-to-image';
import OtrasEstadisticas from './OtrasEstadisticas';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface GroupStat {
  Label: string;
  Mes?: number;
  MesNombre?: string;
  Cantidad: number;
  TotalMonto: number;
  PagadasCantidad: number;
  ImpagasCantidad: number;
  PagadasMonto: number;
  ImpagasMonto: number;
}

interface Stats {
  criterio?: 'desde' | 'recepcion';
  universo: { Cantidad: number; TotalMonto: number };
  pagadas: { Cantidad: number; TotalMonto: number };
  noPagadas: { Cantidad: number; TotalMonto: number };
  composicionCantidad?: any[];
  porSector?: GroupStat[];
  porEntidad?: GroupStat[];
  porMes?: GroupStat[];
}

interface EstadisticasDashboardProps {
  modulo: 'licencias' | 'reposo' | 'pago-directo';
  titulo: string;
}

const MESES_OPCIONES = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' }
];

export default function EstadisticasDashboard({ modulo, titulo }: EstadisticasDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [detalle, setDetalle] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Filtros (Por defecto Criterio = 'desde' -> Fecha de Inicio de Reposo)
  const [criterio, setCriterio] = useState<'desde' | 'recepcion'>('desde');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [startYear, setStartYear] = useState('');
  const [sector, setSector] = useState('');
  const [codUnidad, setCodUnidad] = useState('');
  const [codSalud, setCodSalud] = useState('');
  const [mutualidad, setMutualidad] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [tipoSiniestro, setTipoSiniestro] = useState('');
  const [tipoAlta, setTipoAlta] = useState('');

  const chartComposicionRef = useRef<HTMLDivElement>(null);
  const chartSectorRef = useRef<HTMLDivElement>(null);
  const chartEntidadRef = useRef<HTMLDivElement>(null);
  const chartMesRef = useRef<HTMLDivElement>(null);

  const [dominios, setDominios] = useState<{ salud: any[]; unidades: any[] }>({ salud: [], unidades: [] });
  const [viewingDetail, setViewingDetail] = useState<'universo' | 'pagadas' | 'impagas' | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDominios = async () => {
      try {
        const res = await axios.get('/api/dominios');
        setDominios(res.data.data);
      } catch (err) {
        console.error('Error fetching dominios', err);
      }
    };
    fetchDominios();
  }, []);

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    setLoading(true);
    try {
      const statsRes = await axios.get(`/api/dashboard/stats`, {
        params: {
          year,
          month,
          criterio,
          startYear,
          sector,
          codUnidad,
          codSalud,
          mutualidad,
          vigencia,
          modulo,
          tipoSiniestro,
          tipoAlta
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(statsRes.data.data);
      setViewingDetail(null);
    } catch (err) {
      console.error('Error fetching data', err);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, criterio, navigate, startYear, sector, codUnidad, codSalud, mutualidad, vigencia, modulo, tipoSiniestro, tipoAlta]);

  const loadDetalle = async (type: 'universo' | 'pagadas' | 'impagas', mesOverride?: string) => {
    const token = localStorage.getItem('token');
    const mesAplicar = mesOverride !== undefined ? mesOverride : month;
    if (mesOverride !== undefined && mesOverride !== month) {
      setMonth(mesOverride);
    }
    setLoadingDetalle(true);
    setViewingDetail(type);
    try {
      const res = await axios.get(`/api/licencias/detalle`, {
        params: {
          type,
          year,
          month: mesAplicar,
          criterio,
          startYear,
          sector,
          codUnidad,
          codSalud,
          mutualidad,
          vigencia,
          modulo,
          tipoSiniestro,
          tipoAlta
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetalle(res.data.data);
    } catch (err) {
      console.error('Error fetching details', err);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const formatCurrency = (value: number | string) => {
    if (!value || isNaN(Number(value))) return value;
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(value));
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-CL').format(value);
  };

  const handleExportExcel = () => {
    if (detalle.length === 0 || !viewingDetail) return;

    const formattedDetalle = detalle.map(row => {
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        const val = newRow[key];
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
          const [y, m, d] = val.split('T')[0].split('-');
          newRow[key] = `${d}-${m}-${y}`;
        }
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedDetalle);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Licencias_${viewingDetail}`);

    const mesLabel = month ? `_Mes_${MESES_OPCIONES.find(m => m.value === month)?.label || month}` : '';
    const fileName = `Detalle_${viewingDetail}_${year || startYear || 'Historico'}${mesLabel}_${criterio}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportChartToExcel = (data: any[], type: string) => {
    let sheetData: any[] = [];
    let filename = '';

    if (type === 'composicion') {
      let totalCantidad = 0;
      let totalMonto = 0;
      sheetData = data.map((item: any) => {
        totalCantidad += item.value || 0;
        totalMonto += item.monto || 0;
        return {
          'Estado': item.name,
          'Cantidad': item.value,
          'Monto ($)': item.monto || 0
        };
      });
      sheetData.push({
        'Estado': 'TOTAL',
        'Cantidad': totalCantidad,
        'Monto ($)': totalMonto
      });
      filename = 'Composicion_Por_Estado.xlsx';
    } else if (type === 'sector' || type === 'entidad' || type === 'mes') {
      let totalCantTotal = 0,
        totalMontoTotal = 0;
      let totalCantPagadas = 0,
        totalMontoPagadas = 0;
      let totalCantImpagas = 0,
        totalMontoImpagas = 0;

      const labelKey =
        type === 'sector' ? 'Sector' : type === 'entidad' ? 'Entidad de Salud' : 'Mes';

      sheetData = data.map((item: any) => {
        const cTotal = (item.PagadasCantidad || 0) + (item.ImpagasCantidad || 0);
        const mTotal = (item.PagadasMonto || 0) + (item.ImpagasMonto || 0);

        totalCantTotal += cTotal;
        totalMontoTotal += mTotal;
        totalCantPagadas += item.PagadasCantidad || 0;
        totalMontoPagadas += item.PagadasMonto || 0;
        totalCantImpagas += item.ImpagasCantidad || 0;
        totalMontoImpagas += item.ImpagasMonto || 0;

        return {
          [labelKey]: item.MesNombre || item.Label,
          'Criterio Fecha': criterio === 'recepcion' ? 'Fecha Recepción' : 'Fecha Inicio Reposo (Desde)',
          'Cantidad Total': cTotal,
          'Monto Total ($)': mTotal,
          'Cantidad Pagadas': item.PagadasCantidad || 0,
          'Monto Pagadas ($)': item.PagadasMonto || 0,
          'Cantidad Impagas': item.ImpagasCantidad || 0,
          'Monto Impagas ($)': item.ImpagasMonto || 0
        };
      });

      sheetData.push({
        [labelKey]: 'TOTAL',
        'Criterio Fecha': criterio === 'recepcion' ? 'Fecha Recepción' : 'Fecha Inicio Reposo (Desde)',
        'Cantidad Total': totalCantTotal,
        'Monto Total ($)': totalMontoTotal,
        'Cantidad Pagadas': totalCantPagadas,
        'Monto Pagadas ($)': totalMontoPagadas,
        'Cantidad Impagas': totalCantImpagas,
        'Monto Impagas ($)': totalMontoImpagas
      });

      filename =
        type === 'sector'
          ? 'Licencias_Por_Sector.xlsx'
          : type === 'entidad'
          ? 'Licencias_Por_Entidad.xlsx'
          : `Licencias_Por_Mes_${year || startYear || 'Historico'}_${criterio}.xlsx`;
    }

    if (sheetData.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(sheetData);

    if (type === 'composicion') {
      ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 20 }];
    } else {
      ws['!cols'] = [
        { wch: 30 },
        { wch: 26 },
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 }
      ];
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos Gráfico');
    XLSX.writeFile(wb, filename);
  };

  const handleDownloadChart = async (ref: React.RefObject<HTMLDivElement | null>, name: string) => {
    if (!ref.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(ref.current, { backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `${name}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al exportar gráfico:', err);
      alert('Hubo un error al generar la imagen del gráfico.');
    }
  };

  const pieDataCantidad = stats
    ? [
        { name: 'Pagadas', value: stats.pagadas.Cantidad, monto: stats.pagadas.TotalMonto, color: '#22c55e' },
        { name: 'Impagas', value: stats.noPagadas.Cantidad, monto: stats.noPagadas.TotalMonto, color: '#ef4444' }
      ]
    : [];

  const getDetailTitle = () => {
    const mesNom = month ? ` — ${MESES_OPCIONES.find(m => m.value === month)?.label || ''}` : '';
    const anioNom = year ? ` ${year}` : startYear ? ` (Desde ${startYear})` : '';
    const critNom = criterio === 'recepcion' ? ' [Por Fecha Recepción]' : ' [Por Fecha Inicio Reposo]';
    if (viewingDetail === 'universo') return `Universo Total de Licencias${mesNom}${anioNom}${critNom}`;
    if (viewingDetail === 'pagadas') return `Licencias Pagadas${mesNom}${anioNom}${critNom}`;
    if (viewingDetail === 'impagas') return `Licencias Impagas (Deuda)${mesNom}${anioNom}${critNom}`;
    return '';
  };

  const filteredDetalle = detalle.filter(row => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const num = row.NumeroLicencia?.toString().toLowerCase() || row.Nro_Licencia?.toString().toLowerCase() || '';
    const rut =
      row.RutFuncionario?.toString().toLowerCase() ||
      row.Rut?.toString().toLowerCase() ||
      row.RUT?.toString().toLowerCase() ||
      row.RUT_Trabajador?.toString().toLowerCase() ||
      '';
    return num.includes(q) || rut.includes(q);
  });

  const tableColumns = filteredDetalle.length > 0 ? Object.keys(filteredDetalle[0]) : [];

  return (
    <div className="p-8 w-full mx-auto">
      <div className="flex justify-between items-center mb-6 border-b border-[#e2e8f0] pb-4">
        <h2 className="text-2xl font-bold text-[#016098] flex items-center gap-4">
          {titulo}
          {loading && (
            <span className="flex items-center text-sm font-semibold text-blue-700 bg-blue-100 px-4 py-1.5 rounded-full shadow-sm">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Procesando consulta...
            </span>
          )}
        </h2>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-xl shadow p-6 mb-6 border border-[#e2e8f0]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-[#016098]">Filtros Globales</h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-[#016098] border border-sky-200">
              Criterio Activo: {criterio === 'desde' ? 'Fecha Inicio Reposo (Desde)' : 'Fecha de Recepción'}
              {month ? ` · Mes: ${MESES_OPCIONES.find(m => m.value === month)?.label}` : ''}
              {year ? ` · Año: ${year}` : ''}
            </span>
          </div>
          <button
            onClick={() => {
              setCriterio('desde');
              setYear('');
              setMonth('');
              setStartYear('');
              setSector('');
              setCodUnidad('');
              setCodSalud('');
              setVigencia('');
              setMutualidad('');
              setTipoSiniestro('');
              setTipoAlta('');
            }}
            className="text-sm text-red-500 hover:text-red-700 font-semibold border border-red-200 px-3 py-1 rounded bg-red-50"
          >
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {/* Criterio de Fecha */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Criterio de Fecha</label>
            <select
              value={criterio}
              onChange={e => setCriterio(e.target.value as 'desde' | 'recepcion')}
              className="w-full border border-gray-300 rounded p-2 text-sm font-semibold text-[#016098] bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="desde">Por Fecha Inicio Reposo (Desde)</option>
              <option value="recepcion">Por Fecha Recepción (Tramitadas)</option>
            </select>
          </div>

          {/* Año Específico */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Año Específico</label>
            <select
              value={year}
              onChange={e => {
                setYear(e.target.value);
                setStartYear('');
              }}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Cualquiera</option>
              <option value="2018">2018</option>
              <option value="2019">2019</option>
              <option value="2020">2020</option>
              <option value="2021">2021</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          {/* Mes Específico */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mes</label>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm font-semibold text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Todos los Meses</option>
              {MESES_OPCIONES.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Año Desde */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Año Desde</label>
            <select
              value={startYear}
              onChange={e => {
                setStartYear(e.target.value);
                setYear('');
              }}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Histórico</option>
              <option value="2018">2018</option>
              <option value="2019">2019</option>
              <option value="2020">2020</option>
              <option value="2021">2021</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sector</label>
            <select
              value={sector}
              onChange={e => {
                setSector(e.target.value);
                setCodUnidad('');
              }}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Ambos Sectores</option>
              <option value="educacion">Educación (&lt; 600)</option>
              <option value="salud">Salud (&ge; 600)</option>
            </select>
          </div>

          {/* Unidad */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unidad Educativa/Salud</label>
            <select
              value={codUnidad}
              onChange={e => setCodUnidad(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Todas las Unidades</option>
              {dominios.unidades
                .filter(u => {
                  if (sector === 'educacion') return u.CodUnidad < 600;
                  if (sector === 'salud') return u.CodUnidad >= 600;
                  return true;
                })
                .map(u => (
                  <option key={u.CodUnidad} value={u.CodUnidad}>
                    {u.CodUnidad} - {u.Descripcion?.trim()}
                  </option>
                ))}
            </select>
          </div>

          {modulo === 'licencias' || modulo === 'pago-directo' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Entidad de Salud</label>
              <select
                value={codSalud}
                onChange={e => setCodSalud(e.target.value)}
                className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
              >
                <option value="">Todas (Fonasa, Isapres, etc.)</option>
                {dominios.salud.map(s => (
                  <option key={s.CodSalud} value={s.CodSalud}>
                    {s.Descripcion?.trim()}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mutualidad</label>
                <select
                  value={mutualidad}
                  onChange={e => setMutualidad(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  <option value="">Todas</option>
                  <option value="ACHS">ACHS</option>
                  <option value="Mutual">Mutual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo Siniestro</label>
                <select
                  value={tipoSiniestro}
                  onChange={e => setTipoSiniestro(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  <option value="">Todos</option>
                  <option value="No Ley">No Ley</option>
                  <option value="Trabajo">Trabajo</option>
                  <option value="Trayecto">Trayecto</option>
                  <option value="Enfermedad Profesional">Enfermedad Profesional</option>
                  <option value="Incidente sin lesión">Incidente sin lesión</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo de Alta</label>
                <select
                  value={tipoAlta}
                  onChange={e => setTipoAlta(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  <option value="">Todos</option>
                  <option value="ADF">Alta Diferida (ADF)</option>
                  <option value="ADI">Alta Día (ADI)</option>
                  <option value="AIN">Alta Inmediata (AIN)</option>
                  <option value="TAD">Término Rep. Admin (TAD)</option>
                  <option value="TIN">Término Rep. Inasi (TIN)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vigencia Funcionario</label>
            <select
              value={vigencia}
              onChange={e => setVigencia(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Ambos</option>
              <option value="S">Vigente (S)</option>
              <option value="N">No Vigente (N)</option>
            </select>
          </div>
        </div>
      </div>

      <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {/* Tarjetas Superiores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500 relative flex flex-col justify-between">
            <div>
              <h2 className="text-gray-500 text-sm font-bold uppercase tracking-wide">Total Licencias (Universo)</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-[#016098]">
                  {stats ? formatNumber(stats.universo.Cantidad) : 0}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Monto: {formatCurrency(stats?.universo.TotalMonto || 0)}</p>
            </div>
            <button
              onClick={() => loadDetalle('universo')}
              className="mt-4 w-full bg-blue-50 text-blue-600 font-semibold py-2 rounded text-sm hover:bg-blue-100 transition"
            >
              Ver Detalle Universo
            </button>
          </div>

          {modulo !== 'pago-directo' && (
            <>
              <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500 flex flex-col justify-between">
                <div>
                  <h2 className="text-gray-500 text-sm font-bold uppercase tracking-wide">Licencias Pagadas</h2>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-green-600">
                      {stats ? formatNumber(stats.pagadas.Cantidad) : 0}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Monto: {formatCurrency(stats?.pagadas.TotalMonto || 0)}</p>
                </div>
                <button
                  onClick={() => loadDetalle('pagadas')}
                  className="mt-4 w-full bg-green-50 text-green-700 font-semibold py-2 rounded text-sm hover:bg-green-100 transition"
                >
                  Ver Detalle Pagadas
                </button>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500 flex flex-col justify-between">
                <div>
                  <h2 className="text-gray-500 text-sm font-bold uppercase tracking-wide">Licencias Impagas</h2>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-red-600">
                      {stats ? formatNumber(stats.noPagadas.Cantidad) : 0}
                    </span>
                  </div>
                  <p className="text-sm mt-1 font-semibold text-red-500">
                    Deuda Estimada: {formatCurrency(stats?.noPagadas.TotalMonto || 0)}
                  </p>
                </div>
                <button
                  onClick={() => loadDetalle('impagas')}
                  className="mt-4 w-full bg-red-50 text-red-700 font-semibold py-2 rounded text-sm hover:bg-red-100 transition"
                >
                  Ver Detalle Impagas
                </button>
              </div>
            </>
          )}
        </div>

        {/* Fila de Gráficos Secundarios */}
        {!viewingDetail && stats && modulo !== 'pago-directo' && (
          <div className="space-y-6 mb-8">
            <div
              className={`grid grid-cols-1 ${
                modulo === 'licencias' && stats.porSector ? 'md:grid-cols-3' : 'md:grid-cols-1'
              } gap-6`}
            >
              {/* Gráfico Torta: Composición */}
              <div ref={chartComposicionRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0]">
                <div className="flex justify-between items-center mb-4 px-2">
                  <h3 className="font-bold text-[#016098] flex-1 text-center">COMPOSICIÓN POR ESTADO</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadChart(chartComposicionRef, 'Composicion_Estado')}
                      className="text-[#016098] hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition"
                      title="Descargar Imagen (PNG)"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        ></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => exportChartToExcel(pieDataCantidad, 'composicion')}
                      className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50 transition"
                      title="Exportar a Excel"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        ></path>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieDataCantidad}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => (percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : '')}
                      >
                        {pieDataCantidad.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico Barras: Sector */}
              {modulo === 'licencias' && stats.porSector && (
                <div ref={chartSectorRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0]">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <h3 className="font-bold text-[#016098] flex-1 text-center">LICENCIAS POR SECTOR</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownloadChart(chartSectorRef, 'Licencias_Sector')}
                        className="text-[#016098] hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition"
                        title="Descargar Imagen (PNG)"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          ></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => exportChartToExcel(stats.porSector, 'sector')}
                        className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50 transition"
                        title="Exportar a Excel"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.porSector}>
                        <XAxis dataKey="Label" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: '8px' }}
                          formatter={(value: any, name: any, props: any) => {
                            if (name === 'Pagadas' && modulo !== 'pago-directo') {
                              return [`${value} (Monto: ${formatCurrency(props.payload.PagadasMonto)})`, 'Pagadas'];
                            }
                            if (name === 'Impagas' && modulo !== 'pago-directo') {
                              return [`${value} (Monto: ${formatCurrency(props.payload.ImpagasMonto)})`, 'Impagas'];
                            }
                            return [value, name];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="PagadasCantidad" name="Pagadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="ImpagasCantidad" name="Impagas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Gráfico Barras: Entidad */}
              {modulo === 'licencias' && stats.porEntidad && (
                <div ref={chartEntidadRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0]">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <h3 className="font-bold text-[#016098] flex-1 text-center">LICENCIAS POR ENTIDAD DE SALUD</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownloadChart(chartEntidadRef, 'Licencias_Entidad')}
                        className="text-[#016098] hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition"
                        title="Descargar Imagen (PNG)"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          ></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => exportChartToExcel(stats.porEntidad, 'entidad')}
                        className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50 transition"
                        title="Exportar a Excel"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.porEntidad} margin={{ bottom: 20 }}>
                        <XAxis dataKey="Label" hide />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: '8px' }}
                          formatter={(value: any, name: any, props: any) => {
                            if (name === 'Pagadas' && modulo !== 'pago-directo') {
                              return [`${value} (Monto: ${formatCurrency(props.payload.PagadasMonto)})`, 'Pagadas'];
                            }
                            if (name === 'Impagas' && modulo !== 'pago-directo') {
                              return [`${value} (Monto: ${formatCurrency(props.payload.ImpagasMonto)})`, 'Impagas'];
                            }
                            return [value, name];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="PagadasCantidad" name="Pagadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="ImpagasCantidad" name="Impagas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Desglose y Detalle por Mes (Enero a Diciembre según Criterio Fecha Inicio Reposo / Recepción) */}
            {stats.porMes && stats.porMes.length > 0 && (
              <div ref={chartMesRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#f1f5f9] pb-3">
                  <div>
                    <h3 className="font-bold text-[#016098] uppercase">
                      DESGLOSE MENSUAL DE RECUPERO ({criterio === 'desde' ? 'POR FECHA INICIO REPOSO' : 'POR FECHA DE RECEPCIÓN'})
                      {year ? ` — AÑO ${year}` : startYear ? ` — DESDE ${startYear}` : ' — HISTÓRICO'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Haga clic en cualquier mes de la tabla para filtrar los indicadores o abrir directamente el detalle de licencias de ese mes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {month && (
                      <button
                        type="button"
                        onClick={() => setMonth('')}
                        className="px-3 py-1 bg-sky-50 text-[#016098] border border-sky-200 rounded text-xs font-bold hover:bg-sky-100"
                      >
                        Ver Todos los Meses
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadChart(chartMesRef, `Recupero_Mensual_${year || 'Total'}`)}
                      className="text-[#016098] hover:text-blue-700 p-1.5 rounded hover:bg-blue-50 transition border border-slate-200"
                      title="Descargar Imagen (PNG)"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        ></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => exportChartToExcel(stats.porMes || [], 'mes')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition shadow-xs"
                      title="Exportar Desglose Mensual a Excel"
                    >
                      Exportar Meses a Excel
                    </button>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.porMes}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="Label" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                      <RechartsTooltip
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px' }}
                        formatter={(value: any, name: any, props: any) => {
                          if (name === 'Pagadas') {
                            return [`${value} lic. (${formatCurrency(props.payload.PagadasMonto)})`, 'Pagadas'];
                          }
                          if (name === 'Impagas') {
                            return [`${value} lic. (${formatCurrency(props.payload.ImpagasMonto)})`, 'Impagas'];
                          }
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar dataKey="PagadasCantidad" name="Pagadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ImpagasCantidad" name="Impagas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabla Mensual Interactiva */}
                <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f1f5f9] text-[#475569] font-bold">
                      <tr>
                        <th className="p-2.5">Mes</th>
                        <th className="p-2.5 text-center">Total Licencias</th>
                        <th className="p-2.5 text-right">Monto Total ($)</th>
                        <th className="p-2.5 text-center">Lic. Pagadas</th>
                        <th className="p-2.5 text-right">Monto Pagadas ($)</th>
                        <th className="p-2.5 text-center">Lic. Impagas</th>
                        <th className="p-2.5 text-right">Monto Impagas ($)</th>
                        <th className="p-2.5 text-center">Acciones por Mes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {stats.porMes.map(m => {
                        const isSelected = month === String(m.Mes);
                        return (
                          <tr
                            key={m.Mes}
                            onClick={() => setMonth(isSelected ? '' : String(m.Mes))}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'
                            }`}
                          >
                            <td className="p-2.5 font-bold text-[#016098]">{m.MesNombre || m.Label}</td>
                            <td className="p-2.5 text-center font-bold">{formatNumber(m.Cantidad)}</td>
                            <td className="p-2.5 text-right font-semibold">{formatCurrency(m.TotalMonto)}</td>
                            <td className="p-2.5 text-center text-green-700 font-bold">
                              {formatNumber(m.PagadasCantidad)}
                            </td>
                            <td className="p-2.5 text-right text-green-700 font-semibold">
                              {formatCurrency(m.PagadasMonto)}
                            </td>
                            <td className="p-2.5 text-center text-red-600 font-bold">
                              {formatNumber(m.ImpagasCantidad)}
                            </td>
                            <td className="p-2.5 text-right text-red-600 font-semibold">
                              {formatCurrency(m.ImpagasMonto)}
                            </td>
                            <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => loadDetalle('universo', String(m.Mes))}
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-bold"
                                  title="Ver Universo del Mes"
                                >
                                  Universo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => loadDetalle('pagadas', String(m.Mes))}
                                  className="px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-[11px] font-bold"
                                  title="Ver Pagadas del Mes"
                                >
                                  Pagadas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => loadDetalle('impagas', String(m.Mes))}
                                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-bold"
                                  title="Ver Impagas del Mes"
                                >
                                  Impagas
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grilla Dinámica Horizontal Completa */}
        {viewingDetail && (
          <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-[600px] mt-8">
            <div className="p-4 bg-gray-100 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-bold text-[#016098]">Detalle: {getDetailTitle()}</h2>
              <div className="flex items-center gap-4">
                {loadingDetalle && (
                  <span className="flex items-center text-sm font-semibold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Cargando registros...
                  </span>
                )}
                <input
                  type="text"
                  placeholder="Buscar por Licencia o RUT..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098] w-64"
                />
                <button
                  onClick={handleExportExcel}
                  disabled={detalle.length === 0}
                  className="bg-[#016098] hover:bg-[#024a8d] disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm font-semibold transition shadow-sm"
                >
                  Descargar Excel
                </button>
                <button
                  onClick={() => {
                    setViewingDetail(null);
                    setSearchQuery('');
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded text-sm font-semibold transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="overflow-auto flex-1 p-0">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                <thead className="sticky top-0 bg-gray-200 z-10 shadow-sm">
                  <tr className="text-gray-700 text-xs uppercase tracking-wider">
                    {tableColumns.map(col => (
                      <th key={col} className="p-3 border-b border-gray-300 font-bold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-200">
                  {filteredDetalle.length === 0 && !loadingDetalle ? (
                    <tr>
                      <td colSpan={tableColumns.length || 1} className="p-8 text-center text-gray-500">
                        No hay registros para mostrar con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filteredDetalle.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition">
                        {tableColumns.map(col => {
                          let val = row[col];
                          if (col === 'PagoEstimado' || col === 'MONTOPAG') {
                            val = formatCurrency(val);
                          } else if (val === null || val === undefined) {
                            val = '-';
                          } else if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
                            const [y, m, d] = val.split('T')[0].split('-');
                            val = `${d}-${m}-${y}`;
                          }
                          return (
                            <td key={col} className="p-3 border-b border-gray-100 text-gray-800">
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {detalle.length > 50 && (
              <div className="p-3 text-center text-gray-600 text-xs bg-gray-50 border-t border-gray-200 shrink-0 font-semibold">
                Mostrando los primeros 50 registros de {detalle.length}. (Al presionar &quot;Descargar Excel&quot; se exportan absolutamente todos los registros y columnas).
              </div>
            )}
          </div>
        )}

        {modulo === 'pago-directo' && (
          <div className="mt-12 border-t border-gray-200 pt-8">
            <h2 className="text-xl font-bold text-[#016098] mb-6">Análisis Detallado</h2>
            <OtrasEstadisticas modulo="licencias" titulo="Análisis Detallado Pago Directo" />
          </div>
        )}
      </div>
    </div>
  );
}
