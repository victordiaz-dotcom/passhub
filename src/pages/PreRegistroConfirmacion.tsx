import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import QRCodeStyling from "qr-code-styling";
import { ErrorScreen } from "@/components/ErrorScreen";
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
  facility: string | null;
  facilityDetails: { name: string; address: string | null; phone: string | null } | null;
  custom_answers: Record<string, { label_es: string | null; label_en: string | null; value: string }> | null;
  visit_date: string;
  visit_time: string | null;
  status: "pendiente" | "usada" | "vencida" | "cancelada";
  used_at: string | null;
  extended_until: string | null;
  created_at: string;
  employees: { full_name: string } | null;
  companies: { name: string } | null;
  offices: { name: string; country: string; address: string | null; phone: string | null } | null;
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
  // El token va en el fragmento ("#...", después de window.location.hash),
  // no en un param de ruta -- así nunca se manda al servidor (a diferencia
  // de un path segment o un ?query=), y no queda en logs de acceso/proxy ni
  // lo puede leer el bot de vista-previa de enlaces de WhatsApp/Telegram
  // (que no corre JavaScript, solo hace un GET normal de la página). Se lee
  // React Router actualiza location si se abre otro enlace de confirmación
  // sin recargar la página; así siempre se consulta el token vigente.
  const location = useLocation();
  const token = location.hash.slice(1) || undefined;
  const [searchParams] = useSearchParams();
  const [details, setDetails] = useState<Preregistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState(500);
  const [errorSource, setErrorSource] = useState<"missing" | "load" | "unexpected" | "server" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => resolveInitialLang(searchParams.get("lang")));
  const t = PREREG_T[lang];

  function changeLang(next: Lang) {
    setLang(next);
    storeLang(next);
    if (errorSource === "missing") setError(PREREG_T[next].missingTokenInUrl);
    if (errorSource === "load") setError(PREREG_T[next].loadErrorFallback);
    if (errorSource === "unexpected") setError(PREREG_T[next].unexpectedResponse);
    if (errorSource === "server" && serverError) setError(translateServerError(serverError, next));
  }

  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setError(null);
    setErrorStatus(500);
    setErrorSource(null);
    setServerError(null);
    qrCodeRef.current = null;

    if (!token) {
      setLoading(false);
      setErrorStatus(400);
      setErrorSource("missing");
      setError(t.missingTokenInUrl);
      return;
    }

    supabase.functions
      .invoke("public-preregister", { body: { action: "get", token } })
      .then(async ({ data, error: invokeError }) => {
        if (cancelled) return;

        if (invokeError) {
          console.error(invokeError);
          const response = (invokeError as { context?: Response }).context;
          let message: string = t.loadErrorFallback;
          let rawMessage: string | null = null;
          if (response && typeof response.clone === "function") {
            try {
              const payload = await response.clone().json() as { error?: string };
              if (payload.error) {
                rawMessage = payload.error;
                message = translateServerError(payload.error, lang);
              }
            } catch {
              // Si la respuesta no contiene JSON, se conserva el texto seguro.
            }
          }
          if (cancelled) return;
          setLoading(false);
          setErrorStatus(response?.status ?? 503);
          setErrorSource(rawMessage ? "server" : "load");
          setServerError(rawMessage);
          setError(message);
          return;
        }

        setLoading(false);

        if (data?.error) {
          setErrorStatus(400);
          setErrorSource("server");
          setServerError(data.error);
          setError(translateServerError(data.error, lang));
          return;
        }

        if (!data?.preregistration) {
          console.error("Respuesta inesperada de public-preregister:", data);
          setErrorStatus(502);
          setErrorSource("unexpected");
          setError(t.unexpectedResponse);
          return;
        }

        setDetails(data.preregistration as Preregistration);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLoading(false);
        setErrorStatus(503);
        setErrorSource("load");
        setError(t.loadErrorFallback);
      });
    return () => { cancelled = true; };
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
      <ErrorScreen
        status={errorStatus}
        locale={lang}
        title={errorStatus >= 500 ? t.passLoadErrorTitle : t.notAvailableTitle}
        description={error ?? t.notAvailableFallback}
        primaryLabel={errorStatus >= 500 ? t.retry : t.goToPrereg}
        primaryHref="/pre-register"
        onRetry={errorStatus >= 500 ? () => window.location.reload() : undefined}
        secondaryLabel={t.goBack}
        headerAction={
          <div className="flex justify-end gap-1 text-xs font-medium">
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
        }
      />
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

        {/* Datos de contacto de a dónde va ESTE pre-registro. Antes estaban
            fijos en el código con la dirección de Monterrey, así que un
            visitante de Madrid recibía la dirección equivocada.
            facilityDetails (la instalación puntual, ej. Envia.com dentro de
            Madrid) es más específica que la dirección general de la
            oficina, así que se prefiere cuando existe. Si no hay ninguna
            dirección cargada, no se muestra nada en vez de una que no
            corresponde. */}
        {(() => {
          const address = details.facilityDetails?.address ?? details.offices?.address;
          const phone = details.facilityDetails?.phone ?? details.offices?.phone;
          if (!address && !phone) return null;
          return (
            <p className="mt-4 border-t border-line pt-4 text-center text-xs text-ink-soft">
              {details.facilityDetails?.name && (
                <>
                  <span className="font-medium text-ink">{details.facilityDetails.name}</span>
                  <br />
                </>
              )}
              {address}
              {address && phone && <br />}
              {phone && `${t.phoneLabel}: ${phone}`}
            </p>
          );
        })()}
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
