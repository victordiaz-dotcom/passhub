// TODO: pantalla principal de Recepción — reemplaza al formulario feo de Apps Script.
// Flujo:
// 1. Recepción escanea el QR de una pre-registro (html5-qrcode) -> autocompleta el formulario
//    consultando visit_preregistrations por id, o llena todo a mano si no hay pre-registro.
// 2. Captura foto del visitante y foto del INE (input capture="environment" en móvil/tablet).
// 3. Sube ambas fotos a Storage bucket "visit-photos" en la ruta
//    `${companyId}/${folioTemporal}/visitante.jpg` y `.../ine.jpg`.
// 4. Inserta el registro en la tabla "visits" (el folio final se genera solo via trigger).
export default function CheckIn() {
  return <div className="p-6">TODO: Registro de visita (Recepción)</div>;
}
