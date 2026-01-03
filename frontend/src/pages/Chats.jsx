import { useEffect, useState } from "react";
import axios from "axios";
import { MessageCircle, ImageIcon, User } from "lucide-react";
import { auth } from "../firebase";
import LoadingOverlay from "../components/LoadingOverlay";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";

export default function Chats() {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchChats = async () => {
            if (!auth.currentUser) return;

            try {
                setLoading(true);
                const token = await auth.currentUser.getIdToken();

                const res = await axios.get(`${backendUrl}/api/chats`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                setChats(res.data.chats || []);
            } catch (err) {
                console.error(err);
                enqueueSnackbar("Failed to load chats", { variant: "error" });
            } finally {
                setLoading(false);
            }
        };

        fetchChats();
    }, [backendUrl, enqueueSnackbar]);

    return (
        <div>
            {loading && <LoadingOverlay text="Loading chats..." />}

            <h1 className="text-3xl font-bold text-white mb-6">
                Chats
            </h1>

            {/* Chats List */}
            <div className="space-y-4 max-w-4xl">
                {!loading &&
                    chats.map((chat) => {
                        const match = chat.match;
                        const otherUser = chat.other_user;

                        return (
                            <div
                                key={chat.chat_id}
                                onClick={() => navigate(`/dashboard/chat/${chat.chat_id}`)}
                                className="cursor-pointer bg-gray-800 p-6 rounded-xl border border-gray-700 transition hover:border-violet-500"
                            >
                                <div className="flex gap-4">
                                    {/* Item Image */}
                                    <div className="w-24 h-24 bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
                                        {match?.matched_item?.image_url ? (
                                            <img
                                                src={match.matched_item.image_url}
                                                alt="Matched Item"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <ImageIcon className="text-gray-500" />
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xl font-semibold text-white">
                                                {match?.matched_item?.name || "Matched Item"}
                                            </h3>

                                            <span className="bg-violet-600 text-white px-3 py-1 rounded-full text-xs">
                                                {match?.similarity_score}% match
                                            </span>
                                        </div>

                                        <p className="text-gray-400 mt-1 line-clamp-2">
                                            {match?.matched_item?.description}
                                        </p>

                                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <User size={14} />
                                                {otherUser?.name || otherUser?.email}
                                            </span>

                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1">
                                                    <MessageCircle size={14} />
                                                    Open Chat
                                                </span>

                                                {chat.unread_count > 0 && (
                                                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                                                        {chat.unread_count}
                                                    </span>
                                                )}
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                {/* Empty State */}
                {!loading && chats.length === 0 && (
                    <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
                        <MessageCircle
                            className="mx-auto text-gray-600 mb-4"
                            size={48}
                        />
                        <p className="text-gray-400">
                            No chats yet. Chats appear automatically when items match.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
