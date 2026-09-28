// Versión de la app, visible discretamente al pie -- súbela manualmente cuando
// se suba un cambio, no se deriva de nada automático (ni de git, ni del
// build). Semver completo (v2.0.0, v2.0.1, ...) en vez de solo "v2": así se
// puede distinguir a simple vista (o inspeccionando el DOM) qué build de v2
// está corriendo cuando se suba un fix -- el patch (el último número) sube
// en cada fix; el minor cuando se agrega una función; el major solo si se
// vuelve a rehacer la app entera como con v1 -> v2.
export const APP_VERSION = "v2.0.1";
