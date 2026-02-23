import { writeChatBankFiles } from "./lib/bot_chat_bank.mjs";

const target = Number(process.env.BOT_CHATBANK_TARGET || 1000);
const yearsRaw = String(process.env.BOT_CHATBANK_YEARS || "2020,2021,2022,2023,2024,2025");
const years = yearsRaw
  .split(/[;,\s]+/g)
  .map((x) => Number(x))
  .filter((x) => Number.isFinite(x));

async function main() {
  const out = await writeChatBankFiles({ target, years, output_dir: "bot_training" });
  console.log(`[chatbank] generado ${out.summary.generated} chats (target=${target}).`);
  console.log(`[chatbank] nucleo=${out.summary.core_count}, plantillas=${out.summary.template_family_count}.`);
  out.files.forEach((f) => console.log(`[chatbank] ${f}`));
}

main().catch((error) => {
  console.error(`[chatbank] error: ${String(error?.message || error)}`);
  process.exit(1);
});
