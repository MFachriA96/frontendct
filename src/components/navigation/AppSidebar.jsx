import React, { useState } from 'react';
import './app-sidebar.css';

const AppSidebar = ({
  activeValue,
  brand = 'Evy',
  brandMeta,
  className = '',
  items = [],
  onSelect,
  onSignOut,
  sections = [],
  signOutLabel = 'Keluar',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const normalizedSections = sections.length > 0
    ? sections
    : [{ items }];

  return (
    <aside className={`app-shell-sidebar ${isCollapsed ? 'is-collapsed' : ''} ${className}`.trim()}>
      <div className="app-shell-sidebar__brand">
        <button
          type="button"
          className="app-shell-sidebar__brand-trigger"
          onClick={() => {
            if (isCollapsed) {
              setIsCollapsed(false);
            }
          }}
          aria-label={isCollapsed ? 'Buka sidebar' : `Beranda ${brand}`}
          title={isCollapsed ? 'Buka sidebar' : brand}
        >
          <div className="app-shell-sidebar__brand-box">
            <i className="fa-solid fa-truck-fast app-shell-sidebar__brand-icon app-shell-sidebar__brand-icon--default"></i>
            <i className="fa-solid fa-chevron-right app-shell-sidebar__brand-icon app-shell-sidebar__brand-icon--hover"></i>
          </div>
          <div className="app-shell-sidebar__brand-copy">
            <strong>{brand}</strong>
            {brandMeta ? <span>{brandMeta}</span> : null}
          </div>
        </button>

        {!isCollapsed ? (
          <button
            type="button"
            className="app-shell-sidebar__toggle"
            onClick={() => setIsCollapsed(true)}
            aria-label="Tutup sidebar"
            title="Tutup sidebar"
          >
            <i className="fa-solid fa-chevron-left"></i>
          </button>
        ) : null}
      </div>

      <nav className="app-shell-sidebar__nav" aria-label={`Navigasi ${brand}`}>
        {normalizedSections.map((section, sectionIndex) => (
          <div className="app-shell-sidebar__section" key={section.label || sectionIndex}>
            {section.label ? (
              <p className="app-shell-sidebar__section-label">{section.label}</p>
            ) : null}

            <div className="app-shell-sidebar__items">
              {section.items.map((item) => {
                const isActive = activeValue === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`app-shell-sidebar__item ${isActive ? 'is-active' : ''}`}
                    title={item.label}
                    onClick={() => {
                      if (typeof item.onClick === 'function') {
                        item.onClick();
                        return;
                      }
                      onSelect?.(item.value);
                    }}
                  >
                    <i className={item.icon}></i>
                    <span>{item.label}</span>
                    {item.badge ? (
                      <strong className="app-shell-sidebar__badge">{item.badge}</strong>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {onSignOut ? (
        <button
          type="button"
          className="app-shell-sidebar__signout"
          onClick={onSignOut}
          title={signOutLabel}
        >
          <i className="fa-solid fa-right-from-bracket"></i>
          <span>{signOutLabel}</span>
        </button>
      ) : null}
    </aside>
  );
};

export default AppSidebar;
