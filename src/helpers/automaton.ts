import { Edge, Node } from 'react-flow-renderer';
import { StateSchematic, TransitionSchematic } from './types';

export class AutomatonSchematic {
  private states: StateSchematic[];

  constructor(nodes: Node[], edges: Edge[]) {
    this.states = nodes.flatMap((node: Node) => {
      if (node.id === 'initialNode') {
        return [];
      }

      const transitions: TransitionSchematic[] = [];

      const schematicNode = {
        id: node.id,
        isStarting: node.data.isStarting,
        isAccepting: node.data.isAccepting,
        transitions: transitions,
      };

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];

        if (edge.source === node.id) {
          schematicNode.transitions.push({
            target: edge.target,
            symbols: edge.label?.toString()?.split(',') || [],
          });
        }
      }

      return schematicNode;
    });
  }

  getStateSchematic(id: string): StateSchematic | null {
    for (const state of this.states) {
      if (state.id !== id) {
        continue;
      }

      return state;
    }

    return null;
  }

  getStateTransition(
    symbol: string,
    state: StateSchematic,
  ): TransitionSchematic | null {
    for (const transition of state.transitions) {
      if (transition.symbols.includes(symbol)) {
        return transition;
      }
    }

    return null;
  }

  verifyInputString(input: string, currentState: string): boolean {
    const state = this.getStateSchematic(currentState);

    if (!state) {
      return false;
    }

    if (this.stateAcceptsInput(input, state)) {
      return true;
    }

    if (this.stateRejectsInput(input, state)) {
      return false;
    }

    const currentSymbol = input.substring(0, 1);
    const remainingString = input.substring(1);
    const transition = this.getStateTransition(currentSymbol, state);

    if (transition !== null) {
      return this.verifyInputString(remainingString, transition.target);
    }

    return false;
  }

  stateAcceptsInput(input: string, currentState: StateSchematic): boolean {
    return input.length === 0 && currentState.isAccepting;
  }

  stateRejectsInput(input: string, currentState: StateSchematic): boolean {
    return input.length === 0 && !currentState.isAccepting;
  }

  getInitialState(): string {
    let initialState = '';

    for (const state of this.states) {
      if (state.isStarting) {
        initialState = state.id;
        break;
      }
    }

    return initialState;
  }
}
