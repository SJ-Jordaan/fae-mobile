import React from 'react';
import ReactDOM from 'react-dom';

import { polyfill } from 'mobile-drag-drop';

import reportWebVitals from './reportWebVitals';
import { App } from './App';

import './index.css';
import './styles/automaton.css';

// optional import of scroll behaviour
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';

// options are optional ;)
polyfill({
  // use this to make use of the scroll behaviour
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
