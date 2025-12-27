import { Search, Bell, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 via-gray-900 to-purple-900">
      
      {/* Navbar */}
      <nav className="bg-gray-900/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Search className="text-violet-400" size={32} />
              <span className="text-2xl font-bold text-white">FindIt</span>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6">
            Lost Something?
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-600">
              We'll Help You Find It
            </span>
          </h1>

          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Connect with people who found your items or help others reunite with their belongings
          </p>

          <button
            onClick={() => navigate("/login")}
            className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-violet-500/50"
          >
            Start Searching
          </button>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <Feature
            icon={<Search className="text-white" size={24} />}
            title="Easy Search"
            desc="Quickly search through lost and found items with smart filters"
          />
          <Feature
            icon={<Bell className="text-white" size={24} />}
            title="Instant Alerts"
            desc="Get notified when potential matches are found for your items"
          />
          <Feature
            icon={<CheckCircle className="text-white" size={24} />}
            title="Secure Platform"
            desc="Safe and verified connections between finders and owners"
          />
        </div>
      </div>
    </div>
  );
};

const Feature = ({ icon, title, desc }) => (
  <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-xl border border-gray-700 hover:border-violet-500 transition-all duration-300">
    <div className="bg-violet-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-gray-400">{desc}</p>
  </div>
);

export default LandingPage;
