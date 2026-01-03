import { io } from "socket.io-client";
import { auth } from "./firebase";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const createSocket = async () => {
  const token = await auth.currentUser.getIdToken();

  return io(backendUrl, {
    auth: {
      token
    },
    transports: ["websocket"]
  });
};
