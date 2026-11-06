import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  exportToCorporatePDF,
  exportCertificadoLicenciasFuncionarioPDF,
  formatCurrencyCLP
} from '../utils/exportUtils';

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
  const [desdeFunc, setDesdeFunc] = useState('');
  const [hastaFunc, setHastaFunc] = useState('');
  const [listaCoincidencias, setListaCoincidencias] = useState<any[]>([]);
  const [licenciasRango, setLicenciasRango] = useState<any[]>([]);
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

  // 1. Buscar por Funcionario (RUT, Apellido Paterno y/o Rango de Fechas Desde/Hasta)
  const buscarPorFuncionario = async (rutDirecto?: string, desdeOverride?: string, hastaOverride?: string) => {
    const r = (rutDirecto !== undefined ? rutDirecto : rutFunc).trim();
    const p = paternoFunc.trim();
    const d = (desdeOverride !== undefined ? desdeOverride : desdeFunc).trim();
    const h = (hastaOverride !== undefined ? hastaOverride : hastaFunc).trim();

    if (!r && !p && !d && !h) {
      setMensaje({ tipo: 'error', texto: 'Ingrese un RUT, Apellido Paterno o Rango de Fechas (Desde / Hasta) para consultar' });
      return;
    }
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams();
      if (r) params.set('rut', r);
      else if (p) params.set('paterno', p);
      if (d) params.set('desde', d);
      if (h) params.set('hasta', h);

      const res = await fetch(`/api/informes/por-funcionario?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (data.modo === 'lista') {
          setListaCoincidencias(data.funcionarios || []);
          setLicenciasRango([]);
          setFichaFuncionario(null);
          if ((data.funcionarios || []).length === 0) {
            setMensaje({ tipo: 'info', texto: 'No se encontraron funcionarios con los criterios indicados' });
          }
        } else if (data.modo === 'rango') {
          setListaCoincidencias([]);
          setFichaFuncionario(null);
          setLicenciasRango(data.licenciasRango || []);
          if ((data.licenciasRango || []).length === 0) {
            setMensaje({ tipo: 'info', texto: 'No se encontraron licencias en el rango de fechas seleccionado' });
          }
        } else {
          setListaCoincidencias([]);
          setLicenciasRango([]);
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Buscar por RUT Funcionario</label>
                <div className="flex gap-1.5">
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
                    className="px-3 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] shrink-0"
                  >
                    Buscar RUT
                  </button>
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  O por Apellido Paterno
                </label>
                <div className="flex gap-1.5">
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
                    className="px-3 py-2 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-800 shrink-0"
                  >
                    Buscar Apellido
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Fecha Desde (Rango)
                </label>
                <input
                  type="date"
                  value={desdeFunc}
                  onChange={e => setDesdeFunc(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Fecha Hasta (Rango)
                </label>
                <input
                  type="date"
                  value={hastaFunc}
                  onChange={e => setHastaFunc(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>

              <div className="md:col-span-2 flex gap-1.5">
                <button
                  onClick={() => buscarPorFuncionario(fichaFuncionario?.Rut || rutFunc)}
                  disabled={cargando}
                  className="flex-1 px-3 py-2 bg-[#39BABD] text-white text-xs font-bold rounded-lg hover:bg-[#2da1a4]"
                  title="Buscar o filtrar por rango de fechas Desde / Hasta"
                >
                  Filtrar Fechas
                </button>
                {(desdeFunc || hastaFunc) && (
                  <button
                    onClick={() => {
                      setDesdeFunc('');
                      setHastaFunc('');
                      if (fichaFuncionario?.Rut || rutFunc || paternoFunc) {
                        buscarPorFuncionario(fichaFuncionario?.Rut || rutFunc, '', '');
                      } else {
                        setLicenciasRango([]);
                      }
                    }}
                    disabled={cargando}
                    className="px-2.5 py-2 border border-[#cbd5e1] text-[#475569] text-xs font-semibold rounded-lg hover:bg-[#f1f5f9]"
                    title="Limpiar filtro de fechas"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Resultado de búsqueda general por Rango de Fechas (cuando no se especificó un RUT único) */}
            {licenciasRango.length > 0 && !fichaFuncionario && (
              <div className="space-y-3 pt-3 border-t border-[#f1f5f9]">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#016098]">
                      Licencias Encontradas en el Rango ({licenciasRango.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setOrdenDesdeFunc(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                      className="px-3 py-1 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#016098] border border-[#cbd5e1] text-xs font-semibold rounded-lg"
                    >
                      Orden Desde: {ordenDesdeFunc === 'desc' ? 'Más recientes ▼' : 'Más antiguas ▲'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        exportarGenericoExcel(
                          [...licenciasRango]
                            .sort((a, b) =>
                              ordenDesdeFunc === 'asc'
                                ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                                : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                            )
                            .map(l => ({
                              'RUT': `${l.Rut}-${l.DV}`,
                              'Funcionario': (l.NombreCompleto || '').trim(),
                              'Establecimiento': `${l.CodUnidad} - ${l.Establecimiento}`,
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
                          `Licencias_Funcionarios_Rango_${desdeFunc || 'Inicio'}_a_${hastaFunc || 'Fin'}`
                        )
                      }
                      className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                    >
                      Exportar a Excel
                    </button>
                    <button
                      onClick={() => {
                        const sorted = [...licenciasRango].sort((a, b) =>
                          ordenDesdeFunc === 'asc'
                            ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                            : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                        );
                        const totEst = sorted.reduce((acc, l) => acc + Number(l.PagoEstimado || 0), 0);
                        const totPag = sorted.reduce(
                          (acc, l) => acc + Number(l.MontoPagadoDetalle || l.TotalPagadoTabla || 0),
                          0
                        );
                        exportToCorporatePDF({
                          title: 'REPORTE DE LICENCIAS MÉDICAS POR RANGO DE FECHAS',
                          subtitle: `Período Consultado: ${desdeFunc ? formatDateDDMMYYYY(desdeFunc) : 'Inicio'} al ${
                            hastaFunc ? formatDateDDMMYYYY(hastaFunc) : 'Actualidad'
                          }`,
                          meta: [
                            { label: 'Desde', value: desdeFunc ? formatDateDDMMYYYY(desdeFunc) : 'Todos' },
                            { label: 'Hasta', value: hastaFunc ? formatDateDDMMYYYY(hastaFunc) : 'Todos' }
                          ],
                          kpis: [
                            { label: 'Total Licencias', value: sorted.length, color: 'blue' },
                            { label: 'Total Pago Estimado', value: formatCurrencyCLP(totEst), color: 'indigo' },
                            { label: 'Total Monto Pagado', value: formatCurrencyCLP(totPag), color: 'emerald' }
                          ],
                          columns: [
                            { header: 'RUT', key: 'RutFmt' },
                            { header: 'Funcionario', key: 'FuncFmt' },
                            { header: 'Establecimiento', key: 'EstabFmt' },
                            { header: 'N° Licencia', key: 'NumeroLicencia' },
                            { header: 'Desde', key: 'DesdeFmt', align: 'center' },
                            { header: 'Hasta', key: 'HastaFmt', align: 'center' },
                            { header: 'Días', key: 'NumDias', align: 'center' },
                            { header: 'Modalidad', key: 'PagoDirecto' },
                            { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' },
                            { header: 'Monto Pagado', key: 'PagadoFmt', align: 'right' }
                          ],
                          rows: sorted.map(l => ({
                            ...l,
                            RutFmt: `${l.Rut}-${l.DV}`,
                            FuncFmt: (l.NombreCompleto || '').trim(),
                            EstabFmt: `${l.CodUnidad || ''} ${l.Establecimiento || ''}`.trim(),
                            DesdeFmt: formatDateDDMMYYYY(l.Desde),
                            HastaFmt: formatDateDDMMYYYY(l.Hasta),
                            EstimadoFmt: formatCurrencyCLP(l.PagoEstimado),
                            PagadoFmt: formatCurrencyCLP(l.MontoPagadoDetalle || l.TotalPagadoTabla || 0)
                          })),
                          totalsRow: {
                            RutFmt: 'TOTALES',
                            EstimadoFmt: formatCurrencyCLP(totEst),
                            PagadoFmt: formatCurrencyCLP(totPag)
                          }
                        });
                      }}
                      className="px-4 py-1.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                    >
                      Exportar a PDF
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[420px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                      <tr>
                        <th className="p-2.5">RUT</th>
                        <th className="p-2.5">Funcionario</th>
                        <th className="p-2.5">N° Licencia</th>
                        <th
                          onClick={() => setOrdenDesdeFunc(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                          className="p-2.5 cursor-pointer select-none hover:bg-[#e2e8f0] text-[#016098]"
                        >
                          Desde {ordenDesdeFunc === 'desc' ? '▼' : '▲'}
                        </th>
                        <th className="p-2.5">Hasta</th>
                        <th className="p-2.5 text-center">Días</th>
                        <th className="p-2.5">Modalidad</th>
                        <th className="p-2.5 text-right">Pago Estimado</th>
                        <th className="p-2.5 text-right">Monto Pagado</th>
                        <th className="p-2.5 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {[...licenciasRango]
                        .sort((a, b) =>
                          ordenDesdeFunc === 'asc'
                            ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                            : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                        )
                        .map(l => (
                          <tr key={`${l.NumeroLicencia}-${l.Rut}`} className="hover:bg-[#f8fafc]">
                            <td className="p-2.5 font-bold text-[#016098]">
                              {l.Rut}-{l.DV}
                            </td>
                            <td className="p-2.5 font-semibold">{(l.NombreCompleto || '').trim()}</td>
                            <td className="p-2.5 font-semibold">{l.NumeroLicencia}</td>
                            <td className="p-2.5">{formatDateDDMMYYYY(l.Desde)}</td>
                            <td className="p-2.5">{formatDateDDMMYYYY(l.Hasta)}</td>
                            <td className="p-2.5 text-center">{l.NumDias}</td>
                            <td className="p-2.5">{l.PagoDirecto}</td>
                            <td className="p-2.5 text-right">${Number(l.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-700">
                              ${Number(l.MontoPagadoDetalle || l.TotalPagadoTabla || 0).toLocaleString('es-CL')}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => buscarPorFuncionario(l.Rut)}
                                className="px-2.5 py-1 bg-[#016098] text-white rounded text-[11px] font-bold"
                              >
                                Ver Ficha
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Coincidencias por Apellido */}
            {listaCoincidencias.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#016098]">
                    Funcionarios Encontrados ({listaCoincidencias.length})
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() =>
                        exportarGenericoExcel(
                          listaCoincidencias.map(f => ({
                            'RUT': `${f.Rut}-${f.DV}`,
                            'Nombre Completo': `${f.Nombre} ${f.Paterno} ${f.Materno}`.trim(),
                            'Cenco': f.CodUnidad,
                            'Establecimiento': f.Establecimiento,
                            'Planta': f.Planta
                          })),
                          `Funcionarios_Apellido_${paternoFunc || 'Consulta'}`
                        )
                      }
                      className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                    >
                      Exportar a Excel
                    </button>
                    <button
                      onClick={() =>
                        exportToCorporatePDF({
                          title: 'LISTADO DE FUNCIONARIOS COINCIDENTES',
                          subtitle: `Filtro Apellido Paterno: ${paternoFunc || 'Todos'}`,
                          columns: [
                            { header: 'RUT', key: 'RutFmt' },
                            { header: 'Nombre Completo', key: 'NombreFmt' },
                            { header: 'Cenco / Establecimiento', key: 'EstabFmt' },
                            { header: 'Planta', key: 'Planta' }
                          ],
                          rows: listaCoincidencias.map(f => ({
                            RutFmt: `${f.Rut}-${f.DV}`,
                            NombreFmt: `${f.Nombre} ${f.Paterno} ${f.Materno}`.trim(),
                            EstabFmt: `${f.CodUnidad || ''} — ${f.Establecimiento || ''}`,
                            Planta: f.Planta
                          }))
                        })
                      }
                      className="px-3 py-1 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                    >
                      Exportar a PDF
                    </button>
                  </div>
                </div>
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
                    <div className="flex flex-wrap justify-between items-center gap-2">
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
                      <div className="flex gap-2">
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
                        <button
                          onClick={() => {
                            const sorted = [...licenciasFunc].sort((a, b) =>
                              ordenDesdeFunc === 'asc'
                                ? String(a.Desde || '').localeCompare(String(b.Desde || ''))
                                : String(b.Desde || '').localeCompare(String(a.Desde || ''))
                            );
                            exportCertificadoLicenciasFuncionarioPDF(
                              {
                                rut: fichaFuncionario.Rut,
                                dv: fichaFuncionario.DV,
                                nombre: fichaFuncionario.Nombre,
                                paterno: fichaFuncionario.Paterno,
                                materno: fichaFuncionario.Materno,
                                establecimiento: fichaFuncionario.Establecimiento,
                                planta: fichaFuncionario.Planta,
                                vigencia: fichaFuncionario.Vigencia || 'S',
                                fechaInicio: fichaFuncionario.FechaInicio,
                                fechaTermino: fichaFuncionario.FechaTermino
                              },
                              sorted
                            );
                          }}
                          className="px-4 py-1.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                        >
                          Exportar a PDF
                        </button>
                      </div>
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
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <span className="text-xs font-bold text-rose-700">
                        CERTIFICADO DE LICENCIAS NO PAGADAS — Total Descuento Calculado: $
                        {noPagadasDeuda
                          .reduce((acc, x) => acc + Number(x.MontoAPagarDescuento || 0), 0)
                          .toLocaleString('es-CL')}
                      </span>
                      <div className="flex gap-2">
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
                          Exportar a Excel
                        </button>
                        <button
                          onClick={() => {
                            const totDesc = noPagadasDeuda.reduce((acc, x) => acc + Number(x.MontoAPagarDescuento || 0), 0);
                            const totEst = noPagadasDeuda.reduce((acc, x) => acc + Number(x.PagoEstimado || 0), 0);
                            const nombreFunc = `${fichaFuncionario.Nombre} ${fichaFuncionario.Paterno} ${fichaFuncionario.Materno}`.trim();
                            exportToCorporatePDF({
                              title: 'CERTIFICADO DE LICENCIAS NO PAGADAS / DEUDA FUNCIONARIO',
                              subtitle: `${nombreFunc} (RUT ${fichaFuncionario.Rut}-${fichaFuncionario.DV}) — ${fichaFuncionario.CodUnidad} ${
                                fichaFuncionario.Establecimiento || ''
                              }`,
                              meta: [
                                { label: 'Funcionario', value: nombreFunc },
                                { label: 'RUT', value: `${fichaFuncionario.Rut}-${fichaFuncionario.DV}` }
                              ],
                              kpis: [
                                { label: 'Licencias con Deuda', value: noPagadasDeuda.length, color: 'rose' },
                                { label: 'Total Descuento Calculado', value: formatCurrencyCLP(totDesc), color: 'rose' },
                                { label: 'Total Monto Estimado', value: formatCurrencyCLP(totEst), color: 'amber' }
                              ],
                              columns: [
                                { header: 'N° Licencia', key: 'NumeroLicencia' },
                                { header: 'Desde', key: 'DesdeFmt', align: 'center' },
                                { header: 'Hasta', key: 'HastaFmt', align: 'center' },
                                { header: 'Días Lic.', key: 'NumDias', align: 'center' },
                                { header: 'Días Aut.', key: 'DiasAutorizados', align: 'center' },
                                { header: 'Días Desc.', key: 'DiasDescuento', align: 'center' },
                                { header: 'Monto Descuento ($)', key: 'DescFmt', align: 'right' },
                                { header: 'Monto Estimado ($)', key: 'EstFmt', align: 'right' }
                              ],
                              rows: noPagadasDeuda.map(d => ({
                                ...d,
                                DesdeFmt: formatDateDDMMYYYY(d.Desde),
                                HastaFmt: formatDateDDMMYYYY(d.Hasta),
                                DescFmt: formatCurrencyCLP(d.MontoAPagarDescuento),
                                EstFmt: formatCurrencyCLP(d.PagoEstimado)
                              })),
                              totalsRow: {
                                NumeroLicencia: 'TOTAL',
                                DescFmt: formatCurrencyCLP(totDesc),
                                EstFmt: formatCurrencyCLP(totEst)
                              }
                            });
                          }}
                          className="px-4 py-1.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                        >
                          Exportar a PDF
                        </button>
                      </div>
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
                  <div className="space-y-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          exportarGenericoExcel(
                            rentasFunc.map(r => ({
                              'Año': r.Anio,
                              'Mes': r.Mes,
                              'Monto Imponible ($)': r.MontoImponible,
                              'Desc. Previsión ($)': r.DescPrevision,
                              'Desc. Salud ($)': r.DescSalud,
                              'Impuesto Único ($)': r.ImpuestoUnico,
                              'Monto Neto ($)': r.MontoNeto
                            })),
                            `Rentas_Funcionario_${fichaFuncionario.Rut}`
                          )
                        }
                        className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                      >
                        Exportar a Excel
                      </button>
                      <button
                        onClick={() => {
                          const nombreFunc = `${fichaFuncionario.Nombre} ${fichaFuncionario.Paterno} ${fichaFuncionario.Materno}`.trim();
                          exportToCorporatePDF({
                            title: 'HISTÓRICO DE RENTAS DEL FUNCIONARIO',
                            subtitle: `${nombreFunc} (RUT ${fichaFuncionario.Rut}-${fichaFuncionario.DV})`,
                            meta: [
                              { label: 'Funcionario', value: nombreFunc },
                              { label: 'RUT', value: `${fichaFuncionario.Rut}-${fichaFuncionario.DV}` }
                            ],
                            columns: [
                              { header: 'Año', key: 'Anio', align: 'center' },
                              { header: 'Mes', key: 'Mes', align: 'center' },
                              { header: 'Monto Imponible ($)', key: 'ImpFmt', align: 'right' },
                              { header: 'Desc. Previsión ($)', key: 'PrevFmt', align: 'right' },
                              { header: 'Desc. Salud ($)', key: 'SalFmt', align: 'right' },
                              { header: 'Impuesto Único ($)', key: 'UnicoFmt', align: 'right' },
                              { header: 'Monto Neto ($)', key: 'NetoFmt', align: 'right' }
                            ],
                            rows: rentasFunc.map(r => ({
                              ...r,
                              ImpFmt: formatCurrencyCLP(r.MontoImponible),
                              PrevFmt: formatCurrencyCLP(r.DescPrevision),
                              SalFmt: formatCurrencyCLP(r.DescSalud),
                              UnicoFmt: formatCurrencyCLP(r.ImpuestoUnico),
                              NetoFmt: formatCurrencyCLP(r.MontoNeto)
                            }))
                          });
                        }}
                        className="px-4 py-1.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                      >
                        Exportar a PDF
                      </button>
                    </div>
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
              <div className="flex flex-wrap gap-2">
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
                <button
                  onClick={() => {
                    const totEst = registrosDiarias.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0);
                    exportToCorporatePDF({
                      title: 'REPORTE DE RECEPCIÓN DIARIA DE LICENCIAS MÉDICAS',
                      subtitle: `Período de Recepción: ${formatDateDDMMYYYY(diariasDesde)} al ${formatDateDDMMYYYY(diariasHasta)}`,
                      meta: [
                        { label: 'Desde', value: formatDateDDMMYYYY(diariasDesde) },
                        { label: 'Hasta', value: formatDateDDMMYYYY(diariasHasta) }
                      ],
                      kpis: [
                        { label: 'Licencias Recepcionadas', value: registrosDiarias.length, color: 'blue' },
                        { label: 'Total Pago Estimado', value: formatCurrencyCLP(totEst), color: 'indigo' }
                      ],
                      columns: [
                        { header: 'Recepción', key: 'RecepFmt', align: 'center' },
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'NombreFmt' },
                        { header: 'Cenco / Planta', key: 'CencoFmt' },
                        { header: 'Desde / Hasta', key: 'PeriodoFmt', align: 'center' },
                        { header: 'Días', key: 'NumDias', align: 'center' },
                        { header: 'Salud / AFP', key: 'SaludFmt' },
                        { header: 'Modalidad', key: 'PagoDirecto' },
                        { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' }
                      ],
                      rows: registrosDiarias.map(r => ({
                        RecepFmt: formatDateDDMMYYYY(r.Recepcion),
                        NumeroLicencia: r.NumeroLicencia,
                        RutFmt: `${r.Rut}-${r.DV}`,
                        NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                        CencoFmt: `${r.CodUnidad} — ${r.Planta}`,
                        PeriodoFmt: `${formatDateDDMMYYYY(r.Desde)} al ${formatDateDDMMYYYY(r.Hasta)}`,
                        NumDias: r.NumDias,
                        SaludFmt: `${r.Salud || ''} / ${r.Prevision || ''}`,
                        PagoDirecto: r.PagoDirecto,
                        EstimadoFmt: formatCurrencyCLP(r.PagoEstimado)
                      })),
                      totalsRow: {
                        RecepFmt: 'TOTAL',
                        EstimadoFmt: formatCurrencyCLP(totEst)
                      }
                    });
                  }}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Exportar a PDF
                </button>
              </div>
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
              <div className="flex flex-wrap gap-2">
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
                <button
                  onClick={() => {
                    const totEst = registrosBrp.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0);
                    exportToCorporatePDF({
                      title: `INFORME DE LICENCIAS MÉDICAS BRP — MES ${brpMes} / ${brpAnio}`,
                      meta: [
                        { label: 'Mes / Año', value: `${brpMes}/${brpAnio}` }
                      ],
                      columns: [
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'NombreFmt' },
                        { header: 'Cenco', key: 'CodUnidad', align: 'center' },
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'Desde', key: 'DesdeFmt', align: 'center' },
                        { header: 'Hasta', key: 'HastaFmt', align: 'center' },
                        { header: 'Días', key: 'NumDias', align: 'center' },
                        { header: 'Salud', key: 'Salud' },
                        { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' }
                      ],
                      rows: registrosBrp.map(r => ({
                        ...r,
                        RutFmt: `${r.Rut}-${r.DV}`,
                        NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                        DesdeFmt: formatDateDDMMYYYY(r.Desde),
                        HastaFmt: formatDateDDMMYYYY(r.Hasta),
                        EstimadoFmt: formatCurrencyCLP(r.PagoEstimado)
                      })),
                      totalsRow: {
                        RutFmt: 'TOTAL',
                        EstimadoFmt: formatCurrencyCLP(totEst)
                      }
                    });
                  }}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Exportar a PDF
                </button>
              </div>
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
              <div className="flex flex-wrap gap-2">
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
                <button
                  onClick={() => {
                    const totEst = registrosPD.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0);
                    const totPag = registrosPD.reduce((acc, r) => acc + Number(r.TotalPagado || 0), 0);
                    exportToCorporatePDF({
                      title: `INFORME MENSUAL LICENCIAS PAGO DIRECTO — MES ${pdMes} / ${pdAnio}`,
                      meta: [{ label: 'Mes / Año', value: `${pdMes}/${pdAnio}` }],
                      kpis: [
                        { label: 'Licencias Pago Directo', value: registrosPD.length, color: 'blue' },
                        { label: 'Total Pago Estimado', value: formatCurrencyCLP(totEst), color: 'indigo' },
                        { label: 'Total Pagado', value: formatCurrencyCLP(totPag), color: 'emerald' }
                      ],
                      columns: [
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'NombreFmt' },
                        { header: 'Cenco / Planta', key: 'CencoFmt' },
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'Desde', key: 'DesdeFmt', align: 'center' },
                        { header: 'Hasta', key: 'HastaFmt', align: 'center' },
                        { header: 'Días Lic.', key: 'NumDias', align: 'center' },
                        { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' },
                        { header: 'Total Pagado', key: 'PagadoFmt', align: 'right' }
                      ],
                      rows: registrosPD.map(r => ({
                        RutFmt: `${r.Rut}-${r.DV}`,
                        NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                        CencoFmt: `${r.CodUnidad} — ${r.Planta}`,
                        NumeroLicencia: r.NumeroLicencia,
                        DesdeFmt: formatDateDDMMYYYY(r.Desde),
                        HastaFmt: formatDateDDMMYYYY(r.Hasta),
                        NumDias: r.NumDias,
                        EstimadoFmt: formatCurrencyCLP(r.PagoEstimado),
                        PagadoFmt: formatCurrencyCLP(r.TotalPagado)
                      })),
                      totalsRow: {
                        RutFmt: 'TOTAL',
                        EstimadoFmt: formatCurrencyCLP(totEst),
                        PagadoFmt: formatCurrencyCLP(totPag)
                      }
                    });
                  }}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Exportar a PDF
                </button>
              </div>
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
              <div className="flex flex-wrap gap-2">
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
                        'N° Transferencia / Doc.': r.NumeroDocumento,
                        'Concepto': r.Concepto
                      })),
                      `Informe_Anual_${genTipo}_${genAnio}`
                    )
                  }
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                >
                  Exportar a Excel ({registrosGeneral.length})
                </button>
                <button
                  onClick={() => {
                    const totEst = registrosGeneral.reduce((acc, r) => acc + Number(r.PagoEstimado || 0), 0);
                    const totPag = registrosGeneral.reduce((acc, r) => acc + Number(r.MontoPagado || 0), 0);
                    exportToCorporatePDF({
                      title: `INFORME ANUAL DE LICENCIAS MÉDICAS (${genTipo.toUpperCase()}) — AÑO ${genAnio}`,
                      meta: [
                        { label: 'Año', value: genAnio },
                        { label: 'Filtro', value: genTipo }
                      ],
                      kpis: [
                        { label: 'Total Registros', value: registrosGeneral.length.toLocaleString('es-CL'), color: 'blue' },
                        { label: 'Total Pago Estimado', value: formatCurrencyCLP(totEst), color: 'indigo' },
                        { label: 'Total Monto Pagado', value: formatCurrencyCLP(totPag), color: 'emerald' }
                      ],
                      columns: [
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'NombreFmt' },
                        { header: 'Cenco', key: 'CodUnidad', align: 'center' },
                        { header: 'Desde / Hasta', key: 'PeriodoFmt', align: 'center' },
                        { header: 'Días Lic/Pag', key: 'DiasFmt', align: 'center' },
                        { header: 'Salud', key: 'Salud' },
                        { header: 'Pago Estimado', key: 'EstimadoFmt', align: 'right' },
                        { header: 'Monto Pagado', key: 'PagadoFmt', align: 'right' },
                        { header: 'N° Transf.', key: 'DocFmt' }
                      ],
                      rows: registrosGeneral.slice(0, 1000).map(r => ({
                        NumeroLicencia: r.NumeroLicencia,
                        RutFmt: `${r.Rut}-${r.DV}`,
                        NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                        CodUnidad: r.CodUnidad,
                        PeriodoFmt: `${formatDateDDMMYYYY(r.Desde)} al ${formatDateDDMMYYYY(r.Hasta)}`,
                        DiasFmt: `${r.NumDias} / ${r.DiasPagados}`,
                        Salud: r.Salud,
                        EstimadoFmt: formatCurrencyCLP(r.PagoEstimado),
                        PagadoFmt: formatCurrencyCLP(r.MontoPagado),
                        DocFmt: r.NumeroDocumento || '-'
                      })),
                      totalsRow: {
                        NumeroLicencia: 'TOTAL',
                        EstimadoFmt: formatCurrencyCLP(totEst),
                        PagadoFmt: formatCurrencyCLP(totPag)
                      }
                    });
                  }}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Exportar a PDF
                </button>
              </div>
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
              <div className="flex flex-wrap gap-2">
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
                              'N° Transferencia': r.NumeroDocumento,
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
                <button
                  onClick={() => {
                    exportToCorporatePDF({
                      title: `REPORTE CAPTURA SOFTLAND (${softTipo.toUpperCase()}) — SECTOR ${softSector.toUpperCase()}`,
                      subtitle: `Período: ${formatDateDDMMYYYY(softDesde)} al ${formatDateDDMMYYYY(softHasta)}`,
                      columns: [
                        { header: 'CCosto', key: 'CCosto', align: 'center' },
                        { header: 'Establecimiento', key: 'Establecimiento' },
                        { header: 'RUT', key: 'RutFmt' },
                        { header: 'Funcionario', key: 'NombreFmt' },
                        { header: 'N° Licencia', key: 'NumeroLicencia' },
                        { header: 'Días', key: 'NumDias', align: 'center' },
                        { header: 'Desde / Hasta', key: 'PeriodoFmt', align: 'center' },
                        { header: softTipo === 'pagos' ? 'Monto Pagado' : 'Pago Estimado', key: 'MontoFmt', align: 'right' }
                      ],
                      rows: registrosSoftland.map(r => ({
                        ...r,
                        RutFmt: `${r.Rut}-${r.DV}`,
                        NombreFmt: `${r.Nombre} ${r.Paterno} ${r.Materno}`.trim(),
                        PeriodoFmt: `${formatDateDDMMYYYY(r.Desde)} al ${formatDateDDMMYYYY(r.Hasta)}`,
                        MontoFmt: formatCurrencyCLP(softTipo === 'pagos' ? r.TotalPagado : r.PagoEstimado)
                      }))
                    });
                  }}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  Exportar a PDF
                </button>
              </div>
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
