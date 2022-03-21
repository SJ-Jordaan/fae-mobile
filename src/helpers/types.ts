export type TransitionSchematic = {
  symbols: string[];
  target: string;
};

export type StateSchematic = {
  id: string;
  isAccepting: boolean;
  isStarting: boolean;
  transitions: TransitionSchematic[];
};
