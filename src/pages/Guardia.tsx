import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/lib/version";
import { normalizeVisitorName } from "@/lib/flaggedVisitors";
import { COUNTRY_FLAGS } from "@/lib/countryFlags";
import { Skeleton } from "@/components/Skeleton";
import type { Tables } from "@/integrations/supabase/types";

type InsideVisit = Pick<
  Tables<"visits">,
  "id" | "folio" | "visitor_name" | "check_in_at" | "visitor_photo_path" | "id_photo_path"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  companies: Pick<Tables<"companies">, "name"> | null;
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// Aviso de "persona vetada" reutilizable entre el recuadro de la lista y
// el detalle -- mismo texto en los dos lugares.
function FlaggedBadge() {
  return (
    <p className="mt-1 rounded-md border border-[#f44336] bg-[#f44336]/10 px-2 py-1 text-xs font-semibold text-[#f44336]">
      ⚠️ Comportamiento violento/hostil reportado antes
    </p>
  );
}

// Vista de solo lectura para guardias de seguridad. A propósito no reutiliza
// AppHeader/Layout (que traen links a Historial, Panel de control, etc.) —
// un guardia solo debe ver esto y nada más. Pensada para celular: recuadros
// grandes y tocables en vez de una tabla, que en pantallas angostas obliga a
// hacer scroll horizontal.
export default function Guardia() {
  const { profile, signOut } = useAuth();
  // office_id null = sin oficina asignada -- no se muestra nada, mismo
  // criterio que AppHeader.tsx. Se trae el nombre completo (no solo el
  // país) porque México tiene dos oficinas.
  const [office, setOffice] = useState<{ name: string; country: string } | null>(null);
  const [visits, setVisits] = useState<InsideVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // Nombres normalizados (de flagged_visitors) que coinciden con alguna de
  // las visitas actualmente dentro -- solo informativo, guardia no puede
  // marcar ni desmarcar a nadie, es de solo lectura igual que todo lo demás
  // en esta pantalla.
  const [flaggedNames, setFlaggedNames] = useState<Set<string>>(new Set());

  const [selectedVisit, setSelectedVisit] = useState<InsideVisit | null>(null);
  const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(null);
  const [idPhotoLoading, setIdPhotoLoading] = useState(false);
  const [idPhotoError, setIdPhotoError] = useState<string | null>(null);

  async function loadInsideVisits() {
    setLoading(true);
    // La política de RLS para guardia ya limita esto a status = "dentro":
    // aunque se quitara este filtro aquí, nunca podría ver historial.
    const { data } = await supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, visitor_photo_path, id_photo_path, employees(full_name), companies(name)"
      )
      .eq("status", "dentro")
      .order("check_in_at", { ascending: false });

    const nextVisits = (data as InsideVisit[] | null) ?? [];
    setVisits(nextVisits);
    setLoading(false);

    // Una sola consulta por refresco (no una por persona): solo los
    // nombres normalizados de quienes están dentro ahora mismo.
    const namesToCheck = Array.from(new Set(nextVisits.map((v) => normalizeVisitorName(v.visitor_name))));
    if (namesToCheck.length > 0) {
      const { data: flagged } = await supabase
        .from("flagged_visitors")
        .select("normalized_name")
        .in("normalized_name", namesToCheck);
      setFlaggedNames(new Set((flagged ?? []).map((f) => f.normalized_name).filter((n): n is string => !!n)));
    } else {
      setFlaggedNames(new Set());
    }

    // La foto del visitante se muestra directamente en cada recuadro, así
    // que sus URLs firmadas (de solo lectura, expiran solas) se piden todas
    // de una vez; la del INE se pide solo al abrir el detalle, para no
    // generar URLs de más de un documento sensible que nadie vaya a ver.
    const signed = await Promise.all(
      nextVisits.map((visit) =>
        supabase.storage.from("visit-photos").createSignedUrl(visit.visitor_photo_path, 300)
      )
    );
    setPhotoUrls((prev) => {
      const next = { ...prev };
      nextVisits.forEach((visit, i) => {
        const url = signed[i].data?.signedUrl;
        if (url) next[visit.id] = url;
      });
      return next;
    });
  }

  useEffect(() => {
    loadInsideVisits();
    const interval = setInterval(loadInsideVisits, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const officeId = profile?.office_id;
    if (!officeId) {
      setOffice(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("offices")
      .select("name, country")
      .eq("id", officeId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setOffice(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.office_id]);

  async function openDetail(visit: InsideVisit) {
    setSelectedVisit(visit);
    setIdPhotoUrl(null);
    setIdPhotoError(null);
    setIdPhotoLoading(true);

    const { data, error } = await supabase.storage
      .from("visit-photos")
      .createSignedUrl(visit.id_photo_path, 300);

    setIdPhotoLoading(false);
    if (error || !data) {
      setIdPhotoError("No se pudo cargar la foto del INE.");
      return;
    }
    setIdPhotoUrl(data.signedUrl);
  }

  function closeDetail() {
    setSelectedVisit(null);
    setIdPhotoUrl(null);
    setIdPhotoError(null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-10 bg-ink text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="PassHub" className="h-8 w-auto" />
            <div>
              <h1 className="font-display text-base font-bold leading-tight">
                PassHub
              </h1>
              <p className="text-xs text-white/50">Guardia</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {office && (
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
                <span className="text-lg leading-none">{COUNTRY_FLAGS[office.country] ?? ""}</span>
                {office.name}
              </span>
            )}
            <button type="button" onClick={() => signOut()} className="text-xs text-white/50 hover:text-white/80">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#1d1d1f]">
            Personas dentro{visits.length > 0 ? ` (${visits.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={loadInsideVisits}
            className="text-base font-semibold text-[#1873dc] hover:text-[#1463be]"
          >
            Actualizar
          </button>
        </div>

        {!loading && visits.length === 0 && (
          <p className="rounded-lg border border-[#b8b8b8] bg-white p-6 text-center text-base text-[#6c757d]">
            No hay visitantes dentro en este momento.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl border border-[#b8b8b8] bg-white p-3"
              >
                <Skeleton className="mb-2 h-24 w-24 rounded-full" />
                <Skeleton className="mb-1 h-4 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          {visits.map((visit) => (
            <button
              key={visit.id}
              type="button"
              onClick={() => openDetail(visit)}
              className="flex flex-col items-center overflow-hidden rounded-xl border border-[#b8b8b8] bg-white p-3 text-center shadow-sm transition-transform active:scale-95"
            >
              <div className="mb-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#f7f7f7]">
                {photoUrls[visit.id] ? (
                  <img
                    src={photoUrls[visit.id]}
                    alt={visit.visitor_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-3xl font-bold text-[#6c757d]">
                    {initialOf(visit.visitor_name)}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-base font-semibold text-[#1d1d1f]">{visit.visitor_name}</p>
              <p className="mt-1 text-sm text-[#6c757d]">
                {formatDate(visit.check_in_at)} · {formatTime(visit.check_in_at)}
              </p>
              {flaggedNames.has(normalizeVisitorName(visit.visitor_name)) && <FlaggedBadge />}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-sm text-[#6c757d]">
          Se actualiza sola cada 30 segundos. Toca un recuadro para ver todos los datos, la foto y el
          INE. Solo puedes ver quién está dentro en este momento — no puedes editar, borrar ni
          registrar nada.
        </p>
      </div>

      <footer className="px-4 py-2 text-right text-[10px] text-[#6c757d]" aria-label="Versión de PassHub">
        {APP_VERSION}
      </footer>

      {selectedVisit && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-ink px-4 py-3 text-white">
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-bold">{selectedVisit.visitor_name}</h3>
              {flaggedNames.has(normalizeVisitorName(selectedVisit.visitor_name)) && (
                <span className="text-xs font-semibold text-[#ff6b6b]">
                  ⚠️ Comportamiento violento/hostil reportado antes
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className="shrink-0 text-sm font-medium text-white/70 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          <div className="mx-auto max-w-md p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-semibold text-[#6c757d]">Foto del visitante</p>
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[#b8b8b8] bg-white">
                  {photoUrls[selectedVisit.id] ? (
                    <img
                      src={photoUrls[selectedVisit.id]}
                      alt="Foto del visitante"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-base text-[#6c757d]">Sin foto</span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold text-[#6c757d]">INE</p>
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[#b8b8b8] bg-white">
                  {idPhotoLoading && <span className="text-base text-[#6c757d]">Cargando...</span>}
                  {idPhotoError && <span className="p-3 text-center text-base text-[#f44336]">{idPhotoError}</span>}
                  {idPhotoUrl && (
                    <img src={idPhotoUrl} alt="Foto del INE" className="h-full w-full object-cover" />
                  )}
                </div>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-[#e9e9e9] rounded-lg border border-[#b8b8b8] bg-white px-4 text-base">
              <div className="flex justify-between py-3">
                <dt className="text-[#6c757d]">Folio</dt>
                <dd className="font-semibold text-[#1d1d1f]">{selectedVisit.folio}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[#6c757d]">Empresa</dt>
                <dd className="font-semibold text-[#1d1d1f]">{selectedVisit.companies?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[#6c757d]">A quién visita</dt>
                <dd className="font-semibold text-[#1d1d1f]">{selectedVisit.employees?.full_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[#6c757d]">Día de entrada</dt>
                <dd className="font-semibold text-[#1d1d1f]">{formatDate(selectedVisit.check_in_at)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[#6c757d]">Hora de entrada</dt>
                <dd className="font-semibold text-[#1d1d1f]">{formatTime(selectedVisit.check_in_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
