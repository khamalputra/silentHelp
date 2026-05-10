// calculator.js
// Handles the standard calculator logic
import { registerInput } from './sos-service.js';

class Calculator {
  constructor(previousOperandTextElement, currentOperandTextElement) {
    this.previousOperandTextElement = previousOperandTextElement;
    this.currentOperandTextElement = currentOperandTextElement;
    this.clear();
  }

  clear() {
    this.currentOperand = '0';
    this.previousOperand = '';
    this.operation = undefined;
    registerInput('AC');
  }

  delete() {
    if (this.currentOperand === '0' || this.currentOperand.length === 1) {
      this.currentOperand = '0';
      return;
    }
    this.currentOperand = this.currentOperand.toString().slice(0, -1);
  }

  appendNumber(number) {
    // Prevent multiple decimals
    if (number === '.' && this.currentOperand.includes('.')) return;
    
    // Replace initial 0 if typing a number
    if (this.currentOperand === '0' && number !== '.') {
      this.currentOperand = number.toString();
    } else {
      this.currentOperand = this.currentOperand.toString() + number.toString();
    }
    registerInput(number);
  }

  chooseOperation(operation) {
    registerInput(operation);
    if (this.currentOperand === '') return;
    if (this.previousOperand !== '') {
      this.compute();
    }
    this.operation = operation;
    this.previousOperand = this.currentOperand;
    this.currentOperand = '';
  }

  compute() {
    let computation;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);
    if (isNaN(prev) || isNaN(current)) return;
    
    switch (this.operation) {
      case '+':
        computation = prev + current;
        break;
      case '−':
        computation = prev - current;
        break;
      case '×':
        computation = prev * current;
        break;
      case '÷':
        computation = prev / current;
        break;
      default:
        return;
    }
    
    // Handle JS floating point issues slightly
    computation = Math.round(computation * 10000000000) / 10000000000;
    
    this.currentOperand = computation.toString();
    this.operation = undefined;
    this.previousOperand = '';
  }

  getDisplayNumber(number) {
    const stringNumber = number.toString();
    const integerDigits = parseFloat(stringNumber.split('.')[0]);
    const decimalDigits = stringNumber.split('.')[1];
    let integerDisplay;
    
    if (isNaN(integerDigits)) {
      integerDisplay = '';
    } else {
      integerDisplay = integerDigits.toLocaleString('en', { maximumFractionDigits: 0 });
    }
    
    if (decimalDigits != null) {
      return `${integerDisplay}.${decimalDigits}`;
    } else {
      return integerDisplay;
    }
  }

  updateDisplay() {
    this.currentOperandTextElement.innerText = this.getDisplayNumber(this.currentOperand);
    
    if (this.operation != null) {
      this.previousOperandTextElement.innerText = `${this.getDisplayNumber(this.previousOperand)} ${this.operation}`;
    } else {
      this.previousOperandTextElement.innerText = '';
    }
  }

  percent() {
    registerInput('%');
    const current = parseFloat(this.currentOperand);
    if (isNaN(current)) return;
    this.currentOperand = (current / 100).toString();
  }
}

export function initCalculator() {
  const numberButtons = document.querySelectorAll('[data-number]');
  const operationButtons = document.querySelectorAll('[data-operation]');
  const equalsButton = document.getElementById('equals');
  const deleteButton = document.getElementById('delete');
  const clearButton = document.getElementById('clear');
  const percentButton = document.getElementById('percent');
  const previousOperandTextElement = document.getElementById('previous-operand');
  const currentOperandTextElement = document.getElementById('current-operand');

  const calculator = new Calculator(previousOperandTextElement, currentOperandTextElement);

  numberButtons.forEach(button => {
    button.addEventListener('click', () => {
      calculator.appendNumber(button.innerText);
      calculator.updateDisplay();
    });
  });

  operationButtons.forEach(button => {
    button.addEventListener('click', () => {
      calculator.chooseOperation(button.innerText);
      calculator.updateDisplay();
    });
  });

  equalsButton.addEventListener('click', () => {
    registerInput('=');
    calculator.compute();
    calculator.updateDisplay();
  });

  // ======= ANTI-SPAM: LONG PRESS LOGIC =======
  let holdTimeout;
  
  const startHold = () => {
    holdTimeout = setTimeout(() => {
      registerInput('LONG_EQUALS');
    }, 3000); // Harus ditahan selama 3 detik penuh
  };
  
  const cancelHold = () => {
    clearTimeout(holdTimeout);
  };

  equalsButton.addEventListener('mousedown', startHold);
  equalsButton.addEventListener('touchstart', startHold, { passive: true });
  
  equalsButton.addEventListener('mouseup', cancelHold);
  equalsButton.addEventListener('mouseleave', cancelHold);
  equalsButton.addEventListener('touchend', cancelHold);
  equalsButton.addEventListener('touchcancel', cancelHold);
  // ===========================================

  clearButton.addEventListener('click', () => {
    calculator.clear();
    calculator.updateDisplay();
  });

  deleteButton.addEventListener('click', () => {
    calculator.delete();
    calculator.updateDisplay();
  });

  percentButton.addEventListener('click', () => {
    calculator.percent();
    calculator.updateDisplay();
  });
}
