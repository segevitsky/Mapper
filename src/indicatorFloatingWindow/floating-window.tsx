
import React from 'react';
import ReactDOM from 'react-dom/client';
import IndicatorFloatingWindow from './components/IndicatorFloatingWindow';
// יצירת הרוט
const root = ReactDOM.createRoot(document.getElementById('rootOne') as HTMLElement);

// רינדור הקומפוננט הראשי
root.render(<IndicatorFloatingWindow />);