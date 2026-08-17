/* 上岸通 · 题库分卷合并构建
 * 把首屏要加载的真题数据分卷(registerBankPaper 调用)按体积大致均分，
 * 合并成少量 bundle 文件，砍掉 ~100 次请求 → 6 次，让 Service Worker 能整套缓存，
 * 平板首次加载更快、之后秒开。
 *
 * 不改动任何题目内容：仅把多个文件的文本顺序拼接；结构文件(fenbi-structure 等)
 * 保持原样且排在 bundle 之前加载(registerBankPaper 依赖 window.PAPER_STRUCTURE)。
 *
 * 用法: node tools/bundle-bank.js
 */
const fs = require('fs');
const path = require('path');

const BANK_DIR = path.join(__dirname, '..', 'bank');
const N_BUNDLES = 6;

function readManifest() {
  const txt = fs.readFileSync(path.join(BANK_DIR, 'manifest.js'), 'utf8');
  const m = txt.match(/window\.BANK_FILES\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('无法解析 BANK_FILES');
  // 安全求值数组字面量
  const files = eval(m[1]);
  return { txt, files };
}

function countCalls(file) {
  const c = fs.readFileSync(path.join(BANK_DIR, file), 'utf8');
  const n = (c.match(/registerBankPaper/g) || []).length;
  return { bytes: Buffer.byteLength(c, 'utf8'), calls: n };
}

function main() {
  const { txt, files } = readManifest();

  const structure = [];   // 结构中转文件(0 次调用)，保持原序、排在最前
  const data = [];        // 题目数据文件(>0 次调用)，将合并进 bundle
  for (const f of files) {
    if (/mock/i.test(f)) { console.warn('跳过 mock 文件(不应出现在 BANK_FILES):', f); continue; }
    const info = countCalls(f);
    if (info.calls > 0) data.push({ f, ...info });
    else structure.push(f);
  }

  const totalCalls = data.reduce((s, d) => s + d.calls, 0);
  const totalBytes = data.reduce((s, d) => s + d.bytes, 0);
  console.log(`数据文件: ${data.length} 个, 共 ${totalCalls} 次 registerBankPaper, ${(totalBytes / 1048576).toFixed(1)}MB`);

  // 按原序、按体积均衡切分成 N 个 bundle
  const target = totalBytes / N_BUNDLES;
  const bundles = Array.from({ length: N_BUNDLES }, () => ({ files: [], bytes: 0, calls: 0, content: '' }));
  let bi = 0;
  for (const d of data) {
    // 若当前 bundle 已明显超过均值且还有下一个 bundle 空间，则切到下一块
    if (bundles[bi].bytes > target && bi < N_BUNDLES - 1) bi++;
    bundles[bi].files.push(d.f);
    bundles[bi].bytes += d.bytes;
    bundles[bi].calls += d.calls;
    bundles[bi].content += fs.readFileSync(path.join(BANK_DIR, d.f), 'utf8') + '\n';
  }

  const bundleNames = [];
  bundles.forEach((b, i) => {
    const name = `bundle-${String(i + 1).padStart(2, '0')}.js`;
    fs.writeFileSync(path.join(BANK_DIR, name), b.content);
    bundleNames.push(name);
    console.log(`  ${name}: ${b.files.length} 文件, ${b.calls} 题, ${(b.bytes / 1048576).toFixed(1)}MB`);
  });

  // 改写 manifest: 结构文件保持原序在前，bundle 在后
  const newArr = '[\n  ' + structure.concat(bundleNames).map(f => '"' + f + '"').join(',\n  ') + '\n]';
  const newTxt = txt.replace(/window\.BANK_FILES\s*=\s*\[[\s\S]*?\];/, 'window.BANK_FILES = ' + newArr + ';');
  fs.writeFileSync(path.join(BANK_DIR, 'manifest.js'), newTxt);

  // 汇总校验
  const afterCalls = bundleNames.reduce((s, n) => s + (fs.readFileSync(path.join(BANK_DIR, n), 'utf8').match(/registerBankPaper/g) || []).length, 0);
  console.log(`\n校验: 合并前 ${totalCalls} 次 → 合并后 bundle 内 ${afterCalls} 次 (应相等)`);
  if (afterCalls !== totalCalls) throw new Error('题量不一致! 中止，请检查');

  console.log('\nmanifest.js 已更新。待删除的原始数据文件(已并入 bundle):');
  data.forEach(d => console.log('  bank/' + d.f));

  // 写一份待删除清单，供手动 git rm
  fs.writeFileSync(path.join(BANK_DIR, '_to_delete.txt'), data.map(d => d.f).join('\n'));
  console.log('\n下一步: 核对后用 git rm 删除清单中的原始文件，再提交。');
}

main();
