#!/usr/bin/env node
/**
 * T23 量具：统计 backend/src/main/java 下 Java 文件里「含中日韩字符的字符串字面量」。
 *
 * 口径（与 T23 卡 §6 一致）：先剥掉块注释与行注释，再扫字符串字面量；注释里的中文不算。
 * 这是**量具不是门禁**（还没有降到 0，且数据资产类字面量要人工判定），退出码恒 0；
 * 用 `--list` 打印逐条明细，`--json` 打印机器可读结果。
 *
 * 用法: node tools/contract-check/check-hardcoded-copy.mjs [--list] [--json] [--dir <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const list = argv.includes('--list');
const json = argv.includes('--json');
const dirArg = argv.indexOf('--dir');
const rootDir = path.join(root, dirArg >= 0 ? argv[dirArg + 1] : 'backend/src/main/java');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

/** 剥注释：块注释整体移除，行注释只移除行尾部分（保留字符串里的 `//`）。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line-comment | block-comment | string | char
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line-comment'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block-comment'; i += 2; continue; }
      if (c === '"') { state = 'string'; out += c; i += 1; continue; }
      if (c === "'") { state = 'char'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'line-comment') {
      if (c === '\n') { state = 'code'; out += c; }
      i += 1; continue;
    }
    if (state === 'block-comment') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') { out += c; } // 保行号
      i += 1; continue;
    }
    if (state === 'string' || state === 'char') {
      if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
      if ((state === 'string' && c === '"') || (state === 'char' && c === "'")) { state = 'code'; out += c; i += 1; continue; }
      if (c === '\n') { state = 'code'; out += c; i += 1; continue; } // 未闭合字符串：自保
      out += c; i += 1; continue;
    }
  }
  return out;
}

/** 从已剥注释的源码里取字符串字面量（含文本块 '''/""" 简化为逐行扫描）。 */
function stringLiterals(src) {
  const found = [];
  const lines = src.split('\n');
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    let i = 0;
    while (i < line.length) {
      if (line[i] !== '"') { i += 1; continue; }
      let j = i + 1;
      let value = '';
      while (j < line.length) {
        if (line[j] === '\\') { value += line[j + 1] ?? ''; j += 2; continue; }
        if (line[j] === '"') break;
        value += line[j];
        j += 1;
      }
      found.push({ line: li + 1, value });
      i = j + 1;
    }
  }
  return found;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.java')) out.push(full);
  }
  return out;
}

const files = walk(rootDir).sort();
const perFile = [];
const hits = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const cleaned = stripComments(src);
  const lits = stringLiterals(cleaned).filter((l) => CJK.test(l.value));
  if (lits.length === 0) continue;
  const rel = path.relative(root, file).split(path.sep).join('/');
  perFile.push({ file: rel, count: lits.length });
  for (const l of lits) hits.push({ file: rel, line: l.line, value: l.value });
}

perFile.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
const total = perFile.reduce((sum, f) => sum + f.count, 0);

if (json) {
  console.log(JSON.stringify({ root: path.relative(root, rootDir).split(path.sep).join('/'), total, files: perFile, hits }, null, 2));
} else {
  console.log(`含中文字面量: ${total} 处 / ${perFile.length} 个文件（${path.relative(root, rootDir).split(path.sep).join('/')}）`);
  for (const f of perFile) console.log(String(f.count).padStart(5), f.file);
  if (list) {
    console.log('\n--- 明细 ---');
    for (const h of hits) console.log(`${h.file}:${h.line}  ${h.value}`);
  }
}

// 方便按包汇总
if (argv.includes('--by-package')) {
  const byPkg = new Map();
  for (const f of perFile) {
    const pkg = f.file.replace(/^.*?net\/zentao\//, '').split('/').slice(0, 2).join('/');
    byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + f.count);
  }
  console.log('\n--- 按包 ---');
  for (const [pkg, count] of [...byPkg].sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(5), pkg);
}
