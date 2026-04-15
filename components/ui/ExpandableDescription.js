"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export default function ExpandableDescription({
  text,
  lines = 3,
  className = "",
  textClassName = "",
  buttonClassName = "",
  textStyle,
  buttonStyle,
}) {
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef(null);

  const collapsedStyle = useMemo(
    () => ({
      display: "-webkit-box",
      WebkitLineClamp: lines,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    }),
    [lines]
  );

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const checkOverflow = () => {
      if (expanded) return;
      setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [text, lines, expanded]);

  if (!text) return null;

  return (
    <div className={className}>
      <div
        ref={textRef}
        className={textClassName}
        style={{ ...(expanded ? {} : collapsedStyle), ...(textStyle || {}) }}
      >
        {text}
      </div>
      {isOverflowing && (
        <button
          type="button"
          className={buttonClassName}
          style={buttonStyle}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Ocultar" : "Ver mas"}
        </button>
      )}
    </div>
  );
}
