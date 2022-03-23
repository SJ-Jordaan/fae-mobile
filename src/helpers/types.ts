export type TransitionSchematic = {
  symbols: string[];
  target: string;
  id: string;
};

export type StateSchematic = {
  id: string;
  isAccepting: boolean;
  isStarting: boolean;
  transitions: TransitionSchematic[];
};

export type Step = {
  state: string,
  symbol: string,
  edge?: string
}

export type Witness = {
  isAccepting: boolean,
  path: Step[]
}