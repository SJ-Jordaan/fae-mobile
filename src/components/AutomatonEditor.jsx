import React, { useState, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Controls,
  useNodesState,
  useEdgesState,
} from 'react-flow-renderer';
import {
  AutomatonNodeStyle,
  AutomatonNodeAcceptingStyle,
} from '../constants/styles';
import { AutomatonEditorSidebar } from './AutomatonEditorSidebar';

const initialNodes = [
  {
    id: 'S0',
    type: 'default',
    data: { label: 'S0' },
    sourcePosition: 'right',
    targetPosition: 'left',
    position: { x: 5, y: 5 },
    isAccepting: false,
    isStarting: true,
    style: AutomatonNodeStyle,
  },
];
let id = 1;
const getId = () => `S${id++}`;

export const AutomatonEditor = () => {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  // TODO: Check this
  // const onConnect = (params) =>
  //   setNodes((els) => addEdge({ ...params, arrowHeadType: 'arrow' }, els));
  const onConnect = (connection) =>
    setEdges((es) =>
      addEdge({ ...connection, markerEnd: { type: 'arrow' } }, es),
    );

  const onInit = (_reactFlowInstance) =>
    setReactFlowInstance(_reactFlowInstance);

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnter = (e) => {
    e.preventDefault();
  };

  const onDrop = (e) => {
    e.preventDefault();

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const { type, isAccepting } = JSON.parse(
      e.dataTransfer.getData('application/reactflow'),
    );
    const position = reactFlowInstance.project({
      x: e.clientX - reactFlowBounds.left,
      y: e.clientY - reactFlowBounds.top,
    });

    const newId = getId();
    const newNode = {
      id: newId,
      type,
      position,
      sourcePosition: 'right',
      targetPosition: 'left',
      data: { label: newId },
      style: isAccepting ? AutomatonNodeAcceptingStyle : AutomatonNodeStyle,
    };

    setNodes((el) => el.concat(newNode));
  };

  return (
    <div
      style={{
        flexDirection: 'row',
        display: 'flex',
        height: '100vh',
        width: '100vw',
      }}
    >
      <ReactFlowProvider>
        <div style={{ flex: 1 }} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={onInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
          >
            <Controls />
          </ReactFlow>
        </div>
        <AutomatonEditorSidebar />
      </ReactFlowProvider>
    </div>
  );
};
