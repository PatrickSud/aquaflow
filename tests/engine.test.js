/* tests/engine.test.js — cobertura das funções puras do motor de decisão (js/engine.js).
   Roda com o test runner nativo do Node: `node --test tests/` (ou `npm test`).
   engine.js não depende de navegador (sem document/window/fetch), então roda direto aqui,
   sem precisar simular um DOM. */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { newAquarium, SPECIES } from '../js/model.js';
import {
  fmtNum, bioload, compatibility, canAddFish, tpaCalc, primeDose,
  specOf, allSpecies, zeroStreak, statusOf, stockingOrderIssues
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
  test('capacidade é 1 unidade a cada 8 L úteis', () => {
    const aq = aquario();
    assert.equal(bioload(aq).capacity, 10); // 80 / 8
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

  test('sem a vazão do filtro informada, o fator fica neutro (comportamento de antes)', () => {
    const bl = bioload(aquario());
    assert.equal(bl.turnover, null);
    assert.equal(bl.filterFactor, 1);
    assert.equal(bl.capacity, bl.baseCapacity);
  });
  test('filtro fraco reduz a capacidade, com piso de 60% da base', () => {
    // 100 L/h em 80 L úteis = giro de 1,25×/h (referência é 4×/h) → fator abaixo do piso, trava em 0,6
    const bl = bioload(aquario({ equip: { vazao: 100 } }));
    assert.equal(bl.filterFactor, 0.6);
    assert.equal(bl.capacity, 6); // 10 × 0,6
  });
  test('filtro dentro da faixa usual (4-6×/h) não penaliza — pelo menos fica neutro', () => {
    // 350 L/h em 80 L úteis = giro de 4,375×/h — dentro da faixa comum p/ comunitário/plantado
    const bl = bioload(aquario({ equip: { vazao: 350 } }));
    assert.ok(bl.filterFactor >= 1, `esperava fator >= 1, veio ${bl.filterFactor}`);
  });
  test('filtro forte aumenta a capacidade, com teto de 140% da base', () => {
    // 800 L/h em 80 L úteis = giro de 10×/h → bem acima da referência, trava em 1,4
    const bl = bioload(aquario({ equip: { vazao: 800 } }));
    assert.equal(bl.filterFactor, 1.4);
    assert.equal(bl.capacity, 14); // 10 × 1,4
  });
  test('plantio denso dá um bônus modesto de 20% sobre a base', () => {
    const bl = bioload(aquario({ plantDensity: 'densa' }));
    assert.equal(bl.plantFactor, 1.2);
    assert.equal(bl.capacity, 12); // 10 × 1,2
  });
  test('margem de segurança: filtro forte + plantio denso juntos não passam de 150% da base', () => {
    // 1,4 (filtro) × 1,2 (plantio) = 1,68 sem o teto — a margem de segurança trava em 1,5
    const bl = bioload(aquario({ equip: { vazao: 800 }, plantDensity: 'densa' }));
    assert.equal(bl.capacity, 15); // 10 × 1,5, não 10 × 1,68
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
  test('desatualizado usa a data da amônia/nitrito específica, não do teste mais recente de qualquer tipo', () => {
    // teste de hoje só tem pH/temperatura (sem amônia/nitrito) — não deveria "renovar"
    // a validade de uma leitura de amônia/nitrito de 5 dias atrás.
    const aq = aquario({
      tests: [
        mkTest({ ph: 7, temp: 25 }, 0),
        mkTest({ nh3: 0, no2: 0, no3: 10, ph: 7, temp: 25 }, 5)
      ]
    });
    const r = canAddFish(aq);
    assert.equal(r.level, 'bad');
    assert.match(r.title, /desatualizado/i);
  });
  test('não fica "desatualizado" se a leitura mais recente de qualquer tipo for antiga mas amônia/nitrito forem de hoje', () => {
    const aq = cycledAquarium({
      tests: [
        mkTest({ nh3: 0, no2: 0, no3: 10, ph: 7, temp: 25 }, 0),
        mkTest({ nh3: 0, no2: 0, no3: 12, ph: 7, temp: 25 }, 3),
        mkTest({ nh3: 0, no2: 0, no3: 15, ph: 7, temp: 25 }, 6),
        mkTest({ nh3: 0.5, no2: 0.25, no3: 5, ph: 7, temp: 25 }, 20)
      ]
    });
    assert.equal(canAddFish(aq).level, 'ok');
  });
  test('aquário declarado como já ciclado dispensa o histórico de 3 medições/5 dias, mas não a amônia/nitrito de hoje', () => {
    const aq = aquario({
      tests: [mkTest({ nh3: 0, no2: 0, no3: 5, ph: 7, temp: 25 }, 0)], // uma única medição, sem pico registrado
      cycling: { active: true, start: new Date().toISOString().slice(0, 10), phase: 1, done: false, doneAt: null, declaredMature: true, declaredMatureAt: new Date().toISOString() }
    });
    assert.equal(canAddFish(aq).level, 'ok');
  });
  test('aquário declarado como já ciclado ainda bloqueia se a amônia/nitrito de hoje não estiverem em 0', () => {
    const aq = aquario({
      tests: [mkTest({ nh3: 0.1, no2: 0, no3: 5, ph: 7, temp: 25 }, 0)],
      cycling: { active: true, start: new Date().toISOString().slice(0, 10), phase: 1, done: false, doneAt: null, declaredMature: true, declaredMatureAt: new Date().toISOString() }
    });
    assert.equal(canAddFish(aq).level, 'bad');
  });
});

/* ================= ordem do plano de povoamento (regra do Betta por último) ================= */
describe('stockingOrderIssues', () => {
  test('sem problema quando o Betta é o último lote não introduzido', () => {
    const aq = aquario({ stocking: { plan: [{ id: 's1', spec: 'neon', qty: 8, done: false }, { id: 's2', spec: 'betta', qty: 1, done: false }] } });
    assert.equal(stockingOrderIssues(aq).length, 0);
  });
  test('aponta problema quando o Betta está antes de outro lote não introduzido', () => {
    const aq = aquario({ stocking: { plan: [{ id: 's1', spec: 'betta', qty: 1, done: false }, { id: 's2', spec: 'neon', qty: 8, done: false }] } });
    assert.equal(stockingOrderIssues(aq).length, 1);
  });
  test('ignora lotes já introduzidos ao decidir se o Betta está por último', () => {
    const aq = aquario({ stocking: { plan: [{ id: 's1', spec: 'neon', qty: 8, done: true }, { id: 's2', spec: 'betta', qty: 1, done: false }] } });
    assert.equal(stockingOrderIssues(aq).length, 0);
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
  test('um teste com só um dos dois parâmetros medido (e em 0) não quebra a sequência', () => {
    const aq = aquario({
      tests: [
        mkTest({ nh3: 0 }, 0),          // só amônia medida hoje, em 0
        mkTest({ nh3: 0, no2: 0 }, 2),
        mkTest({ nh3: 0, no2: 0 }, 4)
      ]
    });
    const z = zeroStreak(aq);
    assert.equal(z.count, 2); // só conta os dois testes completos, mas não quebrou por causa do parcial
  });
  test('um valor medido e maior que zero quebra a sequência mesmo se for o único parâmetro daquele teste', () => {
    const aq = aquario({
      tests: [
        mkTest({ nh3: 0.2 }, 0),        // só amônia medida hoje, mas positiva: quebra
        mkTest({ nh3: 0, no2: 0 }, 2),
        mkTest({ nh3: 0, no2: 0 }, 4)
      ]
    });
    assert.equal(zeroStreak(aq).count, 0);
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
  test('allSpecies não duplica quando uma espécie da base fixa foi personalizada (mesmo id)', () => {
    const aq = aquario({ customSpecies: [{ id: 'cory', n: 'Corydora personalizada' }] });
    const all = allSpecies(aq);
    assert.equal(all.length, SPECIES.length); // substitui, não soma
    assert.equal(all.filter((s) => s.id === 'cory').length, 1);
    assert.equal(all.find((s) => s.id === 'cory').n, 'Corydora personalizada');
  });
});
