/** @route /admin/monitor @title platform.monitor.title @perm monitor-view @menu admin/monitor @order 3 */
import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Card,
  Descriptions,
  Flex,
  PageContainer,
  PageLoading,
  Progress,
  Space,
  Statistic,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../../../shared/format'
import { fetchServerMetrics } from '../api/platform.api'

/** 采样间隔：10s（T17；负载是活数据，页面开着就刷新，手动刷新留给浏览器）。 */
const REFRESH_MS = 10_000

/** 字节 → 人类可读（GiB 为主，小于 1GiB 退 MiB）；-1 是「不可用」哨兵，不是 0。 */
function formatBytes(bytes: number): string {
  if (bytes < 0) {
    return '—'
  }
  const gib = bytes / 1024 ** 3
  return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${(bytes / 1024 ** 2).toFixed(0)} MiB`
}

/** 占比（0~1）→ 百分比数字；哨兵 -1 与总数为 0 都给 null（显示「—」，不假装 0%）。 */
function percent(used: number, total: number): number | null {
  if (used < 0 || total <= 0) {
    return null
  }
  return Math.round((used / total) * 100)
}

function ProgressCard({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return (
    <Card>
      <Flex vertical align="center" gap={8}>
        <Progress
          type="circle"
          // 拿不到数就不画弧，显示「—」
          percent={value ?? 0}
          format={() => (value === null ? '—' : `${value}%`)}
        />
        <Statistic title={label} value={detail} />
      </Flex>
    </Card>
  )
}

/**
 * 服务监控（T17 P1-5）：这台机器的 CPU / 内存 / 磁盘与 JVM 堆快照。
 *
 * 数值来自后端聚合端点（直读 JDK MXBean，不经 actuator）；不可用的指标后端给 -1，这里显示「—」——
 * 显示 0% 会被读成「空闲」，那是在撒谎。
 */
export default function ServerMonitorPage() {
  const { t } = useTranslation()
  const metrics = useQuery({
    queryKey: ['getServerMetrics'],
    refetchInterval: REFRESH_MS,
    queryFn: fetchServerMetrics,
  })

  if (metrics.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (metrics.error) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{errorText(metrics.error, t, 'common.loading')}</Typography.Text>
      </PageContainer>
    )
  }

  const data = metrics.data
  const cpuLoad = data.cpuLoad < 0 ? null : Math.round(data.cpuLoad * 100)
  // 运行时长：不足一天省掉「天」这一档
  const days = Math.floor(data.uptimeSeconds / 86400)
  const hours = Math.floor((data.uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((data.uptimeSeconds % 3600) / 60)
  const uptimeText =
    days > 0
      ? t('platform.monitor.uptimeDays', { days, hours, minutes })
      : t('platform.monitor.uptimeHours', { hours, minutes })
  const memoryPercent = percent(data.memoryUsedBytes, data.memoryTotalBytes)
  const diskPercent = percent(data.diskUsedBytes, data.diskTotalBytes)

  return (
    <PageContainer>
      <Flex gap={16} wrap>
        <ProgressCard
          label={t('platform.monitor.cpu')}
          value={cpuLoad}
          detail={t('platform.monitor.cpuDetail', { cores: data.cpuCores })}
        />
        <ProgressCard
          label={t('platform.monitor.memory')}
          value={memoryPercent}
          detail={t('platform.monitor.usageDetail', {
            used: formatBytes(data.memoryUsedBytes),
            total: formatBytes(data.memoryTotalBytes),
          })}
        />
        <ProgressCard
          label={t('platform.monitor.disk')}
          value={diskPercent}
          detail={t('platform.monitor.usageDetail', {
            used: formatBytes(data.diskUsedBytes),
            total: formatBytes(data.diskTotalBytes),
          })}
        />
      </Flex>
      <Space direction="vertical" size="middle">
        <Descriptions
          column={2}
          size="small"
          items={[
            { key: 'sample', label: t('platform.monitor.sampledAt'), children: formatDateTime(data.sampledAt) },
            { key: 'uptime', label: t('platform.monitor.uptime'), children: uptimeText },
            {
              key: 'heap',
              label: t('platform.monitor.heap'),
              children: t('platform.monitor.usageDetail', {
                used: formatBytes(data.jvmHeapUsedBytes),
                total: formatBytes(data.jvmHeapMaxBytes),
              }),
            },
            { key: 'diskPath', label: t('platform.monitor.diskPath'), children: data.diskPath },
          ]}
        />
        <Typography.Text type="secondary">{t('platform.monitor.hint', { seconds: REFRESH_MS / 1000 })}</Typography.Text>
      </Space>
    </PageContainer>
  )
}
