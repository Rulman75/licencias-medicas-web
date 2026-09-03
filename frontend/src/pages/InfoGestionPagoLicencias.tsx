import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

interface FuncionarioPagoStat {
  Rut: string;
  Dv: string;
  Apellido_Paterno: string;
  Apellido_Materno: string;
  Nombre: string;
  Sector: string;
  Unidad: string;
  NumeroLicencia: string;
  Desde: string;
  Hasta: string;
  NumDias: number;
  Obser_apelacion: string | null;
  MontoDesc: number;
  PagoEstimado: number;
  PagoRecuperado: number;
  PagoPorRecuperar: number;
  Liquidez: number;
  NumPagos: number | null;
}

interface DetallePago {
  NumeroLicencia: string;
  Monto: number;
  FechaDepCtaCte: string;
  NumeroDocumento: string;
  DiasPagados: number;
  concepto: string;
}

interface Props {
  tipo: 'rechazadas' | 'sin-resolucion';
  titulo: string;
}

export default function InfoGestionPagoLicencias({ tipo, titulo }: Props) {
  const [fechaDesde, setFechaDesde] = useState('2024-01-01');
  const [fechaHasta, setFechaHasta] = useState('2026-12-31');
  const [rutFiltro, setRutFiltro] = useState('');
  
  const [data, setData] = useState<FuncionarioPagoStat[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedLicencia, setSelectedLicencia] = useState<string | null>(null);
  const [detallesPago, setDetallesPago] = useState<DetallePago[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Trigger search on component mount or tipo change
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setSelectedLicencia(null);
      const res = await axios.get('/api/info-gestion/pago-licencias', {
        params: { tipo, fechaDesde, fechaHasta, rutFiltro }
      });
      setData(res.data.data || []);
    } catch (err) {
      console.error(err);
      alert('Error al obtener la información.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalle = async (numeroLicencia: string) => {
    try {
      setLoadingDetalle(true);
      setSelectedLicencia(numeroLicencia);
      const res = await axios.get('/api/info-gestion/pago-licencias/detalle', {
        params: { numeroLicencia }
      });
      setDetallesPago(res.data.data || []);
    } catch (err) {
      console.error(err);
      alert('Error al obtener el detalle de pagos.');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    if (dateString.includes('T')) {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}-${month}-${year}`;
    }
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const exportToExcel = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data.map(item => ({
      'RUT': `${item.Rut}-${item.Dv}`,
      'Nombres': item.Nombre,
      'Apellidos': `${item.Apellido_Paterno} ${item.Apellido_Materno}`,
      'Sector': item.Sector,
      'Unidad': item.Unidad,
      'Nº Licencia': item.NumeroLicencia,
      'Desde': formatDate(item.Desde),
      'Hasta': formatDate(item.Hasta),
      'Días': item.NumDias,
      'Obs. Apelación': item.Obser_apelacion || '',
      'ESTIMADO / MTO. DESC.': `${formatCurrency(item.PagoEstimado)} / ${formatCurrency(item.MontoDesc)}`,
      'Pago Recuperado': item.PagoRecuperado,
      'Pago Por Recuperar': item.PagoPorRecuperar,
      'Liquidez': item.Liquidez
    })));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, 
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, 
      { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Licencias');
    XLSX.writeFile(wb, `Gestion_${tipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportDetalleToExcel = () => {
    if (detallesPago.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(detallesPago.map(item => ({
      'N° Documento': item.NumeroDocumento,
      'Fecha Pago': formatDate(item.FechaDepCtaCte),
      'Dias Pagados': item.DiasPagados,
      'Monto Recuperado': item.Monto,
      'Concepto': item.concepto
    })));
    const wb = XLSX.utils.book_new();
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Pagos');
    XLSX.writeFile(wb, `Detalle_Pagos_${selectedLicencia}.xlsx`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);
  };

  return (
    <div className="p-6 mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-[#016098]">{titulo}</h1>
      </div>

      {/* Filtros */}
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
          <label className="block text-xs font-semibold text-gray-500 mb-1">RUT Funcionario</label>
          <input type="text" placeholder="Ej: 12345678" className="p-2 border rounded-md text-sm w-32" value={rutFiltro} onChange={e => setRutFiltro(e.target.value)} />
        </div>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="bg-[#016098] hover:bg-[#014d7a] text-white px-4 py-2 rounded-md transition font-medium disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-280px)]">
        {/* Tabla Principal */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow border border-[#e2e8f0] overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
            <span>Resultados ({data.length})</span>
            {data.length > 0 && (
              <button onClick={exportToExcel} className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition">
                Exportar Excel
              </button>
            )}
          </div>
          <div className="overflow-x-auto flex-1 max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 shadow-sm">
                <tr>
                  <th className="px-4 py-3">RUT</th>
                  <th className="px-4 py-3">Funcionario</th>
                  <th className="px-4 py-3">Nº Lic</th>
                  <th className="px-4 py-3">Obs. Apelación</th>
                  <th className="px-4 py-3 text-right text-blue-600 whitespace-nowrap">ESTIMADO / MTO. DESC.</th>
                  <th className="px-4 py-3 text-right text-green-600">Recuperado</th>
                  <th className="px-4 py-3 text-right text-red-600">X Recuperar</th>
                  <th className="px-4 py-3 text-right">Liquidez</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr key={idx} className={`border-b hover:bg-blue-50 transition ${selectedLicencia === item.NumeroLicencia ? 'bg-blue-100' : ''}`}>
                    <td className="px-4 py-3">{item.Rut}-{item.Dv}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold">{item.Nombre} {item.Apellido_Paterno} {item.Apellido_Materno}</div>
                      <div className="text-gray-500">{item.Unidad}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">{item.NumeroLicencia}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-[150px]" title={item.Obser_apelacion || ''}>{item.Obser_apelacion}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(item.PagoEstimado)} / <span className="text-gray-500">{formatCurrency(item.MontoDesc)}</span></td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(item.PagoRecuperado)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(item.PagoPorRecuperar)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.Liquidez)}</td>
                    <td className="px-4 py-3 text-center">
                      {(item.PagoRecuperado > 0 || item.NumPagos > 0) && (
                        <button 
                          onClick={() => fetchDetalle(item.NumeroLicencia)}
                          className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200 transition"
                        >
                          Ver Pagos
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && !loading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No se encontraron registros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel Detalle Pagos */}
        <div className="bg-white rounded-xl shadow border border-[#e2e8f0] overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
            <span>Pagos Recibidos {selectedLicencia ? `(Lic: ${selectedLicencia})` : ''}</span>
            {detallesPago.length > 0 && (
              <button 
                onClick={exportDetalleToExcel}
                className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition"
              >
                Excel
              </button>
            )}
          </div>
          <div className="overflow-x-auto flex-1 max-h-[600px] overflow-y-auto">
            {loadingDetalle ? (
              <div className="p-8 text-center text-gray-500">Cargando pagos...</div>
            ) : !selectedLicencia ? (
              <div className="p-8 text-center text-gray-400 italic">Selecciona "Ver Pagos" en una licencia para ver su historial.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">N° Documento</th>
                    <th className="px-4 py-3">Fecha Pago</th>
                    <th className="px-4 py-3 text-center">Dias Pagados</th>
                    <th className="px-4 py-3 text-right">Monto Recuperado</th>
                    <th className="px-4 py-3">Concepto</th>
                  </tr>
                </thead>
                <tbody>
                  {detallesPago.length > 0 ? detallesPago.map((det, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{det.NumeroDocumento}</td>
                      <td className="px-4 py-3 font-medium text-gray-600">{formatDate(det.FechaDepCtaCte)}</td>
                      <td className="px-4 py-3 text-center">{det.DiasPagados}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">
                        {formatCurrency(det.Monto)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[150px]" title={det.concepto}>{det.concepto}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No existen registros en la tabla de detalles para esta licencia. El monto recuperado proviene de la tabla principal (MontoDesc).</td></tr>
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
