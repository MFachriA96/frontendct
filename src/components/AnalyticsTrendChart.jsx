import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const toRgba = (hex, alpha) => {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(10, 47, 136, ${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const themeTokens = {
  light: {
    text: '#475569',
    muted: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.18)',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(148, 163, 184, 0.24)',
  },
  dark: {
    text: 'rgba(226, 232, 240, 0.82)',
    muted: 'rgba(148, 163, 184, 0.9)',
    grid: 'rgba(148, 163, 184, 0.18)',
    tooltipBg: '#0f172a',
    tooltipBorder: 'rgba(10, 47, 136, 0.28)',
  },
  manager: {
    text: '#64748b',
    muted: '#94a3b8',
    grid: 'rgba(203, 213, 225, 0.46)',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(10, 47, 136, 0.18)',
  },
};

const buildOption = (data, theme = 'light') => {
  const tokens = themeTokens[theme] || themeTokens.light;
  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const datasets = Array.isArray(data?.datasets) ? data.datasets : [];
  const manager = theme === 'manager';

  return {
    animationDuration: 500,
    animationEasing: 'cubicOut',
    grid: {
      left: manager ? 20 : 16,
      right: manager ? 20 : 16,
      top: manager ? 42 : 36,
      bottom: manager ? 14 : 18,
      containLabel: true,
    },
    legend: {
      top: 0,
      left: 0,
      icon: 'circle',
      itemWidth: manager ? 8 : 10,
      itemHeight: manager ? 8 : 10,
      itemGap: manager ? 14 : 18,
      textStyle: {
        color: tokens.text,
        fontSize: manager ? 11 : 12,
        fontWeight: 600,
      },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: '#0f172a',
        fontSize: 12,
      },
      extraCssText: 'border-radius: 14px; box-shadow: none; padding: 12px 14px;',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(10, 47, 136, 0.28)',
          width: 1.5,
        },
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: tokens.text,
        fontSize: manager ? 11 : 12,
        margin: 10,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: tokens.muted,
        fontSize: manager ? 11 : 12,
        margin: 12,
      },
      splitLine: {
        lineStyle: {
          color: tokens.grid,
          type: manager ? [4, 4] : 'solid',
        },
      },
    },
    series: datasets.map((dataset, index) => {
      const color = dataset.borderColor || ['#0a2f88', '#0f766e', '#dc2626'][index % 3];
      const isPrimary = index === 0;

      return {
        name: dataset.label || `Series ${index + 1}`,
        type: 'line',
        smooth: manager ? 0.42 : 0.28,
        showSymbol: !manager,
        symbol: 'circle',
        symbolSize: manager ? 0 : 6,
        emphasis: {
          focus: 'series',
          scale: true,
        },
        lineStyle: {
          color,
          width: manager ? (isPrimary ? 5 : 3.5) : 3,
          cap: 'round',
          join: 'round',
        },
        itemStyle: {
          color,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
        areaStyle: manager && isPrimary
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: toRgba(color, 0.18) },
                  { offset: 1, color: toRgba(color, 0.04) },
                ],
              },
            }
          : undefined,
        data: Array.isArray(dataset.data) ? dataset.data : [],
      };
    }),
  };
};

const AnalyticsTrendChart = ({ data, theme = 'light' }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const option = useMemo(() => buildOption(data, theme), [data, theme]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = echarts.init(containerRef.current, null, { renderer: 'svg' });
    chartRef.current = chart;
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option, true);
      chartRef.current.resize();
    }
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default AnalyticsTrendChart;
