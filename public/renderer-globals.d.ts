// Globals the renderer scripts legitimately reach for.
//
// Read tsconfig.renderer.json first: this file exists so that the undefined-name
// check has something to subtract. Every declaration here is a name that really
// is in scope at runtime but cannot be seen by reading public/*.js alone —
// either a <script> tag's library or something App.vue hangs on `window`.
//
// Adding a name here says "this exists, I checked". Do not add one to silence
// the check without following it to where it is defined.

// ── Loaded by <script> in index.html ──────────────────────────────
// @xterm/xterm and its addons, which publish themselves as globals.
declare const Terminal: any;
declare const FitAddon: any;
declare const WebLinksAddon: any;
declare const SearchAddon: any;
declare const WebglAddon: any;
declare const UnicodeGraphemesAddon: any;

// ── Installed on window by App.vue's onMounted ────────────────────
// The Vue side of the renderer exposes these so the plain scripts can drive the
// main area. They are `window.X = …` assignments, which makes them globals —
// see the bottom of src/vue/components/App.vue.
declare function hideAllViewers(): void;
declare function hidePlanViewer(): void;
declare function loadPlans(): Promise<void>;
declare function renderPlans(plans?: any[]): void;
declare function openPlan(plan: any): void;
declare function openSettingsViewer(...args: any[]): void;
