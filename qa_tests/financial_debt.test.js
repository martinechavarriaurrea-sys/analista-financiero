const test = require("node:test");
const assert = require("node:assert/strict");

test("resolveFinancialDebtFromRows: sin year usa solo el ultimo año", async () => {
  const { resolveFinancialDebtFromRows } = await import("../scripts/lib/financial_debt.mjs");

  const rows = [
    {
      fecha_corte: "2023-12-31T00:00:00.000",
      periodo: "Periodo Actual",
      concepto: "Otros pasivos financieros no corrientes",
      valor: "1200",
      numero_radicado: "R1",
      id_punto_entrada: "422",
      punto_entrada: "50 NIIF Pymes - Separado Grupo 2",
      id_taxonomia: "411",
      codigo_instancia: "I1"
    },
    {
      fecha_corte: "2024-12-31T00:00:00.000",
      periodo: "Periodo Actual",
      concepto: "Otros pasivos financieros no corrientes",
      valor: "800",
      numero_radicado: "R2",
      id_punto_entrada: "422",
      punto_entrada: "50 NIIF Pymes - Separado Grupo 2",
      id_taxonomia: "411",
      codigo_instancia: "I2"
    }
  ];

  const debt = resolveFinancialDebtFromRows(rows);
  assert.equal(debt.deuda, 800);
  assert.equal(debt.deudaSumada, 800);
});

test("resolveFinancialDebtFromRows: 'no corriente' no cuenta como 'corriente'", async () => {
  const { resolveFinancialDebtFromRows } = await import("../scripts/lib/financial_debt.mjs");

  const rows = [
    {
      fecha_corte: "2024-12-31T00:00:00.000",
      periodo: "Periodo Actual",
      concepto: "Otros pasivos financieros no corrientes",
      valor: "5798692",
      numero_radicado: "R2",
      id_punto_entrada: "422",
      punto_entrada: "50 NIIF Pymes - Separado Grupo 2",
      id_taxonomia: "411",
      codigo_instancia: "I2"
    }
  ];

  const debt = resolveFinancialDebtFromRows(rows, 2024);
  assert.deepEqual(debt.componentConcepts, ["Otros pasivos financieros no corrientes"]);
  assert.equal(debt.deuda, 5798692);
});

test("resolveFinancialDebtFromRows: evita doble conteo cuando corriente/no corriente son alias del mismo rubro", async () => {
  const { resolveFinancialDebtFromRows } = await import("../scripts/lib/financial_debt.mjs");

  const rows = [
    {
      fecha_corte: "2024-12-31T00:00:00.000",
      periodo: "Periodo Actual",
      concepto: "Otros pasivos financieros corrientes",
      valor: "5798692",
      numero_radicado: "R2",
      id_punto_entrada: "422",
      punto_entrada: "50 NIIF Pymes - Separado Grupo 2",
      id_taxonomia: "411",
      codigo_instancia: "I2"
    },
    {
      fecha_corte: "2024-12-31T00:00:00.000",
      periodo: "Periodo Actual",
      concepto: "Otros pasivos financieros no corrientes",
      valor: "5798692",
      numero_radicado: "R2",
      id_punto_entrada: "422",
      punto_entrada: "50 NIIF Pymes - Separado Grupo 2",
      id_taxonomia: "411",
      codigo_instancia: "I2"
    }
  ];

  const debt = resolveFinancialDebtFromRows(rows, 2024);
  assert.equal(debt.deuda, 5798692);
});
