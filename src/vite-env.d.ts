/// <reference types="vite/client" />

/** App version injected at build time from package.json (vite define). */
declare const __APP_VERSION__: string;

/** True in the Mac App Store build (MAS_BUILD=1): hides updater + license UI. */
declare const __IS_MAS_BUILD__: boolean;
