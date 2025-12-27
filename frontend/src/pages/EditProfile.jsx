import { useEffect, useState } from "react";
import axios from "axios";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import ButtonLoader from "../components/ButtonLoader";
import { useSnackbar } from "notistack";

export default function EditProfile() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
    const { enqueueSnackbar } = useSnackbar();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // 🔄 Load user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await auth.currentUser.getIdToken();

        const res = await axios.get(`${backendUrl}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setFormData({
          name: res.data.user.name || "",
          email: res.data.user.email || "",
          phone: res.data.user.phone || "",
        });
      } catch (err) {
        enqueueSnackbar(err.message,{variant:"error"});
        console.error(err);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchProfile();
  }, [backendUrl]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 💾 Save profile
  const handleSubmit = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();

      await axios.post(
        `${backendUrl}/api/users/register`,
        {
          name: formData.name,
          phone: formData.phone,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (err) {
      enqueueSnackbar(err.message,{variant:"error"});
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {(initialLoading || loading) && (
        <LoadingOverlay
          text={initialLoading ? "Loading profile..." : "Saving changes..."}
        />
      )}

      <h1 className="text-3xl font-bold text-white mb-6">
        Edit Profile
      </h1>

      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-2xl">
        <div className="space-y-4">

          {/* Name */}
          <div>
            <label className="block text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="auth-input"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              disabled
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-gray-300 mb-2">
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="auth-input"
            />
          </div>

          {/* Save */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? <ButtonLoader text="Saving..." /> : "Save Changes"}
          </button>

        </div>
      </div>
    </div>
  );
}
