import * as React from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Controls,
  useNodesState,
  useEdgesState,
  Position,
  Connection,
  MarkerType,
  ReactFlowInstance,
  NodeChange,
  applyNodeChanges,
} from 'react-flow-renderer';
import { generateInitialElements } from '../helpers/utils';
import { AutomatonEditorSidebar } from './AutomatonEditorSidebar';
import { AutomatonState } from './AutomatonState';
import FloatingEdge from './FloatingEdge';
import { InitialState } from './InitialState';

let id = 1;
const getId = () => `S${id++}`;

const { initialNodes, initialEdges } = generateInitialElements();

const edgeTypes = {
  floating: FloatingEdge,
};

const nodeTypes = {
  initial: InitialState,
  state: AutomatonState,
};

export const ElementContext = React.createContext({
  nodes: initialNodes,
  edges: initialEdges,
});

export const AutomatonEditor = () => {
  const reactFlowWrapper = React.useRef<HTMLInputElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    React.useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodesChange = React.useCallback((changes) => {
    const finalChanges: NodeChange[] = changes;

    for (let i = 0; i < changes.length; i++) {
      const node = changes[i];

      if (node.id === 'S0' && node.type === 'position') {
        if (node.dragging) {
          finalChanges.push({
            id: 'initialNode',
            type: node.type,
            position: {
              x: node.position.x - 40,
              y: node.position.y + 20,
            },
            dragging: node.dragging,
          });

          break;
        }

        finalChanges.push({
          id: 'initialNode',
          type: node.type,
          dragging: node.dragging,
        });

        break;
      }
    }

    setNodes((ns) => applyNodeChanges(finalChanges, ns));
  }, []);

  const onLabelChange = (id: string, label: string) => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          edge.label = label;
        }

        return edge;
      }),
    );
  };

  const onConnect = React.useCallback((connection: Connection) => {
    if (connection.source === connection.target) {
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            type: 'floating',
            data: { onLabelChange },
            label: 'edit me',
            markerEnd: { type: MarkerType.ArrowClosed },
            targetHandle: 'left',
          },
          es,
        ),
      );

      return;
    }
    setEdges((es) =>
      addEdge(
        {
          ...connection,
          type: 'floating',
          data: { onLabelChange },
          label: 'edit me',
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        es,
      ),
    );
  }, []);

  const onInit = (_reactFlowInstance: ReactFlowInstance) =>
    setReactFlowInstance(_reactFlowInstance);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    let reactFlowBounds = reactFlowWrapper?.current?.getBoundingClientRect();

    if (!reactFlowBounds || !reactFlowInstance) {
      return;
    }

    const { type, isAccepting } = JSON.parse(
      e.dataTransfer.getData('application/reactflow'),
    );

    const position = reactFlowInstance.project({
      x: e.clientX - reactFlowBounds?.left,
      y: e.clientY - reactFlowBounds?.top,
    });

    const newId = getId();
    const newNode = {
      id: newId,
      type,
      position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: newId, isAccepting, isStarting: false },
      className: isAccepting ? 'automaton-node-accepting' : 'automaton-node',
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
            nodeTypes={nodeTypes}
            edges={edges}
            edgeTypes={edgeTypes}
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
        <ElementContext.Provider value={{ nodes, edges }}>
          <AutomatonEditorSidebar />
        </ElementContext.Provider>
      </ReactFlowProvider>
    </div>
  );
};
