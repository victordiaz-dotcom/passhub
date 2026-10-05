import { useEffect, useId, useRef, useState } from "react";
import { Camera, ChevronDown, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Mismos límites que ya aplica el bucket visit-photos en Supabase (Storage
// los hace cumplir de verdad); esto solo adelanta el aviso al usuario antes
// de gastar una subida que el servidor rechazaría de todos modos.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// La cámara de un celular sin comprimir puede pesar varios MB por foto —
// con dos fotos por visita (visitante + INE) y sin ningún límite de
// antigüedad, eso llena el 1GB del plan Free de Storage en días, no en
// meses, en cuanto haya tráfico real de varias oficinas. Se reduce cada
// foto a un tamaño más razonable antes de subirla, manteniendo suficiente
// resolución para que el INE siga siendo legible.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    // HEIC en navegadores que no lo decodifican vía canvas, o cualquier
    // otro fallo al comprimir: nunca debe bloquear el registro de la
    // visita, se sube el archivo original tal cual.
    return file;
  }
}

type PhotoUploadFieldProps = {
  label: string;
  companyId: string;
  sessionId: string;
  fileName: string;
  disabled?: boolean;
  resetSignal: number;
  onUploadedChange: (uploaded: boolean) => void;
  onPreviewChange?: (url: string | null) => void;
};

export function PhotoUploadField({
  label,
  companyId,
  sessionId,
  fileName,
  disabled,
  resetSignal,
  onUploadedChange,
  onPreviewChange,
}: PhotoUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const uploadedPathRef = useRef<string | null>(null);
  const uploadSequenceRef = useRef(0);
  const currentPathRef = useRef<string | null>(null);

  const path = companyId && sessionId ? `${companyId}/${sessionId}/${fileName}` : null;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  // Una foto elegida o subida pertenece a la ruta de la sesión actual.
  useEffect(() => {
    if (currentPathRef.current !== path) {
      uploadSequenceRef.current += 1;
      setUploaded(false);
      setPreviewUrl(null);
      setUploading(false);
      setError(null);
      setMenuOpen(false);
      onPreviewChange?.(null);
      onUploadedChange(false);
      uploadedPathRef.current = null;
      currentPathRef.current = path;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    uploadSequenceRef.current += 1;
    setPreviewUrl(null);
    setUploaded(false);
    setUploading(false);
    setError(null);
    setMenuOpen(false);
    uploadedPathRef.current = null;
    onPreviewChange?.(null);
    onUploadedChange(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo tras un fallo de subida.
    e.target.value = "";
    if (!file || !path) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no permitido. Usa JPG, PNG, WEBP o HEIC.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("La foto pesa más de 10MB. Usa una foto más liviana.");
      return;
    }

    const uploadSequence = ++uploadSequenceRef.current;
    setUploaded(false);
    onUploadedChange(false);
    setUploading(true);
    const initialPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(initialPreviewUrl);
    onPreviewChange?.(initialPreviewUrl);

    const compressed = await compressImage(file);
    if (uploadSequence !== uploadSequenceRef.current) return;

    if (compressed !== file) {
      const compressedPreviewUrl = URL.createObjectURL(compressed);
      setPreviewUrl(compressedPreviewUrl);
      onPreviewChange?.(compressedPreviewUrl);
    }

    // upsert: true sobre la misma ruta fija de esta sección — una foto
    // nueva reemplaza a la anterior en Storage, nunca se acumulan.
    let uploadError: unknown;
    try {
      ({ error: uploadError } = await supabase.storage
        .from("visit-photos")
        .upload(path, compressed, { contentType: compressed.type, upsert: true }));
    } catch (caughtError) {
      uploadError = caughtError;
    }

    if (uploadSequence !== uploadSequenceRef.current) return;
    setUploading(false);

    if (uploadError) {
      console.error(uploadError);
      setError("La foto se previsualiza, pero no se guardó. Intenta de nuevo.");
      return;
    }

    uploadedPathRef.current = path;
    setUploaded(true);
    onUploadedChange(true);
  }

  return (
    <div className="rounded-lg border border-line bg-surface-soft p-3 sm:p-4">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
      />

      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-card sm:h-28 sm:w-28">
          {previewUrl ? (
            <img src={previewUrl} alt={label} className="h-full w-full object-contain" />
          ) : (
            <Camera aria-hidden="true" size={24} className="text-ink-soft/60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {uploaded ? "Foto guardada" : uploading ? "Guardando foto..." : "JPG, PNG, WEBP o HEIC · máximo 10 MB"}
          </p>
          <div ref={menuRef} className="relative mt-3 w-fit">
            <button
              type="button"
              disabled={disabled || uploading}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-md border border-accent bg-card px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-tint disabled:opacity-50"
            >
              <Camera aria-hidden="true" size={15} />
              {uploaded || previewUrl ? "Cambiar foto" : "Agregar foto"}
              <ChevronDown aria-hidden="true" size={14} />
            </button>
            {menuOpen && (
              <div id={menuId} className="dropdown-popover absolute right-0 top-full z-20 mt-1 w-52 p-1.5 sm:left-0 sm:right-auto">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); cameraInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-accent-tint"
                >
                  <Camera aria-hidden="true" size={16} /> Usar cámara
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); galleryInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-accent-tint"
                >
                  <ImageIcon aria-hidden="true" size={16} /> Elegir de galería
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {uploading && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/3 rounded-full bg-accent animate-upload-pulse" />
        </div>
      )}

      {uploaded && !uploading && (
        <p className="mt-2 text-xs font-medium text-accent-dark">✓ Foto lista</p>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
