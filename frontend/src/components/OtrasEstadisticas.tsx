import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import * as htmlToImage from 'html-to-image';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';

interface OtrasEstadisticasProps {
  modulo: 'licencias' | 'reposo';
  titulo: string;
}

const COLORS = ['#016098', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function OtrasEstadisticas({ modulo, titulo }: OtrasEstadisticasProps) {
  const chartEvolucionRef = useRef<HTMLDivElement>(null);
  const chartSiniestrosRef = useRef<HTMLDivElement>(null);
  const chartDiasRef = useRef<HTMLDivElement>(null);
  const chartEstablecimientosRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [year, setYear] = useState(new Date().getFullYear().toString());

  const handleDownloadChart = async (ref: any, name: string) => {
    if (!ref.current) return;
    try {
      // Ocultar temporalmente el boton de descarga para que no salga en la imagen
      const btn = ref.current.querySelector('button');
      if (btn) btn.style.display = 'none';
      
      const dataUrl = await htmlToImage.toPng(ref.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      
      if (btn) btn.style.display = 'block';
      
      const link = document.createElement('a');
      link.download = `${name}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al exportar gráfico:', err);
      alert('Hubo un error al generar la imagen del gráfico.');
      // Restaurar el botón en caso de error
      const btn = ref.current.querySelector('button');
      if (btn) btn.style.display = 'block';
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (year) params.append('year', year);
      params.append('modulo', modulo);

      const res = await axios.get(`/api/dashboard/advanced-stats?${params.toString()}`);
      
      const rawData = res.data.data;
      
      // Format Evolucion data to include month names
      const evolucion = rawData.evolucion.map((e: any) => ({
        ...e,
        MesNombre: MONTHS[e.Mes - 1]
      }));

      setStats({ ...rawData, evolucion });
    } catch (error) {
      console.error('Error fetching advanced stats', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [year, modulo]);

  return (
    <div className="p-8 w-full mx-auto pb-20">
      <div className="flex justify-between items-center mb-6 border-b border-[#e2e8f0] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#016098]">{titulo}</h2>
          <p className="text-gray-500 mt-1 text-sm">Estadísticas avanzadas y de gestión.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e2e8f0] mb-8">
        <div className="flex gap-4 items-end">
          <div className="w-48">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Año</label>
            <select 
              value={year} 
              onChange={(e) => setYear(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="2020">2020</option>
              <option value="2021">2021</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <svg className="animate-spin h-8 w-8 text-[#016098]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Evolución Mensual */}
          <div ref={chartEvolucionRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0] relative">
            <button onClick={() => handleDownloadChart(chartEvolucionRef, 'evolucion_mensual')} className="absolute top-4 right-4 text-gray-400 hover:text-[#016098] transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
            <h3 className="text-center font-bold text-[#016098] mb-4">EVOLUCIÓN MENSUAL</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.evolucion} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="MesNombre" tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis tick={{fontSize: 12, fill: '#64748b'}} />
                  <RechartsTooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                  <Legend />
                  <Line type="monotone" name="Licencias" dataKey="Cantidad" stroke="#016098" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Siniestros */}
          <div ref={chartSiniestrosRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0] relative">
            <button onClick={() => handleDownloadChart(chartSiniestrosRef, 'top_siniestros')} className="absolute top-4 right-4 text-gray-400 hover:text-[#016098] transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
            <h3 className="text-center font-bold text-[#016098] mb-4">TOP 10 DIAGNÓSTICOS / MOTIVOS</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.siniestros} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="Motivo" type="category" width={150} tick={{fontSize: 11, fill: '#64748b'}} />
                  <RechartsTooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                  <Bar dataKey="Cantidad" name="Licencias" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rango de Días */}
          <div ref={chartDiasRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0] relative">
            <button onClick={() => handleDownloadChart(chartDiasRef, 'rango_dias')} className="absolute top-4 right-4 text-gray-400 hover:text-[#016098] transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
            <h3 className="text-center font-bold text-[#016098] mb-4">DISTRIBUCIÓN POR DÍAS DE REPOSO</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.dias}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={40}
                    fill="#8884d8"
                    dataKey="Cantidad"
                    nameKey="Rango"
                    label={({ Rango, percent }) => `${Rango} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {stats.dias.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{borderRadius: '8px'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Establecimientos */}
          <div ref={chartEstablecimientosRef} className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0] relative">
            <button onClick={() => handleDownloadChart(chartEstablecimientosRef, 'top_establecimientos')} className="absolute top-4 right-4 text-gray-400 hover:text-[#016098] transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
            <h3 className="text-center font-bold text-[#016098] mb-4">TOP 10 ESTABLECIMIENTOS (CANTIDAD)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.establecimientos} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="Establecimiento" type="category" width={150} tick={{fontSize: 10, fill: '#64748b'}} />
                  <RechartsTooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                  <Bar dataKey="Cantidad" name="Licencias" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
