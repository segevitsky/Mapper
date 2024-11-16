chrome.devtools.panels.create(
    "API Mapper",
    "",
    "/panel/index.html",
    (panel: unknown) => {
      console.log("Panel created", panel)
    }
  )
  
  export {}