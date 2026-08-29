/* Cada teste aqui corresponde a um defeito encontrado na auditoria e traz o
   código do achado. Todos foram vistos falhando com o defeito reintroduzido —
   uma guarda que nunca falhou não é guarda. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carregarApp } from './harness.mjs';

test('o script do index.html carrega sem lançar', () => {
  const app = carregarApp();
  assert.equal(typeof app.loadTx, 'function');
  assert.equal(typeof app.saveTx, 'function');
});

/* ---------------------------------------------------------- DADOS-01 */
test('DADOS-01: localStorage ilegível não derruba a inicialização', () => {
  const app = carregarApp({ storage: { finapp_v3: '{isso nao e json' } });
  assert.doesNotThrow(() => app.loadTx());
  // o array vem de outro realm (vm), entao compara-se o conteudo, nao o prototipo
  assert.equal(app.ler('tx').length, 0, 'deve abrir vazio em vez de quebrar');
});

test('DADOS-01: o conteúdo ilegível é preservado, não descartado', () => {
  const app = carregarApp({ storage: { finapp_v3: 'lixo' } });
  app.loadTx();
  const copia = app.localStorage.chaves.find(k => k.startsWith('finapp_v3_ilegivel_'));
  assert.ok(copia, 'devia ter guardado uma cópia do conteúdo original');
  assert.equal(app.localStorage.getItem(copia), 'lixo');
});

test('DADOS-01: um JSON válido que não é lista também não quebra', () => {
  const app = carregarApp({ storage: { finapp_v3: '{"a":1}' } });
  assert.doesNotThrow(() => app.loadTx());
  assert.equal(app.ler('tx').length, 0);
});

test('lista válida é carregada normalmente', () => {
  const app = carregarApp({ storage: { finapp_v3: '[{"id":1,"amount":10}]' } });
  app.loadTx();
  assert.equal(app.ler('tx').length, 1);
});

/* ---------------------------------------------------------- DADOS-03 */
test('DADOS-03: saveTx devolve false quando o armazenamento recusa', () => {
  const app = carregarApp({ quotaCheia: true });
  assert.equal(app.saveTx(), false, 'não pode dizer que salvou');
});

test('saveTx devolve true quando grava', () => {
  const app = carregarApp();
  assert.equal(app.saveTx(), true);
});

/* ---------------------------------------------------------- SEG-01 e SEG-02 */
test('SEG-01: campo iniciado por = não vira fórmula na planilha', () => {
  const app = carregarApp();
  for (const inicio of ['=', '+', '-', '@']) {
    const saida = app.campoCSV(inicio + '1+1');
    assert.ok(saida.startsWith('"\''), `${inicio} deveria ser neutralizado, veio ${saida}`);
  }
});

test('SEG-02: aspas internas são duplicadas conforme o RFC 4180', () => {
  const app = carregarApp();
  assert.equal(app.campoCSV('Padaria "do Ze"'), '"Padaria ""do Ze"""');
});

test('campo comum passa intacto', () => {
  const app = carregarApp();
  assert.equal(app.campoCSV('Mercado'), '"Mercado"');
  assert.equal(app.campoCSV(null), '""');
});

/* ---------------------------------------------------------- COR-01 */
test('COR-01: ids gerados em sequência não colidem', () => {
  const app = carregarApp();
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(app.novoId());
  assert.equal(ids.size, 500, 'todos os ids têm de ser distintos');
});

test('COR-01: ids antigos (número) e novos (texto) se comparam', () => {
  const app = carregarApp();
  assert.ok(app.mesmoId(1756400000000, '1756400000000'));
  assert.ok(!app.mesmoId('a', 'b'));
});

/* ---------------------------------------------------------- COR-03 */
test('COR-03: a grade de Entrada não oferece categoria de despesa', () => {
  const app = carregarApp();
  const chaves = app.categoriasDe('entrada').map(([k]) => k);
  for (const despesa of ['moradia', 'saude', 'alimentacao', 'transporte', 'vestuario']) {
    assert.ok(!chaves.includes(despesa), `${despesa} não deveria aparecer numa entrada`);
  }
  assert.ok(chaves.includes('salario'));
});

test('COR-03: a grade de Saída não oferece Salário', () => {
  const app = carregarApp();
  const chaves = app.categoriasDe('saida').map(([k]) => k);
  assert.ok(!chaves.includes('salario'));
  assert.ok(chaves.includes('moradia'));
});

/* ---------------------------------------------------------- DADOS-02 */
test('DADOS-02: backup válido é aceito e normalizado', () => {
  const app = carregarApp();
  const lista = app.lerPacoteDeBackup(JSON.stringify({
    formato: 'controle-pessoal-backup', versao: 1,
    transacoes: [{ id: 'x', type: 'entrada', category: 'salario',
                   description: 'Salário', amount: 100, date: '2026-08-01' }]
  }));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].amount, 100);
  assert.equal(lista[0].status, 'pago');
});

test('DADOS-02: backup com data inválida é recusado', () => {
  const app = carregarApp();
  assert.throws(() => app.lerPacoteDeBackup(JSON.stringify({
    transacoes: [{ amount: 1, date: '01/08/2026' }]
  })), /data inv/);
});

test('DADOS-02: backup com valor não numérico é recusado', () => {
  const app = carregarApp();
  assert.throws(() => app.lerPacoteDeBackup(JSON.stringify({
    transacoes: [{ amount: 'muito', date: '2026-08-01' }]
  })), /valor inv/);
});

test('DADOS-02: arquivo que não é backup é recusado', () => {
  const app = carregarApp();
  assert.throws(() => app.lerPacoteDeBackup('{"qualquer":"coisa"}'), /lista de lan/);
});

test('DADOS-02: categoria desconhecida cai em outros em vez de sumir', () => {
  const app = carregarApp();
  const [t] = app.lerPacoteDeBackup(JSON.stringify({
    transacoes: [{ category: 'inexistente', amount: 5, date: '2026-08-01' }]
  }));
  assert.equal(t.category, 'outros');
});

/* ---------------------------------------------------------- valores em pt-BR */
test('valor com vírgula decimal é lido corretamente', () => {
  const app = carregarApp();
  assert.equal(app.parseVal('1250,90'), 1250.9);
  assert.equal(app.parseVal('1.250,90'), 1250.9);
  assert.equal(app.parseVal('1250.90'), 1250.9);
  assert.equal(app.parseVal('R$ 80,00'), 80);
  assert.ok(Number.isNaN(app.parseVal('')));
});

/* ---------------------------------------------------------- escape */
test('texto do usuário é escapado antes de ir para innerHTML', () => {
  const app = carregarApp();
  assert.equal(app.esc('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(app.esc('a & "b"'), 'a &amp; &quot;b&quot;');
});

/* ---------------------------------------------------------- SEG-03 */
test('SEG-03: o Chart.js é carregado com verificação de integridade', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tag = html.match(/<script[^>]*cdn\.jsdelivr[^>]*>/s);
  assert.ok(tag, 'não achei a tag do CDN');
  assert.match(tag[0], /integrity="sha384-/, 'faltou o integrity');
  assert.match(tag[0], /crossorigin=/, 'faltou o crossorigin');
});

test('o app não quebra se o Chart.js não carregar', () => {
  const app = carregarApp({ comChart: false });
  assert.doesNotThrow(() => app.renderChartMensal());
  assert.doesNotThrow(() => app.renderChartCat());
});
