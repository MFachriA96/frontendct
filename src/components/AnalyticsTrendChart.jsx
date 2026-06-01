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

const CHART_OPTIONS = {
  responsive: true,
  plugins: {
    legend: { position: 'top' },
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    y: { beginAtZero: true },
  },
};

const AnalyticsTrendChart = ({ data }) => <Line data={data} options={CHART_OPTIONS} />;

export default AnalyticsTrendChart;
