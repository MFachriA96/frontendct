import React from 'react';
import AppCard from '../ui/AppCard';
import './mobile-ui.css';

const SectionCard = ({ action = null, children, title }) => (
  <AppCard className="section-card">
    {(title || action) && (
      <div className="section-card__header">
        {title ? <h2>{title}</h2> : <span />}
        {action}
      </div>
    )}
    <div className="section-card__body">{children}</div>
  </AppCard>
);

export default SectionCard;
