import { NetworkCall } from "../../types";

interface ApiDetailsModalProps {
  call?: NetworkCall;
  onClose: () => void;
}

const ApiDetailsModal: React.FC<ApiDetailsModalProps> = ({ call, onClose }) => {
  if (!call) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 animate-[fadeIn_0.3s_ease-out_forwards,slideUp_0.4s_ease-out_forwards]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-[500px] shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">API Call Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div></div>

          <div>
            <h3 className="font-medium">API Call:</h3>
            <div className="bg-gray-100 p-2 rounded">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`
                    w-3 h-3 rounded-full
                    ${call.status === 200 ? "bg-green-500" : "bg-red-500"}
                  `}
                />
                <span className="font-medium">{call.method}</span>
                <span>{call.status}</span>
              </div>
              <div className="text-sm break-all">{call.url}</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium">Timestamp:</h3>
            <div className="text-gray-600">
              {new Date(call.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDetailsModal;
