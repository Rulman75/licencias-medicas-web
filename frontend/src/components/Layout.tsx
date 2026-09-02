import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuLicenciasOpen, setMenuLicenciasOpen] = useState(false);
  const [menuReposoOpen, setMenuReposoOpen] = useState(false);
  const [menuPagoDirectoOpen, setMenuPagoDirectoOpen] = useState(false);
  const [menuInfoGestionOpen, setMenuInfoGestionOpen] = useState(false);
  const [userData, setUserData] = useState({ username: '', unidad: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserData({
          username: payload.username || '',
          unidad: payload.unidad || ''
        });
      } catch (e) {
        console.error("Error decoding token");
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

  // The primary color from siniestros-web is #016098
  return (
    <div className="flex h-screen bg-[#f4f7f6] font-sans text-[#1e293b]">
      
      {/* Sidebar Corporativo - Estilo Siniestros (Blanco) */}
      <aside className="w-[260px] bg-white border-r border-[#e2e8f0] flex flex-col shrink-0">
        
        {/* Logo / Header del Sidebar */}
        <div className="p-6 flex flex-col items-center border-b border-[#e2e8f0]">
          <img src="/logo.png" alt="CMDS Logo" className="w-full max-w-[140px] h-auto object-contain mb-2" />
          <span className="text-[1rem] text-[#64748b] text-center font-semibold leading-tight mt-2">
            Sistema de<br />Licencias Médicas
          </span>
          
          {userData.username && (
            <div className="flex items-center gap-2 text-xs text-[#016098] bg-[#e0f2fe] px-3 py-1.5 rounded-full mt-4 font-medium uppercase tracking-wide">
              <span className="w-1.5 h-1.5 bg-[#39BABD] rounded-full"></span>
              {userData.username}
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

            {/* Licencias Médicas */}
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
                    >Estadistica Recupero</Link>
                  </li>
                  <li>
                    <Link 
                      to="/licencias/otras-estadisticas" 
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/licencias/otras-estadisticas') 
                        ? 'bg-[#016098] text-white' 
                        : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >Otras Estadisticas</Link>
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
                    >Estadistica Recupero</Link>
                  </li>
                  <li>
                    <Link 
                      to="/reposo/otras-estadisticas" 
                      className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                        isActive('/reposo/otras-estadisticas') 
                        ? 'bg-[#016098] text-white' 
                        : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#016098]'
                      }`}
                    >Otras Estadisticas</Link>
                  </li>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenedor Principal Derecho */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Contenido Renderizado */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </div>

    </div>
  );
}
