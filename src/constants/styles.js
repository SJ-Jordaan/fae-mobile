export const AutomatonNodeStyle = {
  borderRadius: '50%',
  border: '1px solid #1a192b',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  height: '50px',
  width: '50px',
  display: 'flex',
};

export const AutomatonNodeAcceptingStyle = {
  ...AutomatonNodeStyle,
  border: '4px double black',
};
