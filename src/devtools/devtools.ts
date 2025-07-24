chrome.devtools.panels.create(
    "Indi Mapper",
    "",
    "/panel/index.html",
    (panel: unknown) => {
      console.log("Panel created", panel)
    }
  )
  
  export {}