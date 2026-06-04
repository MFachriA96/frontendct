import React from 'react';
import './mobile-ui.css';

const FeedbackBanner = ({ message, title, tone = 'success' }) => (
  <div className={`feedback-banner feedback-banner--${tone}`}>
    <strong>{title}</strong>
    <span>{message}</span>
  </div>
);

export default FeedbackBanner;
