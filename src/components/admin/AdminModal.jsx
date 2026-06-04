import React from 'react';
import './admin.css';

const AdminModal = ({ children, onClose, title }) => (
  <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="admin-modal__header">
        <h2>{title}</h2>
        <button type="button" className="admin-modal__close" onClick={onClose}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div className="admin-modal__body">{children}</div>
    </div>
  </div>
);

export default AdminModal;
