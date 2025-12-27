import { Loader2 } from "lucide-react";

export default function ButtonLoader({ text }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <Loader2 size={18} className="animate-spin" />
      {text}
    </span>
  );
}
    