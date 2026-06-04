import React from 'react';
import loginOrnament from '../../assets/image/login-ornament.png';
import './login.css';

const LoginHero = () => (
  <section className="login-hero" aria-label="Brand introduction">
    <div className="login-hero__brand">
      <div className="brand-box">
        <i className="fa-solid fa-truck-fast"></i>
      </div>
      <div className="login-hero__brand-copy">
        <span className="login-hero__brand-name">Evy</span>
      </div>
    </div>

    <div className="login-hero__content">
      <h1>Shipment portal.</h1>
      <p className="login-hero__description">Simple access for your assigned workflow.</p>
    </div>

    <div className="login-hero__ornament-wrap" aria-hidden="true">
      <img className="login-hero__ornament" src={loginOrnament} alt="" />
    </div>
  </section>
);

export default LoginHero;
