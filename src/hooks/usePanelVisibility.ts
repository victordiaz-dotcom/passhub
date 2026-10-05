import { useState } from "react";

const storageKey = "passhub-panel-visible";

function readPreference() {
  try { return sessionStorage.getItem(storageKey) !== "false"; }
  catch { return true; }
}

export function usePanelVisibility() {
  const [visible, setVisible] = useState(readPreference);
  function toggle() {
    setVisible((current) => {
      const next = !current;
      try { sessionStorage.setItem(storageKey, String(next)); } catch { /* Preferencia opcional. */ }
      return next;
    });
  }
  return { visible, toggle };
}
