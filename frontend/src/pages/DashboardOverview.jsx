import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  FileSearch,
  Bell,
} from "lucide-react";
import axios from "axios";
import { auth } from "../firebase";

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    lost: 0,
    found: 0,
    matches: 0,
    unread: 0,
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = await auth.currentUser.getIdToken();
        const uid = auth.currentUser.uid;

        // Fetch data in parallel
        const [lostRes, foundRes, notifRes] = await Promise.all([
          axios.get(`${backendUrl}/api/lost-items?user_id=${uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${backendUrl}/api/found-items?user_id=${uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${backendUrl}/api/notifications?unread_only=true`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        // Calculate matches count
        let matchCount = 0;

        for (const item of lostRes.data.items || []) {
          const res = await axios.get(
            `${backendUrl}/api/matches/lost/${item.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          matchCount += res.data.matches.length;
        }

        setStats({
          lost: lostRes.data.total || 0,
          found: foundRes.data.total || 0,
          matches: matchCount,
          unread: notifRes.data.notifications.length || 0,
        });
      } catch (err) {
        console.error("Failed to fetch dashboard stats", err);
      }
    };

    fetchStats();
  }, [backendUrl]);

  const cards = [
    {
      label: "Lost Items Reported",
      value: stats.lost,
      icon: AlertTriangle,
      color: "bg-red-600",
    },
    {
      label: "Found Items Reported",
      value: stats.found,
      icon: CheckCircle,
      color: "bg-green-600",
    },
    {
      label: "Matches Found",
      value: stats.matches,
      icon: FileSearch,
      color: "bg-violet-600",
    },
    {
      label: "Unread Notifications",
      value: stats.unread,
      icon: Bell,
      color: "bg-yellow-600",
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-6">
        Dashboard Overview
      </h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex items-center justify-between hover:border-violet-500 transition-all"
            >
              <div>
                <p className="text-gray-400 text-sm">{card.label}</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {card.value}
                </p>
              </div>
              <div
                className={`${card.color} p-3 rounded-xl text-white`}
              >
                <Icon size={28} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity Summary */}
      <div className="mt-10 bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Your Activity Summary
        </h2>

        <ul className="space-y-3 text-gray-300">
          <li>✔ You have reported <b>{stats.lost}</b> lost items</li>
          <li>✔ You have reported <b>{stats.found}</b> found items</li>
          <li>✔ <b>{stats.matches}</b> potential matches were detected</li>
          <li>✔ <b>{stats.unread}</b> notifications need your attention</li>
        </ul>
      </div>
    </div>
  );
}
