# PassHub — nuevo proyecto (antes "sistema de visitas")

Este es el scaffold inicial (React + Vite + TypeScript + Tailwind + Supabase).
La lógica de negocio real (pantallas, flujos, QR) todavía no está implementada —
eso se hace en VS Code con Claude Code siguiendo `GUIA_PASO_A_PASO.md`.

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # ya trae la URL y la publishable key del proyecto Supabase
npm run dev
```

## Dónde está todo

- `supabase/migrations/` — el esquema completo de base de datos, ya aplicado al proyecto Supabase real.
- `src/integrations/supabase/` — cliente de Supabase + tipos TypeScript generados desde la base real.
- `src/pages/`, `src/hooks/`, `src/components/` — esqueleto con TODOs, listo para que Claude Code lo desarrolle.
- `Dockerfile` / `nginx.conf` — despliegue en producción (mismo patrón que AssetFlow).
- `GUIA_PASO_A_PASO.md` — la guía completa: diagnóstico, arquitectura, plan de fases y prompts sugeridos.

Lee primero `GUIA_PASO_A_PASO.md`.
