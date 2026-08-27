# PassHub — Reconstrucción de arquitectura

Documento de trabajo · Tendencys Innovations · 27 de agosto de 2026

> Nota de nombre: el proyecto se llamaba "Sistema de Visitas" durante el diseño inicial; el producto final se llama **PassHub**. El nombre interno del proyecto en el dashboard de Supabase (`sistema-visitas-tendencys`) se quedó así porque no hay forma de renombrarlo por API — es solo una etiqueta cosmética y no afecta nada técnico (la app se conecta por URL/project ref, no por nombre). Si quieres que coincida, puedes renombrarlo tú desde *Project Settings → General* en el dashboard.

## 1. Diagnóstico del sistema actual

Revisé el proyecto de Apps Script ("Sistema de Visitas") tal como está hoy. Estructura: `Code.gs`, `Folios.gs`, `Config.gs`, `Drive.gs`, `dbslack.gs`, `Index.html`, `Estilos.html`, `Javascript.html`. Es un formulario que registra visitas de proveedores en una hoja de cálculo (`VISITAS`), guarda dos fotos por visita (foto del visitante y foto del INE) en carpetas de Drive, y lee una lista de colaboradores desde otra hoja (`DB SLACK`) para el autocompletado de "a quién visita".

Problemas concretos encontrados en el código:

1. **No hay autenticación ni roles reales.** `appsscript.json` tiene `"access": "ANYONE"` y `"executeAs": "USER_DEPLOYING"` — cualquiera con el link ejecuta el formulario con los permisos de la cuenta que lo publicó. No hay forma de distinguir quién capturó cada visita, ni de limitar quién puede hacerlo.
2. **Tokens de Slack escritos directamente en el código fuente** (`dbslack.gs`, y un fragmento comentado en `Config.gs`). Cualquiera con acceso de lectura al proyecto de Apps Script puede ver esos tokens completos.
3. **El folio no es confiable.** `generarFolio()` usa `hoja.getLastRow()` como si fuera un consecutivo — si alguien borra una fila o hay una edición manual en la hoja, el siguiente folio puede repetirse o saltarse. El `LockService` solo protege durante esa ejecución puntual, no contra ediciones directas en la hoja.
4. **Las fotos (incluida la del INE) se guardan en carpetas de Drive normales**, sin una política de acceso equivalente a RLS: quien tenga acceso a esa carpeta ve todas las identificaciones de todos los visitantes, sin segmentación por empresa ni bitácora de quién las consultó.
5. **Sin auditoría.** No queda registro de quién dio de alta cada visita ni de cambios posteriores.
6. **Front end monolítico** (HTML/CSS/JS pegados dentro de Apps Script, ensamblados con `include()`), sin componentes reutilizables, sin tipado, sin build — de ahí que sea difícil de mantener y "se vea feo".

Nada de esto es un reclamo al código en sí — es exactamente el tipo de cosas que Apps Script + Sheets no está diseñado para resolver bien. Por eso tiene sentido reconstruirlo sobre un stack real.

## 2. Lo que se agrega en la reconstrucción

Además de corregir lo anterior, se agregan los tres requerimientos nuevos que mencionaste:

- **Roles reales dentro de una sola app**: `admin` (crea usuarios, administra colaboradores, ve todo) y `recepcion` (hace el check-in de visitas de su empresa). Una sola aplicación con navegación según rol — no dos apps separadas — para no duplicar mantenimiento ni base de datos.
- **Pre-registro con QR**: alguien (admin o recepción) captura de antemano los datos del proveedor que va a llegar un día específico. El sistema genera un QR único para ese pre-registro. El día de la visita, recepción escanea el QR desde la tablet y el formulario se autocompleta — solo falta tomar las dos fotos y confirmar.
- **Fotos con almacenamiento correcto**: en vez de base64 en una columna (que no es cifrado, solo es una codificación reversible por cualquiera, y crece mucho el tamaño de la base de datos), las fotos van a un bucket privado de Supabase Storage con políticas de acceso (RLS) — nadie las descarga sin pasar por la validación de rol y empresa. Base64 se usa únicamente de forma transitoria en el navegador mientras se sube el archivo, igual que ahora en el navegador antes de mandarlo al servidor.

## 3. Arquitectura técnica

Mismo patrón que usa AssetFlow (el otro sistema interno de Tendencys), adaptado a este alcance más chico:

| Capa | Tecnología | Propósito |
|---|---|---|
| Frontend | React 18 + TypeScript | Interfaz, tipado estático |
| Build | Vite | Compilación y servidor de desarrollo |
| Estilos | Tailwind CSS + shadcn/ui | Sistema de diseño |
| Enrutamiento | React Router | Navegación + `ProtectedRoute` por rol |
| Backend / BaaS | Supabase | Auth, base de datos, Storage, Edge Functions |
| Base de datos | PostgreSQL (vía Supabase) | Datos relacionales + RLS + triggers |
| Storage de archivos | Supabase Storage (bucket privado) | Fotos de visitante e INE |
| QR | `qrcode.react` (generar) + `html5-qrcode` (escanear) | Pre-registro → check-in rápido |
| Contenedor | Docker (build multi-etapa) | Empaquetado para despliegue |
| Servidor web | Nginx (Alpine) | Servir el build estático en producción |
| Exposición a internet | Cloudflare Tunnel | Sin abrir puertos en el servidor |

## 4. Modelo de datos (ya aplicado en Supabase)

| Tabla | Propósito |
|---|---|
| `companies` | Empresas anfitrionas (Tendencys, Ecartpay, FulFillment, Para Paquetes) |
| `employees` | Colaboradores (reemplaza la hoja "DB SLACK") |
| `profiles` | Cuentas de acceso al sistema, 1:1 con `auth.users` |
| `user_roles` | Rol de cada cuenta (`admin` / `recepcion`) |
| `visit_preregistrations` | Pre-registros creados antes de la visita, base del QR |
| `visits` | Visitas ya registradas en recepción (folio, fotos, horarios) |
| `audit_logs` | Bitácora inmutable: altas de visitas, cambios de rol |

Puntos de diseño relevantes:

- **Folio seguro**: un trigger (`generate_visit_folio`) genera `VIS-YYYYMMDD-####` usando un candado (`pg_advisory_xact_lock`) para que dos capturas simultáneas nunca generen el mismo folio — corrige el bug de `getLastRow()`.
- **RLS en todas las tablas**: cada usuario solo ve/edita datos de su propia empresa, salvo `admin` que ve todo. Esto se resuelve con dos funciones auxiliares (`has_role`, `current_company_id`) usadas dentro de las políticas.
- **Bucket `visit-photos` privado**: las políticas de Storage exigen sesión activa y validan que la carpeta (`{company_id}/...`) corresponda a la empresa del usuario, o que sea `admin`.
- **`audit_logs`** se llena solo, vía triggers en `visits` y `user_roles` — nadie necesita acordarse de registrar el evento a mano.

El SQL completo está en `supabase/migrations/` dentro de este proyecto, numerado en el orden en que se aplicó.

## 5. Lo que ya quedó listo en este momento

Ya provisioné el proyecto de Supabase (plan gratuito, $0/mes) y apliqué todo el esquema:

- **Proyecto**: `sistema-visitas-tendencys` (ref `curhpkccpcogmafgrqog`, región `us-east-1`)
- **URL**: `https://curhpkccpcogmafgrqog.supabase.co`
- Las 7 tablas de la sección anterior, con RLS activo y verificado (`get_advisors` ya no marca tablas sin RLS).
- El bucket privado `visit-photos`.
- Las 4 empresas ya insertadas como datos semilla.

Pendiente por hacer tú, en el dashboard de Supabase (no lo puedo hacer yo por API):

1. **Authentication → Sign In / Providers → Email**: desactivar "Allow new users to sign up" (equivalente al `disable_signup` de AssetFlow). Así nadie se crea una cuenta por su cuenta — solo el admin, vía una Edge Function con `service_role`.
2. Si quieres restringir dominios de correo al crear cuentas (como `@tendencys.com`), lo agregamos como un "Auth Hook" más adelante, igual que en AssetFlow — no es urgente para el primer lanzamiento con pocos usuarios internos.
3. Guarda el **project ref y las keys** en un lugar seguro (password manager de la empresa). La `service_role key` (con la que se crean usuarios desde el backend) **nunca** va en el frontend ni en git — solo vive como secreto de una Edge Function.

## 6. Cómo seguir: VS Code + Claude Code

Te vas a llevar la carpeta `sistema-visitas/` que te mandé (scaffold + migraciones + esta guía) y la abres en VS Code. A partir de ahí:

### Paso 0 — Preparar el entorno
```bash
cd sistema-visitas
git init
npm install
cp .env.example .env.local   # ya trae la URL y la publishable key reales
npm run dev
```
Instala la extensión de Claude Code en VS Code (o ábrelo en terminal con `claude`) y conecta el proyecto de Supabase con el CLI si quieres correr migraciones desde ahí también: `npx supabase login` y `npx supabase link --project-ref curhpkccpcogmafgrqog`.

### Paso 1 — Inicializar shadcn/ui
El scaffold ya trae Tailwind configurado, pero los componentes de shadcn/ui se generan con su CLI (no son un paquete de npm normal):
```bash
npx shadcn@latest init
npx shadcn@latest add button input card dialog table select badge avatar dropdown-menu
```

### Paso 2 — Autenticación y layout base
Prompt sugerido para Claude Code:
> "Termina el hook `useAuth` en `src/hooks/useAuth.ts` y la pantalla `src/pages/Login.tsx` usando `supabase.auth.signInWithPassword`. Agrega un layout con sidebar que muestre 'Registrar visita' para el rol recepcion y 'Panel admin' para el rol admin, usando el patrón de `ProtectedRoute` que ya está en `src/components/layout/ProtectedRoute.tsx`."

### Paso 3 — Edge Function `create-user` (alta de usuarios por el admin)
Igual que en AssetFlow: una función serverless con la `service_role key` (nunca en el cliente) que crea el usuario en `auth.users`, su `profile` y su `user_roles`, y genera una contraseña temporal.
> "Crea una Supabase Edge Function `create-user` en Deno que reciba email, nombre, empresa y rol; cree el usuario con `supabase.auth.admin.createUser`, inserte su `profile` y su fila en `user_roles`, y devuelva la contraseña temporal generada. Debe usarse solo con la service role key, nunca expuesta al navegador."
(El envío del correo con la contraseña vía Resend, como en AssetFlow, se puede dejar para una segunda vuelta — para el lanzamiento inicial basta con que el admin se la copie y se la dé al usuario en persona.)

### Paso 4 — Módulo de colaboradores (`employees`)
Reemplaza la hoja "DB SLACK". CRUD simple: alta/edición/baja de colaboradores por empresa, solo para `admin`.

### Paso 5 — Pre-registro público + QR

Esto es exactamente el caso que describiste: un proveedor llena el formulario hoy (digamos, 3 de septiembre) para una visita que va a ocurrir hasta el 30. El esquema ya lo soporta tal cual porque `visit_preregistrations` separa `created_at` (cuándo se llenó el formulario) de `visit_date`/`visit_time` (cuándo va a llegar realmente) — no hay que tocar la base de datos para esto, ya está.

Lo que falta construir es la pantalla pública. Como el formulario actual (el de Google Forms) es público — cualquier proveedor entra al link sin cuenta —, la nueva versión debe serlo también, pero sin repetir el error de seguridad del sistema viejo (acceso abierto directo a la base de datos). La forma correcta de hacerlo:

- El formulario público **no** inserta directo a la tabla con la anon key. Llama a una **Edge Function pública** (`public-preregister`) que valida los datos en el servidor (campos requeridos, que la empresa exista, que la fecha no sea en el pasado) y ahí sí inserta usando la `service_role key`. Así el visitante nunca tiene acceso de escritura directo a tu base de datos — solo a un endpoint controlado.
- Ese formulario público tiene los mismos campos que hoy tiene el Google Form (y los mismos que usará recepción al hacer el check-in): nombre del visitante, empresa visitante, a quién visita, motivo, fecha y hora de la visita. **No pide fotos** — esas se capturan hasta que el proveedor llega físicamente.
- Al guardar, la función regresa el `id` del pre-registro y la pantalla muestra/descarga el QR (con `qrcode.react`), codificando ese `id`. El proveedor se lo guarda (captura de pantalla, PDF, o se le manda por correo/WhatsApp) y lo trae el día de su visita.
- Si llega el día de la visita y el pre-registro nunca se usó, en la UI del admin simplemente se muestra como "vencido" comparando `visit_date` contra hoy — no hace falta un job automático para esto en la primera versión.

Prompt sugerido para Claude Code:
> "Crea una Supabase Edge Function pública `public-preregister` (sin verificar JWT) que reciba nombre del visitante, empresa visitante, company_id (empresa anfitriona), host_employee_id, motivo, visit_date y visit_time; valide que los campos requeridos vengan y que visit_date no sea anterior a hoy; inserte en `visit_preregistrations` usando la service role key; y devuelva el `id` generado. Luego crea la pantalla pública `src/pages/PreRegistro.tsx` (sin necesidad de login) con ese formulario, que al guardar muestre el QR del `id` recibido usando `qrcode.react`, con un botón para descargarlo como imagen."

### Paso 6 — Check-in en recepción (con y sin QR)
> "Crea la pantalla principal de recepción (`src/pages/CheckIn.tsx`): un botón 'Escanear QR' que abre la cámara con `html5-qrcode`, busca el pre-registro por `id` en `visit_preregistrations` y autocompleta el formulario. Si no hay QR, permite llenar todo a mano. Debe capturar dos fotos (visitante e INE) con `<input type='file' accept='image/*' capture='environment'>`, subirlas al bucket `visit-photos` en la ruta `{company_id}/{uuid-temporal}/visitante.jpg` y `.../ine.jpg`, y al confirmar insertar el registro en `visits` (el folio se genera solo)."

### Paso 7 — Panel admin: historial y reportes
Tabla de visitas del día/rango de fechas, filtro por empresa, y vista de detalle con las dos fotos (usando URLs firmadas de Storage, no públicas).

### Paso 8 — Pulir y probar
Prueba el flujo completo con un usuario `recepcion` real (no solo `admin`) para confirmar que las políticas RLS no bloquean nada que sí deberían poder hacer, y que sí bloquean lo que no.

## 7. Cómo pedirle modificaciones a Claude Code (día a día, no solo para armar)

Esto es para cuando ya tengas el proyecto avanzando y necesites pedir cambios, arreglos o ajustes — no solo para construir desde cero.

**Trabaja con git desde el primer commit.** Antes de pedirle un cambio grande, haz `git add -A && git commit -m "..."` de lo que ya funciona. Así, si un cambio sale mal, regresas con `git diff` o `git checkout -- .` sin perder lo bueno. Claude Code puede hacer los commits por ti si se lo pides explícitamente.

**Dale contexto concreto, no solo la queja.** Compara:
- Mal: "el formulario de check-in no funciona bien."
- Bien: "en `src/pages/CheckIn.tsx`, al escanear el QR de un pre-registro, el campo `motivo` no se está autocompletando aunque sí llega en la respuesta de Supabase — revisa el `setState` después del `select`."

Entre más específico (archivo, síntoma exacto, qué esperabas vs qué pasó), menos vueltas da.

**Pídele que primero te explique el plan en cambios grandes.** Para algo que toca varios archivos (por ejemplo "agrega la opción de que recepción marque salida del visitante"), pídele: "explícame qué archivos vas a tocar y cómo, antes de escribir código" — revisas el plan, y si está bien le dices que proceda. Para cambios chicos (un texto, un color, un campo) no hace falta este paso, pídelo directo.

**Reporta bugs con la evidencia, no con la interpretación.** Pégale el mensaje de error completo de la consola o la terminal, no un resumen tuyo de lo que crees que significa. Si es algo visual, describe exactamente qué ves vs qué esperabas ver (o compárteme una captura a mí si prefieres que yo te ayude a interpretarla primero).

**Cambios en la base de datos van por migración, nunca a mano.** Si necesitas un campo nuevo o una tabla nueva, pídeselo como: "crea una nueva migración en `supabase/migrations/` que agregue la columna X a la tabla Y" — nunca le pidas que edite las migraciones ya aplicadas (0001–0005), esas ya corrieron contra la base real.

**Prueba tú antes de pedir el siguiente paso.** Después de cada pantalla o función nueva, corre `npm run dev` y pruébala con un usuario `recepcion` real, no solo `admin` — muchos bugs de este tipo de sistema son de permisos (RLS), y solo se ven probando con el rol correcto.

**Cuando el cambio afecte seguridad o permisos** (quién puede ver/editar qué), dile explícitamente qué rol debe poder hacer qué, y pídele que también actualice la política de RLS correspondiente si aplica — no asumas que lo va a inferir solo.

## 8. Plan de fases y fechas

Hoy es 27 de agosto y mencionaste un evento el día 30 — es decir, **tienes prácticamente 3 días**. Reconstruir todo (auth, roles, pre-registro con QR, Storage, despliegue en Docker/Cloudflare) con la calidad que se está buscando no es realista en 3 días, y forzarlo es la manera más segura de terminar con otro sistema "feo" pero ahora también apurado.

Sugerencia honesta:

- **Para el evento del día 30**: usa el sistema actual de Apps Script tal cual (o con el arreglo mínimo si algo está roto). No vale la pena migrar bajo presión un flujo que va a manejar INE de proveedores reales.
- **Semana 1 (con calma, después del evento)**: Pasos 0–4 de la sección anterior — auth, roles, alta de usuarios, colaboradores. Esto ya reemplaza el problema de seguridad más grave (acceso abierto sin roles).
- **Semana 2**: Pasos 5–6 — pre-registro + QR + check-in con fotos. Esta es la parte nueva que no existía antes.
- **Semana 3**: Paso 7–8, pulido, pruebas con las recepcionistas reales, y despliegue a producción (sección siguiente).

Si de verdad necesitas *algo* nuevo funcionando para el día 30, lo más razonable es limitarlo a lo mínimo: login con roles + formulario de check-in sin QR (Pasos 0–4 y una versión simple del Paso 6 sin escaneo). El QR se agrega después, sin prisa.

## 9. Despliegue a producción

Mismo patrón que AssetFlow — Docker multi-etapa + Nginx + Cloudflare Tunnel:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://curhpkccpcogmafgrqog.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_WZKiIJm9JmzLv3vTE_FGrg_v6YHLKFJ \
  -t sistema-visitas:latest .

docker run -d -p 8080:80 --name sistema-visitas sistema-visitas:latest
```

Para exponerlo a internet sin abrir puertos, instala `cloudflared` en el servidor y crea un túnel apuntando a `localhost:8080`, igual que en AssetFlow. Si el servidor donde corre AssetFlow tiene capacidad, puedes desplegar este contenedor ahí mismo con otro subdominio (por ejemplo `visitas.tendencys.com`) y otro túnel de Cloudflare.

## 10. Checklist de seguridad antes de lanzar

- [ ] "Allow new users to sign up" desactivado en Supabase Auth.
- [ ] Ningún token/secreto (Slack, `service_role key`, etc.) escrito en el código del frontend — todos viven como secretos de Edge Functions.
- [ ] Probaste el sistema con una cuenta `recepcion` real, no solo con `admin`.
- [ ] Las fotos del INE solo se pueden ver a través de la app (URLs firmadas), nunca con un link directo y público al archivo.
- [ ] `get_advisors` (seguridad) en Supabase sin hallazgos críticos pendientes.
- [ ] Headers de seguridad HTTP activos en Nginx (ya vienen en `nginx.conf`).
- [ ] Decidiste qué hacer con los datos del sistema viejo (Sheets + Drive): ¿se migran las visitas históricas o se archivan y se empieza limpio?

---

Cualquier duda sobre una decisión de diseño específica (por ejemplo, si quieres que recepción vea visitas de todas las empresas o solo la suya, o si el pre-registro lo puede llenar el proveedor mismo sin cuenta), dímelo y ajustamos el esquema antes de que avances mucho en el código — es más barato cambiarlo ahora que después de tener pantallas construidas encima.
