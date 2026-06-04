import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoginForm from '../components/login/LoginForm';
import LoginHero from '../components/login/LoginHero';
import { API_BASE_URL } from '../config/api';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.querySelectorAll('.modal-overlay, .scanner-overlay').forEach((node) => {
      node.remove();
    });
    document.body.style.overflow = '';
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

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
        throw new Error('Unexpected login response from server.');
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      const resolvedRole = String(user.role || '').toLowerCase();

      if (resolvedRole === 'vendor') {
        navigate('/vendor-dashboard');
        return;
      }

      if (resolvedRole === 'staff' || resolvedRole === 'petugas' || resolvedRole === 'petugas scan') {
        navigate('/scan-officer-dashboard');
        return;
      }

      if (resolvedRole === 'manager') {
        navigate('/manager-dashboard');
        return;
      }

      if (resolvedRole === 'admin') {
        navigate('/admin-dashboard');
        return;
      }

      alert(`Logged in as ${user.role || 'unknown role'}`);
    } catch (err) {
      const apiMessage = err.response?.data?.message;
      const validationErrors = err.response?.data?.errors;
      const firstValidationError = validationErrors ? Object.values(validationErrors).flat()[0] : null;

      setError(firstValidationError || apiMessage || err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
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
        />
      </div>
    </div>
  );
};

export default Login;
