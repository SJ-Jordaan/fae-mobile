import { Edge, Node } from 'react-flow-renderer';
import { StateSchematic, TransitionSchematic, Witness } from './types';

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
            id: edge.id
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

  getStateTransitions(
    symbol: string,
    state: StateSchematic
  ): TransitionSchematic[] {
    const transitions: TransitionSchematic[] = [];

    for (const transition of state.transitions) {
      if (transition.symbols.includes(symbol)) {
        transitions.push(transition);
      }
    }

    return transitions;
  }

  verifyInputString(input: string, currentState: string): Witness {
    const state = this.getStateSchematic(currentState);

    if (!state) {
      return {
        isAccepting: false,
        path: [],
      };
    }

    if (this.stateAcceptsInput(input, state)) {
      return {
        isAccepting: true,
        path: [
          {
            state: currentState,
            symbol: input,
          },
        ],
      };
    }

    if (this.stateRejectsInput(input, state)) {
      return {
        isAccepting: false,
        path: [
          {
            state: currentState,
            symbol: input,
          },
        ],
      };
    }

    const currentSymbol = input.substring(0, 1);
    const remainingString = input.substring(1);
    const transitions = this.getStateTransitions(currentSymbol, state);

    for (let i = 0; i < transitions.length; i++) {
      const transition = transitions[i];

      if (!!transition) {
        const witness = this.verifyInputString(
          remainingString,
          transition.target
        );

        if (witness.isAccepting || i === transitions.length - 1) {
          return {
            isAccepting: witness.isAccepting,
            path: [
              {
                state: currentState,
                symbol: input.slice(0, 1),
                edge: transition.id
              },
              ...witness.path,
            ],
          };
        }

      }
    }

    return {
      isAccepting: false,
      path: [
        {
          state: currentState,
          symbol: currentSymbol,
        },
      ],
    };
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
