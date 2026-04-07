/**
 * MarqueeText — fixed-width cell that scrolls long text when active.
 * Animation is contained inside a fixed-width box; no layout shift.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';

const SCROLL_INTERVAL_MS = 140;
const PAUSE_TICKS = 8; // pause at start/end before scrolling

export default function MarqueeText({ text, width, isActive, color, bold, dimColor }) {
  const [offset, setOffset] = useState(0);
  const pauseRef = useRef(0);
  const dirRef = useRef(1);

  useEffect(() => {
    if (!isActive || text.length <= width) {
      setOffset(0);
      pauseRef.current = 0;
      dirRef.current = 1;
      return;
    }

    const maxOffset = text.length - width;
    const timer = setInterval(() => {
      if (pauseRef.current > 0) { pauseRef.current--; return; }
      setOffset(prev => {
        const next = prev + dirRef.current;
        if (next >= maxOffset) { dirRef.current = -1; pauseRef.current = PAUSE_TICKS; return maxOffset; }
        if (next <= 0)         { dirRef.current = 1;  pauseRef.current = PAUSE_TICKS; return 0; }
        return next;
      });
    }, SCROLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isActive, text, width]);

  const visible = text.length <= width
    ? text.padEnd(width)
    : text.slice(offset, offset + width);

  return (
    <Box width={width} overflow="hidden">
      <Text color={color} bold={bold} dimColor={dimColor}>{visible}</Text>
    </Box>
  );
}
