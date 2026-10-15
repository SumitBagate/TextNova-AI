import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

const Navbar = ({ isLoggedIn, onLogout }) => {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">📊</span>
          <div>
            <span className="logo-name">TextNova AI</span>
            <span className="logo-subtitle">Academic Evaluation System</span>
          </div>
        </Link>

        <div className="navbar-links">
          <Link to="/" className={`nav-item ${isActive("/") ? "active" : ""}`}>
            🏠 Home
          </Link>
          <Link
            to="/converter"
            className={`nav-item ${isActive("/converter") ? "active" : ""}`}
          >
            📄 Document Converter
          </Link>
          {isLoggedIn ? (
            <>
              <span className="nav-divider">|</span>
              <button className="nav-logout" onClick={onLogout}>
                🚪 Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`nav-item ${isActive("/login") ? "active" : ""}`}
            >
              🔐 Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
