import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoginForm from '../components/login/LoginForm';
import LoginHero from '../components/login/LoginHero';
import { API_BASE_URL } from '../config/api';
import './Login.css';

const getRoleDestination = (role) => {
  const resolvedRole = String(role || '').toLowerCase();

  if (resolvedRole === 'vendor') {
    return {
      path: '/vendor-dashboard',
      message: 'Menyiapkan workspace vendor...',
    };
  }

  if (resolvedRole === 'staff' || resolvedRole === 'petugas' || resolvedRole === 'petugas scan') {
    return {
      path: '/scan-officer-dashboard',
      message: 'Menyiapkan scanner workspace...',
    };
  }

  if (resolvedRole === 'manager') {
    return {
      path: '/manager-dashboard',
      message: 'Menyiapkan dashboard manager...',
    };
  }

  if (resolvedRole === 'admin') {
    return {
      path: '/admin-dashboard',
      message: 'Menyiapkan workspace admin...',
    };
  }

  return null;
};

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('Menyiapkan workspace...');

  useEffect(() => {
    document.querySelectorAll('.modal-overlay, .scanner-overlay').forEach((node) => {
      node.remove();
    });
    document.body.style.overflow = '';

    const loginNotice = sessionStorage.getItem('loginNotice');
    if (loginNotice) {
      setError(loginNotice);
      sessionStorage.removeItem('loginNotice');
    }
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    setTransitioning(false);
    let keepBusyState = false;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        { email, password },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const token = response.data?.data?.token;
      const user = response.data?.data?.user;

      if (!token || !user) {
        throw new Error('Respons login dari server tidak sesuai.');
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      const destination = getRoleDestination(user.role);

      if (destination) {
        keepBusyState = true;
        setTransitionMessage(destination.message);
        setTransitioning(true);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        navigate(destination.path);
        return;
      }

      setError(`Role ${user.role || 'akun ini'} belum punya tujuan halaman.`);
    } catch (err) {
      setTransitioning(false);
      const apiMessage = err.response?.data?.message;
      const validationErrors = err.response?.data?.errors;
      const firstValidationError = validationErrors ? Object.values(validationErrors).flat()[0] : null;

      setError(firstValidationError || apiMessage || err.message || 'Login gagal. Cek lagi email dan password kamu.');
    } finally {
      if (!keepBusyState) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__layout">
        <LoginHero />
        <LoginForm
          email={email}
          error={error}
          loading={loading}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleLogin}
          onTogglePassword={() => setShowPassword((current) => !current)}
          password={password}
          showPassword={showPassword}
          transitioning={transitioning}
        />
      </div>
      {transitioning ? (
        <div className="login-page__handoff" aria-live="polite" aria-busy="true">
          <div className="login-page__handoff-card">
            <div className="login-page__handoff-spinner">
              <i className="fa-solid fa-spinner fa-spin"></i>
            </div>
            <strong>{transitionMessage}</strong>
            <span>Mohon tunggu, sistem sedang membuka halaman sesuai peran akunmu.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Login;
