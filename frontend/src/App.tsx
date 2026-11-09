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
import MantencionLicencias from './pages/MantencionLicencias';
import MantencionPagos from './pages/MantencionPagos';
import CargaRemuneraciones from './pages/CargaRemuneraciones';
import PagosMasivos from './pages/PagosMasivos';
import CertificadosNominas from './pages/CertificadosNominas';
import InformesLegacy from './pages/InformesLegacy';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Protected Routes wrapped in Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="inicio" element={<Inicio />} />

          {/* Fase 1: Mantención Operativa y Dep. Prevención */}
          <Route path="mantencion/licencias" element={<MantencionLicencias modo="normal" />} />
          <Route path="mantencion/pagos" element={<MantencionPagos />} />
          <Route path="mantencion/remuneraciones" element={<CargaRemuneraciones />} />
          <Route path="prevencion/licencias-mutual" element={<MantencionLicencias modo="mutual" />} />

          {/* Fase 2: Pagos Masivos */}
          <Route path="pagos-masivos/importar" element={<PagosMasivos tabInicial="importar" />} />
          <Route path="pagos-masivos/auditar" element={<PagosMasivos tabInicial="auditar" />} />
          <Route path="pagos-masivos/eliminar" element={<PagosMasivos tabInicial="eliminar" />} />

          {/* Fase 3: Certificados Imprimibles, Nóminas de Correspondencia, Informes y Softland */}
          <Route path="certificados/licencia" element={<CertificadosNominas tabInicial="certificado" />} />
          <Route path="certificados/nomina-normal" element={<CertificadosNominas tabInicial="nomina-normal" />} />
          <Route path="certificados/nomina-pago-directo" element={<CertificadosNominas tabInicial="nomina-pago-directo" />} />

          <Route path="informes/por-funcionario" element={<InformesLegacy tabInicial="por-funcionario" />} />
          <Route path="informes/diarias" element={<InformesLegacy tabInicial="diarias" />} />
          <Route path="informes/brp" element={<InformesLegacy tabInicial="brp" />} />
          <Route path="informes/pago-directo" element={<InformesLegacy tabInicial="pago-directo" />} />
          <Route path="informes/general-pagos" element={<InformesLegacy tabInicial="general-pagos" />} />
          <Route path="informes/softland" element={<InformesLegacy tabInicial="softland" />} />

          <Route path="licencias/estadisticas" element={<EstadisticasLicencias />} />
          <Route path="licencias/otras-estadisticas" element={<OtrasLicencias />} />
          <Route path="reposo/estadisticas" element={<EstadisticasReposo />} />
          <Route path="reposo/otras-estadisticas" element={<OtrasReposo />} />

          <Route
            path="pago-directo/estadisticas"
            element={<EstadisticasDashboard modulo="pago-directo" titulo="Licencias Medicas P. Dir. - Estadisticas" />}
          />
          <Route path="reposo/carga" element={<CargaReposo />} />

          <Route path="reposo/auditoria" element={<Bitacora />} />
          <Route path="info-gestion/funcionarios" element={<InfoGestionFuncionarios />} />
          <Route
            path="info-gestion/rechazadas"
            element={<InfoGestionPagoLicencias tipo="rechazadas" titulo="Gestión Pago Licencias Rechazadas" />}
          />
          <Route
            path="info-gestion/sin-resolucion"
            element={<InfoGestionPagoLicencias tipo="sin-resolucion" titulo="Gestión Pago Sin Resolución" />}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
