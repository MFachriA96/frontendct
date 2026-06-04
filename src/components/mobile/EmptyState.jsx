import React from 'react';
import './mobile-ui.css';

const EmptyState = ({ description, icon, title }) => (
  <div className="empty-state">
    <i className={icon}></i>
    <strong>{title}</strong>
    <span>{description}</span>
  </div>
);

export default EmptyState;
