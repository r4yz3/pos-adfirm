/// <reference types="vite/client" />
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {native} from './api';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
// The Android app ships its files inside the APK; only the web app needs the offline shell.
if(import.meta.env.PROD&&!native&&'serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
