import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export default function MantencionPagos() {
  const todayStr = new Date().toISOString().split('T')[0];

  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  // Lista de Bancos
  const [bancos, setBancos] = useState<string[]>([]);

  // Panel 1: Estado de Cheque / Documento (DETALLE_CHEQUES)
  const [bancoCheque, setBancoCheque] = useState('');
  const [numCheque, setNumCheque] = useState('');
  const [montoCheque, setMontoCheque] = useState<string>('0');
  const [saldoCheque, setSaldoCheque] = useState<number>(0);
  const [cantDocsCheque, setCantDocsCheque] = useState<number>(0);
  const [fechaCheque, setFechaCheque] = useState(todayStr);
  const [tipoCheque, setTipoCheque] = useState('Cheque'); // Cheque | V. Vista
  const [areaCheque, setAreaCheque] = useState('Educacion'); // Educacion | Salud
  const [estadoCheque, setEstadoCheque] = useState('Abierto'); // Abierto | Cerrado
  const [chequeEncontrado, setChequeEncontrado] = useState(false);
  const [movimientosCheque, setMovimientosCheque] = useState<any[]>([]);
  const [mostrarMovsCheque, setMostrarMovsCheque] = useState(false);

  // Panel 2: Búsqueda de Licencia y Funcionario
  const [numLicenciaBusqueda, setNumLicenciaBusqueda] = useState('');
  const [rutBusqueda, setRutBusqueda] = useState('');
  const [funcionario, setFuncionario] = useState<any | null>(null);
  const [obsFuncionario, setObsFuncionario] = useState('');
  const [licenciasFuncionario, setLicenciasFuncionario] = useState<any[]>([]);

  // Licencia activa seleccionada para pago
  const [licenciaActiva, setLicenciaActiva] = useState<any | null>(null);
  const [resumenPago, setResumenPago] = useState({
    diasSubsidio: 0,
    diasDescuento: 0,
    diasAporte: 0,
    diasSinConcepto: 0,
    diasCobrar: 0,
    totalPagado: 0
  });
  const [detallePagosLicencia, setDetallePagosLicencia] = useState<any[]>([]);

  // Edición rápida de estado/apelación de la licencia desde Pagos (Button4 en Frm_IngresoPago.vb)
  const [obserApelacionLic, setObserApelacionLic] = useState('');
  const [observacionCajaLALic, setObservacionCajaLALic] = useState('');
  const [rechazoLic, setRechazoLic] = useState(false);
  const [retenidaLic, setRetenidaLic] = useState(false);
  const [autorizadaLic, setAutorizadaLic] = useState(false);
  const [pendienteLic, setPendienteLic] = useState(false);
  const [diasAutorizadosLic, setDiasAutorizadosLic] = useState<string>('0');

  // Panel 3: Formulario de Ingreso de Pago Individual
  const [numDocPago, setNumDocPago] = useState('');
  const [bancoPago, setBancoPago] = useState('');
  const [fechaDocPago, setFechaDocPago] = useState(todayStr);
  const [fechaRecepcionPago, setFechaRecepcionPago] = useState(todayStr);
  const [conceptoPago, setConceptoPago] = useState('Subsidio');
  const [diasPagados, setDiasPagados] = useState<string>('');
  const [desdePago, setDesdePago] = useState(todayStr);
  const [hastaPago, setHastaPago] = useState(todayStr);
  const [montoPago, setMontoPago] = useState<string>('');
  const [observacionPago, setObservacionPago] = useState('');

  // Movimiento seleccionado en la tabla para editar concepto o eliminar
  const [pagoSeleccionado, setPagoSeleccionado] = useState<any | null>(null);

  useEffect(() => {
    cargarBancos();
  }, []);

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'info', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => {
      setMensaje(prev => (prev?.texto === texto ? null : prev));
    }, 6000);
  };

  const formatDateDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return '';
    const clean = isoDate.split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const calcularFechaHasta = (fechaDesde: string, diasStr: string) => {
    const d = parseInt(diasStr, 10);
    if (!fechaDesde || isNaN(d) || d <= 0) return fechaDesde;
    const dt = new Date(`${fechaDesde}T12:00:00`);
    if (isNaN(dt.getTime())) return fechaDesde;
    dt.setDate(dt.getDate() + d - 1);
    return dt.toISOString().split('T')[0];
  };

  const cargarBancos = async () => {
    try {
      const res = await fetch('/api/mantencion/bancos');
      const data = await res.json();
      if (res.ok && data.bancos) {
        setBancos(data.bancos);
        if (data.bancos.length > 0) {
          setBancoCheque(data.bancos[0]);
          setBancoPago(data.bancos[0]);
        }
      }
    } catch (e) {
      console.error('Error cargando bancos:', e);
    }
  };

  // Consultar Cheque en DETALLE_CHEQUES
  const buscarCheque = async (bancoParam?: string, numParam?: string) => {
    const b = (bancoParam !== undefined ? bancoParam : bancoCheque).trim();
    const n = (numParam !== undefined ? numParam : numCheque).trim();
    if (!b || !n) {
      mostrarAlerta('error', 'Seleccione un Banco e ingrese el N° de Cheque/Documento');
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/cheque?banco=${encodeURIComponent(b)}&num=${encodeURIComponent(n)}`);
      const data = await res.json();
      if (res.ok) {
        setSaldoCheque(data.sumaOcupada || 0);
        setCantDocsCheque(data.cantidad || 0);
        setMovimientosCheque(data.movimientos || []);
        // Sincronizar con el formulario de pago abajo
        setBancoPago(b);
        setNumDocPago(n);

        if (data.encontrado && data.cheque) {
          setChequeEncontrado(true);
          setMontoCheque(String(data.cheque.Monto || 0));
          setFechaCheque(data.cheque.Fecha || todayStr);
          setFechaDocPago(data.cheque.Fecha || todayStr);
          setTipoCheque(data.cheque.Tipo || 'Cheque');
          setAreaCheque(data.cheque.Area || 'Educacion');
          setEstadoCheque(data.cheque.Estado || 'Abierto');
          mostrarAlerta('info', `Cheque #${n} (${b}) cargado — Estado: ${data.cheque.Estado}`);
        } else {
          setChequeEncontrado(false);
          mostrarAlerta('info', `Documento #${n} no registrado aún en DETALLE_CHEQUES. Puede registrarlo ahora.`);
        }
      }
    } catch {
      mostrarAlerta('error', 'Error consultando cheque');
    } finally {
      setCargando(false);
    }
  };

  // Guardar o Modificar Cheque
  const guardarCheque = async () => {
    if (!bancoCheque.trim() || !numCheque.trim()) {
      mostrarAlerta('error', 'Banco y N° de Cheque son obligatorios');
      return;
    }
    setCargando(true);
    try {
      const res = await fetch('/api/mantencion/cheque', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banco: bancoCheque.trim(),
          num: numCheque.trim(),
          monto: parseInt(montoCheque || '0', 10),
          saldo: saldoCheque,
          fecha: fechaCheque,
          tipo: tipoCheque,
          area: areaCheque,
          estado: estadoCheque
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message);
        setChequeEncontrado(true);
        setBancoPago(bancoCheque.trim());
        setNumDocPago(numCheque.trim());
        setFechaDocPago(fechaCheque);
      } else {
        mostrarAlerta('error', data.error || 'Error guardando cheque');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión guardando cheque');
    } finally {
      setCargando(false);
    }
  };

  const limpiarCheque = () => {
    setNumCheque('');
    setMontoCheque('0');
    setSaldoCheque(0);
    setCantDocsCheque(0);
    setFechaCheque(todayStr);
    setTipoCheque('Cheque');
    setAreaCheque('Educacion');
    setEstadoCheque('Abierto');
    setChequeEncontrado(false);
    setMovimientosCheque([]);
    setMostrarMovsCheque(false);
  };

  // Buscar Funcionario por RUT
  const buscarFuncionarioPorRut = async (rutParam?: string) => {
    const r = (rutParam !== undefined ? rutParam : rutBusqueda).trim();
    if (!r) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/funcionario/${encodeURIComponent(r)}`);
      const data = await res.json();
      if (res.ok && data.funcionario) {
        setFuncionario(data.funcionario);
        setRutBusqueda(data.funcionario.Rut);
        setObsFuncionario(data.funcionario.ObservacionFuncionario || '');
        setLicenciasFuncionario(data.licencias || []);
      } else {
        mostrarAlerta('error', 'Funcionario no encontrado');
      }
    } catch {
      mostrarAlerta('error', 'Error consultando funcionario');
    } finally {
      setCargando(false);
    }
  };

  // Buscar Licencia por Número y cargar sus pagos
  const buscarLicenciaParaPago = async (numParam?: string) => {
    const num = (numParam !== undefined ? numParam : numLicenciaBusqueda).trim();
    if (!num) {
      mostrarAlerta('error', 'Ingrese un Número de Licencia');
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/licencia/${encodeURIComponent(num)}`);
      if (!res.ok) {
        mostrarAlerta('error', `La licencia N° ${num} no existe`);
        return;
      }
      const data = await res.json();
      if (data.licencia) {
        const l = data.licencia;
        setNumLicenciaBusqueda(l.NumeroLicencia);
        setLicenciaActiva(l);
        setResumenPago(
          data.resumenDetalle || {
            diasSubsidio: 0,
            diasDescuento: 0,
            diasAporte: 0,
            diasSinConcepto: 0,
            diasCobrar: l.NumDias || 0,
            totalPagado: 0
          }
        );
        setDetallePagosLicencia(data.detallePagos || []);
        setPagoSeleccionado(null);

        // Pre-llenar campos de edición rápida de estado de licencia
        setObserApelacionLic(l.Obser_apelacion || '');
        setObservacionCajaLALic(l.Observacion_CajaLA || '');
        setRechazoLic(Boolean(l.Rechazo));
        setRetenidaLic(Boolean(l.Retenida));
        setAutorizadaLic(String(l.Autorizada).toLowerCase() === 'true');
        setPendienteLic(Boolean(l.Pendiente));
        setDiasAutorizadosLic(String(l.DiasAutorizados ?? l.NumDias ?? 0));

        // Pre-llenar fechas y días sugeridos para el nuevo pago
        setDesdePago(l.Desde || todayStr);
        setHastaPago(l.Hasta || todayStr);
        setDiasPagados(String(l.NumDias || ''));

        if (l.RutFuncionario) {
          await buscarFuncionarioPorRut(l.RutFuncionario);
        }
      }
    } catch {
      mostrarAlerta('error', 'Error al cargar la licencia para pago');
    } finally {
      setCargando(false);
    }
  };

  // Guardar Observación permanente del funcionario
  const guardarObsFuncionario = async () => {
    if (!funcionario?.Rut) return;
    try {
      const res = await fetch('/api/mantencion/funcionario/observacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: funcionario.Rut, observacion: obsFuncionario })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message);
      else mostrarAlerta('error', data.error || 'Error guardando observación');
    } catch {
      mostrarAlerta('error', 'Error de red');
    }
  };

  // Actualizar estado/apelación de la licencia desde Pagos (Button4 en Frm_IngresoPago.vb)
  const actualizarEstadoLicenciaDesdePago = async () => {
    if (!licenciaActiva?.NumeroLicencia) return;
    try {
      const res = await fetch('/api/mantencion/licencia-estado-pago', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroLicencia: licenciaActiva.NumeroLicencia,
          obserApelacion: obserApelacionLic,
          observacionCajaLA: observacionCajaLALic,
          rechazo: rechazoLic,
          retenida: retenidaLic,
          autorizada: autorizadaLic,
          pendiente: pendienteLic,
          diasAutorizados: parseInt(diasAutorizadosLic || '0', 10)
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message);
        await buscarLicenciaParaPago(licenciaActiva.NumeroLicencia);
      } else {
        mostrarAlerta('error', data.error || 'Error actualizando estado');
      }
    } catch {
      mostrarAlerta('error', 'Error al actualizar estado de la licencia');
    }
  };

  // Cambio de días a pagar -> recalcula Hasta
  const handleDiasPagadosChange = (val: string) => {
    setDiasPagados(val);
    if (desdePago && val) {
      setHastaPago(calcularFechaHasta(desdePago, val));
    }
  };

  const handleDesdePagoChange = (val: string) => {
    setDesdePago(val);
    if (diasPagados) {
      setHastaPago(calcularFechaHasta(val, diasPagados));
    }
  };

  // Grabar Nuevo Pago (Btn_Grabar_Click en Frm_IngresoPago.vb)
  const grabarPago = async () => {
    if (!licenciaActiva?.NumeroLicencia) {
      mostrarAlerta('error', 'Primero busque y seleccione una Licencia Médica');
      return;
    }
    if (!numDocPago.trim()) {
      mostrarAlerta('error', 'Ingrese el Número de Documento / Cheque');
      return;
    }
    if (diasPagados === '' || montoPago === '') {
      mostrarAlerta('error', 'Ingrese los Días Pagados y el Monto ($)');
      return;
    }

    setCargando(true);
    try {
      const res = await fetch('/api/mantencion/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroLicencia: licenciaActiva.NumeroLicencia,
          numeroDocumento: numDocPago.trim(),
          banco: bancoPago.trim(),
          fechaDocumento: fechaDocPago,
          fechaRecepcion: fechaRecepcionPago,
          concepto: conceptoPago,
          diasPagados: parseInt(diasPagados, 10),
          desde: desdePago,
          hasta: hastaPago,
          monto: parseInt(montoPago, 10),
          observacionPago,
          cenco: funcionario?.Cenco || ''
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message || 'Pago registrado exitosamente');
        setMontoPago('');
        setObservacionPago('');
        await buscarLicenciaParaPago(licenciaActiva.NumeroLicencia);
        if (numCheque.trim() && bancoCheque.trim()) {
          await buscarCheque(bancoCheque, numCheque);
        }
      } else {
        mostrarAlerta('error', data.error || 'Error registrando el pago');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión al registrar pago');
    } finally {
      setCargando(false);
    }
  };

  // Modificar Concepto de un pago seleccionado (Button3 en Frm_IngresoPago.vb)
  const actualizarConceptoPago = async () => {
    if (!pagoSeleccionado?.Correlativo) {
      mostrarAlerta('error', 'Seleccione primero una fila en la tabla de Pagos de la Licencia');
      return;
    }
    try {
      const res = await fetch('/api/mantencion/pago/concepto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlativo: pagoSeleccionado.Correlativo,
          concepto: conceptoPago
        })
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message);
        await buscarLicenciaParaPago(licenciaActiva.NumeroLicencia);
      } else {
        mostrarAlerta('error', data.error || 'Error actualizando concepto');
      }
    } catch {
      mostrarAlerta('error', 'Error al actualizar concepto del pago');
    }
  };

  // Eliminar un movimiento de pago individual (Button10 en Frm_IngresoPago.vb)
  const eliminarPagoIndividual = async (correlativoParam?: number) => {
    const corr = correlativoParam || pagoSeleccionado?.Correlativo;
    if (!corr) {
      mostrarAlerta('error', 'Seleccione un pago de la tabla para eliminarlo');
      return;
    }
    if (!window.confirm('¿Está seguro de eliminar este registro de pago? Se descontará del total pagado y del saldo del cheque.')) {
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/pago/${corr}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message);
        setPagoSeleccionado(null);
        if (licenciaActiva?.NumeroLicencia) {
          await buscarLicenciaParaPago(licenciaActiva.NumeroLicencia);
        }
        if (numCheque.trim() && bancoCheque.trim()) {
          await buscarCheque(bancoCheque, numCheque);
        }
      } else {
        mostrarAlerta('error', data.error || 'No se pudo eliminar el pago');
      }
    } catch {
      mostrarAlerta('error', 'Error de red eliminando pago');
    } finally {
      setCargando(false);
    }
  };

  const exportarMovimientosChequeExcel = () => {
    if (movimientosCheque.length === 0) return;
    const rows = movimientosCheque.map(m => ({
      'Correlativo': m.Correlativo,
      'Banco': m.Banco,
      'N° Documento': m.NumeroDocumento,
      'N° Licencia': m.NumeroLicencia,
      'Concepto': m.Concepto,
      'Días Pagados': m.DiasPagados,
      'Monto ($)': m.Monto,
      'Fecha Doc.': formatDateDDMMYYYY(m.FechaDepCtaCte),
      'Recepción': formatDateDDMMYYYY(m.Recepcion),
      'Desde': formatDateDDMMYYYY(m.Desde),
      'Hasta': formatDateDDMMYYYY(m.Hasta),
      'Cenco': m.Cenco,
      'Observación': m.Observacion
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos_Cheque');
    XLSX.writeFile(wb, `Cheque_${bancoCheque}_${numCheque}.xlsx`);
  };

  const diferenciaCheque = (parseInt(montoCheque || '0', 10) || 0) - saldoCheque;

  return (
    <div className="space-y-6 pb-10">
      {/* Encabezado */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">
            Mantención Operativa — Ingreso de Pagos y Gestión de Cheques
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            Control de cheques/documentos bancarios (`DETALLE_CHEQUES`) e imputación de pagos por licencia médica (`LIC_DETALLE_PAGO_ACTUAL`)
          </p>
        </div>
      </div>

      {/* Alertas */}
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
          <button onClick={() => setMensaje(null)} className="text-xs font-bold ml-4 opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* PANEL 1: GESTIÓN DE CHEQUE / DOCUMENTO BANCARIO */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#f1f5f9] pb-2 gap-2">
          <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider">
            1. Control de Cheque / Documento Bancario (`DETALLE_CHEQUES`)
          </h2>
          <div className="flex items-center gap-2">
            {chequeEncontrado && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  estadoCheque === 'Cerrado'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                Cheque {estadoCheque.toUpperCase()} — {cantDocsCheque} pago(s) imputado(s)
              </span>
            )}
            <button
              onClick={limpiarCheque}
              className="px-3 py-1 text-xs font-semibold border border-[#cbd5e1] rounded-lg text-[#475569] hover:bg-[#f1f5f9]"
            >
              Limpiar Cheque
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Banco</label>
            <select
              value={bancoCheque}
              onChange={e => setBancoCheque(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
            >
              {bancos.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-semibold text-[#475569] mb-1">N° Cheque / Documento</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={numCheque}
                onChange={e => setNumCheque(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarCheque()}
                placeholder="Ej: 459012"
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold"
              />
              <button
                onClick={() => buscarCheque()}
                className="px-3 py-2 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78] shrink-0"
              >
                Buscar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Monto Cheque ($)</label>
            <input
              type="number"
              value={montoCheque}
              onChange={e => setMontoCheque(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Ocupado ($)</label>
            <input
              type="text"
              readOnly
              value={`$${saldoCheque.toLocaleString('es-CL')}`}
              className="w-full px-3 py-2 text-xs border border-[#e2e8f0] rounded-lg bg-[#f8fafc] font-bold text-[#016098]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Saldo Disponible ($)</label>
            <input
              type="text"
              readOnly
              value={`$${diferenciaCheque.toLocaleString('es-CL')}`}
              className={`w-full px-3 py-2 text-xs border rounded-lg font-bold ${
                diferenciaCheque < 0
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-700'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Documento</label>
            <input
              type="date"
              value={fechaCheque}
              onChange={e => setFechaCheque(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-[#cbd5e1] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end pt-1">
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Tipo Documento</label>
            <select
              value={tipoCheque}
              onChange={e => setTipoCheque(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
            >
              <option value="Cheque">Cheque</option>
              <option value="V. Vista">V. Vista</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Área</label>
            <select
              value={areaCheque}
              onChange={e => setAreaCheque(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
            >
              <option value="Educacion">Educacion</option>
              <option value="Salud">Salud</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Estado Cheque</label>
            <select
              value={estadoCheque}
              onChange={e => setEstadoCheque(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold"
            >
              <option value="Abierto">Abierto</option>
              <option value="Cerrado">Cerrado</option>
            </select>
          </div>

          <div className="col-span-2 sm:col-span-3 flex flex-wrap gap-2 justify-end">
            <button
              onClick={guardarCheque}
              disabled={cargando}
              className="px-4 py-2 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78]"
            >
              {chequeEncontrado ? 'Actualizar Cheque' : 'Registrar Cheque'}
            </button>

            {movimientosCheque.length > 0 && (
              <>
                <button
                  onClick={() => setMostrarMovsCheque(!mostrarMovsCheque)}
                  className="px-3.5 py-2 bg-[#39BABD] text-white text-xs font-semibold rounded-lg hover:bg-[#2da1a4]"
                >
                  {mostrarMovsCheque ? 'Ocultar Pagos del Cheque' : `Ver Pagos del Cheque (${movimientosCheque.length})`}
                </button>
                <button
                  onClick={exportarMovimientosChequeExcel}
                  className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700"
                >
                  Exportar Cheque Excel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabla desplegable con los movimientos asociados al cheque actual */}
        {mostrarMovsCheque && movimientosCheque.length > 0 && (
          <div className="mt-3 border border-[#e2e8f0] rounded-xl overflow-x-auto max-h-[240px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f1f5f9] text-[#475569] sticky top-0">
                <tr>
                  <th className="p-2">Correlativo</th>
                  <th className="p-2">N° Licencia</th>
                  <th className="p-2">Concepto</th>
                  <th className="p-2 text-center">Días</th>
                  <th className="p-2 text-right">Monto ($)</th>
                  <th className="p-2">Desde</th>
                  <th className="p-2">Hasta</th>
                  <th className="p-2">Cenco</th>
                  <th className="p-2">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {movimientosCheque.map(m => (
                  <tr
                    key={m.Correlativo}
                    onClick={() => buscarLicenciaParaPago(m.NumeroLicencia)}
                    className="hover:bg-[#f8fafc] cursor-pointer"
                  >
                    <td className="p-2">{m.Correlativo}</td>
                    <td className="p-2 font-bold text-[#016098]">{m.NumeroLicencia}</td>
                    <td className="p-2">{m.Concepto}</td>
                    <td className="p-2 text-center">{m.DiasPagados}</td>
                    <td className="p-2 text-right font-semibold">${Number(m.Monto).toLocaleString('es-CL')}</td>
                    <td className="p-2">{formatDateDDMMYYYY(m.Desde)}</td>
                    <td className="p-2">{formatDateDDMMYYYY(m.Hasta)}</td>
                    <td className="p-2">{m.Cenco}</td>
                    <td className="p-2">{m.Observacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PANEL 2: BÚSQUEDA DE LICENCIA / FUNCIONARIO Y ESTADO DE COBRO */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
        <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
          2. Selección de Licencia Médica / Funcionario y Resumen de Saldos
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Buscar por N° Licencia Médica</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={numLicenciaBusqueda}
                onChange={e => setNumLicenciaBusqueda(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarLicenciaParaPago()}
                placeholder="Ej: 3-10982341"
                className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg font-bold text-[#016098]"
              />
              <button
                onClick={() => buscarLicenciaParaPago()}
                className="px-4 py-2 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78] shrink-0"
              >
                Buscar Lic.
              </button>
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-[#475569] mb-1">O Buscar Funcionario por RUT</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rutBusqueda}
                onChange={e => setRutBusqueda(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarFuncionarioPorRut()}
                placeholder="Ej: 12345678"
                className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg"
              />
              <button
                onClick={() => buscarFuncionarioPorRut()}
                className="px-4 py-2 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 shrink-0"
              >
                Buscar RUT
              </button>
            </div>
          </div>

          {funcionario && (
            <div className="md:col-span-4 bg-[#f8fafc] p-2.5 rounded-xl border border-[#e2e8f0] text-xs">
              <span className="text-[#64748b] block">Funcionario Seleccionado:</span>
              <span className="font-bold text-[#1e293b]">
                {funcionario.NombreCompleto} ({funcionario.Rut}-{funcionario.DV})
              </span>
              <span className="block text-[11px] text-[#016098]">
                Cenco {funcionario.Cenco} — {funcionario.Salud || 'Sin Salud'} / {funcionario.Prevision || 'Sin AFP'}
              </span>
            </div>
          )}
        </div>

        {/* Resumen de la Licencia Activa */}
        {licenciaActiva && (
          <div className="space-y-4 pt-3 border-t border-[#f1f5f9]">
            {/* Tarjetas de Resumen de Días y Montos (Replica exacta Frm_IngresoPago.vb) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
                <span className="text-[#64748b] block">Licencia N°</span>
                <span className="font-bold text-sm text-[#016098]">{licenciaActiva.NumeroLicencia}</span>
                <span className="block text-[10px] text-[#64748b]">{licenciaActiva.PagoDirecto}</span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
                <span className="text-[#64748b] block">Período Reposo</span>
                <span className="font-semibold text-[#1e293b] block">{formatDateDDMMYYYY(licenciaActiva.Desde)}</span>
                <span className="font-semibold text-[#1e293b] block">{formatDateDDMMYYYY(licenciaActiva.Hasta)}</span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
                <span className="text-[#64748b] block">Días Lic. / Aut.</span>
                <span className="font-bold text-sm text-[#1e293b]">
                  {licenciaActiva.NumDias} / {licenciaActiva.DiasAutorizados}
                </span>
              </div>
              <div className="bg-sky-50 p-3 rounded-xl border border-sky-200">
                <span className="text-sky-800 block">Días Subsidio</span>
                <span className="font-bold text-sm text-[#016098]">{resumenPago.diasSubsidio}</span>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                <span className="text-rose-800 block">Días Descuento</span>
                <span className="font-bold text-sm text-rose-700">{resumenPago.diasDescuento}</span>
              </div>
              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                <span className="text-indigo-800 block">Días Aporte</span>
                <span className="font-bold text-sm text-indigo-700">{resumenPago.diasAporte}</span>
              </div>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                <span className="text-amber-900 block">Días por Cobrar</span>
                <span className="font-bold text-sm text-amber-800">{resumenPago.diasCobrar}</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <span className="text-emerald-900 block">Total Pagado ($)</span>
                <span className="font-bold text-sm text-emerald-700">
                  ${Number(resumenPago.totalPagado || 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Actualización Rápida de Observación / Estado de la Licencia (Button4_Click_1 en VB.NET) */}
            <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Observación Apelación / Estado Licencia
                </label>
                <input
                  type="text"
                  value={obserApelacionLic}
                  onChange={e => setObserApelacionLic(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">Observación Caja Los Andes</label>
                <input
                  type="text"
                  value={observacionCajaLALic}
                  onChange={e => setObservacionCajaLALic(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">Días Aut.</label>
                <input
                  type="number"
                  value={diasAutorizadosLic}
                  onChange={e => setDiasAutorizadosLic(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white font-bold"
                />
              </div>
              <div className="lg:col-span-3 flex flex-wrap gap-3 text-xs pb-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={rechazoLic} onChange={e => setRechazoLic(e.target.checked)} />
                  <span>Rechazo</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={retenidaLic} onChange={e => setRetenidaLic(e.target.checked)} />
                  <span>Retenida</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={autorizadaLic} onChange={e => setAutorizadaLic(e.target.checked)} />
                  <span>Autorizada</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={pendienteLic} onChange={e => setPendienteLic(e.target.checked)} />
                  <span>Pendiente</span>
                </label>
              </div>
              <div className="lg:col-span-2">
                <button
                  onClick={actualizarEstadoLicenciaDesdePago}
                  className="w-full py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                >
                  Guardar Estado Lic.
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PANEL 3: INGRESO DE PAGO Y TABLAS DE DETALLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario de Ingreso de Pago (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
            3. Imputar Movimiento de Pago a la Licencia
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Banco Documento</label>
              <select
                value={bancoPago}
                onChange={e => setBancoPago(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
              >
                {bancos.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">N° Documento / Cheque</label>
              <input
                type="text"
                value={numDocPago}
                onChange={e => setNumDocPago(e.target.value)}
                placeholder="Ej: 459012"
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold text-[#016098]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Documento</label>
              <input
                type="date"
                value={fechaDocPago}
                onChange={e => setFechaDocPago(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Recepción</label>
              <input
                type="date"
                value={fechaRecepcionPago}
                onChange={e => setFechaRecepcionPago(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Concepto de Pago</label>
              <select
                value={conceptoPago}
                onChange={e => setConceptoPago(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold text-[#016098]"
              >
                {['Subsidio', 'Aporte', 'Ampliación Dias', 'Descuento', 'Devolucion'].map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Días Pagados</label>
              <input
                type="number"
                value={diasPagados}
                onChange={e => handleDiasPagadosChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Desde</label>
              <input
                type="date"
                value={desdePago}
                onChange={e => handleDesdePagoChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Hasta</label>
              <input
                type="date"
                value={hastaPago}
                onChange={e => setHastaPago(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#475569] mb-1">Monto a Pagar ($)</label>
              <input
                type="number"
                value={montoPago}
                onChange={e => setMontoPago(e.target.value)}
                placeholder="Ej: 350000"
                className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg font-bold text-emerald-700"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#475569] mb-1">Observación del Pago</label>
              <input
                type="text"
                value={observacionPago}
                onChange={e => setObservacionPago(e.target.value)}
                placeholder="Observación opcional del movimiento..."
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            <button
              onClick={grabarPago}
              disabled={cargando}
              className="flex-1 py-2.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] shadow-sm"
            >
              Grabar Pago en Licencia
            </button>

            {pagoSeleccionado && (
              <>
                <button
                  onClick={actualizarConceptoPago}
                  className="px-3 py-2.5 bg-[#39BABD] text-white text-xs font-semibold rounded-lg hover:bg-[#2da1a4]"
                  title="Actualiza el Concepto del pago seleccionado en la tabla"
                >
                  Cambiar Concepto (#{pagoSeleccionado.Correlativo})
                </button>
                <button
                  onClick={() => eliminarPagoIndividual(pagoSeleccionado.Correlativo)}
                  className="px-3 py-2.5 bg-[#EB567F] text-white text-xs font-semibold rounded-lg hover:bg-[#d6416a]"
                >
                  Eliminar Pago
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tablas Derecha (7 cols): Detalle de Pagos de la Licencia + Historial de Licencias del Funcionario */}
        <div className="lg:col-span-7 space-y-6">
          {/* Movimientos de Pago de la Licencia Seleccionada */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider mb-3">
              4. Detalle de Pagos Registrados para la Licencia {licenciaActiva ? `#${licenciaActiva.NumeroLicencia}` : ''}
            </h2>
            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[240px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                  <tr>
                    <th className="p-2">ID</th>
                    <th className="p-2">N° Doc.</th>
                    <th className="p-2">Banco</th>
                    <th className="p-2">Concepto</th>
                    <th className="p-2 text-center">Días</th>
                    <th className="p-2 text-right">Monto ($)</th>
                    <th className="p-2">Fecha Doc.</th>
                    <th className="p-2">Recepción</th>
                    <th className="p-2">Observación</th>
                    <th className="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {detallePagosLicencia.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-5 text-center text-[#94a3b8]">
                        La licencia seleccionada no registra movimientos en `LIC_DETALLE_PAGO_ACTUAL`
                      </td>
                    </tr>
                  ) : (
                    detallePagosLicencia.map(d => {
                      const isSel = pagoSeleccionado?.Correlativo === d.Correlativo;
                      return (
                        <tr
                          key={d.Correlativo}
                          onClick={() => {
                            setPagoSeleccionado(d);
                            if (d.Concepto) setConceptoPago(d.Concepto);
                          }}
                          className={`cursor-pointer ${isSel ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'}`}
                        >
                          <td className="p-2">{d.Correlativo}</td>
                          <td className="p-2 font-bold text-[#016098]">{d.NumeroDocumento}</td>
                          <td className="p-2">{d.Banco}</td>
                          <td className="p-2">{d.Concepto}</td>
                          <td className="p-2 text-center">{d.DiasPagados}</td>
                          <td className="p-2 text-right font-bold text-emerald-700">
                            ${Number(d.Monto || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="p-2">{formatDateDDMMYYYY(d.FechaDepCtaCte)}</td>
                          <td className="p-2">{formatDateDDMMYYYY(d.Recepcion)}</td>
                          <td className="p-2 truncate max-w-[140px]">{d.Observacion}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                eliminarPagoIndividual(d.Correlativo);
                              }}
                              className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded hover:bg-rose-200 text-[11px] font-bold"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grilla de Todas las Licencias del Funcionario */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider mb-3">
              5. Licencias del Funcionario ({licenciasFuncionario.length}) — Clic para Seleccionar
            </h2>
            <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[280px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
                  <tr>
                    <th className="p-2">N° Licencia</th>
                    <th className="p-2">Desde</th>
                    <th className="p-2">Hasta</th>
                    <th className="p-2 text-center">Días Lic.</th>
                    <th className="p-2 text-center">Días Pag.</th>
                    <th className="p-2 text-center">Por Cobrar</th>
                    <th className="p-2 text-right">Pago Estimado</th>
                    <th className="p-2 text-right">Total Pagado</th>
                    <th className="p-2">Modalidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {licenciasFuncionario.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-5 text-center text-[#94a3b8]">
                        Sin licencias cargadas
                      </td>
                    </tr>
                  ) : (
                    licenciasFuncionario.map(l => {
                      const act = licenciaActiva?.NumeroLicencia === l.NumeroLicencia;
                      return (
                        <tr
                          key={l.NumeroLicencia}
                          onClick={() => buscarLicenciaParaPago(l.NumeroLicencia)}
                          className={`cursor-pointer ${act ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'}`}
                        >
                          <td className="p-2 font-bold text-[#016098]">{l.NumeroLicencia}</td>
                          <td className="p-2">{formatDateDDMMYYYY(l.Desde)}</td>
                          <td className="p-2">{formatDateDDMMYYYY(l.Hasta)}</td>
                          <td className="p-2 text-center">{l.NumDias}</td>
                          <td className="p-2 text-center">{l.NumDiasPagados}</td>
                          <td className="p-2 text-center font-semibold text-amber-700">{l.DiasCobrar}</td>
                          <td className="p-2 text-right">${Number(l.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                          <td className="p-2 text-right font-bold text-emerald-700">
                            ${Number(l.TotalPagado || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="p-2">{l.PagoDirecto}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
