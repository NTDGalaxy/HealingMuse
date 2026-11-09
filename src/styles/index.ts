// The single style entry: every global stylesheet in cascade order. The root layout and the Vite
// component fixture (tests/browser-fixtures/main.tsx) both import this module, so the app and the
// fixture always render with the same CSS. scripts/css/analyze.mjs reads the local imports below.
import "../app/globals.css";
import "../app/sanctuary.css";
import "../app/binaural.css";
import "../app/botanical.css";
import "../app/interaction.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
