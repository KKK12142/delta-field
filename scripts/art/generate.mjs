// BAZE 게이트웨이로 그림 생성(GPT 이미지)을 불러 받은 그림을 art/raw/<이름>/에 저장한다(docs/art.md, BAZE 문서 docs.factchat.kr).
// 설정은 scripts/art/baze.json. API 키는 환경 변수 BAZE_API_KEY로만 읽고, 화면·로그·파일 어디에도 쓰지 않는다.
// 모델이 정해지지 않으면(설정 model, --model) 부르지 않는다. --dry-run은 보낼 내용만 보이고 부르지 않는다(키 없이 된다).
// 쓴 크레딧은 받을 때마다 화면에 보이고 art/raw/credits.log에 한 줄씩 남긴다.
//
// 사용: pnpm art:gen(키는 ~/.config/delta-field/baze.env에서 읽는다) 또는 node --env-file-if-exists=<키 파일> scripts/art/generate.mjs <프롬프트 파일> --out <이름> [옵션]
//   --char char-01     scripts/art/characters.json의 desc를 {{desc}}에 넣는다
//   --thing desk       scripts/art/things.json의 desc·size를 {{desc}}·{{size}}에 넣는다
//   --var key=값       {{key}}에 넣는다(여러 번 쓸 수 있다)
//   --ref <그림.png>   참고 그림(같은 캐릭터의 다른 방향 등). 여러 번 쓸 수 있다(GPT는 10장까지). 주면 "고치기"가 된다
//   --model <이름>     설정의 model 대신(gpt-image-2, gpt-image-2.5-sunburst, gpt-image-2.5-flare)
//   --n 1              한 번에 받을 장 수(number_of_images)
//   --size 1024x1536   설정의 size 대신
//   --quality medium   GPT 품질(low, medium, high). 없으면 BAZE 기본값
//   --no-style         prompts/style.txt를 앞에 붙이지 않는다
//   --dry-run          보낼 내용만 보인다(참고 그림은 크기만)
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    char: { type: 'string' },
    thing: { type: 'string' },
    var: { type: 'string', multiple: true, default: [] },
    ref: { type: 'string', multiple: true, default: [] },
    model: { type: 'string' },
    quality: { type: 'string' },
    n: { type: 'string', default: '1' },
    size: { type: 'string' },
    'no-style': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
const promptFile = positionals[0];
if (!promptFile || !opt.out || !/^[\w.-]+$/.test(opt.out)) {
  console.error('사용: generate.mjs <프롬프트 파일> --out <이름(영문·숫자·-)> [--char id] [--thing id] [--var key=값] [--ref 그림.png] [--model 이름] [--n 1] [--quality medium] [--dry-run]');
  process.exit(2);
}

const config = JSON.parse(readFileSync(join(here, 'baze.json'), 'utf8'));
const key = process.env.BAZE_API_KEY ?? '';
/** 혹시 응답이나 오류에 키가 섞여 돌아와도 가린다 */
const redact = (s) => (key ? String(s).split(key).join('***') : String(s));
process.on('uncaughtException', (err) => {
  console.error(redact(err?.message ?? err));
  process.exit(1);
});

// ---------- 프롬프트 만들기 ----------
const vars = {};
if (opt.thing) {
  const t = JSON.parse(readFileSync(join(here, 'things.json'), 'utf8'));
  const c = [...t.tiles, ...t.objects].find((x) => x.id === opt.thing);
  if (!c) throw new Error(`things.json에 ${opt.thing}가 없습니다.`);
  vars.desc = c.desc;
  if (c.size) vars.size = c.size;
}
if (opt.char) {
  const list = JSON.parse(readFileSync(join(here, 'characters.json'), 'utf8')).characters;
  const c = list.find((x) => x.id === opt.char);
  if (!c) throw new Error(`characters.json에 ${opt.char}가 없습니다.`);
  vars.desc = c.desc;
}
for (const v of opt.var) {
  const i = v.indexOf('=');
  if (i < 1) throw new Error(`--var는 key=값으로 적습니다: ${v}`);
  vars[v.slice(0, i)] = v.slice(i + 1);
}
let prompt = readFileSync(promptFile, 'utf8');
if (!opt['no-style']) prompt = readFileSync(join(here, 'prompts', 'style.txt'), 'utf8') + '\n' + prompt;
prompt = prompt.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in vars)) throw new Error(`프롬프트의 ${m}에 넣을 값이 없습니다(--char, --thing 또는 --var ${k}=...).`);
  return vars[k];
});
prompt = prompt.trim();

const size = opt.size ?? config.size;
const n = Number(opt.n);
const model = opt.model ?? config.model;
const body = { model, prompt, number_of_images: n, size, ...config.body };
if (opt.quality) body.quality = opt.quality;
if (opt.ref.length) {
  if (opt.ref.length > 10) throw new Error('참고 그림은 10장까지 보낼 수 있습니다(GPT).');
  // 접두어 없는 base64는 400이 난다
  body.input_images = opt.ref.map((f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`);
}
const bodyText = JSON.stringify(body);
if (bodyText.length > 24 * 1024 * 1024) throw new Error(`요청이 ${(bodyText.length / 1048576).toFixed(1)}MB라 25MB 한도에 가깝습니다. 참고 그림을 줄여 주십시오.`);

if (opt['dry-run']) {
  console.log(`보낼 곳: POST ${config.url}`);
  console.log(`인증: Authorization: Bearer <BAZE_API_KEY>${key ? '' : ' (지금 키가 없습니다)'}, User-Agent: ${config.userAgent}`);
  const shown = { ...body, model: model || '(정하지 않음)' };
  if (body.input_images) shown.input_images = opt.ref.map((f, i) => `${f} (${Math.round(body.input_images[i].length / 1024)}KB data URL)`);
  console.log(JSON.stringify(shown, null, 2));
  process.exit(0);
}

// ---------- 부르기 ----------
if (!model) {
  console.error('모델이 정해지지 않아 부르지 않습니다. --model로 정하거나 scripts/art/baze.json의 model을 채우십시오.');
  process.exit(1);
}
if (!key) {
  console.error('환경 변수 BAZE_API_KEY가 없습니다. 교사가 ~/.config/delta-field/baze.env(chmod 600, 저장소 밖)에 BAZE_API_KEY=... 한 줄을 넣고, pnpm art:gen으로 실행합니다.');
  process.exit(1);
}
// User-Agent가 비면 403(1010)이 난다
const headers = { Authorization: `Bearer ${key}`, 'User-Agent': config.userAgent, Accept: 'application/json' };

const started = Date.now();
let json = await call(config.url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: bodyText });
// Fal 모델은 바로 그림을 주지 않고 operation_id를 준다. 끝날 때까지 3초마다 묻는다(5분까지).
if (json.operation_id && !(Array.isArray(json.data) && json.data.length)) {
  const pollUrl = `${config.url}${encodeURIComponent(json.operation_id)}/?model=${encodeURIComponent(model)}`;
  while (json.status === 'processing' || json.status === 'pending' || !json.data?.length) {
    if (Date.now() - started > 300_000) {
      console.error(`5분이 지나도 끝나지 않았습니다(operation_id ${json.operation_id}).`);
      process.exit(1);
    }
    if (json.status && !['processing', 'pending', 'completed', 'succeeded'].includes(json.status)) {
      console.error(`그림 만들기가 실패했습니다: ${redact(JSON.stringify(json)).slice(0, 300)}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
    json = await call(pollUrl, { headers });
  }
}
const items = Array.isArray(json.data) ? json.data : [];
if (!items.length) {
  console.error(`응답에 그림(data)이 없습니다: ${redact(JSON.stringify(json)).slice(0, 300)}`);
  process.exit(1);
}

/** 부르고 JSON을 돌려준다. 실패하면 상태와 응답 앞부분(키는 가림)을 보이고 끝낸다. GPT는 보통 15~30초 걸린다. */
async function call(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  } catch (err) {
    console.error(`부르지 못했습니다: ${redact(err?.message ?? err)}`);
    process.exit(1);
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`BAZE가 ${res.status}를 돌려주었습니다: ${redact(text).slice(0, 500)}`);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(`응답이 JSON이 아닙니다: ${redact(text).slice(0, 200)}`);
    process.exit(1);
  }
}

// ---------- 저장: art/raw/<이름>/<시각>-<번호>.png 와 같은 이름의 .json(프롬프트·설정. 키는 넣지 않는다) ----------
const dir = join(root, 'art', 'raw', opt.out);
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const saved = [];
for (const [i, item] of items.entries()) {
  let png;
  const src = item.url ?? item.b64_json ?? '';
  if (src.startsWith('data:')) png = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  else if (/^https?:\/\//.test(src)) {
    // 임시 주소라 바로 받아 둔다. 받은 주소에는 키를 보내지 않는다.
    const r = await fetch(src, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) {
      console.error(`${i + 1}번째 그림을 내려받지 못했습니다(${r.status}).`);
      continue;
    }
    png = Buffer.from(await r.arrayBuffer());
  } else if (item.b64_json) png = Buffer.from(item.b64_json, 'base64');
  else continue;
  const file = join(dir, `${stamp}-${i + 1}.png`);
  writeFileSync(file, png);
  const meta = {
    prompt,
    promptFile,
    vars,
    ref: opt.ref,
    model: json.model ?? model,
    size,
    quality: opt.quality ?? null,
    body: config.body,
    id: json.id ?? null,
    creditsCharged: json.credits_charged ?? null,
    revisedPrompt: item.revised_prompt ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(meta, null, 2) + '\n');
  saved.push(file);
}
console.log(`${saved.length}장을 받았습니다(${Math.round((Date.now() - started) / 1000)}초).`);
for (const f of saved) console.log(`  ${f}`);
console.log(`쓴 크레딧: ${json.credits_charged ?? '(응답에 없음)'}${json.usage ? `, 사용량 ${JSON.stringify(json.usage)}` : ''}`);
appendFileSync(
  join(root, 'art', 'raw', 'credits.log'),
  `${new Date().toISOString()}\t${opt.out}\t${json.model ?? model}\t${saved.length}장\t${json.credits_charged ?? '?'}크레딧\t${json.id ?? ''}\n`,
);
