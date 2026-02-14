import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// =====================
// Snack-safe optional requires
// =====================
const MOD_ASYNC = "@react-native-async-storage/async-storage";
const MOD_PICKER = "expo-image-picker";
const MOD_MANIP = "expo-image-manipulator";

function safeRequire(id) {
  try {
    // Expo Web/Metro falla con require(id). Esta indirección evita el análisis estático.
    const req = (0, eval)("require");
    return req(id);
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

function getImageManipulator() {
  const mod = safeRequire(MOD_MANIP);
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

const STORAGE_KEY = "scankey_demo_history_v2"; // v2 (sin fotos)
const STORAGE_KEY_PENDING_FEEDBACK = "scankey_pending_feedback_v1";

// =====================
// Cloud Run endpoints (REAL)
// - Puedes sobreescribir con EXPO_PUBLIC_MOTOR_BASE
// =====================
const ENV = (typeof process !== "undefined" && process && process.env) ? process.env : {};
const WEB_API_BASE =
  (typeof window !== "undefined" && window.__SCN_CONFIG__ && window.__SCN_CONFIG__.API_BASE)
    ? String(window.__SCN_CONFIG__.API_BASE)
    : "";

// Base del backend (Gateway por defecto). Se puede sobreescribir con EXPO_PUBLIC_GATEWAY_BASE / EXPO_PUBLIC_API_BASE / EXPO_PUBLIC_MOTOR_BASE
const MOTOR_BASE = (
  ENV.EXPO_PUBLIC_GATEWAY_BASE ||
  ENV.EXPO_PUBLIC_API_BASE ||
  ENV.EXPO_PUBLIC_MOTOR_BASE ||
  WEB_API_BASE ||
  "https://scankey-gateway-2apb4vvlhq-no.a.run.app"
).replace(/\/+$/, "");

const API_ANALYZE = `${MOTOR_BASE}/api/analyze-key`;
const API_FEEDBACK = `${MOTOR_BASE}/api/feedback`;

// =====================
// Storage helpers (no fotos persistidas)
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
    "Snack NO puede instalarlo desde el código.\n\nSolución:\n1) En Snack abre el menú (⋮)\n2) 'Dependencies'\n3) Añade: expo-image-picker\n4) Recarga."
  );
}

function clamp01(n) {
  const x = typeof n === "number" ? n : Number(n);
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function parseModelParts(r) {
  const brand = r?.brand ?? r?.marca ?? null;
  const model = r?.model ?? r?.modelo ?? null;
  if (brand || model) return { brand: brand || null, model: model || null };

  const title = r?.title ?? r?.label ?? r?.name ?? r?.model_name ?? "";
  const s = String(title || "").trim();
  if (!s) return { brand: null, model: null };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { brand: null, model: parts[0] };
  return { brand: parts[0] || null, model: parts.slice(1).join(" ") || null };
}

// =====================
// Network hardening: AbortController + timeout real
// =====================
const DEFAULT_TIMEOUT_MS = 12000;

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// =====================
// Upload helpers (FormData robusto)
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

// =====================
// Preprocess: resize/compresión + fallback automático
// - Intento 1/2: comprimida
// - Intento 2/2: original
// =====================
function getSizeNative(uri) {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      () => resolve(null)
    );
  });
}

function getSizeWeb(uri) {
  return new Promise((resolve) => {
    try {
      const img = new global.Image();
      img.onload = () =>
        resolve({
          w: img.naturalWidth || img.width,
          h: img.naturalHeight || img.height,
        });
      img.onerror = () => resolve(null);
      img.src = uri;
    } catch (e) {
      resolve(null);
    }
  });
}

async function getImageSize(uri) {
  if (!uri) return null;
  if (isWeb()) return await getSizeWeb(uri);
  return await getSizeNative(uri);
}

async function preprocessWebImage(
  uri,
  { maxSide = 1280, quality = 0.85 } = {}
) {
  try {
    const blob = await uriToBlob(uri);
    const bmp = await createImageBitmap(blob);

    let w = bmp.width;
    let h = bmp.height;
    const longSide = Math.max(w, h);
    const scale = longSide > maxSide ? maxSide / longSide : 1;

    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, tw, th);

    const outBlob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (!outBlob) return { uri, cleanup: [] };
    const outUrl = URL.createObjectURL(outBlob);
    return { uri: outUrl, cleanup: [outUrl] };
  } catch (e) {
    return { uri, cleanup: [] };
  }
}

async function preprocessNativeImage(
  uri,
  { maxSide = 1280, quality = 0.85 } = {}
) {
  const IM = getImageManipulator();
  if (!IM?.manipulateAsync) return { uri, cleanup: [] };

  const size = await getImageSize(uri);
  if (!size?.w || !size?.h) {
    try {
      const out = await IM.manipulateAsync(uri, [], {
        compress: quality,
        format: IM.SaveFormat?.JPEG || "jpeg",
      });
      return { uri: out?.uri || uri, cleanup: [] };
    } catch (e) {
      return { uri, cleanup: [] };
    }
  }

  const { w, h } = size;
  const longSide = Math.max(w, h);
  if (longSide <= maxSide) {
    try {
      const out = await IM.manipulateAsync(uri, [], {
        compress: quality,
        format: IM.SaveFormat?.JPEG || "jpeg",
      });
      return { uri: out?.uri || uri, cleanup: [] };
    } catch (e) {
      return { uri, cleanup: [] };
    }
  }

  const resize =
    w >= h ? { resize: { width: maxSide } } : { resize: { height: maxSide } };

  try {
    const out = await IM.manipulateAsync(uri, [resize], {
      compress: quality,
      format: IM.SaveFormat?.JPEG || "jpeg",
    });
    return { uri: out?.uri || uri, cleanup: [] };
  } catch (e) {
    return { uri, cleanup: [] };
  }
}

async function preprocessForUpload(uri) {
  if (!uri) return { uri, cleanup: [] };
  if (isWeb())
    return await preprocessWebImage(uri, { maxSide: 1280, quality: 0.85 });
  return await preprocessNativeImage(uri, { maxSide: 1280, quality: 0.85 });
}

// =====================
// Engine JSON normalizer (soporta el spec + variantes)
// =====================
const _normCache = new Map();

function normalizeEngineResponse(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const cacheKey = data.input_id || data.request_id || data.id || null;
  if (cacheKey && _normCache.has(cacheKey)) return _normCache.get(cacheKey);

  const input_id = data.input_id ?? data.request_id ?? data.id ?? null;
  const timestamp = data.timestamp || new Date().toISOString();

  const manufacturer_hint = (() => {
    const mh = data.manufacturer_hint || data.fabricante_hint || null;
    if (mh && typeof mh === "object") {
      return {
        found: !!mh.found,
        name: mh.name ?? null,
        confidence: clamp01(mh.confidence ?? mh.score ?? 0),
      };
    }
    const name = data.manufacturer || data.fabricante || null;
    const conf = clamp01(
      data.manufacturer_confidence ?? data.fabricante_confidence ?? 0
    );
    return { found: !!name && conf > 0, name: name || null, confidence: conf };
  })();

  const list =
    (Array.isArray(data.results) && data.results) ||
    (Array.isArray(data.candidates) && data.candidates) ||
    (Array.isArray(data.predictions) && data.predictions) ||
    [];

  const mapped = list
    .map((r) => {
      const confidence = clamp01(
        r.confidence ??
          r.score ??
          r.prob ??
          r.probability ??
          r.similarity ??
          0
      );

      const parts = parseModelParts(r);
      const type = r.type ?? r.tipo ?? null;

      const head_color =
        r.head_color ?? r.headColor ?? r.color_cabezal ?? r.headcolor ?? null;

      const visual_state =
        r.visual_state ?? r.state ?? r.condition ?? r.estado ?? null;

      const explain_text =
        r.explain_text ?? r.explain ?? r.reason ?? r.explicacion ?? "";

      const patentada = !!(r.patentada ?? r.patent ?? r.is_patented);

      const compatibility_tags =
        (Array.isArray(r.compatibility_tags) && r.compatibility_tags) ||
        (Array.isArray(r.tags) && r.tags) ||
        [];

      const crop_bbox = r.crop_bbox ?? r.cropBbox ?? r.bbox ?? r.crop ?? null;

      return {
        rank: r.rank ?? null,
        id_model_ref: r.id_model_ref ?? r.model_id ?? r.id ?? r.ref ?? null,
        type: type || null,
        brand: parts.brand,
        model: parts.model,
        orientation: r.orientation ?? r.orientacion ?? null,
        head_color: head_color || null,
        visual_state: visual_state || null,
        patentada,
        compatibility_tags,
        confidence,
        explain_text: String(explain_text || ""),
        crop_bbox:
          crop_bbox && typeof crop_bbox === "object"
            ? {
                x: Number(crop_bbox.x) || 0,
                y: Number(crop_bbox.y) || 0,
                w: Number(crop_bbox.w) || 0,
                h: Number(crop_bbox.h) || 0,
              }
            : null,
      };
    })
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const results = mapped.slice(0, 3).map((r, idx) => ({ ...r, rank: idx + 1 }));
  while (results.length < 3) {
    results.push({
      rank: results.length + 1,
      id_model_ref: null,
      type: null,
      brand: null,
      model: null,
      orientation: null,
      head_color: null,
      visual_state: null,
      patentada: false,
      compatibility_tags: [],
      confidence: 0,
      explain_text: "",
      crop_bbox: null,
    });
  }

  const top = results[0] || null;
  const topConf = clamp01(top?.confidence || 0);

  const high_confidence =
    typeof data.high_confidence === "boolean" ? data.high_confidence : topConf >= 0.95;

  const low_confidence =
    typeof data.low_confidence === "boolean" ? data.low_confidence : topConf < 0.60;

  const should_store_sample =
    typeof data.should_store_sample === "boolean" ? data.should_store_sample : false;

  const storage_probability =
    typeof data.storage_probability === "number" ? data.storage_probability : 0.75;

  const current_samples_for_candidate =
    typeof data.current_samples_for_candidate === "number"
      ? data.current_samples_for_candidate
      : 0;

  const manual_correction_hint =
    data.manual_correction_hint && typeof data.manual_correction_hint === "object"
      ? data.manual_correction_hint
      : { fields: ["marca", "modelo", "tipo", "orientacion", "ocr_text"] };

  const debug = (() => {
    const d = data.debug && typeof data.debug === "object" ? data.debug : {};
    const processing_time_ms =
      d.processing_time_ms ?? data.processing_time_ms ?? data.processed_ms ?? data.ms ?? 0;

    const model_version = d.model_version ?? data.model_version ?? null;
    return {
      processing_time_ms: Number(processing_time_ms) || 0,
      model_version: model_version ? String(model_version) : null,
    };
  })();

  const normalized = {
    input_id,
    timestamp,
    manufacturer_hint,
    results,
    low_confidence,
    high_confidence,
    should_store_sample,
    storage_probability,
    current_samples_for_candidate,
    manual_correction_hint,
    debug,
  };

  if (cacheKey) _normCache.set(cacheKey, normalized);
  return normalized;
}

// =====================
// Analyze POST (1 intento, sin retry interno)
// =====================
async function postAnalyzeOnce(frontUri, backUri, modoTaller, { timeoutMs = 12000 } = {}) {
  const fd = new FormData();

  await appendFileToFormData(fd, "front", frontUri, "front.jpg");
  await appendFileToFormData(fd, "back", backUri, "back.jpg");
  await appendFileToFormData(fd, "image_front", frontUri, "front.jpg");
  await appendFileToFormData(fd, "image_back", backUri, "back.jpg");

  fd.append("source", "app");
  fd.append("modo_taller", String(!!modoTaller));

  const res = await fetchWithTimeout(
    API_ANALYZE,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
    },
    timeoutMs
  );

  const rawText = await res.text().catch(() => "");
  const data = safeJsonParse(rawText);

  if (!res.ok) {
    const msg = data?.detail || data?.error || rawText || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  if (!data || typeof data !== "object") {
    throw new Error("Respuesta inválida (no JSON).");
  }

  return normalizeEngineResponse(data);
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
  const next = [{ id: String(Date.now()), createdAt: Date.now(), payload }, ...list];
  await savePendingFeedback(next);
  return next.length;
}

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
// UI primitives
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
          fontSize: 24,
          fontWeight: "900",
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
      <Text style={[{ color: "#fff", fontWeight: "900", fontSize: 16 }, textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function OutlineButton({ title, icon, color = COLORS.accent, onPress, style, disabled }) {
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
      <Text style={{ color, fontWeight: "900", fontSize: 15 }}>{title}</Text>
    </TouchableOpacity>
  );
}

function Tag({ text, tone = "neutral" }) {
  const map = {
    neutral: { bg: "rgba(255,255,255,0.07)", fg: COLORS.textSoft },
    accent: { bg: "rgba(47,136,255,0.16)", fg: COLORS.accent },
    warning: { bg: "rgba(255,176,32,0.16)", fg: COLORS.warning },
    success: { bg: "rgba(32,201,151,0.16)", fg: COLORS.success },
    danger: { bg: "rgba(255,80,80,0.16)", fg: COLORS.danger },
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
      <Text style={{ color: t.fg, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function SmallPill({ text, tone = "accent" }) {
  const map = {
    accent: { bg: "rgba(47,136,255,0.18)", fg: COLORS.accent },
    warning: { bg: "rgba(255,176,32,0.18)", fg: COLORS.warning },
    success: { bg: "rgba(32,201,151,0.18)", fg: COLORS.success },
    danger: { bg: "rgba(255,80,80,0.18)", fg: COLORS.danger },
    neutral: { bg: "rgba(255,255,255,0.10)", fg: COLORS.textSoft },
  };
  const t = map[tone] || map.accent;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: t.fg, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function ConfidenceMeter({ confidence }) {
  const c = clamp01(confidence);
  const pct = Math.round(c * 100);

  let title = "Confianza baja";
  let icon = "close-circle-outline";
  let color = COLORS.danger;

  if (c >= 0.95) {
    title = "Alta confianza";
    icon = "checkmark-circle-outline";
    color = COLORS.success;
  } else if (c >= 0.60) {
    title = "Confianza media";
    icon = "alert-circle-outline";
    color = COLORS.warning;
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: 10 }}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={{ color, fontWeight: "900", fontSize: 16 }}>{title}</Text>
        </Row>
        <Text style={{ color, fontWeight: "900", fontSize: 18 }}>{pct}%</Text>
      </Row>

      <View
        style={{
          height: 10,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
          marginTop: 12,
          overflow: "hidden",
        }}
      >
        <View style={{ height: 10, width: `${pct}%`, backgroundColor: color }} />
      </View>

      <Text style={{ color: COLORS.textSoft, marginTop: 10 }}>
        Nivel de certeza del análisis.
      </Text>
    </Card>
  );
}

function useImageNaturalSize(uri) {
  const [size, setSize] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getImageSize(uri);
      if (!alive) return;
      setSize(s);
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  return size;
}

function CropPreview({ uri, crop_bbox, size, style }) {
  if (!uri || !crop_bbox || !size?.w || !size?.h) {
    return (
      <View
        style={[
          {
            width: 74,
            height: 56,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <MaterialCommunityIcons name="key" size={22} color={COLORS.textSoft} />
      </View>
    );
  }

  const cw = 74;
  const ch = 56;

  const bx = clamp01(crop_bbox.x) * size.w;
  const by = clamp01(crop_bbox.y) * size.h;
  const bw = Math.max(1, clamp01(crop_bbox.w) * size.w);
  const bh = Math.max(1, clamp01(crop_bbox.h) * size.h);

  const scale = Math.max(cw / bw, ch / bh);
  const dw = size.w * scale;
  const dh = size.h * scale;

  const left = -bx * scale;
  const top = -by * scale;

  return (
    <View
      style={[
        {
          width: cw,
          height: ch,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#000",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={{
          position: "absolute",
          width: dw,
          height: dh,
          left,
          top,
        }}
        resizeMode="cover"
      />
    </View>
  );
}

// =====================
// Screens
// =====================
function HomeScreen({ go }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
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

        <View style={{ alignItems: "center", marginTop: 38, marginBottom: 18 }}>
          <View
            style={{
              width: 92,
              height: 92,
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
          Haz 2 fotos (lado A y lado B). Recibirás{"\n"}TOP 3 candidatos con explicación.
        </Text>

        <PrimaryButton
          title="Escanear llave"
          icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
          onPress={() => go("Scan")}
          style={{ marginTop: 22 }}
        />

        <Row style={{ gap: 12, marginTop: 14 }}>
          <QuickCard title="Historial" icon="time-outline" onPress={() => go("History")} />
          <QuickCard title="Taller" icon="hammer-outline" onPress={() => go("Taller")} />
          <QuickCard title="Guía" icon="book-outline" onPress={() => go("Guide")} />
        </Row>

        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            textAlign: "center",
            marginTop: 18,
            fontWeight: "800",
          }}
        >
          Motor REAL en Cloud Run
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
      <Text style={{ color: COLORS.textSoft, fontWeight: "900", textAlign: "center" }}>
        {title}
      </Text>
    </TouchableOpacity>
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
          <Image
            source={{ uri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
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
              <Text style={{ fontWeight: "900", color: COLORS.textSoft }}>Galería</Text>
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
      quality: 1,
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
      quality: 1,
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

    let cleanup = [];
    try {
      setLoading(true);
      setLoadingMsg("Intento 1/2");

      const pFront = await preprocessForUpload(frontUri);
      const pBack = await preprocessForUpload(backUri);
      cleanup = [...(pFront.cleanup || []), ...(pBack.cleanup || [])];

      const analysis1 = await postAnalyzeOnce(pFront.uri, pBack.uri, modoTaller, { timeoutMs: 12000 });

      setScanDraft({
        input_id: analysis1?.input_id || nowId(),
        createdAt: Date.now(),
        frontUri,
        backUri,
        modoTaller,
        analysis: analysis1,
      });

      go("Results");
    } catch (e1) {
      try {
        setLoadingMsg("Intento 2/2");
        const analysis2 = await postAnalyzeOnce(frontUri, backUri, modoTaller, { timeoutMs: 15000 });

        setScanDraft({
          input_id: analysis2?.input_id || nowId(),
          createdAt: Date.now(),
          frontUri,
          backUri,
          modoTaller,
          analysis: analysis2,
        });

        go("Results");
      } catch (e2) {
        safeAlert("Error analizando", String(e2?.message || e2));
      }
    } finally {
      setLoading(false);
      setLoadingMsg("");
      if (isWeb() && cleanup.length) {
        cleanup.forEach((u) => {
          try {
            URL.revokeObjectURL(u);
          } catch (e) {}
        });
      }
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
        right={
          <TouchableOpacity activeOpacity={0.85} onPress={() => go("Guide")}>
            <Ionicons name="help-circle-outline" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <View
            style={{
              width: 86,
              height: 86,
              borderRadius: 24,
              backgroundColor: "rgba(47,136,255,0.10)",
              borderWidth: 1,
              borderColor: "rgba(47,136,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles-outline" size={34} color={COLORS.accent} />
          </View>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22, marginTop: 16 }}>
            Analizando…
          </Text>
          <Text style={{ color: COLORS.textSoft, marginTop: 8, fontWeight: "800" }}>
            {loadingMsg || "Intento 1/2"}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 26 }}>
          <PhotoBlock
            title="Foto Lado A"
            hint="Fondo blanco mate, buena luz, llave centrada"
            uri={frontUri}
            onCamera={() => openCameraViaPicker("front")}
            onGallery={() => pickFromGallery("front")}
            onClear={() => setFrontUri(null)}
          />

          <PhotoBlock
            title="Foto Lado B"
            hint="Misma luz y fondo. Que se vea bien la punta y guías"
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
            <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>
              Taller: más señales y flujo interno (sin guardar fotos en el móvil).
            </Text>
          </Card>

          <OutlineButton
            title="Cargar 2 fotos desde galería"
            icon={<Ionicons name="images-outline" size={18} color={COLORS.accent} />}
            onPress={async () => {
              await pickFromGallery("front");
              await pickFromGallery("back");
            }}
            style={{ marginTop: 14 }}
          />

          <PrimaryButton
            title="Analizar (REAL)"
            icon={<Ionicons name="sparkles-outline" size={18} color="#fff" />}
            onPress={analyzeReal}
            style={{ marginTop: 12 }}
            disabled={!canAnalyze}
          />

          {!canAnalyze ? (
            <Text style={{ color: COLORS.textSoft, marginTop: 10, textAlign: "center" }}>
              Necesitas 2 fotos (lado A + lado B).
            </Text>
          ) : null}

          {isWeb() ? (
            <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 12, textAlign: "center" }}>
              En Web: “Cámara” abre selector según navegador.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function CandidateCard({ rank, result, previewUri, previewSize, onPickCorrect, sending }) {
  const confidence = clamp01(result?.confidence || 0);
  const pct = Math.round(confidence * 100);

  const icon =
    rank === 1 ? "trophy-outline" : rank === 2 ? "medal-outline" : "ribbon-outline";

  const brand = result?.brand || "—";
  const model = result?.model || "";
  const titleLine = brand === "—" ? "Modelo desconocido" : brand;
  const subLine = model || "";

  return (
    <Card style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
      <Row style={{ padding: 14, gap: 12 }}>
        <CropPreview uri={previewUri} crop_bbox={result?.crop_bbox} size={previewSize} />

        <View style={{ flex: 1 }}>
          <Row style={{ gap: 10 }}>
            <SmallPill text={`#${rank}`} />
            <View style={{ marginLeft: 2 }}>
              <Ionicons name={icon} size={16} color={COLORS.textSoft} />
            </View>
            {result?.patentada ? <Tag text="PATENTADA" tone="warning" /> : null}
          </Row>

          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, marginTop: 8 }}>
            {titleLine}
          </Text>
          {!!subLine ? (
            <Text style={{ color: COLORS.textSoft, marginTop: 2, fontWeight: "800" }}>
              {subLine}
            </Text>
          ) : null}

          <Row style={{ flexWrap: "wrap", marginTop: 4 }}>
            {result?.type ? <Tag text={String(result.type)} tone="accent" /> : null}
            {result?.orientation ? <Tag text={`Orientación: ${result.orientation}`} /> : null}
            {result?.head_color ? <Tag text={`Cabezal: ${result.head_color}`} /> : null}
            {result?.visual_state ? <Tag text={`Estado: ${result.visual_state}`} /> : null}
            {Array.isArray(result?.compatibility_tags)
              ? result.compatibility_tags.slice(0, 3).map((t) => <Tag key={t} text={t} />)
              : null}
          </Row>

          <View style={{ marginTop: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.textSoft, fontWeight: "900" }}>Confianza</Text>
              <Text style={{ color: COLORS.textSoft, fontWeight: "900" }}>{pct}%</Text>
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
              <View style={{ height: 8, width: `${pct}%`, backgroundColor: COLORS.accent }} />
            </View>
          </View>

          {!!result?.explain_text ? (
            <Text style={{ color: COLORS.textSoft, marginTop: 10, fontStyle: "italic" }}>
              "{result.explain_text}"
            </Text>
          ) : null}
        </View>
      </Row>

      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <PrimaryButton
          title={sending ? "Enviando…" : "Esta es correcta"}
          icon={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
          onPress={onPickCorrect}
          disabled={sending}
          style={{ backgroundColor: "#19B36B" }}
        />
      </View>
    </Card>
  );
}

function ResultsScreen({ goBack, go, scanDraft, onSaveToHistory, onNewScan }) {
  const analysis = scanDraft?.analysis || null;
  const [sending, setSending] = useState(false);
  const autoForcedRef = useRef(false);

  const previewSize = useImageNaturalSize(scanDraft?.frontUri || null);

  const results = useMemo(() => {
    const r = analysis?.results;
    return Array.isArray(r) ? r : [];
  }, [analysis]);

  const topConf = clamp01(results?.[0]?.confidence || 0);
  const low = !!analysis?.low_confidence;
  const high = !!analysis?.high_confidence;

  useEffect(() => {
    if (low && !autoForcedRef.current) {
      autoForcedRef.current = true;
      setTimeout(() => {
        go("Manual");
      }, 10);
    }
  }, [low, go]);

  if (!analysis) {
    return (
      <Screen>
        <TopTitle
          title="Resultados"
          left={
            <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
              <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
            </TouchableOpacity>
          }
        />
        <View style={{ paddingHorizontal: 18 }}>
          <Card>
            <Text style={{ color: COLORS.textSoft }}>No hay análisis. Vuelve a Escanear.</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  const sendFeedbackForCandidate = async (candidate) => {
    if (sending) return;
    setSending(true);
    try {
      const payload = {
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: candidate?.id_model_ref || null,
        source: "app_real",
        ocr_text: null,
        correct_brand: candidate?.brand || null,
        correct_model: candidate?.model || null,
        correct_type: candidate?.type || null,
        correct_orientation: candidate?.orientation || null,
      };
      await postFeedback(payload);
      safeAlert("OK", "Feedback enviado.");
    } catch (e) {
      const count = await queueFeedback({
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: candidate?.id_model_ref || null,
        source: "app_real_queued",
        ocr_text: null,
        correct_brand: candidate?.brand || null,
        correct_model: candidate?.model || null,
        correct_type: candidate?.type || null,
        correct_orientation: candidate?.orientation || null,
      });
      safeAlert("Guardado", `Sin red. Feedback en cola.\nPendientes: ${count}`);
    } finally {
      setSending(false);
    }
  };

  const acceptAndDuplicate = async () => {
    const top = results?.[0] || null;
    if (!top) return;
    await sendFeedbackForCandidate(top);
    if (!low) await onSaveToHistory?.();
    onNewScan?.();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}>
        <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22 }}>Resultados</Text>
            <Text style={{ color: COLORS.textSoft, marginTop: 4 }}>
              {analysis?.debug?.processing_time_ms
                ? `Procesado en ${analysis.debug.processing_time_ms}ms`
                : "Motor REAL"}
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.85} onPress={() => go("Guide")}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        </Row>

        <ConfidenceMeter confidence={topConf} />

        {analysis?.manufacturer_hint?.found && analysis?.manufacturer_hint?.name ? (
          <Card style={{ marginTop: 12 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Fabricante detectado</Text>
              <SmallPill
                text={`${Math.round(clamp01(analysis.manufacturer_hint.confidence) * 100)}%`}
                tone="accent"
              />
            </Row>
            <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>
              {analysis.manufacturer_hint.name}
            </Text>
          </Card>
        ) : null}

        {low ? (
          <Card style={{ marginTop: 12, borderColor: "rgba(255,176,32,0.35)" }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="alert-circle-outline" size={20} color={COLORS.warning} />
              <Text style={{ color: COLORS.warning, fontWeight: "900", fontSize: 16 }}>
                Resultado dudoso
              </Text>
            </Row>
            <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>
              Debes usar <Text style={{ color: COLORS.text, fontWeight: "900" }}>Corregir manualmente</Text>.
            </Text>
          </Card>
        ) : null}

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
              <Image source={{ uri: scanDraft.frontUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : null}
            <View style={{ position: "absolute", left: 12, top: 12 }}>
              <SmallPill text="Llave escaneada" tone="accent" />
            </View>
          </View>
        </Card>

        {results.map((r, idx) => (
          <CandidateCard
            key={`${r.rank || idx}-${r.id_model_ref || "x"}`}
            rank={r.rank || idx + 1}
            result={r}
            previewUri={scanDraft?.frontUri || null}
            previewSize={previewSize}
            sending={sending}
            onPickCorrect={() => sendFeedbackForCandidate(r)}
          />
        ))}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 14,
          backgroundColor: COLORS.cardSoft,
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
        }}
      >
        <Row style={{ gap: 12 }}>
          <OutlineButton
            title="Corregir manualmente"
            icon={<Ionicons name="create-outline" size={18} color={COLORS.accent} />}
            onPress={() => go("Manual")}
            style={{ flex: 1 }}
          />

          {high ? (
            <PrimaryButton
              title="Aceptar y duplicar"
              icon={<Ionicons name="copy-outline" size={18} color="#fff" />}
              onPress={acceptAndDuplicate}
              style={{ flex: 1 }}
              disabled={sending}
            />
          ) : (
            <PrimaryButton
              title="Guardar en historial"
              icon={<Ionicons name="bookmark-outline" size={18} color="#fff" />}
              onPress={async () => {
                if (low) {
                  go("Manual");
                  return;
                }
                await onSaveToHistory?.();
              }}
              style={{ flex: 1 }}
              disabled={sending}
            />
          )}
        </Row>

        <OutlineButton
          title="Nuevo escaneo"
          icon={<Ionicons name="refresh-outline" size={18} color={COLORS.accent} />}
          onPress={onNewScan}
          style={{ marginTop: 10 }}
          disabled={sending}
        />
      </View>
    </Screen>
  );
}

function ManualCorrectionScreen({ goBack, go, scanDraft }) {
  const analysis = scanDraft?.analysis || null;
  const [sending, setSending] = useState(false);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [type, setType] = useState("");
  const [orientation, setOrientation] = useState("");
  const [ocrText, setOcrText] = useState("");

  useEffect(() => {
    const top = analysis?.results?.[0] || null;
    if (!top) return;
    setBrand((top.brand || "") + "");
    setModel((top.model || "") + "");
    setType((top.type || "") + "");
    setOrientation((top.orientation || "") + "");
  }, [analysis]);

  if (!analysis) {
    return (
      <Screen>
        <TopTitle
          title="Corrección manual"
          left={
            <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
              <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
            </TouchableOpacity>
          }
        />
        <View style={{ paddingHorizontal: 18 }}>
          <Card>
            <Text style={{ color: COLORS.textSoft }}>No hay datos para corregir.</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  const submit = async () => {
    if (sending) return;
    if (!brand.trim() || !model.trim()) {
      safeAlert("Falta info", "Marca y modelo son obligatorios.");
      return;
    }

    setSending(true);
    try {
      const payload = {
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: null,
        source: "app_manual",
        ocr_text: ocrText ? String(ocrText) : null,
        correct_brand: brand.trim(),
        correct_model: model.trim(),
        correct_type: type ? String(type) : null,
        correct_orientation: orientation ? String(orientation) : null,
      };

      await postFeedback(payload);
      safeAlert("OK", "Corrección enviada.");
      goBack();
    } catch (e) {
      const count = await queueFeedback({
        input_id:
          scanDraft?.input_id ||
          analysis?.input_id ||
          String(scanDraft?.createdAt || Date.now()),
        chosen_id_model_ref: null,
        source: "app_manual_queued",
        ocr_text: ocrText ? String(ocrText) : null,
        correct_brand: brand.trim(),
        correct_model: model.trim(),
        correct_type: type ? String(type) : null,
        correct_orientation: orientation ? String(orientation) : null,
      });
      safeAlert("Guardado", `Sin red. Corrección en cola.\nPendientes: ${count}`);
      goBack();
    } finally {
      setSending(false);
    }
  };

  const pickFromCandidate = (r) => {
    setBrand((r?.brand || "") + "");
    setModel((r?.model || "") + "");
    setType((r?.type || "") + "");
    setOrientation((r?.orientation || "") + "");
  };

  return (
    <Screen>
      <TopTitle
        title="Corrección manual"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 26 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <View style={{ height: 160, backgroundColor: "#000" }}>
            {scanDraft?.frontUri ? (
              <Image
                source={{ uri: scanDraft.frontUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : null}
          </View>
          <View style={{ padding: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Rellena lo que sabes (mínimo marca + modelo)
            </Text>
            <Text style={{ color: COLORS.textSoft, marginTop: 6 }}>
              Esto ayuda a entrenar y mejorar el motor.
            </Text>
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.textSoft, fontWeight: "900", fontSize: 12, letterSpacing: 1 }}>
            SUGERENCIAS (TOP 3)
          </Text>
          <Row style={{ flexWrap: "wrap", marginTop: 8 }}>
            {(analysis?.results || []).map((r, i) => {
              const label = `${r?.brand || "—"} ${r?.model || ""}`.trim();
              return (
                <TouchableOpacity
                  key={`${i}-${r?.id_model_ref || "x"}`}
                  activeOpacity={0.85}
                  onPress={() => pickFromCandidate(r)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    marginRight: 8,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: COLORS.textSoft, fontWeight: "900" }}>
                    {label || "—"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Row>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Field label="Marca *" value={brand} setValue={setBrand} placeholder="Ej: TESA, JMA, CISA…" />
          <Field label="Modelo *" value={model} setValue={setModel} placeholder="Ej: TE8I, TE5D…" />
          <Field label="Tipo" value={type} setValue={setType} placeholder="Ej: plana, dimple…" />
          <Field label="Orientación" value={orientation} setValue={setOrientation} placeholder="Ej: izquierda/derecha/simétrica" />
          <Field label="Texto cabezal (OCR)" value={ocrText} setValue={setOcrText} placeholder="Ej: TE8I, JMA…" />
        </Card>

        <PrimaryButton
          title={sending ? "Enviando…" : "Enviar corrección"}
          icon={<Ionicons name="send-outline" size={18} color="#fff" />}
          onPress={submit}
          style={{ marginTop: 14 }}
          disabled={sending}
        />

        <OutlineButton
          title="Volver a resultados"
          icon={<Ionicons name="arrow-back-outline" size={18} color={COLORS.accent} />}
          onPress={goBack}
          style={{ marginTop: 10 }}
          disabled={sending}
        />
      </ScrollView>
    </Screen>
  );
}

function Field({ label, value, setValue, placeholder }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: COLORS.textSoft, fontWeight: "900", marginBottom: 8 }}>
        {label}
      </Text>
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.04)",
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.25)"
          style={{ color: COLORS.text, fontWeight: "800" }}
        />
      </View>
    </View>
  );
}

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
              safeAlert("OK", "Historial actualizado.");
            }}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      <View style={{ paddingHorizontal: 18, flex: 1 }}>
        <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: COLORS.textSoft, fontWeight: "800" }}>
            {items.length} escaneos
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              Alert.alert("Borrar", "¿Borrar historial?", [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Borrar",
                  style: "destructive",
                  onPress: async () => {
                    await clearHistory();
                    await refresh();
                  },
                },
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.warning} />
          </TouchableOpacity>
        </Row>

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
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons name="key" size={22} color={COLORS.textSoft} />
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
                    {it.low_confidence ? (
                      <Text style={{ color: COLORS.warning, marginTop: 4, fontWeight: "900" }}>
                        Dudoso (corregir manualmente)
                      </Text>
                    ) : null}
                  </View>
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
        title="Taller"
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
              safeAlert("OK", "Actualizado.");
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

          <Line label="Total escaneos (sin fotos)" value={String(stats.total)} />
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
          title="Escanear otra llave"
          icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
          onPress={() => go("Scan")}
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
      <Text style={{ color: valueColor || COLORS.text, fontWeight: "900" }}>{value}</Text>
    </Row>
  );
}

function GuideScreen({ goBack, go }) {
  return (
    <Screen>
      <TopTitle
        title="Guía de captura"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 26 }}>
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
            Cómo hacer fotos que acierten
          </Text>
          <Text style={{ color: COLORS.textSoft, marginTop: 8, lineHeight: 20 }}>
            1) Fondo blanco mate{"\n"}
            2) Buena luz (si puedes, flash){"\n"}
            3) Llave centrada y completa{"\n"}
            4) Evita sombras fuertes y reflejos{"\n"}
            5) Haz siempre lado A + lado B
          </Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            Trucos rápidos
          </Text>
          <Row style={{ flexWrap: "wrap", marginTop: 8 }}>
            <Tag text="Fondo blanco" tone="success" />
            <Tag text="Luz fuerte" tone="accent" />
            <Tag text="Sin movimiento" tone="accent" />
            <Tag text="Punta visible" tone="accent" />
            <Tag text="Cabezal visible" tone="accent" />
          </Row>
          <Text style={{ color: COLORS.textSoft, marginTop: 10 }}>
            Si sale “dudoso”, usa “Corregir manualmente”.
          </Text>
        </Card>

        <PrimaryButton
          title="Ir a escanear"
          icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
          onPress={() => go("Scan")}
          style={{ marginTop: 14 }}
        />
      </ScrollView>
    </Screen>
  );
}

function ProfileScreen({ goBack, go }) {
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const p = await loadPendingFeedback();
    setPending(p.length || 0);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Screen>
      <TopTitle
        title="Perfil"
        left={
          <TouchableOpacity activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 26 }}>
        <Card style={{ marginTop: 14 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Estado</Text>
            <SmallPill text={pending ? `${pending} pendiente` : "OK"} tone={pending ? "warning" : "success"} />
          </Row>
          <Text style={{ color: COLORS.textSoft, marginTop: 10 }}>
            Privacidad: el historial guarda solo metadatos (sin fotos).
          </Text>

          <OutlineButton
            title="Enviar feedback pendiente"
            icon={<Ionicons name="cloud-upload-outline" size={18} color={COLORS.accent} />}
            onPress={async () => {
              const r = await flushPendingFeedback();
              await refresh();
              safeAlert("Feedback", `Enviados: ${r.sent}\nPendientes: ${r.left}`);
            }}
            style={{ marginTop: 14 }}
          />
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Motor</Text>
          <Text style={{ color: COLORS.textSoft, marginTop: 8 }}>{MOTOR_BASE}</Text>
        </Card>

        <PrimaryButton
          title="Ir a ajustes"
          icon={<Ionicons name="settings-outline" size={18} color="#fff" />}
          onPress={() => go("Config")}
          style={{ marginTop: 14 }}
        />
      </ScrollView>
    </Screen>
  );
}

function ConfigScreen({ goBack, onResetDemo }) {
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
            fontWeight: "900",
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
              <Text style={{ color: COLORS.textSoft, marginTop: 2 }}>v1a1 (clean)</Text>
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
        </Card>

        {onResetDemo ? (
          <OutlineButton
            title="Resetear historial y feedback"
            icon={<Ionicons name="trash-outline" size={18} color={COLORS.accent} />}
            onPress={onResetDemo}
            style={{ marginTop: 14 }}
          />
        ) : null}

        <Text style={{ textAlign: "center", color: COLORS.textSoft, marginTop: 20, fontWeight: "800" }}>
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
    const top = scanDraft.analysis.results?.[0] || null;

    const item = {
      id: String(Date.now()),
      createdAt: scanDraft.createdAt || Date.now(),
      input_id: scanDraft.input_id || scanDraft.analysis.input_id || null,
      topTitle: `${top?.brand || ""} ${top?.model || ""}`.trim() || "Resultado",
      topConfidence: top?.confidence || 0,
      low_confidence: !!scanDraft.analysis.low_confidence,
      high_confidence: !!scanDraft.analysis.high_confidence,
    };

    const next = [item, ...h];
    await saveHistory(next);
    safeAlert("Guardado", "Añadido al historial (sin fotos).");
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
    if (current === "Manual")
      return <ManualCorrectionScreen goBack={goBack} go={go} scanDraft={scanDraft} />;
    if (current === "History") return <HistoryScreen go={go} goBack={goBack} />;
    if (current === "Taller") return <TallerScreen go={go} goBack={goBack} />;
    if (current === "Guide") return <GuideScreen go={go} goBack={goBack} />;
    if (current === "Profile") return <ProfileScreen go={go} goBack={goBack} />;
    if (current === "Config") return <ConfigScreen goBack={goBack} onResetDemo={onResetDemo} />;

    return (
      <Screen>
        <TopTitle
          title={current}
          left={
            <TouchableOpacity onPress={goBack}>
              <Ionicons name="arrow-back" size={22} color={COLORS.accent} />
            </TouchableOpacity>
          }
        />
        <View style={{ paddingHorizontal: 18 }}>
          <Card>
            <Text style={{ color: COLORS.textSoft }}>Pantalla no encontrada.</Text>
          </Card>
        </View>
      </Screen>
    );
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
        <Ionicons name={icon} size={22} color={active ? COLORS.accent : "rgba(255,255,255,0.55)"} />
        <Text
          style={{
            color: active ? COLORS.accent : "rgba(255,255,255,0.55)",
            fontWeight: "800",
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

  if (!nav?.NavigationContainer || !tabs?.createBottomTabNavigator || !stack?.createNativeStackNavigator) {
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
    Alert.alert("Resetear", "¿Borrar historial y feedback?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          await clearHistory();
          await clearPendingFeedback();
          Alert.alert("OK", "Eliminado.");
        },
      },
    ]);
  };

  const onSaveToHistory = async () => {
    if (!scanDraft?.analysis) return;
    const h = await loadHistory();
    const top = scanDraft.analysis.results?.[0] || null;

    const item = {
      id: String(Date.now()),
      createdAt: scanDraft.createdAt || Date.now(),
      input_id: scanDraft.input_id || scanDraft.analysis.input_id || null,
      topTitle: `${top?.brand || ""} ${top?.model || ""}`.trim() || "Resultado",
      topConfidence: top?.confidence || 0,
      low_confidence: !!scanDraft.analysis.low_confidence,
      high_confidence: !!scanDraft.analysis.high_confidence,
    };

    const next = [item, ...h];
    await saveHistory(next);
    Alert.alert("Guardado", "Añadido al historial (sin fotos).");
  };

  function StackShell({ initial }) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initial}>
        <Stack.Screen name="Home" children={(p) => <HomeScreen go={(n) => p.navigation.navigate(n)} />} />
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
        <Stack.Screen name="Manual" children={(p) => <ManualCorrectionScreen go={(n) => p.navigation.navigate(n)} goBack={() => p.navigation.goBack()} scanDraft={scanDraft} />} />
        <Stack.Screen name="History" children={(p) => <HistoryScreen go={(n) => p.navigation.navigate(n)} goBack={() => p.navigation.goBack()} />} />
        <Stack.Screen name="Taller" children={(p) => <TallerScreen go={(n) => p.navigation.navigate(n)} goBack={() => p.navigation.goBack()} />} />
        <Stack.Screen name="Guide" children={(p) => <GuideScreen go={(n) => p.navigation.navigate(n)} goBack={() => p.navigation.goBack()} />} />
        <Stack.Screen name="Profile" children={(p) => <ProfileScreen go={(n) => p.navigation.navigate(n)} goBack={() => p.navigation.goBack()} />} />
        <Stack.Screen name="Config" children={(p) => <ConfigScreen goBack={() => p.navigation.goBack()} onResetDemo={onResetDemo} />} />
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
          tabBarLabelStyle: { fontWeight: "800", fontSize: 12 },
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
        <Tab.Screen name="HomeTab" children={() => <StackShell initial="Home" />} options={{ title: "Home" }} />
        <Tab.Screen name="ScanTab" children={() => <StackShell initial="Scan" />} options={{ title: "Escanear" }} />
        <Tab.Screen name="HistoryTab" children={() => <StackShell initial="History" />} options={{ title: "Historial" }} />
        <Tab.Screen name="TallerTab" children={() => <StackShell initial="Taller" />} options={{ title: "Taller" }} />
        <Tab.Screen name="ConfigTab" children={() => <StackShell initial="Config" />} options={{ title: "Config" }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  if (Platform.OS === "web") return <WebShell />;
  return <NativeApp />;
}
