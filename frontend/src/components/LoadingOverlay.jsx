export default function LoadingOverlay({ text = "Loading..." }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />

        <p className="text-white text-lg font-medium">
          {text}
        </p>
      </div>
    </div>
  );
}
