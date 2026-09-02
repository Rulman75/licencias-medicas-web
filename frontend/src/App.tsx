import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Inicio from './pages/Inicio';
import EstadisticasDashboard from './components/EstadisticasDashboard';
import EstadisticasLicencias from './pages/EstadisticasLicencias';
import EstadisticasReposo from './pages/EstadisticasReposo';
import OtrasLicencias from './pages/OtrasLicencias';
import OtrasReposo from './pages/OtrasReposo';
import CargaReposo from './pages/CargaReposo';
import Bitacora from './pages/Bitacora';
import InfoGestionFuncionarios from './pages/InfoGestionFuncionarios';
import InfoGestionPagoLicencias from './pages/InfoGestionPagoLicencias';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes wrapped in Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="inicio" element={<Inicio />} />
          <Route path="licencias/estadisticas" element={<EstadisticasLicencias />} />
          <Route path="licencias/otras-estadisticas" element={<OtrasLicencias />} />
          <Route path="reposo/estadisticas" element={<EstadisticasReposo />} />
          <Route path="reposo/otras-estadisticas" element={<OtrasReposo />} />
          
          <Route path="pago-directo/estadisticas" element={<EstadisticasDashboard modulo="pago-directo" titulo="Licencias Medicas P. Dir. - Estadisticas" />} />
          <Route path="reposo/carga" element={<CargaReposo />} />

          <Route path="reposo/auditoria" element={<Bitacora />} />
          <Route path="info-gestion/funcionarios" element={<InfoGestionFuncionarios />} />
          <Route path="info-gestion/rechazadas" element={<InfoGestionPagoLicencias tipo="rechazadas" titulo="Gestión Pago Licencias Rechazadas" />} />
          <Route path="info-gestion/sin-resolucion" element={<InfoGestionPagoLicencias tipo="sin-resolucion" titulo="Gestión Pago Sin Resolución" />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
