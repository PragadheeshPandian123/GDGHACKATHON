import { useEffect, useState, useRef } from "react";
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
  MessageSquare,Package
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { createSocket } from "../socket";

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  const socketRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // 🔔 Fetch unread notifications
  const fetchNotificationUnread = async () => {
    try {
      if (!auth.currentUser) return;

      const token = await auth.currentUser.getIdToken();
      const res = await axios.get(
        `${backendUrl}/api/notifications?unread_only=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotifUnread(res.data.notifications?.length || 0);
    } catch (err) {
      console.error("Notification unread fetch failed", err);
    }
  };

  // 💬 Fetch unread chat messages
  const fetchChatUnread = async () => {
    try {
      if (!auth.currentUser) return;

      const token = await auth.currentUser.getIdToken();
      const res = await axios.get(
        `${backendUrl}/api/chats`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let unread = 0;

      res.data.chats.forEach(chat => {
        if (chat.unread_count) unread += chat.unread_count;
      });

      setChatUnread(unread);
    } catch (err) {
      console.error("Chat unread fetch failed", err);
    }
  };

  // 🔌 Auth + Socket setup
  useEffect(() => {
    let socket;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      await fetchNotificationUnread();
      await fetchChatUnread();

      socket = await createSocket();
      socketRef.current = socket;

      socket.on("new_notification", () => {
        fetchNotificationUnread();
      });

      socket.on("notification_read", () => {
        fetchNotificationUnread();
      });

      socket.on("receive_message", () => {
        fetchChatUnread();
      });
    });

    return () => {
      socket?.disconnect();
      unsubscribe();
    };
  }, []);

  const menuItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { label: "Report Lost Item", icon: AlertTriangle, path: "/dashboard/lost/report" },
    { label: "Report Found Item", icon: CheckCircle, path: "/dashboard/found/report" },
    { label: "Matches", icon: FileSearch, path: "/dashboard/matches" },
    {
  label: "My Items",
  icon: Package,
  path: "/dashboard/my-items",
}
,
    {
      label: "Chats",
      icon: MessageSquare,
      path: "/dashboard/chats",
      badge: chatUnread
    },
    {
      label: "Notifications",
      icon: Bell,
      path: "/dashboard/notifications",
      badge: notifUnread
    },
    { label: "Edit Profile", icon: User, path: "/dashboard/profile" }
  ];

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <aside
      className={`${sidebarOpen ? "w-64" : "w-20"} bg-gray-800 min-h-screen border-r border-gray-700 transition-all duration-300 flex flex-col`}
    >
      {/* Toggle */}
      <div className="flex justify-end p-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700"
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
  className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
    isActive
      ? "bg-violet-600 text-white"
      : "text-gray-400 hover:bg-gray-700 hover:text-white"
  }`}
>
  {/* Icon (always visible) */}
  <Icon size={20} />

  {/* Label (only when expanded) */}
  {sidebarOpen && (
    <span className="flex-1 text-left">
      {item.label}
    </span>
  )}

  {/* Badge (visible in BOTH states) */}
  {item.badge > 0 && (
    <span
      className={`
        absolute top-2 right-2
        bg-violet-600 text-white text-xs
        min-w-[20px] px-2 py-0.5
        rounded-full text-center
      `}
    >
      {item.badge}
    </span>
  )}
</button>

          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-gray-700 hover:text-red-300"
        >
          <LogOut size={20} />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
