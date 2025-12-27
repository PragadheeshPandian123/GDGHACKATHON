import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // 🔔 Fetch user profile + unread notifications
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = await auth.currentUser.getIdToken();

        // Fetch profile
        const profileRes = await axios.get(
          `${backendUrl}/api/users/profile`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUser(profileRes.data.user);

        // Fetch unread notifications
        const notifRes = await axios.get(
          `${backendUrl}/api/notifications?unread_only=true`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setUnreadCount(notifRes.data.notifications.length || 0);
      } catch (err) {
        console.error("Navbar data fetch failed:", err);
      }
    };

    fetchData();
  }, [backendUrl]);

  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Logo */}
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            <Search className="text-violet-400" size={28} />
            <span className="text-xl font-bold text-white">
              FindIt
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => navigate("/dashboard/notifications")}
                className="relative p-2 text-gray-400 hover:text-white transition-colors"
              >
                <Bell size={24} />

                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-violet-500 rounded-full"></span>
                )}
              </button>
            </div>

            {/* User avatar */}
            <div
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => navigate("/dashboard/profile")}
            >
              <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold">
                  {user?.name
                    ? user.name.substring(0, 2).toUpperCase()
                    : "JD"}
                </span>
              </div>

              <span className="text-white hidden md:block">
                {user?.name || "User"}
              </span>
            </div>

          </div>
        </div>
      </div>
    </nav>
  );
}
