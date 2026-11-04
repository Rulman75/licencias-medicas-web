import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

type TabInforme = 'por-funcionario' | 'diarias' | 'brp' | 'pago-directo' | 'general-pagos' | 'softland';

interface InformesLegacyProps {
  tabInicial?: TabInforme;
}

export default function InformesLegacy({ tabInicial = 'por-funcionario' }: InformesLegacyProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [tabActiva, setTabActiva] = useState<TabInforme>(tabInicial);
  useEffect(() => {
    setTabActiva(tabInicial);
  }, [tabInicial]);

  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);

  // --- TAB 1: POR FUNCIONARIO Y DEUDA / NO PAGADAS ---
  const [rutFunc, setRutFunc] = useState('');
  const [paternoFunc, setPaternoFunc] = useState('');
  const [listaCoincidencias, setListaCoincidencias] = useState<any[]>([]);
  const [fichaFuncionario, setFichaFuncionario] = useState<any | null>(null);
  const [licenciasFunc, setLicenciasFunc] = useState<any[]>([]);
  const [ordenDesdeFunc, setOrdenDesdeFunc] = useState<'desc' | 'asc'>('desc');
  const [rentasFunc, setRentasFunc] = useState<any[]>([]);
  const [noPagadasDeuda, setNoPagadasDeuda] = useState<any[]>([]);
  const [subTabFunc, setSubTabFunc] = useState<'licencias' | 'deuda' | 'rentas'>('licencias');

  // --- TAB 2: LICENCIAS DIARIAS ---
  const [diariasDesde, setDiariasDesde] = useState(todayStr);
  const [diariasHasta, setDiariasHasta] = useState(todayStr);
  const [registrosDiarias, setRegistrosDiarias] = useState<any[]>([]);

  // --- TAB 3: LICENCIAS BRP ---
  const [brpMes, setBrpMes] = useState<number>(currentMonth);
  const [brpAnio, setBrpAnio] = useState<number>(currentYear);
  const [registrosBrp, setRegistrosBrp] = useState<any[]>([]);

  // --- TAB 4: PAGO DIRECTO MENSUAL ---
  const [pdMes, setPdMes] = useState<number>(currentMonth);
  const [pdAnio, setPdAnio] = useState<number>(currentYear);
  const [registrosPD, setRegistrosPD] = useState<any[]>([]);

  // --- TAB 5: GENERAL PAGOS / NO PAGADAS ANUAL ---
  const [genAnio, setGenAnio] = useState<number>(currentYear);
  const [genTipo, setGenTipo] = useState('Todos');
  const [genNumDoc, setGenNumDoc] = useState('');
  const [registrosGeneral, setRegistrosGeneral] = useState<any[]>([]);

  // --- TAB 6: CAPTURA SOFTLAND ---
  const [softTipo, setSoftTipo] = useState<'licencias' | 'pagos'>('licencias');
  const [softSector, setSoftSector] = useState<'Educacion' | 'Salud'>('Educacion');
  const [softDesde, setSoftDesde] = useState(todayStr);
  const [softHasta, setSoftHasta] = useState(todayStr);
  const [registrosSoftland, setRegistrosSoftland] = useState<any[]>([]);

  const formatDateDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return '';
    const clean = String(isoDate).split('T')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  // 1. Buscar por Funcionario (RUT o Apellido Paterno)
  const buscarPorFuncionario = async (rutDirecto?: string) => {
    const r = (rutDirecto !== undefined ? rutDirecto : rutFunc).trim();
    const p = paternoFunc.trim();
    if (!r && !p) {
      setMensaje({ tipo: 'error', texto: 'Ingrese un RUT o Apellido Paterno para consultar' });
      return;
    }
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams();
      if (r) params.set('rut', r);
      else params.set('paterno', p);

      const res = await fetch(`/api/informes/por-funcionario?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (data.modo === 'lista') {
          setListaCoincidencias(data.funcionarios || []);
          setFichaFuncionario(null);
          if ((data.funcionarios || []).length === 0) {
            setMensaje({ tipo: 'info', texto: 'No se encontraron funcionarios con ese apellido' });
          }
        } else {
          setListaCoincidencias([]);
          setFichaFuncionario(data.funcionario);
          setLicenciasFunc(data.licencias || []);
          setRentasFunc(data.rentas || []);
          setNoPagadasDeuda(data.noPagadasDeuda || []);
          if (data.funcionario?.Rut) setRutFunc(data.funcionario.Rut);
        }
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error en la consulta' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red consultando funcionario' });
    } finally {
      setCargando(false);
    }
  };

  // 2. Consultar Licencias Diarias
  const consultarDiarias = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/informes/licencias-diarias?desde=${diariasDesde}&hasta=${diariasHasta}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosDiarias(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron licencias recepcionadas en ese rango' });
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error consultando licencias diarias' });
    } finally {
      setCargando(false);
    }
  };

  // 3. Consultar Licencias BRP
  const consultarBrp = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/informes/licencias-brp?mes=${brpMes}&anio=${brpAnio}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosBrp(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron licencias BRP para el período seleccionado' });
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error consultando licencias BRP' });
    } finally {
      setCargando(false);
    }
  };

  // 4. Consultar Licencias Pago Directo Mensual
  const consultarPagoDirecto = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/informes/licencias-pago-directo?mes=${pdMes}&anio=${pdAnio}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosPD(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron licencias de Pago Directo en ese mes/año' });
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error consultando licencias Pago Directo' });
    } finally {
      setCargando(false);
    }
  };

  // 5. Consultar Informe Anual General (Pagadas / No Pagadas / Maternal)
  const consultarGeneralPagos = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams({
        anio: String(genAnio),
        tipo: genTipo,
        numeroDocumento: genNumDoc.trim()
      });
      const res = await fetch(`/api/informes/general-pagos?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosGeneral(data.registros || []);
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error consultando informe general' });
    } finally {
      setCargando(false);
    }
  };

  // 6. Consultar Captura Softland
  const consultarSoftland = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams({
        tipo: softTipo,
        sector: softSector,
        desde: softDesde,
        hasta: softHasta
      });
      const res = await fetch(`/api/informes/captura-softland?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosSoftland(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron registros para Captura Softland en el rango indicado' });
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error consultando Captura Softland' });
    } finally {
      setCargando(false);
    }
  };

  const exportarGenericoExcel = (rows: any[], filename: string) => {
    if (rows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const MOSTRAR_MODULOS_OCULTOS = false;

  return (
    <div className="space-y-6 pb-10">
      {/* Encabezado y Pestañas */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">Informes Operativos de Licencias</h1>
          <p className="text-xs text-[#64748b] mt-1">
            Reportes históricos y deuda por funcionario, recepción diaria, Pago Directo mensual y Estado de Pago Anual
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-[#f1f5f9] p-1.5 rounded-xl">
          {[
            { id: 'por-funcionario', label: 'Licencias por Funcionario (Ficha y Deuda)', visible: true },
            { id: 'diarias', label: 'Recepción Diaria', visible: true },
            { id: 'brp', label: 'Informe BRP', visible: MOSTRAR_MODULOS_OCULTOS },
            { id: 'pago-directo', label: 'Pago Directo Mensual', visible: true },
            { id: 'general-pagos', label: 'Anual Pagadas / Impagas', visible: true },
            { id: 'softland', label: 'Captura Softland', visible: MOSTRAR_MODULOS_OCULTOS }
          ]
            .filter(t => t.visible)
            .map(t => (
            <button
              key={t.id}
              onClick={() => setTabActiva(t.id as TabInforme)}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors ${
                tabActiva === t.id ? 'bg-[#016098] text-white shadow-sm' : 'text-[#475569] hover:text-[#016098]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {mensaje && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex justify-between items-center ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : mensaje.tipo === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="text-xs font-bold ml-4">
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 1: LICENCIAS POR FUNCIONARIO Y CERTIFICADO DE NO PAGO / DEUDA
      ===================================================================== */}
      {tabActiva === 'por-funcionario' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Buscar por RUT Funcionario</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rutFunc}
                    onChange={e => setRutFunc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarPorFuncionario(rutFunc)}
                    placeholder="Ej: 13220915"
                    className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold"
                  />
                  <button
                    onClick={() => buscarPorFuncionario(rutFunc)}
                    disabled={cargando}
                    className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] shrink-0"
                  >
                    Buscar RUT
                  </button>
                </div>
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  O Buscar por Apellido Paterno
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={paternoFunc}
                    onChange={e => setPaternoFunc(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setRutFunc('');
                        buscarPorFuncionario('');
                      }
                    }}
                    placeholder="Ej: GONZALEZ"
                    className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                  />
                  <button
                    onClick={() => {
                      setRutFunc('');
                      buscarPorFuncionario('');
                    }}
                    disabled={cargando}
                    className="px-4 py-2 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-800 shrink-0"
                  >
                    Buscar Apellido
                  </button>
                </div>
              </div>
            </div>

            {/* Coincidencias por Apellido */}
            {listaCoincidencias.length > 0 && (
              <div className="border border-[#e2e8f0] rounded-xl overflow-x-auto max-h-[220px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                    <tr>
                      <th className="p-2">RUT</th>
                      <th className="p-2">Nombre Completo</th>
                      <th className="p-2">Cenco / Establecimiento</th>
                      <th className="p-2">Planta</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {listaCoincidencias.map(f => (
                      <tr key={f.Rut} className="hover:bg-[#f8fafc]">
                        <td className="p-2 font-bold text-[#016098]">
                          {f.Rut}-{f.DV}
                        </td>
                        <td className="p-2 font-semibold">{`${f.Nombre} ${f.Paterno} ${f.Materno}`.trim()}</td>
                        <td className="p-2">
                          {f.CodUnidad} — {f.Establecimiento}
                        </td>
                        <td className="p-2">{f.Planta}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => buscarPorFuncionario(f.Rut)}
                            className="px-3 py-1 bg-[#016098] text-white rounded text-[11px] font-bold"
                          >
                            Ver Ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ficha y Sub-pestañas del Funcionario */}
            {fichaFuncionario && (
              <div className="space-y-4 pt-3 border-t border-[#f1f5f9]">
                <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] flex flex-wrap justify-between items-center gap-4 text-xs">
                  <div>
                    <span className="text-[#64748b] block">Funcionario</span>
                    <span className="text-sm font-bold text-[#016098]">
                      {`${fichaFuncionario.Nombre} ${fichaFuncionario.Paterno} ${fichaFuncionario.Materno}`.trim()} (
                      {fichaFuncionario.Rut}-{fichaFuncionario.DV})
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block">Establecimiento / Unidad</span>
                    <span className="font-semibold">
                      {fichaFuncionario.CodUnidad} — {fichaFuncionario.Establecimiento || 'Sin establecimiento'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block">Cargo / Planta</span>
                    <span className="font-semibold">{fichaFuncionario.Planta || '-'}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSubTabFunc('licencias')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        subTabFunc === 'licencias' ? 'bg-[#016098] text-white' : 'bg-white border border-[#cbd5e1]'
                      }`}
                    >
                      Historial Licencias ({licenciasFunc.length})
                    </button>
                    <button
                      onClick={() => setSubTabFunc('deuda')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        subTabFunc === 'deuda' ? 'bg-[#EB567F] text-white' : 'bg-white border border-[#cbd5e1]'
                      }`}
                    >
                      Certificado No Pago / Deuda ({noPagadasDeuda.length})
                    </button>
                    <button
                      onClick={() => setSubTabFunc('rentas')}
                      className={`px-3 py-1.5 rounded-lg font-bold ${
                        subTabFunc === 'rentas' ? 'bg-[#39BABD] text-white' : 'bg-white border border-[#cbd5e1]'
                      }`}
                    >
                      Histórico Rentas ({rentasFunc.length})
                    </button>
                  </div>
                </div>

                {subTabFunc === 'licencias' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOrdenDesdeFunc(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                        className="px-3 py-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#016098] border border-[#cbd5e1] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <span>Orden Desde:</span>
                        <span className="font-bold">
                          {ordenDesdeFunc === 'desc' ? 'Más recientes primero ▼' : 'Más antiguas primero ▲'}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          exportarGenericoExcel(
                            [...licenciasFunc]
                              .sort((a, b) =>
                                ordenDesdeFunc === 'asc'
                                  ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                                  : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                              )
                              .map(l => ({
                              'N° Licencia': l.NumeroLicencia,
                              'Desde': formatDateDDMMYYYY(l.Desde),
                              'Hasta': formatDateDDMMYYYY(l.Hasta),
                              'Días Lic.': l.NumDias,
                              'Días Aut.': l.DiasAutorizados,
                              'Modalidad': l.PagoDirecto,
                              'Tipo Enferm.': l.TipoEnferm,
                              'Pago Estimado ($)': l.PagoEstimado,
                              'Monto Pagado ($)': l.MontoPagadoDetalle || l.TotalPagadoTabla,
                              'Rechazo': l.Rechazo ? 'SI' : 'NO',
                              'Observación': l.Observacion,
                              'Obs. Apelación': l.ObserApelacion
                            })),
                            `Licencias_Funcionario_${fichaFuncionario.Rut}`
                          )
                        }
                        className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                      >
                        Exportar a Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                          <tr>
                            <th className="p-2.5">N° Licencia</th>
                            <th
                              onClick={() => setOrdenDesdeFunc(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                              className="p-2.5 cursor-pointer select-none hover:bg-[#e2e8f0] text-[#016098] transition-colors"
                              title="Clic para ordenar por Fecha Desde"
                            >
                              <span className="inline-flex items-center gap-1 font-bold">
                                Desde {ordenDesdeFunc === 'desc' ? '▼' : '▲'}
                              </span>
                            </th>
                            <th className="p-2.5">Hasta</th>
                            <th className="p-2.5 text-center">Días</th>
                            <th className="p-2.5 text-center">Aut.</th>
                            <th className="p-2.5">Modalidad</th>
                            <th className="p-2.5 text-right">Pago Estimado</th>
                            <th className="p-2.5 text-right">Monto Pagado</th>
                            <th className="p-2.5">Observación / Apelación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {[...licenciasFunc]
                            .sort((a, b) =>
                              ordenDesdeFunc === 'asc'
                                ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                                : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                            )
                            .map(l => (
                            <tr key={l.NumeroLicencia} className="hover:bg-[#f8fafc]">
                              <td className="p-2.5 font-bold text-[#016098]">{l.NumeroLicencia}</td>
                              <td className="p-2.5">{formatDateDDMMYYYY(l.Desde)}</td>
                              <td className="p-2.5">{formatDateDDMMYYYY(l.Hasta)}</td>
                              <td className="p-2.5 text-center">{l.NumDias}</td>
                              <td className="p-2.5 text-center">{l.DiasAutorizados}</td>
                              <td className="p-2.5">{l.PagoDirecto}</td>
                              <td className="p-2.5 text-right">${Number(l.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                              <td className="p-2.5 text-right font-bold text-emerald-700">
                                ${Number(l.MontoPagadoDetalle || l.TotalPagadoTabla || 0).toLocaleString('es-CL')}
                              </td>
                              <td className="p-2.5">{l.ObserApelacion || l.Observacion || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {subTabFunc === 'deuda' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-rose-700">
                        CERTIFICADO DE LICENCIAS NO PAGADAS — Total Descuento Calculado: $
                        {noPagadasDeuda
                          .reduce((acc, x) => acc + Number(x.MontoAPagarDescuento || 0), 0)
                          .toLocaleString('es-CL')}
                      </span>
                      <button
                        onClick={() =>
                          exportarGenericoExcel(
                            noPagadasDeuda.map(d => ({
                              'N° Licencia': d.NumeroLicencia,
                              'Desde': formatDateDDMMYYYY(d.Desde),
                              'Hasta': formatDateDDMMYYYY(d.Hasta),
                              'Días Lic.': d.NumDias,
                              'Días Aut.': d.DiasAutorizados,
                              'Días Descuento': d.DiasDescuento,
                              'Monto a Pagar / Descuento ($)': d.MontoAPagarDescuento,
                              'Pago Estimado ($)': d.PagoEstimado
                            })),
                            `Certificado_NoPago_${fichaFuncionario.Rut}`
                          )
                        }
                        className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                      >
                        Exportar Certificado No Pago a Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                          <tr>
                            <th className="p-2.5">N° Licencia</th>
                            <th className="p-2.5">Desde</th>
                            <th className="p-2.5">Hasta</th>
                            <th className="p-2.5 text-center">Días Lic.</th>
                            <th className="p-2.5 text-center">Días Aut.</th>
                            <th className="p-2.5 text-center">Días Desc.</th>
                            <th className="p-2.5 text-right">Monto Descuento ($)</th>
                            <th className="p-2.5 text-right">Monto Estimado ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {noPagadasDeuda.map(d => (
                            <tr key={d.NumeroLicencia} className="hover:bg-[#f8fafc]">
                              <td className="p-2.5 font-bold text-[#016098]">{d.NumeroLicencia}</td>
                              <td className="p-2.5">{formatDateDDMMYYYY(d.Desde)}</td>
                              <td className="p-2.5">{formatDateDDMMYYYY(d.Hasta)}</td>
                              <td className="p-2.5 text-center">{d.NumDias}</td>
                              <td className="p-2.5 text-center">{d.DiasAutorizados}</td>
                              <td className="p-2.5 text-center font-semibold">{d.DiasDescuento}</td>
                              <td className="p-2.5 text-right font-bold text-rose-700">
                                ${Number(d.MontoAPagarDescuento || 0).toLocaleString('es-CL')}
                              </td>
                              <td className="p-2.5 text-right">${Number(d.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {subTabFunc === 'rentas' && (
                  <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                        <tr>
                          <th className="p-2.5">Año</th>
                          <th className="p-2.5">Mes</th>
                          <th className="p-2.5 text-right">Monto Imponible ($)</th>
                          <th className="p-2.5 text-right">Desc. Previsión ($)</th>
                          <th className="p-2.5 text-right">Desc. Salud ($)</th>
                          <th className="p-2.5 text-right">Impuesto Único ($)</th>
                          <th className="p-2.5 text-right">Monto Neto ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2e8f0]">
                        {rentasFunc.map((r, i) => (
                          <tr key={i} className="hover:bg-[#f8fafc]">
                            <td className="p-2.5 font-bold">{r.Anio}</td>
                            <td className="p-2.5 font-semibold">{r.Mes}</td>
                            <td className="p-2.5 text-right">${Number(r.MontoImponible).toLocaleString('es-CL')}</td>
                            <td className="p-2.5 text-right">${Number(r.DescPrevision).toLocaleString('es-CL')}</td>
                            <td className="p-2.5 text-right">${Number(r.DescSalud).toLocaleString('es-CL')}</td>
                            <td className="p-2.5 text-right">${Number(r.ImpuestoUnico).toLocaleString('es-CL')}</td>
                            <td className="p-2.5 text-right font-bold text-[#016098]">
                              ${Number(r.MontoNeto).toLocaleString('es-CL')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: LICENCIAS RECEPCIONADAS DIARIAS (Imprime_LicenciasDiarias.vb)
      ===================================================================== */}
      {tabActiva === 'diarias' && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Recepción Desde</label>
                <input
                  type="date"
                  value={diariasDesde}
                  onChange={e => setDiariasDesde(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Recepción Hasta</label>
                <input
                  type="date"
                  value={diariasHasta}
                  onChange={e => setDiariasHasta(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>
              <button
                onClick={consultarDiarias}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Consultar Recepción Diaria
              </button>
            </div>

            {registrosDiarias.length > 0 && (
              <button
                onClick={() =>
                  exportarGenericoExcel(
                    registrosDiarias.map(r => ({
                      'Fecha Recepción': formatDateDDMMYYYY(r.Recepcion),
                      'N° Licencia': r.NumeroLicencia,
                      'RUT': `${r.Rut}-${r.DV}`,
                      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                      'Cenco': r.CodUnidad,
                      'Unidad': r.NombreUnidad,
                      'Planta': r.Planta,
                      'Desde': formatDateDDMMYYYY(r.Desde),
                      'Hasta': formatDateDDMMYYYY(r.Hasta),
                      'Días Lic.': r.NumDias,
                      'Días Aut.': r.DiasAutorizados,
                      'Salud': r.Salud,
                      'Previsión': r.Prevision,
                      'Modalidad': r.PagoDirecto,
                      'Tipo Enferm.': r.TipoEnferm,
                      'Pago Estimado ($)': r.PagoEstimado,
                      'Médico': r.NombreMedico,
                      'Observación': r.Observacion
                    })),
                    `Licencias_Diarias_${diariasDesde}_${diariasHasta}`
                  )
                }
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
              >
                Exportar a Excel ({registrosDiarias.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2.5">Recepción</th>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5">Cenco / Planta</th>
                  <th className="p-2.5">Desde / Hasta</th>
                  <th className="p-2.5 text-center">Días</th>
                  <th className="p-2.5">Salud / AFP</th>
                  <th className="p-2.5">Modalidad</th>
                  <th className="p-2.5 text-right">Pago Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {registrosDiarias.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]">
                    <td className="p-2.5">{formatDateDDMMYYYY(r.Recepcion)}</td>
                    <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                    <td className="p-2.5">
                      {r.Rut}-{r.DV}
                    </td>
                    <td className="p-2.5 font-medium">{`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim()}</td>
                    <td className="p-2.5">
                      {r.CodUnidad} — {r.Planta}
                    </td>
                    <td className="p-2.5">
                      {formatDateDDMMYYYY(r.Desde)} al {formatDateDDMMYYYY(r.Hasta)}
                    </td>
                    <td className="p-2.5 text-center font-bold">{r.NumDias}</td>
                    <td className="p-2.5">
                      {r.Salud} / {r.Prevision}
                    </td>
                    <td className="p-2.5">{r.PagoDirecto}</td>
                    <td className="p-2.5 text-right">${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: INFORME LICENCIAS BRP (ImprimeLicenciasBRP.vb)
      ===================================================================== */}
      {tabActiva === 'brp' && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Mes</label>
                <select
                  value={brpMes}
                  onChange={e => setBrpMes(Number(e.target.value))}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>
                      Mes {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Año</label>
                <input
                  type="number"
                  value={brpAnio}
                  onChange={e => setBrpAnio(Number(e.target.value))}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg w-28 font-bold"
                />
              </div>
              <button
                onClick={consultarBrp}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Generar Informe BRP
              </button>
            </div>

            {registrosBrp.length > 0 && (
              <button
                onClick={() =>
                  exportarGenericoExcel(
                    registrosBrp.map(r => ({
                      'RUT': `${r.Rut}-${r.DV}`,
                      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                      'Cenco': r.CodUnidad,
                      'Planta': r.Planta,
                      'N° Licencia': r.NumeroLicencia,
                      'Desde': formatDateDDMMYYYY(r.Desde),
                      'Hasta': formatDateDDMMYYYY(r.Hasta),
                      'Días Lic.': r.NumDias,
                      'Días Aut.': r.DiasAutorizados,
                      'Salud': r.Salud,
                      'Pago Estimado ($)': r.PagoEstimado,
                      'Observación': r.Observacion
                    })),
                    `Licencias_BRP_${brpMes}_${brpAnio}`
                  )
                }
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
              >
                Exportar BRP a Excel ({registrosBrp.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5">Cenco</th>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5">Desde</th>
                  <th className="p-2.5">Hasta</th>
                  <th className="p-2.5 text-center">Días</th>
                  <th className="p-2.5">Salud</th>
                  <th className="p-2.5 text-right">Pago Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {registrosBrp.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]">
                    <td className="p-2.5">
                      {r.Rut}-{r.DV}
                    </td>
                    <td className="p-2.5 font-medium">{`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim()}</td>
                    <td className="p-2.5">{r.CodUnidad}</td>
                    <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                    <td className="p-2.5">{formatDateDDMMYYYY(r.Desde)}</td>
                    <td className="p-2.5">{formatDateDDMMYYYY(r.Hasta)}</td>
                    <td className="p-2.5 text-center font-bold">{r.NumDias}</td>
                    <td className="p-2.5">{r.Salud}</td>
                    <td className="p-2.5 text-right">${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PAGO DIRECTO MENSUAL (Frm_PagoDirecto.vb)
      ===================================================================== */}
      {tabActiva === 'pago-directo' && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Mes</label>
                <select
                  value={pdMes}
                  onChange={e => setPdMes(Number(e.target.value))}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>
                      Mes {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Año</label>
                <input
                  type="number"
                  value={pdAnio}
                  onChange={e => setPdAnio(Number(e.target.value))}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg w-28 font-bold"
                />
              </div>
              <button
                onClick={consultarPagoDirecto}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Consultar Pago Directo
              </button>
            </div>

            {registrosPD.length > 0 && (
              <button
                onClick={() =>
                  exportarGenericoExcel(
                    registrosPD.map(r => ({
                      'RUT': `${r.Rut}-${r.DV}`,
                      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                      'Cenco': r.CodUnidad,
                      'Planta': r.Planta,
                      'N° Licencia': r.NumeroLicencia,
                      'Desde': formatDateDDMMYYYY(r.Desde),
                      'Hasta': formatDateDDMMYYYY(r.Hasta),
                      'Días Lic.': r.NumDias,
                      'Días Pagados': r.NumDiasPagados,
                      'Salud': r.Salud,
                      'Pago Estimado ($)': r.PagoEstimado,
                      'Total Pagado ($)': r.TotalPagado
                    })),
                    `Licencias_PagoDirecto_${pdMes}_${pdAnio}`
                  )
                }
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
              >
                Exportar a Excel ({registrosPD.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5">Cenco / Planta</th>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5">Desde</th>
                  <th className="p-2.5">Hasta</th>
                  <th className="p-2.5 text-center">Días Lic.</th>
                  <th className="p-2.5 text-right">Pago Estimado</th>
                  <th className="p-2.5 text-right">Total Pagado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {registrosPD.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]">
                    <td className="p-2.5">
                      {r.Rut}-{r.DV}
                    </td>
                    <td className="p-2.5 font-medium">{`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim()}</td>
                    <td className="p-2.5">
                      {r.CodUnidad} — {r.Planta}
                    </td>
                    <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                    <td className="p-2.5">{formatDateDDMMYYYY(r.Desde)}</td>
                    <td className="p-2.5">{formatDateDDMMYYYY(r.Hasta)}</td>
                    <td className="p-2.5 text-center">{r.NumDias}</td>
                    <td className="p-2.5 text-right">${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-bold text-emerald-700">
                      ${Number(r.TotalPagado || 0).toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: INFORME ANUAL PAGADAS / NO PAGADAS / MATERNAL (Imprimenopagadas.vb)
      ===================================================================== */}
      {tabActiva === 'general-pagos' && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Año</label>
                <input
                  type="number"
                  value={genAnio}
                  onChange={e => setGenAnio(Number(e.target.value))}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg w-28 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Filtro Estado / Tipo</label>
                <select
                  value={genTipo}
                  onChange={e => setGenTipo(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                >
                  <option value="Todos">Todos</option>
                  <option value="Maternal">Maternal</option>
                  <option value="Pagadas Resumen">Pagadas Resumen</option>
                  <option value="Pagadas Detalle">Pagadas Detalle</option>
                  <option value="No Pagadas">No Pagadas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">N° Documento (Opcional)</label>
                <input
                  type="text"
                  value={genNumDoc}
                  onChange={e => setGenNumDoc(e.target.value)}
                  placeholder="Todos"
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg w-36"
                />
              </div>
              <button
                onClick={consultarGeneralPagos}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Generar Informe Anual
              </button>
            </div>

            {registrosGeneral.length > 0 && (
              <button
                onClick={() =>
                  exportarGenericoExcel(
                    registrosGeneral.map(r => ({
                      'N° Licencia': r.NumeroLicencia,
                      'RUT': `${r.Rut}-${r.DV}`,
                      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                      'Cenco': r.CodUnidad,
                      'Desde': formatDateDDMMYYYY(r.Desde),
                      'Hasta': formatDateDDMMYYYY(r.Hasta),
                      'Días Lic.': r.NumDias,
                      'Días Pagados': r.DiasPagados,
                      'Salud': r.Salud,
                      'Previsión': r.Prevision,
                      'Modalidad': r.PagoDirecto,
                      'Tipo Enferm.': r.TipoEnferm,
                      'Pago Estimado ($)': r.PagoEstimado,
                      'Monto Pagado ($)': r.MontoPagado,
                      'N° Documento': r.NumeroDocumento,
                      'Concepto': r.Concepto
                    })),
                    `Informe_Anual_${genTipo}_${genAnio}`
                  )
                }
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
              >
                Exportar a Excel ({registrosGeneral.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5">Cenco</th>
                  <th className="p-2.5">Desde / Hasta</th>
                  <th className="p-2.5 text-center">Días Lic/Pag</th>
                  <th className="p-2.5">Salud</th>
                  <th className="p-2.5 text-right">Pago Estimado</th>
                  <th className="p-2.5 text-right">Monto Pagado</th>
                  <th className="p-2.5">N° Doc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {registrosGeneral.slice(0, 500).map((r, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]">
                    <td className="p-2.5 font-bold text-[#016098]">{r.NumeroLicencia}</td>
                    <td className="p-2.5">
                      {r.Rut}-{r.DV}
                    </td>
                    <td className="p-2.5 font-medium">{`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim()}</td>
                    <td className="p-2.5">{r.CodUnidad}</td>
                    <td className="p-2.5">
                      {formatDateDDMMYYYY(r.Desde)} al {formatDateDDMMYYYY(r.Hasta)}
                    </td>
                    <td className="p-2.5 text-center">
                      {r.NumDias} / {r.DiasPagados}
                    </td>
                    <td className="p-2.5">{r.Salud}</td>
                    <td className="p-2.5 text-right">${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                    <td className="p-2.5 text-right font-bold text-emerald-700">
                      ${Number(r.MontoPagado || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="p-2.5">{r.NumeroDocumento || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: CAPTURA SOFTLAND LICENCIAS Y PAGOS (CapturaSoftland.vb + CapturaSoftlandPagos.vb)
      ===================================================================== */}
      {tabActiva === 'softland' && (
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Tipo Captura</label>
                <select
                  value={softTipo}
                  onChange={e => setSoftTipo(e.target.value as 'licencias' | 'pagos')}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-bold text-[#016098]"
                >
                  <option value="licencias">Captura Softland — Licencias</option>
                  <option value="pagos">Captura Softland — Pagos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Sector</label>
                <select
                  value={softSector}
                  onChange={e => setSoftSector(e.target.value as 'Educacion' | 'Salud')}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
                >
                  <option value="Educacion">Educacion (Sector 1)</option>
                  <option value="Salud">Salud (Sector 2)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Desde</label>
                <input
                  type="date"
                  value={softDesde}
                  onChange={e => setSoftDesde(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Hasta</label>
                <input
                  type="date"
                  value={softHasta}
                  onChange={e => setSoftHasta(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>
              <button
                onClick={consultarSoftland}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Generar Captura Softland
              </button>
            </div>

            {registrosSoftland.length > 0 && (
              <button
                onClick={() =>
                  exportarGenericoExcel(
                    registrosSoftland.map(r => ({
                      'Centro Costo (CCosto)': r.CCosto,
                      'Establecimiento': r.Establecimiento,
                      'RUT': `${r.Rut}-${r.DV}`,
                      'Nombre': `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                      'N° Licencia': r.NumeroLicencia,
                      'Días Lic.': r.NumDias,
                      'Desde': formatDateDDMMYYYY(r.Desde),
                      'Hasta': formatDateDDMMYYYY(r.Hasta),
                      ...(softTipo === 'pagos'
                        ? {
                            'Fecha Depósito': formatDateDDMMYYYY(r.FechaDeposito),
                            'Monto Pagado ($)': r.TotalPagado,
                            'N° Documento': r.NumeroDocumento,
                            'Banco': r.Banco
                          }
                        : {
                            'Pago Estimado ($)': r.PagoEstimado
                          }),
                      'Observación': r.Observacion
                    })),
                    `Captura_Softland_${softTipo}_${softSector}_${softDesde}_${softHasta}`
                  )
                }
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
              >
                Exportar Softland a Excel ({registrosSoftland.length})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2.5">CCosto</th>
                  <th className="p-2.5">Establecimiento</th>
                  <th className="p-2.5">RUT</th>
                  <th className="p-2.5">Funcionario</th>
                  <th className="p-2.5">N° Licencia</th>
                  <th className="p-2.5 text-center">Días</th>
                  <th className="p-2.5">Desde / Hasta</th>
                  {softTipo === 'pagos' ? (
                    <>
                      <th className="p-2.5">Fecha Dep.</th>
                      <th className="p-2.5 text-right">Total Pagado ($)</th>
                    </>
                  ) : (
                    <th className="p-2.5 text-right">Pago Estimado ($)</th>
                  )}
                  <th className="p-2.5">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {registrosSoftland.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]">
                    <td className="p-2.5 font-bold text-[#016098]">{r.CCosto}</td>
                    <td className="p-2.5">{r.Establecimiento}</td>
                    <td className="p-2.5">
                      {r.Rut}-{r.DV}
                    </td>
                    <td className="p-2.5 font-medium">{`${r.Nombre} ${r.Paterno} ${r.Materno}`.trim()}</td>
                    <td className="p-2.5 font-semibold">{r.NumeroLicencia}</td>
                    <td className="p-2.5 text-center">{r.NumDias}</td>
                    <td className="p-2.5">
                      {formatDateDDMMYYYY(r.Desde)} al {formatDateDDMMYYYY(r.Hasta)}
                    </td>
                    {softTipo === 'pagos' ? (
                      <>
                        <td className="p-2.5">{formatDateDDMMYYYY(r.FechaDeposito)}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          ${Number(r.TotalPagado || 0).toLocaleString('es-CL')}
                        </td>
                      </>
                    ) : (
                      <td className="p-2.5 text-right font-bold text-[#016098]">
                        ${Number(r.PagoEstimado || 0).toLocaleString('es-CL')}
                      </td>
                    )}
                    <td className="p-2.5">{r.Observacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
