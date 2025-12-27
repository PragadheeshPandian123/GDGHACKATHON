import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  AlertTriangle,
  CheckCircle,
  Bell,
  FileSearch,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // 🔔 Fetch unread notifications safely
  useEffect(() => {
    const fetchUnread = async () => {
      if (!auth.currentUser) return;

      try {
        const token = await auth.currentUser.getIdToken();
        const res = await axios.get(
          `${backendUrl}/api/notifications?unread_only=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setUnreadCount(res.data.notifications?.length || 0);
      } catch (err) {
        console.error("Failed to fetch unread notifications", err);
      }
    };

    fetchUnread();
  }, [backendUrl]);

  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      label: "Report Lost Item",
      icon: AlertTriangle,
      path: "/dashboard/lost/report",
    },
    {
      label: "Report Found Item",
      icon: CheckCircle,
      path: "/dashboard/found/report",
    },
    {
      label: "Matches",
      icon: FileSearch,
      path: "/dashboard/matches",
    },
    {
      label: "Notifications",
      icon: Bell,
      path: "/dashboard/notifications",
      badge: unreadCount,
    },
    {
      label: "Edit Profile",
      icon: User,
      path: "/dashboard/profile",
    },
  ];

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <aside
      className={`${sidebarOpen ? "w-64" : "w-20"
        } bg-gray-800 min-h-screen border-r border-gray-700 transition-all duration-300 flex flex-col`}
    >
      {/* Toggle Button (ChatGPT-style) */}
      <div className="flex justify-end p-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
        >
          {sidebarOpen ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </div>

      {/* Menu */}
      <nav className="px-4 space-y-2 flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${isActive
                  ? "bg-violet-600 text-white"
                  : "text-gray-400 hover:bg-gray-700 hover:text-white"
                }`}
            >
              <Icon size={20} />

              {sidebarOpen && (
                <div className="flex items-center justify-between flex-1">
                  <span>{item.label}</span>

                  {item.badge > 0 && (
                    <span className="bg-violet-600 text-white text-xs px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-gray-700 hover:text-red-300 transition"
        >
          <LogOut size={20} />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
