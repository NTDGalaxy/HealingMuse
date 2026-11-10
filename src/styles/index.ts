// The single style entry: every global stylesheet in cascade order. The root layout and the Vite
// component fixture (tests/browser-fixtures/main.tsx) both import this module, so the app and the
// fixture always render with the same CSS. scripts/css/analyze.mjs reads the local imports below.
import "./tailwind.css";
import "./tokens.css";
import "./base.css";
import "./shell.css";
import "./catalog.css";
import "./overlays.css";
import "./pages.css";
import "./motion.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
