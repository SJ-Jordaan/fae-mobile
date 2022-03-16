import { Box } from '@mui/system';
import React from 'react';
import {
  AutomatonNodeStyle,
  AutomatonNodeAcceptingStyle,
} from '../constants/styles';
import { BasicSpeedDial } from './AutomatonEditorSpeedDial';

const boxStyles = {
  margin: '8px',
};

export const AutomatonEditorSidebar = () => {
  const onDragStart = (event, type, isAccepting) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type,
        isAccepting,
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        borderLeft: '1px solid #eee',
        background: '#fcfcfc',
        width: '15%',
        padding: '16px',
      }}
    >
      <Box
        style={{ ...AutomatonNodeStyle, ...boxStyles }}
        onDragStart={(event) => onDragStart(event, 'default', false)}
        draggable
      />
      <Box
        style={{ ...AutomatonNodeAcceptingStyle, ...boxStyles }}
        onDragStart={(event) => onDragStart(event, 'default', true)}
        draggable
      />
      <BasicSpeedDial />
    </aside>
  );
};
