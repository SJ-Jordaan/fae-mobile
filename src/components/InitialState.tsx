import React from 'react';
import { Handle, Position } from 'react-flow-renderer';

export const InitialState = () => {
  return (
    <div style={{ width: 0, height: 0 }}>
      <Handle
        style={{ backgroundColor: 'transparent' }}
        type='source'
        position={Position.Right}
        id='invisibleNode'
      />
    </div>
  );
};
