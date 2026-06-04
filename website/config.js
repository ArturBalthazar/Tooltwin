// ToolTwin frontend config — loaded before script.js.
//
// These are PUBLIC service URLs (safe to ship). No secrets here: the OpenAI key
// lives ONLY in the ai-service environment on Render, never in the browser.
//
// On localhost we hit the locally-run services; anywhere else we hit Render.
// The service names must match render.yaml (tooltwin-ai / tooltwin-cad).
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  window.TOOLTWIN_CONFIG = {
    AI_SERVICE_URL:  isLocal ? 'http://localhost:8081' : 'https://tooltwin-ai.onrender.com',
    CAD_SERVICE_URL: isLocal ? 'http://localhost:8000' : 'https://tooltwin-cad.onrender.com',
  };
})();
