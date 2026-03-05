/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./index.js", "./App.js", "./components/**/*.js", "./screens/**/*.js", "./ui/**/*.js", "./services/**/*.js", "./utils/**/*.js"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [require("tailwindcss-animate")],
};

