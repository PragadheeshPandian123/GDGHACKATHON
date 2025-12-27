import { useEffect, useState } from "react";
import axios from "axios";
import { FileSearch, MapPin, ImageIcon } from "lucide-react";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import ButtonLoader from "../components/ButtonLoader";
import { useSnackbar } from "notistack";

export default function Matches() {
  const [itemType, setItemType] = useState("lost");
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { enqueueSnackbar } = useSnackbar();

  // 🔄 Load user's lost / found items
  useEffect(() => {
    const fetchItems = async () => {
      if (!auth.currentUser) return;

      try {
        setInitialLoading(true);
        const token = await auth.currentUser.getIdToken();

        const res = await axios.get(
          `${backendUrl}/api/${itemType}-items?user_id=${auth.currentUser.uid}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setItems(res.data.items || []);
        setSelectedItemId("");
        setMatches([]);
      } catch (err) {
        console.error(err);
        enqueueSnackbar("Failed to load items", { variant: "error" });
      } finally {
        setInitialLoading(false);
      }
    };

    fetchItems();
  }, [itemType, backendUrl, enqueueSnackbar]);

  // 🔍 Fetch matches
  const fetchMatches = async () => {
    if (!selectedItemId) return;

    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();

      const res = await axios.get(
        `${backendUrl}/api/matches/${itemType}/${selectedItemId}?min_score=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMatches(res.data.matches || []);

      enqueueSnackbar(
        res.data.matches.length > 0
          ? "Matches found successfully"
          : "No matches found yet",
        { variant: "success" }
      );
    } catch (err) {
      console.error(err);
      enqueueSnackbar("Failed to fetch matches", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {(initialLoading || loading) && (
        <LoadingOverlay
          text={initialLoading ? "Loading items..." : "Finding matches..."}
        />
      )}

      <h1 className="text-3xl font-bold text-white mb-6">
        Matches
      </h1>

      {/* Item selector */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-3xl mb-6 space-y-4">

        {/* Lost / Found toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setItemType("lost")}
            className={`px-4 py-2 rounded-lg font-medium ${
              itemType === "lost"
                ? "bg-violet-600 text-white"
                : "bg-gray-700 text-gray-300 hover:text-white"
            }`}
          >
            Lost Items
          </button>

          <button
            onClick={() => setItemType("found")}
            className={`px-4 py-2 rounded-lg font-medium ${
              itemType === "found"
                ? "bg-violet-600 text-white"
                : "bg-gray-700 text-gray-300 hover:text-white"
            }`}
          >
            Found Items
          </button>
        </div>

        {/* Item dropdown */}
        <select
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          className="auth-input"
        >
          <option value="">Select an item</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <button
          onClick={fetchMatches}
          disabled={!selectedItemId || loading}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          {loading ? <ButtonLoader text="Searching..." /> : "Find Matches"}
        </button>
      </div>

      {/* Matches List */}
      <div className="space-y-4 max-w-4xl">
        {!loading &&
          matches.map((match) => {
            const item = match.matched_item;

            return (
              <div
                key={match.match_id}
                className="bg-gray-800 p-6 rounded-xl border border-gray-700 transition hover:border-violet-500"
              >
                <div className="flex gap-4">
                  {/* Image */}
                  <div className="w-24 h-24 bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
                    {item?.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="text-gray-500" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white">
                      {item?.name || "Item"}
                    </h3>

                    <p className="text-gray-400 mt-1">
                      {item?.description}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {item?.location?.lat?.toFixed(3)},
                        {item?.location?.lng?.toFixed(3)}
                      </span>

                      <span className="bg-violet-600 text-white px-3 py-1 rounded-full text-xs">
                        {match.similarity_score}% match
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        {!loading && matches.length === 0 && selectedItemId && (
          <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
            <FileSearch className="mx-auto text-gray-600 mb-4" size={48} />
            <p className="text-gray-400">
              No matches found yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
