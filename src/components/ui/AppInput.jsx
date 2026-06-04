import React from 'react';
import './ui.css';

const AppInput = ({
  endAdornment = null,
  icon = null,
  id,
  label,
  link = null,
  wrapperClassName = '',
  ...props
}) => {
  const wrapperClasses = ['app-input', wrapperClassName].filter(Boolean).join(' ');

  return (
    <div className="app-input-field">
      {(label || link) && (
        <div className="app-input-field__header">
          {label ? (
            <label className="app-input-field__label" htmlFor={id}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {link}
        </div>
      )}
      <div className={wrapperClasses}>
        {icon ? <span className="app-input__icon">{icon}</span> : null}
        <input id={id} className="app-input__control" {...props} />
        {endAdornment ? <div className="app-input__end">{endAdornment}</div> : null}
      </div>
    </div>
  );
};

export default AppInput;
