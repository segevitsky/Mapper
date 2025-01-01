import { useEffect, useState } from "react";
import { IndicatorData } from "../../types";
import { panelHeadline } from "../styles";

type IndicatorsListProps = {
  currentUrl: string;
};

const IndicatorsList = ({ currentUrl }: IndicatorsListProps) => {
  const [indiesList, setIndiesList] = useState([]);
  console.log({ indiesList }, "our indiesList");

  useEffect(() => {
    chrome.storage.local.get(["indicators"], (result) => {
      setIndiesList(result.indicators);
    });
  }, []);

  const entries: any = Object.entries(indiesList)
    .filter((el) => {
      return el[0].includes(currentUrl.split("/")[2]);
    })
    .filter((el) => (el[1] as any[])?.length > 0);

  console.log({ entries }, "these are our indicators entries");

  return (
    <div>
      <p className={panelHeadline}> Indicators List </p>
      <br />
      <ul className="max-h-[60vh] overflow-y-scroll">
        {entries?.length > 0 &&
          entries?.map((el: any) => (
            <div key={el}>
              <p> URL: {el[0]} </p>
              <div className="">
                {el[1].map(
                  (
                    indicator: IndicatorData // גם כאן
                  ) => (
                    <div className="p-4 text-white shadow-md w-fit mb-4">
                      <p> saved on page: {indicator?.baseUrl ?? "-"}</p>
                      <p> method: {indicator?.method ?? "-"}</p>
                      <p> status: {indicator?.lastCall?.status ?? "-"}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
      </ul>
    </div>
  );
};

export default IndicatorsList;
