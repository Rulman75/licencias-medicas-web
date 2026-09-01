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
}

interface LicenciaDetalle {
  NumeroLicencia: string;
  Desde: string;
  Hasta: string;
  NumDias: number;
  Tipo_enferm: string;
  PagoDirecto: string;
  TotalPagado: number;
}

export default function InfoGestionFuncionarios() {
  const [fechaDesde, setFechaDesde] = useState('2024-08-01');
  const [fechaHasta, setFechaHasta] = useState('2026-08-31');
  const [minDias, setMinDias] = useState(180);
  
  const [data, setData] = useState<FuncionarioStat[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedRut, setSelectedRut] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<LicenciaDetalle[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setSelectedRut(null);
      const res = await axios.get('/api/info-gestion/funcionarios', {
        params: { fechaDesde, fechaHasta, minDias }
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
      'Sucursal': item.NOMBRE_SUCURSAL,
      'Unidad': item.NOMBRE_UNIDAD,
      'Total Días Licencia': item.Total_Dias
    })));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Funcionarios');
    XLSX.writeFile(wb, 'Info_Gestion_Funcionarios.xlsx');
  };

  const exportDetalleToExcel = () => {
    if (detalles.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(detalles.map(item => ({
      'N° Licencia': item.NumeroLicencia,
      'Desde': new Date(item.Desde).toLocaleDateString('es-CL'),
      'Hasta': new Date(item.Hasta).toLocaleDateString('es-CL'),
      'Días': item.NumDias,
      'Tipo Enfermedad': item.Tipo_enferm,
      'Pago Directo': item.PagoDirecto,
      'Total Pagado ($)': item.TotalPagado
    })));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Licencias');
    XLSX.writeFile(wb, `Detalle_Licencias_${selectedRut}.xlsx`);
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
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cantidad Mínima de Días</label>
          <input type="number" className="p-2 border rounded-md text-sm w-32" value={minDias} onChange={e => setMinDias(parseInt(e.target.value) || 0)} />
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
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between">
            <span>Resultados ({data.length})</span>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3">RUT</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Apellidos</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3">Días</th>
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
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No hay resultados. Presiona Buscar.</td></tr>
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
                    <th className="px-4 py-3">N° Licencia</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3 text-center">Días</th>
                    <th className="px-4 py-3 text-right">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalles.length > 0 ? detalles.map((det, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-700">{det.NumeroLicencia}</td>
                      <td className="px-4 py-3 text-xs">
                        <div>{new Date(det.Desde).toLocaleDateString('es-CL')}</div>
                        <div className="text-gray-400">al {new Date(det.Hasta).toLocaleDateString('es-CL')}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-600">{det.NumDias}</td>
                      <td className="px-4 py-3 text-right text-green-700 font-medium">
                        {formatCurrency(det.TotalPagado || 0)}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No se encontraron licencias.</td></tr>
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
