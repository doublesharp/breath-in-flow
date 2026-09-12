// Development-only generator. The app ships WAV files, never the model runtime.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { KokoroTTS } from 'kokoro-js';

const catalog = JSON.parse(
  await readFile(new URL('../packages/web/src/data/kokoroCues.json', import.meta.url), 'utf8')
);
const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
// Kokoro.js 1.2.1 ignores a revision option. Load an explicit local snapshot
// instead, so generation never silently follows the remote main branch.
const snapshot = new URL(`../node_modules/.cache/kokoro/${revision}/`, import.meta.url);
const files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx'];
const hashes = {};
for (const file of files) {
  const local = new URL(file, snapshot);
  let data;
  try {
    data = await readFile(local);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`Downloading ${file}`);
    const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file}`);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`, { cause: error });
    data = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(fileURLToPath(local)), { recursive: true });
    const temporary = new URL(`${file}.tmp`, snapshot);
    await writeFile(temporary, data);
    await rename(temporary, local);
  }
  hashes[file] = createHash('sha256').update(data).digest('hex');
}
const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(require.resolve('kokoro-js')));
const packageInfo = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const voiceData = await readFile(join(packageRoot, 'voices', `${catalog.voice}.bin`));
hashes[`voices/${catalog.voice}.bin`] = createHash('sha256').update(voiceData).digest('hex');
const output = new URL(`../packages/web/public/audio/kokoro/${catalog.voice}/`, import.meta.url);
await mkdir(output, { recursive: true });
const tts = await KokoroTTS.from_pretrained(fileURLToPath(snapshot), {
  dtype: 'fp32',
  device: 'cpu',
});
for (const cue of catalog.cues) {
  const audio = await tts.generate(cue.text, { voice: catalog.voice, speed: 0.9 });
  await audio.save(fileURLToPath(new URL(`${cue.id}.wav`, output)));
  console.log(`Generated ${cue.id}: ${cue.text}`);
}
await writeFile(
  new URL('provenance.json', output),
  JSON.stringify(
    {
      model,
      revision,
      generator: `kokoro-js@${packageInfo.version}`,
      hashes,
      voice: catalog.voice,
      speed: 0.9,
      dtype: 'fp32',
      cues: catalog.cues,
    },
    null,
    2
  ) + '\n'
);
