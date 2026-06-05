import React from 'react';
import './mobile-ui.css';

const BottomNav = ({ items, value, prominentValue }) => (
  <nav className="mobile-bottom-nav" aria-label="Navigasi receiving">
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        className={`mobile-bottom-nav__item ${value === item.value ? 'is-active' : ''} ${prominentValue === item.value ? 'is-prominent' : ''}`}
        onClick={item.onClick}
        aria-label={item.label}
      >
        <i className={item.icon}></i>
        <span>{item.label}</span>
      </button>
    ))}
  </nav>
);

export default BottomNav;
