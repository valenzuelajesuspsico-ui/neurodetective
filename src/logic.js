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
