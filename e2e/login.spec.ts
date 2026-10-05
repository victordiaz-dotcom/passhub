import { test, expect } from "@playwright/test";

// Ejemplo: solo verifica que la pantalla de login carga y muestra lo
// esencial -- punto de partida para agregar más pruebas, no cobertura real
// del flujo de login (eso necesita una cuenta de prueba real contra
// passhub-dev).
test("la pantalla de login muestra el formulario", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "PassHub" })).toBeVisible();
  await expect(page.getByLabel("Usuario o correo")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
