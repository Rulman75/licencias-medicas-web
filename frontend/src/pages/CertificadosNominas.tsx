import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface CertificadosNominasProps {
  tabInicial?: 'certificado' | 'nomina-normal' | 'nomina-pago-directo';
}

export default function CertificadosNominas({ tabInicial = 'certificado' }: CertificadosNominasProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [tabActiva, setTabActiva] = useState<'certificado' | 'nomina-normal' | 'nomina-pago-directo'>(tabInicial);

  useEffect(() => {
    setTabActiva(tabInicial);
  }, [tabInicial]);

  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);

  // Lista de instituciones de Salud
  const [listaSalud, setListaSalud] = useState<string[]>([]);

  // --- ESTADO TAB 1: CERTIFICADO DE LICENCIA ---
  const [numLicenciaCert, setNumLicenciaCert] = useState('');
  const [datosCertificado, setDatosCertificado] = useState<{
    licencia: any;
    rentas: any[];
    periodosConsultados: { mes: number; anio: number }[];
  } | null>(null);

  // --- ESTADO TAB 2: NÓMINA CORRESPONDENCIA NORMAL ---
  const [fechaNominaNormal, setFechaNominaNormal] = useState(todayStr);
  const [saludNominaNormal, setSaludNominaNormal] = useState('Todas');
  const [registrosNominaNormal, setRegistrosNominaNormal] = useState<any[]>([]);

  // --- ESTADO TAB 3: NÓMINA CORRESPONDENCIA PAGO DIRECTO ---
  const [desdeNominaPD, setDesdeNominaPD] = useState(todayStr);
  const [hastaNominaPD, setHastaNominaPD] = useState(todayStr);
  const [registrosNominaPD, setRegistrosNominaPD] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/dominios')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'ok' && d.data?.salud) {
          setListaSalud(d.data.salud.map((s: any) => String(s.Descripcion || '').trim()).filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  const formatDateDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return '';
    const clean = String(isoDate).split('T')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  const nombreMes = (m: number) => {
    const meses = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre'
    ];
    return meses[m] || String(m);
  };

  // Consultar Certificado de Licencia
  const buscarCertificado = async () => {
    if (!numLicenciaCert.trim()) {
      setMensaje({ tipo: 'error', texto: 'Ingrese un Número de Licencia para generar el certificado' });
      return;
    }
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/informes/certificado/${encodeURIComponent(numLicenciaCert.trim())}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setDatosCertificado(data);
      } else {
        setDatosCertificado(null);
        setMensaje({ tipo: 'error', texto: data.error || 'No se encontró la licencia indicada' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red consultando certificado' });
    } finally {
      setCargando(false);
    }
  };

  // Consultar Nómina Correspondencia Normal
  const buscarNominaNormal = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams({
        tipo: 'normal',
        fecha: fechaNominaNormal,
        salud: saludNominaNormal
      });
      const res = await fetch(`/api/informes/nomina-correspondencia?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosNominaNormal(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron licencias remitidas en la fecha e institución indicadas' });
        }
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error consultando nómina' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión consultando nómina' });
    } finally {
      setCargando(false);
    }
  };

  // Consultar Nómina Correspondencia Pago Directo
  const buscarNominaPagoDirecto = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const params = new URLSearchParams({
        tipo: 'pago-directo',
        desde: desdeNominaPD,
        hasta: hastaNominaPD
      });
      const res = await fetch(`/api/informes/nomina-correspondencia?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRegistrosNominaPD(data.registros || []);
        if ((data.registros || []).length === 0) {
          setMensaje({ tipo: 'info', texto: 'No se encontraron licencias de Pago Directo en el rango de remisión seleccionado' });
        }
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error consultando nómina Pago Directo' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión consultando nómina Pago Directo' });
    } finally {
      setCargando(false);
    }
  };

  const exportarNominaExcel = (registros: any[], tituloArchivo: string) => {
    if (registros.length === 0) return;
    const rows = registros.map(r => ({
      'Fecha Entrega (Remisión)': formatDateDDMMYYYY(r.Remision),
      'Institución': r.InstitucionSalud,
      'N° Licencia': r.NumeroLicencia,
      'Desde': formatDateDDMMYYYY(r.Desde),
      'Hasta': formatDateDDMMYYYY(r.Hasta),
      'N° Días': r.NumDias,
      'RUT': `${r.RutFuncionario}-${r.DV}`,
      'Nombre': r.Nombre,
      'Apellido Paterno': r.Paterno,
      'Apellido Materno': r.Materno,
      'Cenco': r.CodUnidad,
      'Cargo / Planta': r.Planta,
      'Observación': r.Observacion
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nomina_Correspondencia');
    XLSX.writeFile(wb, `${tituloArchivo}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Estilos de Impresión para ocultar controles y dejar solo el documento formal */}
      <style>{`
        @media print {
          aside, .no-print {
            display: none !important;
          }
          body, html, #root {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print-container {
            box-shadow: none !important;
            border: 1px solid #000 !important;
            padding: 16px !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* Encabezado y Pestañas (Oculto al imprimir) */}
      <div className="no-print bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">Certificados Oficiales y Nóminas de Correspondencia</h1>
          <p className="text-xs text-[#64748b] mt-1">
            Documentos formales listos para Imprimir / Guardar en PDF y Exportar a Excel (`dd-mm-yyyy`)
          </p>
        </div>

        <div className="flex flex-wrap gap-2 bg-[#f1f5f9] p-1.5 rounded-xl">
          <button
            onClick={() => setTabActiva('certificado')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'certificado' ? 'bg-[#016098] text-white shadow-sm' : 'text-[#475569] hover:text-[#016098]'
            }`}
          >
            Certificado Base Cálculo Licencia
          </button>
          <button
            onClick={() => setTabActiva('nomina-normal')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'nomina-normal'
                ? 'bg-[#016098] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#016098]'
            }`}
          >
            Nómina Correspondencia
          </button>
          <button
            onClick={() => setTabActiva('nomina-pago-directo')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tabActiva === 'nomina-pago-directo'
                ? 'bg-[#016098] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#016098]'
            }`}
          >
            Nómina Corresp. Pago Directo
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          className={`no-print p-4 rounded-xl border text-sm font-medium flex justify-between items-center ${
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
          TAB 1: CERTIFICADO DE DETERMINACIÓN BASE DE CÁLCULO (frm_certificado.vb)
      ===================================================================== */}
      {tabActiva === 'certificado' && (
        <div className="space-y-6">
          <div className="no-print bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="w-full sm:w-80">
              <label className="block text-xs font-semibold text-[#475569] mb-1">N° Licencia Médica</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={numLicenciaCert}
                  onChange={e => setNumLicenciaCert(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && buscarCertificado()}
                  placeholder="Ej: 3131037553"
                  className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg font-bold text-[#016098]"
                />
                <button
                  onClick={buscarCertificado}
                  disabled={cargando}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] shrink-0"
                >
                  Generar Certificado
                </button>
              </div>
            </div>

            {datosCertificado && (
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] flex items-center gap-2 shadow-sm"
                >
                  🖨️ Imprimir / Guardar PDF
                </button>
              </div>
            )}
          </div>

          {/* Documento Formal Imprimible */}
          {datosCertificado && (
            <div className="print-container bg-white rounded-xl shadow-sm border border-[#cbd5e1] p-8 max-w-4xl mx-auto text-[#1e293b] space-y-6">
              {/* Membrete Empleador */}
              <div className="flex justify-between items-start border-b-2 border-[#016098] pb-4">
                <div>
                  <p className="text-xs font-bold text-[#016098]">
                    RAZÓN SOCIAL DEL EMPLEADOR: CORPORACIÓN MUNICIPAL DE DESARROLLO SOCIAL
                  </p>
                  <p className="text-xs font-semibold text-[#475569]">
                    R.U.T N° 71.102.600-2 — DOMICILIO: AV. ARGENTINA 1595 2° PISO, ANTOFAGASTA
                  </p>
                </div>
                <div className="text-right text-xs text-[#64748b]">
                  <p>Fecha Emisión: {formatDateDDMMYYYY(todayStr)}</p>
                  <p className="font-bold text-[#016098]">N° Licencia: {datosCertificado.licencia.NumeroLicencia}</p>
                </div>
              </div>

              {/* Título Oficial */}
              <div className="text-center space-y-1">
                <h2 className="text-base font-extrabold uppercase tracking-wide text-[#1e293b]">
                  DETERMINACIÓN DE LA BASE DE DATOS DE CÁLCULO
                </h2>
                <h3 className="text-sm font-bold uppercase text-[#016098]">
                  SUBSIDIOS INCAPACIDAD LABORAL POR LICENCIAS MÉDICAS
                </h3>
              </div>

              {/* Datos del Funcionario y Licencia */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-[#cbd5e1] rounded-lg p-4 text-xs bg-[#f8fafc]">
                <div className="col-span-2">
                  <span className="text-[#64748b] block">NOMBRE FUNCIONARIO(A)</span>
                  <span className="font-bold text-sm">
                    {`${datosCertificado.licencia.Nombre} ${datosCertificado.licencia.Paterno} ${datosCertificado.licencia.Materno}`.trim()}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748b] block">R.U.T.</span>
                  <span className="font-bold text-sm">
                    {datosCertificado.licencia.Rut}-{datosCertificado.licencia.DV}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748b] block">N° LICENCIA MÉDICA</span>
                  <span className="font-bold text-sm text-[#016098]">{datosCertificado.licencia.NumeroLicencia}</span>
                </div>

                <div>
                  <span className="text-[#64748b] block">DESDE</span>
                  <span className="font-semibold">{formatDateDDMMYYYY(datosCertificado.licencia.Desde)}</span>
                </div>
                <div>
                  <span className="text-[#64748b] block">HASTA</span>
                  <span className="font-semibold">{formatDateDDMMYYYY(datosCertificado.licencia.Hasta)}</span>
                </div>
                <div>
                  <span className="text-[#64748b] block">DÍAS LIC. / AUTORIZADOS</span>
                  <span className="font-semibold">
                    {datosCertificado.licencia.NumDias} / {datosCertificado.licencia.DiasAutorizados}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748b] block">AFP / SALUD</span>
                  <span className="font-semibold">
                    {datosCertificado.rentas[0]?.AFP || 'N/I'} /{' '}
                    {datosCertificado.rentas[0]?.SaludMes || datosCertificado.licencia.SaludActual || 'N/I'}
                  </span>
                </div>
              </div>

              {/* Tabla de Detalle de Remuneraciones (3 Meses) */}
              <div>
                <h4 className="text-xs font-bold uppercase mb-2 text-[#016098]">
                  Detalle de Remuneraciones (3 Meses Anteriores al Inicio del Reposo)
                </h4>
                <table className="w-full text-xs border-collapse border border-[#cbd5e1]">
                  <thead className="bg-[#f1f5f9]">
                    <tr>
                      <th className="border border-[#cbd5e1] p-2 text-left">Mes / Año</th>
                      <th className="border border-[#cbd5e1] p-2 text-center">Días Trab.</th>
                      <th className="border border-[#cbd5e1] p-2 text-right">Renta Imponible ($)</th>
                      <th className="border border-[#cbd5e1] p-2 text-right">Cotiz. Previsional AFP ($)</th>
                      <th className="border border-[#cbd5e1] p-2 text-right">Cotiz. Salud ($)</th>
                      <th className="border border-[#cbd5e1] p-2 text-right">Impuesto Único ($)</th>
                      <th className="border border-[#cbd5e1] p-2 text-right">Remuneración Neta ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datosCertificado.rentas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-[#64748b]">
                          No se registran rentas imponibles para los 3 meses previos a la licencia
                        </td>
                      </tr>
                    ) : (
                      datosCertificado.rentas.map((r, i) => (
                        <tr key={i}>
                          <td className="border border-[#cbd5e1] p-2 font-semibold">
                            {nombreMes(r.Mes)} {r.Anio}
                          </td>
                          <td className="border border-[#cbd5e1] p-2 text-center">{r.DiasTrab}</td>
                          <td className="border border-[#cbd5e1] p-2 text-right">
                            ${Number(r.MontoImponible || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="border border-[#cbd5e1] p-2 text-right">
                            ${Number(r.DescPrevision || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="border border-[#cbd5e1] p-2 text-right">
                            ${Number(r.DescSalud || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="border border-[#cbd5e1] p-2 text-right">
                            ${Number(r.ImpuestoUnico || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="border border-[#cbd5e1] p-2 text-right font-bold">
                            ${Number(r.MontoNeto || 0).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Resumen Determinación Base de Cálculo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-[#cbd5e1] rounded-lg p-4 bg-[#f8fafc] text-xs">
                <div>
                  <span className="text-[#64748b] block">PROMEDIO REMUNERACIÓN NETA DIARIA</span>
                  <span className="text-base font-bold text-[#1e293b]">
                    ${Number(datosCertificado.licencia.MontoNetoPromedio || 0).toLocaleString('es-CL')}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748b] block">SUBSIDIO DIARIO CALCULADO</span>
                  <span className="text-base font-bold text-[#1e293b]">
                    ${Number(datosCertificado.licencia.SubsidioDiario || 0).toLocaleString('es-CL')}
                  </span>
                </div>
                <div>
                  <span className="text-[#016098] font-semibold block">PAGO ESTIMADO TOTAL SUBSIDIO</span>
                  <span className="text-base font-extrabold text-[#016098]">
                    ${Number(datosCertificado.licencia.PagoEstimado || 0).toLocaleString('es-CL')}
                  </span>
                </div>
              </div>

              {datosCertificado.licencia.Observacion && (
                <div className="text-xs border border-[#cbd5e1] rounded p-3">
                  <span className="font-bold">Observación: </span>
                  {datosCertificado.licencia.Observacion}
                </div>
              )}

              {/* Pie de Firma */}
              <div className="pt-12 flex justify-around text-center text-xs">
                <div className="border-t border-[#1e293b] pt-2 w-64">
                  <p className="font-bold">UNIDAD DE LICENCIAS MÉDICAS</p>
                  <p className="text-[#64748b]">CMDS ANTOFAGASTA</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: NÓMINA DE CORRESPONDENCIA NORMAL (Form5.vb / NomicaCorre.rdlc)
      ===================================================================== */}
      {tabActiva === 'nomina-normal' && (
        <div className="space-y-6">
          <div className="no-print bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Entrega / Remisión</label>
                <input
                  type="date"
                  value={fechaNominaNormal}
                  onChange={e => setFechaNominaNormal(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Institución de Salud</label>
                <select
                  value={saludNominaNormal}
                  onChange={e => setSaludNominaNormal(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white min-w-[180px]"
                >
                  <option value="Todas">(Todas las Instituciones)</option>
                  {listaSalud.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={buscarNominaNormal}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Generar Nómina
              </button>
            </div>

            {registrosNominaNormal.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    exportarNominaExcel(registrosNominaNormal, `Nomina_Correspondencia_${fechaNominaNormal}`)
                  }
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                >
                  Exportar Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  🖨️ Imprimir / PDF
                </button>
              </div>
            )}
          </div>

          {registrosNominaNormal.length > 0 && (
            <div className="print-container bg-white rounded-xl shadow-sm border border-[#cbd5e1] p-8 space-y-6">
              <div className="flex justify-between items-center border-b-2 border-[#016098] pb-4">
                <div>
                  <h2 className="text-base font-extrabold text-[#016098] uppercase">
                    NÓMINA DE FUNCIONARIOS CON LICENCIAS MÉDICAS
                  </h2>
                  <p className="text-xs text-[#475569] font-semibold">
                    CORPORACIÓN MUNICIPAL DE DESARROLLO SOCIAL DE ANTOFAGASTA
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p>
                    <span className="font-bold">Fecha Entrega:</span> {formatDateDDMMYYYY(fechaNominaNormal)}
                  </p>
                  <p>
                    <span className="font-bold">Institución:</span> {saludNominaNormal}
                  </p>
                  <p>
                    <span className="font-bold">Total Licencias:</span> {registrosNominaNormal.length}
                  </p>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-[#cbd5e1]">
                <thead className="bg-[#f1f5f9]">
                  <tr>
                    <th className="border border-[#cbd5e1] p-2">Fecha Entrega</th>
                    <th className="border border-[#cbd5e1] p-2">Institución</th>
                    <th className="border border-[#cbd5e1] p-2">N° Lic.</th>
                    <th className="border border-[#cbd5e1] p-2">Desde</th>
                    <th className="border border-[#cbd5e1] p-2 text-center">N° Días</th>
                    <th className="border border-[#cbd5e1] p-2">RUT</th>
                    <th className="border border-[#cbd5e1] p-2">Nombre</th>
                    <th className="border border-[#cbd5e1] p-2">Paterno</th>
                    <th className="border border-[#cbd5e1] p-2">Materno</th>
                    <th className="border border-[#cbd5e1] p-2">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosNominaNormal.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-[#cbd5e1] p-1.5">{formatDateDDMMYYYY(r.Remision)}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.InstitucionSalud}</td>
                      <td className="border border-[#cbd5e1] p-1.5 font-bold">{r.NumeroLicencia}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{formatDateDDMMYYYY(r.Desde)}</td>
                      <td className="border border-[#cbd5e1] p-1.5 text-center">{r.NumDias}</td>
                      <td className="border border-[#cbd5e1] p-1.5 whitespace-nowrap">
                        {r.RutFuncionario}-{r.DV}
                      </td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Nombre}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Paterno}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Materno}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Observacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Bloques de Firma de Recepción Conforme (igual a NomicaCorre.rdlc) */}
              <div className="pt-14 grid grid-cols-2 gap-12 text-xs">
                <div className="border-t border-[#1e293b] pt-2 text-center">
                  <p className="font-bold">Encargada de Licencias Médicas CMDS</p>
                </div>
                <div className="border border-[#1e293b] p-3 rounded space-y-3">
                  <p className="font-bold text-center">RECIBÍ CONFORME</p>
                  <p>NOMBRE: ________________________________________________</p>
                  <p>RUT: _________________________ FIRMA: __________________</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: NÓMINA DE CORRESPONDENCIA PAGO DIRECTO (Imprimr_NomCorrePDirecto.vb)
      ===================================================================== */}
      {tabActiva === 'nomina-pago-directo' && (
        <div className="space-y-6">
          <div className="no-print bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Remisión Desde</label>
                <input
                  type="date"
                  value={desdeNominaPD}
                  onChange={e => setDesdeNominaPD(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Remisión Hasta</label>
                <input
                  type="date"
                  value={hastaNominaPD}
                  onChange={e => setHastaNominaPD(e.target.value)}
                  className="px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
              </div>

              <button
                onClick={buscarNominaPagoDirecto}
                disabled={cargando}
                className="px-5 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
              >
                Generar Nómina Pago Directo
              </button>
            </div>

            {registrosNominaPD.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    exportarNominaExcel(registrosNominaPD, `Nomina_PagoDirecto_${desdeNominaPD}_${hastaNominaPD}`)
                  }
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                >
                  Exportar Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
                >
                  🖨️ Imprimir / PDF
                </button>
              </div>
            )}
          </div>

          {registrosNominaPD.length > 0 && (
            <div className="print-container bg-white rounded-xl shadow-sm border border-[#cbd5e1] p-8 space-y-6">
              <div className="flex justify-between items-center border-b-2 border-[#016098] pb-4">
                <div>
                  <h2 className="text-base font-extrabold text-[#016098] uppercase">
                    NÓMINA DE FUNCIONARIOS CON LICENCIAS MÉDICAS PAGO DIRECTO
                  </h2>
                  <p className="text-xs text-[#475569] font-semibold">
                    CORPORACIÓN MUNICIPAL DE DESARROLLO SOCIAL DE ANTOFAGASTA
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p>
                    <span className="font-bold">Período Remisión:</span> {formatDateDDMMYYYY(desdeNominaPD)} al{' '}
                    {formatDateDDMMYYYY(hastaNominaPD)}
                  </p>
                  <p>
                    <span className="font-bold">Total Licencias:</span> {registrosNominaPD.length}
                  </p>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-[#cbd5e1]">
                <thead className="bg-[#f1f5f9]">
                  <tr>
                    <th className="border border-[#cbd5e1] p-2">Fecha Entrega</th>
                    <th className="border border-[#cbd5e1] p-2">N° Licencia</th>
                    <th className="border border-[#cbd5e1] p-2">Desde</th>
                    <th className="border border-[#cbd5e1] p-2 text-center">N° Días</th>
                    <th className="border border-[#cbd5e1] p-2">RUT</th>
                    <th className="border border-[#cbd5e1] p-2">DV</th>
                    <th className="border border-[#cbd5e1] p-2">Nombre</th>
                    <th className="border border-[#cbd5e1] p-2">Paterno</th>
                    <th className="border border-[#cbd5e1] p-2">Materno</th>
                    <th className="border border-[#cbd5e1] p-2">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosNominaPD.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-[#cbd5e1] p-1.5">{formatDateDDMMYYYY(r.Remision)}</td>
                      <td className="border border-[#cbd5e1] p-1.5 font-bold">{r.NumeroLicencia}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{formatDateDDMMYYYY(r.Desde)}</td>
                      <td className="border border-[#cbd5e1] p-1.5 text-center">{r.NumDias}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.RutFuncionario}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.DV}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Nombre}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Paterno}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Materno}</td>
                      <td className="border border-[#cbd5e1] p-1.5">{r.Observacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-14 grid grid-cols-2 gap-12 text-xs">
                <div className="border-t border-[#1e293b] pt-2 text-center">
                  <p className="font-bold">ANGELICA MORALES MORALES</p>
                  <p className="text-[#475569]">Encargada de Licencias Médicas CMDS</p>
                </div>
                <div className="border border-[#1e293b] p-3 rounded space-y-3">
                  <p className="font-bold text-center">RECIBÍ CONFORME</p>
                  <p>NOMBRE: ________________________________________________</p>
                  <p>RUT: _________________________ FIRMA: __________________</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
