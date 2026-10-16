import { describe, expect, it } from "vitest";
import { descendants, inferLevel, levelOf } from "@/lib/orgLevels";

describe("inferLevel", () => {
  it.each([
    ["CEO & Sócio", 1], ["Presidente US4 & Sócio", 1], ["CFO", 1],
    ["Diretor de Marketing", 2], ["Diretora Comercial", 2], ["Director of IT", 2],
    ["Gestora de Vendas", 3], ["Gestor de Marca - Lumber Plus", 3], ["Head of IT", 3], ["Gerente de Operaciones", 3],
    ["Coordenadora de Vendas", 4], ["Lead de Design", 4], ["Supervisor", 4],
    ["Analista Financeiro", 5], ["Especialista em Desenvolvimento de Negócios", 5], ["Recursos Humanos", 5], ["Assistente de Exportação", 5],
    ["Estagiário de Design", 6], ["Marketing Intern", 6],
  ])("%s → %i", (title, level) => expect(inferLevel(title)).toBe(level));
  it("lets an explicit level win", () => {
    expect(levelOf({ title: "Gestora de Projetos JR", level: 4 })).toBe(4);
    expect(levelOf({ title: "Gestora de Projetos JR", level: null })).toBe(3);
  });
});

describe("descendants", () => {
  it("collects the whole branch", () => {
    const ps = [{ id: "a", reports_to: null }, { id: "b", reports_to: "a" }, { id: "c", reports_to: "b" }, { id: "d", reports_to: null }];
    expect([...descendants("a", ps)].sort()).toEqual(["a", "b", "c"]);
    expect([...descendants("d", ps)]).toEqual(["d"]);
  });
});
