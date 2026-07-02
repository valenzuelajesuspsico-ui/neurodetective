import { describe, it, expect } from "vitest";
import {
  DOMAINS,
  UNITS,
  CASES,
  CASE_META,
  STUDY_CASES,
  SUPERVISION_CASES,
  SYNTHESIS_CASES,
  READINESS_CHECK,
  CONTRAST_VIGNETTES,
  DIFF_DRILL,
  CLASSIFY_ACTIVITY,
  BASE_POINTS,
  QTYPE_LABEL,
} from "./data.js";

const DOMAIN_KEYS = new Set(DOMAINS.map(d => d.key));
const UNIT_KEYS = new Set(UNITS.map(u => u.key));
const QUESTION_TYPES = new Set(["sindrome", "dominio", "constructo", "unidad", "instrumento", "contexto"]);

// Comprueba que una lista de opciones tenga exactamente una correcta.
function expectExactlyOneCorrect(options, ctx) {
  const correct = options.filter(o => o.correct).length;
  expect(correct, `${ctx}: debe haber exactamente 1 opción correcta`).toBe(1);
}

describe("Integridad de los 27 casos (Modo Juego)", () => {
  it("hay 27 casos y CASE_META tiene la misma longitud", () => {
    expect(CASES).toHaveLength(27);
    expect(CASE_META).toHaveLength(CASES.length);
  });

  CASES.forEach((c, i) => {
    describe(`Caso #${i + 1} (${CASE_META[i]?.name})`, () => {
      it("domainKey y unitKey son válidos", () => {
        expect(DOMAIN_KEYS.has(c.domainKey), `domainKey inválido: ${c.domainKey}`).toBe(true);
        expect(UNIT_KEYS.has(c.unitKey), `unitKey inválido: ${c.unitKey}`).toBe(true);
      });
      it("tiene entrevista con al menos 2 pistas", () => {
        expect(Array.isArray(c.interview)).toBe(true);
        expect(c.interview.length).toBeGreaterThanOrEqual(2);
      });
      it("cada pregunta tiene tipo válido y exactamente una opción correcta", () => {
        expect(c.questions.length).toBeGreaterThan(0);
        c.questions.forEach((q, qi) => {
          expect(QUESTION_TYPES.has(q.type), `tipo inválido: ${q.type}`).toBe(true);
          expect(BASE_POINTS[q.type], `sin puntaje para ${q.type}`).toBeGreaterThan(0);
          expect(QTYPE_LABEL[q.type], `sin etiqueta para ${q.type}`).toBeTruthy();
          expectExactlyOneCorrect(q.options, `caso ${i + 1} pregunta ${qi + 1}`);
        });
      });
    });
  });
});

describe("Integridad del Modo Estudio", () => {
  STUDY_CASES.forEach((c, i) => {
    it(`caso de estudio #${i + 1}: preguntas válidas`, () => {
      expect(c.questions.length).toBeGreaterThan(0);
      // caso normal trae vignette; el comparativo trae patients
      expect(Boolean(c.vignette) || Boolean(c.patients)).toBe(true);
      c.questions.forEach((q, qi) => {
        expect(QUESTION_TYPES.has(q.type)).toBe(true);
        expectExactlyOneCorrect(q.options, `estudio ${i + 1} pregunta ${qi + 1}`);
      });
    });
  });
});

describe("Integridad del Modo Supervisión", () => {
  SUPERVISION_CASES.forEach((c, i) => {
    it(`caso #${i + 1}: correctId corresponde a un segmento`, () => {
      const ids = c.segments.map(s => s.id);
      expect(ids).toContain(c.correctId);
      expect(new Set(ids).size, "ids de segmento duplicados").toBe(ids.length);
      expect(c.explanationCorrect).toBeTruthy();
    });
  });
});

describe("Integridad de los interludios de síntesis", () => {
  SYNTHESIS_CASES.forEach((c, i) => {
    it(`síntesis #${i + 1}: una opción correcta y 'requires' válido`, () => {
      expectExactlyOneCorrect(c.options, `síntesis ${i + 1}`);
      expect(Array.isArray(c.requires)).toBe(true);
      c.requires.forEach(idx => expect(idx).toBeGreaterThanOrEqual(0));
    });
  });
});

describe("Integridad de las actividades del curso", () => {
  it("READINESS_CHECK: cada pregunta con una correcta", () => {
    READINESS_CHECK.questions.forEach((q, i) =>
      expectExactlyOneCorrect(q.options, `readiness ${i + 1}`));
  });
  it("CONTRAST_VIGNETTES: dos pacientes y una correcta por pregunta", () => {
    expect(CONTRAST_VIGNETTES.patients).toHaveLength(2);
    CONTRAST_VIGNETTES.questions.forEach((q, i) =>
      expectExactlyOneCorrect(q.options, `contraste ${i + 1}`));
  });
  it("CLASSIFY_ACTIVITY: cada paso con una correcta", () => {
    CLASSIFY_ACTIVITY.steps.forEach((s, i) =>
      expectExactlyOneCorrect(s.options, `classify ${i + 1}`));
  });
  it("DIFF_DRILL: la respuesta correcta ('a'/'b') existe", () => {
    DIFF_DRILL.forEach((d, i) => {
      expect(["a", "b"]).toContain(d.correct);
      expect(d[d.correct], `diff ${i + 1}: falta el texto de la correcta`).toBeTruthy();
    });
  });
});
