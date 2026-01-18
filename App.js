import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// =====================
// Snack-safe optional requires
// =====================
const MOD_ASYNC = "@react-native-async-storage/async-storage";
const MOD_PICKER = "expo-image-picker";

function safeRequire(id) {
  try {
    if (id === MOD_ASYNC) return require("@react-native-async-storage/async-storage");
    if (id === MOD_PICKER) return require("expo-image-picker");
    if (id === "@react-navigation/native") return require("@react-navigation/native");
    if (id === "@react-navigation/bottom-tabs") return require("@react-navigation/bottom-tabs");
    if (id === "@react-navigation/native-stack") return require("@react-navigation/native-stack");
    return null;
  } catch (e) {
    return null;
  }
}



let AsyncStorage = null;
try {
  const m = safeRequire(MOD_ASYNC);
  AsyncStorage = m?.default ?? null;
} catch (e) {
  AsyncStorage = null;
}

async function getImagePicker() {
  const mod = safeRequire(MOD_PICKER);
  return mod?.default ?? mod ?? null;
}

// react-navigation optional hook (only if available)
const navLib = safeRequire("@react-navigation/native");
const useFocusEffect = navLib?.useFocusEffect;

// =====================
// THEME
// =====================
const COLORS = {
  background: "#050509",
  card: "#11121A",
  cardSoft: "#0D0E14",
  text: "#FFFFFF",
  textSoft: "#888CA3",
  accent: "#2F88FF",
  border: "#2A2C36",
  danger: "#FF5050",
  warning: "#FFB020",
  success: "#20C997",
};

const STORAGE_KEY = "scankey_demo_history_v1";
const STORAGE_KEY_PENDING_FEEDBACK = "scankey_pending_feedback_v1";

// =====================
// Cloud Run endpoints (REAL)
// =====================
// ✅ CAMBIA SOLO ESTO SI TU URL ES OTRA
const MOTOR_BASE = "https://classify-llaves-578907855193.europe-southwest1.run.app";
const API_ANALYZE = `${MOTOR_BASE}/api/analyze-key`;
const API_FEEDBACK = `${MOTOR_BASE}/api/feedback`;
const API_HEALTH = `${MOTOR_BASE}/health`;

// =====================
// Storage helpers
// =====================
const MemStore = { history: [], pendingFeedback: [] };

async function loadHistory() {
  if (!AsyncStorage) return MemStore.history;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveHistory(items) {
  if (!AsyncStorage) {
    MemStore.history = items;
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
async function clearHistory() {
  if (!AsyncStorage) {
    MemStore.history = [];
    return;
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
}

async function loadPendingFeedback() {
  if (!AsyncStorage) return MemStore.pendingFeedback;
  const raw = await AsyncStorage.getItem(STORAGE_KEY_PENDING_FEEDBACK);
  return raw ? JSON.parse(raw) : [];
}
async function savePendingFeedback(items) {
  if (!AsyncStorage) {
    MemStore.pendingFeedback = items;
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEY_PENDING_FEEDBACK,
    JSON.stringify(items)
  );
}
async function clearPendingFeedback() {
  if (!AsyncStorage) {
    MemStore.pendingFeedback = [];
    return;
  }
  await AsyncStorage.removeItem(STORAGE_KEY_PENDING_FEEDBACK);
}

// =====================
// Helpers
// =====================
function nowId() {
  return `scan-${Date.now()}`;
}

function parseModelTitle(title) {
  if (!title || typeof title !== "string") return { brand: null, model: null };
  const parts = title.trim().split(/\s+/);
  if (parts.length === 1) return { brand: null, model: parts[0] };
  return { brand: parts[0] || null, model: parts.slice(1).join(" ") || null };
}

function isWeb() {
  return Platform.OS === "web";
}

function safeAlert(title, msg) {
  try {
    Alert.alert(title, msg);
  } catch (e) {
    console.log(title, msg);
  }
}

function assertPicker(ImagePicker) {
  const ok =
    ImagePicker &&
    typeof ImagePicker.requestCameraPermissionsAsync === "function" &&
    typeof ImagePicker.requestMediaLibraryPermissionsAsync === "function" &&
    typeof ImagePicker.launchCameraAsync === "function" &&
    typeof ImagePicker.launchImageLibraryAsync === "function";
  return !!ok;
}

function showMissingPickerHelp() {
  safeAlert(
    "Falta expo-image-picker",
    "Snack NO puede instalarlo desde el código.\n\nSolución:\n1) En Snack abre el menú (⋮)\n2) Busca 'Dependencies'\n3) Añade: expo-image-picker\n4) Recarga.\n\nSi no te aparece 'Dependencies', crea un Snack nuevo y pega el App.js."
  );
}

// =====================
// Network hardening: timeout + retry + safe json
// =====================
const DEFAULT_TIMEOUT_MS = 12000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Devuelve { data, attempt, rawText }
 */
async function fetchJsonWithRetry(
  url,
  options,
  { retries = 1, timeoutMs = DEFAULT_TIMEOUT_MS, onAttempt } = {}
) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      if (typeof onAttempt === "function") onAttempt(attempt);
      const res = await fetchWithTimeout(url, options, timeoutMs);
      const rawText = await res.text();
      const data = safeJsonParse(rawText);

      if (!res.ok) {
        const msg = data?.detail || data?.error || rawText || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!data || typeof data !== "object") {
        throw new Error("Respuesta inválida (no JSON).");
      }

      return { data, attempt, rawText };
    } catch (e) {
      lastErr = e;
      if (attempt <= retries) await sleep(450 * attempt);
    }
  }

  throw lastErr || new Error("Fallo desconocido.");
}

// =====================
// HEALTH check (Cloud Run)
// =====================
async function fetchHealth() {
  const { data } = await fetchJsonWithRetry(
    API_HEALTH,
    { method: "GET", headers: { Accept: "application/json" } },
    { retries: 0, timeoutMs: 8000 }
  );
  return data;
}

// =====================
// REAL ANALYZE: send 2 images to Cloud Run (robusto)
// - En mobile: usar { uri, name, type } (NO blob)
// - En web: convertir a Blob
// - Enviar duplicado con varios nombres de campo para encajar con el backend
// =====================
async function uriToBlob(uri) {
  const r = await fetch(uri);
  return await r.blob();
}

function guessMimeFromUri(uri) {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function appendFileToFormData(fd, fieldName, uri, filename) {
  if (isWeb()) {
    const blob = await uriToBlob(uri);
    fd.append(fieldName, blob, filename);
    return;
  }
  fd.append(fieldName, {
    uri,
    name: filename,
    type: guessMimeFromUri(uri),
  });
}

function normalizeAnalysis(raw, frontUri) {
  const data = raw && typeof raw === "object" ? raw : {};
  const processed_ms = data.processed_ms ?? data.ms ?? data.latency_ms ?? 0;
  const input_id = data.input_id ?? data.request_id ?? data.id ?? null;

  const list =
    (Array.isArray(data.results) && data.results) ||
    (Array.isArray(data.candidates) && data.candidates) ||
    (Array.isArray(data.predictions) && data.predictions) ||
    [];

  const results = list
    .map((r) => {
      const title = r.title ?? r.label ?? r.model ?? r.name ?? "Modelo";
      const confidenceRaw =
        r.confidence ??
        r.score ??
        r.prob ??
        r.probability ??
        r.similarity ??
        0;

      const confidence =
        typeof confidenceRaw === "number"
          ? confidenceRaw
          : Number(confidenceRaw) || 0;

      return {
        rank: r.rank ?? null,
        title,
        id_model_ref: r.id_model_ref ?? r.model_id ?? r.id ?? r.ref ?? null,
        orientation: r.orientation ?? r.orientacion ?? "—",
        headColor: r.headColor ?? r.head_color ?? r.color_cabezal ?? "—",
        state: r.state ?? r.condition ?? r.estado ?? "—",
        tags: Array.isArray(r.tags) ? r.tags : [],
        confidence,
        explain: r.explain ?? r.reason ?? r.explicacion ?? "",
        patent: !!(r.patent ?? r.is_patented ?? r.patentada),
      };
    })
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  return {
    input_id,
    processed_ms,
    scanned_image: frontUri || data.scanned_image || null,
    manufacturer_hint: data.manufacturer_hint ?? data.manufacturerHint ?? null,
    high_confidence: !!(data.high_confidence ?? data.highConfidence),
    low_confidence: !!(data.low_confidence ?? data.lowConfidence),
    should_store_sample: !!(data.should_store_sample ?? data.shouldStoreSample),
    current_samples_for_candidate:
      data.current_samples_for_candidate ?? data.currentSamplesForCandidate ?? null,
    results,
  };
}

// ✅ timeout+retry y devuelve _attempt
async function postAnalyzeReal(frontUri, backUri, modoTaller, onAttempt) {
  const fd = new FormData();

  await appendFileToFormData(fd, "front", frontUri, "front.jpg");
  if (backUri) await appendFileToFormData(fd, "back", backUri, "back.jpg");
  await appendFileToFormData(fd, "image_front", frontUri, "front.jpg");
  if (backUri) await appendFileToFormData(fd, "image_back", backUri, "back.jpg");
  fd.append("source", "app");
  fd.append("modo_taller", String(!!modoTaller));

  const { data, attempt } = await fetchJsonWithRetry(
    API_ANALYZE,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
    },
    { retries: 1, timeoutMs: 12000, onAttempt } // total 2 intentos
  );

  const normalized = normalizeAnalysis(data, frontUri);
  return { ...normalized, _attempt: attempt };
}

// =====================
// FEEDBACK: robust sender + fallback queue
// =====================
async function postFeedback(payload) {
  const res = await fetch(API_FEEDBACK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return true;
}

async function queueFeedback(payload) {
  const list = await loadPendingFeedback();
  const next = [
    { id: String(Date.now()), createdAt: Date.now(), payload },
    ...list,
  ];

async function flushPendingFeedback() {
  const list = await loadPendingFeedback();
  if (!list.length) return { sent: 0, left: 0 };

  let sent = 0;
  const kept = [];

  for (const item of list) {
    try {
      await postFeedback(item.payload);
      sent += 1;
    } catch (e) {
      kept.push(item);
    }
  }

  await savePendingFeedback(kept);
  return { sent, left: kept.length };
}

// =====================
// Small UI primitives
// =====================
function Screen({ children }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      {children}
    </SafeAreaView>
  );
}

function TopTitle({ title, left, right }) {
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ width: 36 }}>{left}</View>
      <Text
        style={{
          flex: 1,
          textAlign: "center",
          color: COLORS.text,
          fontSize: 26,
          fontWeight: "800",
        }}
      >
        {title}
      </Text>
      <View style={{ width: 36, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

function Card({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Row({ children, style }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      {children}
    </View>
  );
}

function PrimaryButton({ title, icon, onPress, style, textStyle, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: COLORS.accent,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          opacity: disabled ? 0.35 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={[
          { color: "#fff", fontWeight: "800", fontSize: 16 },
          textStyle,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function OutlineButton({
  title,
  icon,
  color = COLORS.accent,
  onPress,
  style,
  disabled,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 10,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: "transparent",
          opacity: disabled ? 0.35 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text style={{ color, fontWeight: "800", fontSize: 15 }}>{title}</Text>
    </TouchableOpacity>
  );
}

function SmallPill({ text, bg = "rgba(47,136,255,0.18)", fg = COLORS.accent }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function Tag({ text, tone = "neutral" }) {
  const map = {
    neutral: { bg: "rgba(255,255,255,0.07)", fg: COLORS.textSoft },
    accent: { bg: "rgba(47,136,255,0.16)", fg: COLORS.accent },
    warning: { bg: "rgba(255,176,32,0.16)", fg: COLORS.warning },
  };
  const t = map[tone] || map.neutral;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        marginRight: 8,
        marginTop: 8,
      }}
    >
      <Text style={{ color: t.fg, fontWeight: "800", fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

// =====================
// Screens
// =====================
function HomeScreen({ go }) {
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await fetchHealth();
        if (!alive) return;
        setHealth(h);
        setHealthErr(null);
      } catch (e) {
        if (!alive) return;
        setHealth(null);
        setHealthErr(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const engineLoaded = health?.engine_loaded ?? health?.engineLoaded;
  const motorOk = !!health?.ok && (engineLoaded === undefined ? true : !!engineLoaded) && !healthErr;
  const motorLabel = motorOk ? "Motor online" : "Motor offline";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}
      >
        <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
          <Row style={{ gap: 10 }}>
            <MaterialCommunityIcons name="key" size={22} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
              ScanKey
            </Text>
          </Row>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => go("Profile")}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="person-outline" size={18} color={COLORS.textSoft} />
          </TouchableOpacity>
        </Row>

        <View style={{ alignItems: "center", marginTop: 40, marginBottom: 20 }}>
          <View
            style={{
              width: 90,
              height: 90,
              borderRadius: 999,
              backgroundColor: "rgba(47,136,255,0.08)",
              borderWidth: 1,
              borderColor: "rgba(47,136,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name="key" size={44} color={COLORS.accent} />
          </View>
        </View>

        <Text
          style={{
            color: COLORS.text,
            fontWeight: "900",
            fontSize: 34,
            textAlign: "center",
            lineHeight: 40,
          }}
        >
          Identifica tu llave en segundos
        </Text>

        <Text
          style={{
            color: COLORS.textSoft,
            textAlign: "center",
            marginTop: 10,
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          Toma dos fotos — lado A y lado B — y te mostraremos{"\n"}los 3 modelos
          más parecidos.
        </Text>

        <PrimaryButton
          title="Escanear llave"
          icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
          onPress={() => go("Scan")}
          style={{ marginTop: 22 }}
        />

        <Row style={{ gap: 12, marginTop: 14 }}>
          <QuickCard title="Historial" icon="time-outline" onPress={() => go("History")} />
          <QuickCard title="Mis talleres" icon="hammer-outline" onPress={() => go("Taller")} />
          <QuickCard title="Guía de captura" icon="book-outline" onPress={() => go("Guide")} />
        </Row>

        <View style={{ alignItems: "center", marginTop: 16 }}>
          <Row
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: motorOk ? COLORS.success : COLORS.danger,
              }}
            />
            <Text style={{ color: motorOk ? COLORS.success : COLORS.danger, fontWeight: "900" }}>
              {motorLabel}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                try {
                  const h = await fetchHealth();
                  setHealth(h);
                  setHealthErr(null);
                } catch (e) {
                  setHealth(null);
                  setHealthErr(e);
                }
              }}
            >
              <Ionicons name="refresh-outline" size={18} color={COLORS.textSoft} />
            </TouchableOpacity>
          </Row>

          {!motorOk && (healthErr?.message || health?.engine_error) ? (
            <Text style={{ color: COLORS.textSoft, marginTop: 8, textAlign: "center" }}>
              {String(healthErr?.message || health?.engine_error)}
            </Text>
          ) : null}
        </View>

        <Text
          style={{
            color: COLORS.textSoft,
            textAlign: "center",
            marginTop: 18,
            fontWeight: "700",
          }}
        >
          Versión REAL — Motor en Cloud Run
        </Text>
      </ScrollView>
    </Screen>
  );
}

function QuickCard({ title, icon, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons name={icon} size={20} color={COLORS.accent} />
      <Text style={{ color: COLORS.textSoft, fontWeight: "800", textAlign: "center" }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function Placeholder({ title, goBack }) {
  return (
    <Screen>
      <TopTitle
        title={title}
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />
      <View style={{ paddingHorizontal: 18 }}>
        <Card>
          <Text style={{ color: COLORS.textSoft }}>
            Pantalla placeholder (la dejamos lista para luego).
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

function PhotoBlock({ title, hint, uri, onCamera, onGallery, onClear }) {
  return (
    <Card style={{ marginTop: 14 }}>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
        {title}
      </Text>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          borderWidth: uri ? 1 : 2,
          borderStyle: uri ? "solid" : "dashed",
          borderColor: uri ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.08)",
          height: 150,
          backgroundColor: "rgba(255,255,255,0.02)",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Row style={{ gap: 12 }}>
            <PrimaryButton
              title="Cámara"
              icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
              onPress={onCamera}
              style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 }}
              textStyle={{ fontSize: 15 }}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onGallery}
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons name="images-outline" size={18} color={COLORS.textSoft} />
              <Text style={{ fontWeight: "900", color: COLORS.textSoft }}>
                Galería
              </Text>
            </TouchableOpacity>
          </Row>
        )}

        {uri ? (
          <View style={{ position: "absolute", right: 10, top: 10, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onCamera}
              style={{
                backgroundColor: "rgba(0,0,0,0.55)",
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
              }}
            >
              <Ionicons name="camera-outline" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClear}
              style={{
                backgroundColor: "rgba(0,0,0,0.55)",
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
              }}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <Row style={{ marginTop: 10, gap: 10 }}>
        <Ionicons name="bulb-outline" size={16} color={COLORS.textSoft} />
        <Text style={{ color: COLORS.textSoft }}>{hint}</Text>
      </Row>
    </Card>
  );
}

function ScanScreen({ goBack, go, setScanDraft, onResetScanDraft }) {
  const [modoTaller, setModoTaller] = useState(false);
  const [frontUri, setFrontUri] = useState(null);
  const [backUri, setBackUri] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");

  const webPickFile = (target, { capture = false } = {}) => {
    if (!isWeb()) return;
    try {
      if (typeof document === "undefined") throw new Error("document undefined");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      if (capture) input.setAttribute("capture", "environment");

      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        if (target === "front") setFrontUri(url);
        if (target === "back") setBackUri(url);
      };

      input.click();
    } catch (e) {
      safeAlert("Web", "No se pudo abrir el selector de cámara/archivos.");
    }
  };

  const openCameraViaPicker = async (target) => {
    if (isWeb()) {
      webPickFile(target, { capture: true });
      return;
    }

    const ImagePicker = await getImagePicker();
    if (!assertPicker(ImagePicker)) {
      showMissingPickerHelp();
      return;
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      safeAlert("Permiso denegado", "Necesitamos acceso a la cámara.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri || null;
    if (!uri) return;

    if (target === "front") setFrontUri(uri);
    if (target === "back") setBackUri(uri);
  };

  const pickFromGallery = async (target) => {
    if (isWeb()) {
      webPickFile(target, { capture: false });
      return;
    }

    const ImagePicker = await getImagePicker();
    if (!assertPicker(ImagePicker)) {
      showMissingPickerHelp();
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      safeAlert("Permiso denegado", "Necesitamos acceso a tu galería.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions?.Images,
      quality: 0.9,
    });

    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri || null;
    if (!uri) return;

    if (target === "front") setFrontUri(uri);
    if (target === "back") setBackUri(uri);
  };

  const canAnalyze = !!frontUri && !!backUri;

  const analyzeReal = async () => {
    if (!canAnalyze || loading) return;

    try {
      setLoading(true);
      setLoadingMsg("Analizando… intento 1/2");

      const analysis = await postAnalyzeReal(frontUri, backUri, modoTaller, (attempt) => {
        const a = Number(attempt) || 1;
        setLoadingMsg(`Analizando… intento ${Math.min(2, Math.max(1, a))}/2`);
      });

      setScanDraft({
        input_id: analysis?.input_id || nowId(),
        frontUri,
        backUri,
        analysis,
        createdAt: Date.now(),
        modoTaller,
      });

      go("Results");
    } catch (e) {
      safeAlert("Error analizando", String(e?.message || e));
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  useEffect(() => {
    if (onResetScanDraft) {
      onResetScanDraft.current = () => {
        setFrontUri(null);
        setBackUri(null);
        setModoTaller(false);
        setLoading(false);
        setLoadingMsg("");
      };
    }
  }, [onResetScanDraft]);

  return (
    <Screen>
      <TopTitle
        title="Escanear Llave"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 26 }}>
        <PhotoBlock
          title="Foto Lado A (Izquierda)"
          hint="Punta hacia la izquierda, fondo blanco"
          uri={frontUri}
          onCamera={() => openCameraViaPicker("front")}
          onGallery={() => pickFromGallery("front")}
          onClear={() => setFrontUri(null)}
        />

        <PhotoBlock
          title="Foto Lado B (Derecha)"
          hint="Punta hacia la derecha, mismo fondo e iluminación"
          uri={backUri}
          onCamera={() => openCameraViaPicker("back")}
          onGallery={() => pickFromGallery("back")}
          onClear={() => setBackUri(null)}
        />

        <Card style={{ marginTop: 14, paddingVertical: 14 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Modo Taller
            </Text>
            <Switch
              value={modoTaller}
              onValueChange={setModoTaller}
              trackColor={{
                false: "rgba(255,255,255,0.12)",
                true: "rgba(47,136,255,0.35)",
              }}
              thumbColor={modoTaller ? COLORS.accent : "#9AA0A6"}
            />
          </Row>
        </Card>

        <OutlineButton
          title="Subir fotos desde galería"
          icon={<Ionicons name="images-outline" size={18} color={COLORS.accent} />}
          onPress={async () => {
            await pickFromGallery("front");
            await pickFromGallery("back");
          }}
          style={{ marginTop: 14 }}
          disabled={loading}
        />

        <PrimaryButton
          title={loading ? (loadingMsg || "Analizando…") : "Analizar (REAL)"}
          icon={<Ionicons name="sparkles-outline" size={18} color="#fff" />}
          onPress={analyzeReal}
          style={{ marginTop: 12 }}
          disabled={!canAnalyze || loading}
        />

        {!canAnalyze ? (
          <Text style={{ color: COLORS.textSoft, marginTop: 10, textAlign: "center" }}>
            Necesitas 2 fotos (lado A + lado B) para analizar.
          </Text>
        ) : null}

        {isWeb() ? (
          <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 12, textAlign: "center" }}>
            En Web: el botón Cámara abre el selector (según navegador).
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// =====================
// REST OF SCREENS
// =====================
function HistoryScreen({ goBack, go }) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    const h = await loadHistory();
    setItems(h);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (useFocusEffect) {
    useFocusEffect(
      useCallback(() => {
        refresh();
      }, [refresh])
    );
  }

  return (
    <Screen>
      <TopTitle
        title="Historial"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              await refresh();
              safeAlert("Actualizado", "Historial refrescado.");
            }}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />
      <View style={{ paddingHorizontal: 18, flex: 1 }}>
        <Text style={{ color: COLORS.textSoft, marginBottom: 12 }}>
          {items.length} escaneos realizados
        </Text>

        {items.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: 32 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="time-outline" size={34} color={COLORS.textSoft} />
            </View>

            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, marginTop: 14 }}>
              No hay escaneos aún
            </Text>
            <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>
              Empieza escaneando tu primera llave
            </Text>

            <PrimaryButton
              title="Escanear llave"
              onPress={() => go("Scan")}
              style={{ marginTop: 16, paddingHorizontal: 22 }}
            />
          </Card>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {items.map((it) => (
              <Card key={it.id} style={{ marginBottom: 12 }}>
                <Row style={{ gap: 12 }}>
                  <View
                    style={{
                      width: 74,
                      height: 56,
                      borderRadius: 12,
                      overflow: "hidden",
                      backgroundColor: "#000",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                    }}
                  >
                    {it.frontUri ? (
                      <Image source={{ uri: it.frontUri }} style={{ width: "100%", height: "100%" }} />
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      {it.topTitle || "Escaneo"}
                    </Text>
                    <Text style={{ color: COLORS.textSoft, marginTop: 4 }}>
                      {new Date(it.createdAt).toLocaleString()}
                    </Text>
                    <Text style={{ color: COLORS.textSoft, marginTop: 4 }}>
                      Confianza: {Math.round((it.topConfidence || 0) * 100)}%
                    </Text>
                    {it.pendingFeedbackCount ? (
                      <Text style={{ color: COLORS.warning, marginTop: 4, fontWeight: "800" }}>
                        Feedback pendiente: {it.pendingFeedbackCount}
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity activeOpacity={0.85} onPress={() => safeAlert("Detalle", "Luego añadimos vista detalle.")}>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textSoft} />
                  </TouchableOpacity>
                </Row>
              </Card>
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

function TallerScreen({ goBack, go }) {
  const [stats, setStats] = useState({ total: 0, pending: 0 });

  const refresh = useCallback(async () => {
    const h = await loadHistory();
    const p = await loadPendingFeedback();
    setStats({ total: h.length, pending: p.length });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (useFocusEffect) {
    useFocusEffect(
      useCallback(() => {
        refresh();
      }, [refresh])
    );
  }

  return (
    <Screen>
      <TopTitle
        title="Perfil Taller"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              await refresh();
              safeAlert("Actualizado", "Stats refrescadas.");
            }}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }}>
        <Card style={{ marginTop: 14 }}>
          <Row style={{ gap: 10 }}>
            <Ionicons name="stats-chart-outline" size={18} color={COLORS.textSoft} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Estadísticas
            </Text>
          </Row>

          <Line label="Total de escaneos" value={String(stats.total)} />
          <Line label="Feedback pendiente" value={String(stats.pending)} valueColor={COLORS.warning} />

          <OutlineButton
            title="Reintentar enviar feedback pendiente"
            icon={<Ionicons name="cloud-upload-outline" size={18} color={COLORS.accent} />}
            onPress={async () => {
              try {
                const r = await flushPendingFeedback();
                await refresh();
                safeAlert("Feedback", `Enviados: ${r.sent}\nPendientes: ${r.left}`);
              } catch (e) {
                safeAlert("Error", String(e?.message || e));
              }
            }}
            style={{ marginTop: 14 }}
          />
        </Card>

        <PrimaryButton
          title="Ver historial completo"
          icon={<Ionicons name="trending-up-outline" size={18} color="#fff" />}
          onPress={() => go("History")}
          style={{ marginTop: 14 }}
        />
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value, valueColor }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 10 }}>
      <Text style={{ color: COLORS.textSoft }}>{label}</Text>
      <Text style={{ color: valueColor || COLORS.text, fontWeight: "900" }}>
        {value}
      </Text>
    </Row>
  );
}

function Field({ label, value, onChangeText, placeholder }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: COLORS.textSoft, fontWeight: "800", marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={"rgba(255,255,255,0.28)"}
        style={{
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: COLORS.text,
          fontWeight: "800",
        }}
      />
    </View>
  );
}

// ✅ CORREGIDO: ahora acepta onResetDemo y muestra botón de reset
function ConfigScreen({ goBack, onResetDemo }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshHealth = useCallback(async () => {
    try {
      setLoading(true);
      const h = await fetchHealth();
      setHealth(h);
    } catch (e) {
      setHealth({ ok: false, engine_error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  return (
    <Screen>
      <TopTitle
        title="Configuración"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
        <Text
          style={{
            color: COLORS.textSoft,
            fontWeight: "800",
            letterSpacing: 1,
            fontSize: 12,
            marginTop: 16,
            marginBottom: 10,
          }}
        >
          ACERCA DE
        </Text>
        <Card>
          <Row style={{ gap: 12 }}>
            <IconBox icon="information-circle-outline" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Versión</Text>
              <Text style={{ color: COLORS.textSoft, marginTop: 2 }}>v1.0.0</Text>
            </View>
          </Row>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 12 }} />

          <Row style={{ gap: 12 }}>
            <IconBox icon="cloud-outline" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Motor (Cloud Run)</Text>
              <Text style={{ color: COLORS.textSoft, marginTop: 2 }}>{MOTOR_BASE}</Text>
            </View>
          </Row>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 12 }} />

          <Row style={{ gap: 12, alignItems: "flex-start" }}>
            <IconBox icon="pulse-outline" />
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Estado del motor</Text>
                {loading ? (
                  <ActivityIndicator />
                ) : (
                  <TouchableOpacity activeOpacity={0.85} onPress={refreshHealth}>
                    <Ionicons name="refresh-outline" size={18} color={COLORS.accent} />
                  </TouchableOpacity>
                )}
              </Row>

              <Text style={{ color: (health?.ok ? COLORS.success : COLORS.danger), marginTop: 6, fontWeight: "900" }}>
                {health?.ok ? "OK" : "OFFLINE"}
              </Text>

              {health?.engine_loaded === false ? (
                <Text style={{ color: COLORS.warning, marginTop: 6, fontWeight: "800" }}>
                  engine_loaded: false
                </Text>
              ) : null}

              {health?.engine_error ? (
                <Text style={{ color: COLORS.textSoft, marginTop: 6 }}>
                  {String(health.engine_error)}
                </Text>
              ) : null}
            </View>
          </Row>
        </Card>

        {onResetDemo ? (
          <OutlineButton
            title="Resetear historial y feedback"
            icon={<Ionicons name="trash-outline" size={18} color={COLORS.accent} />}
            onPress={onResetDemo}
            style={{ marginTop: 14 }}
          />
        ) : null}

        <Text style={{ textAlign: "center", color: COLORS.textSoft, marginTop: 20, fontWeight: "700" }}>
          ScanKey — Motor REAL
        </Text>
      </ScrollView>
    </Screen>
  );
}

function IconBox({ icon }) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "rgba(47,136,255,0.12)",
        borderWidth: 1,
        borderColor: "rgba(47,136,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={18} color={COLORS.accent} />
    </View>
  );
}

function ResultsScreen({ goBack, go, scanDraft, onSaveToHistory, onNewScan }) {
  const analysis = scanDraft?.analysis || null;
  const [sending, setSending] = useState(false);

  const topCandidate = analysis?.results?.[0] || null;
  const { brand: topBrand, model: topModel } = parseModelTitle(topCandidate?.title);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualBrand, setManualBrand] = useState(topBrand || "");
  const [manualModel, setManualModel] = useState(topModel || topCandidate?.title || "");
  const [manualType, setManualType] = useState("");
  const [manualOrientation, setManualOrientation] = useState(topCandidate?.orientation || "");
  const [manualOCR, setManualOCR] = useState("");
  const [savedHistory, setSavedHistory] = useState(false);

  if (!analysis) return <Placeholder title="Resultados" goBack={goBack} />;

  const sendFeedback = async (candidate) => {
    if (sending) return;

    try {
      setSending(true);

      const { brand, model } = parseModelTitle(candidate?.title);
      const payload = {
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: candidate?.id_model_ref || null,
        source: "app_real",
        ocr_text: null,
        correct_brand: brand,
        correct_model: model || candidate?.title || null,
        correct_type: null,
        correct_orientation: candidate?.orientation || null,
      };

      await postFeedback(payload);
      safeAlert("OK", "Corrección enviada al motor (Cloud Run).");
    } catch (e) {
      const count = await queueFeedback({
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: candidate?.id_model_ref || null,
        source: "app_real_queued",
        ocr_text: null,
        correct_brand: parseModelTitle(candidate?.title)?.brand ?? null,
        correct_model:
          parseModelTitle(candidate?.title)?.model ?? candidate?.title ?? null,
        correct_type: null,
        correct_orientation: candidate?.orientation || null,
      });
      safeAlert(
        "Guardado (pendiente)",
        `El motor no aceptó el feedback.\nLo guardé para reenviarlo luego.\nPendientes: ${count}`
      );
    } finally {
      setSending(false);
    }
  };

  const sendManualFeedback = async () => {
    if (sending) return;

    const b = (manualBrand || "").trim() || null;
    const m = (manualModel || "").trim() || null;
    const t = (manualType || "").trim() || null;
    const o = (manualOrientation || "").trim() || null;
    const ocr = (manualOCR || "").trim() || null;

    if (!b && !m && !t && !o && !ocr) {
      safeAlert("Falta información", "Rellena al menos un campo antes de enviar.");
      return;
    }

    try {
      setSending(true);

      const payload = {
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: null,
        source: "app_manual",
        ocr_text: ocr,
        correct_brand: b,
        correct_model: m,
        correct_type: t,
        correct_orientation: o,
      };

      await postFeedback(payload);
      safeAlert("OK", "Corrección manual enviada al motor (Cloud Run).");
      setManualOpen(false);
    } catch (e) {
      const count = await queueFeedback({
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: null,
        source: "app_manual_queued",
        ocr_text: ocr,
        correct_brand: b,
        correct_model: m,
        correct_type: t,
        correct_orientation: o,
      });

      safeAlert(
        "Guardado (pendiente)",
        `No se pudo enviar ahora.
Quedó en cola.
Pendientes: ${count}`
      );
    } finally {
      setSending(false);
    }
  };

  const results = Array.isArray(analysis.results) ? analysis.results : [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}>
        <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22 }}>
              Resultados del análisis
            </Text>
            <Text style={{ color: COLORS.textSoft, marginTop: 4 }}>
              Procesado en {analysis.processed_ms ?? "—"}ms
            </Text>
          </View>

          <View style={{ width: 34 }} />
        </Row>

        <Card style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          <View
            style={{
              height: 160,
              backgroundColor: "#000",
              borderWidth: 2,
              borderColor: "rgba(47,136,255,0.65)",
              margin: 14,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {scanDraft?.frontUri ? (
              <Image
                source={{ uri: scanDraft.frontUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : null}
            <View style={{ position: "absolute", left: 12, top: 12 }}>
              <SmallPill text="Llave escaneada" />
            </View>
          </View>
        </Card>

        {analysis?.high_confidence ? (
          <Card style={{ marginTop: 12, borderColor: "rgba(32,201,151,0.35)" }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontWeight: "900" }}>
                Alta confianza — puedes aceptar directo
              </Text>
            </Row>
          </Card>
        ) : null}

        {analysis?.low_confidence ? (
          <Card style={{ marginTop: 12, borderColor: "rgba(255,176,32,0.35)" }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.warning} />
              <Text style={{ color: COLORS.warning, fontWeight: "900" }}>
                Resultado dudoso — recomendado corregir manualmente
              </Text>
            </Row>
          </Card>
        ) : null}

        {analysis?.manufacturer_hint?.found ? (
          <Card style={{ marginTop: 12 }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="pricetag-outline" size={18} color={COLORS.accent} />
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                Pista de fabricante: {analysis.manufacturer_hint?.name || "—"} (
                {Math.round((analysis.manufacturer_hint?.confidence || 0) * 100)}%)
              </Text>
            </Row>
          </Card>
        ) : null}

        {results.length ? (
          results.map((r, idx) => (
            <CandidateCard
              key={r.rank ?? idx}
              rank={r.rank ?? idx + 1}
              title={r.title ?? "Modelo"}
              id_model_ref={r.id_model_ref ?? null}
              orientation={r.orientation ?? "—"}
              headColor={r.headColor ?? "—"}
              state={r.state ?? "—"}
              tags={r.tags ?? []}
              confidence={typeof r.confidence === "number" ? r.confidence : 0}
              explain={r.explain ?? ""}
              patent={!!r.patent}
              sending={sending}
              onCorrect={() => sendFeedback(r)}
            />
          ))
        ) : (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ color: COLORS.textSoft }}>
              El motor respondió, pero no devolvió candidatos. Revisa el JSON del backend.
            </Text>
          </Card>
        )}

        <Card style={{ marginTop: 14 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="create-outline" size={18} color={COLORS.textSoft} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                Corrección manual
              </Text>
            </Row>

            <TouchableOpacity activeOpacity={0.85} onPress={() => setManualOpen((v) => !v)}>
              <Ionicons
                name={manualOpen ? "chevron-up-outline" : "chevron-down-outline"}
                size={20}
                color={COLORS.accent}
              />
            </TouchableOpacity>
          </Row>

          {manualOpen ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: COLORS.textSoft, marginBottom: 10 }}>
                Rellena lo que sepas. Con eso entrenamos el sistema.
              </Text>

              <Field label="Marca" value={manualBrand} onChangeText={setManualBrand} placeholder="Ej: JMA, TESA, CISA" />
              <Field label="Modelo" value={manualModel} onChangeText={setManualModel} placeholder="Ej: TE5, TE8I, ... " />
              <Field label="Tipo" value={manualType} onChangeText={setManualType} placeholder="Ej: plana, dimple, tubular..." />
              <Field label="Orientación" value={manualOrientation} onChangeText={setManualOrientation} placeholder="izquierda / derecha / simétrica" />
              <Field label="Texto (OCR)" value={manualOCR} onChangeText={setManualOCR} placeholder="Lo que pone en el cabezal" />

              <PrimaryButton
                title={sending ? "Enviando..." : "Enviar corrección manual"}
                icon={<Ionicons name="send-outline" size={18} color="#fff" />}
                onPress={sendManualFeedback}
                disabled={sending}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : null}
        </Card>

        <PrimaryButton
          title={savedHistory ? "Guardado" : "Guardar en historial"}
          icon={<Ionicons name="bookmark-outline" size={18} color="#fff" />}
          onPress={async () => {
            if (savedHistory) return;
            await onSaveToHistory?.();
            setSavedHistory(true);
          }}
          style={{ marginTop: 14, opacity: savedHistory ? 0.55 : 1 }}
          disabled={savedHistory}
        />

        <Row style={{ gap: 12, marginTop: 12 }}>
          <OutlineButton
            title="Nuevo escaneo"
            icon={<Ionicons name="refresh-outline" size={18} color={COLORS.accent} />}
            onPress={onNewScan}
            style={{ flex: 1 }}
          />
        </Row>
      </ScrollView>
    </Screen>
  );
}

function CandidateCard({
  rank,
  title,
  id_model_ref,
  orientation,
  headColor,
  state,
  tags,
  confidence,
  patent,
  explain,
  onCorrect,
  sending,
}) {
  const safeTags = Array.isArray(tags) ? tags : [];

  return (
    <Card style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
      <Row style={{ padding: 14, gap: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialCommunityIcons name="key" size={28} color={COLORS.textSoft} />
        </View>

        <View style={{ flex: 1 }}>
          <Row style={{ gap: 10 }}>
            <SmallPill text={`#${rank}`} />
            {patent && <Tag text="PATENTADA" tone="warning" />}
          </Row>

          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, marginTop: 8 }}>
            {title}
          </Text>

          <Text style={{ color: COLORS.textSoft, marginTop: 6 }}>
            Orientación: {orientation}
          </Text>
          <Text style={{ color: COLORS.textSoft, marginTop: 2 }}>
            Color cabezal: {headColor}
          </Text>
          <Text style={{ color: COLORS.textSoft, marginTop: 2 }}>
            Estado: {state}
          </Text>

          <Row style={{ flexWrap: "wrap", marginTop: 2 }}>
            {safeTags.map((t) => (
              <Tag key={t} text={t} />
            ))}
          </Row>

          <View style={{ marginTop: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.textSoft, fontWeight: "800" }}>
                Confianza
              </Text>
              <Text style={{ color: COLORS.textSoft, fontWeight: "900" }}>
                {typeof confidence === "number"
                  ? (confidence * 100).toFixed(1)
                  : "—"}
                %
              </Text>
            </Row>
            <View
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.08)",
                marginTop: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 8,
                  width: `${Math.max(
                    0,
                    Math.min(100, (confidence || 0) * 100)
                  )}%`,
                  backgroundColor: COLORS.accent,
                }}
              />
            </View>
          </View>

          {!!explain && (
            <Text style={{ color: COLORS.textSoft, marginTop: 10, fontStyle: "italic" }}>
              "{explain}"
            </Text>
          )}

          {id_model_ref ? (
            <Text style={{ color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
              ref: {id_model_ref}
            </Text>
          ) : null}
        </View>
      </Row>

      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <PrimaryButton
          title={sending ? "Enviando..." : "Esta es correcta"}
          icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
          onPress={onCorrect}
          disabled={sending}
          style={{ backgroundColor: "#19B36B" }}
        />
      </View>
    </Card>
  );
}

// =====================
// WEB fallback mini-router + Tabs
// =====================
function WebShell() {
  const [tab, setTab] = useState("Home");
  const [stack, setStack] = useState(["Home"]);
  const [scanDraft, setScanDraft] = useState(null);
  const resetScanRef = useRef(null);

  const current = stack[stack.length - 1];
  const go = (name) => setStack((s) => [...s, name]);
  const goBack = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const onResetDemo = async () => {
    await clearHistory();
    await clearPendingFeedback();
    safeAlert("Reset", "Historial y feedback pendiente eliminados.");
  };

  const onSaveToHistory = async () => {
    if (!scanDraft?.analysis) return;
    const h = await loadHistory();
    const pending = await loadPendingFeedback();
    const top = scanDraft.analysis.results?.[0] || null;
    const item = {
      id: String(Date.now()),
      createdAt: scanDraft.createdAt || Date.now(),
      frontUri: scanDraft.frontUri || null,
      backUri: scanDraft.backUri || null,
      topTitle: top?.title || "Resultado",
      topConfidence: top?.confidence || 0,
      pendingFeedbackCount: pending.length || 0,
    };
    const next = [item, ...h];
    await saveHistory(next);
    safeAlert("Guardado", "Añadido al historial.");
  };

  const onNewScan = () => {
    setScanDraft(null);
    if (resetScanRef.current) resetScanRef.current();
    setStack(["Scan"]);
    setTab("Scan");
  };

  const render = () => {
    if (current === "Home") return <HomeScreen go={go} />;
    if (current === "Scan")
      return (
        <ScanScreen
          go={go}
          goBack={goBack}
          setScanDraft={setScanDraft}
          onResetScanDraft={resetScanRef}
        />
      );
    if (current === "History") return <HistoryScreen go={go} goBack={goBack} />;
    if (current === "Taller") return <TallerScreen go={go} goBack={goBack} />;
    if (current === "Config")
      return <ConfigScreen goBack={goBack} onResetDemo={onResetDemo} />;
    if (current === "Results")
      return (
        <ResultsScreen
          goBack={goBack}
          go={go}
          scanDraft={scanDraft}
          onSaveToHistory={onSaveToHistory}
          onNewScan={onNewScan}
        />
      );
    if (current === "Guide") return <Placeholder title="Guía de captura" goBack={goBack} />;
    if (current === "Profile") return <Placeholder title="Perfil" goBack={goBack} />;
    return <Placeholder title={current} goBack={goBack} />;
  };

  const setTabRoute = (t) => {
    setTab(t);
    if (t === "Home") setStack(["Home"]);
    if (t === "Scan") setStack(["Scan"]);
    if (t === "History") setStack(["History"]);
    if (t === "Taller") setStack(["Taller"]);
    if (t === "Config") setStack(["Config"]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ flex: 1 }}>{render()}</View>
      <WebTabBar tab={tab} setTab={setTabRoute} />
    </View>
  );
}

function WebTabBar({ tab, setTab }) {
  const Item = ({ name, label, icon }) => {
    const active = tab === name;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setTab(name)}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 8 }}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active ? COLORS.accent : "rgba(255,255,255,0.55)"}
        />
        <Text
          style={{
            color: active ? COLORS.accent : "rgba(255,255,255,0.55)",
            fontWeight: "700",
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        height: 68,
        paddingBottom: 10,
        paddingTop: 8,
        backgroundColor: COLORS.cardSoft,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
        flexDirection: "row",
      }}
    >
      <Item name="Home" label="Home" icon="home-outline" />
      <Item name="Scan" label="Escanear" icon="camera-outline" />
      <Item name="History" label="Historial" icon="time-outline" />
      <Item name="Taller" label="Taller" icon="hammer-outline" />
      <Item name="Config" label="Config" icon="settings-outline" />
    </View>
  );
}

// =====================
// REAL NAV (native) if possible
// =====================
function NativeApp() {
  const nav = safeRequire("@react-navigation/native");
  const tabs = safeRequire("@react-navigation/bottom-tabs");
  const stack = safeRequire("@react-navigation/native-stack");

  if (
    !nav?.NavigationContainer ||
    !tabs?.createBottomTabNavigator ||
    !stack?.createNativeStackNavigator
  ) {
    return <WebShell />;
  }

  const NavigationContainer = nav.NavigationContainer;
  const { createBottomTabNavigator } = tabs;
  const { createNativeStackNavigator } = stack;

  const Tab = createBottomTabNavigator();
  const Stack = createNativeStackNavigator();

  const [scanDraft, setScanDraft] = useState(null);
  const resetScanRef = useRef(null);

  const onResetDemo = async () => {
    Alert.alert("Resetear", "¿Seguro que quieres borrar todo el historial?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          await clearHistory();
          await clearPendingFeedback();
          Alert.alert("OK", "Historial y feedback pendiente eliminados.");
        },
      },
    ]);
  };

  const onSaveToHistory = async () => {
    if (!scanDraft?.analysis) return;
    const h = await loadHistory();
    const pending = await loadPendingFeedback();
    const top = scanDraft.analysis.results?.[0] || null;
    const item = {
      id: String(Date.now()),
      createdAt: scanDraft.createdAt || Date.now(),
      frontUri: scanDraft.frontUri || null,
      backUri: scanDraft.backUri || null,
      topTitle: top?.title || "Resultado",
      topConfidence: top?.confidence || 0,
      pendingFeedbackCount: pending.length || 0,
    };
    const next = [item, ...h];
    await saveHistory(next);
    Alert.alert("Guardado", "Añadido al historial.");
  };

  function StackShell({ initial }) {
    return (
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={initial}
      >
        <Stack.Screen
          name="Home"
          children={(p) => <HomeScreen go={(n) => p.navigation.navigate(n)} />}
        />
        <Stack.Screen
          name="Scan"
          children={(p) => (
            <ScanScreen
              go={(n) => p.navigation.navigate(n)}
              goBack={() => p.navigation.goBack()}
              setScanDraft={setScanDraft}
              onResetScanDraft={resetScanRef}
            />
          )}
        />
        <Stack.Screen
          name="History"
          children={(p) => (
            <HistoryScreen
              go={(n) => p.navigation.navigate(n)}
              goBack={() => p.navigation.goBack()}
            />
          )}
        />
        <Stack.Screen
          name="Taller"
          children={(p) => (
            <TallerScreen
              go={(n) => p.navigation.navigate(n)}
              goBack={() => p.navigation.goBack()}
            />
          )}
        />
        <Stack.Screen
          name="Config"
          children={(p) => (
            <ConfigScreen
              goBack={() => p.navigation.goBack()}
              onResetDemo={onResetDemo}
            />
          )}
        />
        <Stack.Screen
          name="Results"
          children={(p) => (
            <ResultsScreen
              go={(n) => p.navigation.navigate(n)}
              goBack={() => p.navigation.goBack()}
              scanDraft={scanDraft}
              onSaveToHistory={onSaveToHistory}
              onNewScan={() => {
                setScanDraft(null);
                if (resetScanRef.current) resetScanRef.current();
                p.navigation.navigate("Scan");
              }}
            />
          )}
        />
        <Stack.Screen
          name="Guide"
          children={(p) => (
            <Placeholder
              title="Guía de captura"
              goBack={() => p.navigation.goBack()}
            />
          )}
        />
        <Stack.Screen
          name="Profile"
          children={(p) => (
            <Placeholder title="Perfil" goBack={() => p.navigation.goBack()} />
          )}
        />
      </Stack.Navigator>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.cardSoft,
            borderTopColor: "rgba(255,255,255,0.08)",
            borderTopWidth: 1,
            height: 68,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
          tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
          tabBarIcon: ({ color, focused }) => {
            const map = {
              HomeTab: focused ? "home" : "home-outline",
              ScanTab: focused ? "camera" : "camera-outline",
              HistoryTab: focused ? "time" : "time-outline",
              TallerTab: focused ? "hammer" : "hammer-outline",
              ConfigTab: focused ? "settings" : "settings-outline",
            };
            return <Ionicons name={map[route.name]} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="HomeTab"
          children={() => <StackShell initial="Home" />}
          options={{ title: "Home" }}
        />
        <Tab.Screen
          name="ScanTab"
          children={() => <StackShell initial="Scan" />}
          options={{ title: "Escanear" }}
        />
        <Tab.Screen
          name="HistoryTab"
          children={() => <StackShell initial="History" />}
          options={{ title: "Historial" }}
        />
        <Tab.Screen
          name="TallerTab"
          children={() => <StackShell initial="Taller" />}
          options={{ title: "Taller" }}
        />
        <Tab.Screen
          name="ConfigTab"
          children={() => <StackShell initial="Config" />}
          options={{ title: "Config" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  if (Platform.OS === "web") return <WebShell />;
  return <NativeApp />;
}
