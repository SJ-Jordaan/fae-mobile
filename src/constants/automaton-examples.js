export const AutomatonExamples = [
  {
    alphabet: ['a', 'b'],
    nodes: [
      { label: 'S0', isAccepting: true, isStarting: true },
      { label: 'S1', isAccepting: false, isStarting: false },
      { label: 'S2', isAccepting: true, isStarting: false },
    ],
    transitions: [
      { source: 'S0', target: 'S1', label: 'a' },
      { source: 'S0', target: 'S2', label: 'b' },
      { source: 'S1', target: 'S0', label: 'a' },
      { source: 'S1', target: 'S2', label: 'b' },
    ],
  },
];
