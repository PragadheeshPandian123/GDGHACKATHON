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
  const formatTime = (created_at) => {
  if (!created_at) return "";

  if (created_at.seconds) {
    return new Date(created_at.seconds * 1000).toLocaleString();
  }

  return new Date(created_at).toLocaleString();
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

  const deleteAllNotifications = async () => {
  try {
    const token = await auth.currentUser.getIdToken();
    console.log(backendUrl);
    await axios.delete(
      `${backendUrl}/api/notifications/delete-all`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    setNotifications([]);
    enqueueSnackbar("All notifications deleted", { variant: "success" });
  } catch (err) {
    console.error(err);
    enqueueSnackbar("Failed to delete notifications", {
      variant: "error",
    });
  }
};

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllAsRead = async () => {
  try {
    const token = await auth.currentUser.getIdToken();

    await axios.patch(
      `${backendUrl}/api/notifications/read-all`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );

    enqueueSnackbar("All notifications marked as read", {
      variant: "success",
    });
  } catch (err) {
    enqueueSnackbar("Failed to mark all as read", {
      variant: "error",
    });
  }
};

  return (
    <div>
      {loading && <LoadingOverlay text="Loading notifications..." />}

      <h1 className="text-3xl font-bold text-white mb-6">
        Notifications
      </h1>
      
{notifications.length > 0 && (
  <div className="flex items-center justify-between mb-6 gap-4">
    
    {/* Left side */}
    <div>
      {notifications.some(n => !n.read) && (
        <button
          onClick={markAllAsRead}
          className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition"
        >
          Mark all as read
        </button>
      )}
    </div>

    {/* Right side */}
    <div>
      <button
        onClick={deleteAllNotifications}
        className="text-sm bg-gray-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition"
      >
        Delete all
      </button>
    </div>

  </div>
)}



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
