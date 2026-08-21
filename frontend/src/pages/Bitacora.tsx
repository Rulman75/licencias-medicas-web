import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface BitacoraItem {
  Id: number;
  NombreArchivo: string;
  FechaProceso: string;
  TotalRegistros: number;
  RegistrosNuevos: number;
  RegistrosActualizados: number;
  RegistrosNuevosReposos: number;
  Usuario: string;
}

export default function Bitacora() {
  const [data, setData] = useState<BitacoraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  useEffect(() => {
    fetchBitacora();
  }, []);

  const fetchBitacora = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/reposo/auditoria', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data.data);
    } catch (err) {
      setError('Error al cargar la auditoría');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (id: number) => {
    if (!window.confirm('¿Estás seguro que deseas deshacer esta carga? Esto eliminará todos los registros nuevos y revertirá las fechas de los registros actualizados.')) {
      return;
    }
    
    try {
      setRollingBackId(id);
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/reposo/rollback/${id}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message);
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al revertir la carga');
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div className="p-8 w-full mx-auto">
      <div className="flex justify-between items-center mb-6 border-b border-[#e2e8f0] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#016098]">Auditoría de Cargas</h2>
          <p className="text-gray-500 mt-1 text-sm">Historial de archivos procesados en el módulo de Órdenes de Reposo.</p>
        </div>
        <button 
          onClick={fetchBitacora}
          className="bg-[#016098] hover:bg-[#014d7a] text-white px-5 py-2.5 rounded-lg font-semibold transition shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Actualizar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {error ? (
          <div className="p-6 text-red-500 font-semibold">{error}</div>
        ) : loading ? (
          <div className="p-12 flex justify-center items-center gap-3 text-blue-600 font-bold">
            <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Cargando historial...
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-semibold">
            Aún no se ha procesado ningún archivo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-100 border-b border-gray-200 text-gray-700 text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-4">ID</th>
                  <th className="p-4">Fecha de Proceso</th>
                  <th className="p-4">Nombre del Archivo</th>
                  <th className="p-4 text-center">Registros Leídos</th>
                  <th className="p-4 text-center text-green-700 bg-green-50 border-l border-green-100">Nuevos</th>
                  <th className="p-4 text-center text-orange-700 bg-orange-50">Nuevos (Existentes)</th>
                  <th className="p-4 text-center text-teal-700 bg-teal-50">Actualizados</th>
                  <th className="p-4 text-right">Usuario</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.map((row) => {
                  const isReverted = row.NombreArchivo.includes('(REVERTIDO)');
                  const cleanName = row.NombreArchivo.replace('(REVERTIDO)', '').trim();
                  const files = cleanName.split('|').map(s => s.trim());
                  
                  return (
                    <tr key={row.Id} className={`transition ${isReverted ? 'bg-red-50' : 'hover:bg-blue-50'}`}>
                      <td className="p-4 text-gray-500 font-semibold">#{row.Id}</td>
                      <td className="p-4 font-semibold text-[#013565]">{row.FechaProceso}</td>
                      <td className="p-4 text-gray-700 max-w-xs" title={cleanName}>
                        <div className="flex flex-col gap-1">
                          {files.map((file, i) => (
                            <span key={i} className={`truncate text-xs ${isReverted ? 'line-through text-red-400' : ''}`}>
                              📄 {file}
                            </span>
                          ))}
                          {isReverted && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full w-max mt-1">
                              ELIMINADO / REVERTIDO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-gray-600">{row.TotalRegistros}</td>
                      <td className="p-4 text-center font-bold text-green-600 bg-green-50 border-l border-green-100">
                        +{row.RegistrosNuevos}
                      </td>
                      <td className="p-4 text-center font-bold text-orange-600 bg-orange-50">
                        {row.RegistrosNuevosReposos > 0 ? `+${row.RegistrosNuevosReposos}` : '0'}
                      </td>
                      <td className="p-4 text-center font-bold text-teal-600 bg-teal-50">
                        {row.RegistrosActualizados > 0 ? `^${row.RegistrosActualizados}` : '0'}
                      </td>
                      <td className="p-4 text-right text-gray-600 uppercase text-xs font-bold tracking-wider">
                        {row.Usuario}
                      </td>
                      <td className="p-4 text-center">
                        {!isReverted && (
                          <button
                            onClick={() => handleRollback(row.Id)}
                            disabled={rollingBackId === row.Id}
                            className={`text-xs px-3 py-1 rounded border font-bold ${
                              rollingBackId === row.Id 
                              ? 'bg-gray-100 text-gray-400 border-gray-300' 
                              : 'bg-red-100 hover:bg-red-200 text-red-700 border-red-300'
                            }`}
                          >
                            {rollingBackId === row.Id ? 'Revirtiendo...' : 'Deshacer'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
