import React from 'react';

import { Box } from '@mui/system';

import { BasicSpeedDial } from './AutomatonEditorSpeedDial';

const boxStyles = {
  margin: '8px',
};

export const AutomatonEditorSidebar = () => {
  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    type: string,
    isAccepting: boolean,
  ) => {
    if (!event.dataTransfer) {
      return;
    }

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
        component={'div'}
        sx={boxStyles}
        className={'automaton-node'}
        onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
          onDragStart(event, 'state', false)
        }
        draggable
      />
      <Box
        component={'div'}
        sx={boxStyles}
        className={'automaton-node-accepting'}
        onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
          onDragStart(event, 'state', true)
        }
        draggable
      />
      <BasicSpeedDial />
    </aside>
  );
};
