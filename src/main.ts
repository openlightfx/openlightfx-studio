import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');
mount(App, { target });
