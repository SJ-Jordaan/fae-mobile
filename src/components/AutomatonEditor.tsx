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
import { generateInitialElements } from '../helpers';
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
  const [edgePairs, setEdgePairs] = React.useState<Map<string, string[]>>(
    new Map(),
  );

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
    if (!connection?.target || !connection?.source) return;

    const defaultProperties = {
      type: 'floating',
      data: { onLabelChange },
      label: 'e',
      markerEnd: { type: MarkerType.ArrowClosed },
    };

    const newEdgePairs = edgePairs;

    const edgeAlreadyExists = newEdgePairs
      .get(connection.source)
      ?.includes(connection.target);

    if (edgeAlreadyExists) {
      return;
    }

    const mirrorEdgeExists = newEdgePairs
      .get(connection.target)
      ?.includes(connection.source);

    if (mirrorEdgeExists) {
      // Update the existing edge to avoid new edge
      setEdges((es) =>
        es.map((e) => {
          if (
            e.source === connection.target &&
            e.target === connection.source
          ) {
            return {
              ...e,
              data: { ...e.data, arch: true },
            };
          }
          return e;
        }),
      );

      // Make new edge avoid existing edge
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            ...defaultProperties,
            data: { ...defaultProperties.data, arch: true },
          },
          es,
        ),
      );

      const existingTargets = newEdgePairs.get(connection.source) ?? [];
      newEdgePairs.set(connection.source, [
        ...existingTargets,
        connection.target,
      ]);
      setEdgePairs(newEdgePairs);

      return;
    }

    const edgeIsSelfLooping = connection.source === connection.target;

    if (edgeIsSelfLooping) {
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            ...defaultProperties,
            targetHandle: 'left',
          },
          es,
        ),
      );

      const existingTargets = newEdgePairs.get(connection.source) ?? [];
      newEdgePairs.set(connection.source, [
        ...existingTargets,
        connection.target,
      ]);
      setEdgePairs(newEdgePairs);

      return;
    }

    setEdges((es) =>
      addEdge(
        {
          ...connection,
          ...defaultProperties,
        },
        es,
      ),
    );

    const existingTargets = newEdgePairs.get(connection.source) ?? [];
    newEdgePairs.set(connection.source, [
      ...existingTargets,
      connection.target,
    ]);
    setEdgePairs(newEdgePairs);
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
