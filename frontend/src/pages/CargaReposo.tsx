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
  const [fileSiniestros, setFileSiniestros] = useState<File | null>(null);
  const [fileAccidentabilidad, setFileAccidentabilidad] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProcessing, setLoadingProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [nuevos, setNuevos] = useState<PreviewItem[]>([]);
  const [nuevosExistentes, setNuevosExistentes] = useState<PreviewItem[]>([]);
  const [actualizados, setActualizados] = useState<PreviewItem[]>([]);
  const [ignorados, setIgnorados] = useState<PreviewItem[]>([]);
  const [activeTab, setActiveTab] = useState<'nuevos' | 'nuevos_existentes' | 'actualizados' | 'ignorados'>('nuevos');
  
  const resetResults = () => {
    setNuevos([]);
    setNuevosExistentes([]);
    setActualizados([]);
    setIgnorados([]);
    setError('');
    setSuccess('');
  };

  const handleFileSiniestrosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileSiniestros(e.target.files[0]);
      resetResults();
    }
  };

  const handleFileAccidentabilidadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileAccidentabilidad(e.target.files[0]);
      resetResults();
    }
  };

  const handlePreview = async () => {
    if (!fileSiniestros || !fileAccidentabilidad) {
      setError('Por favor selecciona AMBOS archivos Excel (Siniestros y Accidentabilidad) antes de analizar.');
      return;
    }

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('fileSiniestros', fileSiniestros);
    formData.append('fileAccidentabilidad', fileAccidentabilidad);

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await axios.post('/api/reposo/preview', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setNuevos(res.data.data.nuevos);
      setNuevosExistentes(res.data.data.nuevos_existentes);
      setActualizados(res.data.data.actualizados);
      setIgnorados(res.data.data.ignorados);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error procesando archivo');
    } finally {
      setLoading(false);
    }
  };

  const handleProcesar = async () => {
    if (nuevos.length === 0 && nuevosExistentes.length === 0 && actualizados.length === 0) {
      setError('No hay registros nuevos ni modificados para procesar.');
      return;
    }

    const token = localStorage.getItem('token');
    setLoadingProcessing(true);
    setError('');

    try {
      const combinedFileName = `${fileSiniestros?.name} | ${fileAccidentabilidad?.name}`;
      
      const res = await axios.post('/api/reposo/procesar', {
        nuevos,
        nuevos_existentes: nuevosExistentes,
        actualizados,
        fileName: combinedFileName,
        userName: 'Admin'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setSuccess(`¡Proceso exitoso! Insertados Nuevos: ${res.data.nuevos}, Nuevos Reposos Existentes: ${res.data.nuevos_existentes}, Actualizaciones: ${res.data.actualizados}.`);
      setNuevos([]);
      setNuevosExistentes([]);
      setActualizados([]);
      setIgnorados([]);
      setFileSiniestros(null);
      setFileAccidentabilidad(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar en la base de datos');
    } finally {
      setLoadingProcessing(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD to DD-MM-YYYY
    }
    return dateStr;
  };

  const exportToExcel = (data: PreviewItem[], fileName: string) => {
    import('xlsx').then(xlsx => {
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Datos");
      xlsx.writeFile(wb, `Reposo_${fileName}.xlsx`);
    });
  };

  const renderTable = (data: PreviewItem[], isModified: boolean = false, tabName: string) => {
    if (data.length === 0) return <p className="text-gray-500 py-4">No hay registros en esta categoría.</p>;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <button 
            onClick={() => exportToExcel(data, tabName)}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded border border-gray-300 flex items-center gap-1 font-semibold"
          >
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Exportar Excel
          </button>
        </div>
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
                  {formatDate(row.Desde)}
                </td>
                <td className={`p-3 ${isModified && row.Hasta !== row.DbHasta ? 'bg-green-100 font-bold text-green-800' : ''}`}>
                  {formatDate(row.Hasta)}
                </td>
                {isModified && (
                  <>
                    <td className="p-3 bg-red-50 border-l border-red-100 text-red-600 line-through opacity-70">{formatDate(row.DbDesde)}</td>
                    <td className="p-3 bg-red-50 text-red-600 line-through opacity-70">{formatDate(row.DbHasta)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 w-full mx-auto relative">
      {loadingProcessing && (
        <div className="absolute inset-0 bg-white bg-opacity-80 z-50 flex flex-col justify-center items-center rounded-xl">
          <svg className="animate-spin h-12 w-12 text-[#016098] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h2 className="text-xl font-bold text-[#016098]">Trabajando en ello...</h2>
          <p className="text-gray-500 font-semibold mt-2">Guardando registros en la base de datos, por favor espera.</p>
        </div>
      )}
      <h2 className="text-2xl font-bold text-[#016098] mb-6 border-b border-[#e2e8f0] pb-4">Procesar Órdenes de Reposo</h2>
      
      {/* Zona de Carga */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e2e8f0] mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Paso 1: Cargar Archivos ACHS</h2>
        <p className="text-gray-500 mb-4 text-sm">Sube el archivo de Siniestros y el de Accidentabilidad para cruzarlos automáticamente.</p>
        
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Archivo de Siniestros:</label>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              onChange={handleFileSiniestrosChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Archivo Planilla Accidentabilidad:</label>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              onChange={handleFileAccidentabilidadChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <button 
            onClick={handlePreview}
            disabled={!fileSiniestros || !fileAccidentabilidad || loading}
            className="bg-[#013565] text-white px-6 py-2 rounded font-bold whitespace-nowrap disabled:bg-gray-400 hover:bg-[#024a8d] transition self-start mt-2"
          >
            {loading ? 'Analizando...' : 'Analizar Archivos'}
          </button>
        </div>

        {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded font-semibold text-sm border border-red-200">{error}</div>}
        {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded font-semibold text-sm border border-green-200">{success}</div>}
      </div>

      {/* Resultados de Análisis */}
      {(nuevos.length > 0 || nuevosExistentes.length > 0 || actualizados.length > 0 || ignorados.length > 0) && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-700">Paso 2: Revisión y Procesamiento</h3>
            <button 
              onClick={handleProcesar}
              disabled={loadingProcessing || (nuevos.length === 0 && nuevosExistentes.length === 0 && actualizados.length === 0)}
              className="bg-green-600 text-white px-6 py-2 rounded font-bold shadow-md hover:bg-green-700 disabled:bg-gray-400 transition"
            >
              {loadingProcessing ? 'Guardando...' : 'Confirmar e Insertar a Base de Datos'}
            </button>
          </div>
          
          <div className="flex gap-2 border-b border-gray-200 mb-4 overflow-x-auto pb-2">
            <button 
              className={`px-4 py-2 font-semibold text-sm whitespace-nowrap ${activeTab === 'nuevos' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('nuevos')}
            >
              Nuevos ({nuevos.length})
            </button>
            <button 
              className={`px-4 py-2 font-semibold text-sm whitespace-nowrap ${activeTab === 'nuevos_existentes' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('nuevos_existentes')}
            >
              Nuevo Reposo Existente ({nuevosExistentes.length})
            </button>
            <button 
              className={`px-4 py-2 font-semibold text-sm whitespace-nowrap ${activeTab === 'actualizados' ? 'border-b-2 border-teal-500 text-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('actualizados')}
            >
              Actualiza Fecha Termino ({actualizados.length})
            </button>
            <button 
              className={`px-4 py-2 font-semibold text-sm whitespace-nowrap ${activeTab === 'ignorados' ? 'border-b-2 border-gray-500 text-gray-600' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('ignorados')}
            >
              Sin Cambios ({ignorados.length})
            </button>
          </div>

          <div>
            {activeTab === 'nuevos' && renderTable(nuevos, false, 'nuevos')}
            {activeTab === 'nuevos_existentes' && renderTable(nuevosExistentes, true, 'nuevos_existentes')}
            {activeTab === 'actualizados' && renderTable(actualizados, true, 'actualizados')}
            {activeTab === 'ignorados' && renderTable(ignorados, false, 'ignorados')}
          </div>
        </div>
      )}
    </div>
  );
}
