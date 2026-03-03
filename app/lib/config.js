export function getApiBase() {
  const cfg = globalThis.__SCN_CONFIG__ || {};
  return (cfg.API_BASE || "").trim() || "https://scankey-gateway-2apb4vvlhq-no.a.run.app";
}
