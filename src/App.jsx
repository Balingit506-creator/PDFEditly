import React from "react";
import { useEffect, useState } from "react";
import editorMarkup from "./editorMarkup.html?raw";

export default function App() {
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    let isMounted = true;

    import("./editor.js").catch((error) => {
      console.error("Failed to initialize the PDF editor.", error);

      if (isMounted) {
        setStartupError(
          "The PDF editor could not be started. Refresh the page to try again.",
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <div id="legacy-app" dangerouslySetInnerHTML={{ __html: editorMarkup }} />
      {startupError && (
        <div className="startup-error" role="alert">
          {startupError}
        </div>
      )}
    </>
  );
}
