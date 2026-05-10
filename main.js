import './style.css';
import { initCalculator } from './calculator.js';
import { initializeSOSService } from './sos-service.js';

document.addEventListener('DOMContentLoaded', () => {
  initializeSOSService();
  initCalculator();
});
