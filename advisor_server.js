"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = process.env.ADVISOR_HOST || "0.0.0.0";
const PORT = Number(process.env.ADVISOR_PORT || 8787);
const OLLAMA_BASE = (process.env.OLLAMA_BASE || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const OPENAI_API_KEY = cleanText(process.env.OPENAI_API_KEY || "");
const OPENAI_MODEL = cleanText(process.env.OPENAI_MODEL || "gpt-5-mini");
const LLM_PROVIDER = normalizeProvider(process.env.ADVISOR_LLM_PROVIDER || "auto");
const ADVISOR_AUTH_USER = cleanText(process.env.ADVISOR_AUTH_USER || "");
const ADVISOR_AUTH_PASSWORD = cleanText(process.env.ADVISOR_AUTH_PASSWORD || "");
const BODY_LIMIT_BYTES = 2_000_000;
const FAST_MODE_DEFAULT = String(process.env.ADVISOR_FAST_MODE || "").toLowerCase() === "1";
const DEFAULT_PRECISION_MODE = normalizePrecisionMode(process.env.ADVISOR_PRECISION_MODE || "high");
const DEFAULT_INTERPRETATION_LEVEL = normalizeInterpretationLevel(process.env.ADVISOR_INTERPRETATION_LEVEL || "3");
const DEFAULT_ENFORCE_YEAR_ISOLATION = toBool(process.env.ADVISOR_ENFORCE_YEAR_ISOLATION || "1");
const EMIT_THINKING_TRACE = toBool(process.env.ADVISOR_THINKING_TRACE || "0");
const DEBUG_TRACE_LIMIT = Math.max(50, Math.min(2000, Number(process.env.ADVISOR_DEBUG_TRACE_LIMIT || 500)));
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.ADVISOR_SESSION_TTL_MS || (1000 * 60 * 60 * 24)));
const SESSION_LIMIT = Math.max(100, Math.min(20_000, Number(process.env.ADVISOR_SESSION_LIMIT || 5000)));
const SESSION_PERSIST = toBool(process.env.ADVISOR_SESSION_PERSIST || "1");
const SESSION_STORE_FILE = cleanText(process.env.ADVISOR_SESSION_STORE_FILE || path.join(process.cwd(), ".advisor_sessions.json"));
const SERVER_CONFIG_TOKEN = cleanText(process.env.ADVISOR_SERVER_CONFIG_TOKEN || "");

let activeModel = LLM_PROVIDER === "openai" ? `openai:${OPENAI_MODEL}` : OLLAMA_MODEL;
let modelChecked = false;
let debugTraceSeq = 0;
const debugTraceStore = [];
const sessionStore = new Map();

hydrateSessionStore();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  pruneSessionStore();
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (isAuthEnabled() && !isAuthorizedRequest(req)) {
    sendAuthRequired(res);
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    const cfg = getServerConfigSummary();
    sendJson(res, 200, {
      ok: true,
      service: "hidden-advisor",
      provider: cfg.provider,
      model: cfg.model,
      openai_enabled: cfg.openai_enabled,
      ollama_base: OLLAMA_BASE,
      session_store_size: sessionStore.size,
      now: new Date().toISOString()
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/advisor/config") {
    sendJson(res, 200, { ok: true, config: getServerConfigSummary() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/advisor/session/new") {
    const sessionId = createSessionId();
    upsertSessionMeta(sessionId, {});
    sendJson(res, 200, {
      ok: true,
      session_id: sessionId,
      ttl_ms: SESSION_TTL_MS,
      stored_turns: 0
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/advisor/session") {
    const sessionId = normalizeSessionId(url.searchParams.get("id") || "");
    if (!sessionId) {
      sendJson(res, 400, { ok: false, error: "Falta id de sesion." });
      return;
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      sendJson(res, 404, { ok: false, error: "Sesion no encontrada." });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      session_id: sessionId,
      created_at: session.created_at,
      updated_at: session.updated_at,
      turns: Array.isArray(session.history) ? session.history.length : 0
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/advisor/session/clear") {
    try {
      const body = await readJsonBody(req, BODY_LIMIT_BYTES);
      const sessionId = normalizeSessionId(body?.session_id || body?.sessionId || "");
      if (!sessionId) {
        sendJson(res, 400, { ok: false, error: "Falta session_id." });
        return;
      }
      const existed = sessionStore.delete(sessionId);
      persistSessionStore();
      sendJson(res, 200, { ok: true, session_id: sessionId, cleared: existed });
      return;
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Solicitud invalida: ${cleanText(error?.message || error)}` });
      return;
    }
  }
  if (req.method === "GET" && url.pathname === "/api/advisor/debug") {
    const traceId = cleanText(url.searchParams.get("id") || "");
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 20)));
    const full = toBool(url.searchParams.get("full") || "0");
    if (traceId) {
      const trace = getDebugTraceById(traceId);
      if (!trace) {
        sendJson(res, 404, { ok: false, error: "trace_id no encontrado." });
        return;
      }
      sendJson(res, 200, { ok: true, trace });
      return;
    }
    const traces = listDebugTraces(limit, full);
    sendJson(res, 200, {
      ok: true,
      count: traces.length,
      limit,
      full,
      traces
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/advisor/debug/clear") {
    const prev = debugTraceStore.length;
    debugTraceStore.length = 0;
    sendJson(res, 200, { ok: true, cleared: prev });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/advisor") {
    try {
      const body = await readJsonBody(req, BODY_LIMIT_BYTES);
      const question = cleanText(body?.question || "");
      if (!question) {
        sendJson(res, 400, { error: "La pregunta es obligatoria." });
        return;
      }

      const payloadInput = body?.payload || {};
      const sessionId = normalizeSessionId(body?.session_id || body?.sessionId || payloadInput?.session_id || "") || createSessionId();
      const serverHistory = getSessionHistory(sessionId);
      const clientHistory = normalizeChatHistory(payloadInput?.chat_history);
      const mergedHistory = mergeSessionAndClientHistory(serverHistory, clientHistory);
      const payload = {
        ...(payloadInput || {}),
        session_id: sessionId,
        chat_history: mergedHistory
      };
      const localAnswer = cleanText(body?.local_answer || "");
      const opts = normalizeAdvisorOptions(body?.options);
      const thinking = buildThinkingArchitecture(question, payload, opts);
      const runOpts = { ...opts, thinking };
      const traceId = nextDebugTraceId();
      const traceStartedAt = new Date().toISOString();
      const traceCompany = {
        nit: cleanText(payload?.company?.nit || ""),
        razon_social: cleanText(payload?.company?.razon_social || "")
      };
      const traceYears = Array.isArray(payload?.years_selected) ? payload.years_selected : [];

      const webEvidence = opts.skipWeb ? [] : await gatherWebEvidence(question, payload);
      const answer = await buildAdvisorAnswer(question, payload, localAnswer, webEvidence, runOpts);
      appendSessionTurn(sessionId, "user", question);
      appendSessionTurn(sessionId, "assistant", answer);
      upsertSessionMeta(sessionId, traceCompany);
      const sources = webEvidence
        .map((s) => (s.title ? `${s.title} - ${s.url}` : s.url))
        .filter(Boolean);
      const completedAt = new Date().toISOString();
      const traceMode = opts.skipLlm ? "deterministic" : "llm";
      pushDebugTrace({
        id: traceId,
        created_at: traceStartedAt,
        completed_at: completedAt,
        mode: traceMode,
        session_id: sessionId,
        question,
        company: traceCompany,
        latest_year: Number(payload?.latest_year) || null,
        years_selected: traceYears,
        options: {
          precision_mode: opts.precisionMode,
          interpretation_level: opts.interpretationLevel,
          enforce_year_isolation: opts.enforceYearIsolation,
          skip_web: opts.skipWeb,
          skip_llm: opts.skipLlm,
          debug_trace: opts.debugTrace
        },
        data_profile: thinking?.data_profile || null,
        intent: thinking?.intent || null,
        focus: thinking?.focus || null,
        signals: thinking?.signals || [],
        hypotheses: thinking?.hypotheses || [],
        priorities: thinking?.priorities || [],
        plan: thinking?.plan || [],
        web_evidence: webEvidence.map((w) => ({
          title: w?.title || "",
          url: w?.url || "",
          snippet: truncate(cleanText(w?.snippet || ""), 320)
        })),
        answer,
        answer_preview: truncate(answer, 500),
        sources
      });

      sendJson(res, 200, {
        ok: true,
        session_id: sessionId,
        answer,
        sources,
        model: activeModel,
        evidence_count: webEvidence.length,
        mode: opts.skipLlm ? "deterministic" : "llm",
        memory_turns: getSessionHistory(sessionId).length,
        trace_id: traceId,
        thinking: (EMIT_THINKING_TRACE || opts.debugTrace) ? summarizeThinkingTrace(thinking) : undefined
      });
      return;
    } catch (error) {
      sendJson(res, 500, { error: `Error del asesor oculto: ${cleanText(error?.message || error)}` });
      return;
    }
  }
  if (req.method === "GET" && shouldServeStaticPath(url.pathname)) {
    const served = await serveStaticFile(url.pathname, res);
    if (served) return;
  }
  sendJson(res, 404, { error: "Ruta no encontrada." });
});

server.listen(PORT, HOST, () => {
  const cfg = getServerConfigSummary();
  console.log(`[advisor] activo en http://${HOST}:${PORT}`);
  console.log(`[advisor] provider: ${cfg.provider} | modelo activo: ${cfg.model}`);
  console.log(`[advisor] openai habilitado: ${cfg.openai_enabled ? "si" : "no"} | ollama base: ${OLLAMA_BASE}`);
  console.log(`[advisor] sesion persistente: ${SESSION_PERSIST ? "si" : "no"} | archivo: ${SESSION_STORE_FILE}`);
});

async function buildAdvisorAnswer(question, payload, localAnswer, webEvidence, opts = {}) {
  if (opts.skipLlm) {
    return fallbackAdvisorAnswer(question, payload, localAnswer, webEvidence, opts);
  }
  const prompt = buildAdvisorPrompt(question, payload, localAnswer, webEvidence, opts);
  const llmAnswer = await askPreferredLlm(prompt, opts);
  if (cleanText(llmAnswer)) return llmAnswer;
  return fallbackAdvisorAnswer(question, payload, localAnswer, webEvidence, opts);
}

function buildAdvisorPrompt(question, payload, localAnswer, webEvidence, opts = {}) {
  const chatHistory = normalizeChatHistory(payload?.chat_history);
  const historyRows = normalizeHistoryRows(payload);
  const precisionMode = opts.precisionMode || "high";
  const interpretationLevel = Number(opts.interpretationLevel) || 3;
  const thinking = opts?.thinking || buildThinkingArchitecture(question, payload, opts);
  const qNorm = normalize(question || "");
  const followup = buildFollowupPromptContext(qNorm, chatHistory, question);
  const context = {
    company: payload?.company || null,
    years_selected: payload?.years_selected || [],
    latest_year: payload?.latest_year || null,
    latest_snapshot: payload?.latest_snapshot || null,
    history: payload?.history || [],
    warnings: payload?.warnings || [],
    chat_history: chatHistory
  };
  const evidence = webEvidence.map((w, i) => (
    `[Fuente ${i + 1}] ${w.title || "Sin titulo"}\nURL: ${w.url}\nExtracto: ${truncate(w.snippet, 1200)}`
  )).join("\n\n") || "Sin evidencia web util.";
  const chatText = chatHistory.length
    ? chatHistory.map((h, i) => `${i + 1}) ${h.role}: ${h.text}`).join("\n")
    : "Sin historial.";
  const historyText = historyRows.length
    ? historyRows.map((r) => (
      `${r.anio}: ingresos=${fmtMoney(r.ingresos)}, deuda=${fmtMoney(r.deuda)}, EBITDA=${fmtMoney(r.ebitda)}, Deuda/EBITDA=${fmtRatio(r.deuda_ebitda)}, margen EBITDA=${fmtPct(r.margen_ebitda_pct)}, margen neto=${fmtPct(r.margen_neto_pct)}, flujo operativo=${fmtMoney(r.flujo_operativo)}`
    )).join("\n")
    : "Sin historial anual usable.";
  const thinkingText = JSON.stringify(thinking, null, 2);
  const followupBlock = followup.enabled
    ? [
      "",
      "Protocolo de seguimiento conversacional (ACTIVO):",
      "#Rol Actua como bot financiero experto en analisis y explicacion financiera, manteniendo contexto conversacional.",
      "#Accion Usa simultaneamente: ultimo mensaje del usuario, ultima respuesta del bot y pregunta actual.",
      "Identifica exactamente que parte de la respuesta previa esta siendo cuestionada o ampliada.",
      "Responde solo a esa intencion y no mezcles contextos.",
      "Si falta informacion para precision, haz preguntas aclaratorias puntuales antes de concluir.",
      "",
      "[RESPUESTA_PREVIA_DEL_BOT]",
      followup.previousBotAnswer || "No disponible",
      "[/RESPUESTA_PREVIA_DEL_BOT]",
      "[PREGUNTA_ACTUAL_DEL_USUARIO]",
      followup.currentQuestion || question,
      "[/PREGUNTA_ACTUAL_DEL_USUARIO]",
      "",
      "Formato obligatorio para esta respuesta:",
      "1) Entendi tu pregunta como: <1 frase>",
      "2) Basado en lo que ya respondi: <2-4 vietas de puntos relevantes>",
      "3) Respuesta: <explicacion clara y accionable, pasos numerados si aplica>",
      "4) Si quieres afinarlo: <1-3 preguntas concretas, solo si necesarias>"
    ].join("\n")
    : "";

  return [
    "Rol: Eres asesor financiero corporativo para empresas en Colombia.",
    `Modo de precision: ${precisionMode}. Nivel de interpretacion: ${interpretationLevel}/3.`,
    "Reglas:",
    "1) Prioriza los datos estructurados de la empresa (contexto JSON).",
    "2) Usa evidencia web solo para enriquecer o contrastar.",
    "3) No inventes cifras ni supuestos no explicitados.",
    "4) Responde claro para financiero y no financiero.",
    "5) Si falta dato, escribe explicitamente: 'Dato no disponible' y pide el minimo faltante.",
    "6) Nunca acumules rubros entre anos salvo que el usuario lo pida literalmente.",
    "7) Si preguntan por un ano, responde ese ano exacto y compara solo contra el ano previo (si existe).",
    "8) Distingue siempre: dato observado, inferencia, accion recomendada.",
    "9) Usa la arquitectura de pensamiento: intencion -> evidencia -> hipotesis -> prioridades -> respuesta.",
    "",
    "Formato de respuesta:",
    "- Respuesta corta (1-2 lineas)",
    "- Calculo / formula usada",
    "- Datos usados (ano, rubros y fuente interno/portal)",
    "- Interpretacion (por que importa)",
    "- Accion recomendada",
    "- Validacion de precision (ano objetivo y confirmacion de no acumulacion)",
    "- Si falta dato: 'Dato no disponible' + faltante + proxy permitido",
    "",
    `Pregunta del usuario: ${question}`,
    "",
    "Historial reciente de conversacion:",
    chatText,
    "",
    "Contexto interno (JSON):",
    JSON.stringify(context, null, 2),
    "",
    "Serie anual compacta para precision numerica:",
    historyText,
    "",
    "Arquitectura de pensamiento sugerida (JSON):",
    thinkingText,
    "",
    "Contexto base local (si aplica):",
    localAnswer || "No disponible.",
    "",
    "Evidencia web recopilada:",
    evidence,
    followupBlock
  ].join("\n");
}

async function gatherWebEvidence(question, payload) {
  const company = cleanText(payload?.company?.razon_social || "");
  const nit = cleanText(payload?.company?.nit || "");
  const q = [company, nit, question, "Colombia empresa"].filter(Boolean).join(" ");

  const candidates = await searchDuckDuckGo(q);
  const collected = [];
  for (const item of candidates.slice(0, 6)) {
    const page = await fetchPageSnippet(item.url);
    if (!page) continue;
    collected.push({
      title: page.title || item.title || item.url,
      url: item.url,
      snippet: page.snippet
    });
    if (collected.length >= 3) break;
  }
  return collected;
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=co-es`;
  const html = await fetchText(url, 12000);
  if (!html) return [];

  const results = [];
  const seen = new Set();
  const rx = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m = null;
  while ((m = rx.exec(html)) !== null) {
    const href = decodeDuckDuckGoLink(decodeEntities(m[1] || ""));
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const title = cleanText(stripHtml(m[2] || ""));
    results.push({ title: title || href, url: href });
    if (results.length >= 12) break;
  }
  return results;
}

function decodeDuckDuckGoLink(href) {
  const raw = String(href || "");
  if (!raw) return "";
  let candidate = raw.startsWith("//") ? `https:${raw}` : raw;
  if (candidate.startsWith("/")) candidate = `https://duckduckgo.com${candidate}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return candidate;
  } catch {
    return "";
  }
}

async function fetchPageSnippet(url) {
  try {
    const html = await fetchText(url, 10000);
    if (!html) return null;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = cleanText(stripHtml(titleMatch ? titleMatch[1] : ""));

    const body = stripHtml(html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " "));
    const snippet = cleanText(body).replace(/\s+/g, " ");
    if (!snippet) return null;
    return { title, snippet: truncate(snippet, 1800) };
  } catch {
    return null;
  }
}

async function askPreferredLlm(prompt, opts = {}) {
  const provider = effectiveProvider();
  if (provider === "openai") {
    const answer = await askOpenAi(prompt, opts);
    if (cleanText(answer)) return answer;
    if (LLM_PROVIDER !== "openai") {
      return await askOllama(prompt, opts);
    }
    return "";
  }
  if (provider === "ollama") {
    const answer = await askOllama(prompt, opts);
    if (cleanText(answer)) return answer;
    if (LLM_PROVIDER !== "ollama" && OPENAI_API_KEY) {
      return await askOpenAi(prompt, opts);
    }
    return "";
  }
  return "";
}

async function askOpenAi(prompt, opts = {}) {
  if (!OPENAI_API_KEY) return "";
  try {
    const temperature = normalizeTemperature(opts.temperature);
    const body = {
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Eres un asesor financiero senior para empresas en Colombia.",
                "Prioriza precision numerica, trazabilidad y accionabilidad.",
                "Regla critica: no acumular cifras entre anos si el usuario pide un ano puntual.",
                "Si falta dato, responde 'Dato no disponible' y pide solo el faltante minimo."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }]
        }
      ],
      temperature,
      max_output_tokens: 1800
    };
    const json = await fetchJson(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(body)
      },
      45000
    );
    activeModel = `openai:${OPENAI_MODEL}`;
    return extractOpenAiOutputText(json);
  } catch {
    return "";
  }
}

function extractOpenAiOutputText(json) {
  const direct = cleanMultilineText(json?.output_text || "");
  if (direct) return direct;
  const output = Array.isArray(json?.output) ? json.output : [];
  const parts = [];
  output.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((entry) => {
      const text = cleanMultilineText(entry?.text || entry?.output_text || "");
      if (text) parts.push(text);
    });
  });
  return cleanMultilineText(parts.join("\n\n"));
}

async function askOllama(prompt, opts = {}) {
  try {
    const model = await ensureModel();
    const temperature = normalizeTemperature(opts.temperature);
    const body = {
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: [
            "Eres un asesor financiero senior para empresas en Colombia.",
            "Prioriza precision numerica, trazabilidad y accionabilidad.",
            "Regla critica: no acumular cifras entre anos si el usuario pide un ano puntual.",
            "Si falta dato, responde 'Dato no disponible' y pide solo el faltante minimo."
          ].join(" ")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      options: {
        temperature,
        top_p: 0.1,
        num_predict: 1400
      }
    };
    const json = await fetchJson(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }, 35000);

    const content = cleanText(json?.message?.content || "");
    activeModel = `ollama:${model}`;
    return content || "";
  } catch {
    return "";
  }
}

async function ensureModel() {
  if (modelChecked) return activeModel;
  modelChecked = true;
  try {
    const tags = await fetchJson(`${OLLAMA_BASE}/api/tags`, { method: "GET" }, 10000);
    const models = Array.isArray(tags?.models) ? tags.models.map((m) => cleanText(m?.name || "")).filter(Boolean) : [];
    if (!models.length) return activeModel;
    if (models.includes(activeModel)) return activeModel;
    activeModel = models[0];
    return activeModel;
  } catch {
    return activeModel;
  }
}

function fallbackAdvisorAnswer(question, payload, localAnswer, webEvidence, opts = {}) {
  const company = cleanText(payload?.company?.razon_social || "la empresa");
  const chatHistory = normalizeChatHistory(payload?.chat_history);
  const structured = deterministicStructuredBlocks(question, payload, webEvidence, opts);
  if (structured?.followupMode) {
    return renderFollowupModeAnswer(structured);
  }
  const lines = [];
  const lastUser = chatHistory.length ? [...chatHistory].reverse().find((m) => m.role === "user") : null;

  lines.push("Respuesta corta:");
  lines.push(`- ${structured.shortAnswer}`);
  if (lastUser) lines.push(`- Contexto conversacional activo: "${truncate(lastUser.text, 160)}".`);

  lines.push("");
  lines.push("Calculo / formula usada:");
  lines.push(`- ${structured.formula}`);

  lines.push("");
  lines.push("Datos usados:");
  lines.push(`- ${structured.dataUsed}`);

  lines.push("");
  lines.push("Interpretacion:");
  lines.push(`- ${structured.interpretation}`);

  lines.push("");
  lines.push("Accion recomendada:");
  lines.push(`- ${structured.action}`);

  lines.push("");
  lines.push("Validacion de precision:");
  lines.push(`- ${structured.precisionCheck}`);

  lines.push("");
  lines.push("Si falta dato:");
  lines.push(`- ${structured.missingData}`);

  if (localAnswer) {
    lines.push("");
    lines.push("Contexto base local:");
    lines.push(truncate(localAnswer, 700));
  }

  if (webEvidence.length) {
    lines.push("");
    lines.push("Fuentes externas consultadas:");
    webEvidence.slice(0, 3).forEach((w, i) => {
      lines.push(`${i + 1}) ${w.title || w.url}`);
      lines.push(`   ${truncate(w.url, 180)}`);
    });
  }

  return lines.join("\n");
}

function renderFollowupModeAnswer(structured) {
  const understood = cleanText(structured?.followupUnderstood || structured?.shortAnswer || "");
  const basedOn = Array.isArray(structured?.followupBasedOn) ? structured.followupBasedOn.filter(Boolean).slice(0, 4) : [];
  const response = cleanMultilineText(structured?.followupResponse || structured?.interpretation || "");
  const refine = Array.isArray(structured?.followupRefine) ? structured.followupRefine.filter(Boolean).slice(0, 3) : [];

  const lines = [];
  lines.push(`Entendi tu pregunta como: ${understood || "aclarar un punto de la respuesta anterior."}`);
  lines.push("");
  lines.push("Basado en lo que ya respondi:");
  if (basedOn.length) {
    basedOn.forEach((b) => lines.push(`- ${b}`));
  } else {
    lines.push("- Se mantiene el mismo contexto y calculo del turno previo.");
  }
  lines.push("");
  lines.push("Respuesta:");
  lines.push(response || "La aclaracion mantiene los mismos datos del turno anterior y precisa su interpretacion.");
  if (refine.length) {
    lines.push("");
    lines.push("Si quieres afinarlo:");
    refine.forEach((r) => lines.push(`- ${r}`));
  }
  return lines.join("\n");
}

function deterministicStructuredBlocks(question, payload, webEvidence, opts = {}) {
  const qNorm = normalize(question || "");
  const chatHistory = normalizeChatHistory(payload?.chat_history);
  const thinking = opts?.thinking || buildThinkingArchitecture(question, payload, opts);
  const historyRows = normalizeHistoryRows(payload);
  const years = historyRows.map((r) => r.anio).filter(Number.isFinite).sort((a, b) => a - b);
  const sourceTag = webEvidence.length ? "interno+portal" : "interno";
  const metric = detectMetricIntent(qNorm);
  if (!metric) {
    const lastAssistant = [...chatHistory].reverse().find((m) => m.role === "assistant" && cleanText(m.text));
    if (isFollowupQuestion(qNorm, chatHistory)) {
      return buildFollowupStructuredBlocks(qNorm, payload, sourceTag, lastAssistant?.text || "");
    }
    return buildGeneralStructuredBlocks(payload, sourceTag, opts, thinking);
  }
  const askedYears = parseYearsFromQuestion(question);
  const compareAsked = asksComparison(qNorm);

  let year = null;
  let prevYear = null;
  if (askedYears.length) {
    const validAsked = askedYears.filter((y) => years.includes(y)).sort((a, b) => a - b);
    if (validAsked.length) {
      year = validAsked[validAsked.length - 1];
      prevYear = validAsked.length >= 2 ? validAsked[validAsked.length - 2] : pickPreviousYear(years, year);
    }
  }
  if (!Number.isFinite(year)) {
    year = Number(payload?.latest_year);
    if (!Number.isFinite(year) && years.length) year = years[years.length - 1];
    prevYear = pickPreviousYear(years, year);
  }

  const byYear = new Map(historyRows.map((r) => [r.anio, r]));
  const row = byYear.get(year) || {};
  const prev = byYear.get(prevYear) || {};
  const metricValue = metric.get(row);
  const prevValue = metric.get(prev);

  const deltaAbs = Number.isFinite(metricValue) && Number.isFinite(prevValue) ? metricValue - prevValue : null;
  const deltaPct = pct(metricValue, prevValue);
  const compareLine = buildCompareLine(metric, prevYear, deltaAbs, deltaPct);
  const summary = buildSummaryLine(metric, metricValue, year, compareAsked ? compareLine : "");
  const interpretation = buildInterpretationLine(metric, metricValue, deltaAbs, deltaPct, row, prev, year, prevYear);
  const action = buildActionLine(metric, metricValue, row);
  const missing = buildMissingDataLine(metric, metricValue, year, row, prevYear, prevValue);
  const precisionCheck = buildPrecisionCheckLine({
    year,
    prevYear,
    metric,
    metricValue,
    compareAsked,
    enforceYearIsolation: opts.enforceYearIsolation
  });

  return {
    shortAnswer: summary,
    formula: `${metric.formula} ${metric.compareFormula}`,
    dataUsed: `Anos usados: ${[year, prevYear].filter(Number.isFinite).join(", ") || "N/D"}; rubros: ${metric.dataFields}; fuente ${sourceTag}.`,
    interpretation,
    action,
    precisionCheck,
    missingData: missing
  };
}

function buildThinkingArchitecture(question, payload, opts = {}) {
  const qNorm = normalize(question || "");
  const chatHistory = normalizeChatHistory(payload?.chat_history);
  const historyRows = normalizeHistoryRows(payload);
  const years = historyRows.map((r) => r.anio).filter(Number.isFinite).sort((a, b) => a - b);
  const askedYears = parseYearsFromQuestion(question);
  const latestYear = Number(payload?.latest_year) || (years.length ? years[years.length - 1] : null);
  const focusYear = askedYears.find((y) => years.includes(y)) || latestYear || null;
  const prevYear = pickPreviousYear(years, focusYear);
  const byYear = new Map(historyRows.map((r) => [r.anio, r]));
  const current = byYear.get(focusYear) || payload?.latest_snapshot || {};
  const prev = byYear.get(prevYear) || {};

  const intent = detectPrimaryIntent(qNorm, chatHistory);
  const dataProfile = evaluateDataProfile(current);
  const signals = evaluateFinancialSignals(current, prev, focusYear, prevYear);
  const hypotheses = buildHypothesesFromSignals(signals, intent, dataProfile);
  const priorities = prioritizeHypotheses(hypotheses, intent);
  const plan = buildReasoningPlan(intent, dataProfile, priorities);

  return {
    intent,
    focus: {
      year: Number.isFinite(focusYear) ? focusYear : null,
      compare_year: Number.isFinite(prevYear) ? prevYear : null,
      enforce_year_isolation: opts?.enforceYearIsolation !== false
    },
    data_profile: dataProfile,
    signals,
    hypotheses,
    priorities,
    plan
  };
}

function detectPrimaryIntent(qNorm, chatHistory) {
  if (isFollowupQuestion(qNorm, chatHistory)) {
    return { type: "followup_clarification", confidence: 0.9, objective: "aclarar respuesta previa sin recalculo completo" };
  }
  if (qNorm.includes("que debe mejorar") || qNorm.includes("como mejorar") || qNorm.includes("falencia") || qNorm.includes("fallo")) {
    return { type: "improvement_diagnostic", confidence: 0.95, objective: "detectar mejoras prioritarias y como ejecutarlas" };
  }
  if (qNorm.includes("riesgo") || qNorm.includes("alerta") || qNorm.includes("peligro")) {
    return { type: "risk_assessment", confidence: 0.9, objective: "identificar riesgos financieros y mitigantes" };
  }
  if (asksComparison(qNorm)) {
    return { type: "comparison", confidence: 0.85, objective: "comparar desempeno entre anos o rubros" };
  }
  if (qNorm.includes("formula") || qNorm.includes("calculo") || qNorm.includes("de donde sale")) {
    return { type: "formula_explain", confidence: 0.85, objective: "explicar trazabilidad del calculo" };
  }
  return { type: "financial_reading", confidence: 0.75, objective: "entregar lectura ejecutiva con accion sugerida" };
}

function evaluateDataProfile(current) {
  const required = [
    ["ingresos", toNum(current?.ingresos)],
    ["ebitda", toNum(current?.ebitda)],
    ["deuda_ebitda", toNum(current?.deuda_ebitda)],
    ["margen_ebitda_pct", toNum(current?.margen_ebitda_pct)],
    ["margen_neto_pct", toNum(current?.margen_neto_pct)],
    ["flujo_operativo", toNum(current?.flujo_operativo)]
  ];
  const available = required.filter(([, v]) => Number.isFinite(v)).map(([k]) => k);
  const missing = required.filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
  const coverage = required.length ? Math.round((available.length / required.length) * 100) : 0;
  const quality = coverage >= 80 ? "alta" : (coverage >= 50 ? "media" : "baja");
  return { coverage_pct: coverage, quality, available, missing };
}

function evaluateFinancialSignals(current, prev, year, prevYear) {
  const signals = [];
  const deudaEbitda = toNum(current?.deuda_ebitda);
  const margenEbitda = toNum(current?.margen_ebitda_pct);
  const margenNeto = toNum(current?.margen_neto_pct);
  const flujoOp = toNum(current?.flujo_operativo);
  const ingresos = toNum(current?.ingresos);
  const prevIngresos = toNum(prev?.ingresos);
  const yoyIngresos = pct(ingresos, prevIngresos);

  if (Number.isFinite(deudaEbitda)) {
    if (deudaEbitda > 5) {
      signals.push({ type: "leverage", severity: "alta", statement: `Deuda/EBITDA alta (${fmtRatio(deudaEbitda)}).` });
    } else if (deudaEbitda >= 3) {
      signals.push({ type: "leverage", severity: "media", statement: `Deuda/EBITDA exigente (${fmtRatio(deudaEbitda)}).` });
    } else {
      signals.push({ type: "leverage", severity: "baja", statement: `Deuda/EBITDA manejable (${fmtRatio(deudaEbitda)}).` });
    }
  }

  if (Number.isFinite(margenEbitda)) {
    if (margenEbitda < 10) {
      signals.push({ type: "margin", severity: "alta", statement: `Margen EBITDA comprimido (${fmtPct(margenEbitda)}).` });
    } else if (margenEbitda < 15) {
      signals.push({ type: "margin", severity: "media", statement: `Margen EBITDA mejorable (${fmtPct(margenEbitda)}).` });
    } else {
      signals.push({ type: "margin", severity: "baja", statement: `Margen EBITDA saludable (${fmtPct(margenEbitda)}).` });
    }
  }

  if (Number.isFinite(margenNeto)) {
    if (margenNeto <= 0) {
      signals.push({ type: "net_profit", severity: "alta", statement: `Rentabilidad neta debil (${fmtPct(margenNeto)}).` });
    } else if (margenNeto < 5) {
      signals.push({ type: "net_profit", severity: "media", statement: `Rentabilidad neta ajustada (${fmtPct(margenNeto)}).` });
    } else {
      signals.push({ type: "net_profit", severity: "baja", statement: `Rentabilidad neta positiva (${fmtPct(margenNeto)}).` });
    }
  }

  if (Number.isFinite(flujoOp)) {
    if (flujoOp < 0) {
      signals.push({ type: "cash", severity: "alta", statement: `Flujo operativo negativo (${fmtMoney(flujoOp)}).` });
    } else {
      signals.push({ type: "cash", severity: "baja", statement: `Flujo operativo positivo (${fmtMoney(flujoOp)}).` });
    }
  }

  if (Number.isFinite(yoyIngresos) && Number.isFinite(prevYear)) {
    const severity = yoyIngresos < -5 ? "alta" : (yoyIngresos < 2 ? "media" : "baja");
    signals.push({
      type: "growth",
      severity,
      statement: `Ingresos ${year} vs ${prevYear}: ${fmtPct(yoyIngresos)}.`
    });
  }

  return signals;
}

function buildHypothesesFromSignals(signals, intent, dataProfile = null) {
  const hypotheses = [];
  for (const s of signals) {
    if (s.type === "leverage" && s.severity !== "baja") {
      hypotheses.push({
        id: "H1",
        priority: s.severity,
        cause: "apalancamiento financiero exigente",
        impact: "menos holgura de caja y mayor riesgo ante subidas de tasa",
        action: "refinanciar deuda cara y fijar meta de descenso de Deuda/EBITDA"
      });
    }
    if (s.type === "margin" && s.severity !== "baja") {
      hypotheses.push({
        id: "H2",
        priority: s.severity,
        cause: "presion de margen operativo",
        impact: "deterioro de rentabilidad y menor conversion a caja",
        action: "ajustar precio/mix, controlar COGS y recortar OPEX de bajo ROI"
      });
    }
    if (s.type === "cash" && s.severity !== "baja") {
      hypotheses.push({
        id: "H3",
        priority: s.severity,
        cause: "flujo operativo insuficiente",
        impact: "tension de liquidez y dependencia de deuda de corto plazo",
        action: "plan de caja de 90 dias con foco en DSO, inventario y DPO"
      });
    }
    if (s.type === "growth" && s.severity !== "baja") {
      hypotheses.push({
        id: "H4",
        priority: s.severity === "alta" ? "media" : "baja",
        cause: "caida de ingresos",
        impact: "menor absorcion de costos fijos y riesgo de compresion de margen",
        action: "recuperar crecimiento rentable por segmento y canal"
      });
    }
  }

  if (intent?.type === "improvement_diagnostic" && dataProfile?.coverage_pct < 50) {
    hypotheses.push({
      id: "H0",
      priority: "alta",
      cause: "falta de evidencia suficiente para diagnostico fino",
      impact: "riesgo de acciones equivocadas",
      action: "completar datos de EBITDA, flujo operativo y margenes del ano objetivo"
    });
  }

  if (intent?.type === "improvement_diagnostic") {
    hypotheses.push({
      id: "H6",
      priority: "media",
      cause: "eficiencia comercial y operativa mejorable",
      impact: "se pierde rentabilidad potencial aun con ventas estables",
      action: "ejecutar plan de 90 dias: precio/mix, control de descuentos y foco en costos variables"
    });
    hypotheses.push({
      id: "H7",
      priority: "media",
      cause: "gobierno de caja insuficiente",
      impact: "decisiones tardias de liquidez y mayor costo financiero",
      action: "instalar tablero semanal de caja (cartera, inventario, proveedores, deuda)"
    });
  }

  if (!hypotheses.length && intent?.type === "improvement_diagnostic") {
    hypotheses.push({
      id: "H8",
      priority: "media",
      cause: "falta de evidencia suficiente para diagnostico fino",
      impact: "riesgo de acciones equivocadas",
      action: "completar datos de EBITDA, flujo operativo y margenes del ano objetivo"
    });
  }

  return hypotheses;
}

function prioritizeHypotheses(hypotheses, intent) {
  const rank = { alta: 3, media: 2, baja: 1 };
  const sorted = [...hypotheses].sort((a, b) => (rank[b.priority] - rank[a.priority]));
  const top = sorted.slice(0, 3);
  return top.map((h, i) => ({
    rank: i + 1,
    theme: h.cause,
    action: h.action,
    impact: h.impact,
    priority: h.priority
  }));
}

function buildReasoningPlan(intent, dataProfile, priorities) {
  return [
    { step: "Entender objetivo de la pregunta", status: "done", detail: intent?.objective || "lectura financiera general" },
    { step: "Validar calidad de datos", status: "done", detail: `cobertura ${dataProfile.coverage_pct}% (${dataProfile.quality})` },
    { step: "Detectar senales financieras clave", status: "done", detail: `senales priorizadas ${priorities.length}` },
    { step: "Construir hipotesis de causa-impacto", status: "done", detail: "hipotesis ordenadas por severidad" },
    { step: "Proponer acciones accionables", status: "done", detail: "acciones priorizadas por impacto y urgencia" }
  ];
}

function summarizeThinkingTrace(thinking) {
  if (!thinking) return null;
  return {
    intent: thinking.intent,
    focus: thinking.focus,
    data_profile: thinking.data_profile,
    top_signals: (thinking.signals || []).slice(0, 4),
    priorities: (thinking.priorities || []).slice(0, 3)
  };
}

function normalizeHistoryRows(payload) {
  const history = Array.isArray(payload?.history) ? payload.history : [];
  const rows = history.map((h) => ({
    anio: Number(h?.anio),
    ingresos: toNum(h?.ingresos),
    deuda: toNum(h?.deuda),
    ebitda: toNum(h?.ebitda),
    utilidad_neta: toNum(h?.utilidad_neta),
    flujo_operativo: toNum(h?.flujo_operativo),
    flujo_periodo: toNum(h?.flujo_periodo),
    deuda_ebitda: toNum(h?.deuda_ebitda),
    margen_ebitda_pct: toNum(h?.margen_ebitda_pct),
    margen_neto_pct: toNum(h?.margen_neto_pct)
  })).filter((h) => Number.isFinite(h.anio));

  const latestYear = Number(payload?.latest_year);
  const latest = payload?.latest_snapshot || null;
  if (Number.isFinite(latestYear) && latest) {
    const idx = rows.findIndex((r) => r.anio === latestYear);
    const latestRow = {
      anio: latestYear,
      ingresos: toNum(latest.ingresos),
      deuda: toNum(latest.deuda),
      ebitda: toNum(latest.ebitda),
      utilidad_neta: toNum(latest.utilidad_neta),
      flujo_operativo: toNum(latest.flujo_operativo),
      flujo_periodo: toNum(latest.flujo_periodo),
      deuda_ebitda: toNum(latest.deuda_ebitda),
      margen_ebitda_pct: toNum(latest.margen_ebitda_pct),
      margen_neto_pct: toNum(latest.margen_neto_pct)
    };

    if (idx === -1) {
      rows.push(latestRow);
    } else {
      const current = rows[idx];
      rows[idx] = {
        ...current,
        ingresos: Number.isFinite(current.ingresos) ? current.ingresos : latestRow.ingresos,
        deuda: Number.isFinite(current.deuda) ? current.deuda : latestRow.deuda,
        ebitda: Number.isFinite(current.ebitda) ? current.ebitda : latestRow.ebitda,
        utilidad_neta: Number.isFinite(current.utilidad_neta) ? current.utilidad_neta : latestRow.utilidad_neta,
        flujo_operativo: Number.isFinite(current.flujo_operativo) ? current.flujo_operativo : latestRow.flujo_operativo,
        flujo_periodo: Number.isFinite(current.flujo_periodo) ? current.flujo_periodo : latestRow.flujo_periodo,
        deuda_ebitda: Number.isFinite(current.deuda_ebitda) ? current.deuda_ebitda : latestRow.deuda_ebitda,
        margen_ebitda_pct: Number.isFinite(current.margen_ebitda_pct) ? current.margen_ebitda_pct : latestRow.margen_ebitda_pct,
        margen_neto_pct: Number.isFinite(current.margen_neto_pct) ? current.margen_neto_pct : latestRow.margen_neto_pct
      };
    }
  }

  return rows.sort((a, b) => a.anio - b.anio);
}

function parseYearsFromQuestion(text) {
  const out = [];
  const rx = /\b(19\d{2}|20\d{2})\b/g;
  const input = String(text || "");
  let match = null;
  while ((match = rx.exec(input)) !== null) {
    const y = Number(match[1]);
    if (Number.isFinite(y)) out.push(y);
  }
  return [...new Set(out)];
}

function asksComparison(qNorm) {
  return (
    qNorm.includes(" vs ") ||
    qNorm.includes(" contra ") ||
    qNorm.includes("compar") ||
    qNorm.includes("variacion") ||
    qNorm.includes("cambio")
  );
}

function pickPreviousYear(years, year) {
  if (!Number.isFinite(year)) return null;
  const prev = years.filter((y) => y < year).sort((a, b) => a - b);
  return prev.length ? prev[prev.length - 1] : null;
}

function detectMetricIntent(qNorm) {
  const metrics = [
    {
      id: "deuda_ebitda",
      label: "Deuda/EBITDA",
      type: "ratio",
      get: (r) => toNum(r?.deuda_ebitda),
      formula: "Deuda/EBITDA = deuda financiera del ano / EBITDA del ano.",
      compareFormula: "Variacion = valor ano t - valor ano t-1 (y % sobre t-1).",
      dataFields: "deuda del ano, EBITDA del ano, deuda/EBITDA"
    },
    {
      id: "deuda",
      label: "Deuda",
      type: "money",
      get: (r) => toNum(r?.deuda),
      formula: "Deuda del ano = obligaciones financieras del corte anual (sin acumulacion multi-anual).",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "deuda del ano"
    },
    {
      id: "ebitda",
      label: "EBITDA",
      type: "money",
      get: (r) => toNum(r?.ebitda),
      formula: "EBITDA = utilidad operativa + depreciaciones y amortizaciones (segun reporte).",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "EBITDA"
    },
    {
      id: "margen_ebitda_pct",
      label: "Margen EBITDA",
      type: "pct",
      get: (r) => toNum(r?.margen_ebitda_pct),
      formula: "Margen EBITDA = EBITDA / ingresos * 100.",
      compareFormula: "Cambio en puntos porcentuales y % relativo vs ano previo.",
      dataFields: "EBITDA, ingresos, margen EBITDA"
    },
    {
      id: "margen_neto_pct",
      label: "Margen neto",
      type: "pct",
      get: (r) => toNum(r?.margen_neto_pct),
      formula: "Margen neto = utilidad neta / ingresos * 100.",
      compareFormula: "Cambio en puntos porcentuales y % relativo vs ano previo.",
      dataFields: "utilidad neta, ingresos, margen neto"
    },
    {
      id: "utilidad_neta",
      label: "Utilidad neta",
      type: "money",
      get: (r) => toNum(r?.utilidad_neta),
      formula: "Utilidad neta = resultado final despues de gastos financieros e impuestos.",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "utilidad neta"
    },
    {
      id: "flujo_operativo",
      label: "Flujo operativo",
      type: "money",
      get: (r) => toNum(r?.flujo_operativo),
      formula: "Flujo operativo = entradas - salidas de caja de operacion del ano.",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "flujo operativo"
    },
    {
      id: "flujo_periodo",
      label: "Flujo de caja del periodo",
      type: "money",
      get: (r) => toNum(r?.flujo_periodo),
      formula: "Flujo del periodo = variacion neta de caja del ano.",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "flujo de caja del periodo"
    },
    {
      id: "ingresos",
      label: "Ingresos",
      type: "money",
      get: (r) => toNum(r?.ingresos),
      formula: "Ingresos = ventas/ingresos operacionales reconocidos en el ano.",
      compareFormula: "Variacion absoluta y % vs ano previo.",
      dataFields: "ingresos"
    }
  ];

  if (qNorm.includes("deuda/ebitda") || (qNorm.includes("deuda") && qNorm.includes("ebitda"))) return metrics[0];
  if (qNorm.includes("deuda")) return metrics[1];
  if (qNorm.includes("margen") && qNorm.includes("ebitda")) return metrics[3];
  if (qNorm.includes("margen") && qNorm.includes("net")) return metrics[4];
  if (qNorm.includes("utilidad") && qNorm.includes("net")) return metrics[5];
  if (qNorm.includes("flujo") && qNorm.includes("oper")) return metrics[6];
  if (qNorm.includes("flujo") || qNorm.includes("caja")) return metrics[7];
  if (qNorm.includes("ingreso") || qNorm.includes("ventas")) return metrics[8];
  if (qNorm.includes("ebitda")) return metrics[2];
  return null;
}

function isFollowupQuestion(qNorm, chatHistory) {
  const hasAssistantHistory = Array.isArray(chatHistory) && chatHistory.some((m) => m.role === "assistant" && cleanText(m.text));
  if (!hasAssistantHistory) return false;
  const cues = [
    "por que",
    "porque",
    "como asi",
    "explica",
    "explicame",
    "amplia",
    "detalla",
    "a que te refieres",
    "de donde sale",
    "cual formula",
    "cual calculo",
    "que significa",
    "eso",
    "esa",
    "ese",
    "lo que dijiste",
    "lo que respondiste",
    "tu respuesta"
  ];
  return cues.some((c) => qNorm.includes(c));
}

function buildFollowupPromptContext(qNorm, chatHistory, question) {
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  const enabled = isFollowupQuestion(qNorm, history);
  if (!enabled) {
    return {
      enabled: false,
      previousBotAnswer: "",
      currentQuestion: cleanText(question || "")
    };
  }
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant" && cleanText(m.text));
  return {
    enabled: true,
    previousBotAnswer: cleanMultilineText(lastAssistant?.text || ""),
    currentQuestion: cleanMultilineText(question || "")
  };
}

function buildFollowupStructuredBlocks(qNorm, payload, sourceTag, lastAssistantText) {
  const parsed = parseStructuredAnswer(lastAssistantText);
  const latestYear = Number(payload?.latest_year);
  const shortSource =
    parsed.short ||
    parsed.interpretation ||
    truncate(cleanText(lastAssistantText || ""), 220) ||
    "la lectura anterior";

  const asksFormula = qNorm.includes("formula") || qNorm.includes("calculo") || qNorm.includes("de donde sale");
  const asksInterpret = qNorm.includes("por que") || qNorm.includes("porque") || qNorm.includes("como asi") || qNorm.includes("significa");
  const asksAction = qNorm.includes("que hago") || qNorm.includes("que recomiendas") || qNorm.includes("que debo");
  const askedForRefinement = qNorm.includes("afina") || qNorm.includes("ajusta") || qNorm.includes("profundiza");

  const formula = asksFormula
    ? (parsed.formula || "Se mantiene la formula del turno anterior; esta repregunta aclara su significado y uso.")
    : (parsed.formula || "No hay recalculo nuevo; se mantiene la base numerica del turno anterior.");

  const interpretation = asksInterpret
    ? (parsed.interpretation || "La repregunta apunta a entender causa e impacto del hallazgo anterior; no cambia el dato base.")
    : "Se amplio la explicacion del hallazgo previo sin cambiar el dato numerico reportado.";

  const action = asksAction
    ? (parsed.action || "Definir una accion puntual por KPI y revisar su avance semanal.")
    : (parsed.action || "Si quieres accion concreta, te la doy por frente (ventas, costos, caja o deuda).");
  const basedOn = [
    parsed.short || "",
    parsed.formula ? `Formula usada: ${parsed.formula}` : "",
    parsed.dataUsed ? `Datos usados: ${parsed.dataUsed}` : "",
    parsed.interpretation ? `Interpretacion base: ${parsed.interpretation}` : ""
  ].map((x) => cleanText(x)).filter(Boolean).slice(0, 4);
  const refineQuestions = [];
  if (String(parsed.missingData || "").toLowerCase().includes("dato no disponible")) {
    refineQuestions.push("Quieres que lo calcule con el ultimo ano completo disponible como proxy?");
  }
  if (!asksFormula) refineQuestions.push("Quieres que te muestre el calculo paso a paso con numeros?");
  if (!asksAction) refineQuestions.push("Quieres que lo convierta en un plan de accion de 30/60/90 dias?");
  if (askedForRefinement) refineQuestions.length = 0;
  const followupResponse = [
    asksInterpret
      ? (parsed.interpretation || "La conclusion anterior se mantiene y su impacto principal esta en rentabilidad, caja o riesgo.")
      : "Aclaro el punto solicitado manteniendo el mismo contexto del turno anterior.",
    asksAction
      ? (parsed.action || "Accion sugerida: ejecutar un plan corto y medir impacto semanal.")
      : (parsed.action ? `Accion sugerida: ${parsed.action}` : "")
  ].filter(Boolean).join(" ");

  return {
    shortAnswer: `Sobre tu repregunta, aclaro la respuesta anterior: ${shortSource}`,
    formula,
    dataUsed: parsed.dataUsed || `Se usa el mismo contexto del turno anterior (ano ${Number.isFinite(latestYear) ? latestYear : "N/D"}; fuente ${sourceTag}) y el historial de chat.`,
    interpretation,
    action,
    precisionCheck: "Modo repregunta aplicado: se explica la respuesta previa, sin cambiar cifras ni acumular anos.",
    missingData: parsed.missingData || "No se detecta faltante nuevo para esta repregunta; si quieres recalculo, indica rubro y ano.",
    followupMode: true,
    followupUnderstood: cleanText(shortSource || "aclarar la parte especifica de la respuesta previa"),
    followupBasedOn: basedOn,
    followupResponse,
    followupRefine: refineQuestions.slice(0, 3)
  };
}

function buildGeneralStructuredBlocks(payload, sourceTag, opts = {}, thinking = null) {
  const historyRows = normalizeHistoryRows(payload);
  const years = historyRows.map((r) => r.anio).filter(Number.isFinite).sort((a, b) => a - b);
  const year = Number(payload?.latest_year) || (years.length ? years[years.length - 1] : null);
  const row = historyRows.find((r) => r.anio === year) || payload?.latest_snapshot || {};
  const deudaEbitda = toNum(row?.deuda_ebitda);
  const flujoOperativo = toNum(row?.flujo_operativo);
  const margenEbitda = toNum(row?.margen_ebitda_pct);
  const ingresos = toNum(row?.ingresos);
  const ebitda = toNum(row?.ebitda);
  const primaryPriority = thinking?.priorities?.[0] || null;
  const topPriorities = Array.isArray(thinking?.priorities) ? thinking.priorities.slice(0, 3) : [];
  const improvementIntent = thinking?.intent?.type === "improvement_diagnostic";
  const actionLine = improvementIntent && topPriorities.length
    ? topPriorities.map((p) => `Prioridad ${p.rank}: ${p.action}.`).join(" ")
    : (primaryPriority
      ? `Prioridad 1: ${primaryPriority.action}.`
      : inferAction({ deudaEbitda, flujoOp: flujoOperativo, margenEbitda, margenNeto: toNum(row?.margen_neto_pct) }));
  const interpretationLine = improvementIntent && topPriorities.length
    ? `Focos detectados: ${topPriorities.map((p) => `${p.theme} (${p.priority})`).join("; ")}.`
    : (primaryPriority
      ? `Principal foco detectado: ${primaryPriority.theme} (${primaryPriority.priority}).`
      : inferInterpretation({ deudaEbitda, flujoOp: flujoOperativo, margenEbitda, margenNeto: toNum(row?.margen_neto_pct) }));
  const shortAnswer = improvementIntent
    ? `Para mejorar la compania (${Number.isFinite(year) ? year : "N/D"}), enfocar primero en: ${primaryPriority ? primaryPriority.theme : "calidad de datos y eficiencia operativa"}.`
    : `Lectura general (${Number.isFinite(year) ? year : "N/D"}): ingresos ${fmtMoney(ingresos)}, EBITDA ${fmtMoney(ebitda)}, Deuda/EBITDA ${fmtRatio(deudaEbitda)}.`;
  const formulaText = improvementIntent
    ? "Arquitectura de pensamiento: senal -> causa -> impacto -> accion priorizada, con foco en el ano objetivo."
    : "Lectura integral anual: rentabilidad (margen), caja (flujo operativo) y apalancamiento (Deuda/EBITDA), sin acumulacion entre anos.";

  return {
    shortAnswer,
    formula: formulaText,
    dataUsed: `Ano ${Number.isFinite(year) ? year : "N/D"}; rubros: ingresos, EBITDA, margen EBITDA, flujo operativo, Deuda/EBITDA; fuente ${sourceTag}.`,
    interpretation: interpretationLine,
    action: actionLine,
    precisionCheck: `Ano objetivo: ${Number.isFinite(year) ? year : "N/D"}. Control aplicado: no acumulacion entre anos.`,
    missingData: inferMissingData({
      latestYear: year,
      ingresos,
      ebitda,
      deudaEbitda,
      flujoOp: flujoOperativo,
      margenEbitda,
      margenNeto: toNum(row?.margen_neto_pct)
    })
  };
}

function parseStructuredAnswer(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = {
    short: "",
    formula: "",
    dataUsed: "",
    interpretation: "",
    action: "",
    precisionCheck: "",
    missingData: ""
  };
  const map = {
    "respuesta corta": "short",
    "calculo / formula usada": "formula",
    "datos usados": "dataUsed",
    "interpretacion": "interpretation",
    "accion recomendada": "action",
    "validacion de precision": "precisionCheck",
    "contexto base local": "contextBase",
    "fuentes externas consultadas": "sources",
    "si falta dato": "missingData"
  };
  let currentKey = "";

  for (const rawLine of lines) {
    const line = cleanText(rawLine || "");
    if (!line) continue;
    const normalized = normalize(line.replace(/:$/, ""));
    const header = Object.keys(map).find((h) => normalized === h || normalized.startsWith(`${h}:`));
    if (header) {
      currentKey = map[header];
      continue;
    }
    if (!currentKey) continue;
    const cleanLine = line.replace(/^[-*]\s*/, "");
    out[currentKey] = out[currentKey] ? `${out[currentKey]} ${cleanLine}` : cleanLine;
  }
  return out;
}

function formatMetricValue(metric, value) {
  if (!Number.isFinite(value)) return "N/D";
  if (metric.type === "money") return fmtMoney(value);
  if (metric.type === "ratio") return fmtRatio(value);
  if (metric.type === "pct") return fmtPct(value);
  return fmtNum(value);
}

function buildCompareLine(metric, prevYear, deltaAbs, deltaPct) {
  if (!Number.isFinite(prevYear) || !Number.isFinite(deltaAbs)) return "";
  const direction = deltaAbs >= 0 ? "subio" : "bajo";
  if (metric.type === "money") {
    return `Vs ${prevYear}: ${direction} ${fmtMoney(Math.abs(deltaAbs))}${Number.isFinite(deltaPct) ? ` (${fmtPct(Math.abs(deltaPct))})` : ""}.`;
  }
  if (metric.type === "ratio") {
    return `Vs ${prevYear}: ${direction} ${fmtRatio(Math.abs(deltaAbs))}${Number.isFinite(deltaPct) ? ` (${fmtPct(Math.abs(deltaPct))})` : ""}.`;
  }
  if (metric.type === "pct") {
    return `Vs ${prevYear}: ${direction} ${fmtNum(Math.abs(deltaAbs))} pp${Number.isFinite(deltaPct) ? ` (${fmtPct(Math.abs(deltaPct))})` : ""}.`;
  }
  return `Vs ${prevYear}: ${direction}.`;
}

function buildSummaryLine(metric, value, year, compareLine) {
  const yearLabel = Number.isFinite(year) ? year : "N/D";
  const base = `${metric.label} (${yearLabel}): ${formatMetricValue(metric, value)}.`;
  if (!compareLine) return base;
  return `${base} ${compareLine}`;
}

function buildInterpretationLine(metric, value, deltaAbs, deltaPct, row, prev, year, prevYear) {
  if (!Number.isFinite(value)) {
    return `No hay dato util de ${metric.label.toLowerCase()} para ${Number.isFinite(year) ? year : "el ano consultado"}.`;
  }

  if (metric.id === "deuda_ebitda") {
    if (value > 5) return `Apalancamiento alto (${fmtRatio(value)}): riesgo elevado para caja y covenants${Number.isFinite(prevYear) ? ` frente a ${prevYear}` : ""}.`;
    if (value >= 3) return `Apalancamiento exigente (${fmtRatio(value)}): operacion viable pero con menor holgura financiera.`;
    return `Apalancamiento manejable (${fmtRatio(value)}): la deuda luce proporcional al EBITDA anual.`;
  }

  if (metric.id === "deuda") {
    const ebitda = toNum(row?.ebitda);
    const coverage = Number.isFinite(ebitda) && ebitda !== 0 ? value / Math.abs(ebitda) : null;
    if (Number.isFinite(coverage) && coverage > 5) {
      return `La deuda anual es pesada frente al EBITDA (${fmtRatio(coverage)} estimado), lo que presiona servicio de deuda.`;
    }
    if (Number.isFinite(deltaAbs) && deltaAbs > 0 && Number.isFinite(deltaPct) && deltaPct > 10) {
      return `La deuda crece mas rapido que un ritmo prudente (${fmtPct(deltaPct)}), conviene revisar perfil de vencimientos y tasa.`;
    }
    return "La deuda esta en una zona controlable, pero debe monitorearse junto con EBITDA y flujo operativo.";
  }

  if (metric.id === "margen_ebitda_pct" || metric.id === "margen_neto_pct") {
    if (value < 0) return `Rentabilidad negativa (${fmtPct(value)}), hay destruccion de valor en el ano analizado.`;
    if (value < 5) return `Rentabilidad debil (${fmtPct(value)}), con baja capacidad para absorber choques de costos o tasas.`;
    if (Number.isFinite(deltaAbs) && deltaAbs < 0) return `Rentabilidad positiva pero deteriorandose (${fmtPct(value)}), la tendencia exige correccion de margen.`;
    return `Rentabilidad saludable (${fmtPct(value)}) para el nivel actual de operacion.`;
  }

  if (metric.id === "ebitda") {
    if (value <= 0) return "EBITDA no positivo: la capacidad operativa para sostener deuda y crecimiento esta comprometida.";
    if (Number.isFinite(deltaAbs) && deltaAbs < 0) return `EBITDA positivo pero en descenso${Number.isFinite(prevYear) ? ` vs ${prevYear}` : ""}, revisar precio/mix/costos.`;
    return "EBITDA positivo y util para sostener deuda, capex y continuidad operativa.";
  }

  if (metric.id === "flujo_operativo" || metric.id === "flujo_periodo") {
    if (value < 0) return "La caja anual es negativa; aunque haya utilidad, existe riesgo de tension de liquidez.";
    if (Number.isFinite(deltaAbs) && deltaAbs < 0) return "La caja sigue positiva pero pierde traccion, conviene proteger capital de trabajo.";
    return "La caja es positiva y aporta resiliencia para operar y atender obligaciones.";
  }

  if (metric.id === "ingresos") {
    if (Number.isFinite(deltaPct) && deltaPct < -5) return `Caida material de ingresos (${fmtPct(deltaPct)}), riesgo de apalancamiento operativo y menor margen.`;
    if (Number.isFinite(deltaPct) && deltaPct > 8) return `Crecimiento relevante de ingresos (${fmtPct(deltaPct)}), validar calidad de margen y caja.`;
    return "Ingresos estables, foco en crecimiento rentable y no solo volumen.";
  }

  return "Lectura financiera disponible sin alerta critica puntual en el rubro consultado.";
}

function buildActionLine(metric, value, row) {
  if (!Number.isFinite(value)) {
    return "Solicitar el rubro anual faltante y validar corte contable antes de tomar decisiones.";
  }

  if (metric.id === "deuda_ebitda" || metric.id === "deuda") {
    if (metric.id === "deuda_ebitda" && value > 4) {
      return "Priorizar desapalancamiento: refinanciar deuda cara, extender plazos y fijar meta de bajar por debajo de 4x.";
    }
    return "Mantener deuda anual bajo control con meta mensual de caja operativa y politica de inversion disciplinada.";
  }

  if (metric.id === "margen_ebitda_pct" || metric.id === "margen_neto_pct") {
    if (value < 5) {
      return "Ejecutar plan de margen en 90 dias: precio/mix, reduccion de COGS y recorte de OPEX de bajo ROI.";
    }
    return "Conservar disciplina de margen con seguimiento semanal de descuentos, costos unitarios y productividad.";
  }

  if (metric.id === "ebitda") {
    if (value <= 0) return "Activar plan de recuperacion operativa inmediato: precios, mezcla y control estricto de costos variables.";
    return "Definir objetivo trimestral de crecimiento de EBITDA y convertirlo en caja operativa.";
  }

  if (metric.id === "flujo_operativo" || metric.id === "flujo_periodo") {
    if (value < 0) return "Plan de caja de choque: bajar DSO, reducir inventario y renegociar pagos de corto plazo.";
    return "Aprovechar caja positiva para reducir deuda cara o financiar crecimiento rentable sin tension financiera.";
  }

  if (metric.id === "ingresos") {
    return "Sostener crecimiento rentable: proteger precio, priorizar clientes de mejor margen y vigilar devoluciones/descuentos.";
  }

  return "Mantener tablero mensual con objetivo, responsable y alerta temprana por desviaciones.";
}

function buildMissingDataLine(metric, value, year, row, prevYear, prevValue) {
  if (Number.isFinite(value)) {
    if (Number.isFinite(prevYear) && !Number.isFinite(prevValue)) {
      return `Dato no disponible: ${metric.label} ${prevYear}. Faltante: rubro anual comparativo. Proxy permitido: usar tendencia de 2+ anos disponibles.`;
    }
    return "No faltan datos criticos para la respuesta pedida.";
  }
  const yearLabel = Number.isFinite(year) ? year : "consultado";
  return `Dato no disponible: ${metric.label} ${yearLabel}. Faltante: rubro anual exacto del estado financiero. Proxy permitido: usar ultimo ano completo con nota de cautela.`;
}

function buildPrecisionCheckLine(input) {
  const year = Number(input?.year);
  const prevYear = Number(input?.prevYear);
  const metric = input?.metric || { label: "Rubro" };
  const value = input?.metricValue;
  const compareAsked = !!input?.compareAsked;
  const enforce = input?.enforceYearIsolation !== false;
  const parts = [];
  parts.push(`Ano objetivo: ${Number.isFinite(year) ? year : "N/D"}.`);
  parts.push(`${metric.label} tomado como valor puntual anual: ${formatMetricValue(metric, value)}.`);
  if (compareAsked && Number.isFinite(prevYear)) parts.push(`Comparativo contra ${prevYear} sin sumar periodos.`);
  if (enforce) parts.push("Control aplicado: no acumulacion entre anos.");
  return parts.join(" ");
}

function deterministicAdvisorAnswer(payload) {
  const latest = payload?.latest_snapshot || {};
  const history = Array.isArray(payload?.history) ? payload.history : [];
  const years = history.map((h) => Number(h.anio)).filter(Number.isFinite).sort((a, b) => a - b);
  const firstYear = years.length ? years[0] : null;
  const lastYear = Number(payload?.latest_year);

  const ingresos = toNum(latest.ingresos);
  const ebitda = toNum(latest.ebitda);
  const utilidad = toNum(latest.utilidad_neta);
  const flujoOp = toNum(latest.flujo_operativo);
  const flujoPeriodo = toNum(latest.flujo_periodo);
  const deudaEbitda = toNum(latest.deuda_ebitda);
  const margenEbitda = toNum(latest.margen_ebitda_pct);
  const margenNeto = toNum(latest.margen_neto_pct);
  const zAltman = toNum(latest.z_altman);

  const prev = years.length >= 2
    ? history.find((h) => Number(h.anio) === years[years.length - 2]) || null
    : null;
  const latestHist = years.length
    ? history.find((h) => Number(h.anio) === years[years.length - 1]) || null
    : null;
  const yoyIngresos = pct(toNum(latestHist?.ingresos), toNum(prev?.ingresos));

  const positives = [];
  const risks = [];
  if (margenEbitda !== null && margenEbitda >= 12) positives.push(`margen EBITDA saludable (${fmtPct(margenEbitda)})`);
  if (margenNeto !== null && margenNeto > 0) positives.push(`margen neto positivo (${fmtPct(margenNeto)})`);
  if (flujoOp !== null && flujoOp > 0) positives.push(`flujo operativo positivo (${fmtMoney(flujoOp)})`);
  if (deudaEbitda !== null && deudaEbitda < 3) positives.push(`apalancamiento manejable (${fmtRatio(deudaEbitda)})`);
  if (zAltman !== null && zAltman > 2.6) positives.push(`riesgo bajo por Z-Altman (${fmtNum(zAltman)})`);

  if (margenNeto !== null && margenNeto <= 0) risks.push(`margen neto en zona de perdida (${fmtPct(margenNeto)})`);
  if (flujoPeriodo !== null && flujoPeriodo < 0) risks.push(`flujo del periodo negativo (${fmtMoney(flujoPeriodo)})`);
  if (deudaEbitda !== null && deudaEbitda >= 4) risks.push(`deuda/EBITDA exigente (${fmtRatio(deudaEbitda)})`);
  if (zAltman !== null && zAltman < 1.8) risks.push(`riesgo elevado por Z-Altman (${fmtNum(zAltman)})`);
  if (yoyIngresos !== null && yoyIngresos < 0) risks.push(`caida de ingresos YoY (${fmtPct(yoyIngresos)})`);

  const lines = [];
  lines.push("Resumen ejecutivo:");
  lines.push(`- Corte analizado: ${lastYear || "N/D"}${firstYear ? ` (historia desde ${firstYear})` : ""}.`);
  lines.push(`- Ingresos: ${fmtMoney(ingresos)} | EBITDA: ${fmtMoney(ebitda)} | Utilidad neta: ${fmtMoney(utilidad)}.`);
  lines.push(`- Flujo operativo: ${fmtMoney(flujoOp)} | Flujo del periodo: ${fmtMoney(flujoPeriodo)}.`);
  lines.push(`- Margen EBITDA: ${fmtPct(margenEbitda)} | Margen neto: ${fmtPct(margenNeto)}.`);
  lines.push(`- Deuda/EBITDA: ${fmtRatio(deudaEbitda)} | Z-Altman: ${fmtNum(zAltman)}.`);
  if (yoyIngresos !== null) lines.push(`- Variacion ingresos YoY: ${fmtPct(yoyIngresos)}.`);

  lines.push("");
  lines.push("Senales positivas:");
  if (positives.length) positives.forEach((p) => lines.push(`- ${p}.`));
  else lines.push("- No hay una senal fuerte; se requiere validar detalle de margenes y caja.");

  lines.push("");
  lines.push("Senales a vigilar:");
  if (risks.length) risks.forEach((r) => lines.push(`- ${r}.`));
  else lines.push("- Riesgo controlado en los KPIs principales disponibles.");

  lines.push("");
  lines.push("Recomendaciones priorizadas:");
  lines.push("- 1) Proteger caja operativa: seguimiento semanal de cartera, inventario y proveedores (impacta flujo operativo).");
  lines.push("- 2) Mejorar rentabilidad: ajustar mezcla/precio y eficiencia de costos (impacta margen EBITDA y margen neto).");
  lines.push("- 3) Gestionar deuda: renegociar costo y plazo si deuda/EBITDA esta exigente (impacta cobertura y riesgo financiero).");
  lines.push("- 4) Control mensual con tablero: ingresos YoY, margen EBITDA, margen neto, deuda/EBITDA, flujo operativo y Z-Altman.");

  lines.push("");
  lines.push("Preguntas minimas para afinar plan:");
  lines.push("- Cual linea de negocio tiene mayor caida de margen?");
  lines.push("- Hay presion por tasa de deuda o vencimientos de corto plazo?");
  lines.push("- Donde se esta inmovilizando mas caja: cartera, inventario o capex?");
  return lines.join("\n");
}

function inferFormulaFromQuestion(qNorm) {
  if (qNorm.includes("deuda") && qNorm.includes("ebitda")) return "Deuda/EBITDA = deuda financiera neta / EBITDA.";
  if (qNorm.includes("margen") && qNorm.includes("ebitda")) return "Margen EBITDA = EBITDA / ingresos * 100.";
  if (qNorm.includes("margen") && qNorm.includes("neto")) return "Margen neto = utilidad neta / ingresos * 100.";
  if (qNorm.includes("crecimiento") || qNorm.includes("yoy")) return "Crecimiento YoY = (valor actual - valor previo) / valor previo * 100.";
  if (qNorm.includes("cobertura") && qNorm.includes("interes")) return "Cobertura = EBITDA (o EBIT) / gastos financieros.";
  if (qNorm.includes("ccc")) return "CCC = DSO + DIH - DPO.";
  if (qNorm.includes("dso")) return "DSO = cuentas por cobrar / ingresos * 365.";
  if (qNorm.includes("dih")) return "DIH = inventario / costo de ventas * 365.";
  if (qNorm.includes("dpo")) return "DPO = cuentas por pagar / costo de ventas * 365.";
  if (qNorm.includes("roa")) return "ROA = utilidad neta / activos totales * 100.";
  if (qNorm.includes("roe")) return "ROE = utilidad neta / patrimonio * 100.";
  return "Se usa lectura financiera por variacion anual y relacion de rentabilidad, caja y riesgo.";
}

function inferInterpretation(metrics) {
  const deudaEbitda = toNum(metrics?.deudaEbitda);
  const flujoOp = toNum(metrics?.flujoOp);
  const margenEbitda = toNum(metrics?.margenEbitda);
  const margenNeto = toNum(metrics?.margenNeto);
  const alerts = [];
  const strengths = [];

  if (deudaEbitda !== null && deudaEbitda > 4) alerts.push("apalancamiento alto");
  if (deudaEbitda !== null && deudaEbitda < 3) strengths.push("apalancamiento manejable");
  if (flujoOp !== null && flujoOp < 0) alerts.push("flujo operativo negativo");
  if (flujoOp !== null && flujoOp > 0) strengths.push("flujo operativo positivo");
  if (margenEbitda !== null && margenEbitda < 10) alerts.push("margen EBITDA comprimido");
  if (margenEbitda !== null && margenEbitda >= 12) strengths.push("margen EBITDA saludable");
  if (margenNeto !== null && margenNeto <= 0) alerts.push("rentabilidad neta debil");
  if (margenNeto !== null && margenNeto > 0) strengths.push("rentabilidad neta positiva");

  if (alerts.length && strengths.length) return `Hay senales mixtas: fortalezas en ${strengths.join(", ")} y alertas en ${alerts.join(", ")}.`;
  if (alerts.length) return `La lectura es de cuidado por ${alerts.join(", ")}.`;
  if (strengths.length) return `La lectura es favorable por ${strengths.join(", ")}.`;
  return "La lectura es limitada por falta de datos en rubros clave.";
}

function inferAction(metrics) {
  const deudaEbitda = toNum(metrics?.deudaEbitda);
  const flujoOp = toNum(metrics?.flujoOp);
  const margenEbitda = toNum(metrics?.margenEbitda);
  const margenNeto = toNum(metrics?.margenNeto);

  if (deudaEbitda !== null && deudaEbitda > 4) {
    return "Priorizar desapalancamiento y refinanciacion de deuda cara; meta: bajar Deuda/EBITDA por debajo de 4x.";
  }
  if (flujoOp !== null && flujoOp < 0) {
    return "Activar plan de caja de 90 dias: acelerar cartera, reducir inventario y renegociar pagos con proveedores.";
  }
  if (margenEbitda !== null && margenEbitda < 10) {
    return "Ejecutar plan de margen: precio/mix, reduccion de COGS y recorte de OPEX de bajo ROI.";
  }
  if (margenNeto !== null && margenNeto <= 0) {
    return "Separar rapidamente perdidas operativas vs financieras y definir acciones de recuperacion por frente.";
  }
  return "Sostener disciplina en caja y rentabilidad con tablero mensual de KPIs y alertas tempranas.";
}

function inferMissingData(ctx) {
  const missingFields = [];
  if (toNum(ctx?.ingresos) === null) missingFields.push("ingresos");
  if (toNum(ctx?.ebitda) === null) missingFields.push("EBITDA");
  if (toNum(ctx?.deudaEbitda) === null) missingFields.push("deuda/EBITDA");
  if (toNum(ctx?.flujoOp) === null) missingFields.push("flujo operativo");
  if (toNum(ctx?.margenEbitda) === null) missingFields.push("margen EBITDA");
  if (toNum(ctx?.margenNeto) === null) missingFields.push("margen neto");

  if (!missingFields.length) {
    return "No faltan datos criticos para la lectura base del ano consultado.";
  }
  return `Dato no disponible: ${missingFields.join(", ")}. Faltante: estado de resultados y/o flujo del ano ${ctx?.latestYear || "consultado"}. Proxy permitido: usar ultimo ano completo con nota de cautela.`;
}

function normalizeAdvisorOptions(input) {
  const raw = input || {};
  const skipWeb = toBool(raw.skip_web) || toBool(raw.skipWeb) || FAST_MODE_DEFAULT;
  const skipLlm = toBool(raw.skip_llm) || toBool(raw.skipLlm) || FAST_MODE_DEFAULT;
  const precisionMode = normalizePrecisionMode(raw.precision_mode || raw.precisionMode || DEFAULT_PRECISION_MODE);
  const interpretationLevel = normalizeInterpretationLevel(raw.interpretation_level || raw.interpretationLevel || DEFAULT_INTERPRETATION_LEVEL);
  const enforceYearIsolation =
    (raw.enforce_year_isolation === undefined && raw.enforceYearIsolation === undefined)
      ? DEFAULT_ENFORCE_YEAR_ISOLATION
      : (toBool(raw.enforce_year_isolation) || toBool(raw.enforceYearIsolation));
  const debugTrace = toBool(raw.debug_trace) || toBool(raw.debugTrace);
  const temperature = normalizeTemperature(raw.temperature ?? raw.temp ?? 0.2);
  return { skipWeb, skipLlm, precisionMode, interpretationLevel, enforceYearIsolation, debugTrace, temperature };
}

function normalizeTemperature(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.2;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizePrecisionMode(v) {
  const t = cleanText(v).toLowerCase();
  if (t === "std" || t === "standard" || t === "normal") return "standard";
  return "high";
}

function normalizeInterpretationLevel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 3;
  if (n < 1) return 1;
  if (n > 3) return 3;
  return Math.round(n);
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((h) => ({
      role: cleanText(h?.role || "").toLowerCase() === "user" ? "user" : "assistant",
      text: cleanMultilineText(h?.text || h?.content || "")
    }))
    .filter((h) => h.text)
    .slice(-24);
}

function nextDebugTraceId() {
  debugTraceSeq += 1;
  const n = String(debugTraceSeq).padStart(6, "0");
  return `tr_${Date.now()}_${n}`;
}

function pushDebugTrace(trace) {
  if (!trace || typeof trace !== "object") return;
  debugTraceStore.push(trace);
  if (debugTraceStore.length > DEBUG_TRACE_LIMIT) {
    const extra = debugTraceStore.length - DEBUG_TRACE_LIMIT;
    debugTraceStore.splice(0, extra);
  }
}

function getDebugTraceById(id) {
  const traceId = cleanText(id || "");
  if (!traceId) return null;
  return debugTraceStore.find((t) => t.id === traceId) || null;
}

function listDebugTraces(limit = 20, full = false) {
  const max = Math.max(1, Math.min(200, Number(limit) || 20));
  const rows = debugTraceStore.slice(-max).reverse();
  if (full) return rows;
  return rows.map((t) => ({
    id: t.id,
    session_id: t.session_id,
    created_at: t.created_at,
    completed_at: t.completed_at,
    mode: t.mode,
    question: t.question,
    company: t.company,
    latest_year: t.latest_year,
    data_profile: t.data_profile,
    intent: t.intent,
    focus: t.focus,
    priorities: Array.isArray(t.priorities) ? t.priorities.slice(0, 3) : [],
    evidence_count: Array.isArray(t.web_evidence) ? t.web_evidence.length : 0,
    answer_preview: t.answer_preview
  }));
}

function isAuthEnabled() {
  return !!(ADVISOR_AUTH_USER && ADVISOR_AUTH_PASSWORD);
}

function isAuthorizedRequest(req) {
  if (!isAuthEnabled()) return true;
  const header = cleanText(req?.headers?.authorization || "");
  if (!header || !/^basic\s+/i.test(header)) return false;
  const token = header.replace(/^basic\s+/i, "").trim();
  if (!token) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx <= 0) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return secureCompare(user, ADVISOR_AUTH_USER) && secureCompare(pass, ADVISOR_AUTH_PASSWORD);
}

function secureCompare(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function sendAuthRequired(res) {
  const body = JSON.stringify({ ok: false, error: "Autenticacion requerida." });
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("WWW-Authenticate", 'Basic realm="Analizador Financiero", charset="UTF-8"');
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end(body);
}

function normalizeProvider(value) {
  const t = cleanText(value || "").toLowerCase();
  if (t === "openai" || t === "ollama") return t;
  return "auto";
}

function effectiveProvider() {
  if (LLM_PROVIDER === "openai") return OPENAI_API_KEY ? "openai" : "ollama";
  if (LLM_PROVIDER === "ollama") return "ollama";
  return OPENAI_API_KEY ? "openai" : "ollama";
}

function getServerConfigSummary() {
  return {
    provider: effectiveProvider(),
    model: activeModel,
    openai_enabled: !!OPENAI_API_KEY,
    auth_enabled: isAuthEnabled(),
    requires_client_api_keys: false,
    centralized_memory: true,
    session_ttl_ms: SESSION_TTL_MS,
    session_limit: SESSION_LIMIT,
    has_config_token: !!SERVER_CONFIG_TOKEN
  };
}

function normalizeSessionId(value) {
  const raw = cleanText(value || "");
  if (!raw) return "";
  const id = raw.replace(/[^a-zA-Z0-9_\-:.]/g, "");
  if (!id) return "";
  if (id.length > 120) return id.slice(0, 120);
  return id;
}

function createSessionId() {
  if (typeof crypto.randomUUID === "function") return `s_${crypto.randomUUID()}`;
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function mergeSessionAndClientHistory(serverHistory, clientHistory) {
  const srv = normalizeChatHistory(serverHistory || []);
  if (srv.length) return srv;
  return normalizeChatHistory(clientHistory || []);
}

function getSessionHistory(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return [];
  const session = sessionStore.get(id);
  if (!session || !Array.isArray(session.history)) return [];
  return normalizeChatHistory(session.history);
}

function appendSessionTurn(sessionId, role, text) {
  const id = normalizeSessionId(sessionId);
  const safeText = cleanMultilineText(text || "");
  if (!id || !safeText) return;

  const safeRole = cleanText(role || "").toLowerCase() === "user" ? "user" : "assistant";
  const now = new Date().toISOString();
  const prev = sessionStore.get(id);
  const history = Array.isArray(prev?.history) ? prev.history.slice() : [];
  const last = history[history.length - 1];
  if (last && last.role === safeRole && cleanMultilineText(last.text || "") === safeText) {
    const updated = { ...(prev || {}), id, updated_at: now, history };
    sessionStore.set(id, updated);
    persistSessionStore();
    return;
  }

  history.push({ role: safeRole, text: safeText, at: now });
  const clipped = normalizeChatHistory(history).slice(-40);
  const updated = {
    id,
    created_at: cleanText(prev?.created_at || "") || now,
    updated_at: now,
    history: clipped,
    company: prev?.company || null
  };
  sessionStore.set(id, updated);
  enforceSessionLimit();
  persistSessionStore();
}

function upsertSessionMeta(sessionId, company) {
  const id = normalizeSessionId(sessionId);
  if (!id) return;
  const now = new Date().toISOString();
  const prev = sessionStore.get(id) || {};
  const history = normalizeChatHistory(prev.history || []);
  const safeCompany = {
    nit: cleanText(company?.nit || prev?.company?.nit || ""),
    razon_social: cleanText(company?.razon_social || prev?.company?.razon_social || "")
  };
  sessionStore.set(id, {
    id,
    created_at: cleanText(prev.created_at || "") || now,
    updated_at: now,
    history,
    company: safeCompany
  });
  enforceSessionLimit();
  persistSessionStore();
}

function enforceSessionLimit() {
  if (sessionStore.size <= SESSION_LIMIT) return;
  const rows = [...sessionStore.values()]
    .sort((a, b) => new Date(a?.updated_at || 0).getTime() - new Date(b?.updated_at || 0).getTime());
  const toDrop = sessionStore.size - SESSION_LIMIT;
  for (let i = 0; i < toDrop; i += 1) {
    const id = normalizeSessionId(rows[i]?.id || "");
    if (id) sessionStore.delete(id);
  }
}

function pruneSessionStore() {
  const now = Date.now();
  let changed = false;
  for (const [id, session] of sessionStore.entries()) {
    const updated = new Date(session?.updated_at || session?.created_at || 0).getTime();
    if (!Number.isFinite(updated) || updated <= 0 || (now - updated) > SESSION_TTL_MS) {
      sessionStore.delete(id);
      changed = true;
    }
  }
  if (changed) persistSessionStore();
}

function hydrateSessionStore() {
  if (!SESSION_PERSIST) return;
  try {
    if (!fs.existsSync(SESSION_STORE_FILE)) return;
    const raw = fs.readFileSync(SESSION_STORE_FILE, "utf8");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    sessions.forEach((s) => {
      const id = normalizeSessionId(s?.id || "");
      if (!id) return;
      const history = normalizeChatHistory(s?.history || []);
      sessionStore.set(id, {
        id,
        created_at: cleanText(s?.created_at || ""),
        updated_at: cleanText(s?.updated_at || ""),
        history,
        company: s?.company && typeof s.company === "object" ? {
          nit: cleanText(s.company.nit || ""),
          razon_social: cleanText(s.company.razon_social || "")
        } : null
      });
    });
    enforceSessionLimit();
    pruneSessionStore();
  } catch (error) {
    console.warn("[advisor] No se pudo cargar sesiones persistidas:", cleanText(error?.message || error));
  }
}

function persistSessionStore() {
  if (!SESSION_PERSIST) return;
  try {
    const dir = path.dirname(SESSION_STORE_FILE);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      updated_at: new Date().toISOString(),
      sessions: [...sessionStore.values()].map((s) => ({
        id: normalizeSessionId(s?.id || ""),
        created_at: cleanText(s?.created_at || ""),
        updated_at: cleanText(s?.updated_at || ""),
        company: s?.company || null,
        history: normalizeChatHistory(s?.history || []).slice(-40)
      }))
    };
    fs.writeFileSync(SESSION_STORE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[advisor] No se pudo persistir sesiones:", cleanText(error?.message || error));
  }
}

function shouldServeStaticPath(pathname) {
  const p = cleanText(pathname || "");
  if (!p) return true;
  if (p === "/health") return false;
  if (p.startsWith("/api/")) return false;
  return true;
}

async function serveStaticFile(pathname, res) {
  const root = path.resolve(process.cwd());
  let reqPath = decodeURIComponent(cleanText(pathname || "/"));
  if (!reqPath || reqPath === "/") reqPath = "/index.html";
  if (reqPath.endsWith("/")) reqPath = `${reqPath}index.html`;
  if (reqPath.includes("\0")) return false;

  const rel = reqPath.replace(/^\/+/, "");
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root)) return false;

  try {
    const st = await fs.promises.stat(abs);
    if (!st.isFile()) return false;
    const data = await fs.promises.readFile(abs);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeForFile(abs));
    res.setHeader("Cache-Control", rel === "index.html" ? "no-cache" : "public, max-age=300");
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function contentTypeForFile(filePath) {
  const ext = path.extname(cleanText(filePath || "")).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".txt" || ext === ".md") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function cleanMultilineText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, idx, arr) => line || (idx > 0 && arr[idx - 1]))
    .join("\n")
    .trim();
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  const t = cleanText(v).toLowerCase();
  return t === "1" || t === "true" || t === "si" || t === "yes";
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload || {});
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end(body);
}

async function readJsonBody(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Payload demasiado grande.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function fetchJson(url, options, timeoutMs) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return await response.json();
}

async function fetchText(url, timeoutMs) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; hidden-financial-advisor/1.0)"
      }
    },
    timeoutMs
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs || 15000);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function truncate(text, n) {
  const s = String(text || "");
  return s.length <= n ? s : `${s.slice(0, n - 3)}...`;
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function fmtMoney(v) {
  if (!Number.isFinite(v)) return "N/D";
  return `COP ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v)}`;
}

function fmtPct(v) {
  if (!Number.isFinite(v)) return "N/D";
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
}

function fmtRatio(v) {
  if (!Number.isFinite(v)) return "N/D";
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}x`;
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return "N/D";
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
