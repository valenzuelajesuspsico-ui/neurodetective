import { useState, useEffect, Fragment } from "react";
import { Brain, Lightbulb, CheckCircle2, XCircle, ChevronRight, ChevronLeft, RotateCcw, Flame, LayoutGrid, Sparkles, BookOpen, Gamepad2, X, HelpCircle, GitCompare, Heart, ClipboardList, GraduationCap, FolderOpen, Lock, Home, FileText, Search, Calendar, BarChart3, Volume2, VolumeX } from "lucide-react";
import { SFX, Typewriter } from "./sound.jsx";
import { shuffleArr, pickRandom, competencyPct, getRank, getClinicalRank, buildReportData, classifyOutcome, buildSupervisorNote, getPerformanceTier, parseReview } from "./logic.js";
import {
  DOMAIN_DESCRIPTIONS,
  UNIT_DESCRIPTIONS,
  DOMAINS,
  UNITS,
  CONSTRUCTS_BY_DOMAIN,
  KEY_DISTINCTIONS,
  DIFF_DRILL,
  CLASSIFY_ACTIVITY,
  CONTRAST_VIGNETTES,
  FLASHCARDS,
  READINESS_CHECK,
  BASE_POINTS,
  QTYPE_LABEL,
  LEVEL_LABEL,
  SYNTHESIS_BONUS,
  REPORT_BONUS,
  CASES,
  CASE_META,
  SYNTHESIS_CASES,
  STUDY_CASES,
  SUPERVISION_CASES,
  SUPERVISION_WRONG_FEEDBACK,
  SUPERVISION_BONUS,
  EXPERT_SYSTEM_PROMPT,
  STREAK3_PHRASES,
  STREAK5_PHRASES,
  WRONG_ANSWER_PHRASES,
  PERFECT_CASE_PHRASES,
  CASE_OVERRIDE_PHRASES,
  LEVEL_UP_PHRASES,
  TRUST_LOST_PHRASE,
  MAX_SCORE,
  TOTAL_MAX,
  MAX_CELLS,
  STUDY_STEPS,
  STUDY_TOTAL,
  PRESTIGE_DELTA,
  SUPERVISOR_NAME,
  REVIEW_FIELDS,
  REVIEW_ACCENTS,
  REVIEW_LABEL_COLOR,
  REFERENCES,
} from "./data.js";






const vibrate = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* no-op */ } };

// Almacenamiento local seguro (no rompe si localStorage no está disponible)
const storage = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* no-op */ } },
};

// Modo Experto: llamada directa a la API de Anthropic (requiere API key del usuario).
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const EXPERT_MODEL = "claude-sonnet-5";
const KEY_STORAGE = "nd_anthropic_key";
const SOUND_STORAGE = "nd_sound_on";
const BESTSCORE_STORAGE = "nd_best_score";

// Canal de retroalimentación (issue prellenado en GitHub) para que especialistas reporten casos discutibles.
const FEEDBACK_URL = "https://github.com/valenzuelajesuspsico-ui/neurodetective/issues/new?title=" +
  encodeURIComponent("Caso discutible / sugerencia de contenido") +
  "&body=" +
  encodeURIComponent("Caso o pantalla:\n\nRespuesta marcada como correcta:\n\nRespuesta que yo defendería (y por qué):\n\nInstrumento/constructo que ajustaría:\n\n— Gracias por tu revisión.");






function PeerReviewCard({ sections }) {
  return (
    <div className="space-y-2 max-w-[92%]">
      {sections.map(s => (
        <div key={s.tag} className={`rounded-xl border p-3 ${REVIEW_ACCENTS[s.accent]}`}>
          <div className={`flex items-center gap-1.5 mb-1 text-[11px] font-bold uppercase tracking-wide ${REVIEW_LABEL_COLOR[s.accent]}`}>
            <span>{s.icon}</span> {s.label}
          </div>
          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{s.content}</p>
        </div>
      ))}
    </div>
  );
}

function SupervisionReport({ supCase, selectedId, solved, onPick }) {
  return (
    <div
      style={{
        marginBottom: "16px",
        borderRadius: "12px",
        border: "1px solid #334155",
        backgroundColor: "#f8fafc",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      {/* Encabezado tipo membrete del informe */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderBottom: "1px solid #e2e8f0",
          backgroundColor: "#eef2f7",
        }}
      >
        <FileText className="w-4 h-4" style={{ color: "#475569" }} />
        <span style={{ color: "#334155", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Informe neuropsicológico — Colega
        </span>
      </div>

      {/* Cuerpo del informe: prosa continua, cada frase es seleccionable */}
      <p style={{ padding: "16px 18px", margin: 0, color: "#1e293b", fontSize: "14px", lineHeight: "1.9", textAlign: "justify" }}>
        {supCase.segments.map((seg, idx) => {
          const isSelected = selectedId === seg.id;
          const isCorrect = seg.id === supCase.correctId;
          const showGreen = (isSelected && isCorrect) || (solved && isCorrect);
          const showRed = isSelected && !isCorrect;
          const segStyle = {
            cursor: solved ? "default" : "pointer",
            borderRadius: "4px",
            padding: "1px 2px",
            transition: "background-color 0.15s",
            backgroundColor: showGreen ? "rgba(16,185,129,0.28)" : showRed ? "rgba(239,68,68,0.28)" : "transparent",
            boxShadow: showGreen ? "inset 0 -2px 0 #10b981" : showRed ? "inset 0 -2px 0 #ef4444" : "none",
            color: "#1e293b",
          };
          return (
            <Fragment key={seg.id}>
              <span
                onClick={() => { if (!solved) onPick(seg.id); }}
                className={solved ? "" : "supervision-segment"}
                style={segStyle}
              >
                {seg.text}
                {showGreen ? <span style={{ color: "#059669", fontWeight: "bold" }}> ✓</span> : null}
                {showRed ? <span style={{ color: "#dc2626", fontWeight: "bold" }}> ✕</span> : null}
              </span>
              {idx < supCase.segments.length - 1 ? " " : null}
            </Fragment>
          );
        })}
      </p>
    </div>
  );
}

function CompetencyBar({ label, obj }) {
  const pct = competencyPct(obj);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300 font-medium">{label}</span>
        <span className="text-xs text-slate-400">{pct === null ? "Sin datos aún" : `${pct}% (${obj.correct}/${obj.total})`}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct === null ? "" : pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function DifficultyDots({ n }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-500">Astucia</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`w-1.5 h-1.5 rounded-sm ${i <= n ? "bg-amber-400" : "bg-slate-700"}`} />
        ))}
      </div>
    </div>
  );
}

function TrustMeter({ n }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-500">Confianza</span>
      <div className="flex gap-0.5">
        {[1, 2, 3].map(i => (
          <Heart key={i} className={`w-3 h-3 ${i <= n ? "text-pink-400 fill-pink-400" : "text-slate-700"}`} />
        ))}
      </div>
    </div>
  );
}

function FunBanner({ text }) {
  if (!text) return null;
  return (
    <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 text-amber-200 text-sm font-medium">
      {text}
    </div>
  );
}

export default function NeuroDetectiveRDoC() {
  const [screen, setScreen] = useState("start");

  // --- efectos de experiencia: sonido + puntos flotantes ---
  const [soundOn, setSoundOn] = useState(() => storage.get(SOUND_STORAGE, "0") === "1");
  const [pointsFx, setPointsFx] = useState(null); // { amount, id }
  const [bestScore, setBestScore] = useState(() => Number(storage.get(BESTSCORE_STORAGE, "0")) || 0);
  useEffect(() => { SFX.setEnabled(soundOn); }, [soundOn]);
  function toggleSound() {
    setSoundOn(prev => {
      const next = !prev;
      SFX.setEnabled(next);
      storage.set(SOUND_STORAGE, next ? "1" : "0");
      if (next) SFX.click();
      return next;
    });
  }

  // --- perfil del jugador (solo durante la sesión) ---
  const [playerName, setPlayerName] = useState("");
  const [playerLastName, setPlayerLastName] = useState("");
  const [playerSpecialty, setPlayerSpecialty] = useState("Neuropsicología");
  const [playerInstitution, setPlayerInstitution] = useState("");
  const [prestige, setPrestige] = useState(50);
  const [supervisorNote, setSupervisorNote] = useState(null);

  // --- estado modo juego ---
  const [caseIndex, setCaseIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  useEffect(() => {
    if (score > bestScore) { setBestScore(score); storage.set(BESTSCORE_STORAGE, String(score)); }
  }, [score, bestScore]);
  const [streak, setStreak] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [removedIdx, setRemovedIdx] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [caseHintUsed, setCaseHintUsed] = useState(false);
  const [questionResults, setQuestionResults] = useState([]);
  const [discoveredCells, setDiscoveredCells] = useState(new Set());
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [statsByType, setStatsByType] = useState({
    sindrome: { correct: 0, total: 0 }, dominio: { correct: 0, total: 0 },
    constructo: { correct: 0, total: 0 }, unidad: { correct: 0, total: 0 }, instrumento: { correct: 0, total: 0 },
    contexto: { correct: 0, total: 0 },
  });
  const [revealed, setRevealed] = useState(new Set());
  const [interviewDone, setInterviewDone] = useState(false);
  const [funBanner, setFunBanner] = useState(null);
  const [trust, setTrust] = useState(3);
  const [caseLostTrust, setCaseLostTrust] = useState(false);
  const [mustReconsult, setMustReconsult] = useState(false);
  const [misdiagnosedCases, setMisdiagnosedCases] = useState(new Set());
  const [attemptedCases, setAttemptedCases] = useState(new Set());

  // --- estado redacción de informe + seguimiento longitudinal ---
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportFilledTypes, setReportFilledTypes] = useState(new Set());
  const [reportUsedBankIdx, setReportUsedBankIdx] = useState(new Set());
  const [reportSelectedType, setReportSelectedType] = useState(null);
  const [reportSelectedBankIdx, setReportSelectedBankIdx] = useState(null);
  const [reportWrongFlash, setReportWrongFlash] = useState(false);
  const [pendingBanner, setPendingBanner] = useState(null);
  const [showLongitudinal, setShowLongitudinal] = useState(false);
  const [caseOutcome, setCaseOutcome] = useState(null);

  // --- estado interludios de síntesis ---
  const [synthesisIndex, setSynthesisIndex] = useState(0);
  const [synthesisSelected, setSynthesisSelected] = useState(null);
  const [synthesisShowFeedback, setSynthesisShowFeedback] = useState(false);

  // --- estado modo estudio ---
  const [studyPos, setStudyPos] = useState(0);
  const [studySelected, setStudySelected] = useState(null);
  const [studyShowFeedback, setStudyShowFeedback] = useState(false);

  // --- estado curso RDoC + actividades + check de preparación ---
  const [courseStep, setCourseStep] = useState(0);
  const [diffDrillAns, setDiffDrillAns] = useState({});   // idx -> "a" | "b"
  const [classifyAns, setClassifyAns] = useState({});     // stepKey -> optionIndex
  const [flippedCards, setFlippedCards] = useState(new Set());
  const [contrastAns, setContrastAns] = useState({});     // question.key -> optionIndex
  const [checkAns, setCheckAns] = useState({});           // question.key -> optionIndex
  const [checkSubmitted, setCheckSubmitted] = useState(false);

  // --- estado modo supervisión ---
  const [supervisionPos, setSupervisionPos] = useState(0);
  const [supervisionSelected, setSupervisionSelected] = useState(null);
  const [supervisionSolved, setSupervisionSolved] = useState(false);
  const [supervisionScore, setSupervisionScore] = useState(0);

  // --- estado modo experto (DOI) ---
  const [expertDoi, setExpertDoi] = useState("");
  const [expertText, setExpertText] = useState("");
  const [expertFormulation, setExpertFormulation] = useState("");
  const [expertMessages, setExpertMessages] = useState([]);
  const [expertLoading, setExpertLoading] = useState(false);
  const [expertInput, setExpertInput] = useState("");
  const [expertError, setExpertError] = useState(null);
  const [expertStarted, setExpertStarted] = useState(false);
  const [expertApiKey, setExpertApiKey] = useState(() => storage.get(KEY_STORAGE, ""));
  function updateApiKey(v) { setExpertApiKey(v); storage.set(KEY_STORAGE, v); }

  async function callAnthropic(body) {
    if (!expertApiKey.trim()) throw new Error("NO_KEY");
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": expertApiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP_" + res.status);
    const data = await res.json();
    return data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  }

  function expertErrorFor(e) {
    if (e && e.message === "NO_KEY") return "Necesitas configurar tu API key de Anthropic para usar este modo (se guarda solo en tu navegador).";
    if (e && /HTTP_401/.test(e.message)) return "La API key no es válida (401). Revísala e intenta de nuevo.";
    return "No se pudo completar el análisis. Revisa tu conexión, la API key o pega el texto del resumen directamente.";
  }

  async function analyzeExpertCase() {
    if ((!expertDoi.trim() && !expertText.trim()) || !expertFormulation.trim()) return;
    setExpertLoading(true);
    setExpertError(null);
    setExpertMessages([]);
    const sourceBlock = expertDoi.trim()
      ? `DOI del artículo: ${expertDoi.trim()}${expertText.trim() ? `\n\nTexto adicional del caso (abstract o secciones clave):\n${expertText.trim()}` : ""}`
      : `Texto del caso clínico:\n${expertText.trim()}`;
    const userContent = `${sourceBlock}\n\n--- MI FORMULACIÓN RDoC (la del colega) ---\n${expertFormulation.trim()}\n\nRevisa mi formulación como par: dime qué sostengo bien, dónde la evidencia del artículo no respalda del todo mi clasificación, y qué alternativas debería considerar. No me des la respuesta cerrada; cuestiona mi razonamiento.`;
    try {
      const text = await callAnthropic({
        model: EXPERT_MODEL,
        max_tokens: 1000,
        system: EXPERT_SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userContent }],
      });
      setExpertMessages([
        { role: "user", content: userContent },
        { role: "assistant", content: text },
      ]);
      setExpertStarted(true);
    } catch (e) {
      setExpertError(expertErrorFor(e));
    } finally {
      setExpertLoading(false);
    }
  }

  async function sendExpertMessage() {
    if (!expertInput.trim() || expertLoading) return;
    const newMsg = { role: "user", content: expertInput.trim() };
    const updated = [...expertMessages, newMsg];
    setExpertMessages(updated);
    setExpertInput("");
    setExpertLoading(true);
    try {
      const text = await callAnthropic({
        model: EXPERT_MODEL,
        max_tokens: 1000,
        system: EXPERT_SYSTEM_PROMPT,
        messages: updated,
      });
      setExpertMessages([...updated, { role: "assistant", content: text }]);
    } catch (e) {
      setExpertError(expertErrorFor(e));
    } finally {
      setExpertLoading(false);
    }
  }

  function resetReadinessCheck() {
    setCheckAns({});
    setCheckSubmitted(false);
  }

  function resetSupervision() {
    setSupervisionPos(0); setSupervisionSelected(null); setSupervisionSolved(false); setSupervisionScore(0);
  }
  function handleStartSupervision() { resetSupervision(); setScreen("supervision"); }
  function pickSupervisionSegment(id) {
    if (supervisionSolved) return;
    setSupervisionSelected(id);
    if (id === SUPERVISION_CASES[supervisionPos].correctId) {
      setSupervisionSolved(true);
      setSupervisionScore(s => s + SUPERVISION_BONUS);
    }
  }
  function nextSupervisionCase() {
    setSupervisionSelected(null); setSupervisionSolved(false);
    if (supervisionPos < SUPERVISION_CASES.length - 1) setSupervisionPos(p => p + 1);
    else setScreen("supervision-end");
  }

  const currentCase = CASES[caseIndex];
  const currentQuestion = currentCase ? currentCase.questions[questionIndex] : null;

  function startCase(idx) {
    setCaseIndex(idx);
    setQuestionIndex(0);
    setRevealed(new Set());
    setInterviewDone(false);
    setCaseHintUsed(false);
    setTrust(3);
    setCaseLostTrust(false);
    setMustReconsult(false);
    setShowReport(false);
    setShowLongitudinal(false);
  }

  function resetGame() {
    startCase(0);
    setScore(0); setStreak(0);
    setSelected(null); setShowFeedback(false); setRemovedIdx(null); setHintUsed(false);
    setQuestionResults([]); setDiscoveredCells(new Set());
    setStats({ correct: 0, total: 0 });
    setStatsByType({
      sindrome: { correct: 0, total: 0 }, dominio: { correct: 0, total: 0 },
      constructo: { correct: 0, total: 0 }, unidad: { correct: 0, total: 0 }, instrumento: { correct: 0, total: 0 },
      contexto: { correct: 0, total: 0 },
    });
    setSynthesisIndex(0); setSynthesisSelected(null); setSynthesisShowFeedback(false);
    setFunBanner(null);
    setMisdiagnosedCases(new Set());
    setAttemptedCases(new Set());
    setPrestige(50);
    setSupervisorNote(null);
    setCaseOutcome(null);
  }

  function resetStudy() {
    setStudyPos(0); setStudySelected(null); setStudyShowFeedback(false);
  }

  function handleStartGame() {
    resetGame();
    if (!playerName.trim()) setScreen("profile");
    else setScreen("lobby");
  }
  function handleStartStudy() { resetStudy(); setScreen("study"); }
  function goHome() { setScreen("start"); }
  function goLobby() { setShowReport(false); setShowLongitudinal(false); setScreen("lobby"); }
  function openCase(idx) { startCase(idx); setFunBanner(null); setSupervisorNote(null); setScreen("playing"); }
  function openSynthesis(idx) {
    setSynthesisIndex(idx);
    setSynthesisSelected(null);
    setSynthesisShowFeedback(false);
    setScreen("synthesis");
  }

  function handleSelect(i) {
    if (showFeedback) return;
    const option = currentQuestion.options[i];
    const qType = currentQuestion.type;
    setSelected(i);
    setShowFeedback(true);
    setStats(s => ({ correct: s.correct + (option.correct ? 1 : 0), total: s.total + 1 }));
    setStatsByType(prev => ({
      ...prev,
      [qType]: { correct: prev[qType].correct + (option.correct ? 1 : 0), total: prev[qType].total + 1 },
    }));

    if (option.correct) {
      const newStreak = streak + 1;
      const mult = newStreak >= 3 ? 1.5 : 1;
      const gained = Math.round(BASE_POINTS[currentQuestion.type] * mult);
      setScore(s => s + gained);
      setStreak(newStreak);
      setMustReconsult(false);
      setPointsFx({ amount: gained, id: Math.random() });
      SFX.correct();
      vibrate(25);
      if (newStreak === 3) { setFunBanner(pickRandom(STREAK3_PHRASES)); SFX.streak(); vibrate([20, 40, 20]); }
      else if (newStreak === 5) { setFunBanner(pickRandom(STREAK5_PHRASES)); SFX.streak(); }
      else setFunBanner(null);
    } else {
      setStreak(0);
      SFX.wrong();
      vibrate([55, 30, 55]);
      const newTrust = Math.max(0, trust - 1);
      setTrust(newTrust);
      if (newTrust === 0 && !caseLostTrust) {
        setCaseLostTrust(true);
        setFunBanner(TRUST_LOST_PHRASE);
      } else {
        setFunBanner(pickRandom(WRONG_ANSWER_PHRASES));
      }
      if (currentQuestion.type === "sindrome" && questionIndex === 0 && revealed.size < 3) {
        setMustReconsult(true);
      } else {
        setMustReconsult(false);
      }
    }

    setQuestionResults(prev => {
      const copy = [...prev];
      copy[questionIndex] = option.correct;
      return copy;
    });
  }

  function handleHint() {
    if (hintUsed || showFeedback || score < 30) return;
    const incorrect = currentQuestion.options.map((o, i) => ({ o, i })).filter(x => !x.o.correct);
    if (incorrect.length === 0) return;
    const pick = incorrect[Math.floor(Math.random() * incorrect.length)].i;
    setRemovedIdx(pick);
    setHintUsed(true);
    setCaseHintUsed(true);
    setScore(s => s - 30);
  }

  function handleNext() {
    SFX.pageTurn();
    if (mustReconsult) {
      setMustReconsult(false);
      setSelected(null); setShowFeedback(false); setRemovedIdx(null); setHintUsed(false);
      setInterviewDone(false);
      return;
    }

    const isLastQuestion = questionIndex >= currentCase.questions.length - 1;
    setSelected(null); setShowFeedback(false); setRemovedIdx(null); setHintUsed(false);
    setMustReconsult(false);

    if (!isLastQuestion) {
      setQuestionIndex(qi => qi + 1);
      return;
    }

    if (currentCase.domainKey && currentCase.unitKey) {
      const domainIdx = currentCase.questions.findIndex(q => q.type === "dominio");
      const unitIdx = currentCase.questions.findIndex(q => q.type === "unidad");
      if (questionResults[domainIdx] && questionResults[unitIdx]) {
        setDiscoveredCells(prev => new Set(prev).add(`${currentCase.domainKey}-${currentCase.unitKey}`));
      }
    }

    const sindromeWrong = currentCase.questions.some((q, idx) => q.type === "sindrome" && questionResults[idx] === false);
    if (sindromeWrong || caseLostTrust) {
      setMisdiagnosedCases(prev => new Set(prev).add(caseIndex));
    }
    setAttemptedCases(prev => new Set(prev).add(caseIndex));

    const wasPerfect = questionResults.length > 0 && questionResults.every(Boolean) && !caseHintUsed && !caseLostTrust;

    // --- Prestigio Clínico: clasificar desenlace, ajustar prestigio y nota del supervisor ---
    const outcome = classifyOutcome(currentCase, caseIndex, {
      wasPerfect, caseHintUsed, sindromeWrong, lostTrust: caseLostTrust, revealedSet: revealed,
    });
    const prevRank = getClinicalRank(prestige);
    const newPrestige = Math.max(0, Math.min(100, prestige + PRESTIGE_DELTA[outcome]));
    const newRank = getClinicalRank(newPrestige);
    setPrestige(newPrestige);
    setSupervisorNote(buildSupervisorNote(outcome, CASE_META[caseIndex].name, prevRank, newRank));
    setCaseOutcome(outcome);

    const banner = wasPerfect ? (CASE_OVERRIDE_PHRASES[caseIndex] || pickRandom(PERFECT_CASE_PHRASES)) : null;

    setQuestionResults([]);
    setPendingBanner(banner);
    setReportData(buildReportData(currentCase));
    setReportFilledTypes(new Set());
    setReportUsedBankIdx(new Set());
    setReportSelectedType(null);
    setReportSelectedBankIdx(null);
    setShowReport(true);
  }

  function handleReportPick(side, value) {
    if (side === "blank") {
      if (reportFilledTypes.has(value)) return;
      setReportSelectedType(value);
      if (reportSelectedBankIdx !== null) checkReportMatch(value, reportSelectedBankIdx);
    } else {
      if (reportUsedBankIdx.has(value)) return;
      setReportSelectedBankIdx(value);
      if (reportSelectedType !== null) checkReportMatch(reportSelectedType, value);
    }
  }

  function checkReportMatch(type, bankIdx) {
    const correctAnswer = reportData.blanks.find(b => b.type === type).answer;
    if (reportData.bank[bankIdx] === correctAnswer) {
      setReportFilledTypes(prev => {
        const next = new Set(prev).add(type);
        if (next.size === reportData.blanks.length) { setScore(s => s + REPORT_BONUS); SFX.stamp(); vibrate([30, 40, 60]); }
        else SFX.click();
        return next;
      });
      setReportUsedBankIdx(prev => new Set(prev).add(bankIdx));
      setReportSelectedType(null);
      setReportSelectedBankIdx(null);
    } else {
      SFX.wrong();
      setReportWrongFlash(true);
      setTimeout(() => {
        setReportWrongFlash(false);
        setReportSelectedType(null);
        setReportSelectedBankIdx(null);
      }, 600);
    }
  }

  function proceedToLongitudinal() {
    setShowReport(false);
    setShowLongitudinal(true);
  }

  function finishCase() {
    setShowLongitudinal(false);
    setFunBanner(pendingBanner);
    setScreen("lobby");
  }

  function handleSynthesisSelect(i) {
    if (synthesisShowFeedback) return;
    const opt = SYNTHESIS_CASES[synthesisIndex].options[i];
    setSynthesisSelected(i);
    setSynthesisShowFeedback(true);
    if (opt.correct) setScore(s => s + SYNTHESIS_BONUS);
  }

  function handleSynthesisContinue() {
    setFunBanner(LEVEL_UP_PHRASES[synthesisIndex]);
    setScreen("lobby");
  }

  // --- handlers modo estudio ---
  const [studyCaseIdx, studyQIdx] = STUDY_STEPS[studyPos];
  const currentStudyCase = STUDY_CASES[studyCaseIdx];
  const currentStudyQuestion = currentStudyCase ? currentStudyCase.questions[studyQIdx] : null;

  function handleStudySelect(i) {
    if (studyShowFeedback) return;
    setStudySelected(i);
    setStudyShowFeedback(true);
  }

  function handleStudyNext() {
    setStudySelected(null); setStudyShowFeedback(false);
    if (studyPos < STUDY_TOTAL - 1) setStudyPos(p => p + 1);
    else setScreen("study-end");
  }

  function handleStudyPrev() {
    if (studyPos === 0) return;
    setStudySelected(null); setStudyShowFeedback(false);
    setStudyPos(p => p - 1);
  }

  const pct = Math.round((score / TOTAL_MAX) * 100);
  const rank = getRank(pct);
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const tier = getPerformanceTier(misdiagnosedCases.size, attemptedCases.size);
  const rdocCombined = {
    correct: statsByType.dominio.correct + statsByType.constructo.correct + statsByType.unidad.correct,
    total: statsByType.dominio.total + statsByType.constructo.total + statsByType.unidad.total,
  };

  if (screen === "start") {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 nd-bg-animated flex items-center justify-center p-6">
        <div className="nd-card-in max-w-xl w-full bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-cyan-500/20 p-3 rounded-xl">
              <Brain className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Neuro Detective</h1>
              <p className="text-cyan-400 text-sm font-medium">Edición RDoC</p>
            </div>
            <button onClick={toggleSound} aria-label={soundOn ? "Silenciar sonido" : "Activar sonido"} title={soundOn ? "Silenciar" : "Activar sonido"} className="ml-auto text-slate-400 hover:text-cyan-300 bg-slate-800/60 rounded-lg p-2">
              {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-slate-300 mt-4 leading-relaxed">
            Entrevista a tus pacientes, clasifica la evidencia en la matriz y conecta los casos entre sí —
            desde el síndrome clásico hasta su lugar en la <span className="text-cyan-400">matriz RDoC</span>.
          </p>

          <div className="mt-4 bg-slate-800/40 rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-4 h-4 text-purple-400" />
              <h3 className="text-white font-semibold text-sm">Curso de RDoC</h3>
              <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full ml-auto">Recomendado si es tu primera vez</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Repaso breve de los 6 dominios y las 8 unidades de análisis, con un mini-examen de emparejar al final.
            </p>
            <button
              onClick={() => { setCourseStep(0); setDiffDrillAns({}); setClassifyAns({}); setFlippedCards(new Set()); setContrastAns({}); resetReadinessCheck(); setScreen("course"); }}
              className="mt-3 w-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 active:scale-[0.98] transition-all text-purple-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              Empezar curso <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 bg-slate-800/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gamepad2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-white font-semibold text-sm">Modo Juego</h3>
            </div>
            <ul className="text-slate-400 text-xs space-y-1.5 mb-3">
              <li className="flex gap-1.5"><FolderOpen className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" /> Explora la sala de expedientes y elige tus casos libremente</li>
              <li className="flex gap-1.5"><HelpCircle className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" /> Entrevista al paciente antes de diagnosticar</li>
              <li className="flex gap-1.5"><LayoutGrid className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" /> Clasifica la evidencia en celdas tipo matriz</li>
              <li className="flex gap-1.5"><FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" /> Redacta el informe y revisa el seguimiento a 6 meses</li>
              <li className="flex gap-1.5"><Heart className="w-3.5 h-3.5 text-pink-400 flex-shrink-0 mt-0.5" /> Cada error tiene consecuencias reales para el paciente</li>
              <li className="flex gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" /> Tablero de competencias por habilidad en el informe final</li>
            </ul>
            <p className="text-slate-500 text-xs">
              27 expedientes — clásicos, infantojuveniles, adultos y geriátricos. 💡 Pista por -30 pts. Racha de 3+ aciertos = x1.5 puntos.
            </p>
            <button
              onClick={handleStartGame}
              className="mt-4 w-full bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              Ir a la sala de expedientes <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 bg-slate-800/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-orange-400" />
              <h3 className="text-white font-semibold text-sm">Modo Supervisión</h3>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Encuentra el error oculto en el informe de un colega ficticio. Pone a prueba tu pensamiento crítico, no tu memoria.
            </p>
            <button
              onClick={handleStartSupervision}
              className="mt-3 w-full bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 active:scale-[0.98] transition-all text-orange-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              Comenzar supervisión <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 bg-slate-800/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <h3 className="text-white font-semibold text-sm">Modo Estudio</h3>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              7 casos nuevos — uno por cada dominio RDoC más un caso comparativo (mismo diagnóstico, distinto
              perfil) — distintos a los del modo juego. Sin puntaje ni penalizaciones, navega libremente.
            </p>
            <button
              onClick={handleStartStudy}
              className="mt-3 w-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 active:scale-[0.98] transition-all text-purple-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              Comenzar modo estudio <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Herramienta educativa de práctica para estudiantes y profesionales de neuropsicología. No sustituye la formación clínica supervisada ni los instrumentos oficiales de evaluación — todos los casos son ficticios y de uso didáctico.
            </p>
            <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
              <button onClick={() => setScreen("about")} className="text-cyan-400/90 hover:text-cyan-300 text-[11px] underline underline-offset-2">
                Alcance y limitaciones
              </button>
              <span className="text-slate-700">·</span>
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-400/90 hover:text-cyan-300 text-[11px] underline underline-offset-2">
                Reportar un caso discutible
              </a>
            </div>
            <p className="text-slate-600 text-[11px] mt-1.5 italic">
              Elaborado por Jesús Valenzuela
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "about") {
    const puntos = [
      { t: "Es una herramienta educativa, no diagnóstica", d: "Sirve para practicar el razonamiento clínico con el marco RDoC. No sustituye la evaluación con instrumentos validados ni el juicio clínico supervisado." },
      { t: "Los casos son ficticios y simplificados", d: "Cada expediente aísla un mecanismo para hacerlo didáctico; la clínica real es más ambigua, comórbida y probabilística." },
      { t: "Formato de respuesta única", d: "Se elige la opción más defensible para fines de enseñanza. Puede haber casos con más de una lectura razonable — si detectas uno, repórtalo." },
      { t: "RDoC es un marco de investigación", d: "Complementa, no reemplaza, a los sistemas diagnósticos (DSM/CIE). El objetivo es practicar el pensamiento dimensional y mecanístico." },
      { t: "Contenido aún no validado por consenso", d: "El material fue curado con apoyo de fuentes actuales (ver Referencias en el curso), pero no ha pasado revisión por pares ni validación psicométrica." },
      { t: "Privacidad", d: "No se recopilan datos: el progreso se guarda solo en tu dispositivo (localStorage) y nada se envía a ningún servidor." },
    ];
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
        <div className="nd-card-in max-w-xl w-full bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><ClipboardList className="w-5 h-5 text-cyan-400" /> Alcance y limitaciones</h2>
            <button onClick={goHome} aria-label="Volver al inicio" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-slate-400 text-xs mb-4 leading-relaxed">Transparencia sobre qué es —y qué no es— este recurso. Léelo antes de usarlo con fines formativos.</p>
          <div className="space-y-2.5">
            {puntos.map((p, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg px-3 py-2.5">
                <p className="text-cyan-200 font-bold text-xs">{p.t}</p>
                <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
            <p className="text-cyan-200 text-xs font-bold mb-1">¿Eres especialista? Tu mirada mejora esto</p>
            <p className="text-slate-300 text-[11px] leading-relaxed mb-3">Si defiendes otra respuesta en algún caso, o cambiarías un instrumento o constructo, cuéntamelo — se integrará a la siguiente versión.</p>
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2 px-4 rounded-lg text-sm">
              Reportar un caso discutible <ChevronRight className="w-4 h-4" />
            </a>
          </div>
          <button onClick={goHome} className="mt-5 w-full bg-slate-800 hover:bg-slate-700 transition-all text-slate-300 font-medium py-2.5 rounded-xl text-sm">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (screen === "profile") {
    const ready = playerName.trim() && playerLastName.trim() && playerInstitution.trim();
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/60 border border-cyan-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur">
          <div className="text-center mb-6">
            <div className="bg-cyan-500/20 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Tu expediente profesional</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Antes de entrar al servicio, preséntate. Tu nombre y rango firmarán cada informe que redactes, y tu prestigio evolucionará con tus decisiones clínicas.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nombre</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="Tu nombre"
                  className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Apellido</label>
                <input
                  type="text"
                  value={playerLastName}
                  onChange={e => setPlayerLastName(e.target.value)}
                  placeholder="Tu apellido"
                  className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Especialidad</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {["Neuropsicología", "Psicología Clínica"].map(esp => (
                  <button
                    key={esp}
                    onClick={() => setPlayerSpecialty(esp)}
                    className={`px-3 py-3 rounded-xl border text-xs font-bold transition-all ${
                      playerSpecialty === esp
                        ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
                        : "border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300"
                    }`}
                  >
                    {esp}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Institución</label>
              <input
                type="text"
                value={playerInstitution}
                onChange={e => setPlayerInstitution(e.target.value)}
                placeholder="ej. Hospital General de la Ciudad"
                className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="bg-slate-800/40 rounded-xl p-3 mt-1">
              <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide font-bold">Vista previa de tu firma</p>
              <p className="text-sm text-slate-200">
                {playerName.trim() || "Nombre"} {playerLastName.trim() || "Apellido"}
              </p>
              <p className="text-xs text-cyan-300">
                🌱 Residente en Formación de {playerSpecialty} · {playerInstitution.trim() || "Institución"}
              </p>
            </div>

            <button
              onClick={() => setScreen("lobby")}
              disabled={!ready}
              className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                ready ? "bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-900" : "bg-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              Entrar al servicio <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "course") {
    const slides = [
      {
        title: "¿Qué es RDoC?",
        content: (
          <div>
            <p className="text-slate-300 leading-relaxed mb-3">
              El <span className="text-cyan-400">Research Domain Criteria (RDoC)</span> es un marco creado por el NIMH para estudiar el funcionamiento psicológico de forma <span className="text-cyan-400">dimensional y transdiagnóstica</span> — a través de todo el espectro, desde lo normal hasta lo patológico. A diferencia del DSM (que clasifica por categorías de trastornos), RDoC pregunta: <span className="italic">¿qué dominio funcional está alterado, y en qué nivel biológico se puede medir?</span>
            </p>
            <p className="text-slate-300 leading-relaxed mb-3">
              La idea clave es que cada función es un <span className="text-cyan-300">continuo</span>: no "está presente o ausente", sino que va de <span className="text-cyan-300">hipo‑</span> a <span className="text-cyan-300">hiper‑reactiva</span>. Por ejemplo, la respuesta de amenaza puede ir desde casi nula (insensibilidad) hasta exagerada (pánico).
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <p className="text-amber-200/90 text-xs leading-relaxed">RDoC es un marco <span className="font-bold">de investigación</span>, no un sistema de diagnóstico: <span className="font-bold">complementa</span> al DSM, no lo reemplaza.</p>
            </div>
          </div>
        )
      },
      {
        title: "Los 6 Dominios Funcionales",
        content: (
          <div className="space-y-2">
            {DOMAINS.map(d => (
              <div key={d.key} className="bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-cyan-300 font-bold text-sm">{d.label}</span>
                <p className="text-slate-400 text-xs mt-0.5">{DOMAIN_DESCRIPTIONS[d.key]}</p>
              </div>
            ))}
          </div>
        )
      },
      {
        title: "Las 8 Unidades de Análisis",
        content: (
          <div className="space-y-2">
            {UNITS.map(u => (
              <div key={u.key} className="bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-purple-300 font-bold text-sm">{u.label}</span>
                <p className="text-slate-400 text-xs mt-0.5">{UNIT_DESCRIPTIONS[u.key]}</p>
              </div>
            ))}
          </div>
        )
      },
      {
        title: "La Matriz RDoC",
        content: (
          <div>
            <p className="text-slate-300 leading-relaxed mb-3">
              Los <span className="text-cyan-400">dominios</span> son las columnas y las <span className="text-purple-400">unidades de análisis</span> son las filas. Un mismo fenómeno puede estudiarse en cualquier celda de esa cuadrícula: por ejemplo, el miedo (Valencia Negativa) puede medirse por <span className="text-purple-300">circuitos</span> (amígdala), por <span className="text-purple-300">conducta</span> (evitación) o por <span className="text-purple-300">autorreporte</span> (lo que la persona dice sentir).
            </p>
            <p className="text-slate-300 leading-relaxed">
              Filas y columnas son independientes entre sí — esa es la idea central que vas a aplicar en cada caso.
            </p>
          </div>
        )
      },
      {
        title: "La matriz no es plana: Neurodesarrollo y Ambiente",
        content: (
          <div>
            <p className="text-slate-300 text-sm leading-relaxed mb-3">
              RDoC ya no se limita a la cuadrícula. En su versión actual, cada celda se atraviesa por <span className="text-cyan-400">dos dimensiones transversales</span> que cambian cómo se expresa un mismo constructo:
            </p>
            <div className="space-y-2">
              <div className="bg-slate-800/50 rounded-lg px-3 py-2.5">
                <span className="text-emerald-300 font-bold text-sm">🌱 Neurodesarrollo</span>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">El mismo constructo (p. ej. el control de impulsos) no significa lo mismo a los 4, 16 o 70 años. Hay que leerlo según la <span className="text-slate-200">trayectoria del desarrollo</span>.</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-3 py-2.5">
                <span className="text-sky-300 font-bold text-sm">🌍 Ambiente</span>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">Los constructos <span className="text-slate-200">interactúan con el contexto</span> — estrés, crianza, cultura. Un mismo circuito responde distinto según el ambiente.</p>
              </div>
            </div>
            <p className="text-slate-500 text-[11px] mt-3 italic">Fuente: Morris et al. (2022), revisión de los pilares de RDoC.</p>
          </div>
        )
      },
      {
        title: "Un caso resuelto, capa por capa",
        content: (
          <div>
            <p className="text-slate-300 text-sm leading-relaxed mb-3">
              Cada expediente te pide razonar en <span className="text-cyan-400">5 capas</span>. Así se ven encadenadas en un caso real:
            </p>
            <div className="bg-slate-800/50 rounded-lg px-3 py-2.5 mb-3 text-sm text-slate-300 italic">
              "Tras un infarto cerebral, un paciente habla con fluidez pero sus frases no tienen sentido, y tampoco comprende lo que se le dice."
            </div>
            <div className="space-y-2">
              {[
                { k: "Síndrome", v: "Afasia de Wernicke (lesión temporal posterior izquierda)" },
                { k: "Dominio", v: "Sistemas Cognitivos" },
                { k: "Constructo", v: "Lenguaje (comprensión)" },
                { k: "Unidad", v: "Conducta (habla y comprensión observadas)" },
                { k: "Instrumento", v: "Evaluación formal del lenguaje" },
              ].map(row => (
                <div key={row.k} className="flex gap-2 items-start">
                  <span className="text-cyan-300 font-bold text-xs w-20 flex-shrink-0">{row.k}</span>
                  <span className="text-slate-300 text-xs">{row.v}</span>
                </div>
              ))}
            </div>
          </div>
        )
      },
      {
        title: "Los constructos de cada dominio",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">El dominio dice <span className="text-cyan-300">qué área</span> falla; el constructo dice <span className="text-cyan-300">exactamente qué</span> dentro de ella. Estos son los que preguntan los casos:</p>
            <div className="space-y-2">
              {DOMAINS.map(d => (
                <div key={d.key} className="bg-slate-800/50 rounded-lg px-3 py-2">
                  <span className="text-cyan-300 font-bold text-xs">{d.label}</span>
                  <p className="text-slate-300 text-xs mt-1">{CONSTRUCTS_BY_DOMAIN[d.key].join(" · ")}</p>
                </div>
              ))}
            </div>
          </div>
        )
      },
      {
        title: "Diferenciaciones clave (los errores trampa)",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">Los casos avanzados se deciden en estas distinciones. Aquí está la regla para no caer:</p>
            <div className="space-y-2">
              {KEY_DISTINCTIONS.map((d, i) => (
                <div key={i} className="bg-slate-800/50 rounded-lg px-3 py-2">
                  <p className="text-xs font-bold mb-0.5">
                    <span className="text-emerald-300">{d.a}</span>
                    <span className="text-slate-500"> vs </span>
                    <span className="text-amber-300">{d.b}</span>
                  </p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">{d.rule}</p>
                </div>
              ))}
            </div>
          </div>
        )
      },
      {
        title: "Práctica · ¿Cuál es la diferencia?",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">Lee cada escenario y elige. La regla aparece al instante — sin puntaje, es para aprender.</p>
            <div className="space-y-3">
              {DIFF_DRILL.map((item, i) => {
                const ans = diffDrillAns[i];
                const answered = ans != null;
                const isCorrect = ans === item.correct;
                return (
                  <div key={i} className="bg-slate-800/50 rounded-lg px-3 py-3">
                    <p className="text-slate-200 text-xs mb-2">{item.scenario}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {["a", "b"].map(opt => {
                        const label = opt === "a" ? item.a : item.b;
                        const sel = ans === opt;
                        let cls = "border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800";
                        if (answered) {
                          if (opt === item.correct) cls = "border-emerald-500 bg-emerald-500/10 text-emerald-200";
                          else if (sel) cls = "border-red-500 bg-red-500/10 text-red-200";
                          else cls = "border-slate-800 bg-slate-800/20 text-slate-500";
                        }
                        return (
                          <button key={opt} disabled={answered}
                            onClick={() => setDiffDrillAns(prev => ({ ...prev, [i]: opt }))}
                            className={`px-2 py-2 rounded-lg border text-[11px] font-semibold transition-all ${cls}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {answered && (
                      <p className={`text-[11px] mt-2 leading-relaxed ${isCorrect ? "text-emerald-300" : "text-amber-300"}`}>
                        {isCorrect ? "✓ " : "✗ "}{item.rule}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      },
      {
        title: "Práctica · Clasifica en la matriz",
        content: (
          <div>
            <div className="bg-slate-800/50 rounded-lg px-3 py-2.5 mb-3 text-xs text-slate-300 italic">{CLASSIFY_ACTIVITY.scenario}</div>
            <div className="space-y-3">
              {CLASSIFY_ACTIVITY.steps.map(step => {
                const sel = classifyAns[step.key];
                const answered = sel != null;
                return (
                  <div key={step.key}>
                    <p className="text-cyan-300 font-bold text-xs mb-1.5">{step.label}</p>
                    <div className="space-y-1.5">
                      {step.options.map((opt, oi) => {
                        const isSel = sel === oi;
                        let cls = "border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800";
                        if (answered) {
                          if (opt.correct) cls = "border-emerald-500 bg-emerald-500/10 text-emerald-200";
                          else if (isSel) cls = "border-red-500 bg-red-500/10 text-red-200";
                          else cls = "border-slate-800 bg-slate-800/20 text-slate-500";
                        }
                        return (
                          <button key={oi} disabled={answered}
                            onClick={() => setClassifyAns(prev => ({ ...prev, [step.key]: oi }))}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-all ${cls}`}>
                            {opt.text}
                          </button>
                        );
                      })}
                    </div>
                    {answered && (
                      <p className={`text-[11px] mt-1.5 leading-relaxed ${step.options[sel].correct ? "text-emerald-300" : "text-amber-300"}`}>
                        {step.options[sel].fb}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      },
      {
        title: "Práctica · Dos pacientes, ¿mismo perfil?",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">Dos chicos con el <span className="text-cyan-300">mismo diagnóstico DSM</span>. Lee ambos y decide si comparten el mismo perfil RDoC.</p>
            <div className="inline-block mb-3 text-[11px] font-bold text-purple-300 bg-purple-500/10 px-2.5 py-1 rounded-full">{CONTRAST_VIGNETTES.dx}</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CONTRAST_VIGNETTES.patients.map(pt => (
                <div key={pt.label} className="bg-slate-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-cyan-200 font-bold text-xs mb-1">{pt.label}</p>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{pt.text}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {CONTRAST_VIGNETTES.questions.map(q => {
                const sel = contrastAns[q.key];
                const answered = sel != null;
                return (
                  <div key={q.key}>
                    <p className="text-slate-200 text-xs font-semibold mb-1.5">{q.prompt}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => {
                        const isSel = sel === oi;
                        let cls = "border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800";
                        if (answered) {
                          if (opt.correct) cls = "border-emerald-500 bg-emerald-500/10 text-emerald-200";
                          else if (isSel) cls = "border-red-500 bg-red-500/10 text-red-200";
                          else cls = "border-slate-800 bg-slate-800/20 text-slate-500";
                        }
                        return (
                          <button key={oi} disabled={answered}
                            onClick={() => setContrastAns(prev => ({ ...prev, [q.key]: oi }))}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-all ${cls}`}>
                            {opt.text}
                          </button>
                        );
                      })}
                    </div>
                    {answered && (
                      <p className={`text-[11px] mt-1.5 leading-relaxed ${q.options[sel].correct ? "text-emerald-300" : "text-amber-300"}`}>
                        {q.options[sel].fb}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      },
      {
        title: "Repaso · Tarjetas",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">Toca cada tarjeta para revelar la definición. Repaso activo antes del examen.</p>
            <div className="grid grid-cols-2 gap-2">
              {FLASHCARDS.map((card, i) => {
                const flipped = flippedCards.has(i);
                return (
                  <button key={i}
                    onClick={() => setFlippedCards(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    className={`min-h-[78px] rounded-lg border px-3 py-2 text-left transition-all ${flipped ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-700 bg-slate-800/60 hover:bg-slate-800"}`}>
                    {flipped
                      ? <span className="text-slate-300 text-[11px] leading-snug">{card.back}</span>
                      : <span className="text-cyan-200 text-xs font-bold">{card.front}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )
      },
      {
        title: "Referencias",
        content: (
          <div>
            <p className="text-slate-400 text-xs mb-3">Fuentes consultadas para el contenido de este curso (estilo Vancouver):</p>
            <ol className="space-y-2">
              {REFERENCES.map((ref, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                  <span className="text-cyan-400 font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{ref}</span>
                </li>
              ))}
            </ol>
          </div>
        )
      },
    ];
    const slide = slides[courseStep];
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-cyan-300 bg-cyan-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Curso de RDoC
            </span>
            <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs">
              <X className="w-3.5 h-3.5" /> Salir
            </button>
          </div>
          <div className="flex gap-1.5 mb-4">
            {slides.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < courseStep ? "bg-cyan-400" : i === courseStep ? "bg-cyan-400/50" : "bg-slate-700"
              }`} />
            ))}
          </div>
          <div key={courseStep} className="nd-page-in bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur min-h-[280px]">
            <h2 className="text-xl font-bold text-white mb-4">{slide.title}</h2>
            {slide.content}
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => setCourseStep(s => Math.max(0, s - 1))}
              disabled={courseStep === 0}
              className={`px-4 py-2.5 rounded-lg flex items-center gap-1 text-sm font-medium transition-all ${
                courseStep === 0 ? "text-slate-600 bg-slate-800/30 cursor-not-allowed" : "text-slate-300 bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            {courseStep < slides.length - 1 ? (
              <button
                onClick={() => setCourseStep(s => s + 1)}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => { resetReadinessCheck(); setScreen("exam"); }}
                className="flex-1 bg-purple-500 hover:bg-purple-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
              >
                Check de preparación <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "exam") {
    const allAnswered = READINESS_CHECK.questions.every(q => checkAns[q.key] != null);
    const score = READINESS_CHECK.questions.reduce((acc, q) => {
      const sel = checkAns[q.key];
      return acc + (sel != null && q.options[sel].correct ? 1 : 0);
    }, 0);
    const total = READINESS_CHECK.questions.length;
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-purple-300 bg-purple-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Check de preparación
            </span>
            <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs">
              <X className="w-3.5 h-3.5" /> Salir
            </button>
          </div>

          {checkSubmitted && (
            <div className={`mb-4 rounded-2xl border p-5 text-center ${
              score === total ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
            }`}>
              <div className="text-4xl mb-2">{score === total ? "🎓" : "📋"}</div>
              <h2 className="text-lg font-bold text-white">{score}/{total} capas correctas</h2>
              <p className="text-slate-300 text-sm mt-1">
                {score === total
                  ? "Encadenaste las tres capas en un caso nuevo. Estás listo para los expedientes reales."
                  : "Revisa abajo las capas que se te escaparon — luego pasa a los casos, donde cada error trae su explicación."}
              </p>
            </div>
          )}

          <div className="bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
            {!checkSubmitted && (
              <p className="text-slate-400 text-xs mb-3">Lee el caso y resuelve las <span className="text-purple-300">3 capas</span> de corrido. A diferencia de la práctica, aquí el resultado aparece al final — como en un caso real.</p>
            )}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2.5 mb-4 text-sm text-slate-300 italic">{READINESS_CHECK.scenario}</div>

            <div className="space-y-4">
              {READINESS_CHECK.questions.map(q => {
                const sel = checkAns[q.key];
                return (
                  <div key={q.key}>
                    <p className="text-cyan-300 font-bold text-xs mb-1.5">{q.label}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => {
                        const isSel = sel === oi;
                        let cls = "border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-200";
                        if (checkSubmitted) {
                          if (opt.correct) cls = "border-emerald-500 bg-emerald-500/10 text-emerald-200";
                          else if (isSel) cls = "border-red-500 bg-red-500/10 text-red-200";
                          else cls = "border-slate-800 bg-slate-800/20 text-slate-500";
                        } else if (isSel) {
                          cls = "border-cyan-400 bg-cyan-500/10 text-cyan-200";
                        }
                        return (
                          <button
                            key={oi}
                            disabled={checkSubmitted}
                            onClick={() => setCheckAns(prev => ({ ...prev, [q.key]: oi }))}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all flex items-center justify-between gap-2 ${cls}`}
                          >
                            <span>{opt.text}</span>
                            {checkSubmitted && opt.correct && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                            {checkSubmitted && isSel && !opt.correct && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    {checkSubmitted && (
                      <p className="text-slate-400 text-[11px] mt-1.5 leading-relaxed">{q.explain}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {!checkSubmitted ? (
              <button
                onClick={() => setCheckSubmitted(true)}
                disabled={!allAnswered}
                className={`mt-5 w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-all ${
                  allAnswered ? "bg-purple-500 hover:bg-purple-400 active:scale-[0.98] text-slate-900" : "bg-slate-800 text-slate-600 cursor-not-allowed"
                }`}
              >
                {allAnswered ? "Ver mi resultado" : "Responde las 3 capas"} <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleStartGame}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
                >
                  Ir a la sala de expedientes <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={resetReadinessCheck}
                  className="px-4 bg-slate-800 hover:bg-slate-700 transition-all text-slate-300 font-medium py-3 rounded-xl text-sm flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" /> Reintentar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "expert") {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-yellow-300 bg-yellow-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              🏆 Modo Experto · Análisis de caso real
            </span>
            <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /> Salir</button>
          </div>

          {!expertStarted ? (
            <div className="bg-slate-900/60 border border-yellow-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
              <div className="text-center mb-5">
                <div className="text-4xl mb-2">🔬</div>
                <h2 className="text-white font-bold text-lg">Revisión por pares de un caso real</h2>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  Aquí no se te evalúa: trabajas <span className="text-yellow-300">de colega a colega</span>. Trae un estudio de caso real, escribe tu propia formulación RDoC, y un revisor par la someterá a crítica — qué sostienes bien, dónde la evidencia no te respalda, qué alternativas considerar.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">DOI del artículo</label>
                  <input
                    type="text"
                    value={expertDoi}
                    onChange={e => setExpertDoi(e.target.value)}
                    placeholder="ej. 10.1016/j.neuropsychologia.2020.107550"
                    className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-yellow-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Texto del caso (opcional pero recomendado si el artículo es de pago)</label>
                  <textarea
                    value={expertText}
                    onChange={e => setExpertText(e.target.value)}
                    placeholder="Pega aquí el abstract o las secciones clave del caso clínico..."
                    rows={4}
                    className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-yellow-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-yellow-300 uppercase tracking-wide">Tu formulación RDoC (obligatoria)</label>
                  <textarea
                    value={expertFormulation}
                    onChange={e => setExpertFormulation(e.target.value)}
                    placeholder="Antes de que el revisor opine, comprométete con tu lectura: síndrome, dominio, constructo, unidad de análisis e instrumento — y por qué. El revisor cuestionará tu razonamiento, no te dará la respuesta."
                    rows={5}
                    className="mt-1.5 w-full bg-slate-800/60 border border-yellow-500/30 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-yellow-500/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-yellow-300 uppercase tracking-wide">API key de Anthropic (se guarda solo en tu navegador)</label>
                  <input
                    type="password"
                    value={expertApiKey}
                    onChange={e => updateApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="mt-1.5 w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-yellow-500/50"
                  />
                  <p className="text-slate-600 text-[11px] mt-1 leading-relaxed">
                    Este modo consulta la API de Anthropic desde tu navegador, así que necesita tu propia clave. Se almacena localmente (localStorage) y nunca se envía a ningún otro sitio. Obtén una en console.anthropic.com.
                  </p>
                </div>

                {expertError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                    {expertError}
                  </div>
                )}

                <button
                  onClick={analyzeExpertCase}
                  disabled={expertLoading || (!expertDoi.trim() && !expertText.trim()) || !expertFormulation.trim()}
                  className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                    expertLoading || (!expertDoi.trim() && !expertText.trim()) || !expertFormulation.trim()
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-yellow-400 hover:bg-yellow-300 active:scale-[0.98] text-slate-900"
                  }`}
                >
                  {expertLoading ? "🔍 Buscando y revisando..." : "Someter a revisión por pares"}
                  {!expertLoading && <ChevronRight className="w-4 h-4" />}
                </button>

                <p className="text-slate-600 text-xs text-center">
                  Solo estudios de caso clínico. Cuando quieras subir de nivel, pídele al revisor "profundizar" para pasar a criticar la metodología del propio estudio desde RDoC.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-yellow-500/20 rounded-2xl shadow-2xl backdrop-blur flex flex-col" style={{ maxHeight: "75vh" }}>
              <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-yellow-300 font-bold">{expertDoi || "Caso pegado"}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { if (!expertLoading) { setExpertInput("Quiero profundizar: pasemos a criticar la metodología del propio estudio desde RDoC."); } }}
                    disabled={expertLoading}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                      expertLoading ? "border-slate-800 text-slate-600 cursor-not-allowed" : "border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10"
                    }`}
                  >
                    ⬆ Profundizar (crítica metodológica)
                  </button>
                  <button
                    onClick={() => { setExpertStarted(false); setExpertMessages([]); setExpertDoi(""); setExpertText(""); setExpertFormulation(""); setExpertError(null); }}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Nuevo caso
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {expertMessages.map((m, i) => {
                  const review = m.role === "assistant" ? parseReview(m.content) : null;
                  if (review) {
                    return (
                      <div key={i} className="flex justify-start">
                        <PeerReviewCard sections={review} />
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-cyan-500/20 text-cyan-100 border border-cyan-500/20"
                          : "bg-slate-800/60 text-slate-200 border border-slate-700"
                      }`}>
                        {m.role === "user" && i === 0 ? (expertFormulation.trim() || m.content) : m.content}
                      </div>
                    </div>
                  );
                })}
                {expertLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/60 border border-slate-700 px-4 py-3 rounded-2xl text-slate-400 text-sm">
                      🧠 Analizando...
                    </div>
                  </div>
                )}
                {expertError && (
                  <div className="text-red-300 text-sm text-center">{expertError}</div>
                )}
              </div>

              <div className="p-4 border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  value={expertInput}
                  onChange={e => setExpertInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendExpertMessage()}
                  placeholder="Haz una pregunta sobre el caso..."
                  disabled={expertLoading}
                  className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-yellow-500/50 disabled:opacity-50"
                />
                <button
                  onClick={sendExpertMessage}
                  disabled={expertLoading || !expertInput.trim()}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    expertLoading || !expertInput.trim()
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-yellow-400 hover:bg-yellow-300 text-slate-900"
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "supervision") {
    const supCase = SUPERVISION_CASES[supervisionPos];

    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-orange-300 bg-orange-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Modo Supervisión
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">Caso {supervisionPos + 1}/{SUPERVISION_CASES.length}</span>
              <span className="flex items-center gap-1 text-amber-400 font-bold"><Sparkles className="w-4 h-4" /> {supervisionScore} pts</span>
              <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <p style={{ color: "#94a3b8", fontSize: "12px", fontStyle: "italic", marginBottom: "12px" }}>{supCase.blurb}</p>
          <p style={{ color: "#fdba74", fontSize: "12px", fontWeight: "bold", marginBottom: "10px" }}>Informe del colega — toca la frase con el error clínico:</p>
          <SupervisionReport
            supCase={supCase}
            selectedId={supervisionSelected}
            solved={supervisionSolved}
            onPick={pickSupervisionSegment}
          />

          {supervisionSelected && (
            <div style={{
              padding: "16px", borderRadius: "12px", marginTop: "8px",
              border: supervisionSolved ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(239,68,68,0.4)",
              backgroundColor: supervisionSolved ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
            }}>
              <p style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px", color: supervisionSolved ? "#6ee7b7" : "#fca5a5" }}>
                {supervisionSolved ? `¡Error encontrado! +${SUPERVISION_BONUS} pts` : "Esa frase es correcta..."}
              </p>
              <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: "1.6" }}>
                {supervisionSolved ? supCase.explanationCorrect : SUPERVISION_WRONG_FEEDBACK}
              </p>
              {supervisionSolved && (
                <button
                  onClick={nextSupervisionCase}
                  className="mt-3 w-full bg-orange-500 hover:bg-orange-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  {supervisionPos < SUPERVISION_CASES.length - 1 ? "Siguiente caso" : "Terminar"} <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "supervision-end") {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/60 border border-orange-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur text-center">
          <div className="text-5xl mb-3">🕵️</div>
          <h2 className="text-xl font-bold text-white">Supervisión completada</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Encontraste {SUPERVISION_CASES.length} errores escondidos en informes ajenos — {supervisionScore} puntos de supervisión. Esta habilidad de detectar errores es tan valiosa como diagnosticar bien tú mismo.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleStartSupervision}
              className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 transition-all text-orange-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Repasar de nuevo
            </button>
            <button onClick={goHome} className="px-5 bg-slate-800 hover:bg-slate-700 transition-all text-slate-300 font-medium py-3 rounded-xl">Inicio</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "lobby") {
    const groupOrder = ["Casos RDoC", "Infantojuvenil", "Adultos", "Geriátrico"];
    const groups = { "Casos RDoC": [], "Infantojuvenil": [], "Adultos": [], "Geriátrico": [] };
    CASES.forEach((c, i) => groups[c.grupo || "Casos RDoC"].push(i));

    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-cyan-300 bg-cyan-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" /> Sala de Expedientes
            </span>
            <div className="flex items-center gap-3 text-sm">
              {bestScore > 0 && <span className="text-slate-400 text-xs" title="Mejor puntaje guardado">🏅 Récord: {bestScore}</span>}
              <span className="flex items-center gap-1 text-amber-400 font-bold"><Sparkles className="w-4 h-4" /> {score} pts</span>
              <button onClick={toggleSound} aria-label={soundOn ? "Silenciar sonido" : "Activar sonido"} className="text-slate-500 hover:text-slate-300">
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><Home className="w-3.5 h-3.5" /> Inicio</button>
            </div>
          </div>

          <FunBanner text={funBanner} />

          {supervisorNote && (
            <div className="mb-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-base flex-shrink-0">🗒️</span>
              <p className="text-indigo-100 text-sm leading-relaxed">{supervisorNote}</p>
            </div>
          )}

          {playerName.trim() && (() => {
            const cr = getClinicalRank(prestige);
            return (
              <div className="mb-4 bg-slate-900/60 border border-cyan-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-white font-bold text-sm">{playerName} {playerLastName}</p>
                    <p className="text-cyan-300 text-xs">{cr.emoji} {cr.label} de {playerSpecialty}</p>
                    <p className="text-slate-500 text-[11px]">{playerInstitution}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Prestigio clínico</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-28 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${prestige >= 70 ? "bg-emerald-400" : prestige >= 45 ? "bg-cyan-400" : prestige >= 20 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${prestige}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-300 font-mono w-7">{prestige}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
            <p className="text-slate-300 text-sm">
              <span className="font-bold text-white">{attemptedCases.size}</span>/{CASES.length} expedientes atendidos
            </p>
            <button
              onClick={() => setScreen("report")}
              disabled={attemptedCases.size < 3}
              className={`text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
                attemptedCases.size < 3 ? "bg-slate-800/50 text-slate-600 cursor-not-allowed" : "bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30"
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" /> Ver informe de desempeño {attemptedCases.size < 3 && "(mín. 3 casos)"}
            </button>
          </div>

          {groupOrder.map(g => groups[g].length > 0 && (
            <section key={g} className="mb-6">
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                {g === "Casos RDoC" && "🧠"} {g === "Infantojuvenil" && "👶"} {g === "Adultos" && "🧑"} {g === "Geriátrico" && "👴"} {g}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {groups[g].map((i, idx) => {
                  const meta = CASE_META[i];
                  const c = CASES[i];
                  const done = attemptedCases.has(i);
                  const bad = misdiagnosedCases.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => openCase(i)}
                      style={{ animationDelay: `${Math.min(idx * 45, 400)}ms` }}
                      className={`nd-rise text-left p-3 rounded-xl border transition-all hover:scale-[1.02] ${
                        done ? (bad ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5") : "border-slate-700 bg-slate-800/50 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono text-slate-500">#{String(i + 1).padStart(2, "0")}</span>
                        {done && (bad ? <XCircle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />)}
                      </div>
                      <p className="text-white font-bold text-sm">{meta.name}, {meta.age} años</p>
                      <p className="text-slate-400 text-xs mt-1 leading-snug">{meta.motivo}</p>
                      <div className="mt-2"><DifficultyDots n={c.difficulty} /></div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="mb-6">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-emerald-400" /> Casos de Síntesis
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SYNTHESIS_CASES.map((s, i) => {
                const unlocked = s.requires.every(idx => attemptedCases.has(idx));
                return (
                  <button
                    key={i}
                    onClick={() => unlocked && openSynthesis(i)}
                    disabled={!unlocked}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      unlocked ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10" : "border-slate-800 bg-slate-800/30 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono text-slate-500">SÍNTESIS {i + 1}</span>
                      {unlocked ? <GitCompare className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-slate-600" />}
                    </div>
                    <p className="text-slate-300 text-xs leading-snug">{unlocked ? `Compara: ${s.caseALabel.split("—")[1]?.trim()} vs. ${s.caseBLabel.split("—")[1]?.trim()}` : `Resuelve los casos #${s.requires[0] + 1} y #${s.requires[1] + 1} para desbloquear`}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {(() => {
            const allDone = attemptedCases.size >= CASES.length;
            return (
              <section className="mb-6">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  🏆 Modo Experto
                  {!allDone && <span className="text-[10px] text-slate-500 font-normal">· Completa los {CASES.length} casos para desbloquear</span>}
                </h3>
                <button
                  onClick={() => allDone && setScreen("expert")}
                  disabled={!allDone}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    allDone
                      ? "border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10"
                      : "border-slate-800 bg-slate-800/30 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {allDone ? <span className="text-xl">🔬</span> : <Lock className="w-4 h-4 text-slate-600" />}
                      <span className={`text-sm font-bold ${allDone ? "text-yellow-300" : "text-slate-600"}`}>
                        Revisión por pares de un caso real
                      </span>
                    </div>
                    {allDone && <ChevronRight className="w-4 h-4 text-yellow-400" />}
                  </div>
                  <p className={`text-xs leading-relaxed ${allDone ? "text-slate-300" : "text-slate-600"}`}>
                    Trae un estudio de caso real y tu propia formulación RDoC. Un revisor par la somete a crítica de colega a colega — y, si quieres, suben a criticar la metodología del estudio. Sin respuestas servidas: aquí ya eres tú quien sostiene un criterio.
                  </p>
                  {!allDone && (
                    <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-500/40 rounded-full"
                        style={{ width: `${(attemptedCases.size / CASES.length) * 100}%` }}
                      />
                    </div>
                  )}
                  {!allDone && (
                    <p className="text-[10px] text-slate-600 mt-1">{attemptedCases.size}/{CASES.length} casos completados</p>
                  )}
                </button>
              </section>
            );
          })()}
        </div>
      </div>
    );
  }

  if (screen === "report") {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6">
        <div className="max-w-2xl mx-auto bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur">
          {tier && (
            <div className="text-center mb-6">
              <div className="text-5xl mb-2">{tier.emoji}</div>
              <h2 className="text-xl font-bold text-white">{tier.title}</h2>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">{tier.message}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-slate-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{score}</div>
              <div className="text-xs text-slate-400 mt-1">Puntaje ({pct}%)</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{accuracy}%</div>
              <div className="text-xs text-slate-400 mt-1">Precisión</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{discoveredCells.size}/{MAX_CELLS}</div>
              <div className="text-xs text-slate-400 mt-1">Celdas RDoC</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-orange-400" />
              <h3 className="text-white font-semibold text-sm">Tablero de competencias</h3>
            </div>
            <div className="bg-slate-800/40 rounded-xl p-4">
              <CompetencyBar label="Diagnóstico diferencial" obj={statsByType.sindrome} />
              <CompetencyBar label="Clasificación RDoC (dominio/constructo/unidad)" obj={rdocCombined} />
              <CompetencyBar label="Selección de instrumentos" obj={statsByType.instrumento} />
              <CompetencyBar label="Dimensión transversal (neurodesarrollo/ambiente)" obj={statsByType.contexto} />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-orange-400" />
              <h3 className="text-white font-semibold text-sm">Historial clínico ({attemptedCases.size} atendidos)</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...attemptedCases].sort((a, b) => a - b).map(i => {
                const bad = misdiagnosedCases.has(i);
                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      bad ? "bg-red-500/20 text-red-300 border border-red-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    }`}
                    title={`${CASE_META[i].name}: ${bad ? "diagnóstico erróneo / mal pronóstico" : "bien diagnosticado"}`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <LayoutGrid className="w-4 h-4 text-purple-400" />
              <h3 className="text-white font-semibold text-sm">Tu Matriz RDoC personal</h3>
            </div>
            <div className="overflow-x-auto">
              <div className="grid gap-1" style={{ gridTemplateColumns: `90px repeat(${DOMAINS.length}, 1fr)`, minWidth: "560px" }}>
                <div></div>
                {DOMAINS.map(d => (
                  <div key={d.key} className="text-[10px] text-slate-400 text-center font-medium px-1 pb-1" title={d.label}>{d.key}</div>
                ))}
                {UNITS.map(u => (
                  <Fragment key={u.key}>
                    <div className="text-[10px] text-slate-400 pr-2 flex items-center justify-end">{u.label}</div>
                    {DOMAINS.map(d => {
                      const lit = discoveredCells.has(`${d.key}-${u.key}`);
                      return <div key={d.key + u.key} className={`aspect-square rounded ${lit ? "bg-cyan-400 shadow-lg shadow-cyan-500/50" : "bg-slate-800/80"}`} title={`${d.label} × ${u.label}`} />;
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {tier?.action === "course" ? (
              <button
                onClick={() => { setCourseStep(0); setDiffDrillAns({}); setClassifyAns({}); setFlippedCards(new Set()); setContrastAns({}); resetReadinessCheck(); setScreen("course"); }}
                className="flex-1 bg-purple-500 hover:bg-purple-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <GraduationCap className="w-4 h-4" /> Ir al curso introductorio
              </button>
            ) : (
              <button
                onClick={goLobby}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" /> Volver a la sala de expedientes
              </button>
            )}
            <button onClick={goHome} className="px-5 bg-slate-800 hover:bg-slate-700 transition-all text-slate-300 font-medium py-3 rounded-xl">Inicio</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "study-end") {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/60 border border-purple-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur text-center">
          <div className="text-5xl mb-3">🎓</div>
          <h2 className="text-xl font-bold text-white">Modo estudio completado</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Repasaste los 6 dominios de la matriz RDoC con casos nuevos. Cuando te sientas listo,
            prueba el modo juego para ver cuánto retuviste — ahí sí cuenta el puntaje.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleStartStudy}
              className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 transition-all text-purple-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Repasar de nuevo
            </button>
            <button onClick={goHome} className="px-5 bg-slate-800 hover:bg-slate-700 transition-all text-slate-300 font-medium py-3 rounded-xl">Inicio</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "study") {
    const selectedStudyOption = studySelected !== null ? currentStudyQuestion.options[studySelected] : null;
    const domainLabel = DOMAINS.find(d => d.key === currentStudyCase.domainKey)?.label;

    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-purple-300 bg-purple-500/15 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Modo Estudio · sin puntaje
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">Caso {studyCaseIdx + 1}/{STUDY_CASES.length}</span>
              <button onClick={goHome} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /> Salir</button>
            </div>
          </div>

          <div className="flex gap-1.5 mb-4">
            {currentStudyCase.questions.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < studyQIdx ? "bg-purple-400" : i === studyQIdx ? "bg-purple-400/50" : "bg-slate-700"
              }`} />
            ))}
          </div>

          <div key={studyPos} className="nd-page-in bg-slate-900/60 border border-purple-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-mono text-slate-500">CASO DE ESTUDIO #{String(studyCaseIdx + 1).padStart(2, "0")}</span>
              <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full ml-auto">{currentStudyCase.comparative ? "Caso comparativo" : `Enfocado en: ${domainLabel}`}</span>
            </div>
            {currentStudyCase.comparative ? (
              <div className="mb-5">
                <div className="inline-block mb-3 text-[11px] font-bold text-purple-300 bg-purple-500/10 px-2.5 py-1 rounded-full">{currentStudyCase.dx}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentStudyCase.patients.map(pt => (
                    <div key={pt.label} className="bg-slate-800/50 rounded-lg px-3 py-2.5 border border-slate-700/60">
                      <p className="text-cyan-200 font-bold text-xs mb-1">{pt.label}</p>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{pt.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-slate-200 leading-relaxed mb-5">{currentStudyCase.vignette}</p>
            )}

            <span className="text-[11px] font-bold uppercase tracking-wide text-purple-400">{currentStudyQuestion.label || QTYPE_LABEL[currentStudyQuestion.type]}</span>
            <p className="text-white font-medium mt-1 mb-4">{currentStudyQuestion.prompt}</p>

            <div className="space-y-2">
              {currentStudyQuestion.options.map((opt, i) => {
                let stateClasses = "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600";
                if (studyShowFeedback) {
                  if (opt.correct) stateClasses = "border-emerald-500 bg-emerald-500/10";
                  else if (i === studySelected) stateClasses = "border-red-500 bg-red-500/10";
                  else stateClasses = "border-slate-800 bg-slate-800/20 opacity-50";
                }
                return (
                  <button key={i} onClick={() => handleStudySelect(i)} disabled={studyShowFeedback} className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm text-slate-100 flex items-center justify-between gap-2 ${stateClasses}`}>
                    <span>{opt.text}</span>
                    {studyShowFeedback && opt.correct && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    {studyShowFeedback && i === studySelected && !opt.correct && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {studyShowFeedback && (
              <div className={`mt-4 p-4 rounded-xl border ${selectedStudyOption.correct ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
                <p className={`text-sm font-semibold mb-1 ${selectedStudyOption.correct ? "text-emerald-300" : "text-red-300"}`}>{selectedStudyOption.correct ? "¡Correcto!" : "No del todo..."}</p>
                <p className="text-slate-300 text-sm leading-relaxed">{selectedStudyOption.feedback}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleStudyPrev} disabled={studyPos === 0} className={`px-4 py-2.5 rounded-lg flex items-center justify-center gap-1 text-sm font-medium transition-all ${studyPos === 0 ? "text-slate-600 bg-slate-800/30 cursor-not-allowed" : "text-slate-300 bg-slate-800 hover:bg-slate-700"}`}>
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              {studyShowFeedback && (
                <button onClick={handleStudyNext} className="flex-1 bg-purple-500 hover:bg-purple-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
                  {studyPos < STUDY_TOTAL - 1 ? "Siguiente" : "Terminar"} <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "synthesis") {
    const synth = SYNTHESIS_CASES[synthesisIndex];
    const selOpt = synthesisSelected !== null ? synth.options[synthesisSelected] : null;
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5" /> Caso de síntesis
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">+{SYNTHESIS_BONUS} pts si aciertas</span>
              <button onClick={goLobby} aria-label="Salir al lobby" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
            <p className="text-slate-400 text-xs mb-4">Detente un momento y compara dos casos que ya resolviste:</p>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-800/50 rounded-xl p-3"><p className="text-cyan-300 text-xs font-bold">{synth.caseALabel}</p></div>
              <div className="bg-slate-800/50 rounded-xl p-3"><p className="text-cyan-300 text-xs font-bold">{synth.caseBLabel}</p></div>
            </div>

            <p className="text-white font-medium mb-4">{synth.prompt}</p>

            <div className="space-y-2">
              {synth.options.map((opt, i) => {
                let stateClasses = "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600";
                if (synthesisShowFeedback) {
                  if (opt.correct) stateClasses = "border-emerald-500 bg-emerald-500/10";
                  else if (i === synthesisSelected) stateClasses = "border-red-500 bg-red-500/10";
                  else stateClasses = "border-slate-800 bg-slate-800/20 opacity-50";
                }
                return (
                  <button key={i} onClick={() => handleSynthesisSelect(i)} disabled={synthesisShowFeedback} className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm text-slate-100 flex items-center justify-between gap-2 ${stateClasses}`}>
                    <span>{opt.text}</span>
                    {synthesisShowFeedback && opt.correct && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    {synthesisShowFeedback && i === synthesisSelected && !opt.correct && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {synthesisShowFeedback && (
              <div className={`mt-4 p-4 rounded-xl border ${selOpt.correct ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
                <p className={`text-sm font-semibold mb-1 ${selOpt.correct ? "text-emerald-300" : "text-red-300"}`}>{selOpt.correct ? `¡Correcto! +${SYNTHESIS_BONUS} pts` : "No del todo..."}</p>
                <p className="text-slate-300 text-sm leading-relaxed">{selOpt.feedback}</p>
                <button onClick={handleSynthesisContinue} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm">
                  Volver a la sala de expedientes <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // screen === "playing" — fase de entrevista
  if (!interviewDone && !showReport && !showLongitudinal) {
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-full">
              {LEVEL_LABEL[currentCase.level]}
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-amber-400 font-bold"><Sparkles className="w-4 h-4" /> {score} pts</span>
              <button onClick={goLobby} aria-label="Salir al lobby" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <FunBanner text={funBanner} />

          <div className="bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono text-slate-500">{CASE_META[caseIndex].name} · EXPEDIENTE #{String(caseIndex + 1).padStart(2, "0")} · ENTREVISTA</span>
              </div>
              <div className="flex items-center gap-3">
                <TrustMeter n={trust} />
                <DifficultyDots n={currentCase.difficulty} />
              </div>
            </div>
            <p className="text-slate-300 italic leading-relaxed mb-5">{currentCase.intro}</p>

            <p className="text-white font-medium mb-3 text-sm">Elige al menos 2 preguntas para reunir información antes de diagnosticar:</p>
            <div className="space-y-2">
              {currentCase.interview.map((item, i) => {
                const isRevealed = revealed.has(i);
                return (
                  <div key={i}>
                    <button
                      onClick={() => { SFX.click(); setRevealed(prev => new Set(prev).add(i)); }}
                      disabled={isRevealed}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm flex items-center justify-between gap-2 ${
                        isRevealed ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100" : "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 text-slate-100"
                      }`}
                    >
                      <span>{item.q}</span>
                      {isRevealed ? <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" /> : <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                    </button>
                    {isRevealed && (
                      <div className="nd-page-in mt-1.5 ml-2 pl-3 border-l-2 border-cyan-500/30 text-slate-300 text-sm py-1"><Typewriter text={item.reveal} /></div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => revealed.size >= 2 && setInterviewDone(true)}
              disabled={revealed.size < 2}
              className={`mt-5 w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                revealed.size >= 2 ? "bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-900" : "bg-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              Diagnosticar ({revealed.size}/3 pistas reunidas) <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }
  // screen === "playing" — fase de redacción del informe
  if (showReport) {
    const { templateParts, blanks, bank } = reportData;
    const allFilled = reportFilledTypes.size === blanks.length;
    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Redacción del informe
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-amber-400 font-bold"><Sparkles className="w-4 h-4" /> {score} pts</span>
              <button onClick={goLobby} aria-label="Salir al lobby" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono text-slate-500">{CASE_META[caseIndex].name} · COMPLETA EL INFORME</span>
            </div>

            <p className="text-white text-sm leading-loose mb-5">
              {templateParts.map((part, i) => {
                if (part.startsWith("{") && part.endsWith("}")) {
                  const type = part.slice(1, -1);
                  const filled = reportFilledTypes.has(type);
                  const answer = blanks.find(b => b.type === type).answer;
                  const selected = reportSelectedType === type;
                  return (
                    <button
                      key={i}
                      onClick={() => handleReportPick("blank", type)}
                      disabled={filled}
                      className={`inline px-2 py-1 mx-0.5 rounded-md border text-xs font-bold align-middle transition-all ${
                        filled ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" :
                        selected ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" :
                        "border-dashed border-slate-600 bg-slate-800/50 text-slate-500"
                      }`}
                    >
                      {filled ? answer : `___ (${QTYPE_LABEL[type]})`}
                    </button>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </p>
            {!allFilled ? (
              <>
                <p className="text-xs text-purple-300 mb-2 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Toca un espacio en blanco y luego la frase correcta:</p>
                <div className="flex flex-wrap gap-2">
                  {bank.map((text, idx) => {
                    const used = reportUsedBankIdx.has(idx);
                    if (used) return null;
                    const selected = reportSelectedBankIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleReportPick("bank", idx)}
                        className={`px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                          selected && reportWrongFlash ? "border-red-500 bg-red-500/10 text-red-200" :
                          selected ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" :
                          "border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-200"
                        }`}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="relative mt-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center overflow-hidden">
                <span className="nd-stamp pointer-events-none absolute top-2 right-2 text-emerald-400/70 border-2 border-emerald-400/60 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">Completado</span>
                <p className="text-emerald-300 font-bold text-sm">✅ Informe completado (+{REPORT_BONUS} pts)</p>
                {playerName.trim() && (() => {
                  const cr = getClinicalRank(prestige);
                  return (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20 text-left">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold mb-1">Firma del responsable</p>
                      <p className="text-sm text-slate-100 font-semibold">{playerName} {playerLastName}</p>
                      <p className="text-xs text-cyan-300">{cr.emoji} {cr.label} de {playerSpecialty}</p>
                      <p className="text-[11px] text-slate-500">{playerInstitution}</p>
                    </div>
                  );
                })()}
                <button
                  onClick={proceedToLongitudinal}
                  className="mt-3 w-full bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                  Ver seguimiento a 6 meses <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  // screen === "playing" — fase de seguimiento longitudinal
  if (showLongitudinal) {
    const bad = misdiagnosedCases.has(caseIndex);
    const sindromeAnswer = currentCase.questions.find(q => q.type === "sindrome").options.find(o => o.correct).text;
    const cm = CASE_META[caseIndex];
    const isGoodOutcome = caseOutcome === "excelente" || caseOutcome === "bueno";

    let headerEmoji = "🟢", headerText = "", bodyText = "";
    if (caseOutcome === "excelente") {
      headerEmoji = "🌟";
      headerText = `Seis meses después — ${cm.name}`;
      bodyText = `Tu diagnóstico certero de ${sindromeAnswer}, alcanzado con un manejo impecable, permitió iniciar a tiempo el abordaje correcto. ${cm.name} ha recuperado de forma notable su funcionalidad y su familia trajo una nota de agradecimiento para ti personalmente. Es el tipo de desenlace que recuerda por qué este trabajo importa.`;
    } else if (caseOutcome === "bueno") {
      headerEmoji = "🟢";
      headerText = `Seis meses después — ${cm.name}`;
      bodyText = `Gracias a tu diagnóstico correcto de ${sindromeAnswer}, ${cm.name} recibió el manejo apropiado. La familia reporta una mejoría clara en su funcionalidad y calidad de vida.`;
    } else if (caseOutcome === "malEvitable") {
      headerEmoji = "🔴";
      headerText = `Seis meses después — ${cm.name}`;
      bodyText = `El cuadro de ${cm.name} (compatible con ${sindromeAnswer}) no recibió el manejo dirigido. Un dato clave estaba en la entrevista que no llegaste a completar — de haberlo indagado, habría reorientado el diagnóstico. A veces la respuesta no está en pensar más rápido, sino en preguntar más.`;
    } else if (caseOutcome === "malGrave") {
      headerEmoji = "🔴";
      headerText = `Seis meses después — ${cm.name}`;
      bodyText = `El cuadro de ${cm.name} era potencialmente reversible (compatible con ${sindromeAnswer}). Al no recibir el manejo correcto a tiempo, la situación se deterioró de forma que pudo haberse evitado. Es el tipo de error con mayor consecuencia para el paciente.`;
    } else {
      // malHonesto
      headerEmoji = "🟠";
      headerText = `Seis meses después — ${cm.name}`;
      bodyText = `El diagnóstico de este caso (compatible con ${sindromeAnswer}) no fue certero, y ${cm.name} no recibió el manejo dirigido a su condición real. Reuniste la información disponible y aun así el cuadro engañó — le ocurre a clínicos con experiencia. El buen proceso cuenta, aunque esta vez el desenlace no acompañó.`;
    }

    return (
      <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Seguimiento longitudinal
            </span>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-amber-400 font-bold"><Sparkles className="w-4 h-4" /> {score} pts</span>
              <button onClick={goLobby} aria-label="Salir al lobby" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className={`rounded-2xl p-6 shadow-2xl backdrop-blur border ${isGoodOutcome ? "border-emerald-500/30 bg-emerald-500/5" : caseOutcome === "malHonesto" ? "border-orange-500/30 bg-orange-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">{headerEmoji}</div>
              <h3 className="text-white font-bold">{headerText}</h3>
            </div>
            <p className="text-slate-200 text-sm leading-relaxed">{bodyText}</p>
            <button
              onClick={finishCase}
              className="mt-5 w-full bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] transition-all text-slate-900 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm"
            >
              Volver a la sala de expedientes <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // screen === "playing" — fase de diagnóstico
  const totalQ = currentCase.questions.length;
  const selectedOption = selected !== null ? currentQuestion.options[selected] : null;
  const isGrid = currentQuestion.type === "dominio" || currentQuestion.type === "unidad";

  return (
    <div className="min-h-screen w-full nd-screen-in bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 nd-bg-animated p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-full">{LEVEL_LABEL[currentCase.level]}</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="relative flex items-center gap-1 text-amber-400 font-bold">
              <Sparkles className="w-4 h-4" /> {score} pts
              {pointsFx && (
                <span
                  key={pointsFx.id}
                  aria-hidden="true"
                  onAnimationEnd={() => setPointsFx(null)}
                  className="nd-float pointer-events-none absolute -top-4 right-0 text-emerald-400 font-bold text-sm"
                >
                  +{pointsFx.amount}
                </span>
              )}
            </span>
            {streak >= 2 && (
              <span className={`flex items-center gap-1 font-bold ${streak >= 3 ? "text-orange-400" : "text-slate-400"}`}>
                <Flame key={streak} className={`w-4 h-4 ${streak >= 3 ? "nd-flame" : ""}`} /> {streak}{streak >= 3 ? " ×1.5" : ""}
              </span>
            )}
            <button onClick={toggleSound} aria-label={soundOn ? "Silenciar sonido" : "Activar sonido"} title={soundOn ? "Silenciar" : "Activar sonido"} className="text-slate-500 hover:text-slate-300">
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={goLobby} aria-label="Salir al lobby" className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <FunBanner text={funBanner} />

        <div className="flex gap-1.5 mb-4">
          {currentCase.questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < questionIndex ? "bg-cyan-400" : i === questionIndex ? "bg-cyan-400/50" : "bg-slate-700"
            }`} />
          ))}
        </div>

        <div key={questionIndex} className="nd-page-in bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono text-slate-500">{CASE_META[caseIndex].name} · EXPEDIENTE #{String(caseIndex + 1).padStart(2, "0")}</span>
            </div>
            <div className="flex items-center gap-3">
              <TrustMeter n={trust} />
              <DifficultyDots n={currentCase.difficulty} />
            </div>
          </div>

          <div className="mb-5 bg-slate-800/30 rounded-xl p-3">
            <p className="text-slate-400 text-xs italic mb-1.5">{currentCase.intro}</p>
            <ul className="space-y-1">
              {currentCase.interview.map((item, i) => revealed.has(i) && (
                <li key={i} className="text-slate-300 text-sm flex gap-1.5"><span className="text-cyan-500">•</span>{item.reveal}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-purple-400">{QTYPE_LABEL[currentQuestion.type]}</span>
            <button
              onClick={handleHint}
              disabled={hintUsed || showFeedback || score < 30}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors ${
                hintUsed || showFeedback || score < 30 ? "text-slate-600 bg-slate-800/40 cursor-not-allowed" : "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" /> Pista (-30)
            </button>
          </div>

          <p className="text-white font-medium mb-3">{currentQuestion.prompt}</p>

          {isGrid && (
            <p className="text-xs text-purple-300 mb-2 flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" /> Coloca esta pista en la celda correcta</p>
          )}

          <div className={isGrid ? "grid grid-cols-2 gap-2" : "space-y-2"}>
            {currentQuestion.options.map((opt, i) => {
              if (i === removedIdx) {
                return (
                  <div key={i} className={`px-3 py-3 rounded-xl border border-slate-800 bg-slate-800/30 text-slate-600 line-through ${isGrid ? "text-center text-xs" : "text-sm"}`}>{opt.text}</div>
                );
              }
              let stateClasses = "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600";
              if (showFeedback) {
                if (opt.correct) stateClasses = "border-emerald-500 bg-emerald-500/10";
                else if (i === selected) stateClasses = "border-red-500 bg-red-500/10";
                else stateClasses = "border-slate-800 bg-slate-800/20 opacity-50";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={showFeedback}
                  className={`rounded-xl border transition-all text-slate-100 flex items-center gap-1.5 ${stateClasses} ${
                    isGrid ? "flex-col justify-center text-center p-4 text-xs" : "text-left px-4 py-3 text-sm justify-between"
                  }`}
                >
                  <span>{opt.text}</span>
                  {showFeedback && opt.correct && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                  {showFeedback && i === selected && !opt.correct && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {showFeedback && (
            <div role="status" aria-live="polite" className={`mt-4 p-4 rounded-xl border ${selectedOption.correct ? "border-emerald-500/40 bg-emerald-500/10 nd-correct" : "border-red-500/40 bg-red-500/10 nd-shake"}`}>
              <p className={`text-sm font-semibold mb-1 ${selectedOption.correct ? "text-emerald-300" : "text-red-300"}`}>{selectedOption.correct ? "¡Correcto!" : "No del todo..."}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{selectedOption.feedback}</p>

              {!selectedOption.correct && selectedOption.consequence && (
                <div className="mt-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                  <p className="text-orange-300 text-xs font-bold mb-1">📉 Si este diagnóstico se hubiera aplicado:</p>
                  <p className="text-orange-200/90 text-xs leading-relaxed">{selectedOption.consequence}</p>
                </div>
              )}

              <button
                onClick={handleNext}
                className={`mt-4 w-full font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] ${
                  mustReconsult ? "bg-amber-500 hover:bg-amber-400 text-slate-900" : "bg-cyan-500 hover:bg-cyan-400 text-slate-900"
                }`}
              >
                {mustReconsult ? "Volver a la entrevista" : questionIndex < totalQ - 1 ? "Siguiente pregunta" : "Redactar informe"}
                {mustReconsult ? <HelpCircle className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-slate-500 text-xs mt-4">Celdas RDoC descubiertas: {discoveredCells.size}/{MAX_CELLS}</p>
      </div>
    </div>
  );
}
