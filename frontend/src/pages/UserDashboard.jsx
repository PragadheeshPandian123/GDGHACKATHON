import Navbar from "../pages/Navbar";
import Sidebar from "../pages/Sidebar";
import { Outlet } from "react-router-dom";

export default function UserDashboard() {
  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
