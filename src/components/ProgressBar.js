/**
 * ProgressBar — text-based progress bar.
 * Example: ████████████░░░░░░░░  3/7
 */
import React from 'react';
import { Box, Text } from 'ink';

export default function ProgressBar({ current, total, width = 20, label = true }) {
  const pct = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Box gap={1}>
      <Text color="green">{bar}</Text>
      {label && <Text dimColor>{current}/{total}</Text>}
    </Box>
  );
}
