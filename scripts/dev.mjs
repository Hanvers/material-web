import fs from 'node:fs';
import path from 'node:path';
import { buildSite, PROJECT_ROOT } from './build.mjs';
import { startServer } from './serve.mjs';

const port = Number(process.env.PORT) || 4173;
const watchTargets = [
  path.join(PROJECT_ROOT, 'site.config.json'),
  path.join(PROJECT_ROOT, 'resource'),
  path.join(PROJECT_ROOT, 'src'),
  path.join(PROJECT_ROOT, 'public'),
];

let building = false;
let pending = false;
let debounceTimer = null;

async function rebuild(reason = '') {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  pending = false;
  try {
    if (reason) console.log(`[dev] 检测到变更：${reason}`);
    await buildSite();
    console.log('[dev] 已重新构建，刷新浏览器即可看到更新。');
  } catch (error) {
    console.error(`[dev] 构建失败：${error.message}`);
  } finally {
    building = false;
    if (pending) {
      pending = false;
      await rebuild('排队中的变更');
    }
  }
}

function scheduleRebuild(filename) {
  clearDebounce();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    rebuild(filename || '文件变更');
  }, 140);
}

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

await buildSite();
await startServer({ directory: path.join(PROJECT_ROOT, 'dist'), port });
console.log('[dev] 监听 resource/、src/ 与 site.config.json 的变化…');

for (const target of watchTargets) {
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.watch(target, { recursive: true }, (eventType, filename) => {
        if (filename && filename.includes('node_modules')) return;
        scheduleRebuild(filename ? path.join(path.basename(target), filename) : path.basename(target));
      });
    } else {
      fs.watch(target, (eventType) => scheduleRebuild(path.basename(target)));
    }
  } catch {
    // Optional folders such as public/ may not exist yet.
  }
}
