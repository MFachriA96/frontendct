import React from 'react';
import './mobile-ui.css';

const ProgressBar = ({ label, value }) => (
  <div className="progress-block">
    <div className="progress-block__label">
      <span>{label}</span>
      <strong>{value}%</strong>
    </div>
    <div className="progress-bar">
      <div className="progress-bar__fill" style={{ width: `${value}%` }}></div>
    </div>
  </div>
);

export default ProgressBar;
