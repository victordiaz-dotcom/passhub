import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

type Preregistration = {
  id: string;
  visitor_name: string;
  visitor_company: string | null;
  reason: string | null;
  visit_date: string;
  visit_time: string | null;
  status: "pendiente" | "usada" | "vencida" | "cancelada";
  used_at: string | null;
  created_at: string;
  employees: { full_name: string } | null;
  companies: { name: string } | null;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function PreRegistroConfirmacion() {
  const { id } = useParams<{ id: string }>();
  const [details, setDetails] = useState<Preregistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const qrContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Falta el id del pre-registro en el link.");
      return;
    }

    supabase.functions
      .invoke("public-preregister", { body: { action: "get", id } })
      .then(({ data, error: invokeError }) => {
        setLoading(false);

        if (invokeError) {
          console.error(invokeError);
          setError("No se pudo cargar el pre-registro. Intenta de nuevo.");
          return;
        }

        if (data?.error) {
          setError(data.error);
          return;
        }

        if (!data?.preregistration) {
          console.error("Respuesta inesperada de public-preregister:", data);
          setError("No se pudo leer la información del pre-registro.");
          return;
        }

        setDetails(data.preregistration as Preregistration);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
        setError("No se pudo cargar el pre-registro. Intenta de nuevo.");
      });
  }, [id]);

  function downloadQr() {
    const canvas = qrContainerRef.current?.querySelector("canvas");
    if (!canvas || !id) return;

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `pre-registro-${id}.png`;
    link.click();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <p className="text-sm text-ink-soft">Cargando...</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="w-full max-w-sm rounded-lg border border-line bg-card p-8 text-center shadow-sm">
          <h1 className="mb-2 font-display text-xl font-bold text-ink">Pre-registro no encontrado</h1>
          <p className="text-sm text-danger">{error ?? "Revisa que el link esté completo."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-center font-display text-xl font-bold text-ink">Tu pre-registro</h1>
        <p className="mb-6 text-center text-sm text-ink-soft">
          Muestra este código QR en recepción el día de tu visita.
        </p>

        {details.status === "usada" && (
          <div className="mb-6 rounded-md border border-line bg-paper p-3 text-center text-sm text-ink-soft">
            Este pase ya fue utilizado
            {details.used_at ? ` el ${new Date(details.used_at).toLocaleString()}` : ""}.
          </div>
        )}

        {(details.status === "vencida" || details.status === "cancelada") && (
          <div className="mb-6 rounded-md border border-danger bg-danger/10 p-3 text-center text-sm text-danger">
            Este pre-registro ya no es válido ({details.status}).
          </div>
        )}

        <div ref={qrContainerRef} className="flex justify-center">
          <QRCodeCanvas value={id ?? ""} size={220} />
        </div>

        <button
          type="button"
          onClick={downloadQr}
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Descargar QR (PNG)
        </button>

        <dl className="mt-6 divide-y divide-line text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">Visitante</dt>
            <dd className="font-medium text-ink">{details.visitor_name}</dd>
          </div>
          {details.visitor_company && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">Empresa</dt>
              <dd className="font-medium text-ink">{details.visitor_company}</dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">Visita a</dt>
            <dd className="font-medium text-ink">{details.companies?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">Recibe</dt>
            <dd className="font-medium text-ink">{details.employees?.full_name ?? "—"}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">Fecha</dt>
            <dd className="font-medium text-ink">{formatDate(details.visit_date)}</dd>
          </div>
          {details.visit_time && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">Hora</dt>
              <dd className="font-medium text-ink">{details.visit_time}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 text-center text-xs text-ink-soft">
          Guarda este link o toma una captura de pantalla: es la única forma de volver a ver tu pase.
        </p>
      </div>
    </div>
  );
}
