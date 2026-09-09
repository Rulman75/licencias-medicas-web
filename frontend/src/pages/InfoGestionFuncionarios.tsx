import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

interface FuncionarioStat {
  Rut: number;
  Dv: string;
  Apellido_Paterno: string;
  Apellido_Materno: string;
  Nombre: string;
  NOMBRE_SUCURSAL: string;
  NOMBRE_UNIDAD: string;
  Total_Dias: number;
  Tiene_Vigente: number;
}

interface LicenciaDetalle {
  Rut: string;
  Nombre: string;
  Apellidos: string;
  Cenco: string;
  Fecha_Recepcion: string;
  NumeroLicencia: string;
  Desde: string;
  Hasta: string;
  Observacion: string;
  Vigencia: string;
}

export default function InfoGestionFuncionarios() {
  const today = new Date();
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(today.getFullYear() - 2);
  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

  const [fechaDesde, setFechaDesde] = useState(formatDateForInput(twoYearsAgo));
  const [fechaHasta, setFechaHasta] = useState(formatDateForInput(today));
  const [minDias, setMinDias] = useState(180);
  const [rutFiltro, setRutFiltro] = useState('');
  const [unidad, setUnidad] = useState('');
  const [sucursal, setSucursal] = useState('');
  
  const [opcionesUnidad, setOpcionesUnidad] = useState<string[]>([]);
  const [opcionesSucursal, setOpcionesSucursal] = useState<string[]>([]);

  const [data, setData] = useState<FuncionarioStat[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedRut, setSelectedRut] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<LicenciaDetalle[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  React.useEffect(() => {
    const fetchFiltros = async () => {
      try {
        const res = await axios.get('/api/info-gestion/filtros');
        if (res.data && res.data.data) {
          setOpcionesUnidad(res.data.data.unidades || []);
          setOpcionesSucursal(res.data.data.sucursales || []);
        }
      } catch (err) {
        console.error("Error al obtener filtros", err);
      }
    };
    fetchFiltros();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setSelectedRut(null);
      const res = await axios.get('/api/info-gestion/funcionarios', {
        params: { 
          fechaDesde, 
          fechaHasta, 
          minDias,
          ...(rutFiltro ? { rutFiltro } : {}),
          ...(unidad ? { unidad } : {}),
          ...(sucursal ? { sucursal } : {})
        }
      });
      setData(res.data.data || []);
    } catch (err) {
      console.error(err);
      alert('Error al obtener la información.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalle = async (rut: number) => {
    try {
      setLoadingDetalle(true);
      setSelectedRut(rut);
      const res = await axios.get('/api/info-gestion/funcionarios/detalle', {
        params: { rut, fechaDesde, fechaHasta }
      });
      setDetalles(res.data.data || []);
    } catch (err) {
      console.error(err);
      alert('Error al obtener el detalle.');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const exportToExcel = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data.map(item => ({
      'RUT': `${item.Rut}-${item.Dv}`,
      'Nombres': item.Nombre,
      'Apellidos': `${item.Apellido_Paterno} ${item.Apellido_Materno}`,
      'Sector': item.NOMBRE_SUCURSAL,
      'Unidad': item.NOMBRE_UNIDAD,
      'Total Días Licencia': item.Total_Dias,
      'Licencia Vigente': item.Tiene_Vigente ? 'SI' : 'NO'
    })));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Funcionarios');
    XLSX.writeFile(wb, 'Info_Gestion_Funcionarios.xlsx');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    if (dateString.includes('T')) {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}-${month}-${year}`;
    }
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const formatDetalleSheet = (detallesList: LicenciaDetalle[]) => {
    return detallesList.map(item => ({
      'RUT': item.Rut,
      'Nombres': item.Nombre,
      'Apellidos': item.Apellidos,
      'Cenco': item.Cenco,
      'Fecha Recepción': formatDate(item.Fecha_Recepcion),
      'Nº Licencia': item.NumeroLicencia,
      'Desde': formatDate(item.Desde),
      'Hasta': formatDate(item.Hasta),
      'Observación': item.Observacion,
      'Vigencia': item.Vigencia
    }));
  };

  const exportDetalleToExcel = () => {
    if (detalles.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(formatDetalleSheet(detalles));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Licencias');
    XLSX.writeFile(wb, `Detalle_Licencias_${selectedRut}.xlsx`);
  };

  const exportDetalleGlobalToExcel = async () => {
    if (data.length === 0) return;
    try {
      setLoading(true);
      const res = await axios.get('/api/info-gestion/funcionarios/detalle-global', {
        params: { fechaDesde, fechaHasta, minDias, unidad, sucursal, rutFiltro }
      });
      if (res.data && res.data.data) {
        const ws = XLSX.utils.json_to_sheet(formatDetalleSheet(res.data.data));
        const wb = XLSX.utils.book_new();
        ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Detalle Global Licencias');
        XLSX.writeFile(wb, `Detalle_Global_Licencias.xlsx`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al exportar el detalle global.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
  };

  return (
    <div className="p-6 mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#016098]">Información de Gestión - Licencia Funcionarios</h1>
      </div>

      <div className="bg-white p-4 rounded-xl shadow border border-[#e2e8f0] mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
          <input type="date" className="p-2 border rounded-md text-sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
          <input type="date" className="p-2 border rounded-md text-sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Días Mínimos</label>
          <input type="number" className="p-2 border rounded-md text-sm w-24" value={minDias} onChange={e => setMinDias(parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">RUT</label>
          <input type="text" placeholder="Ej: 12345678" className="p-2 border rounded-md text-sm w-32" value={rutFiltro} onChange={e => setRutFiltro(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Unidad</label>
          <select className="p-2 border rounded-md text-sm w-48" value={unidad} onChange={e => setUnidad(e.target.value)}>
            <option value="">Todas</option>
            {opcionesUnidad.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Sector</label>
          <select className="p-2 border rounded-md text-sm w-48" value={sucursal} onChange={e => setSucursal(e.target.value)}>
            <option value="">Todos</option>
            {opcionesSucursal.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        </div>
        <button 
          onClick={fetchSummary}
          disabled={loading}
          className="bg-[#016098] hover:bg-[#014d7a] text-white px-4 py-2 rounded-md transition font-medium disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
        <button 
          onClick={exportToExcel}
          disabled={data.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition font-medium flex items-center gap-2 disabled:opacity-50 ml-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          Exportar
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow border border-[#e2e8f0] overflow-hidden xl:col-span-2">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
            <span>Resultados ({data.length})</span>
            {data.length > 0 && (
              <button 
                onClick={exportDetalleGlobalToExcel}
                disabled={loading}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition flex items-center gap-2 disabled:opacity-50"
                title="Exportar todo el detalle de los resultados a Excel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                {loading ? 'Exportando...' : 'Exportar Detalle Global'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3">RUT</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Apellidos</th>
                  <th className="px-4 py-3">Sector</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3">Días</th>
                  <th className="px-4 py-3 text-center">Lic. Vigente</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.length > 0 ? data.map((item, idx) => (
                  <tr key={idx} className={`border-b hover:bg-gray-50 ${selectedRut === item.Rut ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">{item.Rut}-{item.Dv}</td>
                    <td className="px-4 py-3">{item.Nombre}</td>
                    <td className="px-4 py-3">{item.Apellido_Paterno} {item.Apellido_Materno}</td>
                    <td className="px-4 py-3 text-xs">{item.NOMBRE_SUCURSAL}</td>
                    <td className="px-4 py-3 text-xs">{item.NOMBRE_UNIDAD}</td>
                    <td className="px-4 py-3 font-bold text-[#016098]">{item.Total_Dias}</td>
                    <td className="px-4 py-3 text-center">
                      {item.Tiene_Vigente ? (
                        <span className="bg-green-100 text-green-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded border border-green-400">Licencia Vigente</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => fetchDetalle(item.Rut)}
                        className="text-[#016098] hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1 rounded transition"
                        title="Ver detalle de licencias"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No hay resultados. Presiona Buscar.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border border-[#e2e8f0] overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
            <span>Detalle de Licencias {selectedRut ? `(RUT: ${selectedRut})` : ''}</span>
            {detalles.length > 0 && (
              <button 
                onClick={exportDetalleToExcel}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition flex items-center gap-1"
              >
                Excel Detalle
              </button>
            )}
          </div>
          <div className="overflow-x-auto flex-1 max-h-[600px] overflow-y-auto">
            {loadingDetalle ? (
              <div className="p-8 text-center text-gray-500">Cargando detalle...</div>
            ) : !selectedRut ? (
              <div className="p-8 text-center text-gray-400 italic">Selecciona un funcionario para ver el detalle de sus licencias.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">RUT</th>
                    <th className="px-4 py-3">Funcionario</th>
                    <th className="px-4 py-3">Cenco</th>
                    <th className="px-4 py-3">Recepción</th>
                    <th className="px-4 py-3">Nº Licencia</th>
                    <th className="px-4 py-3">Desde</th>
                    <th className="px-4 py-3">Hasta</th>
                    <th className="px-4 py-3">Observación</th>
                    <th className="px-4 py-3">Vigencia</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.length > 0 ? detalles.map((det, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{det.Rut}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-bold">{det.Nombre}</div>
                        <div>{det.Apellidos}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{det.Cenco}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(det.Fecha_Recepcion)}</td>
                      <td className="px-4 py-3 font-medium text-gray-700">{det.NumeroLicencia}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(det.Desde)}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(det.Hasta)}</td>
                      <td className="px-4 py-3 text-xs truncate max-w-[150px]" title={det.Observacion}>{det.Observacion}</td>
                      <td className="px-4 py-3 text-xs">{det.Vigencia === 'S       ' ? 'SI' : det.Vigencia}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No se encontraron licencias.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
