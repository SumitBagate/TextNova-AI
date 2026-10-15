import { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthChange, logoutUser } from "./services/firebaseConfig";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import ConverterPage from "./pages/ConverterPage";
import LoginPage from "./pages/LoginPage";
import "./App.css";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user || null);
      setIsLoggedIn(Boolean(user));
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user || null);
    setIsLoggedIn(Boolean(user));
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (_error) {
      // Fall back to local logout even if Firebase sign-out fails.
    }
    setCurrentUser(null);
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <div className="app">
        <Navbar isLoggedIn={isLoggedIn} onLogout={handleLogout} />

        <Routes>
          <Route
            path="/"
            element={
              <HomePage isLoggedIn={isLoggedIn} currentUser={currentUser} />
            }
          />
          <Route path="/converter" element={<ConverterPage />} />
          <Route
            path="/login"
            element={
              isLoggedIn ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage onAuthSuccess={handleAuthSuccess} />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
