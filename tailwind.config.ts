import type { Config } from "tailwindcss";

// Charte de l'État (DSFR), cf. DESIGN.md. Les échelles Tailwind déjà employées dans les pages
// sont réaffectées aux couleurs DSFR : teal → bleu France (action), slate → gris, amber →
// avertissement, red → erreur, blue → information.
// ponytail: noms Tailwind conservés pour ne pas réécrire ~900 classes ; renommer au fil des
// pages vers les jetons sémantiques ci-dessous (bleu-france, menthe, focus…).
const bleuFrance = {
  50: "#f5f5fe",
  100: "#ececfe",
  200: "#e3e3fd",
  300: "#cacafb",
  400: "#8585f6",
  500: "#6a6af4",
  600: "#000091",
  700: "#000091",
  800: "#1212ff",
  900: "#000091",
  950: "#000091"
};

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: bleuFrance,
        slate: {
          50: "#f6f6f6",
          100: "#eeeeee",
          200: "#dddddd",
          300: "#cecece",
          400: "#757575",
          500: "#666666",
          600: "#555555",
          700: "#3a3a3a",
          800: "#2a2a2a",
          900: "#161616",
          950: "#161616"
        },
        amber: {
          50: "#fff4f3",
          100: "#ffe9e6",
          200: "#ffded9",
          300: "#ffbeb4",
          400: "#fc5d00",
          500: "#fc5d00",
          600: "#d64d00",
          700: "#b34000",
          800: "#8d3400",
          900: "#6e2a00",
          950: "#4a1c00"
        },
        red: {
          50: "#fff4f4",
          100: "#ffe9e9",
          200: "#ffdddd",
          300: "#ffbdbd",
          400: "#ff5655",
          500: "#f60700",
          600: "#ce0500",
          700: "#ce0500",
          800: "#a40400",
          900: "#7a0300",
          950: "#520200"
        },
        blue: {
          50: "#f4f6ff",
          100: "#e8edff",
          200: "#dde5ff",
          300: "#bccdff",
          400: "#518fff",
          500: "#0078f3",
          600: "#0063cb",
          700: "#0063cb",
          800: "#004c9e",
          900: "#003a78",
          950: "#002550"
        },
        "bleu-france": { DEFAULT: "#000091", hover: "#1212ff", active: "#2323ff", mist: "#f5f5fe", wash: "#e3e3fd" },
        menthe: { DEFAULT: "#009081", profond: "#37635f", mist: "#f3fbf8" },
        "rouge-marianne": "#e1000f",
        focus: "#0a76f6"
      },
      fontFamily: {
        sans: ["Marianne", "arial", "sans-serif"]
      },
      // Marianne n'existe qu'en 400 / 500 / 700 (règle des trois graisses)
      fontWeight: {
        semibold: "500",
        extrabold: "700",
        black: "700"
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "6px",
        md: "10px",
        lg: "16px",
        xl: "16px",
        "2xl": "20px"
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0, 0, 18, 0.16)",
        DEFAULT: "0 1px 3px rgba(0, 0, 18, 0.16)",
        md: "0 4px 12px rgba(0, 0, 18, 0.16)",
        lg: "0 4px 12px rgba(0, 0, 18, 0.16)",
        xl: "0 6px 18px rgba(0, 0, 18, 0.16)",
        "2xl": "0 6px 18px rgba(0, 0, 18, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
