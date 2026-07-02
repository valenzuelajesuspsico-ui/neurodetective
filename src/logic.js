import { SUPERVISOR_NAME, REVIEW_FIELDS } from "./data.js";
// Lógica pura de NeuroDetective RDoC — sin React ni JSX, para poder testearla.

// Baraja una copia del arreglo (Fisher–Yates). No muta el original.
export function shuffleArr(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Elige un elemento al azar del arreglo.
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Porcentaje de aciertos de una competencia; null si no hay datos.
export function competencyPct(obj) {
  return obj.total > 0 ? Math.round((obj.correct / obj.total) * 100) : null;
}

// Rango de fin de partida según el porcentaje global.
export function getRank(pct) {
  if (pct >= 85) return { label: "Maestro Neuropsicólogo RDoC", emoji: "🏆" };
  if (pct >= 65) return { label: "Diagnosticador Experto", emoji: "🧠" };
  if (pct >= 40) return { label: "Investigador", emoji: "🔍" };
  return { label: "Aprendiz", emoji: "🧩" };
}

// Rangos clínicos según el prestigio (0–100).
export const CLINICAL_RANKS = [
  { min: 90, label: "Jefe del Servicio", emoji: "👑" },
  { min: 70, label: "Especialista de Referencia", emoji: "🎖️" },
  { min: 45, label: "Especialista de Planta", emoji: "🩺" },
  { min: 20, label: "Residente Avanzado", emoji: "📋" },
  { min: 0, label: "Residente en Formación", emoji: "🌱" },
];

export function getClinicalRank(prestige) {
  return CLINICAL_RANKS.find(r => prestige >= r.min) || CLINICAL_RANKS[CLINICAL_RANKS.length - 1];
}

// Construye los datos del informe (plantilla, huecos y banco de opciones)
// dinámicamente a partir de las preguntas presentes en el caso.
export function buildReportData(caseObj) {
  const order = ["sindrome", "dominio", "constructo", "unidad", "instrumento"];
  const present = order.map(t => caseObj.questions.find(q => q.type === t)).filter(Boolean);

  const FIELD_INTRO = {
    sindrome: "Tras la evaluación neuropsicológica, se concluye que el paciente presenta un cuadro compatible con ",
    dominio: ", ubicado en el dominio RDoC de ",
    constructo: ". Específicamente, se ve alterado el constructo de ",
    unidad: ", evidenciado a través de la unidad de análisis de ",
    instrumento: ". Para fundamentar este perfil se recomienda ",
  };
  const templateParts = [];
  present.forEach((q) => {
    templateParts.push(FIELD_INTRO[q.type] || ". ");
    templateParts.push(`{${q.type}}`);
  });
  templateParts.push(".");

  const blanks = present.map(q => ({ type: q.type, answer: q.options.find(o => o.correct).text }));
  const distractors = present.map(q => {
    const wrong = q.options.filter(o => !o.correct);
    return wrong[Math.floor(Math.random() * wrong.length)].text;
  });
  const bank = shuffleArr([...blanks.map(b => b.answer), ...distractors]);
  return { templateParts, blanks, bank };
}

// Clasifica el desenlace de un caso para prestigio, seguimiento y nota del supervisor.
export function classifyOutcome(caseObj, caseIdx, { wasPerfect, caseHintUsed, sindromeWrong, lostTrust, revealedSet }) {
  if (!sindromeWrong && !lostTrust) {
    return wasPerfect ? "excelente" : "bueno";
  }
  // Mal pronóstico: ¿fue evitable, grave u honesto?
  const keyClue = caseObj.keyInterviewClue;
  const skippedKeyClue = typeof keyClue === "number" && !revealedSet.has(keyClue);
  if (caseObj.reversible && skippedKeyClue) return "malGrave";
  if (caseObj.reversible) return "malGrave";
  if (skippedKeyClue) return "malEvitable";
  return "malHonesto";
}

export function buildSupervisorNote(outcome, caseName, prevRank, newRank) {
  const ranked = prevRank !== newRank;
  const up = ["excelente", "bueno"].includes(outcome);
  if (outcome === "excelente") {
    return ranked
      ? `📈 ${SUPERVISOR_NAME} comentó tu manejo del caso ${caseName} en la sesión clínica. Has ascendido a ${newRank.emoji} ${newRank.label}.`
      : `${SUPERVISOR_NAME} notó la precisión de tu manejo del caso ${caseName}. El servicio empieza a confiarte casos más exigentes.`;
  }
  if (outcome === "bueno") {
    return ranked
      ? `📈 Resolviste el caso ${caseName} de forma correcta. Has ascendido a ${newRank.emoji} ${newRank.label}.`
      : `Diagnóstico correcto en el caso ${caseName}. Trabajo sólido, aunque hay margen para afinar el proceso.`;
  }
  if (outcome === "malHonesto") {
    return ranked
      ? `Reuniste toda la información disponible y aun así el caso ${caseName} engañó — le pasa a clínicos con años de experiencia. El servicio te reasigna a ${newRank.emoji} ${newRank.label} mientras recuperas tu nivel.`
      : `El caso ${caseName} era de los que confunden incluso a los más experimentados. Investigaste a fondo; el buen proceso cuenta, aunque el desenlace no acompañó.`;
  }
  if (outcome === "malEvitable") {
    return ranked
      ? `La clave del caso ${caseName} estaba en la entrevista que no completaste. Por ahora se te asignarán casos de menor complejidad (${newRank.emoji} ${newRank.label}). A veces el diagnóstico no está en pensar más rápido, sino en preguntar más.`
      : `En el caso ${caseName}, un dato de la entrevista que no indagaste habría reorientado todo. Tómate el tiempo de recabar la información.`;
  }
  // malGrave
  return ranked
    ? `⚠️ El cuadro del caso ${caseName} era potencialmente reversible. Tu manejo se revisó en sesión clínica y el servicio te reasigna a ${newRank.emoji} ${newRank.label}. Estos son los errores que más pesan.`
    : `⚠️ El caso ${caseName} era reversible con el manejo correcto. Es el tipo de error con mayor consecuencia para el paciente; conviene revisarlo con calma.`;
}

export function getPerformanceTier(misCount, attCount) {
  if (attCount < 3) return null;
  const rate = misCount / attCount;
  if (rate === 0) return { emoji: "🏆", title: "Apto para continuar en el área", message: "Tu desempeño diagnóstico ha sido consistente y preciso en todos los casos atendidos. Estás listo para seguir avanzando con casos de mayor complejidad.", action: "none" };
  if (rate <= 0.25) return { emoji: "✅", title: "Apto, con observaciones menores", message: "Tu desempeño general es sólido, aunque hubo algunos diagnósticos que vale la pena repasar. Revisa las consecuencias clínicas de esos casos antes de continuar.", action: "none" };
  if (rate <= 0.5) return { emoji: "📚", title: "Se recomienda capacitación adicional", message: "Una proporción importante de los diagnósticos no fue certera. Se recomienda reforzar tu formación en una institución certificada antes de continuar con casos de mayor complejidad.", action: "none" };
  return { emoji: "🔄", title: "No apto por el momento", message: "El número de diagnósticos erróneos es alto en proporción a los casos atendidos. Se recomienda regresar al curso introductorio de RDoC para reforzar las bases antes de continuar.", action: "course" };
}

// Devuelve un array de secciones si el texto trae etiquetas [CAMPO], o null si es prosa normal.
export function parseReview(text) {
  if (!text || !text.includes("[")) return null;
  const found = REVIEW_FIELDS.some(f => text.includes(`[${f.tag}]`));
  if (!found) return null;
  const sections = [];
  for (let i = 0; i < REVIEW_FIELDS.length; i++) {
    const field = REVIEW_FIELDS[i];
    const marker = `[${field.tag}]`;
    const start = text.indexOf(marker);
    if (start === -1) continue;
    let end = text.length;
    for (let j = 0; j < REVIEW_FIELDS.length; j++) {
      const nextMarker = `[${REVIEW_FIELDS[j].tag}]`;
      const nextPos = text.indexOf(nextMarker, start + marker.length);
      if (nextPos !== -1 && nextPos < end) end = nextPos;
    }
    const content = text.slice(start + marker.length, end).trim();
    if (content) sections.push({ ...field, content });
  }
  return sections.length ? sections : null;
}
