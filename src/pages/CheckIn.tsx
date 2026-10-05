import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { clearViewCache, coalesceViewRequest } from "@/lib/viewCache";
import { useAuth } from "@/hooks/useAuth";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PhotoUploadField } from "@/components/PhotoUploadField";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { AutoCompleteInput } from "@/components/AutoCompleteInput";
import { mergeVisitorCompanySuggestions } from "@/lib/visitorCompanySuggestions";
import { checkoutVisit } from "@/lib/checkout";
import { Skeleton, TableSkeletonRows } from "@/components/Skeleton";
import { copyToClipboard } from "@/lib/clipboard";
import { preregistrationLink } from "@/lib/preregistrationLink";
import { findFlaggedVisitor, flagVisitor, type FlaggedVisitorMatch } from "@/lib/flaggedVisitors";
import { isValidName, NAME_INVALID_MESSAGE } from "@/lib/nameValidation";
import { filterNameInput, filterPhoneInput, filterEmailInput, isValidEmailFormat, EMAIL_INVALID_MESSAGE } from "@/lib/inputFilters";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Pick<Tables<"employees">, "id" | "full_name">;
type Company = Pick<Tables<"companies">, "id" | "name">;
type Division = Pick<Tables<"divisions">, "id" | "name" | "company_id">;
type VisitType = Pick<Tables<"visit_types">, "id" | "name">;
type OfficeFacility = { id: string; name: string; label: string; officeId: string };

const OTROS_SENTINEL = "__otros__";
type InsideVisit = Pick<
  Tables<"visits">,
  "id" | "folio" | "visitor_name" | "check_in_at"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  companies: Pick<Tables<"companies">, "name"> | null;
};

const QR_REGION_ID = "qr-reader-region";

const plainSelectClass = "input-field h-auto py-2 disabled:opacity-60";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function nowTimeLocal() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

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

// crypto.randomUUID() exige un contexto seguro (https o localhost) — al
// entrar por la IP de la red local sobre http plano no está disponible y
// tronaba toda la pantalla. Este id solo necesita ser único para esta
// carpeta de Storage (no es sensible, ver comentario en photoSessionId),
// así que basta con crypto.getRandomValues(), que sí funciona en cualquier
// contexto, para armar un id con la misma forma de un UUID v4.
function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function CheckIn() {
  const { session, companyId, profile, isSuperadmin } = useAuth();

  const [tab, setTab] = useState<"registrar" | "dentro">("registrar");
  const [insideVisits, setInsideVisits] = useState<InsideVisit[]>([]);
  const [insideLoading, setInsideLoading] = useState(true);
  const insideRequestId = useRef(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<InsideVisit | null>(null);
  // "Persona vetada": casilla opcional en el diálogo de confirmar salida,
  // sin marcar por defecto -- no interrumpe el flujo normal de checkout,
  // solo aplica cuando recepción la marca explícitamente.
  const [checkoutFlagged, setCheckoutFlagged] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [flaggedWarning, setFlaggedWarning] = useState<FlaggedVisitorMatch | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);
  const [divisionsLoading, setDivisionsLoading] = useState(true);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [visitorCompanySuggestions, setVisitorCompanySuggestions] = useState<string[]>([]);
  const [visitorName, setVisitorName] = useState("");
  const [visitorCompany, setVisitorCompany] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [hostEmployeeId, setHostEmployeeId] = useState("");
  const [visitType, setVisitType] = useState("");
  const [customVisitType, setCustomVisitType] = useState("");
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [reason, setReason] = useState("");
  const [division, setDivision] = useState("");
  const [facility, setFacility] = useState("");
  // El campo "Instalación que visitan" solo aparece si la oficina de quien
  // registra tiene instalaciones registradas en office_facilities (ej.
  // Monterrey: Local 3, Envia.com) -- nada hardcodeado a un nombre de
  // oficina en particular, mismo criterio que "División" con las empresas.
  const [officeFacilities, setOfficeFacilities] = useState<OfficeFacility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [visitDate, setVisitDate] = useState(todayLocal());
  const [visitTime, setVisitTime] = useState("");
  // Id de carpeta de Storage para las fotos de este intento de registro —
  // no es (ni necesita ser) el id real de la visita, que Postgres genera al
  // insertar la fila: el vínculo real entre la visita y sus fotos son las
  // columnas visitor_photo_path/id_photo_path, que guardan la ruta exacta
  // usando este mismo id. Se mantiene estable durante todo el intento
  // (nunca se regenera entre subir una foto y enviar el formulario) y solo
  // cambia al iniciar un registro nuevo, en resetForm().
  const [photoSessionId, setPhotoSessionId] = useState(() => randomId());
  const [photoResetSignal, setPhotoResetSignal] = useState(0);
  const [visitorPhotoUploaded, setVisitorPhotoUploaded] = useState(false);
  const [idPhotoUploaded, setIdPhotoUploaded] = useState(false);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState<string | null>(null);

  const [preregistrationId, setPreregistrationId] = useState<string | null>(null);
  const [preregistrationDate, setPreregistrationDate] = useState<string | null>(null);
  const [preregistrationExpiresOn, setPreregistrationExpiresOn] = useState<string | null>(null);
  const [preregistrationReused, setPreregistrationReused] = useState(false);
  const [preregistrationCustomAnswers, setPreregistrationCustomAnswers] = useState<
    Record<string, { label_es: string | null; label_en: string | null; value: string }> | null
  >(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState<boolean | null>(null);
  const canCopyPreregLink = !!profile && (isSuperadmin || !!profile.office_id);
  const [slackWarning, setSlackWarning] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);
  // El borde rojo de "campo requerido vacío" (invalid:border-danger) solo
  // debe verse después de que alguien intentó enviar el formulario y falló
  // -- no desde que la pantalla carga con los campos vacíos, que es lo que
  // pasaba al tener la clase invalid: puesta siempre (CSS :invalid se activa
  // en cuanto el campo se renderiza vacío, sin importar si hubo interacción).
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const inputClass = `input-field h-auto py-2 disabled:opacity-60${attemptedSubmit ? " invalid:border-danger" : ""}`;
  const invalidSelectClass = `input-field h-auto appearance-none py-2 disabled:opacity-60${attemptedSubmit ? " invalid:border-danger" : ""}`;
  // Tras un registro exitoso, el formulario se limpia solo después de unos
  // segundos (da tiempo a ver el folio/pase generado sin que alguien tenga
  // que darle clic a "Registrar otra visita") -- se guarda el id del
  // setTimeout para poder cancelarlo si esa persona ya le dio clic manual
  // antes de que se cumpla, o si sale de esta pantalla.
  const autoResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoResetTimeoutRef.current !== null) window.clearTimeout(autoResetTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Cualquier cuenta (admin o recepción) puede elegir cualquier empresa:
    // un solo mostrador de recepción atiende a las 4 empresas.
    void coalesceViewRequest(`checkin:companies:${session?.user?.id ?? ""}`, async () => await supabase
      .from("companies")
      .select("id, name")
      .eq("active", true)
      .order("name"))
      .then(({ data }) => setCompanies(data ?? []));
  }, [session?.user?.id]);

  useEffect(() => {
    if (companyId) setSelectedCompanyId(companyId);
  }, [companyId]);

  useEffect(() => {
    // Se cargan una vez para que al cambiar de empresa el campo División
    // se actualice de inmediato y no aparezca después de otro request.
    void coalesceViewRequest(`checkin:divisions:${session?.user?.id ?? ""}`, async () => await supabase.from("divisions").select("id, name, company_id").eq("active", true).order("name"))
      .then(({ data }) => {
        setAllDivisions(data ?? []);
        setDivisionsLoading(false);
      });
  }, [session?.user?.id]);

  useEffect(() => {
    setFacilitiesLoading(true);
    // superadmin nunca se restringe por su propia oficina -- aunque su
    // perfil tenga una office_id asignada (puede pasar si se le asignó una
    // por error, o si algún día se le da una por conveniencia de UI), debe
    // poder registrar visitas para CUALQUIER instalación de CUALQUIER país,
    // no solo la de su propia oficina. Se traen todas las instalaciones
    // activas de una vez, con el nombre de su oficina para desambiguar
    // (Envia.com existe tanto en Monterrey como en Madrid).
    if (isSuperadmin) {
      let cancelled = false;
      supabase
        .from("office_facilities")
        .select("id, name, office_id, offices(name, country)")
        .eq("active", true)
        .order("name")
        .then(({ data }) => {
          if (cancelled) return;
          const rows =
            (data as Array<{ id: string; name: string; office_id: string; offices: { name: string; country: string } | null }> | null) ??
            [];
          setOfficeFacilities(
            rows.map((f) => ({
              id: f.id,
              name: f.name,
              label: `${f.name} (${f.offices?.name ?? "?"})`,
              officeId: f.office_id,
            }))
          );
          setFacilitiesLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const officeId = profile?.office_id;
    if (officeId) {
      // Cuenta con oficina asignada: solo las instalaciones de esa oficina,
      // sin ambigüedad posible (una sola oficina en juego).
      supabase
        .from("office_facilities")
        .select("id, name")
        .eq("office_id", officeId)
        .eq("active", true)
        .order("name")
        .then(({ data }) => {
          setOfficeFacilities((data ?? []).map((f) => ({ ...f, label: f.name, officeId })));
          setFacilitiesLoading(false);
        });
      return;
    }

    // office_id null = admin sin oficina asignada -- no hay una oficina
    // propia que filtre esto, así que se detecta el país por IP (mismo
    // mecanismo que el pre-registro público, vía getClientCountry() en
    // public-preregister) y se muestran solo las instalaciones de las
    // oficinas de ESE país -- no las de todos los países mezcladas: si
    // estás en México debe salir Envia.com/Local 3, si estás en España debe
    // salir Envia.com/Fulfillment, nunca las 4 juntas.
    let cancelled = false;
    supabase.functions.invoke("public-preregister", { body: { action: "offices" } }).then(async ({ data }) => {
      if (cancelled) return;
      const detectedCountry = data?.detectedCountry as string | null | undefined;
      if (!detectedCountry) {
        setOfficeFacilities([]);
        setFacilitiesLoading(false);
        return;
      }

      const { data: countryOffices } = await supabase
        .from("offices")
        .select("id")
        .eq("country", detectedCountry)
        .eq("active", true);
      const officeIds = (countryOffices ?? []).map((o) => o.id);
      if (cancelled || officeIds.length === 0) {
        if (!cancelled) {
          setOfficeFacilities([]);
          setFacilitiesLoading(false);
        }
        return;
      }

      const { data: facilityRows } = await supabase
        .from("office_facilities")
        .select("id, name, office_id, offices(name)")
        .in("office_id", officeIds)
        .eq("active", true)
        .order("name");
      if (cancelled) return;

      const rows =
        (facilityRows as Array<{ id: string; name: string; office_id: string; offices: { name: string } | null }> | null) ??
        [];
      // Un país con más de una oficina (no es el caso hoy) podría repetir
      // nombre de instalación entre ellas -- ahí sí se agrega el nombre de
      // la oficina para desambiguar; con una sola oficina en el país
      // (el caso normal) queda igual que para una cuenta con oficina
      // asignada.
      const distinctOffices = new Set(rows.map((r) => r.office_id));
      setOfficeFacilities(
        rows.map((f) => ({
          id: f.id,
          name: f.name,
          label: distinctOffices.size > 1 ? `${f.name} (${f.offices?.name ?? "?"})` : f.name,
          officeId: f.office_id,
        }))
      );
      setFacilitiesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.office_id, isSuperadmin]);

  useEffect(() => {
    // Sin filtrar por empresa a propósito: quien recibe puede ser cualquier
    // colaborador dado de alta, sin importar a qué empresa esté asignada la
    // visita (varias empresas comparten una sola recepción física).
    void coalesceViewRequest(`checkin:employees:${session?.user?.id ?? ""}`, async () => await supabase
      .from("employees")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name"))
      .then(({ data }) => setEmployees(data ?? []));
  }, [session?.user?.id]);

  useEffect(() => {
    // "Empresa del visitante" aprende de lo que más se repite en visitas
    // reales ya registradas, y se completa con una lista de sugerencias
    // comunes (paqueterías, proveedores frecuentes) mientras se acumula
    // historial propio.
    void coalesceViewRequest(`checkin:visitor-companies:${session?.user?.id ?? ""}`, async () => await supabase
      .from("visits")
      .select("visitor_company")
      .not("visitor_company", "is", null))
      .then(({ data }) => {
        const counts = new Map<string, { label: string; count: number }>();
        for (const row of data ?? []) {
          const name = row.visitor_company?.trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const existing = counts.get(key);
          if (existing) existing.count += 1;
          else counts.set(key, { label: name, count: 1 });
        }
        const frequent = Array.from(counts.values())
          .sort((a, b) => b.count - a.count)
          .map((entry) => entry.label);
        setVisitorCompanySuggestions(mergeVisitorCompanySuggestions(frequent));
      });
  }, [session?.user?.id]);

  useEffect(() => {
    void coalesceViewRequest(`checkin:visit-types:${session?.user?.id ?? ""}`, async () => await supabase
      .from("visit_types")
      .select("id, name")
      .eq("active", true)
      .order("name"))
      .then(({ data }) => setVisitTypes(data ?? []));
  }, [session?.user?.id]);

  async function loadInsideVisits(quiet = false) {
    const requestId = ++insideRequestId.current;
    if (!quiet) setInsideLoading(true);
    const { data } = await coalesceViewRequest(`checkin:inside:${session?.user?.id ?? ""}`, async () => await supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, employees(full_name), companies(name)"
      )
      // Sin filtro por fecha a propósito: "dentro" ya es la condición
      // correcta. Filtrar además por la fecha de hoy escondía de recepción
      // a quien entró ayer y sigue adentro (pasó la medianoche), dejándolo
      // imposible de marcar como salida desde esta pantalla -- aunque el
      // guardia sí lo seguía viendo, porque su consulta nunca filtró fecha.
      .eq("status", "dentro")
      .order("check_in_at", { ascending: false }));
    if (requestId !== insideRequestId.current) return;
    setInsideVisits((data as InsideVisit[] | null) ?? []);
    setInsideLoading(false);
  }

  useEffect(() => {
    loadInsideVisits();
  }, []);

  async function handleCheckout(visit: InsideVisit) {
    if (!session?.user) {
      setCheckoutError("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }

    setCheckoutError(null);

    const { error: checkoutErr } = await checkoutVisit(visit.id, session.user.id);

    if (checkoutErr) {
      console.error(checkoutErr);
      setCheckoutError("No se pudo registrar la salida. Intenta de nuevo.");
      return;
    }

    // Solo si recepción marcó la casilla -- no bloquea ni afecta el
    // checkout en sí, que ya se completó arriba. Un error aquí no se le
    // muestra a recepción como si hubiera fallado la salida (sí falló,
    // pero por separado): se deja en consola para no confundir, la
    // salida ya quedó registrada de todas formas.
    if (checkoutFlagged) {
      const { error: flagError } = await flagVisitor({
        fullName: visit.visitor_name,
        note: checkoutNote,
        visitId: visit.id,
        flaggedBy: session.user.id,
      });
      if (flagError) console.error("No se pudo guardar la marca de comportamiento:", flagError);
    }

    setCheckoutFlagged(false);
    setCheckoutNote("");
    clearViewCache("checkin:inside:");
    clearViewCache("dashboard:");
    clearViewCache("history:");
    void loadInsideVisits(true);
  }

  // Advertencia de "persona vetada": se busca con debounce mientras
  // recepción escribe el nombre, comparando por nombre normalizado (no
  // importa mayúsculas/espacios). Solo informativo -- nunca bloquea el
  // registro, recepción decide si continúa.
  useEffect(() => {
    if (!visitorName.trim()) {
      setFlaggedWarning(null);
      return;
    }
    // "cancelled" además de limpiar el timeout: si la consulta ya salió,
    // limpiar el timeout no la detiene, y una respuesta lenta de un nombre
    // anterior podía llegar después de otro más nuevo -- colgándole la
    // advertencia de "comportamiento violento/hostil" a la persona
    // equivocada, que es una acusación seria.
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      findFlaggedVisitor(visitorName).then((match) => {
        if (!cancelled) setFlaggedWarning(match);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [visitorName]);

  useEffect(() => {
    if (!scannerOpen) return;

    const scanner = new Html5Qrcode(QR_REGION_ID);
    let cancelled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          setScannerOpen(false);
          handleScanResult(decodedText);
        },
        () => {}
      )
      .catch(() => {
        if (!cancelled) setScanError("No se pudo acceder a la cámara.");
      });

    return () => {
      cancelled = true;
      // scanner.stop() puede tronar de forma SÍNCRONA (no solo rechazar su
      // promesa) si se cancela/desmonta antes de que start() terminara de
      // iniciar la cámara (permiso denegado, o "Cancelar escaneo" muy
      // rápido) -- sin este try/catch esa excepción escapaba del cleanup
      // del efecto, React desmontaba todo el árbol, y el ErrorBoundary
      // global mostraba "Algo salió mal" al navegar a otra sección después
      // de cancelar. clear() además solo se llama si el contenedor del
      // lector sigue en el DOM: si scannerOpen ya cambió a false en el
      // mismo render que desmontó esta pantalla, React ya lo quitó y
      // html5-qrcode no debe tocar un nodo que ya no existe.
      try {
        const state = scanner.getState();
        const wasRunning =
          state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED;
        const clearIfPresent = () => {
          if (document.getElementById(QR_REGION_ID)) scanner.clear();
        };
        if (wasRunning) {
          scanner.stop().catch(() => {}).finally(clearIfPresent);
        } else {
          clearIfPresent();
        }
      } catch {
        // Cancelar/desmontar nunca debe tronar la pantalla, aunque
        // html5-qrcode lance algo inesperado aquí.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen]);

  async function handleScanResult(scannedToken: string) {
    setError(null);
    setScanError(null);

    // El QR trae access_token, no el id interno de la fila (ver migración
    // 0041) — recepción sigue viendo la fila completa vía RLS normal, esto
    // solo cambia por qué columna se busca.
    const { data, error: lookupError } = await supabase
      .from("visit_preregistrations")
      .select("*")
      .eq("access_token", scannedToken)
      .maybeSingle();

    if (lookupError || !data) {
      setError("No se encontró el pre-registro escaneado.");
      return;
    }

    if (data.status === "cancelada" || data.status === "vencida") {
      setError(`Este pre-registro está marcado como "${data.status}" y ya no es válido.`);
      return;
    }

    // El QR sigue sirviendo para reingresos hasta 7 días después de la
    // visita original: la misma persona puede volver dentro de esa semana
    // sin volver a llenar el pre-registro, solo confirmando fecha de hoy.
    const expiresOn = data.extended_until ?? addDays(data.visit_date, 7);
    if (todayLocal() > expiresOn) {
      setError(`Este pre-registro venció el ${formatDate(expiresOn)}. Pide uno nuevo para volver a ingresar.`);
      return;
    }

    // La empresa anfitriona del formulario se ajusta a la del pre-registro
    // escaneado, en vez de exigir que ya coincidiera con lo seleccionado.
    // Un pre-registro puede traer una empresa o un colaborador que ya se
    // desactivó desde que se generó el QR. Si se cargaran tal cual, el
    // selector quedaría en blanco (porque ese id no está entre las
    // opciones activas) sin decir por qué: la empresa se vería vacía pero
    // obligatoria, y el colaborador quedaría vacío Y sin marcar como
    // obligatorio, dejando registrar la visita sin anfitrión visible.
    const scannedHostId = data.host_employee_id ?? "";
    const companyMissing = !companies.some((company) => company.id === data.company_id);
    const hostMissing = !!scannedHostId && !employees.some((employee) => employee.id === scannedHostId);

    setSelectedCompanyId(companyMissing ? "" : data.company_id);
    setVisitorName(data.visitor_name);
    setVisitorCompany(data.visitor_company ?? "");
    setVisitorPhone((data as { visitor_phone?: string }).visitor_phone ?? "");
    setVisitorEmail((data as { visitor_email?: string }).visitor_email ?? "");
    setHostEmployeeId(hostMissing ? "" : scannedHostId);

    if (companyMissing || hostMissing) {
      const faltantes = [companyMissing ? "la empresa anfitriona" : null, hostMissing ? "el colaborador que recibe" : null]
        .filter(Boolean)
        .join(" y ");
      setError(`Este pre-registro traía ${faltantes} con un registro que ya no está activo. Vuelve a seleccionarlo antes de registrar la visita.`);
    }
    const scannedVisitType = (data as { visit_type?: string }).visit_type ?? "";
    if (scannedVisitType && !visitTypes.some((option) => option.name === scannedVisitType)) {
      setVisitType(OTROS_SENTINEL);
      setCustomVisitType(scannedVisitType);
    } else {
      setVisitType(scannedVisitType);
      setCustomVisitType("");
    }
    setHasVehicle((data as { has_vehicle?: boolean }).has_vehicle ?? false);
    setVehiclePlate((data as { vehicle_plate?: string }).vehicle_plate ?? "");
    setVehicleColor((data as { vehicle_color?: string }).vehicle_color ?? "");
    setVehicleModel((data as { vehicle_model?: string }).vehicle_model ?? "");
    setReason(data.reason ?? "");
    // Fecha y hora se autocompletan con el momento real del escaneo, no con
    // lo que traía el pre-registro (que pudo haberse creado para otro día u
    // otra hora) — así siempre queda la entrada real, aunque se reutilice.
    setVisitDate(todayLocal());
    setVisitTime(nowTimeLocal());
    setDivision((data as { division?: string }).division ?? "");
    setPreregistrationId(data.id);
    setPreregistrationDate(data.visit_date);
    setPreregistrationExpiresOn(expiresOn);
    setPreregistrationReused(data.status === "usada");
    setPreregistrationCustomAnswers(
      (data as { custom_answers?: typeof preregistrationCustomAnswers }).custom_answers ?? null
    );
  }

  function resetForm() {
    setAttemptedSubmit(false);
    setSlackWarning(null);
    setVisitorName("");
    setVisitorCompany("");
    setVisitorPhone("");
    setVisitorEmail("");
    setSelectedCompanyId(companyId ?? "");
    setHostEmployeeId("");
    setVisitType("");
    setCustomVisitType("");
    setHasVehicle(false);
    setVehiclePlate("");
    setVehicleColor("");
    setVehicleModel("");
    setReason("");
    setDivision("");
    setFacility("");
    setVisitDate(todayLocal());
    setVisitTime("");
    setPhotoSessionId(randomId());
    setPhotoResetSignal((n) => n + 1);
    setVisitorPhotoUploaded(false);
    setIdPhotoUploaded(false);
    setPreregistrationId(null);
    setPreregistrationDate(null);
    setPreregistrationExpiresOn(null);
    setPreregistrationReused(false);
    setPreregistrationCustomAnswers(null);
  }

  function startNewRegistration() {
    if (autoResetTimeoutRef.current !== null) {
      window.clearTimeout(autoResetTimeoutRef.current);
      autoResetTimeoutRef.current = null;
    }
    resetForm();
    setFolio(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAttemptedSubmit(true);

    if (!selectedCompanyId || !session?.user) {
      setError("Selecciona la empresa anfitriona.");
      return;
    }

    // Los campos de texto de abajo eran "required" solo a nivel HTML, que
    // considera "   " (puros espacios) un valor válido -- un tester
    // confirmó que así se puede registrar una visita con nombre/empresa/
    // motivo en blanco. Se valida el valor recortado, y se guarda ESE valor
    // recortado (no el original con espacios de sobra).
    const trimmedVisitorName = visitorName.trim();
    const trimmedVisitorCompany = visitorCompany.trim();
    const trimmedReason = reason.trim();

    if (!trimmedVisitorName) {
      setError("Escribe el nombre del visitante.");
      return;
    }
    if (!isValidName(trimmedVisitorName)) {
      setError(NAME_INVALID_MESSAGE);
      return;
    }
    if (!trimmedVisitorCompany) {
      setError("Escribe la empresa del visitante.");
      return;
    }
    if (!hostEmployeeId) {
      setError("Selecciona el colaborador que recibe.");
      return;
    }
    if (!trimmedReason) {
      setError("Escribe el motivo de la visita.");
      return;
    }
    if (visitorEmail && !isValidEmailFormat(visitorEmail)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    if (!visitorPhotoUploaded || !idPhotoUploaded) {
      setError("Debes capturar la foto del visitante y la foto del INE.");
      return;
    }

    const resolvedVisitType = visitType === OTROS_SENTINEL ? customVisitType.trim() : visitType;
    if (!resolvedVisitType) {
      setError("Escribe el tipo de visita.");
      return;
    }

    if (facilitiesLoading || divisionsLoading) {
      setError("Espera a que terminen de cargar las opciones del registro.");
      return;
    }
    if (hasFacilities && !facility) {
      setError("Selecciona qué instalación visitan.");
      return;
    }

    setSubmitting(true);
    setSlackWarning(null);

    // Las fotos ya se subieron al elegirlas (PhotoUploadField) — misma ruta
    // que se usó entonces, calculada igual con selectedCompanyId +
    // photoSessionId, que no cambiaron desde entonces.
    const visitorPhotoPath = `${selectedCompanyId}/${photoSessionId}/visitante.jpg`;
    const idPhotoPath = `${selectedCompanyId}/${photoSessionId}/ine.jpg`;

    const { data, error: insertError } = await supabase
      .from("visits")
      .insert({
        company_id: selectedCompanyId,
        visitor_name: trimmedVisitorName,
        visitor_company: trimmedVisitorCompany,
        visitor_phone: visitorPhone || null,
        visitor_email: visitorEmail || null,
        host_employee_id: hostEmployeeId,
        visit_type: resolvedVisitType,
        has_vehicle: hasVehicle,
        vehicle_plate: hasVehicle ? vehiclePlate || null : null,
        vehicle_color: hasVehicle ? vehicleColor || null : null,
        vehicle_model: hasVehicle ? vehicleModel || null : null,
        reason: trimmedReason,
        division: hasDivisions ? division || null : null,
        // visit_date se manda explícitamente: el default de la columna es
        // current_date, que Postgres evalúa en la zona de la BD (UTC), así
        // que a partir de las ~18:00 hora de Monterrey toda visita quedaba
        // fechada MAÑANA -- desaparecía de "visitantes dentro" (que filtra
        // por la fecha local del navegador), salía con folio del día
        // siguiente, y la fecha que capturó recepción se descartaba.
        visit_date: visitDate,
        // La columna facility solo existe donde ya se aplicó la migración
        // 0075: si esta oficina no tiene instalaciones configuradas, la
        // llave ni siquiera se manda, para no romper el insert completo
        // (PostgREST rechaza la fila entera si nombra una columna que no
        // existe en el esquema).
        //
        // matchedFacility se busca por LABEL (lo que de verdad guarda
        // `facility` en el estado, ver el <select> más abajo), nunca por
        // nombre plano: para superadmin el label incluye la oficina entre
        // paréntesis ("Envia.com (Madrid)") para desambiguar, porque
        // "Envia.com" existe tanto en Monterrey como en Madrid. Se guarda
        // matchedFacility.name (el nombre limpio) en la columna facility,
        // no el label completo -- así Historial.tsx sigue mostrando
        // "Envia.com" igual que para cualquier otra cuenta, y el país lo
        // distingue aparte con la bandera de office_id.
        ...(hasFacilities ? { facility: matchedFacility?.name ?? facility ?? null } : {}),
        // Prioriza la oficina fija de la cuenta (siempre correcta si
        // existe) SOLO si no es superadmin -- un superadmin nunca debe
        // quedar atado a la oficina de su propio perfil, aunque la tenga
        // asignada: usa siempre la de la instalación que de verdad eligió.
        // Si la cuenta no tiene oficina propia (superadmin, o admin sin
        // restricción), usa la de la instalación elegida.
        office_id: (!isSuperadmin && profile?.office_id) || matchedFacility?.officeId || null,
        visitor_photo_path: visitorPhotoPath,
        id_photo_path: idPhotoPath,
        created_by: session.user.id,
        preregistration_id: preregistrationId,
      })
      .select("id, folio")
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      console.error(insertError);
      setError("No se pudo registrar la visita. Intenta de nuevo.");
      return;
    }

    clearViewCache("dashboard:");
    clearViewCache("history:");
    clearViewCache("checkin:inside:");

    if (preregistrationId) {
      // Al reutilizar el mismo QR en un reingreso, la fecha/hora del
      // pre-registro se actualiza a las de este check-in real (no se queda
      // pegado a cuando se generó originalmente) — y de paso "renueva" los
      // 7 días de vigencia contados desde este último uso.
      await supabase
        .from("visit_preregistrations")
        .update({
          status: "usada",
          used_at: new Date().toISOString(),
          visit_date: visitDate,
          visit_time: visitTime || null,
        })
        .eq("id", preregistrationId);
    }

    // No bloquea el registro de la visita si Slack falla o tarda: es un
    // aviso de mejor esfuerzo, no parte del flujo crítico de check-in. Pero
    // SÍ se le avisa a recepción si falló -- antes esto quedaba solo en
    // consola (nadie lo veía) y notify-slack regresa 200 con
    // { skipped: "..." } incluso cuando no mandó nada (colaborador sin
    // slack_id, token no configurado, etc.), así que un simple chequeo de
    // "error" no bastaba para detectarlo.
    supabase.functions.invoke("notify-slack", { body: { visitId: data.id } }).then(({ data: notifyData, error: notifyError }) => {
      if (notifyError || notifyData?.skipped) {
        console.error("No se pudo notificar por Slack:", notifyError ?? notifyData?.skipped);
        setSlackWarning("La visita se registró, pero no se pudo avisar por Slack a quien recibe.");
      }
    });

    setFolio(data.folio);
    void loadInsideVisits(true);

    // Se limpia solo a los 5 segundos -- da tiempo a ver/verificar el folio
    // y el pase generado antes de que desaparezcan, sin que nadie tenga que
    // darle clic manual a "Registrar otra visita" (startNewRegistration ya
    // cancela este timeout si sí le dan clic antes).
    autoResetTimeoutRef.current = window.setTimeout(() => {
      startNewRegistration();
    }, 5000);
  }

  const hostEmployeeName = employees.find((employee) => employee.id === hostEmployeeId)?.full_name;
  const companyName = companies.find((company) => company.id === selectedCompanyId)?.name ?? null;
  const divisions = allDivisions.filter((item) => item.company_id === selectedCompanyId);
  const hasDivisions = divisions.length > 0;
  const hasFacilities = officeFacilities.length > 0;
  // `facility` (el estado) guarda el LABEL mostrado en el <select> (no el
  // nombre plano) para poder desambiguar "Envia.com (Madrid)" de
  // "Envia.com (Monterrey)" cuando superadmin ve instalaciones de varios
  // países a la vez -- este es el único lugar que lo resuelve de vuelta a
  // su nombre limpio y su oficina real, para el insert de la visita.
  const matchedFacility = officeFacilities.find((f) => f.label === facility);

  return (
    <div className="bg-paper">
      <PageShell width="medium">
        <PageHeader
          title="Registrar visita"
          description="Captura los datos y verifica el pase antes de registrar la entrada."
          actions={
            <>
              <button
                type="button"
                onClick={async () => {
                  if (!canCopyPreregLink || !profile) return;
                  const ok = await copyToClipboard(preregistrationLink(window.location.origin, profile.office_id));
                  setLinkCopied(ok);
                }}
                disabled={!canCopyPreregLink}
                className="rounded-md border border-accent bg-card px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-tint disabled:opacity-50"
              >
                {linkCopied === true
                  ? "¡Copiada!"
                  : linkCopied === false
                    ? "No se pudo, cópiala tú"
                    : "Copiar liga de pre-registro"}
              </button>
              <button
                type="button"
                onClick={() => setTab(tab === "registrar" ? "dentro" : "registrar")}
                className="text-sm font-medium text-accent hover:text-accent-dark"
              >
                {tab === "registrar"
                  ? `Ver visitantes dentro${insideVisits.length > 0 ? ` (${insideVisits.length})` : ""}`
                  : "Volver a registrar"}
              </button>
            </>
          }
        />

        {tab === "dentro" ? (
          <div>
            {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}
            <div className="card min-h-80 overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="tbl-head border-b border-line text-ink-soft">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Folio</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Empresa</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">A quién visita</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Hora de entrada</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {insideLoading && <TableSkeletonRows rows={5} columns={6} />}
                {!insideLoading && insideVisits.length === 0 && (
                  <tr>
                    <td colSpan={6} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                      No hay visitantes dentro en este momento.
                    </td>
                  </tr>
                )}
                {!insideLoading && insideVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                    <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
                    <td className="px-4 py-3 text-ink-soft">{visit.companies?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(visit.check_in_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setCheckoutTarget(visit)}
                        className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Registrar salida
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0 space-y-5">
              {!scannerOpen && !preregistrationId && (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center rounded-md border border-accent bg-card px-4 py-2 text-sm font-medium text-accent hover:bg-accent-tint"
                >
                  Escanear QR de pre-registro
                </button>
              )}

              {scannerOpen && (
                <div className="card">
                  <div id={QR_REGION_ID} className="mx-auto w-full max-w-xs" />
                  {scanError && <p className="mt-2 text-sm text-danger">{scanError}</p>}
                  <button
                    type="button"
                    onClick={() => setScannerOpen(false)}
                    className="mt-3 text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Cancelar escaneo
                  </button>
                </div>
              )}

              {preregistrationId && (
                <div className="rounded-lg border border-accent bg-accent-tint p-3 text-sm text-accent-dark">
                  <p>
                    {preregistrationReused
                      ? "Este visitante ya ingresó antes con este mismo pre-registro"
                      : "Datos cargados desde un pre-registro"}
                    {preregistrationDate ? ` (originalmente para el ${formatDate(preregistrationDate)})` : ""}.
                    Confirma los datos y la fecha de hoy, toma las fotos y envía.
                    {preregistrationExpiresOn
                      ? ` Vigente para reingresos hasta el ${formatDate(preregistrationExpiresOn)}.`
                      : ""}
                  </p>
                  {preregistrationCustomAnswers && Object.keys(preregistrationCustomAnswers).length > 0 && (
                    <dl className="mt-2 space-y-0.5">
                      {Object.values(preregistrationCustomAnswers).map((answer, i) => (
                        <div key={i} className="flex gap-1">
                          <dt className="font-medium">{answer.label_es || answer.label_en}:</dt>
                          <dd>{answer.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <button
                    type="button"
                    onClick={resetForm}
                    className="mt-1 text-sm font-medium underline hover:no-underline"
                  >
                    Quitar y llenar a mano
                  </button>
                </div>
              )}

              <div className="card">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-accent">
                  Datos de la visita
                </h2>
                <div className="mb-5 mt-2 border-b border-line" />

                <form
                  id="checkin-form"
                  onSubmit={handleSubmit}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div>
                    <label htmlFor="visitorName" className="mb-1 block text-sm font-medium text-ink-soft">
                      Nombre del visitante <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitorName"
                      type="text"
                      required
                      disabled={!!folio}
                      value={visitorName}
                      onChange={(e) => setVisitorName(filterNameInput(e.target.value))}
                      className={inputClass}
                    />
                    {flaggedWarning && (
                      <p className="mt-1.5 rounded-md border border-danger bg-danger/10 px-2 py-1.5 text-xs font-medium text-danger">
                        ⚠️ Esta persona fue marcada antes por comportamiento violento/hostil
                        {flaggedWarning.note ? `: "${flaggedWarning.note}"` : "."}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
                      Empresa del visitante <span className="text-accent">*</span>
                    </label>
                    <AutoCompleteInput
                      id="visitorCompany"
                      required
                      disabled={!!folio}
                      placeholder="Ej. DHL, CFE, Amazon"
                      suggestions={visitorCompanySuggestions}
                      value={visitorCompany}
                      onChange={setVisitorCompany}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="hostCompany" className="mb-1 block text-sm font-medium text-ink-soft">
                      Empresa anfitriona <span className="text-accent">*</span>
                    </label>
                    <select
                      id="hostCompany"
                      required
                      disabled={!!folio}
                      value={selectedCompanyId}
                      onChange={(e) => {
                        setSelectedCompanyId(e.target.value);
                        setDivision("");
                      }}
                      className={plainSelectClass}
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
                      Colaborador que recibe <span className="text-accent">*</span>
                    </label>
                    <SearchableSelect
                      id="hostEmployee"
                      required
                      disabled={!!folio}
                      placeholder="Escribe para buscar..."
                      options={employees.map((employee) => ({ id: employee.id, label: employee.full_name }))}
                      value={hostEmployeeId}
                      onChange={setHostEmployeeId}
                      className={invalidSelectClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitType" className="mb-1 block text-sm font-medium text-ink-soft">
                      Tipo de visita <span className="text-accent">*</span>
                    </label>
                    <select
                      id="visitType"
                      required
                      disabled={!!folio}
                      value={visitType}
                      onChange={(e) => {
                        setVisitType(e.target.value);
                        setCustomVisitType("");
                      }}
                      className={invalidSelectClass}
                    >
                      <option value="" disabled></option>
                      {visitTypes.map((option) => (
                        <option key={option.id} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                      <option value={OTROS_SENTINEL}>Otros</option>
                    </select>
                  </div>

                  {visitType === OTROS_SENTINEL && (
                    <div>
                      <label htmlFor="customVisitType" className="mb-1 block text-sm font-medium text-ink-soft">
                        Especifica el tipo de visita <span className="text-accent">*</span>
                      </label>
                      <input
                        id="customVisitType"
                        type="text"
                        required
                        disabled={!!folio}
                        value={customVisitType}
                        onChange={(e) => setCustomVisitType(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}

                  {selectedCompanyId && divisionsLoading ? (
                    <div className="sm:col-span-2" aria-hidden="true">
                      <Skeleton className="mb-2 h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : hasDivisions ? (
                    <div className="sm:col-span-2">
                      <label htmlFor="division" className="mb-1 block text-sm font-medium text-ink-soft">
                        División <span className="text-accent">*</span>
                      </label>
                      <select
                        id="division"
                        required
                        disabled={!!folio}
                        value={division}
                        onChange={(e) => setDivision(e.target.value)}
                        className={invalidSelectClass}
                      >
                        <option value="" disabled></option>
                        {divisions.map((option) => (
                          <option key={option.id} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {facilitiesLoading ? (
                    <div aria-hidden="true">
                      <Skeleton className="mb-2 h-4 w-44" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : hasFacilities ? (
                    <div>
                      <label htmlFor="facility" className="mb-1 block text-sm font-medium text-ink-soft">
                        Instalación que visitan <span className="text-accent">*</span>
                      </label>
                      <select
                        id="facility"
                        required
                        disabled={!!folio}
                        value={facility}
                        onChange={(e) => setFacility(e.target.value)}
                        className={invalidSelectClass}
                      >
                        <option value="" disabled></option>
                        {officeFacilities.map((option) => (
                          <option key={option.id} value={option.label}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="visitorPhone" className="mb-1 block text-sm font-medium text-ink-soft">
                      Teléfono
                    </label>
                    <input
                      id="visitorPhone"
                      type="tel"
                      inputMode="numeric"
                      disabled={!!folio}
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(filterPhoneInput(e.target.value))}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitorEmail" className="mb-1 block text-sm font-medium text-ink-soft">
                      Correo electrónico
                    </label>
                    <input
                      id="visitorEmail"
                      type="email"
                      disabled={!!folio}
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(filterEmailInput(e.target.value))}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitDate" className="mb-1 block text-sm font-medium text-ink-soft">
                      Fecha de la visita <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitDate"
                      type="date"
                      required
                      disabled={!!folio}
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitTime" className="mb-1 block text-sm font-medium text-ink-soft">
                      Hora <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitTime"
                      type="time"
                      required
                      disabled={!!folio}
                      value={visitTime}
                      onChange={(e) => setVisitTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-soft">
                      Motivo <span className="text-accent">*</span>
                    </label>
                    <input
                      id="reason"
                      type="text"
                      required
                      disabled={!!folio}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </form>
              </div>

              <div className="card">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-accent">
                  Fotografías
                </h2>
                <p className="mt-1 text-xs text-ink-soft">Agrega la foto del visitante y de su identificación.</p>
                <div className="mb-4 mt-3 border-b border-line" />

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <PhotoUploadField
                    label="Fotografía del visitante"
                    companyId={selectedCompanyId}
                    sessionId={photoSessionId}
                    fileName="visitante.jpg"
                    disabled={!!folio || !selectedCompanyId}
                    resetSignal={photoResetSignal}
                    onUploadedChange={setVisitorPhotoUploaded}
                    onPreviewChange={setVisitorPhotoPreview}
                  />

                  <PhotoUploadField
                    label="Fotografía del ID"
                    companyId={selectedCompanyId}
                    sessionId={photoSessionId}
                    fileName="ine.jpg"
                    disabled={!!folio || !selectedCompanyId}
                    resetSignal={photoResetSignal}
                    onUploadedChange={setIdPhotoUploaded}
                  />
                </div>
              </div>
            </div>

            <div className="lg:sticky lg:top-6">
              <div className="rounded-lg bg-ink p-5 text-white shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Pase de visitante
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                    {folio ?? "Sin folio"}
                  </span>
                </div>

                <div className="flex h-40 items-center justify-center overflow-hidden rounded-md bg-ink-soft">
                  {visitorPhotoPreview ? (
                    <img
                      src={visitorPhotoPreview}
                      alt="Foto del visitante"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-white/40">Sin foto</span>
                  )}
                </div>

                <p className="mt-4 font-display text-lg font-bold text-white">
                  {visitorName || "Nombre del visitante"}
                </p>
                <p className="text-sm text-white/50">{visitorCompany || "Empresa del visitante"}</p>

                <dl className="mt-4 divide-y divide-white/10 text-sm">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Visita a</dt>
                    <dd className="text-white">{companyName ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Recibe</dt>
                    <dd className="text-white">{hostEmployeeName ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Tipo de visita</dt>
                    <dd className="text-white">
                      {(visitType === OTROS_SENTINEL ? customVisitType : visitType) || "—"}
                    </dd>
                  </div>
                  {hasVehicle && (
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-white/50">Vehículo</dt>
                      <dd className="text-white">
                        {vehicleColor} {vehicleModel} · {vehiclePlate}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Fecha</dt>
                    <dd className="text-white">{visitDate ? formatDate(visitDate) : "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Hora</dt>
                    <dd className="text-white">{visitTime || "—"}</dd>
                  </div>
                </dl>
              </div>

              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              {slackWarning && <p className="mt-3 text-sm text-warn">{slackWarning}</p>}

              <button
                type="submit"
                form="checkin-form"
                disabled={submitting || facilitiesLoading || divisionsLoading || !!folio}
                className="btn-primary mt-4 h-auto w-full py-3"
              >
                {folio ? "Pase generado" : submitting ? "Registrando..." : "Registrar visita"}
              </button>

              {folio && (
                <button
                  type="button"
                  onClick={startNewRegistration}
                  className="mt-2 w-full text-center text-sm font-medium text-accent hover:text-accent-dark"
                >
                  Registrar otra visita
                </button>
              )}

              <p className="mt-2 text-center text-xs text-ink-soft">Verifica el pase antes de registrar</p>
            </div>
          </div>
        )}
      </PageShell>

      <ConfirmDialog
        open={!!checkoutTarget}
        title="¿Registrar la salida de este visitante?"
        message={checkoutTarget ? `Se registrará la salida de ${checkoutTarget.visitor_name}.` : undefined}
        onConfirm={async () => {
          if (checkoutTarget) await handleCheckout(checkoutTarget);
          setCheckoutTarget(null);
        }}
        onCancel={() => {
          setCheckoutTarget(null);
          setCheckoutFlagged(false);
          setCheckoutNote("");
        }}
      >
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={checkoutFlagged}
            onChange={(e) => setCheckoutFlagged(e.target.checked)}
            className="mt-0.5"
          />
          <span>¿Esta persona tuvo un comportamiento violento/hostil?</span>
        </label>
        {checkoutFlagged && (
          <textarea
            value={checkoutNote}
            onChange={(e) => setCheckoutNote(e.target.value)}
            placeholder="Nota (opcional) — qué pasó"
            rows={2}
            className="input-field mt-2 h-auto w-full py-2 text-sm"
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
