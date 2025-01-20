import { useEffect, useState } from "react";
import { IndicatorData } from "../../types";
import { panelHeadline } from "../styles";

type IndicatorsListProps = {
  currentUrl: string;
};

export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateStoragePath(url: string): string {
  const urlObj = new URL(url);
  const search = urlObj.search;
  const pathname = urlObj.pathname;
  const params = new URLSearchParams(search);
  const tabValue = params.get("tab");

  const pathParts = pathname
    .split("/")
    .filter(Boolean)
    .filter((el) => el !== "/")
    .filter((el) => el !== "")
    .filter((el) => !uuidRegex.test(el));

  if (tabValue) {
    pathParts.push(tabValue);
  }

  return pathParts.join("_");
}

const IndicatorsList = ({ currentUrl }: IndicatorsListProps) => {
  const [indiesList, setIndiesList] = useState<Record<string, IndicatorData[]>>(
    {}
  ); // כאן נשמור את האינדיקטורים
  console.log({ indiesList, currentUrl }, "our indiesList");
  const path = generateStoragePath(currentUrl);
  console.log({ path }, "our path");
  console.log(indiesList?.path ?? [], "our path in indiesList");

  let currentIndies = {};
  useEffect(() => {
    chrome.storage.local.get(["indicators"], (result) => {
      currentIndies = result.indicators;
      setIndiesList(result.indicators);
    });
  }, [
    Object.keys(indiesList).length,
    currentIndies,
    Object.keys(currentIndies).length,
  ]);

  const deleteIndicatorHandler = (indicatorId: string) => {
    // lets send a message to our content script to delete the indicator
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id !== undefined) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "DELETE_INDICATOR",
          data: indicatorId,
        });
      }
    });
  };

  return (
    <div>
      <p className={panelHeadline}> Indicators List </p>
      {Object.keys(indiesList).length > 0 &&
        Object.keys(indiesList).map((el: any) => {
          return (
            <div key={el}>
              <p> URL: {el.includes("_") ? el.replaceAll("_", " => ") : el} </p>
              <div className="">
                {indiesList[el]?.map(
                  (
                    indicator: IndicatorData // גם כאן
                  ) => (
                    <div className="p-4 text-white shadow-md w-fit mb-4">
                      <p> method: {indicator?.method ?? "-"}</p>
                      <p> status: {indicator?.lastCall?.status ?? "-"}</p>
                      <p> baseUrl: {indicator?.lastCall?.url ?? "-"}</p>
                      <div
                        className="text-right text-white pt-2 pb-2 cursor-pointer &hover:text-red-500"
                        onClick={() => deleteIndicatorHandler(indicator.id)}
                      >
                        {" "}
                        Delete Indi{" "}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default IndicatorsList;
