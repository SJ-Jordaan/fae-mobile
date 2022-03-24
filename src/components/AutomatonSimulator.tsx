import React, { useContext, useEffect, useState } from 'react';

import { CloseOutlined } from '@mui/icons-material';
import { Box } from '@mui/material';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

import ReactFlow, {
  ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'react-flow-renderer';

import {
  AutomatonSchematic,
  Witness,
  generateInitialElements,
} from '../helpers';
import { ElementContext } from './AutomatonEditor';
import { AutomatonState } from './AutomatonState';
import FloatingEdge from './FloatingEdge';
import { InitialState } from './InitialState';

const nodeTypes = {
  initial: InitialState,
  state: AutomatonState,
};

const edgeTypes = {
  floating: FloatingEdge,
};

type Props = {
  onClick: () => void;
  inputString: string;
};

type CurrentAnimationState = {
  automaton: AutomatonSchematic;
  witness: Witness;
  index: number;
  pastStates: string[];
  pastSymbols: string[];
};

export const AutomatonSimulator = (props: Props) => {
  const { nodes, edges } = useContext(ElementContext);
  const { initialEdges, initialNodes } = generateInitialElements();
  const [animatedNodes, setAnimatedNodes, onNodesChange] =
    useNodesState(initialNodes);
  const [animatedEdges, setAnimatedEdges, onEdgesChange] =
    useEdgesState(initialEdges);

  const [current, setCurrent] = useState<CurrentAnimationState | null>(null);

  const colorNode = (index: number, reset?: boolean) => {
    if (!current) return;

    const { witness, automaton } = current;
    const symbol = witness.path[index].symbol;
    const state = witness.path[index].state;
    const stateSchematic = automaton.getStateSchematic(state);
    if (!stateSchematic) return;

    let color = 'lightblue';

    if (index === witness.path.length - 1) {
      color = automaton.stateAcceptsInput(symbol, stateSchematic)
        ? 'green'
        : 'red';
    }

    color = reset ? 'transparent' : color;

    setAnimatedNodes((nds) =>
      nds.map((node) => {
        if (node.id === state) {
          node.style = {
            ...node.style,
            backgroundColor: color,
            transition: 'all .5s ease',
          };
        }

        return node;
      })
    );
  };

  const colorEdge = (index: number, reset?: boolean) => {
    if (!current) return;

    const { witness } = current;
    const id = witness.path[index].edge;
    if (!id) return;

    setAnimatedEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          edge.animated = !reset;
        }

        return edge;
      })
    );
  };

  useEffect(() => {
    if (current !== null) {
      return;
    }

    const updatedNodes = nodes.map((node) => ({
      ...node,
      id: node.id + '-sim',
    }));

    const updatedEdges = edges.map((edge) => ({
      ...edge,
      id: edge.id + '-sim',
      source: edge.source + '-sim',
      target: edge.target + '-sim',
    }));

    setAnimatedEdges(updatedEdges);
    setAnimatedNodes(updatedNodes);

    const automaton = new AutomatonSchematic(updatedNodes, updatedEdges);
    const initialState = automaton.getInitialState();
    const witness = automaton.verifyInputString(
      props.inputString,
      initialState
    );

    setCurrent({
      automaton,
      index: 0,
      witness,
      pastStates: [],
      pastSymbols: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [play, setPlay] = useState(false);

  const handlePlay = () => {
    if (!current) return;

    setPlay(true);

    const { index } = current;

    colorNode(index);
  };

  const handlePause = () => {
    setPlay(false);
  };

  const handleNext = () => {
    if (!current || !play) return;

    const { witness, index } = current;
    const state = witness.path[index].state;
    const symbol = witness.path[index].symbol;

    if (index === witness.path.length - 1) {
      return;
    }

    colorNode(index + 1);
    colorEdge(index);
    setCurrent({
      index: index + 1,
      automaton: current.automaton,
      witness: witness,
      pastStates: [...current.pastStates, state],
      pastSymbols: [...current.pastSymbols, symbol],
    });
  };

  const handlePrevious = () => {
    if (!current || !play) return;

    const { witness, index, pastStates, pastSymbols, automaton } = current;

    if (index === 0) {
      return;
    }

    const poppedPastStates = pastStates;
    poppedPastStates.pop();

    const poppedPastSymbols = pastSymbols;
    poppedPastSymbols.pop();

    colorNode(index, true);
    colorNode(index - 1);
    colorEdge(index - 1, true);
    setCurrent({
      index: index - 1,
      automaton: automaton,
      witness: witness,
      pastStates: poppedPastStates,
      pastSymbols: poppedPastSymbols,
    });
  };

  const onInit = (_reactFlowInstance: ReactFlowInstance) => {
    _reactFlowInstance.fitView();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        backgroundColor: 'white',
        width: '100vw',
        height: '100vh',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={animatedNodes}
          nodeTypes={nodeTypes}
          edges={animatedEdges}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          attributionPosition={'top-left'}></ReactFlow>
      </ReactFlowProvider>
      <Box
        sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
        onClick={props.onClick}>
        <CloseOutlined fontSize='large' />
      </Box>
      <Box
        sx={{
          width: 'fit-content',
          height: '10%',
          minHeight: '48px',
          border: '2px solid black',
          borderRadius: '5px 5px 0 0',
          borderBottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <SkipPreviousIcon
          fontSize='large'
          sx={{ margin: '0 16px' }}
          onClick={handlePrevious}
        />
        {play ? (
          <PauseIcon
            fontSize='large'
            sx={{ margin: '0 16px' }}
            onClick={handlePause}
          />
        ) : (
          <PlayArrowIcon
            fontSize='large'
            sx={{ margin: '0 16px' }}
            onClick={handlePlay}
          />
        )}
        <SkipNextIcon
          fontSize='large'
          sx={{ margin: '0 16px' }}
          onClick={handleNext}
        />
      </Box>
    </Box>
  );
};
