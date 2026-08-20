import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface PreviewItem {
  NumeroLicencia: string;
  RutFuncionario: string;
  Nombre: string;
  Desde: string;
  Hasta: string;
  NumDias: number;
  DbDesde?: string;
  DbHasta?: string;
}

export default function CargaReposo() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProcessing, setLoadingProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [nuevos, setNuevos] = useState<PreviewItem[]>([]);
  const [modificados, setModificados] = useState<PreviewItem[]>([]);
  const [ignorados, setIgnorados] = useState<PreviewItem[]>([]);
  const [activeTab, setActiveTab] = useState<'nuevos' | 'modificados' | 'ignorados'>('nuevos');
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setNuevos([]);
      setModificados([]);
      setIgnorados([]);
      setError('');
      setSuccess('');
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo Excel primero.');
      return;
    }

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await axios.post('http://localhost:3001/api/reposo/preview', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setNuevos(res.data.data.nuevos);
      setModificados(res.data.data.modificados);
      setIgnorados(res.data.data.ignorados);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error procesando archivo');
    } finally {
      setLoading(false);
    }
  };

  const handleProcesar = async () => {
    if (nuevos.length === 0 && modificados.length === 0) {
      setError('No hay registros nuevos ni modificados para procesar.');
      return;
    }

    const token = localStorage.getItem('token');
    setLoadingProcessing(true);
    setError('');

    try {
      const res = await axios.post('http://localhost:3001/api/reposo/procesar', {
        nuevos,
        modificados,
        fileName: file?.name,
        userName: 'Admin' // Podría venir del token JWT
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setSuccess(`¡Proceso exitoso! Se insertaron ${res.data.nuevos} registros nuevos y ${res.data.modificados} versiones modificadas.`);
      setNuevos([]);
      setModificados([]);
      setIgnorados([]);
      setFile(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar en la base de datos');
    } finally {
      setLoadingProcessing(false);
    }
  };

  const renderTable = (data: PreviewItem[], isModified: boolean = false) => {
    if (data.length === 0) return <p className="text-gray-500 py-4">No hay registros en esta categoría.</p>;

    return (
      <div className="overflow-auto max-h-[500px] border border-gray-200 rounded-lg">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 bg-gray-100 z-10 shadow-sm">
            <tr className="text-gray-700 font-bold uppercase text-xs">
              <th className="p-3">N° Licencia</th>
              <th className="p-3">RUT</th>
              <th className="p-3">Nombre</th>
              <th className="p-3">Días</th>
              <th className="p-3">Desde (Excel)</th>
              <th className="p-3">Hasta (Excel)</th>
              {isModified && (
                <>
                  <th className="p-3 bg-red-50 text-red-700 border-l border-red-200">Desde (Base de Datos)</th>
                  <th className="p-3 bg-red-50 text-red-700">Hasta (Base de Datos)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-blue-50">
                <td className="p-3 font-semibold text-[#013565]">{row.NumeroLicencia}</td>
                <td className="p-3">{row.RutFuncionario}</td>
                <td className="p-3 truncate max-w-xs" title={row.Nombre}>{row.Nombre}</td>
                <td className="p-3 text-center">{row.NumDias}</td>
                <td className={`p-3 ${isModified && row.Desde !== row.DbDesde ? 'bg-green-100 font-bold text-green-800' : ''}`}>
                  {row.Desde || '-'}
                </td>
                <td className={`p-3 ${isModified && row.Hasta !== row.DbHasta ? 'bg-green-100 font-bold text-green-800' : ''}`}>
                  {row.Hasta || '-'}
                </td>
                {isModified && (
                  <>
                    <td className="p-3 bg-red-50 border-l border-red-100 text-red-600 line-through opacity-70">{row.DbDesde || '-'}</td>
                    <td className="p-3 bg-red-50 text-red-600 line-through opacity-70">{row.DbHasta || '-'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-8 w-full mx-auto">
      <h2 className="text-2xl font-bold text-[#016098] mb-6 border-b border-[#e2e8f0] pb-4">Procesar Órdenes de Reposo</h2>
      
      {/* Zona de Carga */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e2e8f0] mb-8">
        <h3 className="text-lg font-semibold text-[#016098] mb-4">Paso 1: Subir Archivo Excel</h3>
        <p className="text-sm text-gray-500 mb-6">
          El sistema detectará automáticamente el formato del archivo al leer la cabecera.
        </p>
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button 
            onClick={handlePreview}
            disabled={!file || loading}
            className="bg-[#013565] text-white px-6 py-2 rounded font-bold whitespace-nowrap disabled:bg-gray-400 hover:bg-[#024a8d] transition"
          >
            {loading ? 'Analizando...' : 'Analizar Archivo'}
          </button>
        </div>

        {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded font-semibold text-sm border border-red-200">{error}</div>}
        {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded font-semibold text-sm border border-green-200">{success}</div>}
      </div>

      {/* Resultados de Análisis */}
      {(nuevos.length > 0 || modificados.length > 0 || ignorados.length > 0) && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-700">Paso 2: Revisión y Procesamiento</h3>
            <button 
              onClick={handleProcesar}
              disabled={loadingProcessing || (nuevos.length === 0 && modificados.length === 0)}
              className="bg-green-600 text-white px-6 py-2 rounded font-bold shadow-md hover:bg-green-700 disabled:bg-gray-400 transition"
            >
              {loadingProcessing ? 'Guardando...' : 'Confirmar e Insertar a Base de Datos'}
            </button>
          </div>
          
          <div className="flex gap-2 border-b border-gray-200 mb-4">
            <button 
              className={`px-4 py-2 font-semibold text-sm ${activeTab === 'nuevos' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('nuevos')}
            >
              Nuevos ({nuevos.length})
            </button>
            <button 
              className={`px-4 py-2 font-semibold text-sm ${activeTab === 'modificados' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('modificados')}
            >
              Modificados ({modificados.length})
            </button>
            <button 
              className={`px-4 py-2 font-semibold text-sm ${activeTab === 'ignorados' ? 'border-b-2 border-gray-500 text-gray-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('ignorados')}
            >
              Sin Cambios ({ignorados.length})
            </button>
          </div>

          <div>
            {activeTab === 'nuevos' && renderTable(nuevos, false)}
            {activeTab === 'modificados' && renderTable(modificados, true)}
            {activeTab === 'ignorados' && renderTable(ignorados, false)}
          </div>
        </div>
      )}
    </div>
  );
}
