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

  verifyInputString(input: string, currentState: string): boolean {
    for (const state of this.states) {
      if (state.id !== currentState) {
        continue;
      }

      if (input.length === 0 && state.isAccepting) {
        return true;
      }

      if (input.length === 0 && !state.isAccepting) {
        return false;
      }

      for (const transition of state.transitions) {
        const currentSymbol = input.substring(0, 1);
        const remainingString = input.substring(1);

        if (transition.symbols.includes(currentSymbol)) {
          return this.verifyInputString(remainingString, transition.target);
        }

        return false;
      }
    }

    return false;
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
