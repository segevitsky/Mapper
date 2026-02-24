import React, { useEffect, useState } from "react";

interface PopupStats {
  activeTabs: number;
  pendingRequests: number;
  mappingsCount: number;
}

// Tab state: true = explicitly on, false = explicitly off, null = follows global
type TabOverride = true | false | null;

function getEffectiveState(global: boolean, tabOverride: TabOverride): boolean {
  if (tabOverride !== null) return tabOverride;
  return global;
}

export function Popup() {
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [tabOverride, setTabOverride] = useState<TabOverride>(null);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [stats, setStats] = useState<PopupStats>({
    activeTabs: 0,
    pendingRequests: 0,
    mappingsCount: 0,
  });

  useEffect(() => {
    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        setCurrentTabId(tabId);

        // Load tab-specific override (null if not set)
        chrome.storage.local.get([`indi_tab_override_${tabId}`], (result) => {
          const val = result[`indi_tab_override_${tabId}`];
          setTabOverride(val === true ? true : val === false ? false : null);
        });
      }
    });

    // Load global state
    chrome.storage.local.get(["indi_global_enabled"], (result) => {
      setGlobalEnabled(result.indi_global_enabled !== false);
    });

    loadStats();
  }, []);

  async function loadStats() {
    try {
      const result = await chrome.storage.local.get(["indicators"]);
      const indicators = result.indicators || {};
      let mappingsCount = 0;
      for (const path in indicators) {
        mappingsCount += indicators[path]?.length || 0;
      }

      const response = await chrome.runtime.sendMessage({
        type: "GET_POPUP_STATS",
      });

      setStats({
        activeTabs: response?.activeTabs || 0,
        pendingRequests: response?.pendingRequests || 0,
        mappingsCount,
      });
    } catch {
      // Popup may close before response arrives
    }
  }

  const isActive = getEffectiveState(globalEnabled, tabOverride);

  async function handleGlobalToggle() {
    const newValue = !globalEnabled;
    setGlobalEnabled(newValue);

    await chrome.storage.local.set({ indi_global_enabled: newValue });
    chrome.runtime.sendMessage({
      type: "SET_GLOBAL_ENABLED",
      enabled: newValue,
    });
  }

  async function handleTabToggle() {
    if (currentTabId === null) return;

    // Toggle: if currently active on this tab, disable; if inactive, enable
    const currentEffective = getEffectiveState(globalEnabled, tabOverride);
    const newOverride = !currentEffective;
    setTabOverride(newOverride);

    await chrome.storage.local.set({
      [`indi_tab_override_${currentTabId}`]: newOverride,
    });
    chrome.runtime.sendMessage({
      type: "SET_TAB_OVERRIDE",
      tabId: currentTabId,
      override: newOverride,
    });
  }

  function handleOpenBlobi() {
    chrome.runtime.sendMessage({ type: "OPEN_FLOATING_WINDOW", data: {} });
    window.close();
  }

  async function handleClearTabData() {
    if (currentTabId === null) return;

    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tabs[0]?.url;
    if (!url) return;

    const result = await chrome.storage.local.get(["indicators"]);
    const indicators = result.indicators || {};

    const origin = new URL(url).origin;
    let cleared = false;
    for (const path in indicators) {
      if (path.startsWith(origin) || url.includes(path)) {
        delete indicators[path];
        cleared = true;
      }
    }

    if (cleared) {
      await chrome.storage.local.set({ indicators });
      chrome.tabs.sendMessage(currentTabId, {
        type: "CLEAR_TAB_INDICATORS",
      });
      loadStats();
    }
  }

  return (
    <div className="w-[320px] bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 px-4 py-3 flex items-center gap-3">
        <img
          src={chrome.runtime.getURL("assets/blobiman-icon.svg")}
          alt="Indi"
          className="w-8 h-8"
        />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg text-white">Indi</span>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isActive
                ? "bg-green-300 shadow-[0_0_6px_rgba(134,239,172,0.6)]"
                : "bg-gray-300"
            }`}
          />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Toggles */}
        <div className="space-y-3">
          <ToggleRow
            label="Global"
            description="Enable Indi on all tabs"
            checked={globalEnabled}
            onChange={handleGlobalToggle}
          />
          <ToggleRow
            label="This Tab"
            description={
              tabOverride === null
                ? "Following global setting"
                : isActive
                ? "Indi active on this tab"
                : "Indi paused on this tab"
            }
            checked={isActive}
            onChange={handleTabToggle}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Mappings"
            value={stats.mappingsCount}
            color="pink"
          />
          <StatCard
            label="Active Tabs"
            value={stats.activeTabs}
            color="purple"
          />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleOpenBlobi}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors border border-gray-700"
          >
            Open Blobi
          </button>
          <button
            onClick={handleClearTabData}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors border border-gray-700"
          >
            Clear Tab Data
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-100">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
          checked ? "bg-pink-500" : "bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "pink" | "purple";
}) {
  const bgColor = color === "pink" ? "bg-pink-950/50" : "bg-purple-950/50";
  const borderColor =
    color === "pink" ? "border-pink-800/30" : "border-purple-800/30";
  const textColor = color === "pink" ? "text-pink-300" : "text-purple-300";

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-3`}>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
