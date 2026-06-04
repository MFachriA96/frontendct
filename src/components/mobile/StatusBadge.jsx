import React from 'react';
import './mobile-ui.css';

const StatusBadge = ({ label, tone = 'neutral' }) => (
  <span className={`status-badge status-badge--${tone}`}>{label}</span>
);

export default StatusBadge;
