import * as React from 'react';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import { Box } from '@mui/system';
import { ElementContext } from './AutomatonEditor';
import { AutomatonSchematic } from '../helpers/automaton';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { BugReport } from '@mui/icons-material';

export const BasicSpeedDial = () => {
  const { nodes, edges } = React.useContext(ElementContext);
  const [open, setOpen] = React.useState(false);
  const [verify, setVerify] = React.useState({
    loading: false,
    error: false,
    success: false,
  });
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setVerify({
      loading: false,
      error: false,
      success: false,
    });
  };

  const handleVerify = () => {
    setVerify((prevState) => ({
      ...prevState,
      loading: true,
    }));

    if (!inputRef?.current) {
      setVerify((prevState) => ({
        ...prevState,
        loading: true,
      }));

      return;
    }

    const automaton = new AutomatonSchematic(nodes, edges);
    const isStringAccepted = automaton.verifyInputString(
      inputRef.current.value,
      automaton.getInitialState(),
    );

    console.log(inputRef.current.value);

    console.log(isStringAccepted);

    if (!isStringAccepted) {
      setVerify({
        loading: false,
        error: true,
        success: false,
      });

      return;
    }

    setVerify({
      loading: false,
      error: false,
      success: true,
    });
  };

  return (
    <Box>
      <SpeedDial
        ariaLabel='Options'
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          key={'Test'}
          icon={<BugReport />}
          tooltipTitle={'Test'}
          tooltipOpen
          onClick={handleClickOpen}
        />
      </SpeedDial>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Enter input string</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter consecutive symbols with no delimiters
          </DialogContentText>
          <Box sx={{ display: 'flex', flexDirection: 'row' }}>
            <TextField
              inputRef={inputRef}
              autoFocus
              margin='dense'
              id='inputString'
              label='Input String'
              type='text'
              variant='standard'
            />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'end',
              }}
            >
              {verify.loading ? (
                <CircularProgress color='success' />
              ) : verify.error ? (
                <Box sx={{ display: 'flex' }}>
                  <CloseIcon color='error' />
                  <Typography color={'tomato'}>Input rejected</Typography>
                </Box>
              ) : verify.success ? (
                <Box sx={{ display: 'flex' }}>
                  <CheckIcon color='success' />
                  <Typography color={'darkgreen'}>Input accepted</Typography>
                </Box>
              ) : (
                <></>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button onClick={handleVerify}>Verify</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
