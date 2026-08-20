/**
 * Clerk's components default to a light palette. The dashboard is dark-only —
 * globals.css defines no light branch — so rather than layering a generic dark
 * preset we map Clerk's variables straight onto the app's own tokens. The hex
 * values are duplicated from globals.css because Clerk resolves these in
 * JavaScript, where CSS custom properties are not available.
 */
export const clerkAppearance = {
  variables: {
    // Surfaces: the card sits on --color-surface, inputs on --color-surface-raised.
    colorBackground: "#121826",
    colorInput: "#182032",
    colorMuted: "#182032",

    // Text.
    colorForeground: "#e8ecf6",
    colorInputForeground: "#e8ecf6",
    colorMutedForeground: "#94a2c0",

    // Borders and focus rings.
    colorBorder: "#26304a",
    colorRing: "#0ea5e9",
    colorShadow: "#000000",

    // Dark themes need a light neutral: Clerk derives hover states and
    // dividers from it, so 'black' here would make them invisible.
    colorNeutral: "#ffffff",

    // sky-500, the accent the rest of the dashboard uses. Its foreground is the
    // canvas colour because white on sky-500 falls below 3:1 contrast.
    colorPrimary: "#0ea5e9",
    colorPrimaryForeground: "#0b0f19",

    // Status colours, matched to the Tailwind shades used elsewhere.
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",
    colorDanger: "#f43f5e",
  },
} as const;
