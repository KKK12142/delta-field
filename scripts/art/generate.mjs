// BAZE 게이트웨이로 그림 생성(GPT 이미지)을 불러 받은 그림을 art/raw/<이름>/에 저장한다(docs/art.md).
// 설정은 scripts/art/baze.json. API 키는 환경 변수 BAZE_API_KEY로만 읽고, 화면·로그·파일 어디에도 쓰지 않는다.
// 설정의 url·model이 비어 있으면 부르지 않는다. --dry-run은 보낼 내용만 보이고 부르지 않는다(키 없이 된다).
//
// 사용: pnpm art:gen(키는 ~/.config/delta-field/baze.env에서 읽는다) 또는 node --env-file-if-exists=<키 파일> scripts/art/generate.mjs <프롬프트 파일> --out <이름> [옵션]
//   --char char-01     scripts/art/characters.json의 desc를 {{desc}}에 넣는다
//   --thing desk       scripts/art/things.json의 desc·size를 {{desc}}·{{size}}에 넣는다
//   --var key=값       {{key}}에 넣는다(여러 번 쓸 수 있다)
//   --ref <그림.png>   참고 그림(같은 캐릭터의 다른 방향 등). 설정의 editUrl로 보낸다
//   --n 1              한 번에 받을 장 수
//   --size 1024x1536   설정의 size 대신
//   --no-style         prompts/style.txt를 앞에 붙이지 않는다
//   --dry-run          보낼 내용만 보인다
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
    ref: { type: 'string' },
    n: { type: 'string', default: '1' },
    size: { type: 'string' },
    'no-style': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
const promptFile = positionals[0];
if (!promptFile || !opt.out || !/^[\w.-]+$/.test(opt.out)) {
  console.error('사용: generate.mjs <프롬프트 파일> --out <이름(영문·숫자·-)> [--char id] [--thing id] [--var key=값] [--ref 그림.png] [--n 1] [--dry-run]');
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
const body = { model: config.model, prompt, n, size, ...config.body };
const url = opt.ref ? config.editUrl : config.url;

if (opt['dry-run']) {
  console.log(`보낼 곳: ${url || '(설정이 비어 있습니다)'}`);
  console.log(`인증: ${config.authHeader}: ${config.authPrefix}<BAZE_API_KEY>${key ? '' : ' (지금 키가 없습니다)'}`);
  if (opt.ref) console.log(`참고 그림: ${opt.ref}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

// ---------- 부르기 ----------
if (!url || !config.model) {
  console.error(`scripts/art/baze.json의 ${opt.ref ? 'editUrl' : 'url'}·model이 비어 있어 부르지 않습니다. 교사에게 받은 값을 넣은 뒤 다시 하십시오.`);
  process.exit(1);
}
if (config.format !== 'openai-images') {
  console.error(`요청 형식 ${config.format}은 아직 만들지 않았습니다. 지금은 openai-images 형식만 보낼 수 있습니다.`);
  process.exit(1);
}
if (!key) {
  console.error('환경 변수 BAZE_API_KEY가 없습니다. 교사가 ~/.config/delta-field/baze.env(chmod 600, 저장소 밖)에 BAZE_API_KEY=... 한 줄을 넣고, pnpm art:gen으로 실행합니다.');
  process.exit(1);
}

const headers = { [config.authHeader]: `${config.authPrefix}${key}` };
let init;
if (opt.ref) {
  // 참고 그림이 있으면 multipart로 보낸다(OpenAI의 그림 고치기 형식)
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  form.append('image', new Blob([readFileSync(opt.ref)], { type: 'image/png' }), basename(opt.ref));
  init = { method: 'POST', headers, body: form };
} else {
  init = { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const started = Date.now();
let res;
try {
  res = await fetch(url, { ...init, signal: AbortSignal.timeout(300_000) });
} catch (err) {
  console.error(`부르지 못했습니다: ${redact(err?.message ?? err)}`);
  process.exit(1);
}
const text = await res.text();
if (!res.ok) {
  console.error(`BAZE가 ${res.status}를 돌려주었습니다: ${redact(text).slice(0, 500)}`);
  process.exit(1);
}
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error(`응답이 JSON이 아닙니다: ${redact(text).slice(0, 200)}`);
  process.exit(1);
}
const items = Array.isArray(json.data) ? json.data : [];
if (!items.length) {
  console.error(`응답에 그림(data)이 없습니다: ${redact(text).slice(0, 300)}`);
  process.exit(1);
}

// ---------- 저장: art/raw/<이름>/<시각>-<번호>.png 와 같은 이름의 .json(프롬프트·설정. 키는 넣지 않는다) ----------
const dir = join(root, 'art', 'raw', opt.out);
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const saved = [];
for (const [i, item] of items.entries()) {
  let png;
  if (item.b64_json) png = Buffer.from(item.b64_json, 'base64');
  else if (item.url) {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(120_000) }); // 받은 주소에는 키를 보내지 않는다
    if (!r.ok) {
      console.error(`${i + 1}번째 그림을 내려받지 못했습니다(${r.status}).`);
      continue;
    }
    png = Buffer.from(await r.arrayBuffer());
  } else continue;
  const file = join(dir, `${stamp}-${i + 1}.png`);
  writeFileSync(file, png);
  const meta = {
    prompt,
    promptFile,
    vars,
    ref: opt.ref ?? null,
    model: config.model,
    size,
    body: config.body,
    revisedPrompt: item.revised_prompt ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify(meta, null, 2) + '\n');
  saved.push(file);
}
console.log(`${saved.length}장을 받았습니다(${Math.round((Date.now() - started) / 1000)}초).`);
for (const f of saved) console.log(`  ${f}`);
if (json.usage) console.log(`사용량: ${JSON.stringify(json.usage)}`);
