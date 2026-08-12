import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';

interface Props {
  option: echarts.EChartsOption;
  height?: number | string;
  onEvents?: Record<string, (params: unknown) => void>;
}

export default function EChart({ option, height = 320, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(ref.current);
    } catch (e) {
      console.error('[PiSwitch] ECharts init 失败:', (e as Error).message);
      return;
    }
    chartRef.current = chart;
    if (onEvents) {
      for (const [name, fn] of Object.entries(onEvents)) {
        chart.on(name, fn);
      }
    }
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // setOption 对空/异常数据可能抛错，避免渲染异常拖垮整棵组件树（白屏）
    try {
      chartRef.current?.setOption(option, true);
    } catch (e) {
      console.error('[PiSwitch] ECharts setOption 失败:', (e as Error).message);
    }
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}
