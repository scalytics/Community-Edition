import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App';
import './services/websocketManager';
import './services/eventBusConnector';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
