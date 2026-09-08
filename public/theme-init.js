(function () {
  try {
    var pref = localStorage.getItem("passhub_theme") || "system";
    var isDark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
