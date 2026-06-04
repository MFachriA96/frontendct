import React from 'react';
import './ui.css';

const AppCard = ({ children, className = '' }) => {
  const classes = ['app-card', className].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
};

export default AppCard;
