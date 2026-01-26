import { useState, useRef, useEffect } from "react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { userDetails } = props;

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleExportingData = () => {
    chrome.storage.local.get(['indicators'], (res) => {
      const indicators = res.indicators || {};
      const dataToExport = JSON.stringify(indicators, null, 2);
      const blob = new Blob([dataToExport], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'indi-api-data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform duration-300">
           <img src={logoIcon} alt="Indi API" className="w-8 h-8 rounded drop-shadow-lg" />
          </div>
          <h1 className="font-headline font-bold text-3xl text-white drop-shadow-lg">
            INDI MAPPER
          </h1>
        </div>

        {userDetails?.displayName && (
          <div className="relative" ref={dropdownRef}>
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
                  <a
                    href="https://indi-web.vercel.app/login"
                    target="_blank"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <User className="w-4 h-4 mr-3 text-gray-500" />
                    My Profile
                  </a>
                  <a
                    href="https://indi-web.vercel.app/login"
                    target="_blank"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Settings className="w-4 h-4 mr-3 text-gray-500" />
                    Extension Settings
                  </a>
                  <a
                    href="#"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Bell className="w-4 h-4 mr-3 text-gray-500" />
                    Notifications
                  </a>
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      handleExportingData();
                      setIsDropdownOpen(false);
                    }}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 mr-3 text-gray-500" />
                    Export Data
                  </a>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-100 my-1"></div>
                
                {/* Help & Support Section */}
                <div className="py-1">
                  <a
                    href="#"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <HelpCircle className="w-4 h-4 mr-3 text-gray-500" />
                    Help & Support (Coming Soon)
                  </a>
                  <a
                    href="https://indi-web.vercel.app/privacy-policy"
                    target="_blank"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Shield className="w-4 h-4 mr-3 text-gray-500" />
                    Privacy Policy
                  </a>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-100 my-1"></div>
                
                {/* Logout */}
                <div className="py-1">
                  <a
                    href="#"
                    className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      chrome.storage.local.remove(['userData', 'authToken', 'userSession']);
                      setIsDropdownOpen(false);
                    }}
                  >
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