import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { auth } from "../firebase";
import axios from "axios";
import ButtonLoader from "../components/ButtonLoader";
import ModalOverlay from "../components/ModalOverlay";
import { useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { createSocket } from "../socket";

export default function ChatRoom() {
    const { chatId } = useParams();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);

    const socketRef = useRef(null);
    const bottomRef = useRef(null);
    const sendingRef = useRef(false);

    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const { enqueueSnackbar } = useSnackbar();


    const formatTime = (sent_at) => {
  if (!sent_at) return "";

  // Firestore Timestamp instance
  if (sent_at.toDate) {
    return sent_at.toDate().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // Firestore serialized timestamp
  if (sent_at.seconds) {
    return new Date(sent_at.seconds * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // ISO string
  if (typeof sent_at === "string") {
    return new Date(sent_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return "";
};
// console.log("sent_at:", msg.sent_at);



    // 🔹 Load previous messages (REST - ONCE)
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const token = await auth.currentUser.getIdToken();
                const res = await axios.get(
                    `${backendUrl}/api/chats/${chatId}/messages`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                setMessages(res.data.messages || []);
            } catch (err) {
                enqueueSnackbar("Failed to load messages", { variant: "error" });
            }
        };

        loadMessages();
    }, [chatId]);

    // 🔹 Socket connection
    useEffect(() => {
  let socket;

  const handleReceive = (msg) => {
    setMessages((prev) => {
      if (prev.some((m) => m.message_id === msg.message_id)) {
        return prev;
      }
      return [...prev, msg];
    });
  };

  const connect = async () => {
    socket = await createSocket();
    socketRef.current = socket;

    socket.emit("join_chat", chatId);
    socket.on("receive_message", handleReceive);
  };

  connect();

  return () => {
    socket?.off("receive_message", handleReceive);
    socket?.disconnect();
  };
}, [chatId]);


    // 🔹 Scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // 🔹 Send message
    const sendMessage = () => {
  if (!text.trim()) return;
  if (!socketRef.current) return;
  if (sendingRef.current) return; // 🔒 hard lock

  sendingRef.current = true;

  socketRef.current.emit("send_message", {
    chatId,
    text
  });

  setText("");

  // release lock after a short delay
  setTimeout(() => {
    sendingRef.current = false;
  }, 200);
};



    return (
        <ModalOverlay>
            <div className="bg-gray-900 border border-gray-700 rounded-xl h-[80vh] flex flex-col shadow-2xl">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-700 text-white font-semibold">
                    Chat
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((msg) => {
                        const isMe = msg.sender_id === auth.currentUser.uid;

                        return (
                            <div
                                key={msg.message_id}
                                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-xs md:max-w-md px-4 py-3 rounded-xl text-sm ${isMe
                                            ? "bg-violet-600 text-white rounded-br-none"
                                            : "bg-gray-700 text-gray-200 rounded-bl-none"
                                        }`}
                                >
                                    {msg.text}
                                    <div className="text-[10px] text-gray-300 mt-1 text-right">
                                        {formatTime(msg.sent_at)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-700 flex gap-3">
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type a message..."
                        className="auth-input flex-1"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                    />

                    <button
                        onClick={sendMessage}
                        disabled={sending}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-5 rounded-lg"
                    >
                        {sending ? <ButtonLoader /> : <Send size={18} />}
                    </button>
                </div>

            </div>
        </ModalOverlay>
    );
}
