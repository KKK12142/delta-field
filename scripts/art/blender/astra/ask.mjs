// BAZE 게이트웨이 chat/completions로 gpt-6.2-astra에게 Blender 스크립트를 받는다.
// 키는 BAZE_API_KEY(환경 변수)로만 읽고 출력하지 않는다.
// 사용: node --env-file=~/.config/delta-field/baze.env ask.mjs <프롬프트.txt> <출력.py> [그림.png ...]
import { readFileSync, writeFileSync } from 'node:fs';

const [promptFile, outFile, ...images] = process.argv.slice(2);
const key = process.env.BAZE_API_KEY;
if (!key) { console.error('BAZE_API_KEY가 없습니다.'); process.exit(1); }

const content = [{ type: 'text', text: readFileSync(promptFile, 'utf8') }];
for (const img of images) {
  content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${readFileSync(img).toString('base64')}` } });
}

const res = await fetch('https://api.baze.co/v1/gateway/chat/completions/', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'delta-field-art/0.1' },
  body: JSON.stringify({ model: 'gpt-6.2-astra', messages: [{ role: 'user', content }], max_tokens: 32000 }),
  signal: AbortSignal.timeout(600_000),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text.replaceAll(key, '***').slice(0, 800)}`); process.exit(1); }
const json = JSON.parse(text);
const answer = json.choices?.[0]?.message?.content ?? '';
const m = answer.match(/```python\n([\s\S]*?)```/);
writeFileSync(outFile, m ? m[1] : answer);
console.log(`usage: ${JSON.stringify(json.usage ?? {})}`);
console.log(`script: ${outFile} (${(m ? m[1] : answer).length} chars, code block ${m ? 'found' : 'NOT found'})`);
