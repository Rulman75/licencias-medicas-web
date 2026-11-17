import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ControlConvenioMensual from '../components/ControlConvenioMensual';

export default function AuditoriaCuadratura() {
  const [searchParams] = useSearchParams();
  const yearParam = searchParams.get('year') ?? undefined;

  return (
    <div className="flex flex-col gap-5 w-full pb-10">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-[#e2e8f0] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-[#016098] text-white uppercase">
              Auditoría Matemática Exacta
            </span>
            <h1 className="text-xl font-extrabold text-[#016098]">
              Auditoría y Cuadratura Real — Pago Estimado vs. Recibido (Licencias Convenio)
            </h1>
          </div>
          <p className="text-xs text-[#64748b] mt-1">
            Conciliación matemática exacta al peso ($0 diferencia): separa licencias con Pago Mayor al Estimado (topeadas al estimado), Neteadas, Menor Pago Ya Saldadas (quedan en $0) y Falta por Cobrar Real.
          </p>
        </div>
      </div>

      <ControlConvenioMensual initialYear={yearParam} />
    </div>
  );
}
