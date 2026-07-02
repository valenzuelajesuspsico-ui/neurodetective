import { useState, useEffect, Fragment } from "react";
import { Brain, Lightbulb, CheckCircle2, XCircle, ChevronRight, ChevronLeft, RotateCcw, Flame, LayoutGrid, Sparkles, BookOpen, Gamepad2, X, HelpCircle, GitCompare, Heart, ClipboardList, GraduationCap, FolderOpen, Lock, Home, FileText, Search, Calendar, BarChart3, Volume2, VolumeX } from "lucide-react";

// ===== Motor de sonido (Web Audio API, sintetizado — sin archivos) =====
const SFX = (() => {
  let ctx = null, enabled = false;
  const ac = () => { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); } return ctx; };
  function tone(freq, dur, type = "sine", gain = 0.14, slideTo = null) {
    if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }
  function swish(dur = 0.3) {
    if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(450, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(c.destination); src.start(t); src.stop(t + dur);
  }
  return {
    setEnabled(v) { enabled = v; if (v) { const c = ac(); if (c && c.state === "suspended") c.resume(); } },
    isEnabled: () => enabled,
    pageTurn: () => swish(0.3),
    correct() { tone(523.25, 0.12, "sine", 0.15); setTimeout(() => tone(783.99, 0.16, "sine", 0.14), 85); },
    wrong() { tone(180, 0.26, "sawtooth", 0.12, 110); },
    streak() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, "triangle", 0.13), i * 65)); },
    stamp() { swish(0.08); tone(95, 0.15, "square", 0.2); },
    click() { tone(660, 0.04, "sine", 0.05); },
  };
})();

const NO_MOTION = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

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

// Revela un texto letra por letra (respeta prefers-reduced-motion).
function Typewriter({ text, speed = 16 }) {
  const [n, setN] = useState(NO_MOTION ? text.length : 0);
  useEffect(() => {
    if (NO_MOTION) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  const done = n >= text.length;
  return <span className={done ? "" : "nd-caret"}>{text.slice(0, n)}</span>;
}

const DOMAIN_DESCRIPTIONS = {
  VN: "Procesos relacionados con el miedo, la ansiedad y la respuesta a la pérdida.",
  VP: "Procesos relacionados con la recompensa, la motivación y la capacidad de sentir placer.",
  COG: "Procesos como la atención, la memoria, el lenguaje y el control cognitivo.",
  SOC: "Procesos relacionados con la comunicación, la afiliación y la comprensión de los demás.",
  AR: "Procesos relacionados con el nivel de alerta y los ciclos de sueño-vigilia.",
  SM: "Procesos relacionados con la planificación y ejecución de acciones motoras.",
};
const UNIT_DESCRIPTIONS = {
  GEN: "Variantes genéticas que pueden influir en el riesgo o la presentación de un fenómeno.",
  MOL: "Moléculas como neurotransmisores y hormonas implicadas en el mecanismo.",
  CEL: "El nivel celular — tipos de neuronas y procesos de la célula individual.",
  CIR: "Circuitos neuronales — regiones cerebrales que trabajan conectadas entre sí.",
  FIS: "Medidas fisiológicas — actividad eléctrica, frecuencia cardíaca, hormonas circulantes, etc.",
  CON: "Conducta observable — lo que se puede ver y medir directamente en las acciones de la persona.",
  AUT: "Autorreporte — lo que la persona informa subjetivamente sobre su propia experiencia.",
  PAR: "Paradigmas — tareas experimentales diseñadas específicamente para medir un constructo.",
};
const DOMAINS = [
  { key: "VN", label: "Valencia Negativa" },
  { key: "VP", label: "Valencia Positiva" },
  { key: "COG", label: "Cognitivos" },
  { key: "SOC", label: "Procesos Sociales" },
  { key: "AR", label: "Activación/Regulación" },
  { key: "SM", label: "Sensoriomotores" },
];

const UNITS = [
  { key: "GEN", label: "Genes" },
  { key: "MOL", label: "Moléculas" },
  { key: "CEL", label: "Células" },
  { key: "CIR", label: "Circuitos" },
  { key: "FIS", label: "Fisiología" },
  { key: "CON", label: "Conducta" },
  { key: "AUT", label: "Autorreporte" },
  { key: "PAR", label: "Paradigmas" },
];

// --- Contenido de referencia del curso (extraído de los 27 casos) ---
// Constructos de cada dominio, tal como los preguntan los casos.
const CONSTRUCTS_BY_DOMAIN = {
  VN: ["Miedo agudo (amenaza presente)", "Amenaza potencial / ansiedad sostenida", "Pérdida"],
  VP: ["Respuesta a la recompensa (capacidad de sentir placer)"],
  COG: ["Atención", "Memoria declarativa", "Lenguaje", "Control cognitivo (inhibición)", "Velocidad de procesamiento"],
  SOC: ["Percepción y comprensión del otro", "Teoría de la mente", "Comunicación social"],
  AR: ["Activación (arousal)", "Ritmos circadianos / sueño-vigilia"],
  SM: ["Agencia y control de la acción", "Praxias"],
};

// Diferenciaciones clave: los errores trampa de los casos de nivel avanzado.
const KEY_DISTINCTIONS = [
  { a: "Miedo agudo", b: "Ansiedad sostenida", rule: "El miedo responde a una amenaza presente y concreta; la ansiedad anticipa un peligro futuro e incierto." },
  { a: "Activación (arousal)", b: "Cognición", rule: "El arousal es el nivel de conciencia; la cognición es qué haces con esa conciencia. Si fluctúa la conciencia, el problema es de arousal." },
  { a: "Inhibición (Cognitivo)", b: "Sensoriomotor", rule: "Una conducta repetitiva (p. ej. TOC) que no se puede frenar es un fallo de control cognitivo, no del sistema motor que ejecuta el movimiento." },
  { a: "Percibir", b: "Ejecutar", rule: "Sentir el tacto o la posición del cuerpo es percepción; mover el miembro es ejecución. Son unidades distintas del dominio sensoriomotor." },
  { a: "Producir lenguaje", b: "Comprender lenguaje", rule: "Se puede comprender bien y aun así no lograr expresarse (la brecha está en la producción), y viceversa." },
  { a: "Memoria", b: "Atención / función ejecutiva", rule: "Olvidar por no registrar ni organizarse es un fallo atencional-ejecutivo, no una incapacidad de consolidar recuerdos." },
  { a: "Buscar el contacto (autismo)", b: "Evitarlo (ansiedad social)", rule: "El autismo busca el vínculo pero no capta las reglas implícitas; la ansiedad social evita el contacto por miedo al juicio." },
];

// --- Actividades pedagógicas del curso (viñetas clínicas nuevas, no son de los 27 casos) ---
// Actividad 1: "¿Cuál es la diferencia?" — drill de distinciones con escenarios breves.
const DIFF_DRILL = [
  { scenario: "Un joven siente el corazón disparado y terror en el instante en que una araña aparece sobre su escritorio.", a: "Miedo agudo", b: "Ansiedad sostenida", correct: "a", rule: "Hay una amenaza presente y concreta → miedo agudo (Valencia Negativa)." },
  { scenario: "Una persona pasa toda la semana inquieta 'por si algo sale mal' en una reunión que será dentro de varios días.", a: "Miedo agudo", b: "Ansiedad sostenida", correct: "b", rule: "El peligro es futuro e incierto → ansiedad / amenaza potencial." },
  { scenario: "Un paciente revisa la cerradura 15 veces; sabe que está cerrada y mueve bien las manos, pero no logra detenerse.", a: "Sensoriomotor (ejecución)", b: "Control cognitivo (inhibición)", correct: "b", rule: "El movimiento está intacto; lo que falla es frenar la conducta → inhibición (Sistemas Cognitivos)." },
  { scenario: "Tras salir de un coma, alguien se duerme y despierta a ratos; su atención sube y baja junto con su nivel de conciencia.", a: "Activación (arousal)", b: "Cognición (atención)", correct: "a", rule: "Lo que fluctúa primero es el nivel de conciencia → arousal (Activación/Regulación)." },
];

// Actividad 2: "Clasifica en la matriz" — una viñeta nueva, tres capas RDoC.
const CLASSIFY_ACTIVITY = {
  scenario: "Una mujer dejó de disfrutar todo lo que antes le gustaba — comida, música, ver a sus amigos. No siente tristeza intensa ni miedo, solo una ausencia total de placer. Los estudios muestran baja actividad en el circuito de recompensa.",
  steps: [
    { key: "dominio", label: "Dominio", options: [
      { text: "Sistemas de Valencia Positiva", correct: true, fb: "Correcto. La capacidad de experimentar placer y recompensa es el núcleo de Valencia Positiva." },
      { text: "Sistemas de Valencia Negativa", correct: false, fb: "No: no hay miedo, ansiedad ni pérdida como afecto negativo; lo que falta es el placer (positivo)." },
      { text: "Sistemas Cognitivos", correct: false, fb: "La atención y la memoria no son el problema central aquí." },
    ]},
    { key: "constructo", label: "Constructo", options: [
      { text: "Respuesta a la recompensa", correct: true, fb: "Correcto. La anhedonia es un déficit en la respuesta a la recompensa." },
      { text: "Control cognitivo", correct: false, fb: "No hay un fallo de inhibición o planeación." },
      { text: "Miedo agudo", correct: false, fb: "No hay amenaza ni respuesta de miedo." },
    ]},
    { key: "unidad", label: "Unidad de análisis", options: [
      { text: "Circuitos (circuito de recompensa)", correct: true, fb: "Correcto. El dato que aporta el mecanismo es la baja actividad del circuito de recompensa." },
      { text: "Autorreporte", correct: false, fb: "Lo que ella dice apoya el cuadro, pero el mecanismo se documenta a nivel de circuitos aquí." },
      { text: "Genes", correct: false, fb: "No se menciona información genética en el caso." },
    ]},
  ],
};

// Actividad 4: viñetas contrastadas — mismo diagnóstico DSM, distinto perfil RDoC.
// (Basado en el ejemplo de Trastorno de Conducta de Cozza et al., "RDoC and Clinical Child Psychology".)
const CONTRAST_VIGNETTES = {
  dx: "Trastorno de Conducta (mismo diagnóstico DSM-5)",
  patients: [
    { label: "Paciente 1", text: "16 años, con ansiedad entre sus familiares. Robó presionado por sus amigos, falta a clases 'porque ellos faltan', y pelea diciendo que lo provocaron." },
    { label: "Paciente 2", text: "16 años, con negligencia severa en la infancia. Robó sin justificarlo, no considera importante asistir a clases, e inicia peleas sin ofrecer ningún motivo." },
  ],
  questions: [
    { key: "same", prompt: "Cumplen los mismos criterios DSM. ¿Comparten el mismo perfil RDoC?", options: [
        { text: "No — el mecanismo subyacente es distinto en cada uno", correct: true, fb: "Correcto. Misma conducta observable, pero distinto mecanismo: ahí está el valor de RDoC, que mira por debajo del síntoma." },
        { text: "Sí — si cumplen los mismos criterios, el perfil es el mismo", correct: false, fb: "No: compartir criterios DSM no implica el mismo mecanismo. Dos personas con la misma etiqueta pueden diferir por completo a nivel RDoC." },
      ] },
    { key: "p1", prompt: "¿Qué predomina en el Paciente 1?", options: [
        { text: "Amenaza aguda hiper-reactiva (Valencia Negativa)", correct: true, fb: "Su conducta es reactiva y defensiva ('me provocaron'), con ansiedad en la familia: un sistema de amenaza hiperactivo." },
        { text: "Miedo hipo-reactivo / rasgos insensibles", correct: false, fb: "Ese es el perfil del Paciente 2; el 1 reacciona con ansiedad, no con insensibilidad." },
      ] },
    { key: "p2", prompt: "¿Qué predomina en el Paciente 2?", options: [
        { text: "Miedo hipo-reactivo / rasgos insensibles (tras negligencia)", correct: true, fb: "Inicia la agresión sin justificación ni remordimiento: un sistema de amenaza hipoactivo, perfil insensible." },
        { text: "Amenaza aguda hiper-reactiva", correct: false, fb: "Ese es el perfil del Paciente 1; el 2 actúa sin miedo ni justificación." },
      ] },
  ],
};

// Actividad 3: tarjetas de repaso (constructo / término ↔ definición).
const FLASHCARDS = [
  { front: "Miedo agudo", back: "Respuesta a una amenaza presente y concreta (Valencia Negativa)." },
  { front: "Ansiedad sostenida", back: "Anticipación de un peligro futuro e incierto (Valencia Negativa)." },
  { front: "Anhedonia", back: "Pérdida de la capacidad de sentir placer; déficit de respuesta a la recompensa (Valencia Positiva)." },
  { front: "Control cognitivo (inhibición)", back: "Capacidad de frenar una respuesta automática (Sistemas Cognitivos)." },
  { front: "Teoría de la mente", back: "Inferir los estados mentales de los demás (Procesos Sociales)." },
  { front: "Arousal (activación)", back: "Nivel global de activación y conciencia (Activación y Regulación)." },
  { front: "Praxias", back: "Ejecución de movimientos aprendidos con propósito (Sensoriomotores)." },
  { front: "Memoria declarativa", back: "Consolidar y recuperar hechos y eventos (Sistemas Cognitivos)." },
];

// Mini-examen por capas: 3 rondas de emparejar. Se empareja por `id`.
// Check de preparación: un mini-caso nuevo, integrador, sin feedback paso a paso.
// (Distinto a los 27 casos y a las viñetas de las actividades de práctica.)
const READINESS_CHECK = {
  scenario: "Un hombre de 70 años, tras una caída leve, empieza a olvidar conversaciones recientes: repite las mismas preguntas y no recuerda qué desayunó. Su nivel de alerta es normal y en general está orientado, pero la memoria de hechos recientes le falla de forma notoria.",
  questions: [
    { key: "dominio", label: "Dominio", options: [
        { text: "Sistemas Cognitivos", correct: true },
        { text: "Activación y Regulación", correct: false },
        { text: "Procesos Sociales", correct: false },
      ], explain: "Su nivel de alerta está conservado; lo que falla es la memoria, una función cognitiva." },
    { key: "constructo", label: "Constructo", options: [
        { text: "Memoria declarativa", correct: true },
        { text: "Atención", correct: false },
        { text: "Control cognitivo (inhibición)", correct: false },
      ], explain: "Olvidar hechos y eventos recientes apunta a la memoria declarativa, no a la atención ni a la inhibición." },
    { key: "unidad", label: "Unidad de análisis", options: [
        { text: "Conducta (desempeño en memoria observado)", correct: true },
        { text: "Genes", correct: false },
        { text: "Autorreporte", correct: false },
      ], explain: "El déficit se documenta observando su desempeño en memoria durante la evaluación, no por estudio genético ni solo por lo que él reporta." },
  ],
};

const BASE_POINTS = { sindrome: 100, dominio: 100, constructo: 150, unidad: 150, instrumento: 100, contexto: 100 };
const QTYPE_LABEL = { sindrome: "Diagnóstico clínico", dominio: "Dominio RDoC", constructo: "Constructo RDoC", unidad: "Unidad de análisis", instrumento: "Instrumento de evaluación", contexto: "Neurodesarrollo / Ambiente" };
const LEVEL_LABEL = { 1: "Nivel 1 · Básico", 2: "Nivel 2 · Intermedio", 3: "Nivel 3 · Avanzado" };
const SYNTHESIS_BONUS = 50;
const REPORT_BONUS = 30;

// Orden con dificultad creciente de distractores: 1,1,2,2,2,3,3,4,4,4,5,5
const CASES = [
  {
    level: 1, difficulty: 1, domainKey: "SOC", unitKey: "CIR",
    intro: "Recibes un nuevo expediente. El informante es la familia de un paciente masculino de 58 años, recién dado de alta tras un ACV.",
    interview: [
      { q: "¿Qué comportamiento le preocupa a la familia?", reveal: "Cuando ve a su esposa, dice que es 'una impostora idéntica' a ella." },
      { q: "¿Reconoce a las personas por otros medios?", reveal: "Sí — la reconoce sin problema cuando habla con ella por teléfono, sin verla." },
      { q: "¿Hay otros síntomas asociados (visión, movimiento, lenguaje)?", reveal: "Ninguno — su visión, habla y movimiento están intactos; el problema aparece solo al verla en persona." },
    ],
    questions: [
      {
      type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
      options: [
        { text: "Lesión en el área de Broca (afasia motora)", correct: false, feedback: "La afasia de Broca afecta la producción del habla, no la sensación de familiaridad ante rostros.", consequence: "Si se hubiera tratado como una afasia motora, el paciente habría sido enviado a terapia de lenguaje, sin abordar la verdadera ruptura entre el reconocimiento facial y la respuesta emocional — seguiría llamando impostora a su esposa." },
        { text: "Desconexión entre reconocimiento facial y respuesta emocional (circuito fusiforme-amígdala)", correct: true, feedback: "Correcto. Es el Síndrome de Capgras: el paciente reconoce el rostro pero no siente la 'chispa' emocional de familiaridad, por eso concluye que debe ser un impostor." },
        { text: "Daño en la corteza visual primaria (ceguera cortical)", correct: false, feedback: "Si fuera ceguera cortical, no reconocería el rostro en absoluto, ni en persona ni por voz.", consequence: "Si se hubiera diagnosticado como ceguera cortical, se le habrían realizado estudios oftalmológicos innecesarios, mientras el verdadero problema (la desconexión emocional con los rostros) seguiría sin tratamiento." },
        { text: "Daño cerebelar (ataxia)", correct: false, feedback: "El cerebelo se relaciona con coordinación motora, no con el reconocimiento emocional de rostros.", consequence: "Si se hubiera enfocado el tratamiento en rehabilitación motora por una supuesta ataxia, el paciente seguiría angustiado pensando que su esposa fue reemplazada por una impostora." },
      ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece el núcleo de este fenómeno?",
        options: [
          { text: "Procesos Sociales", correct: true, feedback: "Correcto. El reconocimiento de personas conocidas y la respuesta de familiaridad hacia ellas pertenecen a Procesos Sociales, constructo de percepción y comprensión del otro." },
          { text: "Sistemas Cognitivos", correct: false, feedback: "La percepción visual del rostro está intacta; lo que falla es la respuesta de familiaridad hacia una persona, algo social." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "Aunque le genera angustia, el déficit nuclear no es de miedo o amenaza, sino de reconocimiento afectivo del otro." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor en este caso." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Percepción y comprensión del otro (reconocimiento afectivo de personas)", correct: true, feedback: "Correcto. Lo alterado es la integración entre reconocer un rostro y sentir la familiaridad afectiva que normalmente lo acompaña." },
          { text: "Afiliación y unión social", correct: false, feedback: "No es una falta de deseo de vínculo; el paciente quiere a su esposa, pero no la 'siente' familiar al verla." },
          { text: "Percepción visual", correct: false, feedback: "La percepción visual del rostro está intacta — reconoce los rasgos; lo que falla es la respuesta de familiaridad asociada." },
          { text: "Comunicación social", correct: false, feedback: "No hay un déficit en producir o leer señales comunicativas; el problema es el reconocimiento afectivo de la persona." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se explica mejor el mecanismo de este cuadro?",
        options: [
          { text: "Circuitos (desconexión fusiforme-amígdala)", correct: true, feedback: "Correcto. El mecanismo se explica por la desconexión entre el área de reconocimiento facial (giro fusiforme) y la respuesta emocional (amígdala) — un nivel de circuitos." },
          { text: "Conducta", correct: false, feedback: "Llamar impostora a su esposa es la manifestación observable, pero el mecanismo explicativo está en la desconexión de circuitos." },
          { text: "Autorreporte", correct: false, feedback: "Lo que el paciente dice apoya el cuadro, pero el mecanismo se documenta mejor a nivel de circuitos." },
          { text: "Genes", correct: false, feedback: "El cuadro es secundario a un ACV, no a una causa genética." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué abordaje usarías para fundamentar y documentar este perfil?",
        options: [
          { text: "Evaluación neuropsicológica del reconocimiento facial y respuesta de familiaridad, con apoyo de la neuroimagen del ACV", correct: true, feedback: "Correcto. Documentar que el reconocimiento perceptivo está intacto pero la familiaridad afectiva no, junto con la localización de la lesión, fundamenta el perfil." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners evalúan síntomas de TDAH; no aplican a este cuadro." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "El MNA es un tamizaje nutricional; no es relevante para este caso." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no aplica a esta desconexión post-ACV." },
        ]
      }
    ]
  },
  {
    level: 1, difficulty: 1, domainKey: "COG", unitKey: "CON",
    intro: "Paciente atendido tras un ACV en el hemisferio derecho, según refiere el equipo de rehabilitación.",
    interview: [
      { q: "¿Qué notan al observarlo comer?", reveal: "Deja la mitad izquierda del plato completamente intacta, como si no existiera." },
      { q: "¿Y al vestirse?", reveal: "Ignora la manga izquierda de su camisa; solo se viste el lado derecho." },
      { q: "¿Reporta debilidad o dolor en el lado izquierdo?", reveal: "No — al preguntarle directamente, niega cualquier debilidad o molestia." },
    ],
    questions: [
      {
      type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
      options: [
        { text: "Lesión occipital bilateral (ceguera cortical)", correct: false, feedback: "La ceguera cortical implica no ver nada en absoluto, no ignorar selectivamente un lado del espacio.", consequence: "Si se hubiera tratado como ceguera total, se le habría dado entrenamiento para personas ciegas, cuando en realidad sí puede ver — simplemente no presta atención al lado izquierdo del espacio." },
        { text: "Lesión en el hipocampo (amnesia anterógrada)", correct: false, feedback: "La amnesia afecta la memoria, no la atención espacial.", consequence: "Si se hubiera abordado como un problema de memoria, la terapia se habría enfocado en ejercicios mnésicos, sin atender el verdadero déficit: la atención hacia su propio cuerpo y el espacio que lo rodea." },
        { text: "Lesión en el lóbulo parietal derecho (negligencia espacial unilateral)", correct: true, feedback: "Correcto. El parietal derecho es clave para la atención espacial del lado izquierdo del cuerpo y del mundo." },
        { text: "Lesión en el área de Wernicke (afasia sensorial)", correct: false, feedback: "Wernicke afecta la comprensión del lenguaje, no la percepción espacial.", consequence: "Si se hubiera tratado como un problema de comprensión del lenguaje, se le habría dado terapia de lenguaje, mientras seguiría sin notar la mitad izquierda de su plato o de su ropa." },
      ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. La atención espacial es un constructo de Sistemas Cognitivos; aquí falla la atención hacia un hemicampo." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No es un déficit de ejecución motora ni de percepción sensorial primaria — la vista funciona; falla la atención al espacio." },
          { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de miedo, ansiedad o pérdida en este caso." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Atención (espacial)", correct: true, feedback: "Correcto. Lo alterado es la orientación de la atención hacia el lado izquierdo del espacio y del propio cuerpo." },
          { text: "Percepción", correct: false, feedback: "La percepción visual primaria está intacta — el ojo capta el estímulo; lo que falla es atender ese lado del espacio." },
          { text: "Memoria de trabajo", correct: false, feedback: "No hay un déficit en mantener información activa en mente; el problema es atencional-espacial." },
          { text: "Control cognitivo", correct: false, feedback: "No es un fallo de inhibición o flexibilidad; es específicamente de orientación atencional al espacio." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (observación al comer y vestirse)", correct: true, feedback: "Correcto. Dejar la mitad izquierda del plato e ignorar la manga izquierda son conductas observadas directamente." },
          { text: "Circuitos", correct: false, feedback: "Hay sustrato parietal, pero la evidencia descrita en el caso es la observación de su conducta, no neuroimagen funcional." },
          { text: "Autorreporte", correct: false, feedback: "El paciente NIEGA el problema (no tiene conciencia de él), así que el autorreporte no es la evidencia directa." },
          { text: "Genes", correct: false, feedback: "El cuadro es secundario a un ACV, no a una causa genética." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento o tarea usarías para fundamentar este perfil?",
        options: [
          { text: "Pruebas de cancelación / bisección de líneas y dibujo del reloj (tareas de negligencia espacial)", correct: true, feedback: "Correcto. Estas tareas evidencian objetivamente la omisión sistemática del hemicampo izquierdo, fundamentando la negligencia." },
          { text: "Escalas de Conners", correct: false, feedback: "Evalúan síntomas de TDAH; no son relevantes para la negligencia espacial." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no aplica a este caso." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "Es un tamizaje nutricional; no aplica a este perfil." },
        ]
      }
    ]
  },
  {
    level: 1, difficulty: 2, domainKey: "COG", unitKey: "CON",
    intro: "Paciente derivado tras una cirugía bilateral en los lóbulos temporales mediales, realizada para tratar una epilepsia severa.",
    interview: [
      { q: "¿Cómo es su conversación con él?", reveal: "Perfectamente normal — responde con coherencia y fluidez durante toda la entrevista." },
      { q: "¿Qué pasa minutos después de la conversación?", reveal: "No recuerda haberla tenido; pregunta de nuevo lo mismo como si fuera la primera vez." },
      { q: "¿Cómo está su memoria de antes de la cirugía?", reveal: "Completamente intacta — recuerda con detalle su vida antes de la operación." },
    ],
    questions: [
      {
      type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
      options: [
        { text: "Lesión prefrontal (síndrome disejecutivo)", correct: false, feedback: "El daño prefrontal afecta planificación e inhibición, no la formación de nuevos recuerdos.", consequence: "Si se hubiera tratado como un síndrome disejecutivo, se habría trabajado en planificación y organización, sin atender que el verdadero problema es que no puede formar ningún recuerdo nuevo en absoluto." },
        { text: "Lesión talámica bilateral (amnesia diencefálica)", correct: false, feedback: "Buen intento — el tálamo también puede producir amnesia, pero el patrón típico tras cirugía bilateral del temporal medial (como en H.M.) apunta directamente al hipocampo.", consequence: "Si se hubiera asumido daño talámico puro, se habrían buscado otras causas de la amnesia, retrasando el reconocimiento de que el patrón es clásico de lesión hipocampal bilateral." },
        { text: "Lesión en ganglios basales (Parkinson)", correct: false, feedback: "Los ganglios basales se relacionan con el movimiento, no con la memoria declarativa.", consequence: "Si se hubiera sospechado Parkinson, se le habría dado tratamiento para el movimiento, cuando el paciente no tiene ningún problema motor — solo no puede recordar nada nuevo." },
        { text: "Lesión bilateral del hipocampo / lóbulo temporal medial (amnesia anterógrada)", correct: true, feedback: "Correcto — es el caso clásico de H.M. El hipocampo bilateral es esencial para consolidar nuevos recuerdos." },
      ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. La memoria declarativa es un constructo de Sistemas Cognitivos." },
          { text: "Sistemas de Activación y Regulación", correct: false, feedback: "Su nivel de conciencia está intacto; lo que falla es consolidar recuerdos nuevos, una función cognitiva." },
          { text: "Procesos Sociales", correct: false, feedback: "No hay un déficit de cognición social central en este caso." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor en este caso." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Memoria declarativa (consolidación de nuevos recuerdos)", correct: true, feedback: "Correcto. No puede convertir la experiencia reciente en recuerdos duraderos — falla la consolidación de la memoria declarativa." },
          { text: "Memoria de trabajo", correct: false, feedback: "Su memoria de trabajo está intacta — sostiene una conversación coherente; lo que falla es consolidar esa información a largo plazo." },
          { text: "Atención", correct: false, feedback: "Su atención es normal durante la conversación; el déficit es consolidar lo vivido en memoria duradera." },
          { text: "Lenguaje", correct: false, feedback: "Su lenguaje es fluido y coherente; no hay déficit lingüístico." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (desempeño en memoria observado en la entrevista)", correct: true, feedback: "Correcto. Que olvide la conversación minutos después y la repita es una evidencia conductual directa del déficit de memoria." },
          { text: "Circuitos", correct: false, feedback: "Hay sustrato hipocampal, pero la evidencia descrita en el caso es el desempeño observado, no neuroimagen funcional." },
          { text: "Genes", correct: false, feedback: "El cuadro es secundario a una cirugía, no a una causa genética." },
          { text: "Fisiología", correct: false, feedback: "No se describen medidas fisiológicas en este caso." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este perfil?",
        options: [
          { text: "NEUROPSI Atención y Memoria (con énfasis en memoria diferida)", correct: true, feedback: "Correcto. Permite documentar objetivamente la disociación entre memoria inmediata preservada y memoria diferida (consolidación) gravemente afectada." },
          { text: "Escalas de Conners", correct: false, feedback: "Evalúan síntomas de TDAH; no aplican a este perfil amnésico." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no es relevante aquí." },
          { text: "Test de Stroop únicamente", correct: false, feedback: "El Stroop evalúa control inhibitorio, no la consolidación de la memoria declarativa." },
        ]
      }
    ]
  },
  {
    level: 1, difficulty: 2, domainKey: "COG", unitKey: "CON",
    intro: "Paciente con dificultad evidente para hablar, evaluado en consulta ambulatoria.",
    interview: [
      { q: "¿Cómo suena su habla?", reveal: "Entrecortada y con gran esfuerzo: 'Yo... ir... tienda... pan'." },
      { q: "¿Comprende lo que se le dice?", reveal: "Sí, comprende perfectamente las instrucciones y preguntas que se le hacen." },
      { q: "¿Sabe lo que quiere decir, aunque no pueda decirlo?", reveal: "Sí — se nota su frustración porque sabe exactamente la idea, pero no logra producirla con fluidez." },
    ],
    questions: [
      {
      type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
      options: [
        { text: "Lesión en el área de Wernicke (lóbulo temporal)", correct: false, feedback: "Wernicke produce habla fluida pero sin sentido, con comprensión pobre — justo lo opuesto a este caso.", consequence: "Si se hubiera diagnosticado como afasia de Wernicke, se esperaría que el paciente comprendiera mal el lenguaje — pero él entiende perfectamente, solo no puede producir el habla con fluidez." },
        { text: "Lesión en el área de Broca (lóbulo frontal izquierdo)", correct: true, feedback: "Correcto. El habla telegráfica y no fluida con comprensión preservada es el sello de la afasia de Broca." },
        { text: "Lesión en el cuerpo calloso (desconexión interhemisférica)", correct: false, feedback: "Una desconexión callosa no produce este patrón de habla no fluida.", consequence: "Si se hubiera asumido una desconexión interhemisférica, se habrían buscado otros síntomas de desconexión que este paciente no tiene; su problema es específicamente producir el habla." },
        { text: "Lesión cerebelosa", correct: false, feedback: "El cerebelo puede afectar la articulación (disartria), pero no produce este patrón agramatical característico.", consequence: "Si se hubiera tratado como un problema cerebeloso, se enfocaría la terapia en coordinación motora del habla (disartria), sin atender el verdadero origen frontal de su dificultad para encontrar las palabras." },
      ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. El lenguaje es un constructo de Sistemas Cognitivos; aquí falla su producción." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "Cercano, pero la afasia de Broca es un déficit del lenguaje como sistema (agramatismo), no una disartria por fallo motor del aparato fonatorio." },
          { text: "Procesos Sociales", correct: false, feedback: "Aunque afecta la comunicación, el déficit es lingüístico, no de cognición social." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "Hay frustración, pero el déficit nuclear es de lenguaje, no emocional." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Lenguaje (producción / expresión)", correct: true, feedback: "Correcto. Falla la producción del lenguaje (habla no fluida, agramatical), con comprensión preservada." },
          { text: "Acciones motoras", correct: false, feedback: "No es un fallo de control motor del habla (disartria); es un déficit del lenguaje como sistema simbólico — sabe qué decir pero no logra estructurarlo." },
          { text: "Memoria de trabajo", correct: false, feedback: "No hay un déficit en mantener información en mente; el problema es producir el lenguaje." },
          { text: "Atención", correct: false, feedback: "No hay un déficit atencional; el problema es específicamente la expresión del lenguaje." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (producción del habla observada)", correct: true, feedback: "Correcto. El habla telegráfica y con esfuerzo se observa directamente — una evidencia conductual del déficit de producción." },
          { text: "Circuitos", correct: false, feedback: "Hay sustrato frontal, pero la evidencia descrita en el caso es la observación de su habla, no neuroimagen funcional." },
          { text: "Autorreporte", correct: false, feedback: "Su frustración apoya el cuadro, pero la evidencia directa es la producción del habla observada." },
          { text: "Genes", correct: false, feedback: "El cuadro es por lesión focal, no por una causa genética." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este perfil?",
        options: [
          { text: "Evaluación formal del lenguaje (p. ej. test de Boston para el diagnóstico de las afasias)", correct: true, feedback: "Correcto. Permite caracterizar el perfil afásico: fluidez, comprensión, repetición y denominación, confirmando el patrón tipo Broca." },
          { text: "Escalas de Conners", correct: false, feedback: "Evalúan síntomas de TDAH; no aplican a este perfil afásico." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "Es un tamizaje nutricional; no aplica aquí." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no es relevante para una afasia." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 2, domainKey: "VN", unitKey: "CIR",
    intro: "Paciente acude a urgencias tras un episodio súbito e inesperado.",
    interview: [
      { q: "¿Qué síntomas físicos tuvo durante el episodio?", reveal: "Taquicardia intensa, sudoración profusa y sensación de terror abrumador." },
      { q: "¿Había algún peligro real presente en ese momento?", reveal: "Ninguno — estaba en su casa, en una situación completamente segura." },
      { q: "¿Qué muestran los estudios de neuroimagen?", reveal: "Hiperactivación amigdalina marcada durante los episodios registrados." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
        options: [
          { text: "Hipoactividad del núcleo accumbens (anhedonia)", correct: false, feedback: "El núcleo accumbens se relaciona con recompensa, no con el miedo agudo.", consequence: "Si se hubiera sospechado un problema de recompensa, se buscaría anhedonia o falta de motivación — síntomas que este paciente no tiene; su problema es el miedo intenso y súbito." },
          { text: "Hiperreactividad amigdalina (crisis de pánico)", correct: true, feedback: "Correcto. La amígdala hiperactiva genera respuestas de miedo intensas y desproporcionadas al estímulo real." },
          { text: "Disfunción cerebelosa (ataxia)", correct: false, feedback: "El cerebelo no está implicado en este cuadro de pánico.", consequence: "Si se hubiera atribuido a un problema cerebeloso, se buscarían problemas de equilibrio o coordinación, mientras los episodios de terror seguirían sin explicación ni tratamiento dirigido." },
          { text: "Lesión en la corteza somatosensorial", correct: false, feedback: "Esto afectaría la percepción del tacto, no episodios de terror y taquicardia.", consequence: "Si se hubiera enfocado en la percepción táctil, no se atendería el verdadero mecanismo: la hiperactivación amigdalina que dispara el miedo sin un peligro real presente." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas de Activación y Regulación", correct: false, feedback: "Este dominio cubre arousal general y ciclos sueño-vigilia, no la respuesta específica de miedo ante una amenaza." },
          { text: "Sistemas Cognitivos", correct: false, feedback: "No hay un déficit de atención, memoria o lenguaje en este cuadro." },
          { text: "Sistemas de Valencia Negativa", correct: true, feedback: "Correcto. El miedo agudo ante una amenaza (real o percibida) es el núcleo de este dominio." },
          { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal en este episodio de pánico." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Miedo agudo / amenaza potencial", correct: true, feedback: "Correcto. La respuesta intensa y súbita de terror, sin una amenaza real presente, corresponde al constructo de miedo agudo." },
          { text: "Ansiedad sostenida (amenaza distal)", correct: false, feedback: "La ansiedad sostenida es anticipación de un peligro futuro e incierto; aquí el episodio es agudo y súbito, no una preocupación prolongada." },
          { text: "Pérdida", correct: false, feedback: "El constructo de Pérdida se refiere a la ausencia de algo valorado, no a una crisis de terror." },
          { text: "Frustración no recompensada", correct: false, feedback: "Esto pertenece al dominio de Valencia Positiva, no al miedo." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Circuitos (hiperactivación amigdalina)", correct: true, feedback: "Correcto. La hiperactivación amigdalina registrada en neuroimagen durante los episodios es la evidencia directa a nivel de circuitos." },
          { text: "Autorreporte", correct: false, feedback: "El paciente reporta el terror, pero la evidencia directa citada en el caso es la neuroimagen (circuitos)." },
          { text: "Conducta", correct: false, feedback: "Acudir a urgencias es la conducta resultante, pero la evidencia directa descrita es la hiperactivación amigdalina." },
          { text: "Genes", correct: false, feedback: "No se describe evidencia genética en este caso." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este perfil?",
        options: [
          { text: "Inventario de pánico/ansiedad validado + registro de síntomas autonómicos", correct: true, feedback: "Correcto. Cuantificar la frecuencia e intensidad de las crisis y los síntomas autonómicos fundamenta el perfil de crisis de pánico." },
          { text: "WISC-V", correct: false, feedback: "Es para población infantil/adolescente y evalúa inteligencia, no crisis de pánico." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no aplica a este caso." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "Es un tamizaje nutricional; no aplica aquí." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, domainKey: "VP", unitKey: "CIR",
    intro: "Paciente con diagnóstico de depresión mayor, en seguimiento ambulatorio.",
    interview: [
      { q: "¿Qué reporta sobre actividades que antes disfrutaba?", reveal: "Dice que ya no le generan ningún placer, ni siquiera las que antes le encantaban." },
      { q: "¿Incluye esto experiencias sensoriales básicas, como la comida?", reveal: "Sí — incluso reporta que la comida 'ya no le sabe igual'." },
      { q: "¿Qué muestran los estudios funcionales?", reveal: "Hipoactividad marcada en el núcleo accumbens ante estímulos de recompensa." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neurológico?",
        options: [
          { text: "Hiperfunción amigdalina (hipervigilancia)", correct: false, feedback: "Esto produciría ansiedad o miedo excesivo, no pérdida de placer.", consequence: "Si se hubiera sospechado hiperactividad amigdalina, se buscarían síntomas de ansiedad o miedo excesivo, que no son el problema central; el paciente no tiene miedo, simplemente no siente placer." },
          { text: "Hipoactivación de la corteza orbitofrontal sin compromiso dopaminérgico", correct: false, feedback: "Cercano — la corteza orbitofrontal participa en la valoración de recompensas, pero la evidencia funcional descrita (núcleo accumbens) apunta directamente al circuito dopaminérgico mesolímbico.", consequence: "Si se hubiera asumido un problema orbitofrontal aislado sin compromiso dopaminérgico, se subestimaría el papel central del circuito de recompensa mesolímbico en la pérdida total de placer del paciente." },
          { text: "Lesión cerebelosa (ataxia)", correct: false, feedback: "El cerebelo no explica la pérdida de placer ante recompensas.", consequence: "Si se hubiera buscado una causa cerebelosa, se evaluaría coordinación motora, mientras la verdadera hipofunción del circuito de recompensa seguiría sin tratamiento." },
          { text: "Hipofunción del circuito de recompensa (núcleo accumbens - área tegmental ventral)", correct: true, feedback: "Correcto. La anhedonia se asocia a una menor respuesta del circuito dopaminérgico de recompensa." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "Este dominio cubre miedo, ansiedad y pérdida — la anhedonia es ausencia de placer, no presencia de afecto negativo." },
          { text: "Sistemas de Valencia Positiva", correct: true, feedback: "Correcto. Este dominio cubre recompensa, motivación y la capacidad de experimentar placer." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor en este caso." },
          { text: "Procesos Sociales", correct: false, feedback: "Aunque puede afectar las relaciones, el mecanismo central es la respuesta a la recompensa en general, no algo específicamente social." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Respuesta a la recompensa (capacidad de experimentar placer)", correct: true, feedback: "Correcto. La incapacidad de sentir placer ante estímulos antes gratificantes es una falla en la respuesta hedónica a la recompensa." },
          { text: "Respuesta anticipatoria a la recompensa", correct: false, feedback: "Cercano — pero el caso enfatiza que no DISFRUTA (respuesta consumatoria/hedónica), más que un problema de anticipación o 'querer'." },
          { text: "Miedo agudo", correct: false, feedback: "Pertenece a Valencia Negativa; aquí no hay miedo sino ausencia de placer." },
          { text: "Ansiedad sostenida", correct: false, feedback: "Pertenece a Valencia Negativa; no aplica a la anhedonia." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Circuitos (hipoactividad del núcleo accumbens)", correct: true, feedback: "Correcto. La hipoactividad del núcleo accumbens ante estímulos de recompensa, vista en estudios funcionales, es la evidencia directa a nivel de circuitos." },
          { text: "Autorreporte", correct: false, feedback: "El paciente reporta no sentir placer, pero la evidencia directa citada es la hipoactividad funcional (circuitos)." },
          { text: "Conducta", correct: false, feedback: "El retraimiento es observable, pero la evidencia directa descrita es funcional/de circuitos." },
          { text: "Genes", correct: false, feedback: "No se describe evidencia genética en este caso." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este perfil?",
        options: [
          { text: "Escala de anhedonia validada (p. ej. SHAPS) + inventario de depresión", correct: true, feedback: "Correcto. Cuantificar específicamente la capacidad hedónica, junto con la severidad depresiva, fundamenta el perfil de anhedonia." },
          { text: "WISC-V", correct: false, feedback: "Es para población infantil y evalúa inteligencia; no aplica a la anhedonia." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no aplica aquí." },
          { text: "Escala de Glasgow", correct: false, feedback: "Mide nivel de conciencia tras un evento agudo; no aplica a este caso." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, domainKey: "SM", unitKey: "CON",
    intro: "Paciente con antecedente de cirugía reciente en el cuerpo calloso.",
    interview: [
      { q: "¿Qué hace su mano izquierda sin que él lo pida?", reveal: "Se mueve por sí sola — abre cajones, toca objetos sin instrucción consciente." },
      { q: "¿Cómo describe esa sensación?", reveal: "Dice que esos movimientos no se sienten como propios, aunque sabe que es su mano." },
      { q: "¿Hay debilidad o parálisis en esa mano?", reveal: "No — tiene fuerza y movilidad normales; el problema es la sensación de agencia, no la capacidad motora." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué síndrome describe mejor este caso?",
        options: [
          { text: "Apraxia ideomotora", correct: false, feedback: "La apraxia es la incapacidad de ejecutar movimientos voluntarios a pedido, no movimientos involuntarios no deseados.", consequence: "Si se hubiera diagnosticado como apraxia, se esperaría que el paciente no pudiera ejecutar movimientos a pedido — pero aquí el problema es justo lo opuesto: su mano se mueve sola, sin que él lo pida." },
          { text: "Hemiparesia espástica", correct: false, feedback: "Aquí la mano se mueve activamente, no está débil ni paralizada.", consequence: "Si se hubiera tratado como debilidad muscular, se le habría dado fisioterapia de fuerza, cuando su mano tiene fuerza normal; el problema es la sensación de que esos movimientos no son suyos." },
          { text: "Distonía focal", correct: false, feedback: "La distonía implica contracciones musculares anormales sostenidas, no movimientos con propósito que se sienten ajenos.", consequence: "Si se hubiera asumido una distonía, se buscarían contracciones musculares sostenidas, mientras el verdadero fenómeno (movimientos con propósito que se sienten ajenos) seguiría sin explicación." },
          { text: "Síndrome de la mano ajena (lesión en cuerpo calloso / área motora suplementaria)", correct: true, feedback: "Correcto. Tras desconexión interhemisférica, una mano puede ejecutar acciones con propósito que el paciente no reconoce como voluntarias." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Sistemas Sensoriomotores", correct: true, feedback: "Correcto. Este dominio cubre el control y la sensación de agencia sobre las acciones motoras." },
          { text: "Sistemas Cognitivos", correct: false, feedback: "El núcleo del problema es la ejecución motora y la agencia sobre la acción, no un proceso cognitivo abstracto." },
          { text: "Procesos Sociales", correct: false, feedback: "Aunque resulta perturbador socialmente, el mecanismo central es motor, no interpersonal." },
          { text: "Sistemas de Valencia Positiva", correct: false, feedback: "No hay un componente de recompensa o motivación involucrado aquí." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Acciones motoras (agencia / control de la acción)", correct: true, feedback: "Correcto. Lo alterado es la sensación de agencia sobre la propia acción: la mano ejecuta movimientos con propósito que el paciente no reconoce como voluntarios." },
          { text: "Percepción somatosensorial", correct: false, feedback: "El paciente sí percibe su mano y sus movimientos; lo que falla es la sensación de ser el autor de esas acciones." },
          { text: "Control cognitivo", correct: false, feedback: "No es un fallo de inhibición cognitiva abstracta, sino de la agencia sobre la acción motora misma." },
          { text: "Atención", correct: false, feedback: "No hay un déficit atencional; el problema es la agencia motora." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (movimientos involuntarios con propósito observados)", correct: true, feedback: "Correcto. La mano abriendo cajones y tocando objetos sin instrucción consciente es una conducta observada directamente." },
          { text: "Circuitos", correct: false, feedback: "Hay sustrato calloso/área motora suplementaria, pero la evidencia descrita es la conducta observada, no neuroimagen funcional." },
          { text: "Autorreporte", correct: false, feedback: "El paciente describe que no siente los movimientos como propios, pero la evidencia directa del fenómeno es conductual." },
          { text: "Genes", correct: false, feedback: "El cuadro es secundario a una cirugía, no a una causa genética." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento o abordaje usarías para fundamentar este perfil?",
        options: [
          { text: "Exploración neuropsicológica de la agencia motora y praxias, con correlación a la neuroimagen de la lesión callosa", correct: true, feedback: "Correcto. Documentar los movimientos involuntarios con propósito y la pérdida de agencia, correlacionados con la lesión, fundamenta el síndrome de la mano ajena." },
          { text: "Escalas de Conners", correct: false, feedback: "Evalúan síntomas de TDAH; no aplican a este cuadro motor." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no es relevante aquí." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "Es un tamizaje nutricional; no aplica." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 4, domainKey: "COG", unitKey: "CON",
    intro: "Paciente con daño occipital bilateral tras un accidente, evaluado en seguimiento neurológico.",
    interview: [
      { q: "¿Cuál es su capacidad visual actual?", reveal: "Está completamente ciego según todas las pruebas objetivas." },
      { q: "¿Qué dice él sobre su propia visión?", reveal: "Insiste en que puede ver perfectamente y se molesta si se le dice lo contrario." },
      { q: "¿Qué pasa cuando se le pide describir el entorno?", reveal: "Confabula descripciones detalladas de objetos que en realidad no están ahí." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué síndrome describe mejor este caso?",
        options: [
          { text: "Negligencia espacial unilateral", correct: false, feedback: "La negligencia implica ignorar un lado del espacio, no negar una ceguera total.", consequence: "Si se hubiera diagnosticado como negligencia espacial, se esperaría que el paciente ignorara solo un lado del espacio — pero aquí está completamente ciego de ambos lados y, además, lo niega por completo." },
          { text: "Agnosia visual asociativa (ve pero no reconoce objetos)", correct: false, feedback: "Aquí el paciente no ve nada en absoluto, no es un problema de reconocimiento de objetos vistos.", consequence: "Si se hubiera asumido agnosia visual, se pensaría que el paciente sí ve pero no reconoce objetos; en realidad no ve absolutamente nada, y aun así insiste en que sí puede ver." },
          { text: "Ceguera cortical con negación de la ceguera (Síndrome de Anton)", correct: true, feedback: "Correcto. El Síndrome de Anton combina ceguera cortical total con anosognosia: el paciente no es consciente de su déficit." },
          { text: "Prosopagnosia (no reconoce rostros)", correct: false, feedback: "La prosopagnosia es específica de rostros; aquí hay ceguera total con negación, no un déficit selectivo.", consequence: "Si se hubiera diagnosticado como prosopagnosia, se buscaría un déficit selectivo de rostros, cuando el paciente tiene ceguera total y confabula ver objetos que no existen." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece este fenómeno?",
        options: [
          { text: "Procesos Sociales", correct: false, feedback: "La negación no es un fenómeno social; es una falla en el monitoreo del propio déficit perceptivo." },
          { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. La percepción visual (y su monitoreo consciente) se ubica en Sistemas Cognitivos, constructo de Percepción." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "Este dominio cubre miedo, ansiedad y pérdida — no aplica a un déficit perceptivo puro." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "Este dominio cubre la acción motora, no la percepción visual consciente." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Percepción (visual) y su monitoreo consciente", correct: true, feedback: "Correcto. Falla la percepción visual (ceguera cortical) junto con la conciencia del déficit (anosognosia), por eso confabula que ve." },
          { text: "Atención espacial", correct: false, feedback: "No es ignorar un lado del espacio (negligencia); es ceguera total con negación del déficit." },
          { text: "Memoria declarativa", correct: false, feedback: "No hay un déficit de memoria; el problema es perceptivo y de conciencia del déficit." },
          { text: "Lenguaje", correct: false, feedback: "El lenguaje está intacto — de hecho confabula con fluidez; el déficit es perceptivo." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (confabulación y desempeño visual observados)", correct: true, feedback: "Correcto. Que describa objetos inexistentes y choque con cosas pese a negar su ceguera es evidencia conductual directa del cuadro." },
          { text: "Autorreporte", correct: false, feedback: "El autorreporte aquí es engañoso (el paciente insiste en que ve); la evidencia válida es su conducta observada, no lo que afirma." },
          { text: "Circuitos", correct: false, feedback: "Hay daño occipital, pero la evidencia descrita es la conducta observada, no neuroimagen funcional." },
          { text: "Genes", correct: false, feedback: "El cuadro es secundario a un accidente, no a una causa genética." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento o abordaje usarías para fundamentar este perfil?",
        options: [
          { text: "Evaluación neuropsicológica de la función visual y de la conciencia del déficit (anosognosia), con la neuroimagen occipital", correct: true, feedback: "Correcto. Documentar la ceguera cortical objetiva junto con la falta de conciencia del déficit, correlacionadas con la lesión occipital, fundamenta el síndrome de Anton." },
          { text: "Escalas de Conners", correct: false, feedback: "Evalúan síntomas de TDAH; no aplican a este cuadro." },
          { text: "SRS-2", correct: false, feedback: "Evalúa rasgos del espectro autista; no es relevante aquí." },
          { text: "Mini Nutritional Assessment (MNA)", correct: false, feedback: "Es un tamizaje nutricional; no aplica." },
        ]
      }
    ]
  },
  {
    level: 3, difficulty: 4, domainKey: "AR", unitKey: "FIS",
    intro: "Paciente en evaluación psiquiátrica, traído por su familia preocupada.",
    interview: [
      { q: "¿Cómo ha estado durmiendo esta semana?", reveal: "Menos de 3 horas por noche, durante al menos siete días consecutivos." },
      { q: "¿Reporta cansancio por dormir tan poco?", reveal: "No — dice sentirse 'lleno de energía constante', sin necesidad de descansar." },
      { q: "¿Qué muestran los registros de actigrafía?", reveal: "Hiperactivación sostenida durante todo el período, día y noche." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neuropsicológico?",
        options: [
          { text: "Narcolepsia", correct: false, feedback: "La narcolepsia causa somnolencia excesiva diurna, justo lo opuesto a este cuadro.", consequence: "Si se hubiera diagnosticado como narcolepsia, se esperaría somnolencia excesiva durante el día — pero el paciente no se siente cansado en absoluto, todo lo contrario." },
          { text: "Hiperarousal / desregulación de la activación (episodio maníaco)", correct: true, feedback: "Correcto. La manía se caracteriza por un estado sostenido de activación elevada, con menor necesidad de sueño." },
          { text: "Apnea obstructiva del sueño", correct: false, feedback: "La apnea produce sueño fragmentado y fatiga diurna, no esta sensación de energía constante.", consequence: "Si se hubiera asumido apnea del sueño, se buscaría fatiga diurna por sueño fragmentado, mientras el verdadero estado de hiperactivación sostenida seguiría sin tratamiento dirigido." },
          { text: "Trastorno de pánico", correct: false, feedback: "El pánico produce episodios agudos de miedo intenso, no un estado sostenido de activación durante días.", consequence: "Si se hubiera tratado como pánico, se esperarían episodios agudos y breves de miedo intenso, no este estado sostenido de energía elevada durante días completos." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece?",
        options: [
          { text: "Sistemas de Valencia Positiva", correct: false, feedback: "Aunque la manía puede incluir euforia, el fenómeno nuclear aquí es el nivel de activación sostenido, no la recompensa." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor central en este caso." },
          { text: "Sistemas de Activación y Regulación", correct: true, feedback: "Correcto. Este dominio cubre arousal y los ciclos sueño-vigilia, exactamente lo alterado aquí." },
          { text: "Sistemas Cognitivos", correct: false, feedback: "El habla acelerada puede tener un componente cognitivo, pero el fenómeno central es la activación, no la cognición." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Ritmos circadianos", correct: false, feedback: "Cercano — los ritmos circadianos se alteran en la manía, pero el constructo nuclear aquí es el nivel general de activación/arousal sostenido, no específicamente el reloj biológico de 24h." },
          { text: "Activación (arousal)", correct: true, feedback: "Correcto. El estado sostenido de alta energía y reactividad sin fatiga es el constructo de arousal." },
          { text: "Sueño-Vigilia", correct: false, feedback: "Este constructo describe la transición entre dormir y despertar, no el nivel general de activación durante la vigilia." },
          { text: "Homeostasis", correct: false, feedback: "No es un constructo específico de la matriz RDoC en este dominio." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Genes", correct: false, feedback: "Hay heredabilidad en el trastorno bipolar, pero la evidencia directa mencionada en el caso es de actigrafía." },
          { text: "Circuitos", correct: false, feedback: "No se menciona evidencia de circuitos específicos en este caso." },
          { text: "Conducta", correct: false, feedback: "El habla acelerada es conducta, pero la medida objetiva citada es fisiológica (actigrafía)." },
          { text: "Fisiología (medida por actigrafía/EEG)", correct: true, feedback: "Correcto. Los registros de actigrafía que muestran hiperactivación sostenida son una medida fisiológica directa." },
        ]
      }
    ]
  },
  {
    level: 3, difficulty: 4, domainKey: "COG", unitKey: "CIR",
    intro: "Paciente consulta por una conducta que interfiere significativamente con su rutina diaria.",
    interview: [
      { q: "¿Qué conducta repite antes de salir de casa?", reveal: "Revisa la estufa más de 20 veces, aunque sabe racionalmente que ya está apagada." },
      { q: "¿Puede detener esa conducta por sí mismo?", reveal: "No — no logra inhibir el impulso de comprobarlo una y otra vez, pese a reconocer que es innecesario." },
      { q: "¿Qué muestra la neuroimagen?", reveal: "Hiperactivación marcada del circuito córtico-estriado-tálamo-cortical." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué está ocurriendo a nivel neuropsicológico?",
        options: [
          { text: "Degeneración de ganglios basales (Parkinson)", correct: false, feedback: "El Parkinson produce bradicinesia y temblor, no compulsiones de revisión.", consequence: "Si se hubiera sospechado Parkinson, se buscaría temblor y lentitud de movimientos, mientras la verdadera compulsión de revisar la estufa seguiría sin abordarse." },
          { text: "Hipoactivación prefrontal dorsolateral pura", correct: false, feedback: "El patrón descrito en TOC es de hiperactivación del circuito, no hipoactivación pura.", consequence: "Si se hubiera asumido una hipoactivación prefrontal pura, se subestimaría que el circuito está en realidad hiperactivo, no apagado — un error que llevaría a un enfoque de tratamiento equivocado." },
          { text: "Hiperactivación del circuito córtico-estriado-tálamo-cortical (TOC)", correct: true, feedback: "Correcto. Este circuito hiperactivo se asocia consistentemente al trastorno obsesivo-compulsivo." },
          { text: "Lesión cerebelosa", correct: false, feedback: "El cerebelo no es el circuito central implicado en el TOC.", consequence: "Si se hubiera buscado una causa cerebelosa, se evaluaría coordinación motora, mientras la incapacidad de inhibir la conducta de revisión seguiría intacta." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece?",
        options: [
          { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "Aunque la ansiedad puede acompañar al TOC, el déficit nuclear aquí es la incapacidad de inhibir una respuesta, un proceso cognitivo." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "Revisar la estufa es una acción motora, pero el déficit central es la falla en el control cognitivo de esa acción." },
          { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. La incapacidad de inhibir una respuesta pese a saber que es innecesaria es un fallo de Control Cognitivo." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Atención sostenida", correct: false, feedback: "La atención sostenida es mantener el foco en una tarea, no inhibir una respuesta repetitiva." },
          { text: "Control cognitivo (inhibición de respuesta)", correct: true, feedback: "Correcto. La incapacidad de detener una conducta repetitiva pese a saber que es innecesaria es el núcleo del control cognitivo/inhibición." },
          { text: "Memoria de trabajo", correct: false, feedback: "La memoria de trabajo es mantener información activa mentalmente, no inhibir una acción compulsiva." },
          { text: "Lenguaje", correct: false, feedback: "No hay ningún componente lingüístico en este caso." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Autorreporte", correct: false, feedback: "El paciente sí reporta el conflicto, pero la evidencia objetiva citada en el caso es de neuroimagen." },
          { text: "Circuitos (córtico-estriado-tálamo-cortical)", correct: true, feedback: "Correcto. La hiperactivación de este circuito específico es la evidencia directa mencionada." },
          { text: "Genes", correct: false, feedback: "Hay heredabilidad en el TOC, pero la evidencia directa citada aquí es de neuroimagen funcional." },
          { text: "Paradigmas", correct: false, feedback: "Los paradigmas son tareas experimentales para medir un constructo, no la evidencia biológica en sí." },
        ]
      }
    ]
  },
  {
    level: 3, difficulty: 5, domainKey: "SOC", unitKey: "CIR",
    intro: "Paciente con diagnóstico de esquizofrenia de larga evolución, en seguimiento por su equipo tratante.",
    interview: [
      { q: "¿Cómo describen su expresión emocional?", reveal: "Aplanamiento afectivo marcado — su rostro y voz muestran muy poca variación emocional." },
      { q: "¿Cómo le va prediciendo lo que otros sienten o piensan?", reveal: "Tiene gran dificultad — no logra predecir, por ejemplo, que un personaje de una historia se sentiría engañado." },
      { q: "¿Qué muestra la neuroimagen durante tareas sociales?", reveal: "Hipoactivación en la unión temporoparietal y la corteza prefrontal medial." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Síndrome amnésico puro", correct: false, feedback: "No hay un déficit de memoria descrito; el problema es inferir estados mentales ajenos.", consequence: "Si se hubiera diagnosticado como un problema de memoria, se evaluaría su capacidad de recordar información, mientras su verdadera dificultad — inferir lo que otros piensan o sienten — seguiría sin atenderse." },
          { text: "Déficit en cognición social / teoría de la mente (síntomas negativos de esquizofrenia)", correct: true, feedback: "Correcto. La dificultad para inferir pensamientos y emociones ajenas es un déficit clásico de teoría de la mente." },
          { text: "Apraxia constructiva", correct: false, feedback: "La apraxia constructiva afecta tareas visoespaciales/motoras, no la inferencia social.", consequence: "Si se hubiera sospechado apraxia constructiva, se le pondrían pruebas de dibujo y construcción, sin abordar el déficit central de cognición social." },
          { text: "Síndrome disejecutivo puro (sin componente social)", correct: false, feedback: "Aunque hay solapamiento con función ejecutiva, el déficit central descrito es específicamente social/inferencial.", consequence: "Si se hubiera tratado solo como un problema ejecutivo general, se trabajaría en planificación y flexibilidad cognitiva, sin enfocarse específicamente en su dificultad para entender los estados mentales de otras personas." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece?",
        options: [
          { text: "Sistemas Cognitivos", correct: false, feedback: "Aunque la teoría de la mente usa recursos cognitivos generales, RDoC la clasifica específicamente bajo Procesos Sociales." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de miedo o pérdida central en este caso." },
          { text: "Procesos Sociales", correct: true, feedback: "Correcto. La comprensión de los demás es uno de los constructos nucleares de este dominio." },
          { text: "Sistemas de Valencia Positiva", correct: false, feedback: "No hay un componente de recompensa o motivación central aquí." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Afiliación y unión social", correct: false, feedback: "Esto se refiere al deseo de cercanía social, no a la capacidad de inferir estados mentales." },
          { text: "Comunicación no verbal", correct: false, feedback: "Es un constructo relacionado, pero el déficit descrito es específicamente de inferencia mental, no de expresión/lectura de gestos." },
          { text: "Comprensión de los demás (inferencia mental / teoría de la mente)", correct: true, feedback: "Correcto. Este constructo cubre exactamente la capacidad de inferir pensamientos y emociones ajenas." },
          { text: "Percepción de sí mismo", correct: false, feedback: "El déficit descrito es sobre inferir la mente de OTROS, no la autopercepción." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
          { text: "Genes", correct: false, feedback: "Aunque hay un componente genético en la esquizofrenia, aquí la evidencia directa citada es de neuroimagen funcional." },
          { text: "Circuitos (unión temporoparietal - corteza prefrontal medial)", correct: true, feedback: "Correcto. La hipoactivación en estas regiones durante tareas sociales es la evidencia directa mencionada." },
          { text: "Autorreporte", correct: false, feedback: "El paciente no necesariamente reporta el déficit; se observa conductualmente y por neuroimagen." },
          { text: "Fisiología", correct: false, feedback: "Medidas como ritmo cardíaco no son lo relevante aquí; la evidencia citada es de circuitos cerebrales." },
        ]
      }
    ]
  },
  {
    level: 3, difficulty: 5, domainKey: "VN", unitKey: "CIR",
    intro: "Paciente con una condición genética rara (enfermedad de Urbach-Wiethe), derivado para evaluación neuropsicológica.",
    interview: [
      { q: "¿Qué muestra la neuroimagen estructural?", reveal: "Calcificación bilateral de la amígdala, confirmada por TC." },
      { q: "¿Cómo reacciona ante estímulos típicamente temidos (arañas, películas de terror)?", reveal: "No muestra miedo en absoluto ante ninguno de estos estímulos." },
      { q: "¿Se ha visto en situaciones de peligro real?", reveal: "Sí — se ha acercado sin dudar a situaciones objetivamente peligrosas, sin mostrar ninguna cautela." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué región está dañada?",
        options: [
          { text: "Corteza prefrontal ventromedial", correct: false, feedback: "Esta región se asocia más a toma de decisiones y regulación emocional, no a la ausencia total de miedo.", consequence: "Si se hubiera asumido daño prefrontal ventromedial, se buscarían problemas de toma de decisiones y regulación emocional general, mientras la ausencia total y específica de miedo seguiría sin una explicación precisa." },
          { text: "Lesión bilateral de la amígdala (ausencia de miedo)", correct: true, feedback: "Correcto. La amígdala bilateral es central para generar la respuesta de miedo ante amenazas." },
          { text: "Ínsula", correct: false, feedback: "La ínsula se relaciona más con asco e interocepción, no con la ausencia específica de miedo.", consequence: "Si se hubiera sospechado daño insular, se buscaría una alteración del asco o la interocepción, no la ausencia completa de miedo ante el peligro real." },
          { text: "Tálamo bilateral", correct: false, feedback: "El tálamo es una estación de relevo sensorial general, no el centro específico del miedo.", consequence: "Si se hubiera asumido daño talámico bilateral, se esperarían alteraciones sensoriales generales, mientras la incapacidad específica de sentir miedo seguiría sin atribuirse a su verdadero origen amigdalino." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece?",
        options: [
          { text: "Sistemas de Activación y Regulación", correct: false, feedback: "Este dominio es sobre arousal general, no sobre la respuesta específica de miedo." },
          { text: "Sistemas Cognitivos", correct: false, feedback: "No hay un déficit de atención, memoria o lenguaje aquí." },
          { text: "Sistemas de Valencia Negativa", correct: true, feedback: "Correcto. El miedo es el constructo central de este dominio." },
          { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Ansiedad sostenida (amenaza distal/incertidumbre)", correct: false, feedback: "La ansiedad sostenida es una respuesta a amenazas inciertas o futuras; aquí falla la respuesta a amenazas inmediatas y concretas." },
          { text: "Pérdida", correct: false, feedback: "El constructo de Pérdida se refiere a la respuesta ante la ausencia de algo valorado, no al miedo ante el peligro." },
          { text: "Frustración no recompensada", correct: false, feedback: "Esto pertenece al dominio de Valencia Positiva, no al de miedo." },
          { text: "Miedo agudo / amenaza potencial", correct: true, feedback: "Correcto. Este constructo cubre la respuesta inmediata ante un peligro presente y claro — justo lo que falla en este paciente." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Autorreporte", correct: false, feedback: "El autorreporte (el paciente dice no sentir miedo) es útil, pero es una medida indirecta del mecanismo subyacente." },
          { text: "Genes", correct: false, feedback: "Aunque la causa es genética (Urbach-Wiethe), la alteración funcional que produce la ausencia de miedo se documenta mejor en el circuito mismo." },
          { text: "Circuitos", correct: true, feedback: "Correcto — aunque también se nota en el autorreporte, el circuito amígdala-tronco encefálico es donde se documenta más directamente esta alteración." },
          { text: "Conducta", correct: false, feedback: "La conducta de acercamiento sin temor es observable, pero el mecanismo explicativo más directo está en el circuito." },
        ]
      }
    ]
  },
  // ===== CASOS INFANTOJUVENILES =====
  {
    level: 2, difficulty: 2, grupo: "Infantojuvenil", domainKey: "AR", unitKey: "CON",
    intro: "Profesora de tercer año refiere a un niño de 8 años por bajo rendimiento académico, a pesar de que en casa parece comprender los temas cuando se le explican individualmente.",
    interview: [
      { q: "¿Cómo describen su comportamiento en clase?", reveal: "Se queda 'mirando al vacío', como ensimismado, varias veces durante la clase — no es que se distraiga con el ruido del salón, simplemente 'se va'." },
      { q: "¿Hay movimiento excesivo o impulsividad?", reveal: "No — de hecho es un niño tranquilo, callado, que rara vez interrumpe o se levanta de su lugar." },
      { q: "¿Cómo lo describen los padres en casa?", reveal: "Dicen que 'vive en su mundo', que se le tiene que repetir las cosas varias veces y que parece estar pensando en otra cosa todo el tiempo." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "TDAH de presentación hiperactiva-impulsiva", correct: false, feedback: "Este subtipo se caracteriza por hiperactividad e impulsividad marcadas — el niño descrito es tranquilo y callado, sin esos síntomas.", consequence: "Si se hubiera tratado como TDAH hiperactivo, se buscarían intervenciones para impulsividad y movimiento excesivo, sin atender el verdadero patrón de desconexión interna del niño." },
          { text: "Síndrome de Desconexión Cognitiva (antes llamado tiempo cognitivo lento)", correct: true, feedback: "Correcto. La desconexión interna, el 'ensimismamiento' y la lentitud cognitiva, sin hiperactividad ni impulsividad, son el perfil característico de este síndrome — distinto del TDAH inatento clásico." },
          { text: "Discapacidad intelectual leve", correct: false, feedback: "El niño comprende bien el contenido cuando se le explica individualmente; el problema es sostener el enganche atencional en el aula, no la capacidad de comprensión general.", consequence: "Si se hubiera diagnosticado como discapacidad intelectual, se le habría colocado en un programa con expectativas académicas reducidas, cuando en realidad su capacidad de comprensión es adecuada — solo necesita apoyo para mantenerse 'conectado'." },
          { text: "Trastorno de ansiedad de separación", correct: false, feedback: "No hay evidencia de ansiedad relacionada con la separación de figuras de apego; el patrón descrito es de desconexión cognitiva, no de angustia.", consequence: "Si se hubiera tratado como ansiedad, se trabajaría en manejo de angustia, sin abordar el verdadero patrón de desconexión interna que afecta su aprendizaje." },
        ]
      },
      {
        type: "dominio", prompt: "¿A qué dominio RDoC pertenece el déficit central de este caso?",
        options: [
          { text: "Sistemas de Activación y Regulación", correct: true, feedback: "Correcto. El 'ensimismamiento' y la lentitud para sostener el enganche atencional reflejan una desregulación del nivel de activación (arousal), núcleo de este dominio." },
          { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de miedo, ansiedad o pérdida en este caso; el problema es de activación y enganche, no emocional." },
          { text: "Procesos Sociales", correct: false, feedback: "Aunque afecta su desempeño escolar, el déficit central no es interpersonal sino de regulación de la activación atencional." },
          { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor en este caso." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructo específico está alterado?",
        options: [
          { text: "Ritmos circadianos", correct: false, feedback: "No hay alteración del reloj biológico de 24h ni del ciclo sueño-vigilia; el problema es el nivel de activación durante la vigilia." },
          { text: "Activación (arousal)", correct: true, feedback: "Correcto. La dificultad para mantener un nivel de activación suficiente para engancharse con la tarea —ese 'irse' mentalmente— corresponde al constructo de arousal." },
          { text: "Atención (control cognitivo)", correct: false, feedback: "Cercano, pero en el SDC el problema nuclear es de bajo arousal/enganche, no de control atencional voluntario como en el TDAH inatento clásico — es justo lo que distingue ambos cuadros." },
          { text: "Sueño-Vigilia", correct: false, feedback: "Este constructo describe la transición entre dormir y despertar, no la desconexión atencional durante la vigilia." },
        ]
      },
      {
        type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?",
        options: [
          { text: "Conducta (observación en aula y reporte de padres)", correct: true, feedback: "Correcto. El 'mirar al vacío' observado por la maestra y la descripción de los padres son evidencia conductual directa, base de la evaluación en este caso." },
          { text: "Circuitos", correct: false, feedback: "No se menciona ninguna evidencia de neuroimagen en este caso." },
          { text: "Genes", correct: false, feedback: "No se describe ninguna evidencia genética en este caso." },
          { text: "Fisiología", correct: false, feedback: "No se describen medidas fisiológicas (como actigrafía o EEG) en este caso." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué combinación de datos hace MENOS probable un trastorno neurodegenerativo y orienta hacia una causa autoinmune?",
        options: [
          { text: "Que tiene 69 años", correct: false, feedback: "La edad por sí sola no orienta hacia una causa autoinmune frente a una degenerativa." },
          { text: "La confusión marcadamente fluctuante con mioclonías, junto a anticuerpos antitiroideos muy elevados y otras causas ya descartadas", correct: true, feedback: "Exacto. Los procesos degenerativos clásicos no fluctúan tan marcadamente día a día ni cursan típicamente con mioclonías; sumado a los anticuerpos elevados y al descarte de otras causas, el patrón apunta a una encefalopatía autoinmune potencialmente reversible. Integrar varios datos a la vez es la clave." },
          { text: "Que la trajo su familia", correct: false, feedback: "Quién la trae no orienta el diagnóstico etiológico." },
          { text: "Que tiene movimientos anormales", correct: false, feedback: "Las mioclonías son una pieza, pero por sí solas no bastan; lo decisivo es integrarlas con la fluctuación y el dato autoinmune." },
        ]
      },
      {
        type: "dominio", prompt: "Hay mioclonías. ¿Por qué la función que DEFINE el cuadro se ubica en Activación y Regulación y no en Sensoriomotores?",
        options: [
          { text: "Porque tiene antecedente tiroideo", correct: false, feedback: "El antecedente tiroideo orienta la causa, pero no es el argumento sobre qué función define el cuadro." },
          { text: "Porque el rasgo que define el cuadro es la fluctuación del nivel de conciencia; las mioclonías son un signo acompañante, no el déficit central", correct: true, feedback: "Correcto. Aunque haya un componente motor (mioclonías), lo que caracteriza y define el cuadro es la alternancia entre lucidez y confusión —una fluctuación del arousal—, que corresponde a Activación y Regulación." },
          { text: "Porque tiene movimientos anormales", correct: false, feedback: "Justamente los movimientos podrían sugerir Sensoriomotores; el argumento es que lo DEFINITORIO es la fluctuación de la conciencia." },
          { text: "Porque los estudios fueron negativos", correct: false, feedback: "El descarte de otras causas apoya el diagnóstico, pero no es el argumento sobre el dominio de la función central." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que el constructo central sea 'arousal/nivel de conciencia' y no 'atención sostenida'?",
        options: [
          { text: "Que la atención varía precisamente porque fluctúa el nivel de conciencia subyacente; no es que la conciencia esté estable y solo falle mantener el foco", correct: true, feedback: "Correcto. La atención sostenida supone una conciencia preservada con dificultad para enfocar. Aquí el propio nivel de conciencia sube y baja (días lúcidos y días muy confundidos), así que el constructo primario es el arousal." },
          { text: "Que tiene mioclonías", correct: false, feedback: "Las mioclonías son un signo motor acompañante, no definen si el constructo es arousal o atención." },
          { text: "Que tiene anticuerpos elevados", correct: false, feedback: "Los anticuerpos señalan la causa, no distinguen entre arousal y atención." },
          { text: "Que tiene 69 años", correct: false, feedback: "La edad no determina el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué el mecanismo se evidencia mejor en 'fisiología' que en 'conducta'?",
        options: [
          { text: "Porque los anticuerpos antitiroideos muy elevados (con otras causas descartadas) son el marcador objetivo del mecanismo autoinmune; la confusión observable es solo su efecto", correct: true, feedback: "Correcto. La conducta (confusión) muestra el efecto del cuadro; el marcador fisiológico (anticuerpos) revela el mecanismo autoinmune subyacente. Para fundamentar la causa, la evidencia directa es fisiológica." },
          { text: "Porque la familia la trajo", correct: false, feedback: "Quién la trae no define la unidad de análisis del mecanismo." },
          { text: "Porque la confusión fluctúa", correct: false, feedback: "La fluctuación es la manifestación conductual/cognitiva; el mecanismo se evidencia en el marcador fisiológico." },
          { text: "Porque tiene mioclonías", correct: false, feedback: "Las mioclonías son un signo, pero el marcador que demuestra el mecanismo autoinmune es el dato fisiológico (anticuerpos)." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "Escalas de Conners (padres/maestros)", correct: false, feedback: "Las escalas de Conners están diseñadas específicamente para síntomas de TDAH (inatención, hiperactividad, impulsividad), no capturan bien el perfil de desconexión interna característico del SDC." },
          { text: "Child Concentration Inventory (CCI)", correct: true, feedback: "Correcto. El CCI es el instrumento desarrollado específicamente para evaluar síntomas de Síndrome de Desconexión Cognitiva, distinguiéndolo de los síntomas atencionales del TDAH." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V evalúa inteligencia general, útil para descartar discapacidad intelectual, pero no es el instrumento específico para perfilar síntomas de desconexión cognitiva." },
          { text: "BANFE-3", correct: false, feedback: "BANFE-3 evalúa funciones ejecutivas; aunque podría aportar información complementaria, no es el instrumento diseñado específicamente para medir este síndrome." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 2, grupo: "Infantojuvenil", domainKey: "SOC", unitKey: "CON",
    intro: "Niño de 10 años es referido por su maestra debido a dificultades para integrarse con sus compañeros, aunque académicamente es uno de los mejores de su grupo.",
    interview: [
      { q: "¿Cómo es su lenguaje y vocabulario?", reveal: "Su lenguaje es muy elaborado para su edad, con vocabulario amplio y formal — habla 'como adulto' sobre sus temas de interés." },
      { q: "¿Cómo interactúa socialmente con sus compañeros?", reveal: "Le cuesta entender las bromas, el sarcasmo y las reglas no escritas de la convivencia; prefiere hablar extensamente de sus temas de interés sin notar si el otro está aburrido. Sus padres confirman que estas características están presentes desde que era muy pequeño, no aparecieron de golpe." },
      { q: "¿Hay intereses o rutinas particulares?", reveal: "Tiene un interés muy intenso y específico (por ejemplo, trenes o mapas) sobre el que puede hablar durante horas, y se altera si se interrumpe su rutina habitual." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno de ansiedad social", correct: false, feedback: "La ansiedad social implica evitar el contacto social por miedo al juicio; aquí el niño busca interactuar pero no capta bien las reglas sociales implícitas.", consequence: "Si se hubiera tratado como ansiedad social, se trabajaría en reducir el miedo a la evaluación social, sin atender la verdadera dificultad para decodificar claves sociales implícitas." },
          { text: "Trastorno del Espectro Autista con capacidades intelectivas y de lenguaje preservadas", correct: true, feedback: "Correcto. El lenguaje formal y elaborado, los intereses intensos y restringidos, y la dificultad para las reglas sociales implícitas (pese a un buen nivel intelectual) son el perfil característico — antes descrito como Síndrome de Asperger." },
          { text: "Trastorno Negativista Desafiante", correct: false, feedback: "Este trastorno implica conductas de oposición y desafío deliberado hacia figuras de autoridad; no hay evidencia de esto en el caso, que es más bien de dificultad en comprensión social.", consequence: "Si se hubiera tratado como negativismo desafiante, se aplicarían estrategias de manejo conductual para desafío a la autoridad, sin atender la verdadera dificultad de comprensión social." },
          { text: "Discapacidad intelectual", correct: false, feedback: "El niño tiene un desempeño académico sobresaliente y un lenguaje muy elaborado — lo opuesto a un perfil de discapacidad intelectual.", consequence: "Si se hubiera diagnosticado discapacidad intelectual, se subestimarían sus capacidades cognitivas reales, afectando las expectativas académicas que se le plantean." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato distingue MEJOR este cuadro de un trastorno de ansiedad social?",
        options: [
          { text: "Que tiene un buen desempeño académico", correct: false, feedback: "El rendimiento académico no distingue ambos cuadros; un niño con ansiedad social también puede ir bien en lo académico." },
          { text: "Que BUSCA hablar de sus temas pero no capta las reglas sociales implícitas, en vez de EVITAR el contacto por miedo al juicio", correct: true, feedback: "Exacto. La ansiedad social es evitación por temor a ser evaluado; aquí el niño se acerca e interactúa, pero falla en decodificar las claves sociales. Esa diferencia entre 'no puede' y 'teme' es la clave." },
          { text: "Que tiene un vocabulario amplio para su edad", correct: false, feedback: "El lenguaje elaborado apoya el perfil del espectro, pero no es lo que descarta la ansiedad social específicamente." },
          { text: "Que prefiere actividades estructuradas", correct: false, feedback: "Es un rasgo asociado, pero no el criterio que diferencia del miedo a la evaluación social propio de la ansiedad social." },
        ]
      },
      {
        type: "dominio", prompt: "Un colega argumenta que esto es Sistemas Cognitivos porque 'procesar lo social requiere cognición'. ¿Qué justifica clasificarlo en Procesos Sociales?",
        options: [
          { text: "Porque el niño tiene buen nivel intelectual general", correct: false, feedback: "Su capacidad cognitiva general está preservada, pero eso no es el argumento para asignar el dominio." },
          { text: "Porque el déficit es específico de la reciprocidad y la lectura de claves sociales, no un fallo cognitivo general que afecte por igual otras tareas", correct: true, feedback: "Correcto. RDoC separa Procesos Sociales precisamente porque el déficit es selectivo de lo interpersonal: el niño razona bien en lo no-social pero falla en decodificar al otro. Esa especificidad lo ubica en Procesos Sociales." },
          { text: "Porque habla mucho de sus temas de interés", correct: false, feedback: "Describe una conducta, no justifica la elección de dominio." },
          { text: "Porque se altera si cambia su rutina", correct: false, feedback: "Es un rasgo del espectro, pero no el argumento sobre por qué el dominio es social y no cognitivo." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué tendría que fallar para que el constructo fuese 'afiliación y unión social' en vez de 'comprensión de los demás'?",
        options: [
          { text: "Que el niño no tuviera ningún deseo de cercanía ni interés en vincularse con otros", correct: true, feedback: "Correcto. Afiliación se refiere al deseo de vínculo. Como el niño SÍ busca interactuar pero no logra interpretar al otro, lo alterado es la comprensión social, no la afiliación." },
          { text: "Que hablara aún más de sus temas de interés", correct: false, feedback: "Eso sigue reflejando dificultad para leer al interlocutor (comprensión), no falta de deseo de vínculo." },
          { text: "Que tuviera mejor vocabulario", correct: false, feedback: "El vocabulario no define este constructo." },
          { text: "Que evitara a sus compañeros por miedo", correct: false, feedback: "Eso describiría ansiedad social, no el constructo de afiliación." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia de este caso es 'conducta' y no 'circuitos'?",
        options: [
          { text: "Porque la información proviene de observar sus interacciones reales, no de estudios de neuroimagen", correct: true, feedback: "Correcto. La unidad la define la fuente de evidencia: aquí es la observación directa de su conducta social, no una medición de circuitos cerebrales." },
          { text: "Porque el TEA no tiene base en circuitos cerebrales", correct: false, feedback: "Incorrecto: el TEA sí involucra circuitos; el punto es que en ESTE caso la evidencia disponible es conductual, no de neuroimagen." },
          { text: "Porque es un niño y no se pueden estudiar sus circuitos", correct: false, feedback: "Los circuitos sí pueden estudiarse en niños; lo que define la unidad es la evidencia realmente usada en el caso." },
          { text: "Porque la maestra hizo la observación", correct: false, feedback: "Quién observa no es lo decisivo; lo es que se trata de observación de conducta." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "SRS-2 (Escala de Respuesta Social)", correct: true, feedback: "Correcto. La SRS-2 evalúa específicamente rasgos del espectro autista en el funcionamiento social recíproco, ideal para perfilar este caso." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners se centran en síntomas de TDAH, no en el perfil de comunicación social característico del espectro autista." },
          { text: "Test de Stroop", correct: false, feedback: "El Stroop evalúa control inhibitorio/atención selectiva, no el perfil de comunicación social que se necesita caracterizar aquí." },
          { text: "Escala de Depresión Geriátrica de Yesavage", correct: false, feedback: "Esta escala está diseñada para tamizaje afectivo en adultos mayores, no aplica a un niño ni al perfil que se busca evaluar." },
        ]
      },
      {
        type: "contexto", prompt: "Más allá de la celda de la matriz, ¿qué dimensión transversal de RDoC es clave para leer este caso?",
        options: [
          { text: "Neurodesarrollo — es un perfil presente desde etapas tempranas, que se interpreta a lo largo de la trayectoria del desarrollo del niño.", correct: true, feedback: "Correcto. El TEA es del neurodesarrollo: su expresión y los apoyos que necesita dependen del momento evolutivo, no de un evento aislado." },
          { text: "Ambiente — el cuadro se explica sobre todo por un factor de estrés reciente.", correct: false, feedback: "No hay un desencadenante ambiental agudo; el rasgo definitorio es su carácter del neurodesarrollo, presente desde la infancia." },
          { text: "Ninguna — basta con ubicar el dominio y la unidad de análisis.", correct: false, feedback: "RDoC actual subraya que la celda no es plana: aquí el neurodesarrollo es esencial para el pronóstico y los apoyos." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 2, grupo: "Infantojuvenil", domainKey: "AR", unitKey: "FIS",
    intro: "Niña de 7 años es referida por la escuela porque 'se queda en blanco' varias veces al día durante las clases.",
    interview: [
      { q: "¿Cómo describen esos episodios?", reveal: "Duran solo unos segundos: deja de hablar, su mirada se fija, y a veces parpadea repetidamente; luego continúa como si nada hubiera pasado." },
      { q: "¿Recuerda lo que pasó durante el episodio?", reveal: "No — no se da cuenta de que ocurrió, y a veces pierde el hilo de lo que estaba haciendo o diciendo." },
      { q: "¿Hay algún aviso o caída antes del episodio?", reveal: "No hay aviso, ni cae al suelo, ni hay movimientos convulsivos — solo la breve interrupción de la conciencia." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Síndrome de Desconexión Cognitiva", correct: false, feedback: "El SDC implica un patrón sostenido de ensimismamiento durante minutos, sin la fijación de mirada y los parpadeos súbitos y breves característicos de una crisis epiléptica.", consequence: "Si se hubiera tratado como un problema puramente atencional, no se habría buscado el origen eléctrico cerebral, retrasando el diagnóstico médico y el tratamiento antiepiléptico apropiado." },
          { text: "Crisis de ausencia (epilepsia tipo ausencia)", correct: true, feedback: "Correcto. Los episodios breves, súbitos, con fijación de la mirada, sin aviso ni caída, y sin recuerdo del episodio, son característicos de las crisis de ausencia — es importante derivar para confirmación con electroencefalograma (EEG), estudio que corresponde al neurólogo." },
          { text: "Trastorno de la atención (TDAH inatento)", correct: false, feedback: "El TDAH inatento implica distracción sostenida, no episodios súbitos y breves con fijación de la mirada que se repiten varias veces al día.", consequence: "Si se hubiera diagnosticado como TDAH, se perdería información crítica: las crisis de ausencia no tratadas pueden afectar el aprendizaje y, en algunos casos, evolucionar a otros tipos de crisis." },
          { text: "Trastorno disociativo", correct: false, feedback: "Los trastornos disociativos en niños suelen relacionarse con experiencias de estrés identificable, y no presentan el patrón eléctrico característico ni la brevedad tan estereotipada de estos episodios.", consequence: "Si se hubiera tratado como un problema psicológico disociativo, no se habría solicitado el estudio neurológico necesario para confirmar la actividad eléctrica anómala." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué rasgo distingue MEJOR estos episodios de una desconexión cognitiva atencional (tipo SDC o TDAH inatento)?",
        options: [
          { text: "Que afectan su rendimiento escolar", correct: false, feedback: "Ambos cuadros afectan el aprendizaje; eso no los distingue." },
          { text: "Que son súbitos, brevísimos (segundos) y con fijación de la mirada y parpadeo, no un ensimismamiento sostenido y gradual", correct: true, feedback: "Exacto. La brevedad estereotipada, el inicio y fin abruptos y los signos motores (fijación, parpadeo) apuntan a una descarga eléctrica, no a una desconexión atencional que es más sostenida y sin esos signos. Esa cualidad temporal es la clave para derivar a EEG." },
          { text: "Que la niña es callada", correct: false, feedback: "El temperamento no distingue una crisis epiléptica de un problema atencional." },
          { text: "Que ocurren varias veces al día", correct: false, feedback: "La frecuencia por sí sola no discrimina; un problema atencional también es frecuente. Lo decisivo es la cualidad súbita y breve de cada episodio." },
        ]
      },
      {
        type: "dominio", prompt: "Un colega dice que esto es Sistemas Cognitivos porque interfiere con el aprendizaje. ¿Qué justifica ubicarlo en Activación y Regulación?",
        options: [
          { text: "Porque pierde el hilo de lo que hacía", correct: false, feedback: "Perder el hilo es una consecuencia de la interrupción; no es el argumento sobre qué función primaria falla." },
          { text: "Porque lo que se interrumpe primariamente es el nivel de conciencia/arousal, del cual dependen todas las funciones cognitivas en ese instante", correct: true, feedback: "Correcto. No es que falle un constructo cognitivo específico: es que la conciencia misma se apaga unos segundos. Al ser la activación lo primario, el dominio es Activación y Regulación." },
          { text: "Porque tiene bajo rendimiento", correct: false, feedback: "El rendimiento es consecuencia, no criterio de dominio." },
          { text: "Porque no recuerda el episodio", correct: false, feedback: "El no recordar es resultado de la pérdida de conciencia, no el argumento de por qué el dominio es de activación." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué tendría que ocurrir para que el constructo fuese 'atención sostenida' en lugar de 'activación/nivel de conciencia'?",
        options: [
          { text: "Que la niña permaneciera consciente pero le costara mantener el foco voluntariamente sobre la tarea de forma continua", correct: true, feedback: "Correcto. La atención sostenida supone una conciencia preservada con dificultad para mantener el foco. Aquí la conciencia misma se interrumpe por completo unos segundos, por lo que el constructo es arousal, no atención." },
          { text: "Que los episodios fueran más frecuentes", correct: false, feedback: "La frecuencia no cambia el constructo afectado." },
          { text: "Que parpadeara más", correct: false, feedback: "El parpadeo apunta justamente a la crisis (arousal), no a un problema de atención sostenida." },
          { text: "Que tuviera peores notas", correct: false, feedback: "El rendimiento no define el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué el EEG (fisiología) es la unidad que confirma el origen, y no la 'conducta' que observa la maestra?",
        options: [
          { text: "Porque el 'quedarse en blanco' es la manifestación observable, pero solo el registro de la actividad eléctrica demuestra directamente el mecanismo subyacente", correct: true, feedback: "Correcto. La conducta describe QUÉ pasa; la fisiología (EEG) demuestra POR QUÉ pasa. Para confirmar el origen epiléptico se necesita la evidencia fisiológica directa, no solo la observación." },
          { text: "Porque la maestra no es médica", correct: false, feedback: "La fuente de la observación no es el punto; es que la conducta no demuestra el mecanismo eléctrico por sí sola." },
          { text: "Porque la conducta no se puede medir", correct: false, feedback: "La conducta sí se mide; el punto es que no confirma directamente el origen epiléptico." },
          { text: "Porque el EEG mide la atención", correct: false, feedback: "El EEG no mide atención: registra actividad eléctrica cerebral, que es lo que confirma la crisis." },
        ]
      },
      {
        type: "instrumento", prompt: "Una vez confirmado el diagnóstico médico, ¿qué instrumento usarías para evaluar el impacto cognitivo de las crisis en su aprendizaje?",
        options: [
          { text: "WISC-V", correct: true, feedback: "Correcto. Permite valorar el perfil intelectual y detectar posibles repercusiones cognitivas asociadas a las crisis no tratadas, fundamentales para el plan de apoyo escolar." },
          { text: "Electroencefalograma (EEG)", correct: false, feedback: "El EEG es un estudio neurológico que confirma la actividad eléctrica, fuera del alcance de la evaluación neuropsicológica; el neuropsicólogo se enfoca en el impacto cognitivo, no en confirmar el diagnóstico médico." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners evalúan síntomas de TDAH; no son el instrumento indicado para perfilar el impacto cognitivo de crisis epilépticas." },
          { text: "BANFE-3", correct: false, feedback: "Aunque BANFE-3 podría aportar información sobre funciones ejecutivas, en una niña de 7 años el WISC-V ofrece un perfil intelectual más completo como primer paso de la evaluación." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 2, grupo: "Infantojuvenil", domainKey: "SM", unitKey: "CON",
    intro: "Niño de 6 años con antecedente de parálisis cerebral (diparesia espástica) es referido para valoración antes de iniciar el ciclo escolar.",
    interview: [
      { q: "¿Cómo es su desarrollo motor?", reveal: "Tiene rigidez y dificultad para el control motor fino y grueso, predominantemente en ambas piernas, desde edad temprana; usa andadera para desplazarse." },
      { q: "¿Cómo es su comunicación y comprensión?", reveal: "Comprende instrucciones complejas para su edad y se comunica verbalmente sin dificultad aparente." },
      { q: "¿Qué preocupa específicamente a la familia de cara a la escuela?", reveal: "Temen que, por su dificultad motora, los maestros asuman que también tiene un retraso cognitivo general, y que no se le den las mismas oportunidades académicas." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Discapacidad intelectual generalizada", correct: false, feedback: "El niño comprende instrucciones complejas y se comunica adecuadamente; no hay evidencia de un déficit cognitivo generalizado, solo de un compromiso motor.", consequence: "Si se hubiera asumido discapacidad intelectual, se le habría colocado en un programa académico con expectativas reducidas, limitando innecesariamente su desarrollo educativo pese a tener capacidades cognitivas preservadas." },
          { text: "Perfil motor de parálisis cerebral con cognición preservada", correct: true, feedback: "Correcto. La parálisis cerebral es, ante todo, un trastorno del movimiento por una lesión cerebral no progresiva; el perfil cognitivo debe evaluarse de forma independiente — y en este caso, el lenguaje y la comprensión están preservados." },
          { text: "Trastorno del Espectro Autista", correct: false, feedback: "No hay descripción de dificultades en reciprocidad social, comunicación social o intereses restringidos; el cuadro central es motor.", consequence: "Si se hubiera diagnosticado TEA, se desviaría el plan de intervención hacia áreas que no son el verdadero reto del niño, dejando de lado el apoyo específico que requiere por su condición motora." },
          { text: "Trastorno específico del lenguaje", correct: false, feedback: "El caso indica que se comunica verbalmente sin dificultad aparente y comprende instrucciones complejas; no hay un déficit de lenguaje descrito.", consequence: "Si se hubiera diagnosticado un trastorno del lenguaje, se le habría dado terapia de lenguaje innecesaria, sin atender la verdadera necesidad: adaptaciones de acceso físico al currículo escolar." },
        ]
      },
      {
        type: "sindrome", prompt: "El temor de la familia es que se asuma un retraso cognitivo. ¿Qué dato del caso refuta MEJOR esa suposición?",
        options: [
          { text: "Que usa andadera para desplazarse", correct: false, feedback: "Eso confirma el compromiso motor, pero no dice nada sobre su capacidad cognitiva." },
          { text: "Que comprende instrucciones complejas para su edad y se comunica verbalmente sin dificultad", correct: true, feedback: "Exacto. La comprensión de instrucciones complejas y el lenguaje preservado son evidencia directa de cognición intacta, e impiden inferir un retraso cognitivo a partir del déficit motor. Disociar motor y cognición es la clave del caso." },
          { text: "Que tiene rigidez en ambas piernas", correct: false, feedback: "Describe el compromiso motor, no refuta un posible déficit cognitivo." },
          { text: "Que la lesión cerebral no es progresiva", correct: false, feedback: "Eso habla del curso de la condición, no demuestra que su cognición esté preservada." },
        ]
      },
      {
        type: "dominio", prompt: "¿Por qué el déficit PRIMARIO se ubica en Sistemas Sensoriomotores y no en Sistemas Cognitivos?",
        options: [
          { text: "Porque usa andadera", correct: false, feedback: "El uso de andadera es un signo, no el argumento sobre qué dominio es el primario." },
          { text: "Porque lo alterado de origen es el control del movimiento, mientras que la cognición está demostrablemente preservada", correct: true, feedback: "Correcto. El criterio es dónde está el déficit PRIMARIO: aquí es el control motor (Sensoriomotores), y justamente lo que se busca demostrar es que la cognición NO está afectada." },
          { text: "Porque tiene 6 años", correct: false, feedback: "La edad no determina el dominio del déficit." },
          { text: "Porque va a entrar a la escuela", correct: false, feedback: "El contexto de la valoración no define el dominio afectado." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué tendría que estar alterado para que el constructo fuese 'percepción somatosensorial' en lugar de 'acciones motoras'?",
        options: [
          { text: "Que tuviera dificultad para PERCIBIR el tacto o la posición de sus miembros, no para EJECUTAR el movimiento", correct: true, feedback: "Correcto. La percepción somatosensorial es sobre registrar estímulos del cuerpo (entrada); aquí el problema es producir y controlar el movimiento (salida), por eso el constructo es 'acciones motoras'." },
          { text: "Que tuviera más rigidez", correct: false, feedback: "Más rigidez sigue siendo un problema de ejecución motora, no de percepción." },
          { text: "Que no comprendiera instrucciones", correct: false, feedback: "Eso afectaría el lenguaje/comprensión, no la percepción somatosensorial." },
          { text: "Que usara silla de ruedas en vez de andadera", correct: false, feedback: "El nivel de apoyo motor no cambia el constructo de motor a perceptivo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia es 'conducta' y no 'genes', si la parálisis cerebral tiene una causa biológica?",
        options: [
          { text: "Porque el compromiso se documenta observando su control motor real, no mediante un estudio genético", correct: true, feedback: "Correcto. La parálisis cerebral se debe a una lesión cerebral (no a una causa genética identificada aquí), y lo que se documenta en la valoración es su desempeño motor observable — eso define la unidad como 'conducta'." },
          { text: "Porque la parálisis cerebral siempre es genética", correct: false, feedback: "Incorrecto: la parálisis cerebral se debe a una lesión cerebral no progresiva, no a una causa genética identificada." },
          { text: "Porque no se le tomaron muestras de sangre", correct: false, feedback: "La ausencia de un análisis no es el criterio; lo es que la evidencia usada es la observación de la conducta motora." },
          { text: "Porque es muy pequeño para estudios genéticos", correct: false, feedback: "La edad no impide estudios genéticos; el punto es la fuente real de evidencia en el caso." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "WISC-V (con adaptaciones para su condición motora)", correct: true, feedback: "Correcto. Permite valorar su perfil intelectual real, separando las habilidades cognitivas de las limitaciones motoras mediante subpruebas y formas de respuesta adaptadas." },
          { text: "BANFE-3", correct: false, feedback: "Aunque BANFE-3 podría usarse más adelante, en una primera valoración de un niño de 6 años el WISC-V ofrece la base más completa del perfil intelectual general." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista, no es relevante para este perfil predominantemente motor con cognición preservada." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners se centran en síntomas de TDAH; no aportan información sobre el perfil intelectual que se necesita aquí." },
        ]
      },
      {
        type: "contexto", prompt: "¿Qué dimensión transversal RDoC pesa más para interpretar y apoyar este caso?",
        options: [
          { text: "Neurodesarrollo — el compromiso motor está presente desde etapas tempranas y define su trayectoria, mientras la cognición sigue su propio curso.", correct: true, feedback: "Correcto. La parálisis cerebral parte de una lesión temprana; leer el perfil según el desarrollo evita confundir la limitación motora con un déficit cognitivo." },
          { text: "Ambiente — el déficit responde a un estresor reciente.", correct: false, feedback: "No es un cambio reciente ni ambiental: es un cuadro del neurodesarrollo, presente desde etapas tempranas." },
          { text: "Ninguna — con la unidad de análisis basta.", correct: false, feedback: "La celda no es plana: sin la mirada del neurodesarrollo se corre el riesgo de subestimar sus capacidades cognitivas preservadas." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 2, grupo: "Infantojuvenil", domainKey: "SOC", unitKey: "CON",
    intro: "Niña de 9 años con diagnóstico genético confirmado de Síndrome de Down es referida para una valoración neuropsicológica de seguimiento, en el contexto de su plan educativo individualizado.",
    interview: [
      { q: "¿Cómo es su perfil de aprendizaje según los maestros?", reveal: "Aprende mejor con apoyos visuales y repetición; tiene más dificultad con conceptos abstractos y con el lenguaje expresivo que con la comprensión de instrucciones simples." },
      { q: "¿Cómo es su desarrollo social?", reveal: "Es muy sociable, busca interactuar con sus compañeros y disfruta las actividades grupales, aunque su lenguaje expresivo es limitado para su edad." },
      { q: "¿Qué busca la familia con esta evaluación?", reveal: "Quieren un perfil actualizado de fortalezas y áreas de apoyo para ajustar su plan educativo individualizado del próximo ciclo escolar, entendiendo que su perfil va cambiando conforme crece y no es algo fijo." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno del Espectro Autista", correct: false, feedback: "El perfil descrito muestra sociabilidad activa y búsqueda de interacción — lo opuesto al patrón de retraimiento social típico del espectro autista; el diagnóstico genético ya confirma el origen del cuadro.", consequence: "Si se hubiera añadido un diagnóstico de TEA sin evidencia clara, se generaría confusión en el plan educativo, dado que el perfil social de la niña es de búsqueda activa de interacción, no de retraimiento." },
          { text: "Discapacidad intelectual asociada a Síndrome de Down, con perfil de fortalezas en comprensión y sociabilidad", correct: true, feedback: "Correcto. El perfil cognitivo típico en Síndrome de Down muestra mayor fortaleza en comprensión y habilidades sociales que en lenguaje expresivo y razonamiento abstracto — información clave para ajustar apoyos educativos." },
          { text: "Trastorno Específico del Aprendizaje (dislexia)", correct: false, feedback: "La dislexia es un trastorno específico en lectura con capacidad intelectual general típica; aquí el perfil cognitivo global está afectado, en el contexto de un síndrome genético ya identificado.", consequence: "Si se hubiera enfocado solo como dislexia, se subestimaría la necesidad de apoyos más amplios en todas las áreas del aprendizaje que requiere por su perfil cognitivo global." },
          { text: "Síndrome de Desconexión Cognitiva", correct: false, feedback: "No hay descripción de ensimismamiento ni desconexión interna; el perfil es de un patrón de aprendizaje más lento en general, con fortalezas sociales claras, congruente con su condición genética conocida.", consequence: "Si se hubiera diagnosticado SDC, se buscaría un patrón de desconexión interna que no corresponde a este perfil, desviando el enfoque del plan de apoyo educativo realmente necesario." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato del caso hace MENOS probable añadir un diagnóstico de Trastorno del Espectro Autista a este perfil?",
        options: [
          { text: "Que aprende mejor con apoyos visuales", correct: false, feedback: "El estilo de aprendizaje visual no descarta ni confirma un TEA; es independiente de esa pregunta." },
          { text: "Que es muy sociable, busca interactuar y disfruta las actividades grupales", correct: true, feedback: "Exacto. La búsqueda activa de interacción y el disfrute social son lo opuesto al patrón de reciprocidad social reducida que caracteriza al TEA. Ese perfil social activo es lo que hace poco probable un TEA añadido." },
          { text: "Que tiene un diagnóstico genético confirmado", correct: false, feedback: "Tener Síndrome de Down no excluye por sí solo un TEA comórbido; lo que lo hace improbable aquí es su perfil social, no el diagnóstico genético." },
          { text: "Que su lenguaje expresivo es limitado", correct: false, feedback: "El lenguaje expresivo limitado es parte de su perfil cognitivo, pero no es lo que descarta el patrón social del TEA." },
        ]
      },
      {
        type: "dominio", prompt: "Su fortaleza relativa se ubica en Procesos Sociales. ¿Qué razonamiento lo justifica frente a otro dominio?",
        options: [
          { text: "Porque tiene Síndrome de Down", correct: false, feedback: "El diagnóstico genético no asigna por sí mismo la fortaleza a un dominio; hay que mirar su perfil funcional." },
          { text: "Porque su sociabilidad activa y búsqueda de interacción destacan por encima de sus otras áreas, y eso es funcionamiento interpersonal", correct: true, feedback: "Correcto. La fortaleza se asigna al dominio donde su funcionamiento es comparativamente mejor: aquí, la reciprocidad y el disfrute social, que pertenecen a Procesos Sociales." },
          { text: "Porque aprende con apoyos visuales", correct: false, feedback: "El estilo de aprendizaje no es un argumento sobre el dominio de su fortaleza social." },
          { text: "Porque tiene 9 años", correct: false, feedback: "La edad no define el dominio de la fortaleza." },
        ]
      },
      {
        type: "constructo", prompt: "¿Por qué su área de APOYO se identifica como 'lenguaje expresivo' y no como 'comprensión'?",
        options: [
          { text: "Porque comprende mejor las instrucciones simples de lo que logra expresarse verbalmente — la brecha está en la producción, no en la recepción", correct: true, feedback: "Correcto. El perfil típico en Síndrome de Down muestra comprensión relativamente mejor que expresión. Identificar correctamente cuál de los dos lados está más afectado guía el apoyo educativo." },
          { text: "Porque no entiende nada de lo que se le dice", correct: false, feedback: "Falso: el caso indica que comprende instrucciones simples; lo limitado es su expresión." },
          { text: "Porque es muy sociable", correct: false, feedback: "La sociabilidad es una fortaleza, no explica por qué el apoyo es en lenguaje expresivo y no en comprensión." },
          { text: "Porque usa apoyos visuales", correct: false, feedback: "El uso de apoyos visuales es una estrategia, no define cuál constructo lingüístico está más afectado." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué el perfil de fortalezas y debilidades se documenta en 'conducta' y no en 'genes', si la condición de base es genética?",
        options: [
          { text: "Porque el diagnóstico genético ya está dado; lo que ahora se documenta es su desempeño funcional observable, que es lo útil para el plan educativo", correct: true, feedback: "Correcto. El gen explica la condición, pero el perfil de fortalezas/debilidades que guía la intervención se obtiene observando su desempeño (conducta), no repitiendo el estudio genético." },
          { text: "Porque el Síndrome de Down no es genético", correct: false, feedback: "Incorrecto: el Síndrome de Down sí es de origen genético; el punto es qué se documenta AHORA para el plan educativo." },
          { text: "Porque la niña es sociable", correct: false, feedback: "Su sociabilidad es parte del perfil, pero no es lo que define que la unidad sea 'conducta'." },
          { text: "Porque tiene un plan educativo individualizado", correct: false, feedback: "El plan es el objetivo, no lo que define la unidad de análisis de la evidencia." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "WISC-V (con interpretación cualitativa del perfil de fortalezas y debilidades)", correct: true, feedback: "Correcto. Permite obtener un perfil detallado de fortalezas y áreas de apoyo, esencial para ajustar el plan educativo individualizado, más allá de un puntaje único de CI." },
          { text: "ENI-2", correct: false, feedback: "El ENI-2 es una opción razonable para una evaluación neuropsicológica más amplia, pero para actualizar específicamente el perfil de fortalezas/debilidades de cara al plan educativo, el WISC-V con interpretación cualitativa es más directamente útil en este contexto." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; el perfil social de la niña no sugiere ese patrón, por lo que no es el instrumento prioritario aquí." },
          { text: "Escala de Depresión Geriátrica de Yesavage", correct: false, feedback: "Esta escala está diseñada para adultos mayores; no aplica en absoluto a una niña de 9 años." },
        ]
      },
      {
        type: "contexto", prompt: "¿Cómo entra el neurodesarrollo al interpretar este perfil?",
        options: [
          { text: "El perfil de fortalezas y debilidades se lee a lo largo de su trayectoria de desarrollo para ajustar los apoyos, no como un déficit estático.", correct: true, feedback: "Correcto. El origen genético no fija el perfil funcional: cómo evoluciona y qué apoyos recibe a cada edad lo modula. Por eso la valoración es de seguimiento." },
          { text: "No entra: el diagnóstico genético ya define todo el perfil funcional.", correct: false, feedback: "Tener Síndrome de Down no determina por sí solo el perfil cognitivo; su desarrollo y su contexto educativo lo moldean con el tiempo." },
          { text: "Solo importa el ambiente escolar, no el desarrollo.", correct: false, feedback: "Ambiente y neurodesarrollo actúan juntos, pero aquí la clave es leer el perfil según la trayectoria evolutiva de la niña." },
        ]
      }
    ]
  },
  // ===== CASOS ADULTOS =====
  {
    level: 2, difficulty: 2, grupo: "Adultos", domainKey: "COG", unitKey: "AUT",
    intro: "Paciente de 29 años acude por iniciativa propia, refiriendo que 'siempre ha sido desorganizado' pero que en su nuevo trabajo esto le está generando serios problemas.",
    interview: [
      { q: "¿Desde cuándo presenta estas dificultades?", reveal: "Desde la infancia — recuerda haber tenido problemas similares en la escuela, aunque nunca fue evaluado formalmente." },
      { q: "¿Qué tipo de dificultades describe actualmente?", reveal: "Olvida plazos, pierde objetos con frecuencia, le cuesta terminar tareas que requieren atención sostenida, y se distrae fácilmente en reuniones largas." },
      { q: "¿Hay síntomas de hiperactividad motora visible?", reveal: "No tanto físicamente, pero describe una sensación interna de 'estar siempre acelerado mentalmente', saltando de una idea a otra." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno de ansiedad generalizada", correct: false, feedback: "La ansiedad generalizada se centra en preocupación excesiva y anticipación de amenazas, no en el patrón de inatención y desorganización desde la infancia que describe el paciente.", consequence: "Si se hubiera tratado como ansiedad, se trabajaría en manejo de la preocupación, sin atender el patrón atencional de base presente desde la infancia." },
          { text: "TDAH adulto, presentación predominantemente inatenta", correct: true, feedback: "Correcto. La persistencia de síntomas desde la infancia, la desorganización, el olvido de plazos y la distracción fácil, junto con la sensación de aceleración mental sin hiperactividad motora marcada, son congruentes con TDAH de presentación inatenta en el adulto." },
          { text: "Síndrome de Desconexión Cognitiva", correct: false, feedback: "El SDC se ha estudiado principalmente en niños y adolescentes; en este caso, el patrón de inatención con 'aceleración mental' es más congruente con TDAH inatento.", consequence: "Si se hubiera diagnosticado SDC sin la evidencia adecuada, se perdería de vista el patrón clásico de TDAH que sí cuenta con tratamiento e intervención bien establecidos para adultos." },
          { text: "Trastorno bipolar tipo II", correct: false, feedback: "No hay descripción de episodios de elevación o descenso marcado del estado de ánimo que duren días; el patrón es de desorganización e inatención sostenida, no de fluctuación anímica episódica.", consequence: "Si se hubiera diagnosticado trastorno bipolar, se consideraría un tratamiento farmacológico distinto y se perdería de vista el patrón atencional de base que requiere abordaje específico." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato distingue MEJOR este cuadro de un trastorno de ansiedad generalizada?",
        options: [
          { text: "Que se distrae en reuniones largas", correct: false, feedback: "La distracción es un síntoma del TDAH, pero la ansiedad también puede cursar con dificultad de concentración; por sí sola no distingue ambos cuadros." },
          { text: "Que el patrón de inatención y desorganización está presente desde la infancia, no es una preocupación ansiosa de aparición posterior", correct: true, feedback: "Exacto. El TDAH es del neurodesarrollo: sus síntomas se rastrean desde la infancia. La ansiedad generalizada gira en torno a preocupación/anticipación de amenazas, con otra trayectoria. La continuidad desde la niñez es la clave diferencial." },
          { text: "Que tiene un trabajo nuevo", correct: false, feedback: "El detonante laboral explica por qué consulta ahora, pero no distingue entre TDAH y ansiedad." },
          { text: "Que pierde objetos", correct: false, feedback: "Es un síntoma de inatención, pero no es lo que descarta específicamente la ansiedad generalizada." },
        ]
      },
      {
        type: "dominio", prompt: "La 'aceleración mental' podría sugerir Activación y Regulación. ¿Qué justifica clasificarlo en Sistemas Cognitivos?",
        options: [
          { text: "Porque tiene un trabajo nuevo exigente", correct: false, feedback: "El contexto laboral no determina el dominio del déficit." },
          { text: "Porque el núcleo del problema es sostener y organizar la atención (función cognitiva), no una alteración del nivel de alerta o del sueño", correct: true, feedback: "Correcto. La 'aceleración' es subjetiva; lo medible y nuclear es la falla para dirigir y mantener la atención y organizarse — funciones cognitivas. No hay alteración del arousal o del ciclo sueño-vigilia que justifique Activación y Regulación." },
          { text: "Porque se siente acelerado", correct: false, feedback: "Esa sensación es justamente lo que podría confundir; el argumento debe apuntar a la función realmente alterada, que es cognitiva." },
          { text: "Porque olvida plazos", correct: false, feedback: "Olvidar plazos es un síntoma; el argumento de dominio es que la función central afectada es la atención/organización." },
        ]
      },
      {
        type: "constructo", prompt: "¿Por qué se afecta 'atención y control cognitivo' y no la 'memoria declarativa', si el paciente olvida plazos?",
        options: [
          { text: "Porque olvida los plazos por no registrarlos ni organizarse (falla atencional/ejecutiva), no porque sea incapaz de consolidar recuerdos como en una amnesia", correct: true, feedback: "Correcto. La distinción fina: en un déficit de memoria declarativa, la información no se consolida aunque se atienda; aquí el olvido es secundario a no atender ni organizar. Por eso el constructo es atención/control cognitivo." },
          { text: "Porque tiene buen vocabulario", correct: false, feedback: "El vocabulario no es relevante para distinguir atención de memoria aquí." },
          { text: "Porque se siente acelerado", correct: false, feedback: "La sensación de aceleración no define si el constructo es de memoria o de atención." },
          { text: "Porque es desorganizado desde niño", correct: false, feedback: "La cronicidad apoya el diagnóstico de TDAH, pero no es el argumento de por qué el constructo es atención y no memoria." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia principal aquí es 'autorreporte' y no 'conducta' observada en pruebas?",
        options: [
          { text: "Porque el diagnóstico se apoya sobre todo en lo que el paciente informa de sus síntomas actuales y de su infancia, mediante escalas estructuradas autoaplicadas", correct: true, feedback: "Correcto. En el TDAH adulto, el reporte estructurado del propio paciente (actual y retrospectivo) es la fuente central de evidencia, más que una observación conductual directa en consulta." },
          { text: "Porque no existen pruebas conductuales de atención", correct: false, feedback: "Sí existen pruebas conductuales; el punto es que aquí la evidencia central descrita es el autorreporte estructurado." },
          { text: "Porque el paciente acudió por iniciativa propia", correct: false, feedback: "Quién inicia la consulta no define la unidad de análisis." },
          { text: "Porque tiene un trabajo nuevo", correct: false, feedback: "El contexto laboral no determina la unidad de evidencia." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "Escalas de Conners para adultos", correct: true, feedback: "Correcto. Existen versiones de las escalas de Conners adaptadas para adultos que permiten cuantificar síntomas actuales y retrospectivos (de la infancia) de TDAH, clave para este diagnóstico." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista, no síntomas de inatención/hiperactividad." },
          { text: "Test de Stroop únicamente", correct: false, feedback: "El Stroop aporta información sobre control inhibitorio, pero por sí solo no es suficiente para fundamentar un diagnóstico de TDAH; se usa como complemento, no como instrumento principal." },
          { text: "Escala de Glasgow", correct: false, feedback: "La Escala de Glasgow mide nivel de conciencia tras un evento neurológico agudo; no es relevante para evaluar síntomas de TDAH." },
        ]
      },
      {
        type: "contexto", prompt: "¿Qué dimensión transversal es clave en el diagnóstico diferencial de este caso?",
        options: [
          { text: "Neurodesarrollo — los síntomas se rastrean de forma continua desde la infancia; esa trayectoria lo distingue de una ansiedad de aparición tardía.", correct: true, feedback: "Correcto. El TDAH es un trastorno del neurodesarrollo por definición: la continuidad desde la niñez es la clave diferencial frente a cuadros de inicio adulto." },
          { text: "Ambiente — es una reacción a un estresor laboral actual.", correct: false, feedback: "Aunque el estrés actual influya, lo definitorio es la continuidad de los síntomas desde la infancia (neurodesarrollo)." },
          { text: "Ninguna — el TDAH no tiene relación con el desarrollo.", correct: false, feedback: "Al contrario: el TDAH es, por definición, un trastorno del neurodesarrollo." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Adultos", domainKey: "SOC", unitKey: "AUT",
    intro: "Paciente de 34 años, ingeniero, acude por sugerencia de su psicólogo de cabecera tras compartir dificultades persistentes en sus relaciones laborales y de pareja.",
    interview: [
      { q: "¿Qué dificultades describe en el trabajo?", reveal: "Le cuesta entender por qué sus comentarios directos 'incomodan' a sus compañeros, y prefiere comunicarse por escrito porque las conversaciones espontáneas le resultan agotadoras." },
      { q: "¿Cómo describe sus intereses?", reveal: "Tiene un interés muy profundo y especializado en un tema técnico específico, sobre el que ha leído extensamente durante años, y le resulta difícil hablar de otros temas con el mismo entusiasmo." },
      { q: "¿Hubo dificultades similares en la infancia?", reveal: "Sí — recuerda que de niño le decían que era 'raro' o 'muy literal', y que prefería jugar solo o con reglas muy estructuradas." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno de Personalidad Esquizoide", correct: false, feedback: "El trastorno esquizoide implica un desinterés genuino y generalizado por las relaciones sociales; aquí el paciente busca activamente relaciones pero tiene dificultad para decodificar sus reglas implícitas, no falta de interés en ellas.", consequence: "Si se hubiera diagnosticado un trastorno de personalidad, se abordaría como un patrón rígido e inmodificable, en vez de reconocer un perfil del neurodesarrollo presente desde la infancia con estrategias de apoyo específicas." },
          { text: "Trastorno del Espectro Autista, diagnosticado en la edad adulta", correct: true, feedback: "Correcto. La dificultad para decodificar reglas sociales implícitas (pese a buscar activamente la relación), los intereses intensos y especializados, y los antecedentes desde la infancia, son congruentes con TEA — cada vez más reconocido en adultos que no fueron diagnosticados de niños." },
          { text: "Trastorno de Ansiedad Social", correct: false, feedback: "La ansiedad social se centra en el miedo al juicio ajeno; aquí el agotamiento en conversaciones espontáneas se relaciona más con la dificultad de procesamiento social en tiempo real que con miedo a ser evaluado.", consequence: "Si se hubiera tratado solo como ansiedad social, se perdería el componente central de procesamiento social atípico, y las estrategias de afrontamiento no serían las más efectivas para su perfil real." },
          { text: "Trastorno Obsesivo-Compulsivo de la Personalidad", correct: false, feedback: "Este trastorno se centra en perfeccionismo y rigidez relacionada con el orden y el control, no en la dificultad específica para decodificar claves sociales implícitas que describe el caso.", consequence: "Si se hubiera diagnosticado TOC de la personalidad, el enfoque se centraría en flexibilidad y control, dejando de lado el verdadero reto: la comunicación social recíproca." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato distingue MEJOR este cuadro de un trastorno de ansiedad social?",
        options: [
          { text: "Que prefiere comunicarse por escrito", correct: false, feedback: "La preferencia por lo escrito ocurre en ambos cuadros; no los distingue por sí sola." },
          { text: "Que las conversaciones lo agotan por la dificultad de procesar lo social en tiempo real, no por miedo a ser juzgado", correct: true, feedback: "Exacto. En la ansiedad social el malestar viene del temor a la evaluación; aquí el agotamiento surge de la carga de decodificar la interacción sobre la marcha, junto con antecedentes desde la infancia. Ese mecanismo —procesamiento, no miedo— es la clave." },
          { text: "Que es ingeniero", correct: false, feedback: "La profesión no distingue ambos cuadros." },
          { text: "Que tiene problemas de pareja", correct: false, feedback: "Las dificultades de pareja pueden darse en muchos cuadros; no discriminan TEA de ansiedad social." },
        ]
      },
      {
        type: "dominio", prompt: "Un colega dice que esto es Sistemas Cognitivos porque 'procesar lo social usa cognición'. ¿Qué justifica ubicarlo en Procesos Sociales?",
        options: [
          { text: "Porque es muy inteligente en lo técnico", correct: false, feedback: "Su capacidad técnica preservada no es el argumento; de hecho contrasta con su dificultad social." },
          { text: "Porque su déficit es selectivo de la comunicación social recíproca, mientras razona bien en dominios no sociales", correct: true, feedback: "Correcto. Justamente porque su cognición general (técnica) está intacta y el fallo es específico de lo interpersonal, RDoC lo ubica en Procesos Sociales y no en un déficit cognitivo general." },
          { text: "Porque se agota en las reuniones", correct: false, feedback: "Describe el síntoma, no justifica la elección de dominio frente a Sistemas Cognitivos." },
          { text: "Porque tiene intereses especializados", correct: false, feedback: "Es un rasgo del espectro, pero no el argumento de por qué el dominio es social y no cognitivo." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué tendría que ocurrir para que el constructo fuese 'afiliación y unión social' en lugar de 'comprensión de los demás'?",
        options: [
          { text: "Que no tuviera ningún interés en relacionarse — pero el caso muestra que SÍ busca relaciones, solo que no logra interpretarlas", correct: true, feedback: "Correcto. Afiliación se refiere al deseo de vínculo. El paciente sí desea y busca relaciones (laborales, de pareja); lo que falla es comprender e interpretar al otro, por eso el constructo es 'comprensión de los demás'." },
          { text: "Que se comunicara mejor por escrito", correct: false, feedback: "El canal de comunicación no cambia el constructo afectado." },
          { text: "Que fuera menos inteligente", correct: false, feedback: "El nivel intelectual no define este constructo social." },
          { text: "Que tuviera más intereses", correct: false, feedback: "La amplitud de intereses no determina si el déficit es de afiliación o de comprensión social." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia central es 'autorreporte' y no 'circuitos'?",
        options: [
          { text: "Porque el diagnóstico en el adulto se apoya en lo que él informa de su funcionamiento social cotidiano (con escalas autoaplicadas), no en neuroimagen", correct: true, feedback: "Correcto. En el TEA del adulto la fuente directa es el reporte estructurado del propio paciente sobre su funcionamiento social, junto a la observación clínica — no un estudio de circuitos." },
          { text: "Porque el TEA no involucra circuitos cerebrales", correct: false, feedback: "Incorrecto: el TEA sí involucra circuitos; el punto es que la evidencia disponible en el caso es el autorreporte." },
          { text: "Porque es ingeniero", correct: false, feedback: "La profesión no define la unidad de análisis." },
          { text: "Porque acudió por sugerencia de su psicólogo", correct: false, feedback: "Quién deriva no determina la fuente de evidencia diagnóstica." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "SRS-2 (versión adulto, autoaplicada)", correct: true, feedback: "Correcto. La SRS-2 cuenta con versión autoaplicada para adultos que perfila rasgos del espectro autista en el funcionamiento social cotidiano, ideal para este caso." },
          { text: "Escalas de Conners para adultos", correct: false, feedback: "Las escalas de Conners se centran en síntomas de TDAH (inatención/hiperactividad), no en el perfil de comunicación social que se necesita evaluar aquí." },
          { text: "Escala de Glasgow", correct: false, feedback: "Esta escala mide el nivel de conciencia tras un evento neurológico agudo; no aplica a este caso." },
          { text: "MoCA", correct: false, feedback: "El MoCA es un tamizaje de deterioro cognitivo, generalmente usado en adultos mayores; no es el instrumento indicado para perfilar rasgos del espectro autista." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Adultos", domainKey: "COG", unitKey: "CON",
    intro: "Paciente de 61 años, hospitalizado tras un evento vascular cerebral extenso, es referido para valoración neuropsicológica antes del alta.",
    interview: [
      { q: "¿Qué reporta el equipo médico sobre el hemisferio afectado y la extensión de la lesión?", reveal: "Lesión extensa en el hemisferio izquierdo, que compromete tanto regiones frontales como temporoparietales." },
      { q: "¿Cómo está su estado de alerta y comunicación actualmente?", reveal: "Está alerta pero con un lenguaje muy reducido — responde con palabras sueltas, y a veces parece no comprender órdenes complejas de varios pasos." },
      { q: "¿Qué le preocupa más a la familia para el alta?", reveal: "Necesitan saber qué tanto podrá comunicarse y cuidarse a sí mismo, para planear el apoyo que requerirá en casa." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Demencia de inicio agudo", correct: false, feedback: "El término 'demencia' implica un deterioro progresivo y gradual; aquí el cuadro es de inicio súbito por un evento vascular agudo extenso, un mecanismo distinto.", consequence: "Usar el término 'demencia' de forma imprecisa podría llevar a un pronóstico y plan de manejo distintos a los que requiere una secuela vascular aguda, donde la rehabilitación intensiva temprana es clave." },
          { text: "Perfil de secuela cognitiva multidominio post-ACV (afasia + posible déficit ejecutivo)", correct: true, feedback: "Correcto. Una lesión extensa que compromete regiones frontales y temporoparietales del hemisferio izquierdo puede generar un perfil combinado: afasia junto con posible compromiso de funciones ejecutivas — debe documentarse en detalle para planear la rehabilitación." },
          { text: "Síndrome confusional agudo (delirium)", correct: false, feedback: "El delirium se caracteriza por fluctuación del estado de alerta y la atención a lo largo del día; aquí el paciente está alerta de forma estable, con un déficit de lenguaje más focal y persistente.", consequence: "Si se hubiera tratado como delirium, se buscarían causas médicas reversibles agudas, sin reconocer que el cuadro central es una secuela estructural del evento vascular ya confirmado." },
          { text: "Trastorno de conversión", correct: false, feedback: "Los trastornos de conversión no tienen una correlación estructural confirmada por neuroimagen; aquí hay una lesión vascular extensa documentada que explica directamente el cuadro.", consequence: "Si se hubiera sugerido un origen psicológico, se desestimaría la necesidad urgente de rehabilitación neuropsicológica y del lenguaje basada en la lesión estructural real." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Por qué este perfil se describe como secuela MULTIDOMINIO y no como una afasia aislada?",
        options: [
          { text: "Porque la lesión es del hemisferio izquierdo", correct: false, feedback: "El hemisferio izquierdo explica la afasia, pero por sí solo no justifica añadir un componente ejecutivo." },
          { text: "Porque la lesión extensa compromete regiones frontales Y temporoparietales, lo que predice afasia junto con posible disfunción ejecutiva", correct: true, feedback: "Exacto. La extensión a regiones frontales (ejecutivo) además de las temporoparietales (lenguaje) hace esperar un perfil combinado, no un déficit único. Razonar desde la localización hacia las funciones es la clave." },
          { text: "Porque está hospitalizado", correct: false, feedback: "La hospitalización no determina que el perfil sea multidominio." },
          { text: "Porque la familia está preocupada", correct: false, feedback: "La preocupación familiar no es un criterio sobre la extensión del déficit." },
        ]
      },
      {
        type: "dominio", prompt: "El habla afectada podría sugerir Sistemas Sensoriomotores. ¿Qué justifica ubicar el déficit en Sistemas Cognitivos?",
        options: [
          { text: "Porque la lesión es extensa", correct: false, feedback: "La extensión explica que sea multidominio, pero no es el argumento para elegir Cognitivos sobre Sensoriomotores." },
          { text: "Porque lo alterado es el lenguaje como sistema simbólico (y la función ejecutiva), no el control motor del aparato fonatorio", correct: true, feedback: "Correcto. La afasia es un déficit del lenguaje (Cognitivo), distinto de una disartria, que sería un problema motor de la articulación (Sensoriomotor). El paciente falla en el lenguaje y la comprensión, no en mover la boca." },
          { text: "Porque responde con palabras sueltas", correct: false, feedback: "Describe el síntoma; el argumento es que la naturaleza del déficit es lingüística, no motora." },
          { text: "Porque está alerta", correct: false, feedback: "Estar alerta descarta un problema de conciencia, pero no es el argumento de Cognitivos frente a Sensoriomotores." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distinguiría que el constructo prominente sea 'lenguaje' y no 'memoria de trabajo'?",
        options: [
          { text: "Que su dificultad central es producir y comprender el lenguaje en sí, no mantener temporalmente información en la mente para operar con ella", correct: true, feedback: "Correcto. El lenguaje reducido a palabras sueltas y la dificultad para comprender órdenes señalan al lenguaje como constructo. La memoria de trabajo es retener y manipular info momentáneamente — otra función. Distinguirlas evita confundir el blanco de la rehabilitación." },
          { text: "Que está hospitalizado", correct: false, feedback: "El contexto no define el constructo afectado." },
          { text: "Que tiene 61 años", correct: false, feedback: "La edad no determina el constructo." },
          { text: "Que la familia quiere saber su pronóstico", correct: false, feedback: "El objetivo de la valoración no define el constructo alterado." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la unidad es 'conducta' y no 'circuitos', si hay una lesión estructural documentada?",
        options: [
          { text: "Porque el neuropsicólogo documenta el déficit a través del desempeño del paciente en tareas de lenguaje y cognición, no interpretando la neuroimagen en sí", correct: true, feedback: "Correcto. Aunque exista una lesión visible en imagen, lo que la evaluación neuropsicológica mide directamente es el desempeño (conducta). La imagen aporta la localización, pero la unidad de la evaluación funcional es conductual." },
          { text: "Porque no se hizo neuroimagen", correct: false, feedback: "Sí hay lesión documentada; el punto es que la valoración neuropsicológica mide conducta, no la imagen." },
          { text: "Porque la afasia impide medir circuitos", correct: false, feedback: "La afasia no impide estudiar circuitos; lo que define la unidad es la fuente de evidencia de la valoración." },
          { text: "Porque está alerta", correct: false, feedback: "Su estado de alerta no es lo que define que la unidad sea conducta." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "NEUROPSI Atención y Memoria + valoración funcional del lenguaje", correct: true, feedback: "Correcto. Permite documentar el perfil cognitivo multidominio junto con una valoración específica del lenguaje, esencial para planear la rehabilitación y el apoyo necesario al alta." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente (6-16 años); no aplica a un paciente adulto de 61 años." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners evalúan síntomas de TDAH; no son relevantes para perfilar secuelas cognitivas post-ACV." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es el instrumento indicado para este perfil de secuela vascular." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Adultos", domainKey: "COG", unitKey: "CON",
    intro: "Paciente de 38 años con diagnóstico reciente de epilepsia focal es referido para valoración del impacto cognitivo de sus crisis y de su tratamiento.",
    interview: [
      { q: "¿Qué tipo de crisis presenta y con qué frecuencia?", reveal: "Crisis focales con alteración de la conciencia, aproximadamente 2 veces al mes, confirmadas por EEG y manejadas con tratamiento antiepiléptico." },
      { q: "¿Qué cambios cognitivos reporta desde el diagnóstico?", reveal: "Refiere sentirse 'más lento' para procesar información y con más olvidos cotidianos desde que inició el tratamiento, aunque no está seguro si es por las crisis o por el medicamento." },
      { q: "¿En qué área de su vida le preocupa más este cambio?", reveal: "Le preocupa especialmente su desempeño laboral, donde necesita tomar decisiones rápidas con frecuencia." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Deterioro cognitivo de etiología neurodegenerativa", correct: false, feedback: "A los 38 años, con un diagnóstico reciente de epilepsia y sin otros marcadores de enfermedad neurodegenerativa, es mucho más probable que el cambio cognitivo se relacione con las crisis o el tratamiento antiepiléptico.", consequence: "Si se hubiera sugerido una etiología neurodegenerativa sin evidencia suficiente, se generaría angustia innecesaria y se buscarían estudios y tratamientos que no corresponden al cuadro real." },
          { text: "Impacto cognitivo asociado a epilepsia y/o efecto del tratamiento antiepiléptico", correct: true, feedback: "Correcto. Tanto las crisis epilépticas recurrentes como algunos fármacos antiepilépticos pueden producir enlentecimiento cognitivo y problemas de memoria — es clave diferenciar cuál es el factor principal para ajustar el manejo." },
          { text: "Trastorno depresivo mayor", correct: false, feedback: "Aunque la depresión puede producir quejas cognitivas, el caso no describe síntomas anímicos como tristeza persistente o desesperanza; el contexto temporal apunta directamente a la epilepsia o su tratamiento.", consequence: "Si se hubiera diagnosticado depresión sin evidencia clara, se podría iniciar un tratamiento antidepresivo innecesario sin abordar el verdadero origen del cambio cognitivo." },
          { text: "Trastorno facticio", correct: false, feedback: "No hay ninguna evidencia de que el paciente esté fabricando o exagerando síntomas deliberadamente; describe un cambio genuino y coherente con su condición médica confirmada.", consequence: "Sugerir un origen facticio sin fundamento dañaría la relación terapéutica y la confianza del paciente en el proceso de evaluación." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato hace MENOS probable atribuir el cambio cognitivo a un proceso neurodegenerativo?",
        options: [
          { text: "Que tiene crisis 2 veces al mes", correct: false, feedback: "La frecuencia de crisis describe la epilepsia, pero no es lo que descarta un proceso neurodegenerativo." },
          { text: "Que el cambio cognitivo apareció en relación temporal con el inicio del tratamiento y las crisis, en un paciente joven sin otros marcadores degenerativos", correct: true, feedback: "Exacto. La aparición ligada en el tiempo a las crisis/medicación, sumada a la edad (38) y la ausencia de otros marcadores, hace mucho más probable una causa relacionada con la epilepsia o el fármaco que un proceso degenerativo. Razonar desde el contexto temporal es la clave." },
          { text: "Que le preocupa su desempeño laboral", correct: false, feedback: "La preocupación laboral explica por qué consulta, no descarta la neurodegeneración." },
          { text: "Que se siente más lento", correct: false, feedback: "El enlentecimiento es el síntoma a explicar, no lo que descarta una causa degenerativa." },
        ]
      },
      {
        type: "dominio", prompt: "¿Por qué el cambio reportado pertenece a Sistemas Cognitivos y no a Activación y Regulación, si dice sentirse 'más lento'?",
        options: [
          { text: "Porque toma medicación antiepiléptica", correct: false, feedback: "El fármaco puede ser la causa, pero eso no decide el dominio en que cae el síntoma." },
          { text: "Porque lo que reporta son fallas concretas de velocidad de procesamiento y memoria, no una alteración del nivel de alerta o del ciclo sueño-vigilia", correct: true, feedback: "Correcto. 'Sentirse lento' aquí se traduce en enlentecimiento del procesamiento y olvidos —funciones cognitivas—, no en somnolencia o desregulación del arousal/sueño que situarían el caso en Activación y Regulación." },
          { text: "Porque tiene crisis focales", correct: false, feedback: "El tipo de crisis no determina el dominio del cambio cognitivo reportado." },
          { text: "Porque trabaja", correct: false, feedback: "El contexto laboral no define el dominio." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué constructos se afectan, y por qué no se trataría de un déficit de 'lenguaje'?",
        options: [
          { text: "Velocidad de procesamiento y memoria — porque describe lentitud y olvidos cotidianos, sin ninguna dificultad para producir o comprender el lenguaje", correct: true, feedback: "Correcto. Sus quejas apuntan a qué tan rápido procesa y a recordar, no a encontrar palabras o entender el habla. Por eso los constructos son velocidad de procesamiento y memoria, no lenguaje." },
          { text: "Lenguaje, porque habla de su desempeño", correct: false, feedback: "Hablar de su desempeño no implica un déficit de lenguaje; no hay ninguna dificultad lingüística descrita." },
          { text: "Percepción, porque se siente lento", correct: false, feedback: "La lentitud no es un déficit perceptivo; es de velocidad de procesamiento." },
          { text: "Cognición social, por su trabajo", correct: false, feedback: "No hay componente social en sus quejas; trabajar no implica un déficit de cognición social." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia más útil es 'conducta' (pruebas seriadas) y no solo el 'autorreporte' del paciente?",
        options: [
          { text: "Porque para diferenciar el efecto de las crisis del efecto del fármaco se necesita medir objetivamente el desempeño y compararlo en el tiempo, no basta su impresión subjetiva", correct: true, feedback: "Correcto. El autorreporte indica que algo cambió, pero solo el desempeño medido en pruebas seriadas (conducta) permite cuantificar el cambio y atribuirlo a las crisis o a la medicación." },
          { text: "Porque el paciente exagera sus síntomas", correct: false, feedback: "No hay indicio de exageración; el punto es la necesidad de una medida objetiva, no desconfiar del paciente." },
          { text: "Porque el autorreporte no sirve en epilepsia", correct: false, feedback: "El autorreporte sí aporta; lo que se busca además es la medición objetiva del desempeño." },
          { text: "Porque toma medicación", correct: false, feedback: "Tomar medicación no es lo que define que la unidad sea conducta; lo es la necesidad de medir el desempeño objetivamente." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "NEUROPSI Atención y Memoria (seguimiento pre/post tratamiento)", correct: true, feedback: "Correcto. Permite documentar de forma objetiva el perfil de atención y memoria, y comparar resultados a lo largo del tiempo para diferenciar el efecto de las crisis del efecto del tratamiento antiepiléptico." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para el seguimiento cognitivo de un paciente con epilepsia." },
          { text: "Escala de Depresión Geriátrica de Yesavage", correct: false, feedback: "Esta escala está diseñada para tamizaje afectivo en adultos mayores; no es la más adecuada para un paciente de 38 años." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a un paciente adulto de 38 años." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Adultos", domainKey: "COG", unitKey: "CON",
    intro: "Paciente de 26 años, 3 meses después de un accidente de motocicleta con traumatismo craneoencefálico moderado, es referido para valoración neuropsicológica antes de reintegrarse a su trabajo.",
    interview: [
      { q: "¿Qué reporta sobre su memoria desde el accidente?", reveal: "Olvida citas y conversaciones recientes con frecuencia, aunque su memoria de eventos antes del accidente está intacta." },
      { q: "¿Cómo describe su personalidad ahora, según él y su familia?", reveal: "La familia nota que se irrita con más facilidad y que parece 'menos filtrado' al hablar — dice cosas que antes se habría guardado." },
      { q: "¿Qué dificultades reporta para organizarse en el día a día?", reveal: "Le cuesta planear sus actividades diarias y termina tareas a medias, saltando de una cosa a otra sin terminar ninguna." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Demencia frontotemporal", correct: false, feedback: "La demencia frontotemporal es un proceso neurodegenerativo progresivo de inicio insidioso; aquí el cuadro tiene un inicio claro y agudo (el accidente) seguido de una evolución que, con rehabilitación, puede mejorar.", consequence: "Etiquetar el cuadro como demencia frontotemporal sugeriría un pronóstico degenerativo incorrecto, cuando muchas secuelas de TCE moderado pueden mejorar significativamente con rehabilitación neuropsicológica." },
          { text: "Síndrome disejecutivo postraumático (secuela de TCE)", correct: true, feedback: "Correcto. La desinhibición conductual, la irritabilidad, las dificultades de planeación y el olvido de información reciente, en el contexto temporal claro de un TCE moderado, son congruentes con un síndrome disejecutivo postraumático." },
          { text: "Trastorno Bipolar", correct: false, feedback: "El trastorno bipolar implica episodios de alteración del ánimo de varios días de duración; aquí el cambio es de personalidad y control de impulsos, en relación temporal directa con el TCE, no episodios afectivos cíclicos.", consequence: "Si se hubiera diagnosticado trastorno bipolar, se indicaría un tratamiento farmacológico distinto, sin abordar la verdadera necesidad: rehabilitación dirigida a las funciones ejecutivas." },
          { text: "Trastorno de Estrés Postraumático (TEPT)", correct: false, feedback: "El TEPT se centra en revivencias intrusivas del evento traumático y evitación; aquí el cuadro central es de cambios cognitivos y de personalidad por la lesión cerebral en sí, no por el recuerdo del accidente.", consequence: "Si se hubiera tratado solo como TEPT, se enfocaría la intervención en el procesamiento del trauma, dejando sin atender el verdadero origen orgánico de sus dificultades de planeación e impulsividad." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato distingue MEJOR este cuadro de un trastorno de estrés postraumático (TEPT)?",
        options: [
          { text: "Que tuvo un accidente de motocicleta", correct: false, feedback: "El accidente es el evento común a ambas hipótesis; no las distingue." },
          { text: "Que los cambios son de control de impulsos y planeación ligados a la lesión cerebral, no revivencias o evitación del recuerdo del accidente", correct: true, feedback: "Exacto. El TEPT gira en torno a revivir el trauma y evitarlo; aquí el cuadro es de desinhibición y disfunción ejecutiva por el daño cerebral en sí. Distinguir 'secuela orgánica' de 'respuesta al recuerdo' es la clave." },
          { text: "Que olvida conversaciones recientes", correct: false, feedback: "El olvido reciente es un síntoma, pero no es lo que específicamente descarta el TEPT." },
          { text: "Que la familia lo notó cambiado", correct: false, feedback: "Que la familia note el cambio no distingue entre una secuela ejecutiva y el TEPT." },
        ]
      },
      {
        type: "dominio", prompt: "El 'menos filtrado' al hablar afecta lo social. ¿Por qué el dominio es Sistemas Cognitivos y no Procesos Sociales?",
        options: [
          { text: "Porque tuvo un TCE", correct: false, feedback: "El antecedente de TCE explica el origen, pero no decide entre dominio cognitivo y social." },
          { text: "Porque el problema social es secundario a un fallo de INHIBICIÓN (control cognitivo), no a una incapacidad para entender a los demás", correct: true, feedback: "Correcto. Dice cosas que antes se guardaba porque no logra frenar la respuesta, no porque no comprenda al otro. La raíz es ejecutiva (Cognitivos); el roce social es una consecuencia, no un déficit primario de cognición social." },
          { text: "Porque se irrita con facilidad", correct: false, feedback: "La irritabilidad acompaña al cuadro, pero el argumento es que el déficit raíz es de control, no social." },
          { text: "Porque va a volver al trabajo", correct: false, feedback: "El contexto laboral no determina el dominio." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que el constructo central sea 'control cognitivo' y no 'memoria declarativa', si también hay olvidos?",
        options: [
          { text: "Que el rasgo definitorio es la desinhibición y la falla para planear/terminar tareas; los olvidos son parte del cuadro pero no su núcleo", correct: true, feedback: "Correcto. La desinhibición (decir lo que antes callaba) y la imposibilidad de planear y completar tareas son fallos ejecutivos típicos de daño prefrontal. Aunque haya olvidos, lo que define el síndrome disejecutivo es el control cognitivo." },
          { text: "Que olvida conversaciones", correct: false, feedback: "Eso apuntaría a memoria; el punto es que el rasgo CENTRAL y distintivo es la desinhibición ejecutiva." },
          { text: "Que tuvo un accidente", correct: false, feedback: "El mecanismo de la lesión no define cuál constructo es el central." },
          { text: "Que es joven", correct: false, feedback: "La edad no determina el constructo afectado." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia es 'conducta' y no 'circuitos', pese al daño prefrontal por el TCE?",
        options: [
          { text: "Porque la desinhibición se documenta observándola y por el reporte de la familia, más el desempeño en pruebas ejecutivas — no interpretando la imagen del cerebro", correct: true, feedback: "Correcto. Aunque el sustrato sea prefrontal, lo que la valoración mide directamente es la conducta: lo que la familia observa y el rendimiento en tareas ejecutivas. La unidad es conducta, no circuitos." },
          { text: "Porque no hubo lesión cerebral", correct: false, feedback: "Sí hubo TCE con compromiso prefrontal; el punto es qué mide la valoración (conducta)." },
          { text: "Porque la familia no es experta", correct: false, feedback: "Quién reporta no es lo decisivo; lo es que la evidencia es conductual, no de neuroimagen." },
          { text: "Porque va a reintegrarse al trabajo", correct: false, feedback: "El objetivo de la valoración no define la unidad de análisis." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "BANFE-3", correct: true, feedback: "Correcto. BANFE-3 está diseñado específicamente para evaluar funciones ejecutivas dependientes de la corteza prefrontal — exactamente el sistema más vulnerable en secuelas de TCE con desinhibición y dificultades de planeación." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para perfilar secuelas ejecutivas de un TCE." },
          { text: "Escalas de Conners", correct: false, feedback: "Las escalas de Conners se centran en síntomas de TDAH en general; no son el instrumento específico para el perfil ejecutivo postraumático que se necesita aquí." },
          { text: "MoCA", correct: false, feedback: "El MoCA es un tamizaje breve de deterioro cognitivo, generalmente usado en adultos mayores; no ofrece el nivel de detalle sobre funciones ejecutivas que sí ofrece BANFE-3." },
        ]
      }
    ]
  },
  // ===== CASOS GERIÁTRICOS =====
  {
    level: 2, difficulty: 3, grupo: "Geriátrico", domainKey: "COG", unitKey: "CON",
    intro: "Paciente de 74 años es llevado por su hija, quien refiere que 'ya no es el mismo' desde hace aproximadamente 2 años, con un cambio gradual y progresivo.",
    interview: [
      { q: "¿Cómo ha sido la progresión de sus olvidos?", reveal: "Empezó olvidando citas y nombres recientes; ahora también repite las mismas preguntas varias veces en una conversación y se pierde en rutas que antes conocía bien." },
      { q: "¿Cómo está su capacidad para actividades cotidianas?", reveal: "Ya no puede manejar su propio dinero ni recordar tomar sus medicamentos sin supervisión, aunque aún se viste y come solo." },
      { q: "¿Hay fluctuaciones marcadas día a día, o el deterioro es más bien constante?", reveal: "Es bastante constante y gradual — no hay días 'buenos y malos' marcados, simplemente ha ido empeorando poco a poco con el tiempo." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Delirium (síndrome confusional agudo)", correct: false, feedback: "El delirium se caracteriza por inicio agudo y fluctuación marcada del estado de alerta a lo largo del día; aquí el deterioro es gradual y constante durante 2 años.", consequence: "Si se hubiera tratado como delirium, se buscarían causas médicas agudas reversibles, perdiendo de vista el patrón gradual y progresivo que requiere una evaluación distinta." },
          { text: "Trastorno Neurocognitivo Mayor, perfil sugestivo de etiología tipo Alzheimer", correct: true, feedback: "Correcto. El inicio gradual, la progresión constante de la memoria episódica reciente, la desorientación espacial y la pérdida de independencia funcional son el perfil clásico de un trastorno neurocognitivo mayor tipo Alzheimer." },
          { text: "Depresión geriátrica con quejas cognitivas (pseudodemencia)", correct: false, feedback: "La pseudodemencia depresiva suele tener un inicio más rápido y síntomas anímicos prominentes; aquí el patrón es de deterioro progresivo de 2 años, sin que se mencionen síntomas depresivos marcados.", consequence: "Si se hubiera tratado solo como depresión, se retrasaría el diagnóstico y manejo apropiado del trastorno neurocognitivo, perdiendo tiempo valioso para intervenciones tempranas." },
          { text: "Encefalopatía hepática", correct: false, feedback: "No hay ningún antecedente de enfermedad hepática mencionado, y el patrón de deterioro gradual durante 2 años no es típico de una encefalopatía metabólica.", consequence: "Si se hubiera buscado una causa hepática sin evidencia clínica que la sugiera, se retrasaría la evaluación del verdadero proceso neurodegenerativo en curso." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué rasgo distingue MEJOR este cuadro de un delirium (síndrome confusional agudo)?",
        options: [
          { text: "Que ya no maneja su dinero", correct: false, feedback: "La pérdida funcional ocurre en ambos cuadros avanzados; no los distingue." },
          { text: "Que el deterioro es gradual y constante a lo largo de 2 años, sin las fluctuaciones marcadas del estado de alerta propias del delirium", correct: true, feedback: "Exacto. El delirium es de inicio agudo y fluctúa a lo largo del día; aquí el curso es lento, progresivo y sin días marcadamente 'buenos y malos'. La trayectoria temporal es la clave diferencial." },
          { text: "Que repite preguntas", correct: false, feedback: "Repetir preguntas refleja el fallo de memoria, pero no es lo que distingue específicamente del delirium." },
          { text: "Que tiene 74 años", correct: false, feedback: "La edad no distingue ambos cuadros." },
        ]
      },
      {
        type: "dominio", prompt: "¿Por qué el déficit central es Sistemas Cognitivos y no Activación y Regulación?",
        options: [
          { text: "Porque el deterioro dura 2 años", correct: false, feedback: "La duración apoya que sea neurodegenerativo, pero no es el argumento para elegir el dominio cognitivo sobre el de activación." },
          { text: "Porque su estado de alerta está preservado y lo que falla es la memoria y la orientación, funciones cognitivas, no el nivel de arousal", correct: true, feedback: "Correcto. No hay alteración del nivel de conciencia (eso sería Activación y Regulación); el paciente está alerta pero olvida y se desorienta. El déficit es de funciones cognitivas específicas." },
          { text: "Porque su hija lo trajo", correct: false, feedback: "Quién lo trae no determina el dominio." },
          { text: "Porque aún come y se viste solo", correct: false, feedback: "Eso indica el grado de conservación funcional, no por qué el dominio es cognitivo." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que el constructo central sea 'memoria declarativa episódica' y no 'control cognitivo'?",
        options: [
          { text: "Que el rasgo más temprano y prominente es olvidar hechos y eventos recientes (repetir preguntas, perder rutas), no un fallo de inhibición o planeación", correct: true, feedback: "Correcto. El patrón tipo Alzheimer arranca con la memoria episódica reciente. Aunque más adelante pueda haber afectación ejecutiva, el déficit nuclear y temprano descrito aquí es mnésico." },
          { text: "Que ya no maneja su dinero", correct: false, feedback: "Manejar dinero involucra varias funciones; el rasgo definitorio temprano descrito es el olvido episódico." },
          { text: "Que se desorienta en rutas conocidas", correct: false, feedback: "La desorientación acompaña, pero el constructo nuclear que define el cuadro es la memoria episódica reciente." },
          { text: "Que tiene 74 años", correct: false, feedback: "La edad no define el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la evidencia combina 'conducta' (desempeño) con el reporte de un informante, y no se basa en 'autorreporte'?",
        options: [
          { text: "Porque el propio deterioro limita su conciencia del problema, así que se necesita el desempeño objetivo y un informante confiable, no su reporte subjetivo", correct: true, feedback: "Correcto. En un trastorno neurocognitivo, el autorreporte es poco fiable por la falta de conciencia del déficit. La evidencia válida es el desempeño medido (conducta) más la información funcional de la hija (informante)." },
          { text: "Porque la hija es médica", correct: false, feedback: "No se indica que la hija sea médica; su valor es el de informante que conoce el funcionamiento diario." },
          { text: "Porque no se hizo neuroimagen", correct: false, feedback: "La ausencia de imagen descarta 'circuitos', pero no es lo que explica por qué se usa conducta más informante en vez de autorreporte." },
          { text: "Porque tiene 74 años", correct: false, feedback: "La edad no define la unidad de análisis." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "NEUROPSI Atención y Memoria + entrevista funcional con informante", correct: true, feedback: "Correcto. Permite documentar objetivamente el perfil de memoria y atención, complementado con la información funcional de un informante confiable — esencial para diferenciar un trastorno neurocognitivo de otros cuadros." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a un paciente de 74 años." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para este perfil de deterioro cognitivo gradual." },
          { text: "Test de Stroop únicamente", correct: false, feedback: "El Stroop aporta información puntual sobre control inhibitorio, pero por sí solo es insuficiente para perfilar el patrón completo de memoria y funcionalidad que requiere este caso." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 4, grupo: "Geriátrico", domainKey: "COG", unitKey: "CON",
    intro: "Paciente de 78 años con antecedente de varios eventos vasculares cerebrales pequeños ('infartos silenciosos' detectados en estudios previos) es referido tras un cambio cognitivo notado por la familia.",
    interview: [
      { q: "¿Cómo ha sido el patrón de deterioro, según la familia?", reveal: "A diferencia de un deterioro suave y continuo, describen 'escalones' — periodos estables seguidos de caídas más notorias, que coinciden con eventos médicos puntuales." },
      { q: "¿Qué tipo de dificultades predominan?", reveal: "Más que olvidos puros, predominan la lentitud para procesar información, dificultad para planear tareas con varios pasos, y cambios en la marcha (camina más lento e inestable)." },
      { q: "¿Cómo está su memoria reciente comparada con su capacidad de planeación?", reveal: "Su memoria reciente está relativamente conservada si se le da tiempo extra; el problema más notorio es la lentitud y la dificultad para organizar y ejecutar tareas complejas." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno Neurocognitivo Mayor tipo Alzheimer", correct: false, feedback: "El Alzheimer típicamente presenta un deterioro gradual y continuo con la memoria episódica como dominio más afectado desde el inicio; aquí el patrón es 'escalonado' y predomina la lentitud/disfunción ejecutiva sobre el olvido puro.", consequence: "Si se hubiera diagnosticado tipo Alzheimer, se buscarían intervenciones dirigidas a ese perfil específico, sin atender el manejo de los factores de riesgo vascular que son centrales en este caso." },
          { text: "Trastorno Neurocognitivo Vascular", correct: true, feedback: "Correcto. El patrón de deterioro 'en escalones' asociado a eventos vasculares, junto con el predominio de lentitud de procesamiento, disfunción ejecutiva y cambios en la marcha, es el perfil característico del trastorno neurocognitivo de origen vascular." },
          { text: "Encefalopatía hepática", correct: false, feedback: "No hay ningún antecedente de enfermedad hepática; el patrón descrito se relaciona claramente con los eventos vasculares cerebrales previos documentados.", consequence: "Buscar una causa hepática sin evidencia clínica retrasaría el manejo apropiado de los factores de riesgo cardiovascular, que son el objetivo terapéutico central en este perfil." },
          { text: "Desnutrición", correct: false, feedback: "No se menciona ningún dato relacionado con el estado nutricional del paciente; el cuadro se explica directamente por los eventos vasculares cerebrales documentados.", consequence: "Enfocar la evaluación en un posible origen nutricional sin evidencia retrasaría la atención al control de los factores de riesgo vascular, que es la prioridad clínica en este caso." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué rasgo distingue MEJOR este cuadro de un trastorno neurocognitivo tipo Alzheimer?",
        options: [
          { text: "Que tiene antecedente de eventos vasculares", correct: false, feedback: "El antecedente vascular es una pista importante, pero el rasgo que distingue el CURSO del cuadro es otro." },
          { text: "Que el deterioro avanza 'en escalones' (estable–caída–estable) y predomina la lentitud/disfunción ejecutiva sobre el olvido puro", correct: true, feedback: "Exacto. El Alzheimer es gradual y continuo con la memoria como blanco temprano; el vascular avanza por escalones ligados a eventos y golpea antes la velocidad y la función ejecutiva. El patrón del curso y el perfil cognitivo son la clave." },
          { text: "Que tiene 78 años", correct: false, feedback: "La edad no distingue ambos tipos de deterioro." },
          { text: "Que la familia notó el cambio", correct: false, feedback: "Que la familia lo note no diferencia el tipo de deterioro." },
        ]
      },
      {
        type: "dominio", prompt: "Hay cambios en la marcha. ¿Por qué el déficit que se evalúa se ubica en Sistemas Cognitivos y no en Sensoriomotores?",
        options: [
          { text: "Porque tuvo eventos vasculares", correct: false, feedback: "El antecedente vascular explica el origen, pero no decide entre el dominio cognitivo y el sensoriomotor." },
          { text: "Porque el motivo de la valoración neuropsicológica es la lentitud de procesamiento y la disfunción ejecutiva, no el trastorno de la marcha en sí", correct: true, feedback: "Correcto. Aunque la marcha esté alterada (un signo neurológico), lo que se evalúa y predomina cognitivamente es la lentitud y el fallo ejecutivo. El déficit que nos ocupa es cognitivo." },
          { text: "Porque camina más lento", correct: false, feedback: "La lentitud de la marcha es un signo motor; el argumento es que el déficit evaluado es cognitivo." },
          { text: "Porque tiene 78 años", correct: false, feedback: "La edad no define el dominio." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que predomine 'control cognitivo y velocidad de procesamiento' y no 'memoria declarativa episódica'?",
        options: [
          { text: "Que su memoria reciente se conserva relativamente si se le da tiempo extra, mientras que lo más afectado es organizar tareas de varios pasos y la velocidad", correct: true, feedback: "Correcto. Esa disociación —memoria relativamente preservada con tiempo vs. disfunción ejecutiva y lentitud marcadas— es justo lo que separa el perfil vascular del de Alzheimer, donde la memoria episódica cae primero." },
          { text: "Que tuvo varios infartos pequeños", correct: false, feedback: "El número de infartos explica el mecanismo, no cuál constructo predomina." },
          { text: "Que camina inestable", correct: false, feedback: "La marcha es un signo motor, no define el constructo cognitivo predominante." },
          { text: "Que la familia lo notó", correct: false, feedback: "La observación familiar no determina el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la unidad es 'conducta' y no 'circuitos', si hay lesiones vasculares en estudios previos?",
        options: [
          { text: "Porque el déficit se documenta con el desempeño del paciente en pruebas ejecutivas y de procesamiento, no interpretando directamente las imágenes de las lesiones", correct: true, feedback: "Correcto. Las imágenes muestran las lesiones, pero la valoración neuropsicológica mide el desempeño (conducta). La unidad de esa evidencia funcional es conductual, aunque exista sustrato vascular visible." },
          { text: "Porque las lesiones eran 'silenciosas'", correct: false, feedback: "Que fueran silenciosas se refiere a que no dieron síntomas agudos; no es lo que define la unidad de análisis." },
          { text: "Porque no se puede hacer neuroimagen a esa edad", correct: false, feedback: "Sí puede hacerse; de hecho ya hay estudios previos. El punto es qué mide la valoración: conducta." },
          { text: "Porque tiene problemas de marcha", correct: false, feedback: "La marcha no define que la unidad de la evaluación cognitiva sea conducta." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "BANFE-3 + NEUROPSI Atención y Memoria", correct: true, feedback: "Correcto. Esta combinación permite documentar tanto el perfil de funciones ejecutivas (frecuentemente el más afectado en el deterioro vascular) como la atención y memoria, dando un panorama más completo que evaluar solo memoria." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a un paciente de 78 años." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para este perfil de deterioro vascular." },
          { text: "Child Concentration Inventory (CCI)", correct: false, feedback: "El CCI está diseñado para evaluar síntomas de desconexión cognitiva en niños y adolescentes; no aplica a este caso geriátrico." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Geriátrico", domainKey: "AR", unitKey: "FIS", reversible: true, keyInterviewClue: 2,
    intro: "Paciente de 67 años con cirrosis hepática conocida es traído por su esposa, quien refiere que 'desde hace una semana habla raro y está muy confundido'.",
    interview: [
      { q: "¿Cómo describe el inicio de estos cambios?", reveal: "Fue bastante rápido, en cuestión de días, no algo que haya ido empeorando durante meses o años." },
      { q: "¿Hay algo particular en su forma de hablar o de moverse?", reveal: "Habla de forma lenta y a veces incoherente, y la esposa notó un temblor extraño en las manos cuando las extiende hacia adelante." },
      { q: "¿Hubo algún evento reciente relacionado con su enfermedad hepática?", reveal: "Sí — hace unos días tuvo una infección y dejó de tomar uno de sus medicamentos habituales por las náuseas." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno Neurocognitivo Mayor tipo Alzheimer", correct: false, feedback: "El Alzheimer tiene un inicio gradual a lo largo de meses o años, no un cambio confusional agudo de días, y no se asocia típicamente con el temblor característico descrito (asterixis).", consequence: "Si se hubiera diagnosticado un trastorno neurodegenerativo, se perdería tiempo crítico: la encefalopatía hepática puede ser potencialmente reversible si se trata la causa metabólica de fondo a tiempo." },
          { text: "Encefalopatía hepática (descompensación en paciente con cirrosis)", correct: true, feedback: "Correcto. El inicio agudo de confusión y habla incoherente, el temblor característico al extender las manos (asterixis), y el antecedente de cirrosis con un evento descompensante reciente, son el cuadro clásico de encefalopatía hepática." },
          { text: "Delirium por infección urinaria", correct: false, feedback: "Aunque una infección puede contribuir como factor desencadenante, el antecedente de cirrosis y el temblor característico apuntan específicamente a una descompensación hepática como mecanismo central.", consequence: "Si se hubiera tratado solo la infección sin reconocer la descompensación hepática de fondo, el cuadro confusional podría empeorar al no abordarse el mecanismo metabólico principal." },
          { text: "Crisis de ausencia en el adulto", correct: false, feedback: "Las crisis de ausencia son episodios breves y estereotipados de segundos de duración, no un estado de confusión sostenido durante días, ni se asocian con el temblor descrito.", consequence: "Buscar un origen epiléptico sin considerar la descompensación hepática de base retrasaría el tratamiento metabólico urgente que este paciente requiere." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato distingue MEJOR este cuadro de un trastorno neurocognitivo tipo Alzheimer?",
        options: [
          { text: "Que tiene cirrosis", correct: false, feedback: "La cirrosis es el factor de fondo clave, pero el rasgo que distingue el CURSO del cuadro frente al Alzheimer es otro." },
          { text: "Que la confusión apareció en cuestión de días (no en meses/años) y se acompaña de asterixis, en el contexto de una descompensación reciente", correct: true, feedback: "Exacto. El Alzheimer es de inicio insidioso a lo largo de años; aquí el cuadro es agudo (días), con el temblor característico (asterixis) y un detonante metabólico reciente. El curso agudo y el signo motor son la clave — y advierten que es potencialmente reversible." },
          { text: "Que habla de forma lenta", correct: false, feedback: "El habla lenta es un síntoma del estado confusional, pero no es lo que específicamente lo distingue del Alzheimer." },
          { text: "Que tiene 67 años", correct: false, feedback: "La edad no distingue ambos cuadros." },
        ]
      },
      {
        type: "dominio", prompt: "¿Por qué la función primariamente comprometida se ubica en Activación y Regulación y no en Sistemas Cognitivos?",
        options: [
          { text: "Porque tiene cirrosis", correct: false, feedback: "La cirrosis es la causa, pero no es el argumento sobre qué función primaria está alterada." },
          { text: "Porque lo afectado de raíz es el nivel global de conciencia/arousal, del que dependen todas las funciones cognitivas en ese momento", correct: true, feedback: "Correcto. No falla un constructo cognitivo aislado: el estado de conciencia global está alterado por la causa metabólica. Como la activación es lo primario, el dominio es Activación y Regulación." },
          { text: "Porque habla incoherente", correct: false, feedback: "El habla incoherente deriva del estado confusional global; el argumento es que lo primario es la conciencia, no el lenguaje." },
          { text: "Porque dejó un medicamento", correct: false, feedback: "Eso explica el detonante, no por qué el dominio es de activación." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que el constructo central sea 'arousal/nivel de conciencia' y no 'lenguaje', si habla de forma incoherente?",
        options: [
          { text: "Que la incoherencia surge de la alteración global de la conciencia, no de una falla focal del sistema del lenguaje como en una afasia", correct: true, feedback: "Correcto. En una afasia, el lenguaje falla con la conciencia preservada. Aquí el habla se desorganiza porque TODO el estado de conciencia está comprometido por la causa metabólica — el constructo es arousal, no lenguaje." },
          { text: "Que tiene cirrosis", correct: false, feedback: "La causa de fondo no define cuál constructo está afectado." },
          { text: "Que tiene asterixis", correct: false, feedback: "La asterixis apoya el diagnóstico metabólico, pero no es lo que distingue arousal de lenguaje." },
          { text: "Que es un cuadro agudo", correct: false, feedback: "La agudeza apoya el diagnóstico, pero el argumento del constructo es que la conciencia global —no el lenguaje— es lo alterado." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué el mecanismo se evidencia mejor en 'fisiología' y no en 'autorreporte'?",
        options: [
          { text: "Porque la causa es una alteración metabólica objetiva (y la asterixis un signo físico), mientras el estado confusional hace poco fiable lo que el paciente pueda reportar", correct: true, feedback: "Correcto. El mecanismo es metabólico/fisiológico y se documenta con datos objetivos y signos físicos. Por la confusión, el autorreporte no es una fuente válida del mecanismo aquí." },
          { text: "Porque el paciente no quiere hablar", correct: false, feedback: "No es falta de voluntad: es que su estado confusional hace poco fiable el autorreporte." },
          { text: "Porque la esposa lo trajo", correct: false, feedback: "Quién lo trae no define la unidad de análisis del mecanismo." },
          { text: "Porque tiene 67 años", correct: false, feedback: "La edad no define la unidad de análisis." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "NEUROPSI Breve (tamizaje rápido) + escala clínica de estadificación (West Haven)", correct: true, feedback: "Correcto. En un cuadro agudo como este, un tamizaje cognitivo breve junto con una escala clínica de gravedad de la encefalopatía hepática (West Haven, usada por el equipo médico) permiten documentar el estado cognitivo y dar seguimiento al tratamiento metabólico." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a este paciente adulto." },
          { text: "BANFE-3 completo", correct: false, feedback: "Una batería extensa de 50 minutos no es apropiada para un paciente en un estado confusional agudo; se prioriza un tamizaje breve y herramientas clínicas de estadificación de la gravedad metabólica." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para este cuadro de confusión aguda por descompensación hepática." },
        ]
      }
    ]
  },
  {
    level: 2, difficulty: 3, grupo: "Geriátrico", domainKey: "COG", unitKey: "FIS", reversible: true, keyInterviewClue: 2,
    intro: "Paciente de 81 años, que vive sola, es llevada a consulta por su sobrina, quien notó que 'ha bajado mucho de peso' y 'está como ida' en las últimas visitas.",
    interview: [
      { q: "¿Cómo ha sido su alimentación recientemente?", reveal: "La sobrina sospecha que come muy poco, posiblemente por dificultad para cocinar sola y falta de apetito; ha perdido peso notorio en los últimos meses." },
      { q: "¿Qué cambios cognitivos ha notado la familia?", reveal: "La notan más lenta para responder, con dificultad para concentrarse, y a veces confundida sobre el día o la hora — algo que antes no le pasaba." },
      { q: "¿Hay algún dato físico que llame la atención además del peso?", reveal: "Se ve pálida, con poca energía, y la sobrina notó que sus encías sangran con facilidad al cepillarse los dientes." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno Neurocognitivo Mayor tipo Alzheimer", correct: false, feedback: "Aunque hay cambios cognitivos, el contexto de pérdida de peso marcada, palidez y sangrado de encías sugiere fuertemente una causa nutricional/metabólica que debe descartarse antes de atribuir el cuadro a un proceso neurodegenerativo primario.", consequence: "Si se hubiera diagnosticado directamente un trastorno neurodegenerativo sin descartar primero una causa nutricional reversible, se perdería la oportunidad de revertir el deterioro cognitivo con una intervención nutricional oportuna." },
          { text: "Deterioro cognitivo asociado a desnutrición/deficiencias vitamínicas", correct: true, feedback: "Correcto. La combinación de pérdida de peso marcada, lentitud cognitiva, desorientación, palidez y sangrado de encías es un cuadro clásico de deficiencias nutricionales que pueden producir un deterioro cognitivo significativo — potencialmente reversible al corregir la deficiencia." },
          { text: "Encefalopatía hepática", correct: false, feedback: "No hay ningún antecedente de enfermedad hepática mencionado; el cuadro de palidez, sangrado de encías y pérdida de peso apunta directamente a un origen nutricional.", consequence: "Buscar una causa hepática sin evidencia clínica retrasaría la corrección urgente del estado nutricional, que es la prioridad inmediata en este caso." },
          { text: "Depresión geriátrica", correct: false, feedback: "Aunque la depresión puede coexistir y reducir el apetito, los signos físicos descritos apuntan a un componente nutricional/médico que requiere evaluación y manejo prioritario, más allá de un cuadro puramente afectivo.", consequence: "Si se hubiera tratado solo como depresión, se retrasaría la atención al estado nutricional, que en adultos mayores puede tener consecuencias médicas graves si no se corrige a tiempo." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué dato hace MENOS aconsejable atribuir el cuadro directamente a un trastorno neurodegenerativo tipo Alzheimer?",
        options: [
          { text: "Que vive sola", correct: false, feedback: "Vivir sola es un factor de riesgo para descuido nutricional, pero no es el dato clínico que reorienta el diagnóstico." },
          { text: "Que el deterioro cognitivo coexiste con pérdida de peso, palidez y sangrado de encías — signos físicos que apuntan a una causa nutricional potencialmente reversible", correct: true, feedback: "Exacto. Esos signos físicos obligan a descartar primero una causa nutricional/metabólica antes de asumir un proceso degenerativo irreversible. Razonar 'qué causa reversible podría explicar TODO el cuadro' es la clave." },
          { text: "Que está 'como ida'", correct: false, feedback: "El estado 'ida' es el síntoma cognitivo a explicar, no lo que reorienta hacia una causa nutricional." },
          { text: "Que tiene 81 años", correct: false, feedback: "La edad avanzada incluso favorecería pensar en neurodegeneración; no es lo que reorienta el diagnóstico." },
        ]
      },
      {
        type: "dominio", prompt: "Tiene poca energía. ¿Por qué la alteración que se evalúa se ubica en Sistemas Cognitivos y no en Activación y Regulación?",
        options: [
          { text: "Porque ha perdido peso", correct: false, feedback: "La pérdida de peso señala la causa, pero no es el argumento sobre el dominio del déficit evaluado." },
          { text: "Porque lo que se documenta es lentitud cognitiva, dificultad de concentración y desorientación (funciones cognitivas), aunque su causa sea nutricional", correct: true, feedback: "Correcto. El dominio se asigna por la función alterada, no por la causa: aquí se evalúan procesos cognitivos (atención, orientación, velocidad). La causa nutricional es el porqué, pero el déficit es cognitivo." },
          { text: "Porque tiene poca energía", correct: false, feedback: "La falta de energía podría sugerir activación, pero lo que se evalúa y documenta son fallas cognitivas concretas." },
          { text: "Porque la trajo su sobrina", correct: false, feedback: "Quién la trae no determina el dominio." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que los constructos sean 'atención y velocidad de procesamiento' y no 'lenguaje'?",
        options: [
          { text: "Que lo descrito es lentitud para responder y dificultad para concentrarse, sin ninguna falla para comprender o producir el lenguaje", correct: true, feedback: "Correcto. Sus quejas apuntan a qué tan rápido procesa y a sostener el foco; no hay dificultad lingüística. Por eso los constructos son atención y velocidad de procesamiento, potencialmente reversibles al corregir la deficiencia." },
          { text: "Que perdió peso", correct: false, feedback: "La pérdida de peso es la pista causal, no define el constructo cognitivo." },
          { text: "Que sangra de las encías", correct: false, feedback: "Es un signo físico de la causa nutricional, no determina el constructo afectado." },
          { text: "Que vive sola", correct: false, feedback: "Su situación de vida no define el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué la causa de fondo se evidencia mejor en 'fisiología' que en 'conducta'?",
        options: [
          { text: "Porque la pérdida de peso, la palidez y el sangrado de encías son signos físicos que apuntan directamente al mecanismo nutricional, mientras la lentitud es solo la consecuencia observable", correct: true, feedback: "Correcto. La conducta (lentitud) muestra el efecto; los signos físicos revelan la causa fisiológica. Para fundamentar el origen nutricional, la evidencia directa es fisiológica." },
          { text: "Porque está 'como ida'", correct: false, feedback: "Eso es la consecuencia conductual/cognitiva, no la evidencia de la causa de fondo." },
          { text: "Porque la sobrina la trajo", correct: false, feedback: "Quién la trae no define la unidad de análisis de la causa." },
          { text: "Porque tiene 81 años", correct: false, feedback: "La edad no define la unidad de análisis." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "Mini Nutritional Assessment (MNA) + NEUROPSI Breve", correct: true, feedback: "Correcto. El MNA es el instrumento de tamizaje nutricional específico para adultos mayores, y combinarlo con un tamizaje cognitivo breve permite documentar tanto el estado nutricional como el impacto cognitivo actual." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a esta paciente de 81 años." },
          { text: "BANFE-3 completo", correct: false, feedback: "Una batería extensa de funciones ejecutivas no es la prioridad inicial en un cuadro donde primero debe documentarse y atenderse el estado nutricional." },
          { text: "Inventario Neuropsiquiátrico (NPI)", correct: false, feedback: "El NPI evalúa síntomas conductuales y psicológicos en el contexto de demencias ya establecidas; en este caso aún se está documentando si el cuadro es nutricional y potencialmente reversible." },
        ]
      },
      {
        type: "contexto", prompt: "¿Qué dimensión transversal RDoC resulta decisiva aquí?",
        options: [
          { text: "Ambiente — un factor nutricional del contexto está produciendo el deterioro, y corregirlo puede revertirlo.", correct: true, feedback: "Correcto. Reconocer la dimensión ambiental (nutrición) es lo que abre la puerta a un tratamiento que revierta el deterioro." },
          { text: "Neurodesarrollo — es un patrón presente desde la infancia.", correct: false, feedback: "No: es un cambio adquirido en la vejez, ligado al contexto nutricional, no a la trayectoria del desarrollo." },
          { text: "Ninguna — el deterioro cognitivo se explica solo por la edad.", correct: false, feedback: "Atribuirlo solo a la edad haría perder una causa ambiental tratable y potencialmente reversible." },
        ]
      }
    ]
  },
  {
    level: 3, difficulty: 5, grupo: "Geriátrico", domainKey: "AR", unitKey: "FIS", reversible: true, keyInterviewClue: 2,
    intro: "Paciente de 69 años es traída a urgencias por su familia tras presentar confusión fluctuante y un episodio de movimientos anormales en el último mes.",
    interview: [
      { q: "¿Cómo ha sido el patrón de los síntomas?", reveal: "Muy fluctuante — algunos días está relativamente lúcida y otros días está muy confundida, con episodios de movimientos involuntarios breves (mioclonías)." },
      { q: "¿Qué antecedentes médicos relevantes tiene?", reveal: "Tiene antecedente de hipotiroidismo de Hashimoto, diagnosticado hace varios años, en tratamiento con levotiroxina." },
      { q: "¿Qué resultados de laboratorio ha reportado el equipo médico?", reveal: "Los anticuerpos antitiroideos están muy elevados, mientras que los estudios para descartar otras causas (infecciosas, estructurales) han sido negativos." },
    ],
    questions: [
      {
        type: "sindrome", prompt: "¿Qué describe mejor este caso?",
        options: [
          { text: "Trastorno Neurocognitivo Mayor de inicio rápido por causa neurodegenerativa", correct: false, feedback: "Los trastornos neurodegenerativos clásicos no presentan típicamente este patrón tan marcadamente fluctuante día a día, ni se asocian con mioclonías y anticuerpos antitiroideos elevados como hallazgo central.", consequence: "Si se hubiera asumido un origen neurodegenerativo sin investigar la causa autoinmune, se habría retrasado un tratamiento con corticoides/inmunomoduladores que en muchos casos revierte casi completamente el cuadro." },
          { text: "Encefalopatía de Hashimoto (encefalopatía autoinmune asociada a tiroiditis)", correct: true, feedback: "Correcto. La confusión marcadamente fluctuante, las mioclonías, el antecedente de tiroiditis de Hashimoto y los anticuerpos antitiroideos muy elevados (con otras causas descartadas) son el cuadro característico de esta rara encefalopatía autoinmune — generalmente responde bien a tratamiento con corticoides." },
          { text: "Crisis de ausencia en el adulto mayor", correct: false, feedback: "Las crisis de ausencia son episodios breves y muy estereotipados; aquí el cuadro central es un estado confusional fluctuante de semanas, con mioclonías, en un contexto autoinmune claro.", consequence: "Enfocar el caso solo como un trastorno epiléptico aislado, sin considerar el contexto autoinmune, retrasaría el tratamiento inmunomodulador específico que esta condición requiere." },
          { text: "Delirium por infección no identificada", correct: false, feedback: "El equipo médico ya descartó causas infecciosas y estructurales; el hallazgo central (anticuerpos antitiroideos muy elevados en el contexto de Hashimoto conocido) apunta directamente a un mecanismo autoinmune.", consequence: "Si se hubiera seguido buscando una infección no identificada sin atender el hallazgo autoinmune ya confirmado, se retrasaría innecesariamente el inicio del tratamiento inmunomodulador efectivo." },
        ]
      },
      {
        type: "sindrome", prompt: "¿Qué combinación de datos hace MENOS probable un trastorno neurodegenerativo y orienta hacia una causa autoinmune?",
        options: [
          { text: "Que tiene 69 años", correct: false, feedback: "La edad por sí sola no orienta hacia una causa autoinmune frente a una degenerativa." },
          { text: "La confusión marcadamente fluctuante con mioclonías, junto a anticuerpos antitiroideos muy elevados y otras causas ya descartadas", correct: true, feedback: "Exacto. Los procesos degenerativos clásicos no fluctúan tan marcadamente día a día ni cursan típicamente con mioclonías; sumado a los anticuerpos elevados y al descarte de otras causas, el patrón apunta a una encefalopatía autoinmune potencialmente reversible. Integrar varios datos a la vez es la clave." },
          { text: "Que la trajo su familia", correct: false, feedback: "Quién la trae no orienta el diagnóstico etiológico." },
          { text: "Que tiene movimientos anormales", correct: false, feedback: "Las mioclonías son una pieza, pero por sí solas no bastan; lo decisivo es integrarlas con la fluctuación y el dato autoinmune." },
        ]
      },
      {
        type: "dominio", prompt: "Hay mioclonías. ¿Por qué la función que DEFINE el cuadro se ubica en Activación y Regulación y no en Sensoriomotores?",
        options: [
          { text: "Porque tiene antecedente tiroideo", correct: false, feedback: "El antecedente tiroideo orienta la causa, pero no es el argumento sobre qué función define el cuadro." },
          { text: "Porque el rasgo que define el cuadro es la fluctuación del nivel de conciencia; las mioclonías son un signo acompañante, no el déficit central", correct: true, feedback: "Correcto. Aunque haya un componente motor (mioclonías), lo que caracteriza y define el cuadro es la alternancia entre lucidez y confusión —una fluctuación del arousal—, que corresponde a Activación y Regulación." },
          { text: "Porque tiene movimientos anormales", correct: false, feedback: "Justamente los movimientos podrían sugerir Sensoriomotores; el argumento es que lo DEFINITORIO es la fluctuación de la conciencia." },
          { text: "Porque los estudios fueron negativos", correct: false, feedback: "El descarte de otras causas apoya el diagnóstico, pero no es el argumento sobre el dominio de la función central." },
        ]
      },
      {
        type: "constructo", prompt: "¿Qué distingue que el constructo central sea 'arousal/nivel de conciencia' y no 'atención sostenida'?",
        options: [
          { text: "Que la atención varía precisamente porque fluctúa el nivel de conciencia subyacente; no es que la conciencia esté estable y solo falle mantener el foco", correct: true, feedback: "Correcto. La atención sostenida supone una conciencia preservada con dificultad para enfocar. Aquí el propio nivel de conciencia sube y baja (días lúcidos y días muy confundidos), así que el constructo primario es el arousal." },
          { text: "Que tiene mioclonías", correct: false, feedback: "Las mioclonías son un signo motor acompañante, no definen si el constructo es arousal o atención." },
          { text: "Que tiene anticuerpos elevados", correct: false, feedback: "Los anticuerpos señalan la causa, no distinguen entre arousal y atención." },
          { text: "Que tiene 69 años", correct: false, feedback: "La edad no determina el constructo." },
        ]
      },
      {
        type: "unidad", prompt: "¿Por qué el mecanismo se evidencia mejor en 'fisiología' que en 'conducta'?",
        options: [
          { text: "Porque los anticuerpos antitiroideos muy elevados (con otras causas descartadas) son el marcador objetivo del mecanismo autoinmune; la confusión observable es solo su efecto", correct: true, feedback: "Correcto. La conducta (confusión) muestra el efecto del cuadro; el marcador fisiológico (anticuerpos) revela el mecanismo autoinmune subyacente. Para fundamentar la causa, la evidencia directa es fisiológica." },
          { text: "Porque la familia la trajo", correct: false, feedback: "Quién la trae no define la unidad de análisis del mecanismo." },
          { text: "Porque la confusión fluctúa", correct: false, feedback: "La fluctuación es la manifestación conductual/cognitiva; el mecanismo se evidencia en el marcador fisiológico." },
          { text: "Porque tiene mioclonías", correct: false, feedback: "Las mioclonías son un signo, pero el marcador que demuestra el mecanismo autoinmune es el dato fisiológico (anticuerpos)." },
        ]
      },
      {
        type: "instrumento", prompt: "¿Qué instrumento usarías para fundamentar este diagnóstico?",
        options: [
          { text: "NEUROPSI Breve (tamizaje seriado) + Inventario Neuropsiquiátrico (NPI)", correct: true, feedback: "Correcto. Dado el curso fluctuante, un tamizaje cognitivo breve aplicado de forma seriada permite documentar objetivamente esa fluctuación, y el NPI ayuda a registrar los síntomas conductuales asociados — ambos útiles para monitorear la respuesta al tratamiento inmunomodulador." },
          { text: "WISC-V", correct: false, feedback: "El WISC-V es para población infantil/adolescente; no aplica a esta paciente de 69 años." },
          { text: "SRS-2", correct: false, feedback: "La SRS-2 evalúa rasgos del espectro autista; no es relevante para este cuadro de encefalopatía autoinmune." },
          { text: "BANFE-3 completo en una sola sesión", correct: false, feedback: "Dada la fluctuación marcada del estado de alerta, una batería extensa de 50 minutos en una sola sesión podría no reflejar el estado real de la paciente; es más útil un tamizaje breve y repetido para capturar la fluctuación." },
        ]
      }
    ]
  },
];
// Metadatos de "carpeta" para la sala de expedientes (no revelan el diagnóstico)
const CASE_META = [
  { name: "Sr. Aguilar", age: 58, motivo: "Cree que su esposa es una impostora idéntica" },
  { name: "Sr. Bravo", age: 63, motivo: "Ignora el lado izquierdo de su cuerpo y su entorno" },
  { name: "Sr. Cárdenas", age: 45, motivo: "No recuerda conversaciones recién tenidas" },
  { name: "Sr. Delgado", age: 52, motivo: "Habla con gran esfuerzo y de forma entrecortada" },
  { name: "Sra. Espinoza", age: 33, motivo: "Episodios súbitos de terror sin peligro real" },
  { name: "Sra. Fuentes", age: 41, motivo: "Ya no disfruta nada, ni siquiera la comida" },
  { name: "Sr. Guzmán", age: 55, motivo: "Su mano izquierda se mueve sin que él lo decida" },
  { name: "Sr. Herrera", age: 63, motivo: "Insiste en que puede ver, pero está ciego" },
  { name: "Sr. Ibarra", age: 36, motivo: "Lleva una semana sin dormir y 'lleno de energía'" },
  { name: "Sra. Jiménez", age: 29, motivo: "Revisa la estufa más de 20 veces antes de salir" },
  { name: "Sr. Lara", age: 34, motivo: "No logra entender lo que otros piensan o sienten" },
  { name: "Sra. Mendoza", age: 47, motivo: "No siente miedo ante ningún peligro" },
  { name: "Mateo R.", age: 8, motivo: "Bajo rendimiento escolar pese a comprender los temas" },
  { name: "Emilio S.", age: 10, motivo: "Dificultad para integrarse con compañeros" },
  { name: "Valentina T.", age: 7, motivo: "'Se queda en blanco' varias veces al día" },
  { name: "Diego V.", age: 6, motivo: "Valoración antes del ciclo escolar" },
  { name: "Sofía L.", age: 9, motivo: "Seguimiento para plan educativo individualizado" },
  { name: "Sr. Navarro", age: 29, motivo: "'Siempre desorganizado', ahora afecta su trabajo" },
  { name: "Sr. Ortega", age: 34, motivo: "Dificultades persistentes en relaciones laborales y de pareja" },
  { name: "Sr. Pacheco", age: 61, motivo: "Valoración antes del alta hospitalaria" },
  { name: "Sr. Quintero", age: 38, motivo: "Cambios cognitivos tras diagnóstico reciente" },
  { name: "Sr. Ramírez", age: 26, motivo: "Antes de reintegrarse al trabajo tras un accidente" },
  { name: "Sra. Salcedo", age: 74, motivo: "'Ya no es el mismo' desde hace 2 años" },
  { name: "Sr. Torres", age: 78, motivo: "Cambio cognitivo tras varios eventos vasculares" },
  { name: "Sr. Uribe", age: 67, motivo: "Confusión repentina, habla incoherente" },
  { name: "Sra. Vega", age: 81, motivo: "Pérdida de peso notoria y 'como ida'" },
  { name: "Sra. Zamora", age: 69, motivo: "Confusión fluctuante y movimientos anormales" },
];
// Interludios de síntesis: "carpetas especiales" desbloqueables en la sala de expedientes.
const SYNTHESIS_CASES = [
  {
    requires: [1, 3],
    caseALabel: "Caso 2 — Negligencia espacial unilateral",
    caseBLabel: "Caso 4 — Afasia de Broca",
    prompt: "Ambos casos pertenecen al dominio Sistemas Cognitivos. ¿Qué los diferencia dentro de ese mismo dominio?",
    options: [
      { text: "Nada — son funcionalmente idénticos", correct: false, feedback: "No: aunque comparten dominio, afectan constructos completamente distintos del mismo sistema cognitivo." },
      { text: "Afectan constructos distintos: atención espacial vs. lenguaje", correct: true, feedback: "Correcto. RDoC agrupa ambos en Sistemas Cognitivos, pero la negligencia altera el constructo de Atención/Percepción espacial, mientras que la afasia de Broca altera el constructo de Lenguaje. Un mismo dominio puede contener mecanismos muy distintos." },
      { text: "Uno es un trastorno psiquiátrico y el otro neurológico", correct: false, feedback: "Ambos son cuadros neurológicos por lesión focal; la distinción real está en el constructo cognitivo afectado, no en esa categoría." },
      { text: "Ambos comparten obligatoriamente la misma unidad de análisis", correct: false, feedback: "RDoC no obliga a que casos del mismo dominio compartan unidad de análisis; cada uno se documenta con la evidencia disponible." },
    ]
  },
  {
    requires: [4, 5],
    caseALabel: "Caso 5 — Crisis de pánico (hiperreactividad amigdalina)",
    caseBLabel: "Caso 6 — Anhedonia (hipofunción del circuito de recompensa)",
    prompt: "Estos dos casos podrían parecer 'lo mismo pero al revés' (uno hiperactivo, otro hipoactivo). ¿Qué relación real tienen en la matriz RDoC?",
    options: [
      { text: "Son el mismo dominio con polaridad opuesta (ambos Valencia Negativa)", correct: false, feedback: "No — la anhedonia no es 'miedo invertido'. Pertenece a un dominio completamente distinto: Valencia Positiva." },
      { text: "Pertenecen a dominios distintos e independientes: Valencia Negativa y Valencia Positiva", correct: true, feedback: "Correcto. Este es un aporte central de RDoC: el sistema de amenaza/miedo (Valencia Negativa) y el sistema de recompensa/placer (Valencia Positiva) son circuitos neurobiológicamente independientes, no los dos extremos de una sola escala emocional." },
      { text: "Ambos son manifestaciones del mismo circuito amigdalino", correct: false, feedback: "La anhedonia se asocia al circuito de recompensa (núcleo accumbens-ATV), no a la amígdala; son circuitos distintos." },
      { text: "No tienen ninguna relación clasificable en RDoC", correct: false, feedback: "Sí son clasificables — de hecho son un buen ejemplo de cómo RDoC separa sistemas emocionales que el lenguaje cotidiano agrupa como 'opuestos'." },
    ]
  },
  {
    requires: [9, 11],
    caseALabel: "Caso 10 — TOC (circuito córtico-estriado-tálamo-cortical)",
    caseBLabel: "Caso 12 — Ausencia de miedo (lesión amigdalina)",
    prompt: "Ambos casos se documentan en la misma unidad de análisis (Circuitos), pero en dominios distintos. ¿Qué nos enseña esto sobre la matriz RDoC?",
    options: [
      { text: "Que la unidad 'Circuitos' solo aplica a un dominio específico", correct: false, feedback: "Al contrario — este par de casos muestra justo lo opuesto: la misma unidad de análisis puede usarse para estudiar dominios completamente distintos." },
      { text: "Que filas (unidades de análisis) y columnas (dominios) son independientes entre sí", correct: true, feedback: "Correcto. La matriz RDoC funciona como una cuadrícula real: la misma unidad de análisis (ej. Circuitos) puede cruzarse con cualquier dominio. Por eso se puede estudiar 'Circuitos' tanto en Sistemas Cognitivos (TOC) como en Valencia Negativa (miedo), sin que un dominio 'sea dueño' de una unidad." },
      { text: "Que TOC y la ausencia de miedo son en realidad el mismo trastorno", correct: false, feedback: "No, son fenómenos clínicos completamente distintos; solo comparten el nivel de análisis biológico usado para estudiarlos." },
      { text: "Que la matriz RDoC no permite comparar casos de dominios distintos", correct: false, feedback: "Es exactamente lo contrario: permitir estas comparaciones transdominio es uno de los objetivos centrales de RDoC." },
    ]
  },
];
// Casos de estudio: uno por dominio RDoC, distintos a los del modo juego, sin puntaje.
const STUDY_CASES = [
  {
    domainKey: "VN",
    vignette: "Paciente veterano de guerra, hace más de un año que volvió a casa. Evita salir solo, revisa constantemente las salidas de cualquier lugar y se sobresalta con ruidos cotidianos, incluso en ambientes que sabe son seguros.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Crisis de pánico aislada ante un peligro real", correct: false, feedback: "Aquí no hay un peligro objetivo puntual; el estado de alerta es sostenido y generalizado, no un episodio aislado." },
        { text: "Hipervigilancia sostenida del circuito de amenaza (estrés postraumático)", correct: true, feedback: "Correcto. A diferencia de una respuesta de miedo puntual, aquí hay una activación sostenida y generalizada del sistema de detección de amenazas." },
        { text: "Anhedonia por hipofunción del circuito de recompensa", correct: false, feedback: "La anhedonia implica pérdida de placer, no un estado de alerta ante el peligro." },
        { text: "Apraxia del gesto motor", correct: false, feedback: "No hay ningún componente motor afectado en este caso." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas de Activación y Regulación", correct: false, feedback: "Este dominio cubre el arousal general y el sueño, no la respuesta específica ante amenazas." },
        { text: "Sistemas de Valencia Negativa", correct: true, feedback: "Correcto. La respuesta sostenida ante amenazas (reales o anticipadas) pertenece a este dominio." },
        { text: "Sistemas Cognitivos", correct: false, feedback: "No hay un déficit de atención o memoria descrito; el núcleo es la respuesta emocional ante la amenaza." },
        { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Miedo agudo / amenaza potencial", correct: false, feedback: "El miedo agudo es una respuesta puntual ante un peligro inmediato y concreto; aquí el estado es sostenido y generalizado, incluso sin peligro presente." },
        { text: "Ansiedad sostenida (amenaza distal/incertidumbre)", correct: true, feedback: "Correcto. La anticipación constante de un peligro difuso, sin que esté presente, es justamente este constructo." },
        { text: "Pérdida", correct: false, feedback: "El constructo de Pérdida se refiere a la respuesta ante la ausencia de algo valorado, no a la anticipación de peligro." },
        { text: "Frustración no recompensada", correct: false, feedback: "Esto pertenece al dominio de Valencia Positiva, no al de amenaza." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Circuitos", correct: false, feedback: "Los circuitos de amenaza están implicados, pero la evidencia descrita en el caso es observacional/reportada, no de neuroimagen." },
        { text: "Conducta (patrones de evitación observables)", correct: true, feedback: "Correcto. Evitar salir solo y revisar constantemente las salidas son conductas observables directamente descritas en el caso." },
        { text: "Genes", correct: false, feedback: "No se menciona ninguna evidencia genética en este caso." },
        { text: "Fisiología", correct: false, feedback: "No se describen medidas fisiológicas (como cortisol o frecuencia cardíaca) en este caso." },
      ]},
    ]
  },
  {
    domainKey: "VP",
    vignette: "Paciente con dependencia a sustancias muestra una activación dopaminérgica anticipatoria mucho mayor al ver objetos asociados al consumo (encendedores, jeringas) que ante recompensas naturales como la comida, incluso estando saciado.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Sensibilización del circuito de recompensa ante señales de consumo (craving)", correct: true, feedback: "Correcto. Las señales asociadas a la sustancia generan una respuesta anticipatoria de recompensa desproporcionadamente alta — el mecanismo central del craving." },
        { text: "Hipofunción generalizada del circuito de recompensa (anhedonia)", correct: false, feedback: "Aquí la respuesta de recompensa está exagerada ante señales específicas, no reducida en general." },
        { text: "Hiperreactividad amigdalina ante el peligro", correct: false, feedback: "No hay un componente de miedo o amenaza en este caso; el fenómeno es de recompensa anticipatoria." },
        { text: "Déficit de control inhibitorio puro sin componente de recompensa", correct: false, feedback: "Aunque el control inhibitorio puede estar implicado en la adicción, lo que describe el caso específicamente es la respuesta anticipatoria de recompensa." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas de Valencia Positiva", correct: true, feedback: "Correcto. La respuesta anticipatoria ante señales de recompensa es el núcleo de este dominio." },
        { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de amenaza o pérdida en este caso." },
        { text: "Sistemas Cognitivos", correct: false, feedback: "Aunque hay procesos de aprendizaje asociativo implicados, el fenómeno central descrito es motivacional/de recompensa." },
        { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un componente motor central descrito." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Habituación a la recompensa", correct: false, feedback: "La habituación implicaría una respuesta decreciente con el tiempo; aquí la respuesta anticipatoria está, de hecho, aumentada (sensibilizada)." },
        { text: "Respuesta anticipatoria a la recompensa", correct: true, feedback: "Correcto. La activación dopaminérgica que ocurre antes de recibir la recompensa, ante señales predictivas, es este constructo." },
        { text: "Aprendizaje por refuerzo", correct: false, feedback: "Es un proceso relacionado, pero el constructo específico que describe la activación anticipatoria desproporcionada es la respuesta anticipatoria a la recompensa." },
        { text: "Saciedad", correct: false, feedback: "La saciedad describe la reducción de motivación tras obtener una recompensa; aquí el paciente está saciado de comida pero igual reacciona fuertemente a la señal de la sustancia." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Fisiología (niveles de dopamina anticipatoria)", correct: true, feedback: "Correcto. La medición directa de la activación dopaminérgica anticipatoria es una medida fisiológica." },
        { text: "Genes", correct: false, feedback: "Hay un componente de vulnerabilidad genética en la adicción, pero la evidencia citada en el caso es de activación dopaminérgica medida directamente." },
        { text: "Autorreporte", correct: false, feedback: "El paciente no necesariamente reporta subjetivamente el craving en este caso; la evidencia descrita es una medición objetiva." },
        { text: "Conducta", correct: false, feedback: "La búsqueda de la sustancia sería la conducta resultante, pero lo que se describe directamente en el caso es la activación dopaminérgica medida." },
      ]},
    ]
  },
  {
    domainKey: "COG",
    vignette: "Niño de 9 años no logra mantener la atención en sus tareas escolares por más de unos minutos, se distrae con cualquier estímulo del entorno (un sonido, un compañero moviéndose), aunque comprende perfectamente las instrucciones que se le dan.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Déficit de atención sostenida (TDAH)", correct: true, feedback: "Correcto. La dificultad para mantener el foco atencional pese a comprender la tarea es el rasgo central del TDAH de tipo inatento." },
        { text: "Trastorno del espectro autista", correct: false, feedback: "El autismo se caracteriza principalmente por dificultades en la reciprocidad social y comunicación, no únicamente por distracción atencional." },
        { text: "Discapacidad intelectual", correct: false, feedback: "El niño comprende perfectamente las instrucciones; el problema no es de comprensión general sino de mantener el foco atencional." },
        { text: "Trastorno de ansiedad generalizada", correct: false, feedback: "No hay descripción de preocupación excesiva o miedo en este caso; el fenómeno es puramente atencional." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas Cognitivos", correct: true, feedback: "Correcto. La atención es uno de los constructos centrales de este dominio." },
        { text: "Sistemas de Activación y Regulación", correct: false, feedback: "Aunque la regulación del arousal puede influir en la atención, RDoC clasifica la atención específicamente dentro de Sistemas Cognitivos." },
        { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
        { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay un déficit motor central descrito." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Memoria de trabajo", correct: false, feedback: "La memoria de trabajo es mantener información activa mentalmente; aquí el problema es no poder sostener el foco atencional, no retener información." },
        { text: "Atención", correct: true, feedback: "Correcto. La incapacidad de mantener el foco pese a comprender la tarea es precisamente este constructo." },
        { text: "Control cognitivo", correct: false, feedback: "El control cognitivo implica inhibir respuestas o cambiar de estrategia; aquí el problema central es sostener el foco, no inhibir una respuesta." },
        { text: "Percepción", correct: false, feedback: "La percepción se refiere a procesar estímulos sensoriales correctamente, no a sostener la atención sobre ellos." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Conducta (observación en el aula)", correct: true, feedback: "Correcto. La distracción observada directamente durante las tareas escolares es una medida conductual." },
        { text: "Genes", correct: false, feedback: "El TDAH tiene un componente genético, pero la evidencia descrita en el caso es observación conductual directa." },
        { text: "Circuitos", correct: false, feedback: "No se menciona evidencia de neuroimagen en este caso." },
        { text: "Autorreporte", correct: false, feedback: "Es un niño de 9 años; la evidencia descrita proviene de la observación de su conducta, no de su propio reporte." },
      ]},
    ]
  },
  {
    domainKey: "SOC",
    vignette: "Niño con diagnóstico de autismo no responde cuando se le llama por su nombre, no busca contacto visual ni señala objetos para compartir su atención con un adulto, aunque su audición y visión son normales.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Déficit en atención conjunta y reciprocidad social (TEA)", correct: true, feedback: "Correcto. La dificultad para compartir el foco atencional con otra persona (atención conjunta) es un marcador temprano característico del autismo." },
        { text: "Pérdida auditiva periférica", correct: false, feedback: "La audición es normal según el caso; el problema no es sensorial sino de reciprocidad social." },
        { text: "Trastorno de ansiedad social", correct: false, feedback: "La ansiedad social implica evitación por miedo al juicio ajeno; aquí el patrón es de falta de orientación social desde edades tempranas, no evitación por miedo." },
        { text: "Apraxia del gesto motor", correct: false, feedback: "No hay un déficit en la ejecución de movimientos; el problema es de orientación e interés social." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas Cognitivos", correct: false, feedback: "Aunque hay procesamiento de información implicado, el fenómeno central (compartir atención socialmente) se clasifica dentro de Procesos Sociales." },
        { text: "Procesos Sociales", correct: true, feedback: "Correcto. La atención conjunta y la reciprocidad social son constructos centrales de este dominio." },
        { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de miedo o amenaza descrito en este caso." },
        { text: "Sistemas Sensoriomotores", correct: false, feedback: "El caso aclara que la audición y visión son normales; no hay un déficit sensoriomotor." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Comprensión de los demás (teoría de la mente)", correct: false, feedback: "La teoría de la mente implica inferir pensamientos ajenos; aquí el déficit es más básico — ni siquiera orienta su atención hacia el otro." },
        { text: "Comunicación (recepción no verbal / atención conjunta)", correct: true, feedback: "Correcto. No responder al nombre ni compartir la atención mediante gestos es un déficit en este constructo de comunicación no verbal." },
        { text: "Afiliación y unión social", correct: false, feedback: "Este constructo se refiere más al deseo de cercanía y vínculo; el déficit descrito aquí es específicamente la atención conjunta." },
        { text: "Percepción de sí mismo", correct: false, feedback: "No hay ninguna alteración en cómo el niño se percibe a sí mismo descrita en el caso." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Conducta (observación directa)", correct: true, feedback: "Correcto. La ausencia de contacto visual, de respuesta al nombre y de señalización compartida son conductas observadas directamente." },
        { text: "Genes", correct: false, feedback: "El TEA tiene una base genética importante, pero la evidencia descrita en el caso es observación conductual directa." },
        { text: "Circuitos", correct: false, feedback: "No se menciona evidencia de neuroimagen en este caso." },
        { text: "Autorreporte", correct: false, feedback: "Es un niño pequeño; la evidencia proviene de observación externa, no de su propio reporte." },
      ]},
    ]
  },
  {
    domainKey: "AR",
    vignette: "Paciente con trabajo nocturno rotativo reporta dificultad severa para dormir y despertar en horarios consistentes; su reloj biológico está marcadamente desincronizado respecto al ciclo día-noche, independientemente de cuánto descanse.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Episodio maníaco con hiperarousal", correct: false, feedback: "Aquí no hay un estado de energía elevada y euforia; el problema es específicamente la desincronización del reloj biológico con el ciclo día-noche." },
        { text: "Desincronización del ritmo circadiano (trastorno del ritmo sueño-vigilia)", correct: true, feedback: "Correcto. El desajuste entre el reloj biológico interno y el ciclo ambiental día-noche es el núcleo de este trastorno." },
        { text: "Insomnio por ansiedad generalizada", correct: false, feedback: "No se describe preocupación excesiva; el problema es específicamente la desalineación del reloj biológico, no la ansiedad." },
        { text: "Apnea obstructiva del sueño", correct: false, feedback: "La apnea implica interrupciones respiratorias durante el sueño; aquí el problema descrito es la desincronización del horario, no la calidad respiratoria del sueño." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas de Valencia Positiva", correct: false, feedback: "No hay un componente de recompensa o motivación en este caso." },
        { text: "Sistemas de Activación y Regulación", correct: true, feedback: "Correcto. Los ritmos circadianos y el ciclo sueño-vigilia son constructos centrales de este dominio." },
        { text: "Sistemas Cognitivos", correct: false, feedback: "No hay un déficit de atención o memoria descrito; el problema es la regulación del reloj biológico." },
        { text: "Sistemas Sensoriomotores", correct: false, feedback: "No hay ningún componente motor implicado en este caso." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Activación (arousal)", correct: false, feedback: "El arousal se refiere al nivel general de alerta en un momento dado; aquí el problema específico es la desalineación del reloj de 24 horas, no un exceso o defecto de alerta en sí." },
        { text: "Ritmos circadianos", correct: true, feedback: "Correcto. La desincronización del reloj biológico interno respecto al ciclo día-noche es precisamente este constructo." },
        { text: "Sueño-Vigilia", correct: false, feedback: "Cercano — este constructo describe la transición entre dormir y despertar en sí, mientras que el fenómeno central aquí es la desalineación del reloj de 24 horas que regula esos momentos." },
        { text: "Homeostasis", correct: false, feedback: "No es un constructo específico dentro de este dominio de la matriz RDoC." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Autorreporte (diario de sueño)", correct: true, feedback: "Correcto. El reporte del propio paciente sobre sus dificultades para dormir y despertar es la evidencia directa descrita." },
        { text: "Genes", correct: false, feedback: "Hay variantes genéticas asociadas a los ritmos circadianos, pero la evidencia descrita en el caso es el reporte subjetivo del paciente." },
        { text: "Circuitos", correct: false, feedback: "No se menciona evidencia de neuroimagen en este caso." },
        { text: "Fisiología", correct: false, feedback: "Una medición fisiológica directa (como melatonina o actigrafía) no se describe en este caso; la evidencia es el reporte del paciente." },
      ]},
    ]
  },
  {
    domainKey: "SM",
    vignette: "Paciente puede mover el brazo con fuerza y coordinación normales, pero cuando se le pide 'simule cepillarse los dientes' sin tener el objeto en la mano, no logra producir el gesto correctamente, aunque comprende bien la instrucción y no tiene debilidad muscular.",
    questions: [
      { type: "sindrome", prompt: "¿Qué describe mejor este caso?", options: [
        { text: "Hemiparesia por lesión motora primaria", correct: false, feedback: "La fuerza y coordinación del brazo son normales; el problema no es de debilidad sino de planificar el gesto correcto." },
        { text: "Apraxia ideomotora (lesión parietal izquierda)", correct: true, feedback: "Correcto. La incapacidad de producir un gesto con propósito, pese a comprensión y fuerza normales, es el sello de la apraxia ideomotora." },
        { text: "Agnosia táctil", correct: false, feedback: "La agnosia táctil implica no reconocer objetos por el tacto; aquí el problema es producir un gesto, no reconocer algo táctilmente." },
        { text: "Distonía focal de la mano", correct: false, feedback: "La distonía implica contracciones musculares anormales involuntarias, no una dificultad para planificar un gesto a pedido." },
      ]},
      { type: "dominio", prompt: "¿A qué dominio RDoC pertenece?", options: [
        { text: "Sistemas Sensoriomotores", correct: true, feedback: "Correcto. La planificación y ejecución de acciones motoras con propósito es el núcleo de este dominio." },
        { text: "Sistemas Cognitivos", correct: false, feedback: "Aunque hay procesos cognitivos en la planificación motora, RDoC clasifica la acción motora en sí dentro de Sistemas Sensoriomotores." },
        { text: "Procesos Sociales", correct: false, feedback: "No hay un componente interpersonal central en este caso." },
        { text: "Sistemas de Valencia Negativa", correct: false, feedback: "No hay un componente de miedo, ansiedad o pérdida en este caso." },
      ]},
      { type: "constructo", prompt: "¿Qué constructo específico está alterado?", options: [
        { text: "Percepción somatosensorial", correct: false, feedback: "La percepción somatosensorial se refiere a procesar información del tacto y la posición corporal; aquí el problema es planificar y ejecutar un gesto, no percibir estímulos." },
        { text: "Acciones motoras (planificación del gesto)", correct: true, feedback: "Correcto. La dificultad para planificar y ejecutar un gesto con propósito, pese a comprensión y fuerza normales, corresponde a este constructo." },
        { text: "Control cognitivo", correct: false, feedback: "El control cognitivo implica inhibir o regular respuestas; el déficit aquí es específicamente motor/de planificación del gesto." },
        { text: "Memoria de trabajo", correct: false, feedback: "No hay un problema para mantener información activa en mente; el déficit es en la ejecución motora del gesto." },
      ]},
      { type: "unidad", prompt: "¿En qué unidad de análisis se evidencia más directamente esta alteración?", options: [
        { text: "Circuitos", correct: false, feedback: "Aunque hay circuitos parietales implicados, no se describe evidencia de neuroimagen en el caso." },
        { text: "Conducta (evaluación clínica del gesto)", correct: true, feedback: "Correcto. La observación directa de que el paciente no logra producir el gesto correctamente ante la instrucción es una medida conductual." },
        { text: "Genes", correct: false, feedback: "No se menciona ninguna evidencia genética en este caso." },
        { text: "Autorreporte", correct: false, feedback: "El paciente no reporta subjetivamente el déficit; este se observa directamente en su desempeño durante la evaluación." },
      ]},
    ]
  },
  {
    // Caso comparativo: mismo diagnóstico DSM, distinto perfil RDoC.
    // (Basado en las viñetas de Trastorno de Conducta de Cozza et al., "RDoC and Clinical Child Psychology".)
    domainKey: "VN",
    comparative: true,
    dx: "Trastorno de Conducta (mismo diagnóstico DSM-5)",
    patients: [
      { label: "Paciente 1", text: "16 años, con ansiedad entre sus familiares. Robó presionado por sus amigos, falta a clases 'porque ellos faltan' y pelea diciendo que lo provocaron. Sus actos son reactivos y los justifica." },
      { label: "Paciente 2", text: "16 años, con negligencia severa en la infancia. Robó sin justificarlo, no considera importante asistir a clases e inicia peleas sin ofrecer ningún motivo ni mostrar remordimiento." },
    ],
    questions: [
      { type: "sindrome", label: "Comparación", prompt: "Ambos cumplen los mismos criterios de Trastorno de Conducta (DSM). ¿Comparten el mismo perfil RDoC?", options: [
        { text: "No — la misma conducta esconde mecanismos distintos en cada uno", correct: true, feedback: "Correcto. Esta es la idea central de RDoC: dos personas con la misma etiqueta DSM pueden diferir por completo en el mecanismo subyacente, y eso cambia el abordaje." },
        { text: "Sí — si cumplen los mismos criterios, el perfil es el mismo", correct: false, feedback: "No. Cumplir los mismos criterios DSM no implica el mismo mecanismo; RDoC mira por debajo del síntoma observable." },
        { text: "No se puede saber sin un estudio genético", correct: false, feedback: "No hace falta genética: la propia historia y conducta de cada paciente ya revelan perfiles de amenaza opuestos." },
      ]},
      { type: "constructo", label: "Perfil · Paciente 1", prompt: "¿Qué constructo predomina en el Paciente 1 (reactivo, con ansiedad familiar)?", options: [
        { text: "Amenaza aguda hiper-reactiva (Valencia Negativa)", correct: true, feedback: "Correcto. Su conducta es reactiva y defensiva ('me provocaron'), con carga ansiosa: un sistema de amenaza hiperactivo." },
        { text: "Miedo hipo-reactivo / rasgos insensibles", correct: false, feedback: "Ese es el perfil del Paciente 2. El 1 reacciona con ansiedad, no con insensibilidad." },
        { text: "Respuesta a la recompensa exagerada", correct: false, feedback: "No es un problema de recompensa; el núcleo es cómo procesa la amenaza." },
      ]},
      { type: "constructo", label: "Perfil · Paciente 2", prompt: "¿Qué constructo predomina en el Paciente 2 (negligencia, sin remordimiento)?", options: [
        { text: "Miedo hipo-reactivo / rasgos insensibles (tras negligencia)", correct: true, feedback: "Correcto. Inicia la agresión sin justificación ni remordimiento: un sistema de amenaza hipoactivo, con rasgos insensibles." },
        { text: "Amenaza aguda hiper-reactiva", correct: false, feedback: "Ese es el perfil del Paciente 1. El 2 actúa sin miedo ni justificación." },
        { text: "Ansiedad sostenida", correct: false, feedback: "No hay anticipación ansiosa del peligro; al contrario, hay una respuesta de amenaza disminuida." },
      ]},
      { type: "instrumento", label: "Implicación clínica", prompt: "¿Qué implica esta diferencia de perfil para el abordaje?", options: [
        { text: "Distinto blanco terapéutico para cada uno, pese al mismo diagnóstico", correct: true, feedback: "Correcto. El Paciente 1 podría beneficiarse de regular la ansiedad/amenaza; el Paciente 2 requiere otro enfoque (vínculo, aprendizaje socioemocional). Mismo Dx, distinto tratamiento." },
        { text: "El mismo tratamiento estándar de Trastorno de Conducta para ambos", correct: false, feedback: "Justamente lo que RDoC cuestiona: tratar igual mecanismos distintos suele fallar en uno de los dos." },
        { text: "Ninguna: el diagnóstico DSM ya define todo el plan", correct: false, feedback: "El diagnóstico DSM agrupa la conducta, pero el mecanismo RDoC es el que orienta un abordaje a la medida." },
      ]},
    ]
  },
];
// Modo Supervisión: encuentra el error en el informe de un colega ficticio (reutiliza confusiones ya enseñadas).
const SUPERVISION_CASES = [
  {
    blurb: "Un colega te pide revisar este fragmento de informe antes de entregarlo.",
    segments: [
      { id: "a", text: "El paciente de 58 años presenta una alteración en el reconocimiento de personas cercanas." },
      { id: "b", text: "Reconoce el rostro de su esposa visualmente, pero no experimenta la respuesta emocional de familiaridad esperada." },
      { id: "c", text: "Esto es compatible con un cuadro de prosopagnosia, ya que no logra reconocer rostros familiares." },
      { id: "d", text: "Se recomienda continuar el seguimiento neuropsicológico y descartar otras causas." },
    ],
    correctId: "c",
    explanationCorrect: "Correcto, ahí está el error. El propio fragmento B ya dice que el paciente SÍ reconoce el rostro — el problema es la desconexión emocional, no el reconocimiento facial. Eso es Síndrome de Capgras, no prosopagnosia (que es justamente la incapacidad de reconocer rostros).",
  },
  {
    blurb: "Otro colega comparte este fragmento para una segunda opinión.",
    segments: [
      { id: "a", text: "La paciente reporta ausencia total de placer ante actividades que antes disfrutaba, incluso la comida." },
      { id: "b", text: "Los estudios funcionales muestran hipoactividad en el núcleo accumbens." },
      { id: "c", text: "Este patrón es compatible con el dominio RDoC de Valencia Negativa, dado el afecto negativo presente." },
      { id: "d", text: "Se sugiere continuar el abordaje interdisciplinario con psiquiatría." },
    ],
    correctId: "c",
    explanationCorrect: "Exacto. La anhedonia (ausencia de placer, hipofunción del núcleo accumbens) pertenece al dominio de Valencia POSITIVA, no Negativa. Valencia Negativa es para miedo, ansiedad y pérdida — no para ausencia de placer.",
  },
  {
    blurb: "Revisión de expediente antes de la junta clínica de esta semana.",
    segments: [
      { id: "a", text: "Paciente de 45 años con secuela cognitiva tras un evento vascular cerebral." },
      { id: "b", text: "Se aplicó el WISC-V para evaluar su perfil intelectual actual." },
      { id: "c", text: "Los resultados muestran dificultades en lenguaje expresivo." },
      { id: "d", text: "Se recomienda continuar terapia de lenguaje y rehabilitación cognitiva." },
    ],
    correctId: "b",
    explanationCorrect: "Ahí está el error. El WISC-V está diseñado para niños y adolescentes de 6 a 16 años; para un paciente de 45 años se debería haber usado el WAIS-IV.",
  },
  {
    blurb: "Un residente te pide retroalimentación sobre su redacción.",
    segments: [
      { id: "a", text: "El paciente, con calcificación bilateral de la amígdala, no muestra ninguna reacción de temor ante películas de terror o arañas." },
      { id: "b", text: "Se acerca sin dudar a situaciones objetivamente peligrosas." },
      { id: "c", text: "Esto corresponde a una alteración del constructo de ansiedad sostenida, ya que no presenta ningún tipo de respuesta de alerta ante amenazas." },
      { id: "d", text: "Se sugiere continuar el seguimiento por neurología y neuropsicología." },
    ],
    correctId: "c",
    explanationCorrect: "Correcto. Lo que falla aquí es la respuesta ante una amenaza inmediata y concreta (miedo agudo), no la anticipación de un peligro incierto a futuro (ansiedad sostenida). Son constructos distintos dentro del mismo dominio.",
  },
  {
    blurb: "Fragmento de un informe pendiente de revisión antes del alta.",
    segments: [
      { id: "a", text: "El paciente revisa la estufa más de 20 veces antes de salir, pese a saber que ya está apagada." },
      { id: "b", text: "La neuroimagen muestra hiperactivación del circuito córtico-estriado-tálamo-cortical." },
      { id: "c", text: "Esto se clasifica dentro del dominio RDoC de Sistemas Sensoriomotores, ya que la conducta de revisión es una acción motora repetitiva." },
      { id: "d", text: "Se recomienda evaluación con BANFE-3 para documentar el perfil de funciones ejecutivas." },
    ],
    correctId: "c",
    explanationCorrect: "Ahí está el error. Aunque la conducta visible (revisar la estufa) es motora, lo que falla es la capacidad de INHIBIR esa conducta — un fallo de control cognitivo. RDoC clasifica esto en Sistemas Cognitivos, no en Sistemas Sensoriomotores (que es para la planificación/ejecución motora en sí, como en el síndrome de la mano ajena).",
  },
  {
    blurb: "Última revisión antes de enviar el expediente al equipo geriátrico.",
    segments: [
      { id: "a", text: "El paciente de 78 años presenta antecedente de varios eventos vasculares cerebrales pequeños." },
      { id: "b", text: "La familia describe un patrón de deterioro gradual y continuo, sin cambios abruptos." },
      { id: "c", text: "Predominan la lentitud de procesamiento y la disfunción ejecutiva sobre el olvido puro." },
      { id: "d", text: "Esto es compatible con un Trastorno Neurocognitivo Vascular." },
    ],
    correctId: "b",
    explanationCorrect: "Ahí está el error de redacción: el patrón vascular clásico es 'en escalones' (estable-caída-estable), no gradual y continuo — ese patrón gradual y continuo es más típico de Alzheimer. Describirlo así en el expediente podría confundirlo con el perfil equivocado.",
  },
];
const SUPERVISION_WRONG_FEEDBACK = "Ese fragmento es clínicamente correcto. El error real está en otra parte del informe — sigue revisando.";
const SUPERVISION_BONUS = 40;
const EXPERT_SYSTEM_PROMPT = `Eres un revisor par (peer reviewer) experto en el marco Research Domain Criteria (RDoC) del NIMH, evaluando el trabajo de un COLEGA neuropsicólogo —no de un estudiante—. El colega ya completó un entrenamiento intensivo de 27 casos y domina la matriz RDoC. Trátalo como a un par cuyo criterio se discute de igual a igual, no como a un alumno que acierta o falla.
CONTEXTO: El colega ha compartido un estudio de caso clínico (vía DOI o texto) Y su propia formulación RDoC de ese caso. Tu trabajo NO es darle "la respuesta correcta": es someter su razonamiento a revisión crítica, como harías al revisar un manuscrito para una revista.
== MODO BASE: REVISIÓN POR PARES (E) ==
Al recibir el caso y la formulación del colega:
1. Reconoce lo que está bien fundamentado en su análisis, con especificidad (no halagos vacíos).
2. Cuestiona donde la evidencia del propio artículo no sustenta del todo su clasificación. Cita qué parte del caso respalda o contradice cada afirmación.
3. Ofrece contraargumentos o clasificaciones alternativas defendibles, y pídele que defienda o ajuste su postura. Usa preguntas como "¿qué te hace descartar X dominio sobre Y?" o "¿la evidencia que citas mide el constructo o solo lo infiere?".
4. NO cierres el tema dándole la respuesta: deja que el colega razone. Solo si insiste o se atasca, ofrece tu lectura, siempre marcándola como una posición defendible entre otras, no como verdad única.
== FORMATO DE LA REVISIÓN POR PARES (MODO BASE) ==
Tu PRIMERA respuesta (la revisión de su formulación) debe estructurarse por campos del modelo RDoC, usando EXACTAMENTE estas etiquetas, cada una en su propia línea, seguida de tu comentario:
[VEREDICTO] Una frase que sintetice tu impresión global como revisor (ej. "Formulación sólida en lo diagnóstico, pero la unidad de análisis necesita más sustento").
[SINDROME] Tu revisión crítica de su diagnóstico/síndrome: qué sostiene bien, qué cuestionas.
[DOMINIO] Tu revisión de su elección de dominio RDoC: ¿la evidencia del artículo lo respalda? ¿hay un dominio alternativo defendible?
[CONSTRUCTO] Tu revisión del constructo que propuso: ¿es el correcto, o hay uno más fino/cercano que encaje mejor?
[UNIDAD] Tu revisión de la unidad de análisis: ¿la evidencia citada realmente mide en ese nivel, o lo infiere?
[INSTRUMENTO] Tu revisión del instrumento propuesto: ¿es el adecuado para fundamentar este perfil?
[RETO] Una o dos preguntas abiertas que le devuelves para que defienda o ajuste su postura. No cierres con la respuesta servida.
Si el colega no incluyó alguno de estos campos en su formulación, señálalo en la sección correspondiente como una omisión a subsanar. Mantén cada sección concisa (2-4 frases), tono de colega a colega.
Las respuestas POSTERIORES (cuando el colega replica o pregunta) pueden ser en prosa conversacional normal, sin etiquetas, salvo que él pida una nueva revisión estructurada.
Si el colega pide "profundizar", "criticar la metodología" o equivalente, eleva el nivel: ya no se trata de clasificar el caso, sino de CRITICAR EL ESTUDIO desde RDoC:
- ¿La unidad de análisis que usaron los autores realmente mide el constructo que dicen medir, o hay un salto?
- ¿Las conclusiones brincan de un nivel de análisis a otro sin justificarlo (p. ej. de conducta a circuitos)?
- ¿Qué celda de la matriz RDoC debería haber medido el estudio y no lo hizo? ¿Qué evidencia falta?
- ¿El diseño permite las inferencias causales o dimensionales que los autores afirman?
Guía al colega a formular estas críticas él mismo; aporta las tuyas como las de un segundo revisor.
LÍMITES: Solo analiza estudios de caso clínicos publicados. Si el material es una revisión, meta-análisis o no es un estudio de caso, indícalo y pídele otro. Si el texto disponible es insuficiente para una crítica rigurosa (p. ej. solo el título), dilo con franqueza y pide el abstract o secciones clave en vez de inventar.
Responde SIEMPRE en español. Terminología clínica precisa. Tono de colega a colega: directo, riguroso, respetuoso. Nunca condescendiente.`;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffleArr(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const STREAK3_PHRASES = [
  "🔥 ¡Racha de 3! Luria ya te andaba refiriendo casos, ¡eh!",
  "🔥 Racha de 3 — hasta Broca se anda quedando sin palabras.",
  "🔥 3 al hilo. El residente de neuro ya te tiene envidia.",
];
const STREAK5_PHRASES = [
  "🚀 ¡Racha de 5! El Instituto Nacional de Neurología y Neurocirugía Manuel Velasco Suárez de la Ciudad de México ya te anda buscando.",
  "🚀 Ya mereces tu propia citación en artículo de Nature.",
  "🚀 Racha de 5. Wernicke estaría tomando notas para su próximo paper.",
];
const WRONG_ANSWER_PHRASES = [
  "😅 Tranqui, ni Korsakoff se acordaba de todo a la primera.",
  "😅 Le pasó hasta a los grandes — sigue, que el caso no se resuelve solo.",
  "😅 Uff, esa trampa estaba bien puesta. Vamos con la siguiente.",
];
const PERFECT_CASE_PHRASES = [
  "🏅 ¡Caso perfecto! Hasta Luria estaría tomando apuntes de tu manera de trabajar.",
  "🏅 Diagnóstico impecable. El Instituto Nacional de Neurología y Neurocirugía Manuel Velasco Suárez ya te anda buscando.",
  "🏅 Ni Wernicke lo hubiera explicado tan claro.",
  "🏅 Esa precisión ni en el manual de psicopatología la encuentras así de ordenadita.",
];
const CASE_OVERRIDE_PHRASES = {
  0: "🏅 ¡Uuuy! Le tumbaste la chamba al propio doctor Capgras en su caso insignia.",
  2: "🏅 Korsakoff se llevaría muy bien contigo... aunque seguro se le olvidaría decírtelo.",
  3: "🏅 ¡Cuidado!, que le andas tumbando la chamba a Broca.",
  7: "🏅 Gabriel Anton estaría orgulloso de tu diagnóstico — aunque, conociéndolo, seguro lo negaría.",
};
const LEVEL_UP_PHRASES = {
  0: "🎓 ¡Síntesis resuelta! Luria estaría orgulloso de tu ojo clínico básico.",
  1: "🎓 Síntesis resuelta — hasta los dominios de Valencia te quedan bien plantados.",
  2: "🎓 ¡Síntesis resuelta! El Instituto Nacional de Neurología y Neurocirugía Manuel Velasco Suárez ya te anda buscando para una plaza.",
};
const TRUST_LOST_PHRASE = "💔 La familia ha perdido la confianza en el diagnóstico — este caso quedará registrado como mal pronóstico.";
function buildReportData(caseObj) {
  const order = ["sindrome", "dominio", "constructo", "unidad", "instrumento"];
  const present = order.map(t => caseObj.questions.find(q => q.type === t)).filter(Boolean);

  // Construye el informe dinámicamente a partir de los campos presentes,
  // sin depender de una plantilla predefinida por combinación exacta.
  const FIELD_INTRO = {
    sindrome: "Tras la evaluación neuropsicológica, se concluye que el paciente presenta un cuadro compatible con ",
    dominio: ", ubicado en el dominio RDoC de ",
    constructo: ". Específicamente, se ve alterado el constructo de ",
    unidad: ", evidenciado a través de la unidad de análisis de ",
    instrumento: ". Para fundamentar este perfil se recomienda ",
  };
  const templateParts = [];
  present.forEach((q, i) => {
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

const MAX_SCORE = CASES.reduce((sum, c) => sum + c.questions.reduce((s, q) => s + BASE_POINTS[q.type], 0), 0);
const TOTAL_MAX = MAX_SCORE + SYNTHESIS_BONUS * SYNTHESIS_CASES.length + REPORT_BONUS * CASES.length;
const MAX_CELLS = new Set(CASES.filter(c => c.domainKey && c.unitKey).map(c => `${c.domainKey}-${c.unitKey}`)).size;
// Lista plana de pasos (caso, pregunta) para permitir distinto número de preguntas por caso.
const STUDY_STEPS = STUDY_CASES.flatMap((c, ci) => c.questions.map((_, qi) => [ci, qi]));
const STUDY_TOTAL = STUDY_STEPS.length;

function getRank(pct) {
  if (pct >= 85) return { label: "Maestro Neuropsicólogo RDoC", emoji: "🏆" };
  if (pct >= 65) return { label: "Diagnosticador Experto", emoji: "🧠" };
  if (pct >= 40) return { label: "Investigador", emoji: "🔍" };
  return { label: "Aprendiz", emoji: "🧩" };
}
// --- Sistema de Prestigio Clínico (rango profesional que evoluciona en la sesión) ---
const CLINICAL_RANKS = [
  { min: 90, label: "Jefe del Servicio", emoji: "👑" },
  { min: 70, label: "Especialista de Referencia", emoji: "🎖️" },
  { min: 45, label: "Especialista de Planta", emoji: "🩺" },
  { min: 20, label: "Residente Avanzado", emoji: "📋" },
  { min: 0, label: "Residente en Formación", emoji: "🌱" },
];
function getClinicalRank(prestige) {
  return CLINICAL_RANKS.find(r => prestige >= r.min) || CLINICAL_RANKS[CLINICAL_RANKS.length - 1];
}
// Deltas de prestigio según la calidad clínica del cierre del caso.
const PRESTIGE_DELTA = {
  excelente: 8,      // perfecto: sin pistas, sin perder confianza, todo correcto
  bueno: 3,          // correcto pero con tropiezos (pista usada o falla RDoC secundaria)
  malHonesto: -4,    // mal pronóstico pese a haber investigado a fondo
  malEvitable: -7,   // mal pronóstico por saltarse la pista decisiva
  malGrave: -10,     // mal pronóstico en un caso reversible (consecuencia clínica máxima)
};
// Clasifica el desenlace de un caso para prestigio, seguimiento y nota del supervisor.
function classifyOutcome(caseObj, caseIdx, { wasPerfect, caseHintUsed, sindromeWrong, lostTrust, revealedSet }) {
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
const SUPERVISOR_NAME = "Dra. Herrera, jefa del servicio";
function buildSupervisorNote(outcome, caseName, prevRank, newRank) {
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

function getPerformanceTier(misCount, attCount) {
  if (attCount < 3) return null;
  const rate = misCount / attCount;
  if (rate === 0) return { emoji: "🏆", title: "Apto para continuar en el área", message: "Tu desempeño diagnóstico ha sido consistente y preciso en todos los casos atendidos. Estás listo para seguir avanzando con casos de mayor complejidad.", action: "none" };
  if (rate <= 0.25) return { emoji: "✅", title: "Apto, con observaciones menores", message: "Tu desempeño general es sólido, aunque hubo algunos diagnósticos que vale la pena repasar. Revisa las consecuencias clínicas de esos casos antes de continuar.", action: "none" };
  if (rate <= 0.5) return { emoji: "📚", title: "Se recomienda capacitación adicional", message: "Una proporción importante de los diagnósticos no fue certera. Se recomienda reforzar tu formación en una institución certificada antes de continuar con casos de mayor complejidad.", action: "none" };
  return { emoji: "🔄", title: "No apto por el momento", message: "El número de diagnósticos erróneos es alto en proporción a los casos atendidos. Se recomienda regresar al curso introductorio de RDoC para reforzar las bases antes de continuar.", action: "course" };
}

function competencyPct(obj) { return obj.total > 0 ? Math.round((obj.correct / obj.total) * 100) : null; }

const REVIEW_FIELDS = [
  { tag: "VEREDICTO", label: "Veredicto del revisor", icon: "⚖️", accent: "yellow" },
  { tag: "SINDROME", label: "Síndrome / Diagnóstico", icon: "🧠", accent: "cyan" },
  { tag: "DOMINIO", label: "Dominio RDoC", icon: "🗂️", accent: "purple" },
  { tag: "CONSTRUCTO", label: "Constructo", icon: "🔬", accent: "purple" },
  { tag: "UNIDAD", label: "Unidad de análisis", icon: "📊", accent: "purple" },
  { tag: "INSTRUMENTO", label: "Instrumento", icon: "📋", accent: "emerald" },
  { tag: "RETO", label: "Para que defiendas o ajustes", icon: "↩️", accent: "orange" },
];

const REVIEW_ACCENTS = {
  yellow: "border-yellow-500/40 bg-yellow-500/5",
  cyan: "border-cyan-500/30 bg-cyan-500/5",
  purple: "border-purple-500/30 bg-purple-500/5",
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  orange: "border-orange-500/40 bg-orange-500/5",
};
const REVIEW_LABEL_COLOR = {
  yellow: "text-yellow-300",
  cyan: "text-cyan-300",
  purple: "text-purple-300",
  emerald: "text-emerald-300",
  orange: "text-orange-300",
};
// Devuelve un array de secciones si el texto trae etiquetas [CAMPO], o null si es prosa normal.
function parseReview(text) {
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 nd-bg-animated flex items-center justify-center p-6">
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
            <p className="text-slate-600 text-[11px] mt-1.5 italic">
              Elaborado por Jesús Valenzuela
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "profile") {
    const ready = playerName.trim() && playerLastName.trim() && playerInstitution.trim();
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
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
    ];
    const slide = slides[courseStep];
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
          <div className="bg-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur min-h-[280px]">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
                {groups[g].map(i => {
                  const meta = CASE_META[i];
                  const c = CASES[i];
                  const done = attemptedCases.has(i);
                  const bad = misdiagnosedCases.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => openCase(i)}
                      className={`text-left p-3 rounded-xl border transition-all hover:scale-[1.02] ${
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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

          <div className="bg-slate-900/60 border border-purple-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4 sm:p-6">
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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 nd-bg-animated p-4 sm:p-6">
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
