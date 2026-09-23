// check-java-imports：后端 Java 的 import 行不得重复（同名导入出现两次以上）。
//
// 为什么需要：重复 import 编译合法、javac 不报，review 时又极易滑过——但它永远是噪音，
// 而且往往是**批量改写脚本**留下的痕迹（按行插入/重排时把整块导入复制了一遍）。
// 实测踩过：T23 的批量脚本在 13 个文件里复制了 162 行 import，进了库才被发现。
// 判定只看「同一文件内 import 行重复」，不看相邻重复的普通代码行（连续 `null,` 实参等是合法的）。
import { readFileSync } from 'node:fs'
import { BACKEND_SRC, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-java-imports'
const problems = []
let scanned = 0
for (const { full, rel } of walkFiles(BACKEND_SRC, { exts: new Set(['.java']) })) {
  scanned += 1
  const seen = new Map()
  const lines = readFileSync(full, 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (!line.startsWith('import ')) return
    const statement = line.replace(/\r$/, '').trim()
    if (seen.has(statement)) {
      problems.push(`${rel}:${index + 1} 重复 import（与第 ${seen.get(statement)} 行同）：${statement}`)
      return
    }
    seen.set(statement, index + 1)
  })
}
assertScanFloor(GATE, scanned, 400)

report(GATE, problems, scanned, '后端 Java import 无重复（批量脚本事故的看护）')
