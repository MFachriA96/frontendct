import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Defensive cleanup: the login page should never keep dashboard overlays alive.
    document.querySelectorAll('.modal-overlay, .scanner-overlay').forEach((node) => {
      node.remove();
    });
    document.body.style.overflow = '';
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        {
          email,
          password,
        },
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

      const resolvedRole = String(user.role || role).toLowerCase();

      if (resolvedRole === 'vendor') {
        navigate('/vendor-dashboard');
      } else if (resolvedRole === 'staff' || resolvedRole === 'petugas' || resolvedRole === 'petugas scan') {
        navigate('/scan-officer-dashboard');
      } else if (resolvedRole === 'manager') {
        navigate('/manager-dashboard');
      } else if (resolvedRole === 'admin') {
        navigate('/admin-dashboard');
      } else {
        // Placeholder for other dashboards
        alert(`Logged in as ${user.role || role}`);
      }
    } catch (err) {
      const apiMessage = err.response?.data?.message;
      const validationErrors = err.response?.data?.errors;
      const firstValidationError = validationErrors
        ? Object.values(validationErrors).flat()[0]
        : null;

      setError(firstValidationError || apiMessage || err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Animated Aurora Background */}
      <div className="aurora-wrap">
        <div className="aurora-base"></div>
        <div className="aurora-moving"></div>
        <div className="aurora-blobs">
          <div className="blob b1"></div>
          <div className="blob b2"></div>
          <div className="blob b3"></div>
          <div className="blob b4"></div>
        </div>
        <div className="left-aurora-streak"></div>
      </div>

      <div className="layout-inner">
        {/* Left Side: Hero */}
        <section className="hero-section">
          <div className="brand">
            <div className="brand-box">
              <i className="fa-solid fa-truck-fast"></i>
            </div>
            <span>PT. Epson Indonesia</span>
          </div>

          <div className="hero-text">
            <h1>Logistik Masa<br />Depan, Presisi<br />Digital</h1>
            <p>
              Sistem verifikasi pengiriman terintegrasi untuk<br />
              efisiensi operasional dan akurasi data yang baik.
            </p>
          </div>
        </section>

        {/* Right Side: Login Panel */}
        <section className="login-panel">
          <div className="panel-content">
            <h2 className="title">Selamat Datang</h2>
            <p className="subtitle">Masuk ke Epson Logistics Portal</p>

            <div className="label">PILIH PERAN PENGGUNA</div>

            <div className="role-grid">
              {['Manager', 'Staff', 'Vendor'].map((r) => (
                <button
                  key={r}
                  className={`role-btn ${role === r ? 'active' : ''}`}
                  type="button"
                  onClick={() => setRole(r)}
                >
                  {r === 'Manager' && <i className="fa-solid fa-users-gear"></i>}
                  {r === 'Staff' && <i className="fa-solid fa-clipboard-user"></i>}
                  {r === 'Vendor' && <i className="fa-solid fa-truck"></i>}
                  {r}
                </button>
              ))}
            </div>

            <form onSubmit={handleLogin}>
              <div className="field-block">
                <div className="field-top">
                  <label className="field-label">USERNAME ATAU EMAIL</label>
                </div>
                <div className="input-wrap">
                  <div className="input-icon">
                    <i className="fa-solid fa-at"></i>
                  </div>
                  <input
                    type="email"
                    placeholder="john.doe@epson.co.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field-block">
                <div className="field-top">
                  <label className="field-label">KATA SANDI</label>
                  <a href="#" className="field-link">Lupa Kata Sandi?</a>
                </div>
                <div className="input-wrap">
                  <div className="input-icon">
                    <i className="fa-solid fa-lock"></i>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="toggle-pass" onClick={() => setShowPassword(!showPassword)}>
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="check-row">
                <input type="checkbox" id="remember" />
                <label htmlFor="remember">Ingat saya di perangkat ini</label>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Logging in...' : 'Masuk ke Sistem'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
