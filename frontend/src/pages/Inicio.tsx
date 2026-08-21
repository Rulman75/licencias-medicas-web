import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function Inicio() {
  const [stats, setStats] = useState<{ Convenio: number, PagoDirecto: number, Reposo: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const url = year ? `/api/dashboard/inicio-stats?year=${year}` : '/api/dashboard/inicio-stats';
        const res = await axios.get(url);
        setStats(res.data.data);
      } catch (err) {
        console.error("Error al obtener estadísticas de inicio", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [year]);

  const data = stats ? [
    { name: 'Convenio', value: stats.Convenio, color: '#016098' },
    { name: 'Pago Directo', value: stats.PagoDirecto, color: '#22c55e' },
    { name: 'Órdenes de Reposo', value: stats.Reposo, color: '#f59e0b' }
  ] : [];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-xl shadow border border-[#e2e8f0]">
        <div>
          <h1 className="text-2xl font-bold text-[#016098] mb-1">Dashboard General</h1>
          <p className="text-sm text-gray-500">Resumen de licencias y órdenes de reposo en el sistema</p>
        </div>
        
        <div className="mt-4 sm:mt-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Filtro por Año</label>
          <select 
            value={year} 
            onChange={(e) => setYear(e.target.value)}
            className="w-48 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
          >
            <option value="">Todos los años (Histórico)</option>
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

      <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {stats && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Convenio */}
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-[#016098] flex flex-col justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-[#e0f2fe] p-4 rounded-full flex shrink-0">
                    <svg className="w-8 h-8 text-[#016098]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Licencias Convenio</p>
                    <p className="text-3xl font-black text-gray-800 leading-tight">{stats.Convenio.toLocaleString('es-CL')}</p>
                  </div>
                </div>
              </div>

              {/* Pago Directo */}
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-green-500 flex flex-col justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-4 rounded-full flex shrink-0">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Licencias P. Dir.</p>
                    <p className="text-3xl font-black text-gray-800 leading-tight">{stats.PagoDirecto.toLocaleString('es-CL')}</p>
                  </div>
                </div>
              </div>

              {/* Reposo */}
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-amber-500 flex flex-col justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-amber-100 p-4 rounded-full flex shrink-0">
                    <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Órdenes de Reposo</p>
                    <p className="text-3xl font-black text-gray-800 leading-tight">{stats.Reposo.toLocaleString('es-CL')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-6 border border-[#e2e8f0]">
              <h3 className="text-center font-bold text-[#016098] mb-4">DISTRIBUCIÓN PORCENTUAL</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => percent > 0 ? `${name} ${(percent * 100).toFixed(1)}%` : ''}
                    >
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [value.toLocaleString('es-CL'), 'Cantidad']} 
                      contentStyle={{borderRadius: '8px'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
