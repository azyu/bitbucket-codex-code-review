import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { applyStoredLocale } from "./lib/i18n.svelte";
import { applyStoredTheme } from "./lib/theme";

applyStoredLocale();
applyStoredTheme();

const target = document.getElementById("app");
if (target === null) throw new Error("#app mount point is missing");

export default mount(App, { target });
