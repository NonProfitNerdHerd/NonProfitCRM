import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#d9eaff",
          200: "#b9d8ff",
          300: "#89bcff",
          400: "#5497ff",
          500: "#2f74ff",
          600: "#1d56f5",
          700: "#1943e1",
          800: "#1a38b5",
          900: "#1c338f"
        }
      }
    }
  },
  plugins: []
};

export default config;
