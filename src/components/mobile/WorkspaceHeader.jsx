import React from 'react';
import './mobile-ui.css';

const WorkspaceHeader = ({ actionLabel, onAction, scopeLabel, title }) => (
  <header className="workspace-header">
    <div className="workspace-header__copy">
      <span className="workspace-header__scope">{scopeLabel}</span>
      <h1>{title}</h1>
    </div>
    <button type="button" className="workspace-header__action" onClick={onAction} aria-label={actionLabel}>
      <i className="fa-solid fa-right-from-bracket"></i>
    </button>
  </header>
);

export default WorkspaceHeader;
