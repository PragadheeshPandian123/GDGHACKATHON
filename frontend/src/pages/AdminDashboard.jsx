import { useAuth } from "../context/AuthContext";
import LogoutButton from "../components/LogoutButton.jsx";

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>👋 Hi Admin</h1>
      <p>Welcome to the admin panel</p>

      <hr />

      <p><strong>Email:</strong> {user?.email}</p>
      <p><strong>Role:</strong> admin</p>
      <LogoutButton />
    </div>
  );
}
