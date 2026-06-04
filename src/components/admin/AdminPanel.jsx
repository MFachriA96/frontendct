import React from 'react';
import AppCard from '../ui/AppCard';
import './admin.css';

const AdminPanel = ({ action = null, children, className = '', description = null, title }) => (
  <AppCard className={`admin-panel ${className}`.trim()}>
    <div className="admin-panel__header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
    <div className="admin-panel__body">{children}</div>
  </AppCard>
);

export default AdminPanel;
