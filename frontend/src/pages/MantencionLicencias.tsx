import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface MantencionLicenciasProps {
  modo?: 'normal' | 'mutual';
}

interface FuncionarioData {
  Rut: string;
  DV: string;
  Nombre: string;
  Paterno: string;
  Materno: string;
  NombreCompleto: string;
  Cenco: string;
  FechaInicio: string;
  FechaTermino: string;
  Salud: string;
  Prevision: string;
  DiasTrabajados: string;
  TipoContrato: string;
  CesantiaEmpleado: string;
  CesantiaEmpleador: string;
  Sector: string;
  Planta: string;
  Unidad: string;
  Direccion: string;
  Telefono: string;
  Vigencia: string;
  FAfiliacion: string;
  ObservacionFuncionario: string;
  CorreoEstablecimiento: string;
}

interface RentaRow {
  Anio: number;
  Mes: number;
  MontoImponible: number;
  descPrevision: number;
  descSalud: number;
  impuestoUnico: number;
  montoNeto: number;
}

export default function MantencionLicencias({ modo = 'normal' }: MantencionLicenciasProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  // Usuario actual desde JWT
  const [usuarioActual, setUsuarioActual] = useState('Sistema');
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.username) setUsuarioActual(payload.username);
      } catch {}
    }
  }, []);

  // Estado de alertas / notificaciones UI
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  // Datos del Funcionario
  const [rutBusqueda, setRutBusqueda] = useState('');
  const [funcionario, setFuncionario] = useState<FuncionarioData | null>(null);
  const [enPersonal, setEnPersonal] = useState(true);
  const [fAfiliacion, setFAfiliacion] = useState('');
  const [obsFuncionario, setObsFuncionario] = useState('');

  // Historial y Rentas
  const [historialLicencias, setHistorialLicencias] = useState<any[]>([]);
  const [detallePagosLic, setDetallePagosLic] = useState<any[]>([]);
  const [rentas3Meses, setRentas3Meses] = useState<RentaRow[]>([]);
  const [fechaConcesion, setFechaConcesion] = useState(todayStr);

  // Formulario de Licencia
  const [numeroLicencia, setNumeroLicencia] = useState('');
  const [licenciaExiste, setLicenciaExiste] = useState(false);
  const [desde, setDesde] = useState(todayStr);
  const [numDias, setNumDias] = useState<string>('');
  const [hasta, setHasta] = useState(todayStr);
  const [diasAutorizados, setDiasAutorizados] = useState<string>('');
  const [recepcion, setRecepcion] = useState(todayStr);
  const [remision, setRemision] = useState(todayStr);

  const [tipoLic, setTipoLic] = useState('Electronica');
  const [pagoDirecto, setPagoDirecto] = useState(modo === 'mutual' ? 'Mutual' : 'Normal');
  const [tipoEnferm, setTipoEnferm] = useState(modo === 'mutual' ? 'Accidente Trabajo' : 'Enferm. Comun');

  // Médico Tratante
  const [rutMedico, setRutMedico] = useState('');
  const [nombreMedico, setNombreMedico] = useState('');

  // Checkboxes de estado
  const [maternal, setMaternal] = useState(false);
  const [rechazo, setRechazo] = useState(false);
  const [regularizado, setRegularizado] = useState(false); // Reducción
  const [retenida, setRetenida] = useState(false);
  const [parcial, setParcial] = useState(false);
  const [jornadaParcial, setJornadaParcial] = useState('M'); // M, T, N
  const [altaAchs, setAltaAchs] = useState(''); // ADF, ADI, AIN, TAD, TIN
  const [descuentoCheck, setDescuentoCheck] = useState(false);
  const [apelacion, setApelacion] = useState(false);
  const [suseso, setSuseso] = useState(false);
  const [compin, setCompin] = useState(false);
  const [autorizada, setAutorizada] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  // Montos Calculados
  const [montoNetoPromedio, setMontoNetoPromedio] = useState<number>(0);
  const [subsidioDiario, setSubsidioDiario] = useState<number>(0);
  const [pagoEstimado, setPagoEstimado] = useState<number>(0);
  const [montoDesc, setMontoDesc] = useState<number>(0);

  // Observaciones de la licencia
  const [observacion, setObservacion] = useState('');
  const [observacionCajaLA, setObservacionCajaLA] = useState('');
  const [obserApelacion, setObserApelacion] = useState('');
  const [observMutual, setObservMutual] = useState('');

  // Correos
  const [correoRecepcion, setCorreoRecepcion] = useState('');
  const [correoRechazo, setCorreoRechazo] = useState('');
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  // Resetear valores por defecto cuando cambia el modo (normal vs mutual)
  useEffect(() => {
    setPagoDirecto(modo === 'mutual' ? 'Mutual' : 'Normal');
    setTipoEnferm(modo === 'mutual' ? 'Accidente Trabajo' : 'Enferm. Comun');
  }, [modo]);

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

  // Llamada al endpoint que replica Calcular_PagoEstimado() de VB.NET
  const ejecutarCalculoEstimado = async (rutParam: string, fechaBaseParam: string, diasLicParam: string, diasAutParam: string) => {
    const cleanRut = rutParam.split('-')[0].replace(/\./g, '').trim();
    if (!cleanRut || !fechaBaseParam) return;
    try {
      const res = await fetch('/api/mantencion/calcular-estimado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rut: cleanRut,
          fechaBase: fechaBaseParam,
          numDias: diasLicParam || 0,
          diasAutorizados: diasAutParam !== '' ? diasAutParam : (diasLicParam || 0)
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setRentas3Meses(data.rentas || []);
        setMontoNetoPromedio(data.calculo.montoNetoPromedio || 0);
        setSubsidioDiario(data.calculo.subsidioDiario || 0);
        setPagoEstimado(data.calculo.pagoEstimado || 0);
        setMontoDesc(data.calculo.descuento || 0);
      }
    } catch (e) {
      console.error('Error calculando estimado:', e);
    }
  };

  // Buscar Funcionario por RUT
  const buscarFuncionario = async (rutInput?: string) => {
    const targetRut = (rutInput !== undefined ? rutInput : rutBusqueda).trim();
    if (!targetRut) {
      mostrarAlerta('error', 'Ingrese un RUT para consultar');
      return null;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/funcionario/${encodeURIComponent(targetRut)}`);
      const data = await res.json();
      if (!res.ok || !data.funcionario) {
        mostrarAlerta('error', 'El RUT ingresado no se encuentra registrado en Personal ni en Histórico de Funcionarios');
        setFuncionario(null);
        setHistorialLicencias([]);
        setRentas3Meses([]);
        return null;
      }
      setFuncionario(data.funcionario);
      setEnPersonal(data.enPersonal);
      setRutBusqueda(data.funcionario.Rut);
      setFAfiliacion(data.funcionario.FAfiliacion || '');
      setObsFuncionario(data.funcionario.ObservacionFuncionario || '');
      setCorreoRecepcion(data.funcionario.CorreoEstablecimiento || '');
      setCorreoRechazo(data.funcionario.CorreoEstablecimiento || '');
      setHistorialLicencias(data.licencias || []);

      if (!data.enPersonal) {
        mostrarAlerta('info', 'Funcionario cargado desde registro histórico (no figura activo en tabla Personal)');
      }
      return data.funcionario;
    } catch (e) {
      mostrarAlerta('error', 'Error de conexión al buscar funcionario');
      return null;
    } finally {
      setCargando(false);
    }
  };

  // Buscar Licencia existente por Número
  const buscarLicenciaPorNumero = async (numInput?: string) => {
    const num = (numInput !== undefined ? numInput : numeroLicencia).trim();
    if (!num) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/licencia/${encodeURIComponent(num)}`);
      if (res.status === 404) {
        setLicenciaExiste(false);
        setDetallePagosLic([]);
        mostrarAlerta('info', `Licencia N° ${num} disponible para nuevo ingreso`);
        return;
      }
      const data = await res.json();
      if (res.ok && data.licencia) {
        const l = data.licencia;
        setLicenciaExiste(true);
        setDetallePagosLic(data.detallePagos || []);
        setNumeroLicencia(l.NumeroLicencia);
        setDesde(l.Desde || todayStr);
        setHasta(l.Hasta || todayStr);
        setNumDias(String(l.NumDias ?? ''));
        setDiasAutorizados(String(l.DiasAutorizados ?? l.NumDias ?? ''));
        setRecepcion(l.Recepcion || todayStr);
        setRemision(l.Remision || todayStr);
        setTipoLic(l.TipoLic || 'Electronica');
        setPagoDirecto(l.PagoDirecto || (modo === 'mutual' ? 'Mutual' : 'Normal'));
        setTipoEnferm(l.Tipo_enferm || (modo === 'mutual' ? 'Accidente Trabajo' : 'Enferm. Comun'));
        setRutMedico(l.RutMedico || '');
        setNombreMedico(l.NombreMedico || '');
        setMaternal(Boolean(l.Maternal));
        setRechazo(Boolean(l.Rechazo));
        setRegularizado(Boolean(l.Regularizado));
        setRetenida(Boolean(l.Retenida));
        setParcial(Boolean(l.Parcial));
        setJornadaParcial(l.JornadaParcial || 'M');
        setAltaAchs(l.AltaAchs || '');
        setDescuentoCheck(Boolean(l.DescuentoCheck));
        setApelacion(String(l.Apelacion).toLowerCase() === 'true');
        setSuseso(String(l.Suseso).toLowerCase() === 'true');
        setCompin(String(l.Compin).toLowerCase() === 'true');
        setAutorizada(String(l.Autorizada).toLowerCase() === 'true');
        setPendiente(Boolean(l.Pendiente));
        setMontoNetoPromedio(Number(l.MontoNetoPromedio || 0));
        setSubsidioDiario(Number(l.SubsidioDiario || 0));
        setPagoEstimado(Number(l.PagoEstimado || 0));
        setMontoDesc(Number(l.MontoDesc || 0));
        setObservacion(l.Observacion || '');
        setObservacionCajaLA(l.Observacion_CajaLA || '');
        setObserApelacion(l.Obser_apelacion || '');
        setObservMutual(l.ObservMutual || '');

        if (l.RutFuncionario) {
          await buscarFuncionario(l.RutFuncionario);
          await ejecutarCalculoEstimado(l.RutFuncionario, l.Desde || todayStr, String(l.NumDias || 0), String(l.DiasAutorizados ?? l.NumDias ?? 0));
        }
        mostrarAlerta('info', `Licencia N° ${l.NumeroLicencia} cargada para edición`);
      }
    } catch (e) {
      mostrarAlerta('error', 'Error al consultar la licencia');
    } finally {
      setCargando(false);
    }
  };

  // Cambio de N° de Días
  const handleNumDiasChange = (val: string) => {
    setNumDias(val);
    const nuevoHasta = calcularFechaHasta(desde, val);
    setHasta(nuevoHasta);
    const nuevosAut = rechazo ? '0' : val;
    setDiasAutorizados(nuevosAut);
    if (funcionario?.Rut && desde && val) {
      ejecutarCalculoEstimado(funcionario.Rut, desde, val, nuevosAut);
    }
  };

  // Cambio de Fecha Desde
  const handleDesdeChange = (nuevaFecha: string) => {
    setDesde(nuevaFecha);
    if (numDias) {
      const nuevoHasta = calcularFechaHasta(nuevaFecha, numDias);
      setHasta(nuevoHasta);
      if (funcionario?.Rut) {
        ejecutarCalculoEstimado(funcionario.Rut, nuevaFecha, numDias, diasAutorizados || numDias);
      }
    }
  };

  // Cambio de Días Autorizados
  const handleDiasAutorizadosChange = (val: string) => {
    setDiasAutorizados(val);
    const nLic = parseInt(numDias || '0', 10);
    const nAut = parseInt(val || '0', 10);
    if (!isNaN(nLic) && !isNaN(nAut)) {
      if (nAut < nLic && nAut > 0) {
        setRegularizado(true);
        setDescuentoCheck(true);
      } else if (nAut === nLic) {
        setRegularizado(false);
        setRechazo(false);
        setDescuentoCheck(false);
      }
    }
    if (funcionario?.Rut && desde) {
      ejecutarCalculoEstimado(funcionario.Rut, desde, numDias, val);
    }
  };

  // Cambio de Checkbox Rechazo
  const handleRechazoChange = (checked: boolean) => {
    setRechazo(checked);
    if (checked) {
      setDiasAutorizados('0');
      setDescuentoCheck(true);
      if (funcionario?.Rut && desde) {
        ejecutarCalculoEstimado(funcionario.Rut, desde, numDias, '0');
      }
    } else {
      setDiasAutorizados(numDias);
      setDescuentoCheck(false);
      if (funcionario?.Rut && desde) {
        ejecutarCalculoEstimado(funcionario.Rut, desde, numDias, numDias);
      }
    }
  };

  // Cambio de Tipo Enfermedad (auto-marca Maternal igual que VB.NET)
  const handleTipoEnfermChange = (val: string) => {
    setTipoEnferm(val);
    if (val === 'Maternal' || val === 'Hijo Menor de 1 año' || val === 'Patologia Embarazo') {
      setMaternal(true);
    } else {
      setMaternal(false);
    }
  };

  // Buscar Médico Tratante
  const buscarMedico = async () => {
    if (!rutMedico.trim()) return;
    try {
      const res = await fetch(`/api/mantencion/medico/${encodeURIComponent(rutMedico.trim())}`);
      const data = await res.json();
      if (res.ok && data.medico) {
        setNombreMedico(data.medico.Nombre || '');
        mostrarAlerta('ok', `Médico encontrado: ${data.medico.Nombre}`);
      } else {
        mostrarAlerta('info', 'Médico no registrado aún. Ingrese su nombre y presione Guardar Médico.');
      }
    } catch {
      mostrarAlerta('error', 'Error buscando médico');
    }
  };

  // Guardar Médico Tratante
  const guardarMedico = async () => {
    if (!rutMedico.trim() || !nombreMedico.trim()) {
      mostrarAlerta('error', 'Ingrese RUT y Nombre del médico para registrarlo');
      return;
    }
    try {
      const res = await fetch('/api/mantencion/medico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rutProfesional: rutMedico.trim(), nombre: nombreMedico.trim() })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message || 'Médico guardado');
      else mostrarAlerta('error', data.error || 'Error guardando médico');
    } catch {
      mostrarAlerta('error', 'Error de conexión al guardar médico');
    }
  };

  // Guardar Observación Permanente del Funcionario
  const guardarObservacionFuncionario = async () => {
    if (!funcionario?.Rut) {
      mostrarAlerta('error', 'Primero seleccione un funcionario');
      return;
    }
    try {
      const res = await fetch('/api/mantencion/funcionario/observacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: funcionario.Rut, observacion: obsFuncionario })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message);
      else mostrarAlerta('error', data.error || 'Error al guardar observación');
    } catch {
      mostrarAlerta('error', 'Error al guardar observación del funcionario');
    }
  };

  // Guardar Fecha de Afiliación
  const guardarAfiliacion = async () => {
    if (!funcionario?.Rut) return;
    try {
      const res = await fetch('/api/mantencion/funcionario/afiliacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: funcionario.Rut, fAfiliacion })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message);
      else mostrarAlerta('error', data.error || 'Error guardando fecha afiliación');
    } catch {
      mostrarAlerta('error', 'Error al actualizar fecha de afiliación');
    }
  };

  // Guardar o Modificar Licencia Médica
  const guardarLicencia = async () => {
    if (!numeroLicencia.trim()) {
      mostrarAlerta('error', 'Debe ingresar el Número de Licencia');
      return;
    }
    if (!funcionario?.Rut && !rutBusqueda.trim()) {
      mostrarAlerta('error', 'Debe buscar y seleccionar un Funcionario válido');
      return;
    }
    if (!numDias || parseInt(numDias, 10) <= 0) {
      mostrarAlerta('error', 'Debe ingresar una cantidad de días válida');
      return;
    }

    setCargando(true);
    try {
      const payload = {
        numeroLicencia: numeroLicencia.trim(),
        rutFuncionario: funcionario?.Rut || rutBusqueda.trim(),
        dv: funcionario?.DV || '',
        desde,
        hasta,
        numDias: parseInt(numDias, 10),
        diasAutorizados: diasAutorizados !== '' ? parseInt(diasAutorizados, 10) : parseInt(numDias, 10),
        maternal,
        recepcion,
        remision,
        rechazo,
        parcial,
        regularizado,
        retenida,
        pendiente,
        descuentoCheck,
        montoDesc,
        observacion,
        observacionCajaLA,
        observMutual,
        montoNetoPromedio,
        subsidioDiario,
        pagoEstimado,
        rutMedico,
        nombreMedico,
        pagoDirecto,
        tipoEnferm,
        apelacion,
        suseso,
        compin,
        autorizada,
        obserApelacion,
        direccion: funcionario?.Direccion || '',
        telefono: funcionario?.Telefono || '',
        tipoLic,
        usuario: usuarioActual,
        jornadaParcial: parcial ? jornadaParcial : '',
        altaAchs: pagoDirecto === 'ACHS OR' ? altaAchs : '',
        fAfiliacion
      };

      const res = await fetch('/api/mantencion/licencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message || 'Licencia guardada con éxito');
        setLicenciaExiste(true);
        await buscarFuncionario(funcionario?.Rut || rutBusqueda);
      } else {
        mostrarAlerta('error', data.error || 'Error al guardar la licencia');
      }
    } catch {
      mostrarAlerta('error', 'Error de red al intentar guardar la licencia');
    } finally {
      setCargando(false);
    }
  };

  // Eliminar Licencia Médica
  const eliminarLicencia = async () => {
    if (!numeroLicencia.trim()) {
      mostrarAlerta('error', 'Seleccione o ingrese el N° de Licencia que desea eliminar');
      return;
    }
    if (!window.confirm(`¿Está seguro que desea eliminar la Licencia N° ${numeroLicencia.trim()}? (Solo se permite si no registra pagos)`)) {
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`/api/mantencion/licencia/${encodeURIComponent(numeroLicencia.trim())}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        mostrarAlerta('ok', data.message || 'Licencia eliminada correctamente');
        limpiarFormularioLicencia();
        if (funcionario?.Rut) await buscarFuncionario(funcionario.Rut);
      } else {
        mostrarAlerta('error', data.error || 'No se pudo eliminar la licencia');
      }
    } catch {
      mostrarAlerta('error', 'Error de conexión al eliminar licencia');
    } finally {
      setCargando(false);
    }
  };

  // Enviar Correo Recepción
  const enviarCorreoRecepcion = async () => {
    if (!correoRecepcion.trim()) {
      mostrarAlerta('error', 'Ingrese el correo de destino del establecimiento/funcionario');
      return;
    }
    if (!numeroLicencia.trim() || !funcionario) {
      mostrarAlerta('error', 'Debe tener cargada la licencia y el funcionario para enviar el correo');
      return;
    }
    setEnviandoCorreo(true);
    try {
      const res = await fetch('/api/mantencion/correo/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correoFuncionario: correoRecepcion.trim(),
          cenco: funcionario.Cenco,
          rut: funcionario.Rut,
          sector: funcionario.Sector,
          planta: funcionario.Planta,
          nombreCompleto: funcionario.NombreCompleto,
          numeroLicencia,
          numDias,
          desde: formatDateDDMMYYYY(desde),
          hasta: formatDateDDMMYYYY(hasta),
          tipoEnferm,
          parcial,
          jornadaParcial,
          pagoDirecto,
          altaAchs
        })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message);
      else mostrarAlerta('error', data.error || 'Error enviando correo de recepción');
    } catch {
      mostrarAlerta('error', 'Error de red al enviar correo de recepción');
    } finally {
      setEnviandoCorreo(false);
    }
  };

  // Enviar Correo Rechazo
  const enviarCorreoRechazo = async () => {
    if (!correoRechazo.trim()) {
      mostrarAlerta('error', 'Ingrese el correo de destino para aviso de rechazo/reducción');
      return;
    }
    if (!numeroLicencia.trim() || !funcionario) {
      mostrarAlerta('error', 'Debe tener cargada la licencia y el funcionario para enviar el correo');
      return;
    }
    setEnviandoCorreo(true);
    try {
      const res = await fetch('/api/mantencion/correo/rechazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correoRechazo: correoRechazo.trim(),
          nombreCompleto: funcionario.NombreCompleto,
          numeroLicencia,
          desde: formatDateDDMMYYYY(desde),
          hasta: formatDateDDMMYYYY(hasta),
          numDias,
          diasAutorizados: diasAutorizados || '0',
          salud: funcionario.Salud,
          obserApelacion
        })
      });
      const data = await res.json();
      if (res.ok) mostrarAlerta('ok', data.message);
      else mostrarAlerta('error', data.error || 'Error enviando correo de rechazo');
    } catch {
      mostrarAlerta('error', 'Error de red al enviar correo de rechazo');
    } finally {
      setEnviandoCorreo(false);
    }
  };

  const limpiarFormularioLicencia = () => {
    setNumeroLicencia('');
    setLicenciaExiste(false);
    setDetallePagosLic([]);
    setDesde(todayStr);
    setHasta(todayStr);
    setNumDias('');
    setDiasAutorizados('');
    setRecepcion(todayStr);
    setRemision(todayStr);
    setTipoLic('Electronica');
    setPagoDirecto(modo === 'mutual' ? 'Mutual' : 'Normal');
    setTipoEnferm(modo === 'mutual' ? 'Accidente Trabajo' : 'Enferm. Comun');
    setRutMedico('');
    setNombreMedico('');
    setMaternal(false);
    setRechazo(false);
    setRegularizado(false);
    setRetenida(false);
    setParcial(false);
    setJornadaParcial('M');
    setAltaAchs('');
    setDescuentoCheck(false);
    setApelacion(false);
    setSuseso(false);
    setCompin(false);
    setAutorizada(false);
    setPendiente(false);
    setMontoNetoPromedio(0);
    setSubsidioDiario(0);
    setPagoEstimado(0);
    setMontoDesc(0);
    setObservacion('');
    setObservacionCajaLA('');
    setObserApelacion('');
    setObservMutual('');
  };

  const limpiarTodo = () => {
    limpiarFormularioLicencia();
    setRutBusqueda('');
    setFuncionario(null);
    setFAfiliacion('');
    setObsFuncionario('');
    setHistorialLicencias([]);
    setRentas3Meses([]);
    setCorreoRecepcion('');
    setCorreoRechazo('');
  };

  const exportarHistorialExcel = () => {
    if (historialLicencias.length === 0) return;
    const rows = historialLicencias.map(l => ({
      'N° Licencia': l.NumeroLicencia,
      'RUT': funcionario ? `${funcionario.Rut}-${funcionario.DV}` : '',
      'Funcionario': funcionario?.NombreCompleto || '',
      'Desde': formatDateDDMMYYYY(l.Desde),
      'Hasta': formatDateDDMMYYYY(l.Hasta),
      'Días Lic.': l.NumDias,
      'Días Aut.': l.DiasAutorizados,
      'Recepción': formatDateDDMMYYYY(l.Recepcion),
      'Modalidad': l.PagoDirecto,
      'Tipo Enferm.': l.Tipo_enferm,
      'Tipo Lic.': l.TipoLic,
      'Pago Estimado': l.PagoEstimado,
      'Días Pagados': l.NumDiasPagados,
      'Días por Cobrar': l.DiasCobrar,
      'Cant. Pagos': l.CantidadPagos || 0,
      'Total Pagado ($)': l.TotalPagado,
      'Rechazada': l.Rechazo ? 'SI' : 'NO',
      'Retenida': l.Retenida ? 'SI' : 'NO',
      'Observación': l.Observacion,
      'Obs. Apelación': l.Obser_apelacion,
      'Obs. Mutual': l.ObservMutual
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Licencias_Funcionario');
    XLSX.writeFile(wb, `Licencias_${funcionario?.Rut || 'Funcionario'}.xlsx`);
  };

  const opcionesTipoLic = modo === 'mutual'
    ? ['Electronica', 'Manual', '']
    : ['Electronica', 'Manual', 'Oden Reposo', ''];

  const opcionesPagoDirecto = modo === 'mutual'
    ? ['Mutual', 'Normal', 'ACHS', 'ACHS OR', 'Nula']
    : ['Normal', 'Pago Directo', 'Mutual', 'ACHS', 'ACHS OR', 'Otra', 'PPP', 'Nula'];

  const opcionesTipoEnferm = modo === 'mutual'
    ? ['Accidente Trabajo', 'Accidente Trayecto', 'Enferm. Prof.']
    : ['Enferm. Comun', 'Maternal', 'Hijo Menor de 1 año', 'Accidente Trabajo', 'Medicina Prev.', 'Enferm. Prof.', 'Patologia Embarazo'];

  return (
    <div className="space-y-6 pb-10">
      {/* Encabezado */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#016098]">
            {modo === 'mutual'
              ? 'Dep. Prevención de Riesgos — Ingreso de Licencias Mutual / Accidentes'
              : 'Mantención Operativa — Ingreso y Gestión de Licencias Médicas'}
          </h1>
          <p className="text-xs text-[#64748b] mt-1">
            {modo === 'mutual'
              ? 'Registro y seguimiento de licencias por accidente del trabajo, trayecto y enfermedad profesional'
              : 'Registro, edición, cálculo de subsidio estimado, observaciones y notificación por correo electrónico'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={limpiarTodo}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#cbd5e1] text-[#475569] hover:bg-[#f1f5f9] transition-colors"
          >
            Limpiar Pantalla
          </button>
        </div>
      </div>

      {/* Barra de Notificación */}
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

      {/* SECCIÓN 1: Búsqueda y Ficha del Funcionario */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5">
        <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider mb-4 border-b border-[#f1f5f9] pb-2">
          1. Identificación del Funcionario y Búsqueda Rápida
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Buscar por RUT */}
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              RUT Funcionario (sin puntos ni dígito verificador)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rutBusqueda}
                onChange={e => setRutBusqueda(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarFuncionario()}
                placeholder="Ej: 12345678"
                className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098]"
              />
              <button
                onClick={() => buscarFuncionario()}
                disabled={cargando}
                className="px-4 py-2 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78] transition-colors shrink-0"
              >
                Buscar RUT
              </button>
            </div>
          </div>

          {/* Buscar por N° Licencia */}
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              N° Licencia Médica (Enter o Buscar para cargar existente)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={numeroLicencia}
                onChange={e => setNumeroLicencia(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarLicenciaPorNumero()}
                placeholder="Ej: 3-10982341"
                className="w-full px-3 py-2 text-sm border border-[#cbd5e1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098] font-semibold"
              />
              <button
                onClick={() => buscarLicenciaPorNumero()}
                disabled={cargando}
                className="px-4 py-2 bg-[#39BABD] text-white text-xs font-semibold rounded-lg hover:bg-[#2da1a4] transition-colors shrink-0"
              >
                Cargar N° Lic.
              </button>
            </div>
          </div>

          {/* Estado de la Licencia en Edición */}
          <div className="md:col-span-4 flex items-center justify-end">
            {numeroLicencia && (
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  licenciaExiste
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {licenciaExiste ? `MODO EDICIÓN — Licencia #${numeroLicencia}` : `NUEVO INGRESO — Licencia #${numeroLicencia}`}
              </span>
            )}
          </div>
        </div>

        {/* Datos del Funcionario Cargado */}
        {funcionario && (
          <div className="mt-5 pt-4 border-t border-[#f1f5f9] space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] text-xs">
              <div className="col-span-2">
                <span className="text-[#64748b] block">Nombre Completo</span>
                <span className="font-bold text-[#1e293b] text-sm">
                  {funcionario.NombreCompleto} ({funcionario.Rut}-{funcionario.DV})
                </span>
              </div>
              <div>
                <span className="text-[#64748b] block">Cenco / Sector</span>
                <span className="font-semibold text-[#1e293b]">
                  {funcionario.Cenco} — {funcionario.Sector || 'N/I'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-[#64748b] block">Establecimiento / Unidad</span>
                <span className="font-semibold text-[#016098]">{funcionario.Unidad || 'Sin Unidad'}</span>
              </div>
              <div>
                <span className="text-[#64748b] block">Cargo / Planta</span>
                <span className="font-semibold text-[#1e293b]">{funcionario.Planta || 'N/I'}</span>
              </div>

              <div>
                <span className="text-[#64748b] block">Tipo Contrato</span>
                <span className="font-semibold text-[#1e293b]">{funcionario.TipoContrato || 'N/I'}</span>
              </div>
              <div>
                <span className="text-[#64748b] block">Inicio / Término</span>
                <span className="font-semibold text-[#1e293b]">
                  {funcionario.FechaInicio || '-'} / {funcionario.FechaTermino || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#64748b] block">Salud (Isapre/Fonasa)</span>
                <span className="font-semibold text-[#1e293b]">{funcionario.Salud || 'N/I'}</span>
              </div>
              <div>
                <span className="text-[#64748b] block">Previsión (AFP)</span>
                <span className="font-semibold text-[#1e293b]">{funcionario.Prevision || 'N/I'}</span>
              </div>
              <div>
                <span className="text-[#64748b] block">Días Trabajados</span>
                <span className="font-semibold text-[#1e293b]">{funcionario.DiasTrabajados || '0'}</span>
              </div>
              <div>
                <span className="text-[#64748b] block">Seg. Cesantía (Emp/Empl)</span>
                <span className="font-semibold text-[#1e293b]">
                  {funcionario.CesantiaEmpleado || 'N'} / {funcionario.CesantiaEmpleador || 'N'}
                </span>
              </div>
            </div>

            {/* Afiliación y Observación Permanente del Funcionario */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Fecha Afiliación AFP/Salud (`LIC_FUNCIONARIO`)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fAfiliacion}
                    onChange={e => setFAfiliacion(e.target.value)}
                    placeholder="dd-mm-aaaa"
                    className="w-full px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg"
                  />
                  <button
                    onClick={guardarAfiliacion}
                    className="px-3 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 shrink-0"
                  >
                    Guardar Afil.
                  </button>
                </div>
              </div>

              <div className="md:col-span-8">
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  Observación Permanente del Funcionario (`LIC_OBSERVACIONES`)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={obsFuncionario}
                    onChange={e => setObsFuncionario(e.target.value)}
                    placeholder="Observación histórica asociada al RUT del funcionario..."
                    className="w-full px-3 py-1.5 text-xs border border-[#cbd5e1] rounded-lg"
                  />
                  <button
                    onClick={guardarObservacionFuncionario}
                    className="px-3 py-1.5 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78] shrink-0"
                  >
                    Guardar Obs. Funcionario
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Formulario Principal de la Licencia y Cálculo de Renta */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda (7 cols): Datos de la Licencia, Médico, Checkboxes y Observaciones */}
        <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-5">
          <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
            2. Datos de la Licencia Médica
          </h2>

          {/* Clasificación */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Formato / Tipo Lic.</label>
              <select
                value={tipoLic}
                onChange={e => setTipoLic(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
              >
                {opcionesTipoLic.map(op => (
                  <option key={op} value={op}>
                    {op || '(Sin especificar)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Concepto / Modalidad</label>
              <select
                value={pagoDirecto}
                onChange={e => setPagoDirecto(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white font-semibold text-[#016098]"
              >
                {opcionesPagoDirecto.map(op => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Tipo Enfermedad / Siniestro</label>
              <select
                value={tipoEnferm}
                onChange={e => handleTipoEnfermChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-white"
              >
                {opcionesTipoEnferm.map(op => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fechas y Días */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Desde</label>
              <input
                type="date"
                value={desde}
                onChange={e => handleDesdeChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">N° Días Licencia</label>
              <input
                type="number"
                value={numDias}
                onChange={e => handleNumDiasChange(e.target.value)}
                placeholder="Ej: 15"
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-bold text-[#016098]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Hasta (Auto)</label>
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg bg-[#f8fafc]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Días Autorizados</label>
              <input
                type="number"
                value={diasAutorizados}
                onChange={e => handleDiasAutorizadosChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Recepción</label>
              <input
                type="date"
                value={recepcion}
                onChange={e => setRecepcion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Fecha Remisión</label>
              <input
                type="date"
                value={remision}
                onChange={e => setRemision(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>
          </div>

          {/* Médico Tratante */}
          <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0]">
            <span className="block text-xs font-bold text-[#475569] mb-2">Profesional / Médico Tratante</span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[11px] text-[#64748b] mb-1">RUT Médico</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={rutMedico}
                    onChange={e => setRutMedico(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarMedico()}
                    placeholder="Ej: 10234567-8"
                    className="w-full px-2.5 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                  />
                  <button
                    type="button"
                    onClick={buscarMedico}
                    className="px-2.5 py-1.5 bg-[#016098] text-white text-xs rounded-lg hover:bg-[#014b78]"
                    title="Buscar Médico"
                  >
                    🔍
                  </button>
                </div>
              </div>
              <div className="sm:col-span-6">
                <label className="block text-[11px] text-[#64748b] mb-1">Nombre Profesional</label>
                <input
                  type="text"
                  value={nombreMedico}
                  onChange={e => setNombreMedico(e.target.value)}
                  placeholder="Nombre completo del médico..."
                  className="w-full px-2.5 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={guardarMedico}
                  className="w-full py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                >
                  Guardar Méd.
                </button>
              </div>
            </div>
          </div>

          {/* Checkboxes de Estado */}
          <div>
            <span className="block text-xs font-bold text-[#475569] mb-2">Indicadores y Estado de Resolución</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0] text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={maternal} onChange={e => setMaternal(e.target.checked)} className="rounded" />
                <span>Maternal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-rose-700 font-semibold">
                <input type="checkbox" checked={rechazo} onChange={e => handleRechazoChange(e.target.checked)} className="rounded" />
                <span>Rechazada</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-amber-700 font-semibold">
                <input type="checkbox" checked={regularizado} onChange={e => setRegularizado(e.target.checked)} className="rounded" />
                <span>Reducción Días</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={retenida} onChange={e => setRetenida(e.target.checked)} className="rounded" />
                <span>Retenida</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={descuentoCheck} onChange={e => setDescuentoCheck(e.target.checked)} className="rounded" />
                <span>Aplica Descuento</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-emerald-700 font-semibold">
                <input type="checkbox" checked={autorizada} onChange={e => setAutorizada(e.target.checked)} className="rounded" />
                <span>Autorizada</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pendiente} onChange={e => setPendiente(e.target.checked)} className="rounded" />
                <span>Pendiente</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={parcial} onChange={e => setParcial(e.target.checked)} className="rounded" />
                <span>Reposo Parcial</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={apelacion} onChange={e => setApelacion(e.target.checked)} className="rounded" />
                <span>En Apelación</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={compin} onChange={e => setCompin(e.target.checked)} className="rounded" />
                <span>COMPIN</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={suseso} onChange={e => setSuseso(e.target.checked)} className="rounded" />
                <span>SUSESO</span>
              </label>
            </div>
          </div>

          {/* Panel Condicional: Jornada Parcial o Tipo de Alta ACHS */}
          {pagoDirecto === 'ACHS OR' ? (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs">
              <span className="font-bold text-amber-900 block mb-2">Tipo de Alta ACHS (Orden de Reposo)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { code: 'ADF', label: 'Alta Diferida (ADF)' },
                  { code: 'ADI', label: 'Alta en el Día (ADI)' },
                  { code: 'AIN', label: 'Alta Inmediata (AIN)' },
                  { code: 'TAD', label: 'Término Rep. Admin. (TAD)' },
                  { code: 'TIN', label: 'Término Rep. Inasist. (TIN)' }
                ].map(item => (
                  <label key={item.code} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="altaAchs"
                      checked={altaAchs === item.code}
                      onChange={() => setAltaAchs(item.code)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            parcial && (
              <div className="bg-sky-50 border border-sky-200 p-3.5 rounded-xl text-xs">
                <span className="font-bold text-sky-900 block mb-2">Jornada de Parcialidad</span>
                <div className="flex gap-6">
                  {[
                    { code: 'M', label: 'Mañana' },
                    { code: 'T', label: 'Tarde' },
                    { code: 'N', label: 'Noche' }
                  ].map(j => (
                    <label key={j.code} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="jornadaParcial"
                        checked={jornadaParcial === j.code}
                        onChange={() => setJornadaParcial(j.code)}
                      />
                      <span>{j.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Observaciones de la Licencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Observación General Licencia</label>
              <textarea
                rows={2}
                value={observacion}
                onChange={e => setObservacion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                placeholder="Observaciones internas de la licencia..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">
                Observación Apelación / Causa Rechazo
              </label>
              <textarea
                rows={2}
                value={obserApelacion}
                onChange={e => setObserApelacion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                placeholder="Detalle resolución, motivo rechazo o apelación..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Observación Caja Los Andes</label>
              <input
                type="text"
                value={observacionCajaLA}
                onChange={e => setObservacionCajaLA(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">
                Observación Mutual / Prevención (`observ_mutual`)
              </label>
              <input
                type="text"
                value={observMutual}
                onChange={e => setObservMutual(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
              />
            </div>
          </div>

          {/* Botones Principales de Acción */}
          <div className="pt-3 border-t border-[#f1f5f9] flex flex-wrap gap-3">
            <button
              onClick={guardarLicencia}
              disabled={cargando}
              className="px-5 py-2.5 bg-[#016098] text-white text-xs font-bold rounded-lg hover:bg-[#014b78] transition-colors shadow-sm"
            >
              {licenciaExiste ? 'Guardar Modificaciones de Licencia' : 'Ingresar Nueva Licencia'}
            </button>

            {licenciaExiste && (
              <button
                onClick={eliminarLicencia}
                disabled={cargando}
                className="px-4 py-2.5 bg-[#EB567F] text-white text-xs font-bold rounded-lg hover:bg-[#d6416a] transition-colors shadow-sm"
              >
                Eliminar Licencia
              </button>
            )}

            <button
              onClick={limpiarFormularioLicencia}
              className="px-4 py-2.5 border border-[#cbd5e1] text-[#475569] text-xs font-semibold rounded-lg hover:bg-[#f1f5f9]"
            >
              Nueva Licencia (Mismo Funcionario)
            </button>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Rentas 3 Meses, Subsidio Estimado y Envío de Correos */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjeta de Cálculo de Subsidio y Renta Imponible */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
              3. Base de Cálculo (3 Meses) y Pago Estimado
            </h2>

            {/* Recalcular por Fecha Concesión (Button4 en VB.NET) */}
            <div className="flex items-end gap-2 bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                  Fecha Concesión / Base Alternativa de Renta
                </label>
                <input
                  type="date"
                  value={fechaConcesion}
                  onChange={e => setFechaConcesion(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-[#cbd5e1] rounded-lg bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  funcionario?.Rut &&
                  ejecutarCalculoEstimado(funcionario.Rut, fechaConcesion, numDias, diasAutorizados || numDias)
                }
                className="px-3 py-1.5 bg-[#39BABD] text-white text-xs font-semibold rounded-lg hover:bg-[#2da1a4]"
              >
                Recalcular por Concesión
              </button>
            </div>

            {/* Tabla 3 Meses Renta */}
            <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#475569] font-semibold">
                  <tr>
                    <th className="p-2">Período</th>
                    <th className="p-2 text-right">Imponible</th>
                    <th className="p-2 text-right">Prev.</th>
                    <th className="p-2 text-right">Salud</th>
                    <th className="p-2 text-right">Imp. Único</th>
                    <th className="p-2 text-right">Monto Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {rentas3Meses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-3 text-center text-[#94a3b8]">
                        Sin registros de renta para los 3 meses previos
                      </td>
                    </tr>
                  ) : (
                    rentas3Meses.map((r, idx) => (
                      <tr key={idx} className="hover:bg-[#f8fafc]">
                        <td className="p-2 font-semibold">
                          {r.Mes}/{r.Anio}
                        </td>
                        <td className="p-2 text-right">${Number(r.MontoImponible).toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right">${Number(r.descPrevision).toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right">${Number(r.descSalud).toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right">${Number(r.impuestoUnico).toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right font-semibold text-[#016098]">
                          ${Number(r.montoNeto).toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumen de Montos Calculados */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
                <label className="block text-[11px] text-[#64748b]">Monto Neto Promedio ($)</label>
                <input
                  type="number"
                  value={montoNetoPromedio}
                  onChange={e => setMontoNetoPromedio(Number(e.target.value))}
                  className="w-full mt-1 px-2 py-1 text-sm font-bold text-[#1e293b] border border-[#cbd5e1] rounded bg-white"
                />
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
                <label className="block text-[11px] text-[#64748b]">Subsidio Diario ($)</label>
                <input
                  type="number"
                  value={subsidioDiario}
                  onChange={e => setSubsidioDiario(Number(e.target.value))}
                  className="w-full mt-1 px-2 py-1 text-sm font-bold text-[#1e293b] border border-[#cbd5e1] rounded bg-white"
                />
              </div>
              <div className="bg-sky-50 p-3 rounded-xl border border-sky-200">
                <label className="block text-[11px] font-semibold text-[#016098]">Pago Estimado Total ($)</label>
                <input
                  type="number"
                  value={pagoEstimado}
                  onChange={e => setPagoEstimado(Number(e.target.value))}
                  className="w-full mt-1 px-2 py-1 text-sm font-bold text-[#016098] border border-sky-300 rounded bg-white"
                />
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                <label className="block text-[11px] font-semibold text-rose-800">Monto Descuento ($)</label>
                <input
                  type="number"
                  value={montoDesc}
                  onChange={e => setMontoDesc(Number(e.target.value))}
                  className="w-full mt-1 px-2 py-1 text-sm font-bold text-rose-800 border border-rose-300 rounded bg-white"
                />
              </div>
            </div>
          </div>

          {/* Tarjeta de Envío de Correos Automáticos */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider border-b border-[#f1f5f9] pb-2">
              4. Notificaciones por Correo Electrónico (`licenciasmedicas@cmds.cl`)
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">
                Aviso de Recepción de Licencia (Correo Establecimiento / Director)
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={correoRecepcion}
                  onChange={e => setCorreoRecepcion(e.target.value)}
                  placeholder="director@cmds.cl"
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={enviarCorreoRecepcion}
                  disabled={enviandoCorreo}
                  className="px-3.5 py-2 bg-[#016098] text-white text-xs font-semibold rounded-lg hover:bg-[#014b78] shrink-0"
                >
                  Enviar Recepción
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">
                Aviso de Rechazo / Reducción de Licencia
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={correoRechazo}
                  onChange={e => setCorreoRechazo(e.target.value)}
                  placeholder="director@cmds.cl"
                  className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={enviarCorreoRechazo}
                  disabled={enviandoCorreo}
                  className="px-3.5 py-2 bg-[#EB567F] text-white text-xs font-semibold rounded-lg hover:bg-[#d6416a] shrink-0"
                >
                  Enviar Rechazo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: Historial de Licencias del Funcionario */}
      <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#016098] uppercase tracking-wider">
              5. Historial de Licencias del Funcionario — Detalle de Licencias ({historialLicencias.length})
            </h2>
            <p className="text-xs text-[#64748b]">
              Haga clic en cualquier fila para cargar la licencia en el formulario superior, editarla y ver el desglose de sus pagos
            </p>
          </div>
          {historialLicencias.length > 0 && (
            <button
              onClick={exportarHistorialExcel}
              className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Exportar Historial a Excel
            </button>
          )}
        </div>

        {/* Desglose de pagos individuales en LIC_DETALLE_PAGO_ACTUAL cuando la licencia seleccionada registra movimientos */}
        {numeroLicencia && detallePagosLic.length > 0 && (
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-900">
                Pagos Registrados para Licencia N° {numeroLicencia} en <code className="font-mono">LIC_DETALLE_PAGO_ACTUAL</code> ({detallePagosLic.length}{' '}
                {detallePagosLic.length === 1 ? 'movimiento' : 'movimientos'})
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                Total Pagado: $
                {detallePagosLic.reduce((acc, p) => acc + Number(p.Monto || 0), 0).toLocaleString('es-CL')}
              </span>
            </div>
            <div className="overflow-x-auto border border-emerald-200 rounded-lg bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-emerald-100/70 text-emerald-950 font-semibold">
                  <tr>
                    <th className="p-2">N° Documento / Cheque</th>
                    <th className="p-2">Banco</th>
                    <th className="p-2">Fecha Depósito</th>
                    <th className="p-2">Concepto</th>
                    <th className="p-2 text-center">Días Pag.</th>
                    <th className="p-2">Desde</th>
                    <th className="p-2">Hasta</th>
                    <th className="p-2 text-right">Monto ($)</th>
                    <th className="p-2">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {detallePagosLic.map(p => (
                    <tr key={p.Correlativo} className="hover:bg-emerald-50/40">
                      <td className="p-2 font-semibold text-[#016098]">{p.NumeroDocumento || '-'}</td>
                      <td className="p-2">{p.Banco || '-'}</td>
                      <td className="p-2">{formatDateDDMMYYYY(p.FechaDepCtaCte)}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-semibold">
                          {p.Concepto || 'Subsidio'}
                        </span>
                      </td>
                      <td className="p-2 text-center font-semibold">{p.DiasPagados}</td>
                      <td className="p-2">{formatDateDDMMYYYY(p.Desde)}</td>
                      <td className="p-2">{formatDateDDMMYYYY(p.Hasta)}</td>
                      <td className="p-2 text-right font-bold text-emerald-700">
                        ${Number(p.Monto || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="p-2 text-[#475569]">{p.Observacion || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl max-h-[380px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f1f5f9] text-[#475569] font-semibold sticky top-0">
              <tr>
                <th className="p-2.5">N° Licencia</th>
                <th className="p-2.5">Desde</th>
                <th className="p-2.5">Hasta</th>
                <th className="p-2.5 text-center">Días</th>
                <th className="p-2.5 text-center">Aut.</th>
                <th className="p-2.5">Modalidad</th>
                <th className="p-2.5">Tipo Enferm.</th>
                <th className="p-2.5 text-right">Pago Estimado</th>
                <th className="p-2.5 text-center">Días Pag.</th>
                <th className="p-2.5 text-right">Total Pagado</th>
                <th className="p-2.5 text-center">Estado</th>
                <th className="p-2.5">Observación / Apelación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {historialLicencias.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-[#94a3b8]">
                    Busque un funcionario por RUT para visualizar su historial de licencias médicas
                  </td>
                </tr>
              ) : (
                historialLicencias.map(lic => {
                  const seleccionada = lic.NumeroLicencia === numeroLicencia;
                  return (
                    <tr
                      key={lic.NumeroLicencia}
                      onClick={() => buscarLicenciaPorNumero(lic.NumeroLicencia)}
                      className={`cursor-pointer transition-colors ${
                        seleccionada ? 'bg-sky-50 font-semibold' : 'hover:bg-[#f8fafc]'
                      }`}
                    >
                      <td className="p-2.5 font-bold text-[#016098]">{lic.NumeroLicencia}</td>
                      <td className="p-2.5">{formatDateDDMMYYYY(lic.Desde)}</td>
                      <td className="p-2.5">{formatDateDDMMYYYY(lic.Hasta)}</td>
                      <td className="p-2.5 text-center">{lic.NumDias}</td>
                      <td className="p-2.5 text-center">{lic.DiasAutorizados}</td>
                      <td className="p-2.5">{lic.PagoDirecto}</td>
                      <td className="p-2.5">{lic.Tipo_enferm}</td>
                      <td className="p-2.5 text-right">${Number(lic.PagoEstimado || 0).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 text-center">{lic.NumDiasPagados}</td>
                      <td className="p-2.5 text-right font-semibold text-emerald-700">
                        <div>${Number(lic.TotalPagado || 0).toLocaleString('es-CL')}</div>
                        {Number(lic.CantidadPagos || 0) > 0 && (
                          <span className="inline-block text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            {lic.CantidadPagos} {lic.CantidadPagos === 1 ? 'pago' : 'pagos'}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {lic.Rechazo ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            RECHAZADA
                          </span>
                        ) : lic.Retenida ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            RETENIDA
                          </span>
                        ) : String(lic.Autorizada).toLowerCase() === 'true' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            AUTORIZADA
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            NORMAL
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 truncate max-w-[220px]" title={lic.Obser_apelacion || lic.Observacion}>
                        {lic.Obser_apelacion || lic.Observacion || lic.ObservMutual || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
