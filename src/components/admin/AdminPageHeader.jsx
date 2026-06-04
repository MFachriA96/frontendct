import React from 'react';
import './admin.css';

const AdminPageHeader = ({ actions = null, description, title }) => (
  <header className="admin-page-header">
    <div className="admin-page-header__copy">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
  </header>
);

export default AdminPageHeader;
