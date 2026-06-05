import React from 'react';
import AppButton from '../ui/AppButton';
import AppInput from '../ui/AppInput';
import './login.css';

const LoginForm = ({
  email,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  password,
  showPassword,
  onTogglePassword,
}) => (
  <section className="login-form-shell" aria-label="Form login">
    <div className="login-form-card">
      <div className="login-form-card__mobile-brand" aria-hidden="true">
        <div className="brand-box">
          <i className="fa-solid fa-truck-fast"></i>
        </div>
      </div>

      <div className="login-form-card__intro">
        <h2>Masuk</h2>
        <p className="login-form-card__subtitle">Gunakan akun yang sudah dibuat admin.</p>
      </div>

      <form className="login-form" onSubmit={onSubmit}>
        <AppInput
          autoComplete="email"
          icon={<i className="fa-solid fa-at"></i>}
          id="login-email"
          label="Email"
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="name@epson.co.id"
          required
          type="email"
          value={email}
        />

        <AppInput
          autoComplete="current-password"
          endAdornment={(
            <button
              type="button"
              className="login-form__password-toggle"
              onClick={onTogglePassword}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          )}
          icon={<i className="fa-solid fa-lock"></i>}
          id="login-password"
          label="Password"
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Masukkan password"
          required
          type={showPassword ? 'text' : 'password'}
          value={password}
        />

        {error ? <div className="login-form__error">{error}</div> : null}

        <AppButton className="login-form__submit" disabled={loading} type="submit">
          {loading ? 'Masuk...' : 'Masuk'}
        </AppButton>
      </form>
    </div>
  </section>
);

export default LoginForm;
