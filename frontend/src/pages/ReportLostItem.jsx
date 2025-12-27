import { useState } from "react";
import { Upload, MapPin, Search } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import { useSnackbar } from "notistack";

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Map click marker
const LocationMarker = ({ position, setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position ? <Marker position={position} /> : null;
};

export default function ReportLostItem() {
  const [itemData, setItemData] = useState({
    name: "",
    category: "Other",
    description: "",
    image: null,
  });

  const [position, setPosition] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { enqueueSnackbar } = useSnackbar();

  const handleChange = (e) => {
    setItemData({ ...itemData, [e.target.name]: e.target.value });
  };

  const handleImageUpload = (e) => {
    setItemData({ ...itemData, image: e.target.files[0] });
  };

  // 🔍 Location search (OSM Nominatim)
  const handleLocationSearch = async () => {
    if (!searchQuery) return;

    try {
      const res = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: searchQuery,
            format: "json",
            limit: 1,
          },
        }
      );

      if (res.data.length > 0) {
        const { lat, lon } = res.data[0];
        setPosition({
          lat: parseFloat(lat),
          lng: parseFloat(lon),
        });
      } else {
        enqueueSnackbar("Location not found", { variant: "error" });
      }
    } catch (err) {
      enqueueSnackbar("Failed to search location", { variant: "error" });
    }
  };

  // 📤 Submit lost item
  const handleSubmit = async () => {
    if (!position) {
      enqueueSnackbar("Please pin the lost location on the map", {
        variant: "error",
      });
      return;
    }

    try {
      setLoading(true);
      const token = await auth.currentUser.getIdToken();

      const formData = new FormData();
      formData.append("name", itemData.name);
      formData.append("description", itemData.description);
      formData.append("category", itemData.category);
      formData.append("location_lat", position.lat);
      formData.append("location_lng", position.lng);

      if (itemData.image) {
        formData.append("image", itemData.image);
      }

      await axios.post(`${backendUrl}/api/lost-items`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      enqueueSnackbar("Lost item reported successfully!", {
        variant: "success",
      });

      // Optional reset
      setItemData({
        name: "",
        category: "Other",
        description: "",
        image: null,
      });
      setPosition(null);
      setSearchQuery("");
    } catch (err) {
      console.error(err);
      enqueueSnackbar("Failed to report lost item", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <LoadingOverlay text="Reporting lost item..." />}

      <h1 className="text-3xl font-bold text-white mb-6">
        Report Lost Item
      </h1>

      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-2xl space-y-6">
        {/* Item Name */}
        <div>
          <label className="block text-gray-300 mb-2">
            Item Name
          </label>
          <input
            name="name"
            value={itemData.name}
            onChange={handleChange}
            placeholder="e.g., Black Leather Wallet"
            className="auth-input"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-gray-300 mb-2">
            Category
          </label>
          <select
            name="category"
            value={itemData.category}
            onChange={handleChange}
            className="auth-input"
          >
            <option>Electronics</option>
            <option>Accessories</option>
            <option>Documents</option>
            <option>Bags</option>
            <option>Keys</option>
            <option>Jewelry</option>
            <option>Other</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-gray-300 mb-2">
            Description
          </label>
          <textarea
            name="description"
            rows="4"
            value={itemData.description}
            onChange={handleChange}
            placeholder="Describe your item in detail..."
            className="auth-input"
          />
        </div>

        {/* Search Location */}
        <div>
          <label className="block text-gray-300 mb-2">
            Search Lost Location
          </label>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city or place"
              className="auth-input flex-1"
            />
            <button
              onClick={handleLocationSearch}
              className="bg-violet-600 px-4 rounded-lg text-white"
            >
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Map */}
        <div>
          <label className="block text-gray-300 mb-2">
            Pin Lost Location
          </label>
          <div className="h-64 rounded-lg overflow-hidden border border-gray-700">
            <MapContainer
              center={
                position || { lat: 12.94805, lng: 80.13997 }
              }
              zoom={17}
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationMarker
                position={position}
                setPosition={setPosition}
              />
            </MapContainer>
          </div>

          {position && (
            <p className="text-gray-400 mt-2 text-sm flex items-center gap-2">
              <MapPin size={16} />
              Lat: {position.lat.toFixed(5)}, Lng:{" "}
              {position.lng.toFixed(5)}
            </p>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-gray-300 mb-2">
            Upload Image
          </label>
          <input
            type="file"
            id="imageUpload"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <label
            htmlFor="imageUpload"
            className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-violet-500 cursor-pointer block"
          >
            <Upload
              className="mx-auto text-gray-400 mb-2"
              size={32}
            />
            <p className="text-gray-400">
              {itemData.image
                ? itemData.image.name
                : "Click to upload image"}
            </p>
          </label>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          Report Lost Item
        </button>
      </div>
    </div>
  );
}
