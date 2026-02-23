import { writeOwnerQuestionBankFiles } from "./lib/bot_owner_question_bank.mjs";

const target = Number(process.env.BOT_OWNER_TARGET || 1000);
const yearsRaw = String(process.env.BOT_OWNER_YEARS || "2020,2021,2022,2023,2024,2025");
const years = yearsRaw
  .split(/[;,\s]+/g)
  .map((x) => Number(x))
  .filter((x) => Number.isFinite(x));

async function main() {
  const out = await writeOwnerQuestionBankFiles({ target, years, output_dir: "bot_training" });
  console.log(`[owner-bank] generado ${out.summary.generated} preguntas (target=${target}).`);
  out.files.forEach((f) => console.log(`[owner-bank] ${f}`));
}

main().catch((error) => {
  console.error(`[owner-bank] error: ${String(error?.message || error)}`);
  process.exit(1);
});
