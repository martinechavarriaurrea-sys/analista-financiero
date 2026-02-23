import { writeQuestionBankFiles } from "./lib/bot_question_bank.mjs";

const target = Number(process.env.BOT_QBANK_TARGET || 1000);
const yearsRaw = String(process.env.BOT_QBANK_YEARS || "2019,2020,2021,2022,2023,2024");
const years = yearsRaw
  .split(/[;,\s]+/g)
  .map((x) => Number(x))
  .filter((x) => Number.isFinite(x));

async function main() {
  const out = await writeQuestionBankFiles({ target, years, output_dir: "bot_training" });
  console.log(`[qbank] generado ${out.summary.generated} preguntas (target=${target}).`);
  console.log(`[qbank] nucleo=${out.summary.core_count}, plantillas=${out.summary.templates_count}.`);
  out.files.forEach((f) => console.log(`[qbank] ${f}`));
}

main().catch((error) => {
  console.error(`[qbank] error: ${String(error?.message || error)}`);
  process.exit(1);
});
