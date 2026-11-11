// BAZE 게이트웨이의 모델 목록(GET /v1/gateway/models/)에서 그림 모델만 골라 보인다. 키는 BAZE_API_KEY로만 읽고 출력하지 않는다.
// 사용: pnpm art:models [찾을 글자, 예: gpt-image] [--raw]  (--raw는 고른 모델의 응답을 그대로 보인다)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'baze.json'), 'utf8'));
const key = process.env.BAZE_API_KEY ?? '';
const redact = (s) => (key ? String(s).split(key).join('***') : String(s));
if (!key) {
  console.error('환경 변수 BAZE_API_KEY가 없습니다(~/.config/delta-field/baze.env, pnpm art:models).');
  process.exit(1);
}
const args = process.argv.slice(2);
const raw = args.includes('--raw');
const filter = args.find((a) => !a.startsWith('--')) ?? 'image';
const url = new URL('../../models/', config.url).href; // …/v1/gateway/images/generate/ → …/v1/gateway/models/
let res;
try {
  res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': config.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
} catch (err) {
  console.error(`부르지 못했습니다: ${redact(err?.message ?? err)}`);
  process.exit(1);
}
const text = await res.text();
if (!res.ok) {
  console.error(`BAZE가 ${res.status}를 돌려주었습니다: ${redact(text).slice(0, 500)}`);
  process.exit(1);
}
const json = JSON.parse(text);
const list = Array.isArray(json) ? json : (json.data ?? json.models ?? json.results ?? []);
const name = (m) => m.id ?? m.model ?? m.name ?? '';
const picked = list.filter((m) => JSON.stringify(m).toLowerCase().includes(filter.toLowerCase()));
console.log(`${url}: 모델 ${list.length}개, "${filter}"가 들어간 것 ${picked.length}개`);
for (const m of picked) console.log(raw ? redact(JSON.stringify(m)) : `- ${name(m)}`);
