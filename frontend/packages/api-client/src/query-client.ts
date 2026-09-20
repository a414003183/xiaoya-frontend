import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './http'

/** 服务端数据唯一归宿（01 §3.3）：全局 QueryClient 默认值。 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.code >= 40000 && error.code < 50000) {
            return false
          }
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}
