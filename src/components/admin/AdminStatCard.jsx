import React from 'react';
import AppCard from '../ui/AppCard';
import './admin.css';

const AdminStatCard = ({ className = '', compact = false, icon, label, meta, value }) => (
  <AppCard className={`admin-stat-card ${compact ? 'admin-stat-card--compact' : ''} ${className}`.trim()}>
    <div className="admin-stat-card__top">
      <span>{label}</span>
      <i className={icon}></i>
    </div>
    <strong>{value}</strong>
    {meta ? <p>{meta}</p> : null}
  </AppCard>
);

export default AdminStatCard;
