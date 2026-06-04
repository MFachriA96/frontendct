import React from 'react';
import './ui.css';

const AppButton = ({ children, className = '', variant = 'primary', type = 'button', ...props }) => {
  const classes = ['app-button', `app-button--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
};

export default AppButton;
