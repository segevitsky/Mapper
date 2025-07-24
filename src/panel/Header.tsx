import { useState } from "react";
import logoIcon from "../assets/bug.png";
import { User, Settings, HelpCircle, LogOut, Shield, Bell, Download } from 'lucide-react';



type HeaderProps = {
  userDetails: {
    displayName?: string;
    email?: string;
  }
};

const CleanHeaderDemo = (props: HeaderProps) => {
     const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { userDetails } = props;
  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase();
  };

  return (
    <div>
      <div className="flex items-center justify-between text-white p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded backdrop-blur-sm flex items-center justify-center">
           <img src={logoIcon} alt="Indi API" className="w-8 h-8 rounded drop-shadow-lg" />
          </div>
          <h1 className="font-thin text-2xl">
            INDI API
          </h1>
        </div>

        {userDetails?.displayName && (
          <div className="relative">
            <div 
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 cursor-pointer hover:bg-white/30 transition-all duration-200"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}

            >
              <span className="text-white font-semibold text-sm">
                {getInitials(userDetails.displayName)}
              </span>
            </div>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div 
                className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 animate-in slide-in-from-top-2 duration-200"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {getInitials(userDetails.displayName)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{userDetails.displayName}</div>
                      <div className="text-sm text-gray-500">{userDetails.email}</div>
                    </div>
                  </div>
                </div>
                
                {/* Menu Items */}
                <div className="py-1">
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <User className="w-4 h-4 mr-3 text-gray-500" />
                    My Profile
                  </a>
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <Settings className="w-4 h-4 mr-3 text-gray-500" />
                    Extension Settings
                  </a>
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <Bell className="w-4 h-4 mr-3 text-gray-500" />
                    Notifications
                  </a>
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <Download className="w-4 h-4 mr-3 text-gray-500" />
                    Export Data
                  </a>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-100 my-1"></div>
                
                {/* Help & Support Section */}
                <div className="py-1">
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <HelpCircle className="w-4 h-4 mr-3 text-gray-500" />
                    Help & Support (Coming Soon)
                  </a>
                  <a href="https://indi-web.vercel.app/privacy-policy" target="_blank" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                    <Shield className="w-4 h-4 mr-3 text-gray-500" />
                    Privacy Policy 
                  </a>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-100 my-1"></div>
                
                {/* Logout */}
                <div className="py-1" onClick={() => {
                  chrome.storage.local.remove(['userData', 'authToken', 'userSession']);
                }}>
                  <a href="#" className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                    <LogOut className="w-4 h-4 mr-3" />
                    Sign Out
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        
      </div>

      
      
    </div>
  );
};

export default CleanHeaderDemo;