import { describe, it, expect } from "vitest";
import {
  shuffleArr,
  pickRandom,
  competencyPct,
  getRank,
  getClinicalRank,
  buildReportData,
} from "./logic.js";

describe("shuffleArr", () => {
  it("no muta el original y conserva los mismos elementos", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const result = shuffleArr(original);
    expect(original).toEqual(copy); // no mutación
    expect(result).toHaveLength(5);
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]); // mismos elementos
  });
  it("maneja el arreglo vacío", () => {
    expect(shuffleArr([])).toEqual([]);
  });
});

describe("pickRandom", () => {
  it("devuelve un elemento del arreglo", () => {
    const arr = ["a", "b", "c"];
    expect(arr).toContain(pickRandom(arr));
  });
});

describe("competencyPct", () => {
  it("devuelve null sin datos", () => {
    expect(competencyPct({ correct: 0, total: 0 })).toBeNull();
  });
  it("redondea el porcentaje", () => {
    expect(competencyPct({ correct: 1, total: 3 })).toBe(33);
    expect(competencyPct({ correct: 2, total: 3 })).toBe(67);
    expect(competencyPct({ correct: 5, total: 5 })).toBe(100);
  });
});

describe("getRank", () => {
  it("asigna el rango según el porcentaje", () => {
    expect(getRank(90).label).toBe("Maestro Neuropsicólogo RDoC");
    expect(getRank(85).label).toBe("Maestro Neuropsicólogo RDoC");
    expect(getRank(70).label).toBe("Diagnosticador Experto");
    expect(getRank(50).label).toBe("Investigador");
    expect(getRank(10).label).toBe("Aprendiz");
    expect(getRank(0).label).toBe("Aprendiz");
  });
});

describe("getClinicalRank", () => {
  it("mapea el prestigio al rango clínico correcto", () => {
    expect(getClinicalRank(95).label).toBe("Jefe del Servicio");
    expect(getClinicalRank(70).label).toBe("Especialista de Referencia");
    expect(getClinicalRank(45).label).toBe("Especialista de Planta");
    expect(getClinicalRank(20).label).toBe("Residente Avanzado");
    expect(getClinicalRank(0).label).toBe("Residente en Formación");
  });
});

describe("buildReportData", () => {
  const caseObj = {
    questions: [
      { type: "sindrome", options: [{ text: "S1", correct: true }, { text: "Sx", correct: false }] },
      { type: "dominio", options: [{ text: "D1", correct: true }, { text: "Dx", correct: false }] },
      { type: "instrumento", options: [{ text: "I1", correct: true }, { text: "Ix", correct: false }] },
      // 'contexto' no debe entrar en el informe
      { type: "contexto", options: [{ text: "C1", correct: true }, { text: "Cx", correct: false }] },
    ],
  };
  const data = buildReportData(caseObj);

  it("solo incluye los tipos clínicos del informe (excluye contexto)", () => {
    expect(data.blanks.map(b => b.type)).toEqual(["sindrome", "dominio", "instrumento"]);
  });
  it("usa la opción correcta como respuesta de cada hueco", () => {
    expect(data.blanks.map(b => b.answer)).toEqual(["S1", "D1", "I1"]);
  });
  it("el banco contiene las respuestas correctas y tiene doble tamaño (respuestas + distractores)", () => {
    expect(data.bank).toHaveLength(6);
    for (const answer of ["S1", "D1", "I1"]) expect(data.bank).toContain(answer);
  });
  it("la plantilla intercala texto y marcadores de posición", () => {
    expect(data.templateParts).toContain("{sindrome}");
    expect(data.templateParts[data.templateParts.length - 1]).toBe(".");
  });
});
