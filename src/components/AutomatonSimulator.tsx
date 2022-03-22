import { CloseOutlined } from '@mui/icons-material';
import { Box, Color } from '@mui/material';
import React, { useContext, useEffect, useState } from 'react';
import ReactFlow, {
  ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'react-flow-renderer';
import { ElementContext } from './AutomatonEditor';
import { AutomatonState } from './AutomatonState';
import FloatingEdge from './FloatingEdge';
import { InitialState } from './InitialState';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { AutomatonSchematic } from '../helpers/automaton';
import { StateSchematic } from '../helpers/types';

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
  state: string;
  input: string;
  automaton: AutomatonSchematic;
  pastStates: string[];
  pastSymbols: string[];
};

export const AutomatonSimulator = (props: Props) => {
  const { nodes, edges } = useContext(ElementContext);
  const [animatedNodes, setAnimatedNodes, onNodesChange] = useNodesState(nodes);
  const [animatedEdges, setAnimatedEdges, onEdgesChange] = useEdgesState(edges);

  const [current, setCurrent] = useState<CurrentAnimationState | null>(null);

  const colorNode = (id: string, color: string) => {
    setAnimatedNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          node.style = {
            ...node.style,
            backgroundColor: color,
            transition: 'all .5s ease',
          };
        }

        return node;
      }),
    );
  };

  const colorNodeTermination = (
    input: string,
    state: StateSchematic,
  ): boolean => {
    if (!current) return false;

    if (current.automaton.stateAcceptsInput(input, state)) {
      colorNode(state.id, 'green');
      return true;
    }

    if (current.automaton.stateRejectsInput(input, state)) {
      colorNode(state.id, 'red');
      return true;
    }

    colorNode(state.id, 'lightblue');
    return false;
  };

  useEffect(() => {
    if (current !== null) {
      return;
    }

    const automaton = new AutomatonSchematic(nodes, edges);
    const state = automaton.getInitialState();

    setCurrent({
      automaton,
      state,
      input: props.inputString,
      pastStates: [],
      pastSymbols: [],
    });
  }, []);

  const [play, setPlay] = useState(false);

  const handlePlay = () => {
    if (!current) return;

    setPlay(true);

    const state = current.automaton.getStateSchematic(current.state);

    if (!state) return;

    const input = current.input;
    const terminate = colorNodeTermination(input, state);

    if (terminate) {
      return;
    }

    // Do the animation
  };

  const handlePause = () => {
    setPlay(false);
  };

  const handleNext = () => {
    if (!current || !play) return;

    const automaton = current.automaton;
    const input = current.input;
    const state = automaton.getStateSchematic(current.state);

    if (!state) return;

    const terminate = colorNodeTermination(input, state);

    if (terminate) {
      return;
    }

    const currentSymbol = input.substring(0, 1);
    const remainingString = input.substring(1);
    const pastStates = [...current.pastStates, state.id];
    const pastSymbols = [...current.pastSymbols, currentSymbol];

    const transition = current.automaton.getStateTransition(
      currentSymbol,
      state,
    );

    if (transition !== null) {
      const newState = automaton.getStateSchematic(transition.target);
      if (!newState) return;

      colorNodeTermination(remainingString, newState);

      setCurrent({
        automaton,
        input: remainingString,
        state: newState.id,
        pastStates,
        pastSymbols,
      });

      return;
    }

    colorNodeTermination(remainingString, state);
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
      }}
    >
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
          attributionPosition={'top-left'}
        ></ReactFlow>
      </ReactFlowProvider>
      <Box
        sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
        onClick={props.onClick}
      >
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
        }}
      >
        <SkipPreviousIcon fontSize='large' sx={{ margin: '0 16px' }} />
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
