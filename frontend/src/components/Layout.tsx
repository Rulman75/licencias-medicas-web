import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuMantencionOpen, setMenuMantencionOpen] = useState(true);
  const [menuPagosMasivosOpen, setMenuPagosMasivosOpen] = useState(false);
  const [menuPrevencionOpen, setMenuPrevencionOpen] = useState(false);
  const [menuCertificadosOpen, setMenuCertificadosOpen] = useState(true);
  const [menuInformesLegacyOpen, setMenuInformesLegacyOpen] = useState(true);
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
        if (tipoUser === 'M') {
          setMenuPrevencionOpen(true);
        }
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
    <div className="flex h-screen bg-[#f4f7f6] font-sans text-[#1e293b]">
      {/* Sidebar Corporativo */}
      <aside className="w-[265px] bg-white border-r border-[#e2e8f0] flex flex-col shrink-0 print:hidden">
        {/* Logo / Header del Sidebar */}
        <div className="p-6 flex flex-col items-center border-b border-[#e2e8f0]">
          <img src="/logo.png" alt="CMDS Logo" className="w-full max-w-[140px] h-auto object-contain mb-2" />
          <span className="text-[1rem] text-[#64748b] text-center font-semibold leading-tight mt-2">
            Sistema de<br />Licencias Médicas
          </span>

          {userData.username && (
            <div className="flex items-center gap-2 text-xs text-[#016098] bg-[#e0f2fe] px-3 py-1.5 rounded-full mt-4 font-medium uppercase tracking-wide">
              <span className="w-1.5 h-1.5 bg-[#39BABD] rounded-full"></span>
              <span>{userData.username}</span>
              <span className="text-[10px] bg-[#016098] text-white px-1.5 py-0.5 rounded-full font-bold">
                {userData.tipo}
              </span>
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <ul className="space-y-1">
            {/* Inicio */}
            <li>
              <Link
                to="/inicio"
                className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  isActive('/inicio')
                    ? 'bg-[#016098] text-white'
                    : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                }`}
              >
                Inicio
              </Link>
            </li>

            {/* Mantención Operativa (Fase 1) */}
            {puedeVerMantencion && (
              <li className="pt-2">
                <button
                  onClick={() => setMenuMantencionOpen(!menuMantencionOpen)}
                  className={`flex justify-between items-center w-full px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200 ${
                    menuMantencionOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                  }`}
                >
                  <span>Mantención Operativa</span>
                  <span className="text-xs">{menuMantencionOpen ? '▼' : '▶'}</span>
                </button>
                {menuMantencionOpen && (
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>
                      <Link
                        to="/mantencion/licencias"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/mantencion/licencias')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Ingreso Licencias Médicas
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/mantencion/pagos"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/mantencion/pagos')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Ingreso Pagos y Cheques
                      </Link>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Pagos Masivos (Fase 2) */}
            {puedeVerMantencion && (
              <li className="pt-2">
                <button
                  onClick={() => setMenuPagosMasivosOpen(!menuPagosMasivosOpen)}
                  className={`flex justify-between items-center w-full px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200 ${
                    menuPagosMasivosOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                  }`}
                >
                  <span>Pagos Masivos</span>
                  <span className="text-xs">{menuPagosMasivosOpen ? '▼' : '▶'}</span>
                </button>
                {menuPagosMasivosOpen && (
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>
                      <Link
                        to="/pagos-masivos/importar"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/pagos-masivos/importar')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Importar Pagos Masivos
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/pagos-masivos/auditar"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/pagos-masivos/auditar')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Auditar Pagos Masivos
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/pagos-masivos/eliminar"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/pagos-masivos/eliminar')
                            ? 'bg-[#EB567F] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#EB567F]'
                        }`}
                      >
                        Eliminar Pago Masivo
                      </Link>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Dep. Prevención / Mutual (Oculto temporalmente a solicitud del usuario) */}
            {puedeVerPrevencion && (
              <li className="pt-2">
                <button
                  onClick={() => setMenuPrevencionOpen(!menuPrevencionOpen)}
                  className={`flex justify-between items-center w-full px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200 ${
                    menuPrevencionOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                  }`}
                >
                  <span>Dep. Prevención</span>
                  <span className="text-xs">{menuPrevencionOpen ? '▼' : '▶'}</span>
                </button>
                {menuPrevencionOpen && (
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>
                      <Link
                        to="/prevencion/licencias-mutual"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/prevencion/licencias-mutual')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Ingreso Licencias Mutual
                      </Link>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Certificados y Nóminas (Fase 3) - No visible para Perfil 'G' */}
            {puedeVerCertificadosEInformesMigrados && (
              <li className="pt-2">
                <button
                  onClick={() => setMenuCertificadosOpen(!menuCertificadosOpen)}
                  className={`flex justify-between items-center w-full px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200 ${
                    menuCertificadosOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                  }`}
                >
                  <span>Certificados y Nóminas</span>
                  <span className="text-xs">{menuCertificadosOpen ? '▼' : '▶'}</span>
                </button>
                {menuCertificadosOpen && (
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>
                      <Link
                        to="/certificados/licencia"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/certificados/licencia')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Certificado de Licencia
                      </Link>
                    </li>
                    {esAdmin && (
                      <>
                        <li>
                          <Link
                            to="/certificados/nomina-normal"
                            className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                              isActive('/certificados/nomina-normal')
                                ? 'bg-[#016098] text-white'
                                : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                            }`}
                          >
                            Nómina Correspondencia
                          </Link>
                        </li>
                        <li>
                          <Link
                            to="/certificados/nomina-pago-directo"
                            className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                              isActive('/certificados/nomina-pago-directo')
                                ? 'bg-[#016098] text-white'
                                : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                            }`}
                          >
                            Nómina Pago Directo
                          </Link>
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </li>
            )}

            {/* Informes Operativos (Fase 3) - No visible para Perfil 'G' */}
            {puedeVerCertificadosEInformesMigrados && (
              <li className="pt-2">
                <button
                  onClick={() => setMenuInformesLegacyOpen(!menuInformesLegacyOpen)}
                  className={`flex justify-between items-center w-full px-4 py-3 text-sm font-bold rounded-lg transition-colors duration-200 ${
                    menuInformesLegacyOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                  }`}
                >
                  <span>Informes Operativos</span>
                  <span className="text-xs">{menuInformesLegacyOpen ? '▼' : '▶'}</span>
                </button>
                {menuInformesLegacyOpen && (
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>
                      <Link
                        to="/informes/por-funcionario"
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          isActive('/informes/por-funcionario')
                            ? 'bg-[#016098] text-white'
                            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                        }`}
                      >
                        Ficha y Deuda Funcionario
                      </Link>
                    </li>
                    {esAdmin && (
                      <li>
                        <Link
                          to="/informes/diarias"
                          className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                            isActive('/informes/diarias')
                              ? 'bg-[#016098] text-white'
                              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                          }`}
                        >
                          Recepción Diaria Licencias
                        </Link>
                      </li>
                    )}
                    {puedeVerBRP && (
                      <li>
                        <Link
                          to="/informes/brp"
                          className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                            isActive('/informes/brp')
                              ? 'bg-[#016098] text-white'
                              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                          }`}
                        >
                          Informe Licencias BRP
                        </Link>
                      </li>
                    )}
                    {esAdmin && (
                      <>
                        <li>
                          <Link
                            to="/informes/pago-directo"
                            className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                              isActive('/informes/pago-directo')
                                ? 'bg-[#016098] text-white'
                                : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                            }`}
                          >
                            Pago Directo Mensual
                          </Link>
                        </li>
                        <li>
                          <Link
                            to="/informes/general-pagos"
                            className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                              isActive('/informes/general-pagos')
                                ? 'bg-[#016098] text-white'
                                : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                            }`}
                          >
                            Anual Pagadas / Impagas
                          </Link>
                        </li>
                        {MOSTRAR_MODULOS_OCULTOS && (
                          <li>
                            <Link
                              to="/informes/softland"
                              className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                                isActive('/informes/softland')
                                  ? 'bg-[#39BABD] text-white'
                                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                              }`}
                            >
                              Captura Softland
                            </Link>
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                )}
              </li>
            )}

            {/* Licencias Médicas Convenio */}
            <li className="pt-2">
              <button
                onClick={() => setMenuLicenciasOpen(!menuLicenciasOpen)}
                className={`flex justify-between items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  menuLicenciasOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                }`}
              >
                <span>Licencias Médicas Convenio</span>
                <span className="text-xs">{menuLicenciasOpen ? '▼' : '▶'}</span>
              </button>
              {menuLicenciasOpen && (
                <ul className="mt-1 space-y-1 pl-4">
                  <li>
                    <Link
                      to="/licencias/estadisticas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/licencias/estadisticas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Estadistica Recupero
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/licencias/otras-estadisticas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/licencias/otras-estadisticas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Otras Estadisticas
                    </Link>
                  </li>
                </ul>
              )}
            </li>

            {/* Pago Directo */}
            <li className="pt-2">
              <button
                onClick={() => setMenuPagoDirectoOpen(!menuPagoDirectoOpen)}
                className={`flex justify-between items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  menuPagoDirectoOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                }`}
              >
                <span>Licencias Medicas P. Dir.</span>
                <span className="text-xs">{menuPagoDirectoOpen ? '▼' : '▶'}</span>
              </button>
              {menuPagoDirectoOpen && (
                <ul className="mt-1 space-y-1 pl-4">
                  <li>
                    <Link
                      to="/pago-directo/estadisticas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/pago-directo/estadisticas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Estadisticas
                    </Link>
                  </li>
                </ul>
              )}
            </li>

            {/* Orden de Reposo */}
            <li className="pt-2">
              <button
                onClick={() => setMenuReposoOpen(!menuReposoOpen)}
                className={`flex justify-between items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  menuReposoOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                }`}
              >
                <span>Orden de Reposo</span>
                <span className="text-xs">{menuReposoOpen ? '▼' : '▶'}</span>
              </button>
              {menuReposoOpen && (
                <ul className="mt-1 space-y-1 pl-4">
                  <li>
                    <Link
                      to="/reposo/estadisticas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/reposo/estadisticas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Estadistica Recupero
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/reposo/otras-estadisticas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/reposo/otras-estadisticas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Otras Estadisticas
                    </Link>
                  </li>
                  {puedeCargarReposo && (
                    <>
                      <li>
                        <Link
                          to="/reposo/carga"
                          className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                            isActive('/reposo/carga')
                              ? 'bg-[#016098] text-white'
                              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                          }`}
                        >
                          Procesar Archivos
                        </Link>
                      </li>
                      <li>
                        <Link
                          to="/reposo/auditoria"
                          className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                            isActive('/reposo/auditoria')
                              ? 'bg-[#016098] text-white'
                              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                          }`}
                        >
                          Auditoría de Cargas
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </li>

            {/* Info Gestión */}
            <li className="pt-2">
              <button
                onClick={() => setMenuInfoGestionOpen(!menuInfoGestionOpen)}
                className={`flex justify-between items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  menuInfoGestionOpen ? 'text-[#016098]' : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                }`}
              >
                <span>Info. Gestión</span>
                <span className="text-xs">{menuInfoGestionOpen ? '▼' : '▶'}</span>
              </button>
              {menuInfoGestionOpen && (
                <ul className="mt-1 space-y-1 pl-4">
                  <li>
                    <Link
                      to="/info-gestion/funcionarios"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/info-gestion/funcionarios')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Licencia Funcionarios
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/info-gestion/rechazadas"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/info-gestion/rechazadas')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Gestión Pago Rechazadas
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/info-gestion/sin-resolucion"
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/info-gestion/sin-resolucion')
                          ? 'bg-[#016098] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >
                      Gestión Pago Sin Resolución
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-[#e2e8f0]">
          <button
            onClick={handleLogout}
            className="w-full bg-white border border-[#EB567F] text-[#EB567F] hover:bg-[#EB567F] hover:text-white py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              ></path>
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenedor Principal Derecho */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible">
        <div className="flex-1 overflow-auto p-4 md:p-8 print:p-0 print:overflow-visible">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
