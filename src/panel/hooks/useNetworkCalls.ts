import { useState, useEffect } from 'react'
import { NetworkCall } from '../../types';

// useNetworkCalls.ts
export const useNetworkCalls = () => {
  const [networkCalls, setNetworkCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    console.log('Setting up network calls listener');
    
    const handleNetworkCall = (message: any) => {
      console.log('Received message:', message);
      
      if (message.type === 'NEW_NETWORK_CALL') {
        console.log('Adding new network call:', message.data);
        setNetworkCalls(prev => [...prev, message.data]);
      }
    };

    chrome.runtime.onMessage.addListener(handleNetworkCall);
    return () => {
      console.log('Cleaning up listener');
      chrome.runtime.onMessage.removeListener(handleNetworkCall);
    };
  }, []);

  return { networkCalls };
};