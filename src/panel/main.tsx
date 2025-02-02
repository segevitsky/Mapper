import React from "react";
import ReactDOM from "react-dom/client";
import { Panel } from "./Panel";
// import './index.css'

// הוספת הקוד להאזנה למעבר טאבים לפני הרנדור של ריאקט
// type DevToolsMessage = {
//   type: 'SWITCH_TO_INDI_TAB';
// };

// // יצירת הפאנל והאזנה להודעות
// chrome.devtools.panels.create(
//   "Indi",
//   "",
//   "panel.html",
//   (panel: chrome.devtools.panels.ExtensionPanel) => {
//     chrome.runtime.onMessage.addListener((message: DevToolsMessage) => {
//       if (message.type === 'SWITCH_TO_INDI_TAB') {
//         panel.show();
//       }
//     });
//   }
// );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>
);
