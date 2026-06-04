import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const buildChartOptions = (theme = 'light') => {
  const dark = theme === 'dark';
  const axisColor = dark ? 'rgba(226, 232, 240, 0.82)' : '#475569';
  const gridColor = dark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)';
  const tooltipColors = dark
    ? {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(59, 130, 246, 0.32)',
      }
    : {
        backgroundColor: '#ffffff',
        titleColor: '#0f172a',
        bodyColor: '#334155',
        borderColor: 'rgba(148, 163, 184, 0.25)',
      };

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: axisColor,
          usePointStyle: true,
          boxWidth: 10,
          padding: 16,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        borderWidth: 1,
        padding: 12,
        ...tooltipColors,
      },
    },
    scales: {
      x: {
        ticks: { color: axisColor },
        grid: { color: gridColor, drawBorder: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: axisColor },
        grid: { color: gridColor, drawBorder: false },
      },
    },
  };
};

const AnalyticsTrendChart = ({ data, theme = 'light' }) => (
  <Line data={data} options={buildChartOptions(theme)} />
);

export default AnalyticsTrendChart;
