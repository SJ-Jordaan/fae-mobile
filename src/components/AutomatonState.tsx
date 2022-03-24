import React from 'react';

import { Typography } from '@mui/material';

import { Handle, NodeProps, Position } from 'react-flow-renderer';

const topHandleStyle = {
  width: '50px',
  height: '5px',
  borderRadius: '3px',
  backgroundColor: 'transparent',
  border: 'black',
};
const defaultHandleStyle = {
  width: '12px',
  height: '50px',
  borderRadius: '3px',
  backgroundColor: 'transparent',
  border: 'black',
};

export const AutomatonState: React.FC<NodeProps> = ({ data }) => {
  return (
    <>
      <Typography variant={'subtitle1'}>{data.label}</Typography>
      <Handle
        style={defaultHandleStyle}
        type='source'
        position={Position.Right}
        id='right'
      />
      <Handle
        style={defaultHandleStyle}
        type='target'
        position={Position.Left}
        id='left'
      />
      <Handle
        style={topHandleStyle}
        type='target'
        position={Position.Top}
        id='top'
      />
    </>
  );
};
