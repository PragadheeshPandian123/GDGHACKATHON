import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";

// Public pages
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";

// Layout
import UserDashboard from "./pages/UserDashboard";

// User pages
import EditProfile from "./pages/EditProfile";
import ReportLostItem from "./pages/ReportLostItem";
import ReportFoundItem from "./pages/ReportFoundItem";
import Matches from "./pages/Matches";
import MyItems from "./pages/MyItems";
import Notifications from "./pages/Notifications";
import DashboardOverview from "./pages/DashboardOverview";
import Chats from "./pages/Chats";
import ChatRoom from "./pages/ChatRoom";
// Admin
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* ===== Public ===== */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />

          {/* ===== User Dashboard ===== */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth allowedRole="user">
                <UserDashboard/>
              </RequireAuth>
            }
          >
            {/* Redirect /dashboard → /dashboard/profile */}
            <Route index element={<DashboardOverview />} />


            <Route path="profile" element={<EditProfile />} />
            <Route path="lost/report" element={<ReportLostItem />} />
            <Route path="found/report" element={<ReportFoundItem />} />
            <Route path="matches" element={<Matches />} />
            <Route path="my-items" element={<MyItems />} />
            <Route path="chats" element={<Chats />} />
            <Route path="chat/:chatId" element={<ChatRoom />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>

          {/* ===== Admin ===== */}
          <Route
            path="/admin"
            element={
              <RequireAuth allowedRole="admin">
                <AdminDashboard />
              </RequireAuth>
            }
          />

          {/* ===== 404 ===== */}
          <Route
            path="*"
            element={<h2 className="text-white p-6">404 - Page Not Found</h2>}
          />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
