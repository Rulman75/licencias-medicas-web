import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAppVersion } from '../version';

export default function Layout() {
  const { display: versionDisplay, tooltip: versionTooltip } = useAppVersion();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuMantencionOpen, setMenuMantencionOpen] = useState(false);
  const [menuPagosMasivosOpen, setMenuPagosMasivosOpen] = useState(false);
  const [menuPrevencionOpen, setMenuPrevencionOpen] = useState(false);
  const [menuCertificadosOpen, setMenuCertificadosOpen] = useState(false);
  const [menuInformesLegacyOpen, setMenuInformesLegacyOpen] = useState(false);
  const [menuLicenciasOpen, setMenuLicenciasOpen] = useState(false);
  const [menuReposoOpen, setMenuReposoOpen] = useState(false);
  const [menuPagoDirectoOpen, setMenuPagoDirectoOpen] = useState(false);
  const [menuInfoGestionOpen, setMenuInfoGestionOpen] = useState(false);
  const [userData, setUserData] = useState({ username: '', unidad: '', tipo: 'A' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const tipoUser = (payload.tipo || 'A').trim().toUpperCase();
        setUserData({
          username: payload.username || '',
          unidad: payload.unidad || '',
          tipo: tipoUser
        });
      } catch (e) {
        console.error('Error decoding token');
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  // Permisos por Rol (tabla Usuarios):
  // 'A': Administrador / RRHH Licencias (Acceso Total a sistema migrado + estadísticas web)
  // 'G': Gestión / Estadísticas Web (Solo ve los módulos previos a esta migración: Inicio, Licencias Convenio, P. Dir, Orden de Reposo e Info. Gestión)
  // 'M': Prevención de Riesgos / Mutual
  // 'U' / 'P': Consulta Funcionario / BRP
  const esAdmin = userData.tipo === 'A' || !['G', 'M', 'U', 'P'].includes(userData.tipo);
  const esGestionAnterior = userData.tipo === 'G';

  const puedeVerMantencion = esAdmin;
  const puedeVerCertificadosEInformesMigrados = !esGestionAnterior;
  const puedeCargarReposo = esAdmin || esGestionAnterior;

  // Flag para módulos ocultos temporalmente a solicitud del usuario:
  // (Dep. Prevención - Ingreso Licencia Mutual, Informe Licencias BRP, Captura Softland)
  const MOSTRAR_MODULOS_OCULTOS = false;
  const puedeVerPrevencion = MOSTRAR_MODULOS_OCULTOS && (esAdmin || userData.tipo === 'M');
  const puedeVerBRP = MOSTRAR_MODULOS_OCULTOS && (esAdmin || userData.tipo === 'P');

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f4f7f6] font-sans text-[#1e293b] print:bg-white print:h-auto">
      {/* Sidebar Corporativo CMDS (Idéntico a Sistema de Archivo) */}
      <aside className="w-full md:w-[265px] bg-[#016098] text-white shrink-0 shadow-lg flex flex-col justify-between print:hidden">
        <div className="p-4 overflow-y-auto max-h-[calc(100vh-76px)] custom-scrollbar">
          {/* Logo / Header del Sidebar */}
          <div className="flex flex-col items-center pb-5 mb-5 border-b border-white/20 text-center">
            <img
              src="/logo.png"
              alt="Logo CMDS"
              className="max-w-[90px] h-auto mb-2.5 bg-white p-2 rounded-lg shadow-md"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h4 className="text-[1.05rem] font-bold tracking-wide m-0 leading-tight">
              Sistema de Licencias Médicas
            </h4>
            <p className="text-[0.72rem] text-blue-200 mt-0.5">
              Gestión, Subsidios y Control CMDS
            </p>
            <span
              title={versionTooltip}
              className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-blue-100 border border-white/15 tracking-wider"
            >
              Versión {versionDisplay}
            </span>

            {userData.username && (
              <div className="mt-3 bg-[#024a8d] px-3 py-1.5 rounded-full text-xs font-medium text-blue-100 flex items-center gap-1.5 border border-white/10 shadow-inner">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                <span className="truncate max-w-[130px]">{userData.username}</span>
                <span className="text-[10px] bg-blue-800 px-1.5 py-0.5 rounded text-blue-200 uppercase">
                  {userData.tipo}
                </span>
              </div>
            )}
          </div>

          {/* Navegación */}
          <nav className="space-y-1 text-sm">
            {/* 1. Inicio */}
            <Link
              to="/inicio"
              className={`flex items-center gap-2.5 py-2.5 px-3 rounded-lg transition-colors font-semibold ${
                isActive('/inicio') ? 'bg-[#39BABD] text-white shadow-sm' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              <span>Inicio (Dashboard)</span>
            </Link>

            {/* Mantención Operativa (Fase 1) */}
            {puedeVerMantencion && (
              <div className="pt-1">
                <button
                  onClick={() => setMenuMantencionOpen(!menuMantencionOpen)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>Mantención Operativa</span>
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${menuMantencionOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuMantencionOpen && (
                  <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                    <Link
                      to="/mantencion/licencias"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/mantencion/licencias')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Ingreso Licencias Médicas
                    </Link>
                    <Link
                      to="/mantencion/pagos"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/mantencion/pagos')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Ingreso Pagos y Transferencias
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Pagos Masivos (Fase 2) */}
            {puedeVerMantencion && (
              <div className="pt-1">
                <button
                  onClick={() => setMenuPagosMasivosOpen(!menuPagosMasivosOpen)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>Pagos Masivos</span>
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${menuPagosMasivosOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuPagosMasivosOpen && (
                  <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                    <Link
                      to="/pagos-masivos/importar"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/pagos-masivos/importar')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Importar Pagos Masivos
                    </Link>
                    <Link
                      to="/pagos-masivos/auditar"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/pagos-masivos/auditar')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Auditar Pagos Masivos
                    </Link>
                    <Link
                      to="/pagos-masivos/eliminar"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/pagos-masivos/eliminar')
                          ? 'bg-[#EB567F] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Eliminar Pago Masivo
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Dep. Prevención / Mutual (Oculto temporalmente a solicitud del usuario) */}
            {puedeVerPrevencion && (
              <div className="pt-1">
                <button
                  onClick={() => setMenuPrevencionOpen(!menuPrevencionOpen)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    <span>Dep. Prevención</span>
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${menuPrevencionOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuPrevencionOpen && (
                  <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                    <Link
                      to="/prevencion/licencias-mutual"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/prevencion/licencias-mutual')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Ingreso Licencias Mutual
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Certificados y Nóminas (Fase 3) - No visible para Perfil 'G' */}
            {puedeVerCertificadosEInformesMigrados && (
              <div className="pt-1">
                <button
                  onClick={() => setMenuCertificadosOpen(!menuCertificadosOpen)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    <span>Certificados y Nóminas</span>
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${menuCertificadosOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuCertificadosOpen && (
                  <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                    <Link
                      to="/certificados/licencia"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/certificados/licencia')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Certificado de Licencia
                    </Link>
                    {esAdmin && (
                      <>
                        <Link
                          to="/certificados/nomina-normal"
                          className={`block py-2 px-3 rounded-md transition-colors ${
                            isActive('/certificados/nomina-normal')
                              ? 'bg-[#39BABD] text-white font-bold'
                              : 'text-blue-100 hover:bg-white/10'
                          }`}
                        >
                          Nómina Correspondencia
                        </Link>
                        <Link
                          to="/certificados/nomina-pago-directo"
                          className={`block py-2 px-3 rounded-md transition-colors ${
                            isActive('/certificados/nomina-pago-directo')
                              ? 'bg-[#39BABD] text-white font-bold'
                              : 'text-blue-100 hover:bg-white/10'
                          }`}
                        >
                          Nómina Pago Directo
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Informes Operativos (Fase 3) - No visible para Perfil 'G' */}
            {puedeVerCertificadosEInformesMigrados && (
              <div className="pt-1">
                <button
                  onClick={() => setMenuInformesLegacyOpen(!menuInformesLegacyOpen)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>Informes Operativos</span>
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${menuInformesLegacyOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuInformesLegacyOpen && (
                  <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                    <Link
                      to="/informes/por-funcionario"
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        isActive('/informes/por-funcionario')
                          ? 'bg-[#39BABD] text-white font-bold'
                          : 'text-blue-100 hover:bg-white/10'
                      }`}
                    >
                      Licencias por Funcionario
                    </Link>
                    {esAdmin && (
                      <Link
                        to="/informes/diarias"
                        className={`block py-2 px-3 rounded-md transition-colors ${
                          isActive('/informes/diarias')
                            ? 'bg-[#39BABD] text-white font-bold'
                            : 'text-blue-100 hover:bg-white/10'
                        }`}
                      >
                        Recepción Diaria Licencias
                      </Link>
                    )}
                    {puedeVerBRP && (
                      <Link
                        to="/informes/brp"
                        className={`block py-2 px-3 rounded-md transition-colors ${
                          isActive('/informes/brp')
                            ? 'bg-[#39BABD] text-white font-bold'
                            : 'text-blue-100 hover:bg-white/10'
                        }`}
                      >
                        Informe Licencias BRP
                      </Link>
                    )}
                    {esAdmin && (
                      <>
                        <Link
                          to="/informes/pago-directo"
                          className={`block py-2 px-3 rounded-md transition-colors ${
                            isActive('/informes/pago-directo')
                              ? 'bg-[#39BABD] text-white font-bold'
                              : 'text-blue-100 hover:bg-white/10'
                          }`}
                        >
                          Pago Directo Mensual
                        </Link>
                        <Link
                          to="/informes/general-pagos"
                          className={`block py-2 px-3 rounded-md transition-colors ${
                            isActive('/informes/general-pagos')
                              ? 'bg-[#39BABD] text-white font-bold'
                              : 'text-blue-100 hover:bg-white/10'
                          }`}
                        >
                          Anual Pagadas / Impagas
                        </Link>
                        {MOSTRAR_MODULOS_OCULTOS && (
                          <Link
                            to="/informes/softland"
                            className={`block py-2 px-3 rounded-md transition-colors ${
                              isActive('/informes/softland')
                                ? 'bg-[#39BABD] text-white font-bold'
                                : 'text-blue-100 hover:bg-white/10'
                            }`}
                          >
                            Captura Softland
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Licencias Médicas Convenio */}
            <div className="pt-1">
              <button
                onClick={() => setMenuLicenciasOpen(!menuLicenciasOpen)}
                className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
              >
                <span className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                    />
                  </svg>
                  <span>Licencias Médicas Convenio</span>
                </span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${menuLicenciasOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuLicenciasOpen && (
                <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                  <Link
                    to="/licencias/estadisticas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/licencias/estadisticas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Estadística Recupero
                  </Link>
                  <Link
                    to="/licencias/otras-estadisticas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/licencias/otras-estadisticas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Otras Estadísticas
                  </Link>
                </div>
              )}
            </div>

            {/* Pago Directo */}
            <div className="pt-1">
              <button
                onClick={() => setMenuPagoDirectoOpen(!menuPagoDirectoOpen)}
                className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
              >
                <span className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Licencias Médicas P. Dir.</span>
                </span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${menuPagoDirectoOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuPagoDirectoOpen && (
                <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                  <Link
                    to="/pago-directo/estadisticas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/pago-directo/estadisticas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Estadísticas
                  </Link>
                </div>
              )}
            </div>

            {/* Orden de Reposo */}
            <div className="pt-1">
              <button
                onClick={() => setMenuReposoOpen(!menuReposoOpen)}
                className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
              >
                <span className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <span>Orden de Reposo</span>
                </span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${menuReposoOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuReposoOpen && (
                <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                  <Link
                    to="/reposo/estadisticas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/reposo/estadisticas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Estadística Recupero
                  </Link>
                  <Link
                    to="/reposo/otras-estadisticas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/reposo/otras-estadisticas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Otras Estadísticas
                  </Link>
                  {puedeCargarReposo && (
                    <>
                      <Link
                        to="/reposo/carga"
                        className={`block py-2 px-3 rounded-md transition-colors ${
                          isActive('/reposo/carga')
                            ? 'bg-[#39BABD] text-white font-bold'
                            : 'text-blue-100 hover:bg-white/10'
                        }`}
                      >
                        Procesar Archivos
                      </Link>
                      <Link
                        to="/reposo/auditoria"
                        className={`block py-2 px-3 rounded-md transition-colors ${
                          isActive('/reposo/auditoria')
                            ? 'bg-[#39BABD] text-white font-bold'
                            : 'text-blue-100 hover:bg-white/10'
                        }`}
                      >
                        Auditoría de Cargas
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Info Gestión */}
            <div className="pt-1">
              <button
                onClick={() => setMenuInfoGestionOpen(!menuInfoGestionOpen)}
                className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-white/90 hover:bg-white/10 transition-colors font-semibold text-left"
              >
                <span className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <span>Info. Gestión</span>
                </span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${menuInfoGestionOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuInfoGestionOpen && (
                <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1 text-xs">
                  <Link
                    to="/info-gestion/funcionarios"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/info-gestion/funcionarios')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Licencia Funcionarios
                  </Link>
                  <Link
                    to="/info-gestion/rechazadas"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/info-gestion/rechazadas')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Gestión Pago Rechazadas
                  </Link>
                  <Link
                    to="/info-gestion/sin-resolucion"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      isActive('/info-gestion/sin-resolucion')
                        ? 'bg-[#39BABD] text-white font-bold'
                        : 'text-blue-100 hover:bg-white/10'
                    }`}
                  >
                    Gestión Pago Sin Resolución
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Botón Cerrar Sesión */}
        <div className="p-4 border-t border-white/15">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#EB567F] hover:bg-[#d6416a] text-white text-xs font-bold shadow transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenedor Principal Derecho */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible">
        <div className="flex-1 overflow-auto p-5 md:p-7 print:p-0 print:overflow-visible">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
