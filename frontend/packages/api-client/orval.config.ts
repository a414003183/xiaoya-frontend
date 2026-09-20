import { defineConfig } from 'orval'

export default defineConfig({
  zentao: {
    input: '../../../contract/openapi.yaml',
    output: {
      target: './src/generated/api.ts',
      schemas: './src/generated/model',
      // tags-split：按 openapi tag 一文件（P6 T-8 首屏预算）——单文件把全部端点函数并进
      // 一个模块，模块级 chunk 分配令其整体落入急切共享 chunk（实测 88KB raw 漏进首屏）；
      // 拆分后仅被急切引用的 tag 进首屏，其余随消费域懒加载。
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '/api/v1',
      clean: true,
      override: {
        mutator: {
          path: './src/http.ts',
          name: 'httpFetch',
        },
      },
    },
  },
})
