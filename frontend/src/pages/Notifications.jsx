import { useEffect, useState } from "react";
import axios from "axios";
import { Bell, AlertCircle, CheckCircle } from "lucide-react";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import { useSnackbar } from "notistack";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { enqueueSnackbar } = useSnackbar();

  // 🕒 Format Firestore timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);
    return date.toLocaleString();
  };

  // 🔔 Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();

      const res = await axios.get(
        `${backendUrl}/api/notifications`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error(err);
      enqueueSnackbar("Failed to load notifications", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // 📌 Mark notification as read
  const markAsRead = async (id) => {
    try {
      const token = await auth.currentUser.getIdToken();

      await axios.patch(
        `${backendUrl}/api/notifications/${id}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === id ? { ...notif, read: true } : notif
        )
      );
    } catch (err) {
      console.error(err);
      enqueueSnackbar("Failed to mark notification as read", {
        variant: "error",
      });
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  return (
    <div>
      {loading && <LoadingOverlay text="Loading notifications..." />}

      <h1 className="text-3xl font-bold text-white mb-6">
        Notifications
      </h1>

      <div className="space-y-4">
        {/* Notifications */}
        {!loading &&
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-gray-800 p-4 rounded-lg border transition-all duration-300 ${
                !notification.read
                  ? "border-violet-500"
                  : "border-gray-700"
              }`}
            >
              <div className="flex items-start space-x-3">
                <div
                  className={`p-2 rounded-lg ${
                    !notification.read
                      ? "bg-violet-600"
                      : "bg-gray-700"
                  }`}
                >
                  {!notification.read ? (
                    <AlertCircle size={20} className="text-white" />
                  ) : (
                    <CheckCircle size={20} className="text-white" />
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-white">
                    {notification.message}
                  </p>

                  <p className="text-gray-400 text-sm mt-1">
                    {formatTime(notification.created_at)}
                  </p>

                  {!notification.read && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="text-violet-400 text-sm mt-2 hover:text-violet-300"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

        {/* Empty state */}
        {!loading && notifications.length === 0 && (
          <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
            <Bell
              className="mx-auto text-gray-600 mb-4"
              size={48}
            />
            <p className="text-gray-400">
              No notifications yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
