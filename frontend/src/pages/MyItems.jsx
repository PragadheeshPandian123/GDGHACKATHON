import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import { useSnackbar } from "notistack";

export default function MyItems() {
  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [activeTab, setActiveTab] = useState("lost");
  const [loading, setLoading] = useState(true);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { enqueueSnackbar } = useSnackbar();

  // 🔹 Load user's items
  const fetchMyItems = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();
      const uid = auth.currentUser.uid;

      const [lostRes, foundRes] = await Promise.all([
        axios.get(`${backendUrl}/api/lost-items?user_id=${uid}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${backendUrl}/api/found-items?user_id=${uid}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setLostItems(lostRes.data.items || []);
      setFoundItems(foundRes.data.items || []);
    } catch (err) {
      enqueueSnackbar("Failed to load your items", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 🗑️ Delete item
  const deleteItem = async (type, id) => {
    try {
      const token = await auth.currentUser.getIdToken();

      await axios.delete(
        `${backendUrl}/api/${type}-items/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (type === "lost") {
        setLostItems(prev => prev.filter(i => i.id !== id));
      } else {
        setFoundItems(prev => prev.filter(i => i.id !== id));
      }

      enqueueSnackbar("Item deleted successfully", { variant: "success" });
    } catch (err) {
      enqueueSnackbar("Failed to delete item", { variant: "error" });
    }
  };

  useEffect(() => {
    fetchMyItems();
  }, []);

  const items = activeTab === "lost" ? lostItems : foundItems;

  return (
    <div>
      {loading && <LoadingOverlay text="Loading your items..." />}

      <h1 className="text-3xl font-bold text-white mb-6">
        My Items
      </h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("lost")}
          className={`px-4 py-2 rounded-lg text-sm transition ${
            activeTab === "lost"
              ? "bg-violet-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          <AlertTriangle size={16} className="inline mr-2" />
          Lost Items
        </button>

        <button
          onClick={() => setActiveTab("found")}
          className={`px-4 py-2 rounded-lg text-sm transition ${
            activeTab === "found"
              ? "bg-violet-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          <CheckCircle size={16} className="inline mr-2" />
          Found Items
        </button>
      </div>

      {/* Items */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map(item => (
          <div
            key={item.id}
            className="bg-gray-800 border border-gray-700 rounded-xl p-5 transition hover:border-violet-500"
          >
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.name}
                className="h-40 w-full object-cover rounded-lg mb-4"
              />
            )}

            <h3 className="text-white font-semibold text-lg">
              {item.name}
            </h3>

            <p className="text-gray-400 text-sm mt-2 line-clamp-3">
              {item.description}
            </p>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {activeTab === "lost" ? "Lost" : "Found"}
              </span>

              <button
                onClick={() => deleteItem(activeTab, item.id)}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="bg-gray-800 p-10 rounded-lg border border-gray-700 text-center mt-8">
          <p className="text-gray-400">
            No {activeTab} items found
          </p>
        </div>
      )}
    </div>
  );
}
