import { useEffect, useRef, useState } from 'react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function CalculatorSurface({ manifest, computer }: SurfaceProps) {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number>();
  const [operator, setOperator] = useState<string>();
  const [fresh, setFresh] = useState(true);
  const [scientific, setScientific] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const state = useRef({ display, stored, operator, fresh });
  state.current = { display, stored, operator, fresh };
  const digit = (value: string) => { setFresh(false); setDisplay((current) => current === '0' || state.current.fresh ? value : `${current}${value}`); };
  const dot = () => { setFresh(false); setDisplay((value) => state.current.fresh ? '0.' : value.includes('.') ? value : `${value}.`); };
  const operate = (next: string) => { setStored(Number(state.current.display)); setOperator(next); setFresh(true); };
  const clearAll = () => { setDisplay('0'); setStored(undefined); setOperator(undefined); setFresh(true); };
  const backspace = () => setDisplay((value) => value.length > 1 ? value.slice(0, -1) : '0');
  const equals = async () => { const { stored: left, operator: op, display: cur } = state.current; if (left === undefined || !op) return; const right = Number(cur); const result = op === '+' ? left + right : op === '−' ? left - right : op === '×' ? left * right : right === 0 ? 0 : left / right; const expr = `${left} ${op} ${right}`; await runOperation(manifest, computer, 'calculate', { expression: `${left}${op.replace('×', '*').replace('÷', '/')}${right}` }); setDisplay(String(result)); setStored(undefined); setOperator(undefined); setFresh(true); setHistory((items) => [`${expr} = ${result}`, ...items].slice(0, 12)); };
  const sci = (fn: string) => { const n = Number(state.current.display); const r = fn === '√' ? Math.sqrt(n) : fn === 'x²' ? n * n : fn === 'sin' ? Math.sin(n) : fn === 'cos' ? Math.cos(n) : fn === 'ln' ? Math.log(n) : fn === '1/x' ? (n === 0 ? 0 : 1 / n) : n; setDisplay(String(Number(r.toFixed(8)))); setFresh(true); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const k = event.key;
      if (/^[0-9]$/.test(k)) { digit(k); event.preventDefault(); }
      else if (k === '.') { dot(); event.preventDefault(); }
      else if (k === '+') operate('+');
      else if (k === '-') operate('−');
      else if (k === '*') operate('×');
      else if (k === '/') { operate('÷'); event.preventDefault(); }
      else if (k === 'Enter' || k === '=') { event.preventDefault(); void equals(); }
      else if (k === 'Escape' || k.toLowerCase() === 'c') clearAll();
      else if (k === 'Backspace') { backspace(); event.preventDefault(); }
      else if (k === '%') setDisplay((v) => String(Number(v) / 100));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return <div className="calculator-app surface-calculator" tabIndex={0}><header><Brand manifest={manifest}/><button className={scientific ? 'operator' : ''} onClick={() => setScientific((v) => !v)}>Scientific⌄</button><button onClick={() => setMenuOpen((v) => !v)}>☰</button></header>{menuOpen && <div className="calculator-history" style={{ maxHeight: 120, overflowY: 'auto' }}>{history.length === 0 ? <small>No history yet</small> : history.map((line, index) => <small key={index} style={{ display: 'block' }}>{line}</small>)}</div>}<output>{display}</output><div className="calculator-history"><small>{stored === undefined ? (history[0] ?? 'History') : `${stored} ${operator}`}</small></div>{scientific && <div className="calculator-keys" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>{['√','x²','sin','cos','ln','1/x'].map((key) => <button key={key} onClick={() => sci(key)}>{key}</button>)}</div>}<div className="calculator-keys">{['C','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','='].map((key) => <button className={['÷','×','−','+','='].includes(key) ? 'operator' : ''} key={key} onClick={() => key === 'C' ? clearAll() : /^\d$/.test(key) ? digit(key) : key === '.' ? dot() : key === '=' ? void equals() : ['÷','×','−','+'].includes(key) ? operate(key) : key === '±' ? setDisplay((v) => String(-Number(v))) : key === '%' ? setDisplay((v) => String(Number(v) / 100)) : undefined}>{key}</button>)}</div></div>;
}
