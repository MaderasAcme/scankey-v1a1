const fs = require("fs");

const p = "dist/index.html";
if (!fs.existsSync(p)) {
  console.log("SKIP: dist/index.html no existe (primero ejecuta npm run build)");
  process.exit(0);
}

let s = fs.readFileSync(p, "utf8");
if (s.includes("__SCN_CONFIG__")) {
  console.log("OK: dist ya tiene __SCN_CONFIG__");
  process.exit(0);
}

const inject = `<script>
  globalThis.__SCN_CONFIG__ = {
    API_BASE: "https://scankey-gateway-2apb4vvlhq-no.a.run.app"
  };
</script>
`;

const lower = s.toLowerCase();
let i = lower.indexOf("<head");
if (i !== -1) {
  const j = lower.indexOf(">", i);
  if (j !== -1) {
    s = s.slice(0, j + 1) + "\n" + inject + s.slice(j + 1);
    fs.writeFileSync(p, s, "utf8");
    console.log("OK: inyectado en <head>");
    process.exit(0);
  }
}

i = lower.indexOf("<script");
if (i !== -1) {
  s = s.slice(0, i) + inject + "\n" + s.slice(i);
} else {
  s = inject + "\n" + s;
}
fs.writeFileSync(p, s, "utf8");
console.log("OK: inyectado antes del primer <script>");
