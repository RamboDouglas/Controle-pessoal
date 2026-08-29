/* Carrega o <script> do index.html num sandbox, com o mínimo de DOM falso para
   as funções puras rodarem. Assim os testes acompanham o arquivo real: se
   alguém apagar uma função, o teste quebra junto. */
import fs from 'node:fs';
import vm from 'node:vm';

export function carregarApp({ storage = {}, comChart = false, quotaCheia = false } = {}) {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('não achei o <script> inline no index.html');

  const elementoFalso = () => ({
    value: '', textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){},
    querySelector(){ return elementoFalso(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { width: 0, height: 0 }; }
  });

  const local = new Map(Object.entries(storage));
  const localStorage = {
    getItem: k => (local.has(k) ? local.get(k) : null),
    setItem: (k, v) => {
      if (quotaCheia) { const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e; }
      local.set(k, String(v));
    },
    removeItem: k => local.delete(k),
    get chaves() { return [...local.keys()]; }
  };

  const sandbox = {
    console, Intl, Date, Math, JSON, RegExp, Number, String, Array, Object, Error, isFinite,
    setTimeout, clearTimeout, URL, Blob: class {}, FileReader: class {},
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage,
    navigator: {},
    location: { protocol: 'file:' },
    window: { addEventListener(){} },
    document: {
      addEventListener(){},
      getElementById: () => elementoFalso(),
      querySelector: () => elementoFalso(),
      querySelectorAll: () => [],
      createElement: () => elementoFalso(),
      body: elementoFalso(),
      documentElement: {},
      contains: () => false
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#252535' })
  };
  if (comChart) sandbox.Chart = { defaults: { font: {} } };

  const contexto = vm.createContext(sandbox);
  vm.runInContext(m[1], contexto, { filename: 'index.html:<script>' });
  /* Declarações `let` e `const` não viram propriedade do objeto global, então
     variáveis de estado como `tx` só são alcançáveis avaliando no contexto. */
  const ler = expressao => vm.runInContext(expressao, contexto);
  return { ...contexto, localStorage, ler };
}
