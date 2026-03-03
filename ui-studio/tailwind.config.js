/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./index.tsx", "./App.tsx", "./components/**/*.{js,jsx,ts,tsx}", "./services/**/*.{js,ts}", "./utils/**/*.{js,ts}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [require("tailwindcss-animate")],
};

