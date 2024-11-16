import { ElementMapping } from "../../types";

interface StatusIndicatorProps {
    mapping: ElementMapping;
    onClick: () => void;
  }
  
  export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ mapping, onClick }) => {
    return (
      <div 
        style={{
          position: 'absolute',
          top: `${mapping.elementRect.top}px`,
          left: `${mapping.elementRect.right + 5}px`,
          zIndex: 1000
        }}
        className={`
          w-4 h-4 
          rounded-full 
          cursor-pointer
          ${mapping.apiCall.status === 200 ? 'bg-green-500' : 'bg-red-500'}
          hover:scale-110 
          transition-transform
          shadow-md
        `}
        onClick={onClick}
      />
    );
   };