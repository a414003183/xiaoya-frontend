import mysql from 'mysql2/promise'

/**
 * E2E 数据隔离（phase-6 T-7）：每轮重建独立 schema zentao_e2e。
 * Playwright 先起 webServer 后跑 globalSetup，故重建必须发生在 api 启动命令链里（顺序保证），
 * 随后 api 以 e2e profile 启动、由 Flyway 自动建表；fixtures 造数全部走 API（禁直插库）。
 * 连接参数与 backend application-e2e.yml 同源（E2E_DB_URL / E2E_DB_USER / E2E_DB_PASSWORD）。
 */
const jdbcUrl =
  process.env.E2E_DB_URL ?? 'jdbc:mysql://127.0.0.1:3306/zentao_e2e?useSSL=false&allowPublicKeyRetrieval=true'
const parsed = jdbcUrl.match(/^jdbc:mysql:\/\/([^:/]+):(\d+)\/([^?]+)/)
if (!parsed) {
  throw new Error(`E2E_DB_URL 无法解析（期望 jdbc:mysql://host:port/db）：${jdbcUrl}`)
}
const [, host, port, database] = parsed

const connection = await mysql.createConnection({
  host,
  port: Number(port),
  user: process.env.E2E_DB_USER ?? 'root',
  password: process.env.E2E_DB_PASSWORD ?? 'root',
})
try {
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  console.log(`e2e db-reset: ${database} 已重建`)
} finally {
  await connection.end()
}
