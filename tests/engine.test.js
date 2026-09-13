/* tests/engine.test.js — cobertura das funções puras do motor de decisão (js/engine.js).
   Roda com o test runner nativo do Node: `node --test tests/` (ou `npm test`).
   engine.js não depende de navegador (sem document/window/fetch), então roda direto aqui,
   sem precisar simular um DOM. */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { newAquarium, SPECIES } from '../js/model.js';
import {
  fmtNum, bioload, compatibility, canAddFish, tpaCalc, primeDose,
  specOf, allSpecies, zeroStreak, statusOf
} from '../js/engine.js';

/* ---------------- fixtures ---------------- */
function aquario(over = {}) {
  return Object.assign(newAquarium(), { volUtil: 80, volBruto: 96, livestock: [], tests: [] }, over);
}
function daysAgoISO(n) { return new Date(Date.now() - n * 86400000).toISOString(); }
function mkTest(vals, daysAgo) { return Object.assign({ at: daysAgoISO(daysAgo) }, vals); }

/** Aquário com ciclo confirmado: 3 medições em 0/0 ao longo de 6 dias, mais um pico
 *  histórico registrado (sawPeak) — é o cenário "liberado" que a regra de povoamento exige. */
function cycledAquarium(over = {}) {
  const tests = [
    mkTest({ nh3: 0, no2: 0, no3: 10, ph: 7, temp: 25 }, 0),
    mkTest({ nh3: 0, no2: 0, no3: 12, ph: 7, temp: 25 }, 3),
    mkTest({ nh3: 0, no2: 0, no3: 15, ph: 7, temp: 25 }, 6),
    mkTest({ nh3: 0.5, no2: 0.25, no3: 5, ph: 7, temp: 25 }, 20)
  ];
  return aquario(Object.assign({ tests }, over));
}

/* ================= fmtNum — o bug do "80 L" virando "8 L" ================= */
describe('fmtNum', () => {
  test('não corta o zero final de números inteiros terminados em zero', () => {
    assert.equal(fmtNum(80, 0), '80');
    assert.equal(fmtNum(20, 0), '20');
    assert.equal(fmtNum(100, 0), '100');
    assert.equal(fmtNum(10, 0), '10');
  });
  test('mantém intactos números que não terminam em zero', () => {
    assert.equal(fmtNum(96, 0), '96');
    assert.equal(fmtNum(8, 0), '8');
  });
  test('corta zero à direita só da parte decimal', () => {
    assert.equal(fmtNum(79.5, 2), '79,5');
    assert.equal(fmtNum(6, 2), '6');
    assert.equal(fmtNum(1.1, 2), '1,1');
  });
  test('valores ausentes viram travessão', () => {
    assert.equal(fmtNum(null), '—');
    assert.equal(fmtNum(undefined), '—');
    assert.equal(fmtNum(''), '—');
    assert.equal(fmtNum('abc'), '—');
  });
});

/* ================= carga biológica ================= */
describe('bioload', () => {
  test('capacidade é 1 unidade a cada 10 L úteis', () => {
    const aq = aquario();
    assert.equal(bioload(aq).capacity, 8); // 80 / 10
  });
  test('soma o fator de carga de cada espécie viva, ignorando óbito e removido', () => {
    const aq = aquario({
      livestock: [
        { id: '1', spec: 'neon', qty: 8, status: 'ativo' },  // bio 0.5 × 8 = 4
        { id: '2', spec: 'cory', qty: 6, status: 'ativo' },  // bio 1.0 × 6 = 6
        { id: '3', spec: 'betta', qty: 1, status: 'obito' }, // não conta
        { id: '4', spec: 'guppy', qty: 3, status: 'removido' } // não conta
      ]
    });
    assert.equal(bioload(aq).used, 10);
  });
  test('espécie customizada usa o "bio" cadastrado pelo usuário/IA', () => {
    const aq = aquario({
      customSpecies: [{ id: 'custom_x', n: 'Peixe Teste', bio: 2, adult: 5, zona: 'fundo', grupo: 1, temp: [20, 28], ph: [6, 8], camarao: 'baixo', planta: 'baixo', betta: 'ok' }],
      livestock: [{ id: '1', spec: 'custom_x', qty: 2, status: 'ativo' }]
    });
    assert.equal(bioload(aq).used, 4);
  });
});

/* ================= compatibilidade ================= */
describe('compatibility', () => {
  test('bloqueia se o volume é pequeno demais para o porte adulto', () => {
    const aq = cycledAquarium({ volUtil: 10 });
    const c = compatibility(aq, 'betta', 1); // adulto 6,5 cm → precisa de pelo menos 39 L
    assert.equal(c.level, 'bad');
  });
  test('avisa cardume insuficiente sem bloquear', () => {
    const aq = cycledAquarium();
    const c = compatibility(aq, 'neon', 2); // grupo mínimo é 8
    assert.equal(c.level, 'warn');
    assert.ok(c.notes.some((n) => n.toLowerCase().includes('cardume')));
  });
  test('herda o bloqueio do portão de povoamento quando o ciclo não está confirmado', () => {
    const aq = aquario({ tests: [mkTest({ nh3: 0.25, no2: 0, no3: 5, ph: 7, temp: 25 }, 0)] });
    const c = compatibility(aq, 'neon', 8);
    assert.equal(c.level, 'bad');
  });
});

/* ================= portão de povoamento ================= */
describe('canAddFish', () => {
  test('nunca libera com amônia acima de zero', () => {
    const aq = aquario({ tests: [mkTest({ nh3: 0.25, no2: 0, no3: 5, ph: 7, temp: 25 }, 0)] });
    const r = canAddFish(aq);
    assert.equal(r.level, 'bad');
    assert.match(r.reasons[0], /Amônia/);
  });
  test('nunca libera com nitrito acima de zero', () => {
    const aq = aquario({ tests: [mkTest({ nh3: 0, no2: 0.1, no3: 5, ph: 7, temp: 25 }, 0)] });
    assert.equal(canAddFish(aq).level, 'bad');
  });
  test('uma única medição em 0/0 não confirma estabilidade', () => {
    const aq = aquario({ tests: [mkTest({ nh3: 0, no2: 0, no3: 5, ph: 7, temp: 25 }, 0)] });
    assert.equal(canAddFish(aq).level, 'warn');
  });
  test('libera quando o ciclo está confirmado e os parâmetros estão na faixa', () => {
    assert.equal(canAddFish(cycledAquarium()).level, 'ok');
  });
  test('sem nenhuma medição, pede os dados em vez de liberar', () => {
    const aq = aquario({ tests: [] });
    const r = canAddFish(aq);
    assert.equal(r.level, 'bad');
    assert.ok(r.missing.length > 0);
  });
});

/* ================= sequência de zeros (base da confirmação de ciclo) ================= */
describe('zeroStreak', () => {
  test('conta só a sequência mais recente, para no primeiro valor diferente de zero', () => {
    const aq = aquario({
      tests: [
        mkTest({ nh3: 0, no2: 0 }, 0),
        mkTest({ nh3: 0, no2: 0 }, 2),
        mkTest({ nh3: 0.1, no2: 0 }, 4),
        mkTest({ nh3: 0, no2: 0 }, 10)
      ]
    });
    assert.equal(zeroStreak(aq).count, 2);
  });
});

/* ================= dosagem ================= */
describe('tpaCalc / primeDose', () => {
  test('20% de TPA em 80 L úteis dá 16 L de água nova', () => {
    assert.equal(tpaCalc(aquario(), 20).liters, 16);
  });
  test('Prime segue a regra do rótulo: 5 mL para 200 L de água nova', () => {
    assert.equal(primeDose(200).ml, 5);
  });
  test('a dose de Prime da TPA bate com o cálculo direto de primeDose', () => {
    const c = tpaCalc(aquario(), 20); // 16 L de água nova
    assert.equal(c.prime.ml, primeDose(16).ml);
  });
});

/* ================= status de parâmetro ================= */
describe('statusOf', () => {
  test('parâmetro crítico (amônia): qualquer valor acima do máximo é crítico, sem meio-termo', () => {
    const aq = aquario();
    assert.equal(statusOf(aq, 'nh3', 0), 'ok');
    assert.equal(statusOf(aq, 'nh3', 0.01), 'bad');
  });
});

/* ================= espécies (base fixa + catálogo customizado) ================= */
describe('specOf / allSpecies', () => {
  test('resolve espécie da base fixa pelo id', () => {
    assert.equal(specOf(aquario(), 'neon').n, 'Neon-tetra');
  });
  test('prioriza espécie customizada com o mesmo id sobre a base fixa', () => {
    const aq = aquario({ customSpecies: [{ id: 'cory', n: 'Sobrescrita' }] });
    assert.equal(specOf(aq, 'cory').n, 'Sobrescrita');
  });
  test('cai no fallback "outro" para um id desconhecido', () => {
    assert.equal(specOf(aquario(), 'nao-existe-123').id, 'outro');
  });
  test('allSpecies soma a base fixa com o catálogo customizado do aquário', () => {
    const aq = aquario({ customSpecies: [{ id: 'custom_1', n: 'Nova espécie' }] });
    assert.equal(allSpecies(aq).length, SPECIES.length + 1);
  });
});
