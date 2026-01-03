import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function ModalOverlay({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = "auto";
  };
}, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => navigate(-1)}
      />

      {/* Modal */}
      <div className="relative z-50 w-full max-w-4xl mx-4">
        <button
          onClick={() => navigate(-1)}
          className="absolute -top-10 right-0 text-gray-300 hover:text-white"
        >
          <X size={28} />
        </button>

        {children}
      </div>
    </div>
  );
}
