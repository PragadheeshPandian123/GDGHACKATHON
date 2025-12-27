import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import LoadingOverlay from "../components/LoadingOverlay";
import ButtonLoader from "../components/ButtonLoader";
import { useSnackbar } from "notistack";



const AuthPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();

  const [authMode, setAuthMode] = useState("signin");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { enqueueSnackbar } = useSnackbar();


  // 🔁 Redirect if already logged in
  useEffect(() => {
    if (role === "admin") navigate("/admin");
    if (role === "user") navigate("/dashboard");
  }, [role, navigate]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🔗 Sync user profile to backend
  const syncProfile = async (user, isRegister = false) => {
    const token = await user.getIdToken();

    await axios.post(
      `${backendUrl}/api/users/register`,
      isRegister
        ? { name: formData.name, phone: formData.phone }
        : {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  };

  // 📧 Email auth
  const handleEmailAuth = async () => {
    try {
      setLoading(true);

      if (authMode === "signin") {
        const res = await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        await syncProfile(res.user);
        enqueueSnackbar("Signed in successfully!", { variant: "success" });
      } else {
        const res = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        await syncProfile(res.user, true);
        enqueueSnackbar("Account created successfully!", { variant: "success" });
      }
    } catch (err) {
      enqueueSnackbar(err.message, { variant: "error" });
    } finally {
      setLoading(false);
    }
  };


  // 🔵 Google auth
  const handleGoogleAuth = async () => {
  try {
    setLoading(true);
    const res = await signInWithPopup(auth, googleProvider);
    await syncProfile(res.user, authMode === "signup");

    enqueueSnackbar("Google authentication successful!", {
      variant: "success",
    });
  } catch (err) {
    enqueueSnackbar(err.message, { variant: "error" });
  } finally {
    setLoading(false);
  }
};


  return (

    <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-900 to-purple-900 flex items-center justify-center px-4">
      {loading && <LoadingOverlay text="Authenticating..." />}
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Search className="text-violet-400" size={40} />
            <span className="text-3xl font-bold text-white">FindIt</span>
          </div>
          <p className="text-gray-400">
            {authMode === "signin"
              ? "Welcome back! Please sign in"
              : "Join our community today"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm p-8 rounded-2xl border border-gray-700 shadow-xl">
          {/* Toggle */}
          <div className="flex bg-gray-900 rounded-lg p-1 mb-6">
            <button
              onClick={() => setAuthMode("signin")}
              className={`flex-1 py-2 rounded-md font-medium transition-all ${authMode === "signin"
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white"
                }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2 rounded-md font-medium transition-all ${authMode === "signup"
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white"
                }`}
            >
              Sign Up
            </button>
          </div>

          {/* Signup-only fields */}
          {authMode === "signup" && (
            <>
              <div className="mb-4">
                <label className="block text-gray-300 mb-2">Full Name</label>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="auth-input"
                  placeholder="John Doe"
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-300 mb-2">Phone</label>
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="auth-input"
                  placeholder="9876543210"
                />
              </div>
            </>
          )}

          {/* Common fields */}
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Email</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              className="auth-input"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-300 mb-2">Password</label>
            <input
              name="password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              className="auth-input"
              placeholder="••••••••"
            />
          </div>

          {/* Buttons */}
          {/* <button
            onClick={handleEmailAuth}
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg font-semibold transition-all hover:scale-105"
          >
            {authMode === "signin" ? "Sign In" : "Create Account"}
          </button> */}
          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg font-semibold transition-all hover:scale-105 disabled:opacity-60"
          >
            {loading ? (
              <ButtonLoader
                text={authMode === "signin" ? "Signing In..." : "Creating Account..."}
              />
            ) : authMode === "signin" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>


          {/* <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full mt-4 bg-gray-900 border border-gray-700 text-white py-3 rounded-lg hover:border-violet-500 transition-all"
          >
            Continue with Google
          </button> */}

          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full mt-4 flex items-center justify-center gap-3 bg-gray-900 border border-gray-700 text-white py-3 rounded-lg hover:border-violet-500 transition-all disabled:opacity-60"
          >
            {loading ? (
              <ButtonLoader text="Connecting..." />
            ) : (
              <>
                {/* Google Logo */}
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.3l8.4 6.5C13 13 18.1 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.5c-.5 2.9-2 5.3-4.3 6.9l6.6 5.1c3.9-3.6 6.3-8.9 6.3-15.7z" />
                  <path fill="#FBBC05" d="M10.9 28.8c-1-2.9-1-6.1 0-9l-8.4-6.5c-3.7 7.4-3.7 16.1 0 23.5l8.4-6.5z" />
                  <path fill="#34A853" d="M24 48c6.4 0 11.8-2.1 15.7-5.7l-6.6-5.1c-1.8 1.2-4.2 2-9.1 2-5.9 0-11-3.5-13-8.4l-8.4 6.5C6.5 42.6 14.6 48 24 48z" />
                </svg>

                <span>Continue with Google</span>
              </>
            )}
          </button>



          <button
            onClick={() => navigate("/")}
            className="w-full mt-4 text-gray-400 hover:text-white"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
