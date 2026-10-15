import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  registerUser,
  loginUser,
  loginWithGoogle,
} from "../services/firebaseConfig";
import "./LoginPage.css";

const LoginPage = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");
  const navigate = useNavigate();

  const validateForm = () => {
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;

    setLoading(true);
    try {
      let user = null;
      if (mode === "signup") {
        user = await registerUser(email, password);
      } else {
        user = await loginUser(email, password);
      }

      if (onAuthSuccess) {
        onAuthSuccess(user);
      }
      navigate("/");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      if (onAuthSuccess) {
        onAuthSuccess(user);
      }
      navigate("/");
    } catch (err) {
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="auth-header">
            <h2>{mode === "login" ? "Welcome Back" : "Create Account"}</h2>
            <p>
              {mode === "login"
                ? "Sign in to access the grading system"
                : "Sign up to get started"}
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleEmailAuth} className="auth-form">
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {mode === "signup" && (
              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <button
            className="btn-google"
            onClick={handleGoogleAuth}
            disabled={loading}
          >
            <span className="google-icon">🔐</span>
            Continue with Google
          </button>

          <div className="auth-toggle">
            <span>
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
              className="toggle-link"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>

        <div className="login-info">
          <div className="info-card">
            <span className="info-icon">📊</span>
            <h4>AI Grading System</h4>
            <p>Automated answer sheet evaluation with AI analysis</p>
          </div>

          <div className="info-card">
            <span className="info-icon">📄</span>
            <h4>Document Converter</h4>
            <p>Convert PDFs and images to editable documents</p>
          </div>

          <div className="info-card">
            <span className="info-icon">🧠</span>
            <h4>AI Tools</h4>
            <p>Summarization, quiz generation, and analysis</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
