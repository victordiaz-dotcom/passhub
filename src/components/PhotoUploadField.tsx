import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mismos límites que ya aplica el bucket visit-photos en Supabase (Storage
// los hace cumplir de verdad); esto solo adelanta el aviso al usuario antes
// de gastar una subida que el servidor rechazaría de todos modos.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

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
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadedPathRef = useRef<string | null>(null);

  const path = companyId && sessionId ? `${companyId}/${sessionId}/${fileName}` : null;

  // Si la empresa (o el id de sesión) cambia después de haber subido la
  // foto, la ruta anterior ya no aplica: se limpia el estado para no dar
  // por buena una foto que en realidad quedó en otra carpeta.
  useEffect(() => {
    if (uploadedPathRef.current && uploadedPathRef.current !== path) {
      setUploaded(false);
      setPreviewUrl(null);
      onPreviewChange?.(null);
      onUploadedChange(false);
      uploadedPathRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    setPreviewUrl(null);
    setUploaded(false);
    setUploading(false);
    setError(null);
    uploadedPathRef.current = null;
    onPreviewChange?.(null);
    onUploadedChange(false);
    if (inputRef.current) inputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !path) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no permitido. Usa JPG, PNG, WEBP o HEIC.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("La foto pesa más de 10MB. Usa una foto más liviana.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    onPreviewChange?.(localUrl);
    setUploaded(false);
    onUploadedChange(false);
    setUploading(true);

    // upsert: true sobre la misma ruta fija de esta sección — una foto
    // nueva reemplaza a la anterior en Storage, nunca se acumulan.
    const { error: uploadError } = await supabase.storage
      .from("visit-photos")
      .upload(path, file, { contentType: file.type, upsert: true });

    setUploading(false);

    if (uploadError) {
      console.error(uploadError);
      setError("No se pudo subir la foto. Intenta de nuevo.");
      setPreviewUrl(null);
      onPreviewChange?.(null);
      URL.revokeObjectURL(localUrl);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    uploadedPathRef.current = path;
    setUploaded(true);
    onUploadedChange(true);
  }

  return (
    <div>
      <p className="mb-2 text-center text-sm text-ink-soft">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
      />

      {previewUrl && (
        <div className="mb-2 flex h-32 items-center justify-center overflow-hidden rounded-md border border-line bg-paper">
          <img src={previewUrl} alt={label} className="h-full w-full object-contain" />
        </div>
      )}

      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-60"
      >
        {uploading ? "Subiendo foto..." : uploaded ? "Cambiar foto" : "Tomar / seleccionar foto"}
      </button>

      {uploading && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/3 rounded-full bg-accent animate-upload-pulse" />
        </div>
      )}

      {uploaded && !uploading && (
        <p className="mt-2 text-center text-xs font-medium text-accent-dark">✓ Foto lista</p>
      )}

      {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
