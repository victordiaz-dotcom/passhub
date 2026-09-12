import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import QRCodeStyling from "qr-code-styling";
import { supabase } from "@/integrations/supabase/client";
import {
  PREREG_T,
  resolveInitialLang,
  storeLang,
  translateServerError,
  type Lang,
} from "@/lib/preregistroI18n";

type Preregistration = {
  visitor_name: string;
  visitor_company: string | null;
  visitor_phone: string | null;
  visitor_email: string | null;
  visit_type: string | null;
  has_vehicle: boolean | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_model: string | null;
  reason: string | null;
  custom_answers: Record<string, { label_es: string | null; label_en: string | null; value: string }> | null;
  visit_date: string;
  visit_time: string | null;
  status: "pendiente" | "usada" | "vencida" | "cancelada";
  used_at: string | null;
  extended_until: string | null;
  created_at: string;
  employees: { full_name: string } | null;
  companies: { name: string } | null;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PreRegistroConfirmacion() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [details, setDetails] = useState<Preregistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => resolveInitialLang(searchParams.get("lang")));
  const t = PREREG_T[lang];

  function changeLang(next: Lang) {
    setLang(next);
    storeLang(next);
  }

  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError(t.missingTokenInUrl);
      return;
    }

    supabase.functions
      .invoke("public-preregister", { body: { action: "get", token } })
      .then(({ data, error: invokeError }) => {
        setLoading(false);

        if (invokeError) {
          console.error(invokeError);
          setError(t.loadErrorFallback);
          return;
        }

        if (data?.error) {
          setError(translateServerError(data.error, lang));
          return;
        }

        if (!data?.preregistration) {
          console.error("Respuesta inesperada de public-preregister:", data);
          setError(t.unexpectedResponse);
          return;
        }

        setDetails(data.preregistration as Preregistration);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
        setError(t.loadErrorFallback);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    // Este efecto depende de "loading"/"details" además de "token": la
    // primera vez que corre (con loading=true) el contenedor del QR todavía
    // no existe en el DOM (se muestra "Cargando..."), así que hay que
    // reintentar cuando ya se montó el contenedor real.
    if (!token || loading || error || !details || !qrContainerRef.current) return;

    // El canvas se genera a una resolución más alta que su tamaño visual
    // (según el devicePixelRatio de la pantalla) y luego se reduce por CSS:
    // así se ve nítido en pantallas retina en vez de borroso.
    const displaySize = 220;
    const dpr = window.devicePixelRatio || 1;
    const renderSize = Math.round(displaySize * dpr);

    if (!qrCodeRef.current) {
      qrCodeRef.current = new QRCodeStyling({
        width: renderSize,
        height: renderSize,
        type: "canvas",
        data: token,
        margin: Math.round(6 * dpr),
        qrOptions: { errorCorrectionLevel: "H" },
        image: "/logo.png",
        imageOptions: { crossOrigin: "anonymous", margin: Math.round(8 * dpr), imageSize: 0.42 },
        // "dots" en vez de "rounded": los módulos quedan como puntos
        // separados en lugar de fundirse en caminos/líneas continuas, que
        // es justo lo que se veía muy lleno.
        dotsOptions: { type: "dots", color: "#000000" },
        cornersSquareOptions: { type: "dot", color: "#000000" },
        cornersDotOptions: { type: "dot", color: "#000000" },
        backgroundOptions: { color: "#ffffff" },
      });
      qrCodeRef.current.append(qrContainerRef.current);
    } else {
      qrCodeRef.current.update({ data: token });
    }

    const canvas = qrContainerRef.current.querySelector("canvas");
    if (canvas) {
      canvas.style.width = `${displaySize}px`;
      canvas.style.height = `${displaySize}px`;
    }
  }, [token, loading, error, details]);

  function downloadQr() {
    if (!token) return;
    qrCodeRef.current?.download({ name: `pre-registro-${token}`, extension: "png" });
  }

  function openZoom() {
    const canvas = qrContainerRef.current?.querySelector("canvas");
    if (canvas) setZoomedSrc(canvas.toDataURL("image/png"));
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <p className="text-sm text-ink-soft">{t.loading}</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="card w-full max-w-sm p-8 text-center">
          <div className="mb-2 flex justify-end gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => changeLang("es")}
              className={lang === "es" ? "text-accent" : "text-ink-soft hover:text-ink"}
            >
              ES
            </button>
            <span className="text-ink-soft">/</span>
            <button
              type="button"
              onClick={() => changeLang("en")}
              className={lang === "en" ? "text-accent" : "text-ink-soft hover:text-ink"}
            >
              EN
            </button>
          </div>
          <h1 className="mb-2 font-display text-xl font-bold text-ink">{t.notAvailableTitle}</h1>
          <p className="text-sm text-danger">{error ?? t.notAvailableFallback}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-2 flex justify-end gap-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => changeLang("es")}
            className={lang === "es" ? "text-accent" : "text-ink-soft hover:text-ink"}
          >
            ES
          </button>
          <span className="text-ink-soft">/</span>
          <button
            type="button"
            onClick={() => changeLang("en")}
            className={lang === "en" ? "text-accent" : "text-ink-soft hover:text-ink"}
          >
            EN
          </button>
        </div>
        <h1 className="mb-1 text-center font-display text-xl font-bold text-ink">{t.heading}</h1>
        <p className="mb-1 text-center text-sm font-medium text-accent-dark">
          {t.greeting(details.visitor_name)}
        </p>
        <p className="mb-6 text-center text-sm text-ink-soft">{t.instructions}</p>

        {(() => {
          // Un pre-registro cancelado o vencido nunca llega aquí: el
          // endpoint público lo bloquea desde el servidor antes de devolver
          // ningún dato, así que si "details" existe es porque sigue
          // vigente.
          const expiresOn = details.extended_until ?? addDays(details.visit_date, 7);

          if (details.status === "usada") {
            return (
              <div className="mb-6 rounded-md border border-line bg-surface-soft p-3 text-center text-sm text-ink-soft">
                {t.usedPrefix}
                {details.used_at ? t.usedAt(new Date(details.used_at).toLocaleString()) : ""}
                {t.stillValidUntil(formatDate(expiresOn))}
              </div>
            );
          }

          return (
            <div className="mb-6 rounded-md border border-line bg-surface-soft p-3 text-center text-sm text-ink-soft">
              {t.validUntil(formatDate(expiresOn))}
            </div>
          );
        })()}

        <button
          type="button"
          onClick={openZoom}
          className="mx-auto block w-fit cursor-pointer rounded-xl border border-line bg-white p-4 transition-transform active:scale-95"
        >
          <div ref={qrContainerRef} className="flex justify-center" />
        </button>
        <p className="mt-2 text-center text-xs text-ink-soft">{t.tapToZoom}</p>

        <button
          type="button"
          onClick={downloadQr}
          className="btn-primary mt-6 h-auto w-full py-2"
        >
          {t.downloadQr}
        </button>

        <dl className="mt-6 divide-y divide-line text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">{t.fieldVisitor}</dt>
            <dd className="font-medium text-ink">{details.visitor_name}</dd>
          </div>
          {details.visitor_company && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldCompany}</dt>
              <dd className="font-medium text-ink">{details.visitor_company}</dd>
            </div>
          )}
          {details.visitor_phone && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldPhone}</dt>
              <dd className="font-medium text-ink">{details.visitor_phone}</dd>
            </div>
          )}
          {details.visitor_email && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldEmail}</dt>
              <dd className="font-medium text-ink">{details.visitor_email}</dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">{t.fieldVisiting}</dt>
            <dd className="font-medium text-ink">{details.companies?.name ?? "—"}</dd>
          </div>
          {details.employees?.full_name && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldHost}</dt>
              <dd className="font-medium text-ink">{details.employees.full_name}</dd>
            </div>
          )}
          {details.visit_type && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldVisitType}</dt>
              <dd className="font-medium text-ink">{details.visit_type}</dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-ink-soft">{t.fieldDate}</dt>
            <dd className="font-medium text-ink">{formatDate(details.visit_date)}</dd>
          </div>
          {details.visit_time && (
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">{t.fieldTime}</dt>
              <dd className="font-medium text-ink">{details.visit_time}</dd>
            </div>
          )}
          {details.has_vehicle && (
            <>
              <div className="flex justify-between py-2">
                <dt className="text-ink-soft">{t.fieldVehicle}</dt>
                <dd className="font-medium text-ink">
                  {details.vehicle_color} {details.vehicle_model}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-ink-soft">{t.fieldPlate}</dt>
                <dd className="font-medium text-ink">{details.vehicle_plate}</dd>
              </div>
            </>
          )}
          {details.custom_answers &&
            Object.values(details.custom_answers).map((answer, i) => (
              <div key={i} className="flex justify-between py-2">
                <dt className="text-ink-soft">
                  {(lang === "es" ? answer.label_es : answer.label_en) || answer.label_es || answer.label_en}
                </dt>
                <dd className="font-medium text-ink">{answer.value}</dd>
              </div>
            ))}
        </dl>

        <p className="mt-6 text-center text-xs text-ink-soft">{t.saveLinkNote}</p>

        <p className="mt-4 border-t border-line pt-4 text-center text-xs text-ink-soft">
          Av. I. Morones Prieto No. 2110, Local 3-B, Col. Loma Larga, C.P. 64710, Monterrey, N.L.
          <br />
          {t.phoneLabel}: +52 81 2085 8093
        </p>
      </div>

      {zoomedSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoomedSrc(null)}
        >
          <img
            src={zoomedSrc}
            alt={t.qrAlt}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
