import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Company = { id: string; name: string };
type Employee = { id: string; full_name: string };

const emptyForm = {
  visitorName: "",
  visitorCompany: "",
  companyId: "",
  hostEmployeeId: "",
  reason: "",
  visitDate: "",
  visitTime: "",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PreRegistro() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions
      .invoke("public-preregister", { body: { action: "companies" } })
      .then(({ data }) => setCompanies(data?.companies ?? []));
  }, []);

  useEffect(() => {
    if (!form.companyId) {
      setEmployees([]);
      return;
    }

    supabase.functions
      .invoke("public-preregister", { body: { action: "employees", companyId: form.companyId } })
      .then(({ data }) => setEmployees(data?.employees ?? []));
  }, [form.companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.companyId || !form.hostEmployeeId) {
      setError("Selecciona la empresa y a quién visitas.");
      return;
    }

    setSubmitting(true);

    const { data, error: invokeError } = await supabase.functions.invoke("public-preregister", {
      body: { action: "create", ...form },
    });

    setSubmitting(false);

    if (invokeError || data?.error) {
      setError(data?.error ?? "No se pudo crear el pre-registro. Intenta de nuevo.");
      return;
    }

    navigate(`/pre-registro/confirmacion/${data.id}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-card p-8 shadow-sm">
        <h1 className="mb-1 font-display text-xl font-bold text-ink">Pre-registro de visita</h1>
        <p className="mb-6 text-sm text-ink-soft">
          Llena tus datos antes de llegar. Recibirás un código QR que deberás mostrar en recepción.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="visitorName" className="mb-1 block text-sm font-medium text-ink-soft">
              Tu nombre
            </label>
            <input
              id="visitorName"
              type="text"
              required
              value={form.visitorName}
              onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
              Tu empresa
            </label>
            <input
              id="visitorCompany"
              type="text"
              value={form.visitorCompany}
              onChange={(e) => setForm({ ...form, visitorCompany: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="company" className="mb-1 block text-sm font-medium text-ink-soft">
              Empresa que visitas
            </label>
            <select
              id="company"
              required
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, hostEmployeeId: "" })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Selecciona una empresa
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="hostEmployee" className="mb-1 block text-sm font-medium text-ink-soft">
              A quién visitas
            </label>
            <select
              id="hostEmployee"
              required
              disabled={!form.companyId}
              value={form.hostEmployeeId}
              onChange={(e) => setForm({ ...form, hostEmployeeId: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:bg-paper"
            >
              <option value="" disabled>
                Selecciona un colaborador
              </option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-soft">
              Motivo
            </label>
            <input
              id="reason"
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="visitDate" className="mb-1 block text-sm font-medium text-ink-soft">
                Fecha de visita
              </label>
              <input
                id="visitDate"
                type="date"
                required
                min={todayIso()}
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="visitTime" className="mb-1 block text-sm font-medium text-ink-soft">
                Hora (opcional)
              </label>
              <input
                id="visitTime"
                type="time"
                value={form.visitTime}
                onChange={(e) => setForm({ ...form, visitTime: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Generar pre-registro"}
          </button>
        </form>
      </div>
    </div>
  );
}
