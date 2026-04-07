/**
 * StatusBadge — colored pill showing tunnel status.
 * UP=green, DOWN=red, CONN/CONNECTING=yellow, others=gray
 */
import React from 'react';
import { Text } from 'ink';
import { Status } from '../constants.js';

const BADGE_MAP = {
  [Status.CONNECTED]:     { label: ' UP   ', color: 'green',   bold: true },
  [Status.IDLE]:          { label: ' DOWN ', color: 'red',     bold: false },
  [Status.CONNECTING]:    { label: ' CONN ', color: 'yellow',  bold: false },
  [Status.DISCONNECTING]: { label: ' DISC ', color: 'yellow',  bold: false },
  [Status.FAILED]:        { label: ' FAIL ', color: 'red',     bold: true },
  [Status.ERROR]:         { label: ' ERR  ', color: 'red',     bold: true },
  [Status.LOADING]:       { label: ' LOAD ', color: 'cyan',    bold: false },
};

export default function StatusBadge({ status }) {
  const def = BADGE_MAP[status] ?? { label: ` ${(status ?? '?').toUpperCase().padEnd(4)} `, color: 'gray', bold: false };
  return (
    <Text color={def.color} bold={def.bold} inverse>
      {def.label}
    </Text>
  );
}

/**
 * StatusDot — single colored ● character.
 */
export function StatusDot({ status }) {
  const colorMap = {
    [Status.CONNECTED]:     'green',
    [Status.IDLE]:          'red',
    [Status.CONNECTING]:    'yellow',
    [Status.DISCONNECTING]: 'yellow',
    [Status.FAILED]:        'red',
    [Status.ERROR]:         'red',
  };
  const color = colorMap[status] ?? 'gray';
  return <Text color={color}>●</Text>;
}
