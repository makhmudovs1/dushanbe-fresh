/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}", "./src/cart/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        market: {
          background: "var(--color-bg)",
          surface: "var(--color-surface)",
          primary: "var(--color-primary)",
          secondary: "var(--color-secondary)",
          text: "var(--color-text)",
          muted: "var(--color-muted)"
        }
      }
    }
  },
  plugins: []
};
