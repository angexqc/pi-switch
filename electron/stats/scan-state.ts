import { STATS_SCAN_INTERVAL_MS } from '../constants';

/**
 * 用量统计自动扫描状态（主进程持有）：
 * - touchStatsScan()：每次自动/手动扫描完成后调用，记录最近扫描时间
 * - getStatsScanInfo()：供 IPC 返回给界面展示“自动更新时间间隔 / 上次更新”
 */
let lastStatsScanAt = 0;

export function touchStatsScan(): void {
  lastStatsScanAt = Date.now();
}

export function getStatsScanInfo(): { intervalMs: number; lastScanAt: number } {
  return { intervalMs: STATS_SCAN_INTERVAL_MS, lastScanAt: lastStatsScanAt };
}
