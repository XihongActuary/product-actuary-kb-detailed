// ===== 定价实验室引擎（年金保险 · 公式法迭代定价） =====
// 口径要点：
//   定价：GP_x = [Σ(DB×C + SB×D) + 满期×D_{x+T}] / Σ_{t≤h} D×(1−e_t)，迭代求解
//   现价：初期口径(i+2%)与终极口径(定价利率)两套保单价值准备金PVR，CV = r×max(PVR,0)
//         年度融合：t≤1 用初期；1<t<4 线性插值；t≥4 用终极
//   准备金：一年期完全修正法（FPT）+ 保费不足准备金，tV = max(tV*+tV^d, tCV)
// 依赖：occ-data.js 的 LIFE2025（生命表2025，CL1-CL4，单位‰，0-105岁106点）
//        life2010.js 的 LIFE2010（生命表2010-2013，保监发〔2016〕107号，CL1-CL6，单位‰）
//        表版本 cfg.tblVer：'2025'（默认）/ '2010'；2010 版按性别映射（见 plQxTab）

var PL_EXP_PRICING = {   // 定价预定附加费用率（银保监办发〔2020〕7号上限内，报告§2.3默认值；续期默认 2%）
  1: [0, 0.05],
  3: [0, 0.15, 0.02, 0.02],
  5: [0, 0.235, 0.02, 0.02, 0.02, 0.02]
};
var PL_EXP_CV = {        // 保单价值准备金计算基础附加费用率（报告§3.1.1/3.2.1默认值）
  1: [0, 0.08],
  3: [0, 0.30, 0.20, 0.15],
  5: [0, 0.30, 0.20, 0.15, 0.10, 0.10]
};
var PL_EXP_CV_PLAIN = {  // 普通型两全现价基础附加费用率（报告§3.1 原始值：趸交 10%）
  1: [0, 0.10]
};
var PL_EXP_PRICING_PLAIN = {  // 普通型两全定价预定附加费用率（趸交 1.3%）
  1: [0, 0.013]
};

// 产品类型 → 自动发生率表（金规〔2025〕21号选表规则：按主要责任定基准表）
var PL_TABLE_AUTO = {
  annuity:    { table: 'cl1', name: 'CL1(2025) 养老类业务表', note: '' },
  annuity_immediate: { table: 'cl1', name: 'CL1(2025) 养老类业务表', note: '' },
  endowment:  { table: 'cl1', name: 'CL1(2025) 养老类业务表', note: '' },
  endowment2: { table: 'cl3', name: 'CL3(2025) 非养老类业务二表', note: '' },
  ci:         { table: 'cl2', name: 'CL2(2025) 生命表（身故发生率）＋ CI4(2020) 重疾发生率（28重度疾病病种）',
    note: '重疾侧采用《中国人身保险业重大疾病经验发生率表（2020）》CI4（28重度疾病病种，2020版定义）；身故侧采用生命表2025 基础表，重疾身故占比配套用 K2 表。' },
  // 普通型两全：默认采用生命表2010-2013 非养老类业务二表 ×70%（2010 版原表已内置）
  endowment3: { table: 'cl3', tblVer: '2010', factor: 70, name: '生命表2010-2013 非养老类业务二表 ×70%（男 CL3 / 女 CL4）',
    note: '已内置 <b>生命表2010-2013 原表</b>（保监发〔2016〕107号，按性别分表），自动按性别取 <b>非养老类业务二表：男=CL3、女=CL4</b>；也可在「发生率表」区块手工切换回生命表2025。' },
  wholelife:  { table: 'cl2', name: 'CL2(2025) 非养老类业务一表', note: '' },
  savings:    { table: 'cl3', name: 'CL3(2025) 非养老类业务二表', note: '' },
  single:     { table: 'cl4', name: 'CL4(2025) 单一生命体表', note: '' }
};

// 产品类型默认参数（报告口径）
var PL_TYPE_DEFAULTS = {
  annuity:    { i: 2.0,  iMax: 2.0,  icv1: 4.0,  icv2: 2.0,  ageMax: 80 },
  annuity_immediate: { i: 2.0,  iMax: 2.0,  icv1: 4.0,  icv2: 2.0,  ageMax: 80 },
  endowment:  { i: 1.75, iMax: 1.75, icv1: 3.25, icv2: 1.75, ageMax: 75 },
  // 中短期两全：现价单口径 = 预定利率+1.0%（93号：保险期间10年及以下）
  endowment2: { i: 1.75, iMax: 1.75, icv1: 2.75, icv2: 2.75, ageMax: 75 },
  // 疾病保险（重大疾病保险）：投保20–50周岁
  ci:         { i: 2.0,  iMax: 2.0,  icv1: 4.0,  icv2: 4.0,  ageMin: 20, ageMax: 50 },
  // 普通型两全：趸交、6年期、投保18–75周岁
  //   定价利率 2.0%；现价利率 4.0%（= 预定利率 + 2%，银保监办发〔2020〕7号第九条，传统型）；
  //   现价单口径（无初期/终极融合）；定价费用率 趸交 1.3%；现价费用率 趸交 10%；
  //   身故金 = Max(累计保费×R, 现价)，R 分档 ≤41→160% / ≤61→140% / >61→120%；
  //   满期金 = 基本保险金额；首年含180日规则（DB₁ = 0.5×Max(…)+0.5×GP）
  endowment3: { i: 2.0,  iMax: 2.0,  icv1: 4.0,  icv2: 4.0,  ageMax: 75, ageMin: 18, single: true, plain: true }
};
// ---- 通用化（2026-09-03）：保险期间 / 交费期间双模式 ----
// 保险期间：mode='age' 保至X周岁（bt = X − x）；mode='years' 保N年（bt = N）
// 交费期间：mode='years' N年交（pt = N）；mode='age' 交至N周岁（pt = N − x）
var PL_TERM_DEFAULTS = {
  annuity:    { mode: 'age',   age: 105, years: 20,
    note: '养老类年金默认保险期间<b>保至105周岁</b>（T = 105 − x）；满期年龄 X 可填写其他周岁（如 88/100，T = X − x，上限 105）；可切换「保N年」（bt = N，满期年龄 = x + N）。' },
  annuity_immediate: { mode: 'age',   age: 105, years: 20,
    note: '即期年金默认保险期间<b>保至105周岁</b>（T = 105 − x）；满期年龄 X 可填写其他周岁（如 88/100，T = X − x，上限 105）；可切换「保N年」（bt = N，满期年龄 = x + N）。' },
  endowment:  { mode: 'age',   age: 100, years: 20,
    note: '报告§2.4：保险期间<b>保至100周岁</b>（bt = 100 − x）；可切换「保N年」（bt = N，满期年龄 = x + N）。<b>切换保险期间时，初期现价利率按法定规则自动重算</b>（分红型：≤10年 +1.0%、>10年 +1.5%）。' },
  endowment2: { mode: 'years', age: 60,  years: 5,
    note: '默认 <b>5 年</b>（bt = N，满期金于第 N 个保单年度末按基本保险金额给付），N 可输入任意年数；可切换「保至X周岁」（bt = X − x）。10 年及以下现价计算用利率 = 预定利率 +1.0%（保监发〔2015〕93号）。' },
  endowment3: { mode: 'years', age: 60,  years: 6,
    note: '保险期间<b>6 年</b>（默认，bt = N，满期金于第 N 个保单年度末按基本保险金额给付），N 可输入任意年数；可切换「保至X周岁」（bt = X − x）。10 年及以下现价计算用利率 = 预定利率 + 2%（银保监办发〔2020〕7号第九条，传统型），<b>单口径</b>无初期/终极融合。' },
  ci:         { mode: 'age',   age: 65,  years: 20,
    note: '保险期间<b>保至 65 周岁</b>（bt = 65 − x），X 可输入任意满期年龄；可切换「保N年」（bt = N）。本产品<b>无满期给付</b>：保险期间届满合同终止，故末年现金价值为 0。' }
};
var PL_H_DEFAULTS = {
  annuity:    { mode: 'years', years: 5,  age: 60 },
  annuity_immediate: { mode: 'years', years: 5,  age: 60 },
  endowment:  { mode: 'years', years: 1,  age: 60 },
  endowment2: { mode: 'years', years: 1,  age: 60 },
  endowment3: { mode: 'years', years: 1,  age: 60 },
  ci:         { mode: 'years', years: 20, age: 60 }
};
// 保险责任默认参数（按产品类型配置；切类型时由 applyBeneDefaults 同步重置——支持的→报告口径默认；不支持的→取消勾选清空）
// 4 类年金责任（care/ann/mat/death）均含 opt1/opt2 双选项；opt1 默认"到达年龄/累计保费"或"分段/分段"（适合即期年金）；
// opt2 默认"保单年度/基本保额"或"固定比例"（适合养老年金）。applyBeneDefaults 会按 type 决定默认 opt 与显示哪个 opt-box。
var PL_BENE_DEFAULTS_BY_TYPE = {
  // 养老年金：默认走 opt2 + SA 基础 + 满期 100% + 身故 max(保费, 现价)
  annuity: {
    care:    { on: true, opt: 'opt2', opt1_age: 85, opt1_pct: 100, opt2_year: 6, opt2_pct: 100 },
    ann:     { on: true, opt: 'opt2', opt1_start: 0, opt1_count: 10, opt1_basis1: 'premPct', opt1_pct1: 2.75, opt1_basis2: 'saPct', opt1_pct2: 100, opt2_start: 7, opt2_basis: 'premPct', opt2_pct: 2 },
    mat:     { on: true, pct: 100 },
    death:   { on: true, opt: 'opt2', opt1_split: 10, opt1_before: 100, opt1_after: 0 }
  },
  // 即期年金：默认走 opt1 + 累计保费基础 + 满期 0%（合同终止）+ 前 10 年身故返本
  annuity_immediate: {
    care:    { on: true, opt: 'opt1', opt1_age: 85, opt1_pct: 100, opt2_year: 6, opt2_pct: 100 },
    ann:     { on: true, opt: 'opt1', opt1_start: 0, opt1_count: 10, opt1_basis1: 'premPct', opt1_pct1: 2.75, opt1_basis2: 'saPct', opt1_pct2: 100, opt2_start: 7, opt2_basis: 'premPct', opt2_pct: 2 },
    mat:     { on: true, pct: 0 },
    death:   { on: true, opt: 'opt1', opt1_split: 10, opt1_before: 100, opt1_after: 0 }
  },
  endowment: {
    edm_death:{ on: true, r1: 160, r2: 140, r3: 120 },
    edm_mat:  { on: true, pct: 100 }
  },
  endowment2: {
    edm_death:{ on: true, r1: 160, r2: 140, r3: 120 },
    edm_mat:  { on: true, pct: 100 }
  },
  endowment3: {
    edm_death:{ on: true, r1: 160, r2: 140, r3: 120 },
    edm_mat:  { on: true, pct: 100 }
  },
  ci: {
    ci_dd:   { on: true, pct: 100 },
    ci_db:   { on: true, pct: 100 },
    ci_wait: { on: true }
  }
};
// 保险责任 → 页面 input id 映射（用于 applyBeneDefaults 按字段名回填；4 张年金卡片的 opt select 与各 opt 参数都映射对应）
var PL_BENE_INPUT_MAP = {
  care:     { cb: 'pl_on_care',       fields: { pl_care_opt: 'opt', pl_care_opt1_age: 'opt1_age', pl_care_opt1_pct: 'opt1_pct', pl_care_opt2_year: 'opt2_year', pl_care_opt2_pct: 'opt2_pct' } },
  ann:      { cb: 'pl_on_ann',        fields: { pl_ann_opt: 'opt', pl_ann_opt1_start: 'opt1_start', pl_ann_opt1_count: 'opt1_count', pl_ann_opt1_basis1: 'opt1_basis1', pl_ann_opt1_pct1: 'opt1_pct1', pl_ann_opt1_basis2: 'opt1_basis2', pl_ann_opt1_pct2: 'opt1_pct2', pl_ann_opt2_start: 'opt2_start', pl_ann_opt2_basis: 'opt2_basis', pl_ann_opt2_pct: 'opt2_pct' } },
  mat:      { cb: 'pl_on_mat',        fields: { pl_mat_pct: 'pct' } },
  death:    { cb: 'pl_on_death',      fields: { pl_death_opt: 'opt', pl_death_opt1_split: 'opt1_split', pl_death_opt1_before: 'opt1_before', pl_death_opt1_after: 'opt1_after' } },
  edm_death:{ cb: 'pl_on_edm_death',  fields: { pl_edm_r1: 'r1', pl_edm_r2: 'r2', pl_edm_r3: 'r3' } },
  edm_mat:  { cb: 'pl_on_edm_mat',    fields: { pl_edm_mat_pct: 'pct' } },
  ci_dd:    { cb: 'pl_on_ci_dd',      fields: { pl_ci_dd_pct: 'pct' } },
  ci_db:    { cb: 'pl_on_ci_db',      fields: { pl_ci_db_pct: 'pct' } },
  ci_wait:  { cb: 'pl_ci_wait',       fields: {} }
};
// 4 张年金卡片 opt-box 联动规则：依据 select(opt) 控制对应 .pl-ben-opt[data-opt=...] 显示/隐藏
// 同时联动 pivot 数字（ann_opt1_pivot = opt1_count + 1，笔序号；death_opt1_pivot = opt1_split + 1，年度）
function plUpdateOptBoxes(scope) {
  scope = scope || document;
  scope.querySelectorAll('.pl-ben[data-bene]').forEach(function (box) {
    var k = box.getAttribute('data-bene');
    if (k !== 'care' && k !== 'ann' && k !== 'death') return;
    var sel = box.querySelector('select[id^="pl_' + k + '_opt"]');
    if (!sel) return;
    var opt = sel.value;
    box.querySelectorAll('.pl-ben-opt[data-opt]').forEach(function (o) {
      o.style.display = (o.getAttribute('data-opt') === opt) ? '' : 'none';
    });
    // 联动 pivot 提示：ann_opt1 前 N 笔之后第一笔的笔序号（= N+1，与起始周年无关）；death_opt1 后段起始年度（= N+1）
    if (k === 'ann') {
      var c = parseInt(document.getElementById('pl_ann_opt1_count').value, 10) || 1;
      var pivot = document.getElementById('pl_ann_opt1_pivot');
      if (pivot) pivot.textContent = (c + 1);
    } else if (k === 'death') {
      var sp = parseInt(document.getElementById('pl_death_opt1_split').value, 10) || 1;
      var dpivot = document.getElementById('pl_death_opt1_pivot');
      if (dpivot) dpivot.textContent = (sp + 1);
    }
  });
}
// 绑定 4 张年金卡片内部 opt select 的 change 事件 + 联动 input 输入同步 pivot
function plBindOptSelects() {
  ['care', 'ann', 'death'].forEach(function (k) {
    var sel = document.getElementById('pl_' + k + '_opt');
    if (sel) sel.addEventListener('change', function () { plUpdateOptBoxes(); });
  });
  document.getElementById('pl_ann_opt1_start').addEventListener('input', plUpdateOptBoxes);
  document.getElementById('pl_ann_opt1_count').addEventListener('input', plUpdateOptBoxes);
  document.getElementById('pl_death_opt1_split').addEventListener('input', plUpdateOptBoxes);
  document.getElementById('pl_ann_opt1_start').addEventListener('input', plUpdateOptBoxes);
}
// 兜底预定附加费用率：交费方式无对应费用率表时采用（首年 5%，第2年及以后续期 2%）
var PL_EXP_FALLBACK = [0, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02];
// 两全家族判定（endowment / endowment2 / endowment3 共用两全分支）
function plIsEndow(v) { return String(v).indexOf('endowment') === 0; }
function plIsE2(v) { return String(v) === 'endowment2'; }
// 普通型两全（参考：示例两全保险）——精确匹配，与分红两全 E2 区分
function plIsE3(v) { return String(v) === 'endowment3'; }
function plIsCI(v) { return String(v) === 'ci'; }
// 年金家族（养老类年金 + 即期年金）：共用 plSolve / plRenderBenAnnuity / vlDerived 年金路径
function plIsAnn(v) { return String(v) === 'annuity' || String(v) === 'annuity_immediate'; }
// 交费期间 → 费用率表族（分红型现价费用率与普通型不同：93号 vs 7号）；无对应键（如 h=10）时由调用方回退 PL_EXP_FALLBACK
function plExpTabs(type) {
  var v = String(type);
  if (plIsE3(v)) return { eP: PL_EXP_PRICING_PLAIN, eCV: PL_EXP_CV_PLAIN };
  if (plIsEndow(v)) return { eP: PL_EXP_PRICING, eCV: PL_EXP_CV_ENDOW };
  return { eP: PL_EXP_PRICING, eCV: PL_EXP_CV };
}

// 疾病保险费用率槽位（第1年 … 第5年 / 第6年及以后）
// 定价：精算报告§2.3「预定附加费用率」原始假设——20年交与交至60周岁均为 50.0%/15.0%/5.0%/5.0%/5.0%/1.0%
// 现价：报告§3.2 分年度附加费用率（按交费期间分档，第4年起为 10% 常量，拆列展示便于微调）
var PL_EXP_CI_PRICING = [0, 0.50, 0.15, 0.05, 0.05, 0.05, 0.01];
function plExpCvCI(h) {
  if (h < 10) return [0, 0.65, 0.50, 0.35, 0.10, 0.10, 0.10];
  if (h <= 19) return [0, 0.80, 0.75, 0.60, 0.10, 0.10, 0.10];
  return [0, 0.85, 0.80, 0.75, 0.10, 0.10, 0.10];
}

function plNum(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); }
function plPct(v, d) { return (v * 100).toFixed(d === undefined ? 3 : d) + '%'; }
// 利率/百分数的朴素写法：整数不补 .00（4 → "4"，4.25 → "4.25"）
function plRatePlain(v) { var n = Math.round((+v) * 100) / 100; return isNaN(n) ? '—' : String(n); }
// 公式行用的数值写法：不截断小数位（最多 6 位，尾零去掉），保证「公式里的 GP」与参与计算的值完全一致
function plNumFull(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 6 }); }

// ---------- 换算函数 ----------
// 换算函数内部精度（小数位）：D[t]、C[t] 计算后立即按 PL_COMM_PREC 位四舍五入，
// 后续递推/求解全部基于此精度进行，避免 JS 双精度累积误差。页面展示仍按 toFixed(8)。
// 精算实务中基础因子表（Dx/Cx）通常给出 8–12 位有效位，16 位兼顾精度稳定性与可解释性。
var PL_COMM_PREC = 16;
function _plRnd(v) { return Math.round(v * Math.pow(10, PL_COMM_PREC)) / Math.pow(10, PL_COMM_PREC); }

// D[t] = D_{x+t}：生存折现因子（D[0]=1）；C[t] = C_{x+t}：年中死亡折现因子
function plComm(x, T, i, qxFn) {
  var v = 1 / (1 + i);
  var D = new Array(T + 1), C = new Array(T + 1);
  D[0] = 1;
  for (var t = 1; t <= T; t++) D[t] = _plRnd(D[t - 1] * v * (1 - qxFn(x + t - 1)));
  for (var a = 0; a < T; a++) C[a] = _plRnd(Math.pow(v, 0.5) * D[a] * qxFn(x + a));
  C[T] = 0;
  return { v: v, D: D, C: C };
}

// ---------- 发生率表取数（支持表版本 2025 / 2010） ----------
// 2025 语义 cfg.table：cl1=养老类业务表、cl2=非养老类业务一表、cl3=非养老类业务二表、cl4=单一生命体表
// 2010 版按【性别】分表（保监发〔2016〕107号）：非养老一表 男CL1/女CL2、非养老二表 男CL3/女CL4、养老表 男CL5/女CL6
function plQxTab(cfg, a) {
  var g = (cfg.gender === 'f') ? 'f' : 'm';
  var arr;
  if (cfg.tblVer === '2010') {
    var m = { cl1: (g === 'm' ? 'cl5' : 'cl6'),   // 养老类业务表 → 男CL5 / 女CL6
              cl2: (g === 'm' ? 'cl1' : 'cl2'),   // 非养老类业务一表 → 男CL1 / 女CL2
              cl3: (g === 'm' ? 'cl3' : 'cl4'),   // 非养老类业务二表 → 男CL3 / 女CL4
              cl4: (g === 'm' ? 'cl1' : 'cl2') }; // 单一生命体表(2025)无2010对应，按非养老一表近似
    arr = LIFE2010[m[cfg.table] || 'cl3'][g];
  } else {
    arr = LIFE2025[cfg.table][cfg.gender];
  }
  return arr[Math.max(0, Math.min(105, a))];
}

// ---------- 主求解 ----------
// cfg: {x, gender('m'/'f'), h, SA, table('cl1'..'cl4'), factor, i, iCV1, iCV2,
//       termAge(满期年龄/保至X岁，默认105；T = termAge − x), care:{on,year,pct}, ann:{on,start,pct},
//       mat:{on,pct}, death:{on}, eP:[按年], eCV:[按年]}
function plSolve(cfg) {
  var x = cfg.x, h = cfg.h, SA = cfg.SA;
  var termAge = cfg.termAge || 105;                    // 满期年龄（保至X岁），默认 105
  var T = termAge - x;
  if (T < 1) return { error: '保险期间无效：满期年龄（' + termAge + '岁）需大于投保年龄（' + x + '岁）。' };
  if (x + h - 1 > termAge - 1) return { error: '投保年龄与交费期间不匹配：交费期内被保险人到达年龄不得超过满期年龄（' + termAge + '岁）。' };

  var qxFn = function (a) {
    return plQxTab(cfg, a) * cfg.factor / 1000;
  };
  var eP = cfg.eP, eCV = cfg.eCV;
  var cP = plComm(x, T, cfg.i, qxFn);    // 定价基础（预定利息率 i，费率厘定用；与现价链分离）
  var c1 = plComm(x, T, cfg.iCV1, qxFn); // 初期口径（现价计算基础）
  var c2 = plComm(x, T, cfg.iCV2, qxFn); // 终极口径（现价计算基础）

  // 现价调整系数 r(t)：r = k + (1-k)·t/min(20,h)，t≥min(20,h) 时 r=1；k=1(趸交)/0.9(期交)
  var minr = Math.min(20, h), kCoef = (h === 1 ? 1 : 0.9);
  var r = new Array(T + 1);
  for (var t0 = 1; t0 <= T; t0++) r[t0] = (t0 < minr) ? (kCoef + (1 - kCoef) * t0 / minr) : 1;

  // ---- 责任参数归一化（opt1/opt2 双选项；兼容旧单字段结构）----
  // care:  opt1 = 到达 opt1_age 周岁对应保单周年日触发，按累计已交保费×opt1_pct%
  //        opt2 = 第 opt2_year 个保单周年日触发，按基本保额×opt2_pct%（旧结构 year/pct 即此语义）
  // ann:   opt1 = 自 opt1_start 周年起按笔数分段（前 opt1_count 笔 basis1×pct1%，之后 basis2×pct2%）
  //        opt2 = 自 opt2_start 周年起每年 basis×pct%（旧结构 start/pct 即 premPct 语义）
  // death: opt1 = 按保单年度两段式（第 1~split 年度身故按累计保费×before%，第 split+1 年度起按×after%；
  //        年度内身故发生于当年度末周年日之前，故第 split 年度属 before 段）；opt2 = max(累计保费, CV年中)（旧结构唯一语义）
  var care = cfg.care || {}, ann = cfg.ann || {}, dth = cfg.death || {};
  var careOpt = care.opt || 'opt2';
  var careYear = (careOpt === 'opt1')
    ? Math.max(1, (care.opt1_age != null ? care.opt1_age : 85) - x)
    : (care.opt2_year != null ? care.opt2_year : care.year);
  var careSA = (careOpt !== 'opt1');            // true=按基本保额；false=按累计已交保费
  var carePct = (careOpt === 'opt1')
    ? (care.opt1_pct != null ? care.opt1_pct : 100)
    : (care.opt2_pct != null ? care.opt2_pct : care.pct);
  var annOpt = ann.opt || 'opt2';
  var annStart = (annOpt === 'opt1')
    ? (ann.opt1_start != null ? ann.opt1_start : 0)
    : (ann.opt2_start != null ? ann.opt2_start : ann.start);
  var annCnt = (ann.opt1_count != null ? ann.opt1_count : 10);
  var annB1 = (annOpt === 'opt1') ? (ann.opt1_basis1 || 'premPct') : (ann.opt2_basis || 'premPct');
  var annP1 = (annOpt === 'opt1') ? (ann.opt1_pct1 != null ? ann.opt1_pct1 : 100) : (ann.opt2_pct != null ? ann.opt2_pct : ann.pct);
  var annB2 = (annOpt === 'opt1') ? (ann.opt1_basis2 || 'saPct') : (ann.opt2_basis || 'premPct');
  var annP2 = (annOpt === 'opt1') ? (ann.opt1_pct2 != null ? ann.opt1_pct2 : 100) : (ann.opt2_pct != null ? ann.opt2_pct : ann.pct);
  var deathOpt = dth.opt || 'opt2';
  var deathSplit = (dth.opt1_split != null ? dth.opt1_split : 10);
  var deathBefore = (dth.opt1_before != null ? dth.opt1_before : 100);
  var deathAfter = (dth.opt1_after != null ? dth.opt1_after : 0);
  // 即期年金（annuity_immediate）标志：仅其生存年金基数启用「下一期保费已交付」口径（min(t+1,h)）
  // 由 plSolveImmediate 入口注入；其余产品（养老年金/两全/CI）一律沿用通用口径
  var isImm = cfg.imm === true;

  // ---- 给付函数（以 GP 与年末现价 CV 为参）----
  // 累计已交保费两套口径（第 k 期保费于保单周年日 k-1 交付，不可混用）：
  //   ① 保单周年日时点 t：t=0 按 1 期算（签单当日已交首期）；t≥1 为 min(t, h) 期
  //      用于关爱金 / 满期金 / 生存年金（养老年金）与累计保费展示
  //   ② 第 t 保单年度内（身故发生在年度之中，赔付均值落于年中）：已交付第 1..t 期 → 累计 min(t, h) 期
  //   ③ 即期年金生存年金专用：第 t 个保单周年日为第 t+1 保单年度初，第 t+1 期保费于当日交付 → min(t+1, h) 期
  //      （t=0 签单当日→1 期、t=1→2 期、t=2→3 期；仅 annuity_immediate 启用，其余产品一律沿用 ①）
  function cumPrem(t, GP) { return GP * Math.max(1, Math.min(t, h)); }  // ① 保单周年日时点
  function cumPremInYr(t, GP) { return GP * Math.min(t, h); }           // ② 保单年度内
  function cumPremImm(t, GP) { return GP * Math.min(t + 1, h); }        // ③ 即期年金生存年金专用
  function caringOf(t, GP) {
    if (!care.on || t !== careYear) return 0;
    return careSA ? SA * carePct / 100 : cumPrem(t, GP) * carePct / 100;
  }
  function survivalOf(t, GP) { // 生存年金（按笔数分段 / 固定比例）
    if (!ann.on || t < annStart || t > T) return 0;
    var payIdx = t - annStart + 1;              // 1-based 笔数
    var base = isImm ? cumPremImm(t, GP) : cumPrem(t, GP); // 即期年金用「当期保费已交付」口径，其余用通用口径
    if (annOpt === 'opt1' && payIdx <= annCnt) return (annB1 === 'saPct' ? SA : base) * annP1 / 100;
    return (annB2 === 'saPct' ? SA : base) * annP2 / 100;
  }
  function sbOf(t, GP) { return caringOf(t, GP) + survivalOf(t, GP); } // 生存给付：关爱金 + 生存年金
  function matOf(GP) { return (cfg.mat && cfg.mat.on) ? cumPrem(T, GP) * cfg.mat.pct / 100 : 0; } // 满期金（第T年末）
  function dbOf(t, GP, CV) {
    if (!dth.on) return 0;
    if (deathOpt === 'opt1') return cumPremInYr(t, GP) * ((t > deathSplit ? deathAfter : deathBefore) / 100); // 两段式：第 split 年度（含）之前身故按 before、第 split+1 年度起按 after（年度内身故发生于当年度末周年日之前）
    // 身故时点现价（CV 年中）：报告§2.4 公式 0.5×(CV[t] + CV[t-1] + sbOf(t,GP) + npCV)
    // dbOf 在 GPp2 算出前即被 benSuf/solveGP 调用，npCV 项用 GP×(1−eCV[t]) 近似（GPp2 与 GP 差异 < 1%，对 max 项影响可忽略）
    var npCV = (t <= h) ? GP * (1 - eCV[t]) : 0;
    var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + sbOf(t, GP) + npCV);
    return Math.max(cumPremInYr(t, GP), cvMid);
  } // 身故金=累计已交保费 vs CV 年中的较大者（opt2）；两段式比例给付（opt1）

  // 保费项分母：Σ_{t=1..h} D[t-1]×(1−e_t)
  function premDen(c, e) { var s = 0; for (var t = 1; t <= h; t++) s += c.D[t - 1] * (1 - e[t]); return s; }
  // 分母：定价方程用 eP（报告§2.3 预定附加费用率）；现价基础毛保费 GP′（初期/终极）用 eCV（报告§3.1 保单价值准备金
  //       附加费用率，与 PVR 净保费后缀 premDSuf 同表——两全引擎同款口径：现价毛保费 GP′ 用 eCV）
  var den1 = premDen(c1, eCV), den2 = premDen(c2, eCV), denP = premDen(cP, eP);

  // 未来保费折现后缀和（现价口径，系数）：PDS[t] = Σ_{k=t+1..h} (1−eCV[k])·D[k-1]
  function premDSuf(c, e) {
    var s = new Array(T + 1); s[h] = 0;
    for (var t = h - 1; t >= 0; t--) s[t] = s[t + 1] + (1 - e[t + 1]) * c.D[t];
    for (var t2 = h + 1; t2 <= T; t2++) s[t2] = 0;
    return s;
  }
  var pdSuf1 = premDSuf(c1, eCV), pdSuf2 = premDSuf(c2, eCV);

  // 给付现值后缀和：S[t] = Σ_{k=t+1..T}(DB[k]C[k-1]+SB[k]D[k]) + 满期×D[T]
  function benSuf(c, GP, CV) {
    var S = new Array(T + 1); S[T] = matOf(GP) * c.D[T];
    for (var t = T - 1; t >= 0; t--) S[t] = S[t + 1] + dbOf(t + 1, GP, CV) * c.C[t] + sbOf(t + 1, GP) * c.D[t + 1];
    S[0] += sbOf(0, GP) * c.D[0]; // 即期年金「第0个保单周年日」给付：签单当日、无折现无生存条件（默认参数下 = 0，不影响旧口径）
    return S;
  }

  // ---- 给定现价 CV，按活动集线性求解 GP（定价方程精确解） ----
  // 活动集：身故金 opt2 取现价的年度集合（cvMid > 累计保费），由参考 GP 决定
  // 与 dbOf 严格同口径（CV 年中：0.5×(CV[t]+CV[t-1]+sbOf(t,GP)+npCV)），保证精算恒等式
  // S[0] = ∑ dbOf·C + sbOf·D + mat·D[T] = A + B·GP = GP×denP 严格成立。
  // A = 与 GP 无关的定额项（基本保额比例、CV年中活动集）；B = GP 一次项系数（累计保费比例）
  function solveGP(CV, gpRef) {
    for (var outer = 0; outer < 12; outer++) {
      var active = new Array(T + 1), A = 0, B = 0;
      for (var t = 1; t <= T; t++) {
        // cpT = 第 t 保单年度内累计期数（身故/关爱/满期）；cpS = 生存年金基数期数
        //       （仅即期年金取 min(t+1, h)——第 t+1 期保费于该周年日交付；其余产品与 cpT 同）
        var cpT = Math.min(t, h), cpS = isImm ? Math.min(t + 1, h) : Math.min(t, h);
        if (dth.on) {
          if (deathOpt === 'opt1') {
            B += cpT * ((t > deathSplit ? deathAfter : deathBefore) / 100) * cP.C[t - 1];
          } else {
            var npCVR = (t <= h) ? gpRef * (1 - eCV[t]) : 0;
            var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + sbOf(t, gpRef) + npCVR);
            active[t] = cvMid > gpRef * cpT + 1e-12;
            if (active[t]) A += cvMid * cP.C[t - 1];
            else B += cpT * cP.C[t - 1];
          }
        }
        if (care.on && t === careYear) {
          if (careSA) A += SA * carePct / 100 * cP.D[t];
          else B += cpT * carePct / 100 * cP.D[t];
        }
        if (ann.on && t >= annStart && t <= T) {
          var payIdxS = t - annStart + 1;
          var segB = (annOpt === 'opt1' && payIdxS <= annCnt) ? annB1 : annB2;
          var segP = (annOpt === 'opt1' && payIdxS <= annCnt) ? annP1 : annP2;
          if (segB === 'saPct') A += SA * segP / 100 * cP.D[t];
          else B += cpS * segP / 100 * cP.D[t];
        }
      }
      if (cfg.mat.on) B += Math.min(T, h) * cfg.mat.pct / 100 * cP.D[T];
      // 签单当日（第0周年日）首笔给付：cumPrem(0) 系数 = 1，D[0] = 1
      if (ann.on && annStart === 0) {
        if (annB1 === 'saPct') A += SA * annP1 / 100 * cP.D[0];
        else B += annP1 / 100 * cP.D[0];
      }
      var denom = denP - B;
      if (denom <= 1e-12) return null;
      var gp = A / denom;
      if (Math.abs(gp - gpRef) < 1e-10 * Math.max(1, SA)) return gp;
      gpRef = gp;
    }
    return gpRef;
  }

  // ---- 不动点迭代：GP ↔ CV ----
  var CV = new Array(T + 1); for (var z = 0; z <= T; z++) CV[z] = 0;
  var PL_DEGEN_MSG = '定价方程退化为齐次方程：当前保险责任全部与「累计已交保费」成比例（生存年金、满期金、身故金），缺少基于<b>基本保险金额</b>的定额给付（如关爱保险金）。等价原则下毛保费无法唯一确定（任意保费均不改变平衡关系）。请至少保留一项定额责任，或将年金比例改为基于基本保额。';
  // 分母 ≤ 0：与「定价利率过低 / 比例型责任过重」对应，与上一条「缺少定额责任」区分开
  var PL_DENOM_MSG = '定价方程无有效解（denP − B ≤ 0）：当前定价利率下，与<b>累计已交保费</b>成比例的给付责任（生存年金、满期金、身故金）现值已超过保费现值。分子分母随保费同比例放大，<b>提高保费无法改善平衡</b>——请提高定价利率、下调给付比例，或增加基于<b>基本保险金额</b>的定额责任。';
  var gpInit = solveGP(CV, SA * 0.5);
  var GP = (gpInit !== null && isFinite(gpInit)) ? gpInit : SA * 0.5;
  if (gpInit === null) {
    // 分母 denP − B ≤ 0：与保费成比例的给付责任（生存年金 / 满期金 / 身故金）现值已超过保费现值。
    // 分子分母随保费同比例放大，故提高保费无法改善平衡（定价利率越低差距越大）
    return { error: PL_DENOM_MSG };
  }
  if (!isFinite(GP) || gpInit < 1e-4 * SA) {
    // 初始解近零（< 0.01%×保额）：全部责任与累计已交保费成比例，定价方程齐次退化
    return { error: PL_DEGEN_MSG };
  }
  var omega = 0.85, prevDiff = Infinity, iter = 0, resid = 0;
  var GPp1 = 0, GPp2 = 0, CV1 = [], CV2 = [];

  for (iter = 0; iter < 3000; iter++) {
    var S1 = benSuf(c1, GP, CV), S2 = benSuf(c2, GP, CV), SP = benSuf(cP, GP, CV);
    // GPCV：分母直接用 premDen（不扣减kgp），分子代入当前 GP → DD₁/DB₁ = 0.75·SA + 0.25·GP
    GPp1 = S1[0] / den1; GPp2 = S2[0] / den2;

    var CV1n = new Array(T + 1), CV2n = new Array(T + 1), CVn = new Array(T + 1);
    CV1n[0] = CV2n[0] = CVn[0] = 0;
    for (var t = 1; t <= T; t++) {
      var pvr1 = (S1[t] - (t < h ? GPp1 * pdSuf1[t] : 0)) / c1.D[t];
      var pvr2 = (S2[t] - (t < h ? GPp2 * pdSuf2[t] : 0)) / c2.D[t];
      CV1n[t] = r[t] * Math.max(pvr1, 0);
      CV2n[t] = r[t] * Math.max(pvr2, 0);
      CVn[t] = (t <= 1) ? CV1n[t] : (t < 4 ? CV1n[t] * (4 - t) / 3 + CV2n[t] * (t - 1) / 3 : CV2n[t]);
    }

    var GPn = solveGP(CVn, GP);
    if (GPn === null) return { error: '定价方程无有效解：请检查费用率/给付参数（分母 den−B ≤ 0）。' };

    var diff = Math.abs(GPn - GP);
    for (var t2 = 1; t2 <= T; t2++) diff = Math.max(diff, Math.abs(CVn[t2] - CV[t2]));
    // 自适应阻尼：残差发散时收缩
    if (diff > prevDiff * 1.5 && omega > 0.08) { omega *= 0.5; }
    prevDiff = diff; resid = diff;

    GP = GP + omega * (GPn - GP);
    for (var t3 = 1; t3 <= T; t3++) CV[t3] = CV[t3] + omega * (CVn[t3] - CV[t3]);

    if (diff < 1e-9 * Math.max(1, SA)) { // 收敛
      GP = GPn;
      for (var t4 = 1; t4 <= T; t4++) CV[t4] = CVn[t4];
      // 末轮重算两套现价（与最终 GP/CV 完全一致）
      var S1f = benSuf(c1, GP, CV), S2f = benSuf(c2, GP, CV), SPf = benSuf(cP, GP, CV);
      GPp1 = S1f[0] / den1; GPp2 = S2f[0] / den2;
      for (var t5 = 1; t5 <= T; t5++) {
        var p1 = (S1f[t5] - (t5 < h ? GPp1 * pdSuf1[t5] : 0)) / c1.D[t5];
        var p2 = (S2f[t5] - (t5 < h ? GPp2 * pdSuf2[t5] : 0)) / c2.D[t5];
        CV1[t5] = r[t5] * Math.max(p1, 0); CV2[t5] = r[t5] * Math.max(p2, 0);
      }
      break;
    }
  }
  if (iter >= 3000) return { error: '迭代未收敛（残差 ' + resid.toExponential(2) + '），请检查参数组合。' };

  // ---- 终检：收敛后 GP 仍近零（< 0.01%×保额）同样视为齐次退化 ----
  if (!isFinite(GP) || GP < 1e-4 * SA) {
    return { error: PL_DEGEN_MSG };
  }

  // ---- 准备金（一年期完全修正法 FPT，定价基础 cP = 预定利息率 i） ----
  var annDue = 0; for (var t = 1; t <= h; t++) annDue += cP.D[t - 1];             // Σ D_{x+t-1}
  var P_NL = SPf[0] / annDue;                                                    // 均衡净保费
  var alpha = (dbOf(1, GP, CV) * cP.C[0] + sbOf(1, GP) * cP.D[1]) / cP.D[0];     // 首年净保费
  var beta = 0;
  if (h > 1) {
    var rem = 0; for (var t = 2; t <= h; t++) rem += cP.D[t - 1];
    beta = (P_NL * annDue - alpha * cP.D[0]) / rem;                              // 续年净保费
  }
  var rows = [];
  var VdSuf = new Array(T + 1); VdSuf[h] = 0;                                     // Σ_{k=t+1..h} D[k-1]
  for (var t = h - 1; t >= 1; t--) VdSuf[t] = VdSuf[t + 1] + cP.D[t];
  for (var t = h + 1; t <= T; t++) VdSuf[t] = 0;

  for (var t = 1; t <= T; t++) {
    var p1v = (S1f[t] - (t < h ? GPp1 * pdSuf1[t] : 0)) / c1.D[t];
    var p2v = (S2f[t] - (t < h ? GPp2 * pdSuf2[t] : 0)) / c2.D[t];
    var Vstar = SPf[t] / cP.D[t] - (t < h ? beta * VdSuf[t] / cP.D[t] : 0);
    var Vd = (t < h && beta > GP) ? (beta - GP) * VdSuf[t] / cP.D[t] : 0;
    var Vt = Math.max(Vstar + Vd, CV[t] || 0);
    // 年中现价（报告§2.4）：0.5×(年末现价 + 年初现价 + 年中生存给付 + 现价净保费)
    var npCV = (t <= h) ? GPp2 * (1 - eCV[t]) : 0;
    var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + sbOf(t, GP) + npCV);
    rows.push({
      t: t, age: x + t, qx: qxFn(x + t - 1),
      D: cP.D[t], C: cP.C[t - 1],
      cumPrem: GP * Math.min(t, h),   // 第 t 保单周年日时点累计已交
      DB: dbOf(t, GP, CV), SB: sbOf(t, GP),
      mat: (t === T && cfg.mat.on) ? matOf(GP) : 0,
      r: r[t], PVR1: p1v, CV1: CV1[t] || 0, PVR2: p2v, CV2: CV2[t] || 0,
      CV: CV[t] || 0, CVmid: cvMid,
      Vstar: Vstar, Vd: Vd, V: Vt
    });
  }

  // ---- 展示字段：逐笔生存年金（t=0..T）、触发年等（渲染/演示/双视角共用，不再回读 cfg 旧字段）----
  var survAmt = [];
  for (var tS = 0; tS <= T; tS++) survAmt.push(ann.on ? survivalOf(tS, GP) : 0);
  var careAmtDisp = care.on ? caringOf(careYear, GP) : 0;
  // 水平年金（交费期后）：opt2 = 每年固定额；opt1 = 分段后段水平额（旧口径 GP×h×pct 与此严格一致）
  var annLevelT = Math.min(Math.max(annStart, h), T);
  var annAmtDisp = ann.on ? survivalOf(annLevelT, GP) : 0;

  return {
    GP: GP, GPp1: GPp1, GPp2: GPp2, P_NL: P_NL, alpha: alpha, beta: beta,
    iter: iter + 1, resid: resid, T: T, rows: rows,
    annDue: annDue,
    careAmt: careAmtDisp, careYear: care.on ? careYear : null, careOn: !!care.on, careSA: careSA, careOpt: careOpt,
    annAmt: annAmtDisp, annStart: ann.on ? annStart : null, annOn: !!ann.on, annOpt: annOpt, annCnt: annCnt, survAmt: survAmt,
    deathOpt: deathOpt, deathSplit: deathSplit, deathBefore: deathBefore, deathAfter: deathAfter, deathOn: !!dth.on,
    deathFirstAmt: dth.on ? dbOf(1, GP, CV) : 0,
    matAmt: matOf(GP), matOn: !!(cfg.mat && cfg.mat.on),
    benPV: SPf[0], denP: denP
  };
}

// ===== 即期年金（annuity_immediate）引擎 =====
// 与养老年金共用同一数值内核：plSolve 已升级为 opt1/opt2 双选项全参数引擎
// （关爱金：到达年龄触发+累计保费比例 / 保单年度触发+基本保额比例；生存年金：按笔数分段 / 固定比例；
//   满期金：累计保费比例（0% = 不给付金额）；身故金：两段式比例 / max(累计保费, CV年中)），
// 并含「第0个保单周年日」签单当日给付的定价项（benSuf 的 S[0] += sbOf(0)·D[0]）。
// 两类年金的差异仅在 UI 默认参数（PL_BENE_DEFAULTS_BY_TYPE）：
//   养老年金默认 opt2（第6周年关爱金×基本保额、第7年起年金×累计保费2%、满期100%、身故 max）；
//   即期年金默认 opt1（85岁关爱金×累计保费、第0周年起前10笔×累计保费2.75%/之后×基本保额、满期0%、两段式身故）。
// 保留独立入口：便于调用端按类型分流与后续差异化扩展。
function plSolveImmediate(cfg) { var c = Object.assign({}, cfg); c.imm = true; return plSolve(c); }

// ===== 两全保险（分红型）引擎 =====
// 口径要点：
//   定价：GP = [Σ DB·C + BSA·D_{x+bt}] / Σ_{t≤pt}(1−e_t)·D_{t-1}，迭代求解
//         DB：18岁以下 max(累计保费, 现价)；18岁及以上 max(累计保费×R, 现价)，R 分龄档 160%/140%/120%
//             （取档到达年龄 = 投保年龄 + 保单年度 − 1，即保单年度初年龄，与 q_{x+t−1} 同龄）
//         首年（t=1）含180日规则：DB = 0.5×Max(…) + 0.5×GP
//   现价：初期 3.25%（=定价利率+1.5%，93号：保险期间>10年）/ 终极 1.75% 两套 PVR
//         净保费 = GP′×(1−e_t)（报告F042：定价费用率）；融合：t≤1 初期，1<t<3 线性插值，t≥3 终极
//   准备金：修正法（非FPT）：α = Max(DB₁·C_x/D_x, P^NL − 3.5%×DB₁)；β 续年；tV = Max(tV′+tV^d, tCV)
//   红利：周年红利 = 70%×Max((t−1V + 当年净保费)×(i*−i), 0)；现金红利按定价利率累计生息
var PL_EXP_CV_ENDOW = {  // 现价基础附加费用率（分红型，93号上限内，报告§3.1.1/3.2.1）
  1: [0, 0.08],
  3: [0, 0.30, 0.20, 0.15],
  5: [0, 0.30, 0.20, 0.15, 0.12, 0.12]
};

function plSolveEndow(cfg) {
  var x = cfg.x, h = cfg.h, SA = cfg.SA, T = cfg.termAge - x;
  if (x < 0 || x > 75) return { error: '投保年龄需在出生满28日至75周岁之间（两全保险（分红型）投保规定）。' };
  if (T < 1) return { error: '保险期间无效：满期年龄需大于投保年龄。' };
  if (h > T) return { error: '交费期间 h=' + h + ' 年不能超过保险期间 bt=' + T + ' 年（须于满期前完成交费）。' };
  if (x + h - 1 > 104) return { error: '投保年龄与交费期间不匹配：交费期末被保险人不能超过105岁。' };

  var qxFn = function (a) {
    return plQxTab(cfg, a) * cfg.factor / 1000;
  };
  var eP = cfg.eP, eCV = cfg.eCV;
  // 现价口径：single = 单口径（中短期两全报告：仅保单价值准备金基础 2.75% 一套，无初期/终极融合）
  var single = !!cfg.single;
  // 首年180日规则：中短期两全报告无此项，DB = Max(GP·Min(t,pt)·R, CV)（18周岁及以下不乘R）
  var rule180 = !cfg.noRule180;
  var c1 = plComm(x, T, cfg.iCV1, qxFn);                       // 初期现价口径
  var c2 = single ? c1 : plComm(x, T, cfg.iCV2, qxFn);         // 终极现价口径（单口径时与初期同一套）
  var cP = plComm(x, T, cfg.i, qxFn);                          // 定价基础（预定利息率，费率厘定；双口径时与 c2 同利率，零影响）
  var iEval = Math.min(cfg.i, 0.0175);     // 评估利息率 = Min(定价利率, 1.75%)
  var cE = plComm(x, T, iEval, qxFn);      // 评估基础（修正法准备金 + 红利链）

  // 现价调整系数 r(t)：同年金口径
  var minr = Math.min(20, h), kCoef = (h === 1 ? 1 : 0.9);
  var r = new Array(T + 1);
  for (var t0 = 1; t0 <= T; t0++) r[t0] = (t0 < minr) ? (kCoef + (1 - kCoef) * t0 / minr) : 1;

  // 身故给付比例系数（按保险条款分档：18-40/41-60/61+；18周岁以下不乘系数）
  // 取档用到达年龄 = 投保年龄 + 保单年度 − 1（保单年度初年龄，与死亡给付年度的 q_{x+t−1} 同龄）
  function Rof(age) { return (age <= 18) ? 1 : (age <= 40 ? cfg.death.r1 : (age <= 60 ? cfg.death.r2 : cfg.death.r3)); }

  // ---- 给付函数 ----
  function dbOf(t, GP, CV) {
    if (!cfg.death.on) return 0;
    var age = x + t - 1;   // 到达年龄 = 投保年龄 + 保单年度 − 1
    // CV 年中：报告§2.4 公式 0.5×(CV[t] + CV[t-1] + sbOf(t,GP) + npCV)
    // 分红两全 sbOf≡0（无关爱金/生存年金），npCV 项用 GP×(1−eCV[t]) 近似（GPp2 与 GP 差异 < 1%，
    // 对 max 项影响可忽略）。与 solveGP 严格同口径，保证精算恒等式 S[0]=A+B×GP=GP×denP 成立。
    var npCV = (t <= h) ? GP * (1 - eCV[t]) : 0;
    var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + npCV);
    var v = Math.max(GP * Math.min(t, h) * Rof(age), cvMid);
    return (rule180 && t === 1) ? 0.5 * v + 0.5 * GP : v;   // 首年180日规则（中短期两全报告无此项）
  }
  function matOf() { return cfg.mat.on ? SA * cfg.mat.pct / 100 : 0; }

  // 分母：定价方程用 eP（报告F001）；现价基础毛保费 GP′ 用 eCV（报告F041/F053）
  function premDen(c, e) { var s = 0; for (var t = 1; t <= h; t++) s += c.D[t - 1] * (1 - e[t]); return s; }
  var denP = premDen(cP, eP), den1 = premDen(c1, eCV), den2 = premDen(c2, eCV);

  // 现价净保费后缀和：报告F042/F054 净保费 = GP′×(1−e_t)，e_t = 保单价值准备金附加费用率（现价基础费用率 eCV，
  // 与 GP′ 分母同表；分红两全 §3.1 交费期限 1年8% / 3年30-20-15% / 5年30-20-15-12-12%）
  function premDSuf(c, e) {
    var s = new Array(T + 1); s[h] = 0;
    for (var t = h - 1; t >= 0; t--) s[t] = s[t + 1] + (1 - e[t + 1]) * c.D[t];
    for (var t2 = h + 1; t2 <= T; t2++) s[t2] = 0;
    return s;
  }
  var pdSuf1 = premDSuf(c1, eCV), pdSuf2 = premDSuf(c2, eCV);

  // 给付现值后缀和：S[t] = Σ_{k=t+1..T} DB[k]·C[k-1] + 满期×D[T]
  function benSuf(c, GP, CV) {
    var S = new Array(T + 1); S[T] = matOf() * c.D[T];
    for (var t = T - 1; t >= 0; t--) S[t] = S[t + 1] + dbOf(t + 1, GP, CV) * c.C[t];
    return S;
  }

  // ---- 活动集线性求解 GP（活动集按 cvMid 判定，与 dbOf 同口径） ----
  function solveGP(CV, gpRef) {
    for (var outer = 0; outer < 12; outer++) {
      var A = 0, B = 0;
      if (cfg.death.on) {
        for (var t = 1; t <= T; t++) {
          var m = Math.min(t, h), R = Rof(x + t - 1);   // 到达年龄 = 投保年龄 + 保单年度 − 1
          var npCVR = (t <= h) ? gpRef * (1 - eCV[t]) : 0;
          var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + npCVR);
          var active = cvMid > gpRef * m * R + 1e-12;
          if (t === 1 && rule180) {
            if (active) { A += 0.5 * cvMid * cP.C[0]; B += 0.5 * cP.C[0]; }
            else { B += (0.5 * R + 0.5) * cP.C[0]; }
          } else {
            if (active) A += cvMid * cP.C[t - 1];
            else B += m * R * cP.C[t - 1];
          }
        }
      }
      if (cfg.mat.on) A += matOf() * cP.D[T];
      var denom = denP - B;
      if (denom <= 1e-12) return null;
      var gp = A / denom;
      if (Math.abs(gp - gpRef) < 1e-10 * Math.max(1, SA)) return gp;
      gpRef = gp;
    }
    return gpRef;
  }

  // ---- 不动点迭代：GP ↔ CV ----
  var CV = new Array(T + 1); for (var z = 0; z <= T; z++) CV[z] = 0;
  var PL_DEGEN_MSG_E = '定价方程退化为齐次方程：当前保险责任全部与「累计已交保费」成比例（身故或全残保险金），缺少基于<b>基本保险金额</b>的定额给付（满期保险金）。等价原则下毛保费无法唯一确定。请保留满期保险金（给付基数 = 基本保险金额）。';
  var GP0 = solveGP(CV, SA * 0.5);
  if (GP0 === null) return { error: '定价方程无有效解：请检查费用率/给付参数（分母 den−B ≤ 0）。' };
  var GP = GP0 || SA * 0.5;
  if (!isFinite(GP) || GP0 < 1e-4 * SA) {
    return { error: PL_DEGEN_MSG_E };
  }
  var omega = 0.85, prevDiff = Infinity, iter = 0, resid = 0;
  var GPp1 = 0, GPp2 = 0, CV1 = [], CV2 = [];

  for (iter = 0; iter < 3000; iter++) {
    var S1 = benSuf(c1, GP, CV), S2 = benSuf(c2, GP, CV), SP = benSuf(cP, GP, CV);
    GPp1 = S1[0] / den1; GPp2 = S2[0] / den2;

    var CV1n = new Array(T + 1), CV2n = new Array(T + 1), CVn = new Array(T + 1);
    CV1n[0] = CV2n[0] = CVn[0] = 0;
    for (var t = 1; t <= T; t++) {
      var pvr1 = (S1[t] - (t < h ? GPp1 * pdSuf1[t] : 0)) / c1.D[t];
      var pvr2 = (S2[t] - (t < h ? GPp2 * pdSuf2[t] : 0)) / c2.D[t];
      CV1n[t] = r[t] * Math.max(pvr1, 0);
      CV2n[t] = r[t] * Math.max(pvr2, 0);
      // 报告F065：融合区间 1<t<3（(3−t)/2 与 (t−1)/2 插值）
      CVn[t] = (t <= 1) ? CV1n[t] : (t < 3 ? CV1n[t] * (3 - t) / 2 + CV2n[t] * (t - 1) / 2 : CV2n[t]);
    }

    var GPn = solveGP(CVn, GP);
    if (GPn === null) return { error: '定价方程无有效解：请检查费用率/给付参数（分母 den−B ≤ 0）。' };

    var diff = Math.abs(GPn - GP);
    for (var t2 = 1; t2 <= T; t2++) diff = Math.max(diff, Math.abs(CVn[t2] - CV[t2]));
    if (diff > prevDiff * 1.5 && omega > 0.08) { omega *= 0.5; }
    prevDiff = diff; resid = diff;

    GP = GP + omega * (GPn - GP);
    for (var t3 = 1; t3 <= T; t3++) CV[t3] = CV[t3] + omega * (CVn[t3] - CV[t3]);

    if (diff < 1e-9 * Math.max(1, SA)) {
      GP = GPn;
      for (var t4 = 1; t4 <= T; t4++) CV[t4] = CVn[t4];
      var S1f = benSuf(c1, GP, CV), S2f = benSuf(c2, GP, CV), SPf = benSuf(cP, GP, CV);
      GPp1 = S1f[0] / den1; GPp2 = S2f[0] / den2;
      for (var t5 = 1; t5 <= T; t5++) {
        var p1 = (S1f[t5] - (t5 < h ? GPp1 * pdSuf1[t5] : 0)) / c1.D[t5];
        var p2 = (S2f[t5] - (t5 < h ? GPp2 * pdSuf2[t5] : 0)) / c2.D[t5];
        CV1[t5] = r[t5] * Math.max(p1, 0); CV2[t5] = r[t5] * Math.max(p2, 0);
      }
      break;
    }
  }
  if (iter >= 3000) return { error: '迭代未收敛（残差 ' + resid.toExponential(2) + '），请检查参数组合。' };
  if (!isFinite(GP) || GP < 1e-4 * SA) { return { error: PL_DEGEN_MSG_E }; }

  // ---- 修正法准备金（评估基础 cE） ----
  var SE = benSuf(cE, GP, CV);
  var annDue = 0; for (var t = 1; t <= h; t++) annDue += cE.D[t - 1];
  var P_NL = SE[0] / annDue;
  var DB1 = dbOf(1, GP, CV);
  var alpha = Math.max(DB1 * cE.C[0] / cE.D[0], P_NL - 0.035 * DB1);   // 报告F097
  var beta = 0;
  if (h > 1) beta = (P_NL * annDue - alpha * cE.D[0]) / (annDue - cE.D[0]);   // 报告F098

  var rows = [];
  var DdSuf = new Array(T + 1); DdSuf[h] = 0;   // Σ_{k=t+1..h} D[k-1]（评估基础）
  for (var t = h - 1; t >= 1; t--) DdSuf[t] = DdSuf[t + 1] + cE.D[t];
  for (var t = h + 1; t <= T; t++) DdSuf[t] = 0;
  var Varr = new Array(T + 1); Varr[0] = 0;

  for (var t = 1; t <= T; t++) {
    var p1v = (S1f[t] - (t < h ? GPp1 * pdSuf1[t] : 0)) / c1.D[t];
    var p2v = (S2f[t] - (t < h ? GPp2 * pdSuf2[t] : 0)) / c2.D[t];
    // 修正责任准备金 tV′（报告F100/F102；t=bt 满期给付后为 0）
    var Vprime = (t < h) ? (SE[t] / cE.D[t] - beta * DdSuf[t] / cE.D[t])
                         : ((t < T) ? SE[t] / cE.D[t] : 0);
    var Vd = (t < h && beta > GP) ? (beta - GP) * DdSuf[t] / cE.D[t] : 0;
    var Vt = Math.max(Vprime + Vd, CV[t] || 0);
    Varr[t] = Vt;
    // 年中现价（报告F021）：t=1:(CV+NP)×0.5；t>1:(CV+CV前+NP)×0.5；NP=GP′×(1−e_t)
    // e_t 取现价基础附加费用率 eCV（与 PVR 未来净保费后缀、GP′ 分母同表，保持一致；非定价费用率 eP）
    var npCV = (t <= h) ? GPp2 * (1 - eCV[t]) : 0;
    var cvMid = (t === 1) ? 0.5 * ((CV[t] || 0) + npCV) : 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + npCV);
    rows.push({
      t: t, age: x + t, qx: qxFn(x + t - 1), R: Rof(x + t - 1),
      D: cE.D[t], C: cE.C[t - 1],
      cumPrem: GP * Math.min(t, h),
      DB: dbOf(t, GP, CV),
      mat: (t === T && cfg.mat.on) ? matOf() : 0,
      r: r[t], PVR1: p1v, CV1: CV1[t] || 0, PVR2: p2v, CV2: CV2[t] || 0,
      CV: CV[t] || 0, CVmid: cvMid,
      Vprime: Vprime, Vd: Vd, V: Vt
    });
  }

  // ---- 红利演示（现金红利，按定价利率累计生息） ----
  var divRows = null, divSum = null;
  if (cfg.div && cfg.div.on) {
    var dI = cfg.div.iStar - iEval;            // 利差 = 演示利率 − 评估利率
    var bRatio = cfg.div.b;
    var iDivAcc = cfg.i;                       // 累计生息利率 = 定价利率
    // 年度红利递推（演算至满期当年 T，含满期前一年与满期当年；满期当年 NP=0 缴费期结束）
    divRows = [];
    var cumCash = 0, firstDiv = 0, lastDiv = 0;
    for (var t = 1; t <= T; t++) {
      var NP = (t === 1) ? alpha : (t <= h ? beta : 0);   // 当年净保费（第1年α，续年β，缴费期后0）
      var Vprev = Varr[t - 1];
      // 累积生息：本年末累计 = 上年末累计 × (1 + i) + 当年红利
      var div = bRatio * Math.max((Vprev + NP) * dI, 0);
      cumCash = cumCash * (1 + iDivAcc) + div;
      if (t === 1) firstDiv = div;
      lastDiv = div;
      divRows.push({ t: t, age: x + t, Vprev: Vprev, NP: NP, div: div, cumCash: cumCash });
    }
    divSum = { firstDiv: firstDiv, lastDiv: lastDiv, cumCashDiv: cumCash, dI: dI, iStar: cfg.div.iStar, b: bRatio, iDivAcc: iDivAcc };
  }

  return {
    GP: GP, GPp1: GPp1, GPp2: GPp2, P_NL: P_NL, alpha: alpha, beta: beta,
    iter: iter + 1, resid: resid, T: T, rows: rows,
    divRows: divRows, divSum: divSum,
    matAmt: matOf(), iEval: iEval, single: single, iCV1: cfg.iCV1, iCV2: cfg.iCV2,
    benPV: SPf[0], denP: denP
  };
}

// ===== 两全保险（普通型）引擎 =====
// 普通型两全（参考：示例两全保险）公式法定价实现：
//   产品：保险期间 6 年、趸交、投保 18–75 周岁
//   定价：预定利息率 2.0%；预定发生率 = 生命表2010-2013 非养老类业务二表（男 CL3/女 CL4）× 70%；
//           预定附加费用率 趸交 1.3%（与利润测试总费用率一致）
//   身故保险金：DB = Max(累计已交保费×R, 现金价值)；R 分档 ≤41→160% / ≤61→140% / >61→120%
//           （按保单年度末年龄 x+t 划界——40岁投保第1年末到达年龄41岁即触发160%档，说明书首年 50,000×160%=80,000；
//             与条款口径「18-40周岁160%/41-60周岁140%/61周岁及以上120%、到达年龄=投保年龄+保单年度−1 取档」数值等价）
//           首年 180 日规则：DB₁ = 0.5×Max(累计保费×R, 现价) + 0.5×GP
//   满期保险金 = 基本保险金额
//   现金价值：单口径，预定利息率 4.0%（= 预定利率 + 2%，银保监办发〔2020〕7号第九条，传统型）；
//           预定附加费用率 趸交 10%；净保费法
//           GP^{CV} = [Σ DB·C^{CV} + BSA·D^{CV}_{x+bt}] / Σ_{t≤pt}(1−e'_t)·D^{CV}_{t-1}（分子 DB 中的 GP 项代入定价 GP）
//           PVR：0<t<pt 减未来净保费；pt≤t<bt 不减；t=bt 为 0
//           CV_t = r_t×Max(PVR_t,0)；r = k+(1−k)·t/Min(20,h)；趸交 k=1 / 期交 k=0.85（7号文两全档）
//   法定准备金：一年期完全修正法（FPT），α = DB₁·C_x/D_x（首年自然净保费，无分红险 3.5% 费用扣除额下限）
//           评估利息率 = 定价利率 2.0%；评估发生率 = 生命表2010-2013 × 100%
function plSolvePlainEndow(cfg) {
  var x = cfg.x, h = cfg.h, SA = cfg.SA, T = cfg.termAge - x;
  if (x < 18 || x > 75) return { error: '投保年龄需在 18–75 周岁之间（两全保险（普通型）投保规定）。' };
  if (T < 1) return { error: '保险期间无效：满期年龄需大于投保年龄。' };
  if (h > T) return { error: '交费期间 ' + h + ' 年不能超过保险期间 ' + T + ' 年（须于满期前完成交费）。' };

  var qxFn = function (a) {                       // 定价/现价发生率（默认 ×70%，对应报告生命表2010-2013×70%）
    return plQxTab(cfg, a) * cfg.factor / 1000;
  };
  var qeFn = function (a) {                       // 评估发生率（固定 ×100%，报告§4.2）
    return plQxTab(cfg, a) / 1000;
  };
  var eP = cfg.eP, eCV = cfg.eCV;
  var cP = plComm(x, T, cfg.i, qxFn);             // 定价基础（2.0%，发生率×70%）
  var cV = plComm(x, T, cfg.iCV1, qxFn);          // 现价基础（4.0% = 预定利率 + 2%，发生率×70%）
  var cE = plComm(x, T, cfg.i, qeFn);             // 评估基础（2.0%，发生率×100%）

  // 身故给付比例系数 R：报告§2.3 公式边界 ≤41/≤61/>61（按保单年度末年龄 x+t 取档）
  // 数值上等价于条款口径：18-40/41-60/61+ 按到达年龄 = 投保年龄+保单年度−1（即 x+t−1）取档
  function Rof(age) { return (age <= 41) ? cfg.death.r1 : (age <= 61 ? cfg.death.r2 : cfg.death.r3); }

  // ---- 给付函数（首年 180 日规则）----
  function dbOf(t, GP, CV) {
    if (!cfg.death.on) return 0;
    var age = x + t;
    // CV 年中：报告§3.2 公式 0.5×(CV[t] + CV[t-1] + sbOf(t,GP) + npCV)，普通型两全 sbOf≡0
    // npCV 项用 GP×(1−eCV[t]) 近似（GPcv 与 GP 差异 < 1%，对 max 项影响可忽略）
    var npCV = (t <= h) ? GP * (1 - eCV[t]) : 0;
    var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + npCV);
    var v = Math.max(GP * Math.min(t, h) * Rof(age), cvMid);
    return (t === 1) ? 0.5 * v + 0.5 * GP : v;    // 首年 180 日规则（报告§2.3）
  }
  function matOf() { return cfg.mat.on ? SA * cfg.mat.pct / 100 : 0; }

  // 分母：定价用 eP（报告§2.3）；现价基础毛保费 GP^{CV} 用 eCV（报告§3.2）
  function premDen(c, e) { var s = 0; for (var t = 1; t <= h; t++) s += c.D[t - 1] * (1 - e[t]); return s; }
  var denP = premDen(cP, eP), denCV = premDen(cV, eCV);

  // 给付现值后缀和：S[t] = Σ_{k=t+1..T} DB[k]·C[k-1] + 满期×D[T]
  function benSuf(c, GP, CV) {
    var S = new Array(T + 1); S[T] = matOf() * c.D[T];
    for (var t = T - 1; t >= 0; t--) S[t] = S[t + 1] + dbOf(t + 1, GP, CV) * c.C[t];
    return S;
  }

  // ---- 活动集线性求解定价 GP（首年含 0.5×GP 项；活动集按 cvMid 判定，与 dbOf 同口径）----
  function solveGP(CV, gpRef) {
    for (var outer = 0; outer < 12; outer++) {
      var A = 0, B = 0;
      if (cfg.death.on) {
        for (var t = 1; t <= T; t++) {
          var m = Math.min(t, h), R = Rof(x + t);
          var npCVR = (t <= h) ? gpRef * (1 - eCV[t]) : 0;
          var cvMid = 0.5 * ((CV[t] || 0) + (CV[t - 1] || 0) + npCVR);
          var active = cvMid > gpRef * m * R + 1e-12;
          if (t === 1) {
            if (active) { A += 0.5 * cvMid * cP.C[0]; B += 0.5 * cP.C[0]; }
            else { B += (0.5 * R + 0.5) * cP.C[0]; }
          } else {
            if (active) A += cvMid * cP.C[t - 1];
            else B += m * R * cP.C[t - 1];
          }
        }
      }
      if (cfg.mat.on) A += matOf() * cP.D[T];
      var denom = denP - B;
      if (denom <= 1e-12) return null;
      var gp = A / denom;
      if (Math.abs(gp - gpRef) < 1e-10 * Math.max(1, SA)) return gp;
      gpRef = gp;
    }
    return gpRef;
  }

  // 现价调整系数 r(t)：趸交 k=1 / 期交 k=0.85（银保监办发〔2020〕7号 两全档）
  var minr = Math.min(20, h), kCoef = (h === 1 ? 1 : 0.85);
  var r = new Array(T + 1);
  for (var t0 = 1; t0 <= T; t0++) r[t0] = (t0 < minr) ? (kCoef + (1 - kCoef) * t0 / minr) : 1;

  // ---- 不动点迭代：GP ↔ CV（CV 单口径，现价净保费法）----
  var CV = new Array(T + 1); for (var z = 0; z <= T; z++) CV[z] = 0;
  var PL_DEGEN_MSG_E3 = '定价方程退化为齐次方程：当前保险责任全部与「累计已交保费」成比例（身故保险金），缺少基于<b>基本保险金额</b>的定额给付（满期保险金）。等价原则下毛保费无法唯一确定。请保留满期保险金（给付基数 = 基本保险金额）。';
  var GP0 = solveGP(CV, SA * 0.5);
  if (GP0 === null) return { error: '定价方程无有效解：请检查费用率/给付参数（分母 den−B ≤ 0）。' };
  var GP = GP0 || SA * 0.5;
  if (!isFinite(GP) || GP0 < 1e-4 * SA) return { error: PL_DEGEN_MSG_E3 };

  var omega = 0.85, prevDiff = Infinity, iter = 0, resid = 0;
  var GPcv = 0, PVRn = [], CVn = [];
  for (iter = 0; iter < 3000; iter++) {
    var SV = benSuf(cV, GP, CV);
    GPcv = SV[0] / denCV;                                  // 现价基础毛保费（分子代入定价 GP）
    var NPS = new Array(T + 2); NPS[h] = 0;                // 现价净保费后缀和
    for (var t6 = h - 1; t6 >= 0; t6--) NPS[t6] = NPS[t6 + 1] + GPcv * (1 - eCV[t6 + 1]) * cV.D[t6];
    for (var t7 = h + 1; t7 <= T; t7++) NPS[t7] = 0;

    PVRn = new Array(T + 1); CVn = new Array(T + 1); PVRn[0] = CVn[0] = 0;
    for (var t = 1; t <= T; t++) {
      // 报告§3.2：t=bt 时 PVR 为 0（满期给付后合同终止，无现价）
      if (t === T) { PVRn[t] = 0; CVn[t] = 0; }
      else {
        PVRn[t] = (SV[t] - (t < h ? NPS[t] : 0)) / cV.D[t];
        CVn[t] = r[t] * Math.max(PVRn[t], 0);
      }
    }

    var GPn = solveGP(CVn, GP);
    if (GPn === null) return { error: '定价方程无有效解：请检查费用率/给付参数（分母 den−B ≤ 0）。' };
    var diff = Math.abs(GPn - GP);
    for (var t2 = 1; t2 <= T; t2++) diff = Math.max(diff, Math.abs(CVn[t2] - CV[t2]));
    if (diff > prevDiff * 1.5 && omega > 0.08) omega *= 0.5;
    prevDiff = diff; resid = diff;

    GP = GP + omega * (GPn - GP);
    for (var t3 = 1; t3 <= T; t3++) CV[t3] = CV[t3] + omega * (CVn[t3] - CV[t3]);

    if (diff < 1e-9 * Math.max(1, SA)) {
      GP = GPn;
      for (var t4 = 1; t4 <= T; t4++) CV[t4] = CVn[t4];
      var SVf = benSuf(cV, GP, CV);
      GPcv = SVf[0] / denCV;
      var NPSf = new Array(T + 2); NPSf[h] = 0;
      for (var t5 = h - 1; t5 >= 0; t5--) NPSf[t5] = NPSf[t5 + 1] + GPcv * (1 - eCV[t5 + 1]) * cV.D[t5];
      for (var t8 = h + 1; t8 <= T; t8++) NPSf[t8] = 0;
      PVRn = new Array(T + 1); CVn = new Array(T + 1); PVRn[0] = CVn[0] = 0;
      for (var t9 = 1; t9 <= T; t9++) {
        if (t9 === T) { PVRn[t9] = 0; CVn[t9] = 0; }
        else { PVRn[t9] = (SVf[t9] - (t9 < h ? NPSf[t9] : 0)) / cV.D[t9]; CVn[t9] = r[t9] * Math.max(PVRn[t9], 0); }
      }
      break;
    }
  }
  if (iter >= 3000) return { error: '迭代未收敛（残差 ' + resid.toExponential(2) + '），请检查参数组合。' };
  if (!isFinite(GP) || GP < 1e-4 * SA) return { error: PL_DEGEN_MSG_E3 };

  // ---- 法定未到期责任准备金（一年期完全修正法 FPT，报告§4.3）----
  var SE = benSuf(cE, GP, CV);
  var annDue = 0; for (var t = 1; t <= h; t++) annDue += cE.D[t - 1];
  var P_NL = SE[0] / annDue;                                   // 均衡净保费
  var DB1 = dbOf(1, GP, CV);
  var alpha = DB1 * cE.C[0] / cE.D[0];                         // 首年净保费 = 首年自然净保费（无 3.5% 下限）
  var beta = (h > 1) ? (P_NL * annDue - alpha * cE.D[0]) / (annDue - cE.D[0]) : 0;
  var DdSuf = new Array(T + 1); DdSuf[h] = 0;                  // Σ_{k=t+1..h} D[k-1]（评估基础）
  for (var t = h - 1; t >= 1; t--) DdSuf[t] = DdSuf[t + 1] + cE.D[t];
  for (var t = h + 1; t <= T; t++) DdSuf[t] = 0;

  var SP = benSuf(cP, GP, CV);                                 // 定价给付现值（平衡校验）
  var rows = [];
  for (var tt = 1; tt <= T; tt++) {
    var Vprime = (tt < h) ? (SE[tt] / cE.D[tt] - beta * DdSuf[tt] / cE.D[tt])
                          : ((tt < T) ? SE[tt] / cE.D[tt] : 0);
    var Vd = (tt < h && beta > GP) ? (beta - GP) * DdSuf[tt] / cE.D[tt] : 0;
    var Vt = Math.max(Vprime + Vd, CV[tt] || 0);
    rows.push({
      t: tt, age: x + tt, R: Rof(x + tt),
      q: qxFn(x + tt - 1), qe: qeFn(x + tt - 1),
      // 保费计算链（定价基础 2.0%，报告§2）
      Dp: cP.D[tt], Cp: cP.C[tt - 1], eP: tt <= h ? eP[tt] : null,
      DB: dbOf(tt, GP, CV), mat: (tt === T && cfg.mat.on) ? matOf() : 0,
      // 现金价值计算链（现价基础 4.0%，报告§3）
      Dv: cV.D[tt], Cv: cV.C[tt - 1], eCV: tt <= h ? eCV[tt] : null,
      NPcv: tt <= h ? GPcv * (1 - eCV[tt]) : null,
      r: r[tt], PVR: PVRn[tt], CV: CV[tt] || 0,
      // 法定准备金链（评估基础 2.0%、发生率100%，报告§4）
      De: cE.D[tt], Ce: cE.C[tt - 1],
      Vprime: Vprime, Vd: Vd, V: Vt
    });
  }

  return {
    GP: GP, GPcv: GPcv, P_NL: P_NL, alpha: alpha, beta: beta,
    iter: iter + 1, resid: resid, T: T, rows: rows,
    matAmt: matOf(), iCV: cfg.iCV1, iEval: cfg.i,
    benPV: SP[0], denP: denP, denCV: denCV,
    R: { r1: cfg.death.r1, r2: cfg.death.r2, r3: cfg.death.r3 }, single: true
  };
}

// ===== 疾病保险（重大疾病保险）引擎 =====
// 口径要点（双减因：重大疾病 + 身故）：
//   发生率：身故 q = 生命表2025 CL2×系数；重疾 q^DD = 重疾表2020 CI4×系数；
//           k = 因重大疾病死亡比例二表 K2（适用 CI2/CI4/CI6）
//   换算函数：D_{x+t} = v·D_{x+t−1}·(1 − (1−k)·q − q^DD)
//             C_{x+t−1}     = v^{1/2}·D_{x+t−1}·(1−k)·q      （身故给付）
//             C^{DD}_{x+t−1}= v^{1/2}·D_{x+t−1}·q^DD          （重疾给付）
//   给付：等待期90日折算进首年——DD₁ = DB₁ = BSA×0.75 + GP×0.25；t>1：BSA×给付比例
//   定价：GP = [Σ (DD·C^{DD} + DB·C)] / Σ_{t≤pt}(1−e_t)·D_{t−1}（首年给付含 GP，线性求解）
//   现价：净保费法；现价基础利率 = 预定利率 + 2%（银保监办发〔2020〕7号）
//         GP^{CV} 分母用现价费用率 e′；现价净保费 = GP^{CV}×(1−e′_t)
//         PVR 三段（0<t<pt 减未来净保费；pt≤t<bt 不减；t=bt 为 0）；CV = r×Max(PVR,0)
//         r = k + (1−k)·t/Min(20,pt)，期交 k=0.8（健康险档），趸交 k=1；t≥Min(20,pt) 时 r=1
//   准备金：一年期完全修正法（FPT）：α = (DD₁·C^{DD}_x + DB₁·C_x)/D_x；β 续年；
//           tV = Max(tV′ + tV^d, tCV)
function plCommCI(x, T, i, qFn, qdFn, kFn) {
  var v = 1 / (1 + i);
  var D = new Array(T + 1), C = new Array(T + 1), CD = new Array(T + 1);
  D[0] = 1;
  for (var t = 1; t <= T; t++) D[t] = _plRnd(D[t - 1] * v * (1 - (1 - kFn(x + t - 1)) * qFn(x + t - 1) - qdFn(x + t - 1)));
  for (var a = 0; a < T; a++) {
    C[a] = _plRnd(Math.pow(v, 0.5) * D[a] * (1 - kFn(x + a)) * qFn(x + a));
    CD[a] = _plRnd(Math.pow(v, 0.5) * D[a] * qdFn(x + a));
  }
  C[T] = 0; CD[T] = 0;
  return { v: v, D: D, C: C, CD: CD };
}

function plSolveCI(cfg) {
  var x = cfg.x, h = cfg.h, SA = cfg.SA, T = cfg.termAge - x;
  if (x < 20 || x > 50) return { error: '投保年龄需在 20–50 周岁之间（重大疾病保险投保规定）。' };
  if (T < 1) return { error: '保险期间无效：满期年龄需大于投保年龄。' };
  if (h > T) return { error: '交费期间 ' + h + ' 年不能超过保险期间 ' + T + ' 年（须于满期前完成交费）。' };

  var qFn = function (a) { return plQxTab(cfg, a) * cfg.factor / 1000; };
  var qdFn = function (a) { return CI2020[cfg.ciTable][cfg.gender][Math.max(0, Math.min(105, a))] * cfg.ciFactor / 1000; };
  var kArr = CI2020[cfg.kTable || 'k2'][cfg.gender];
  var kFn = function (a) { return kArr[Math.max(0, Math.min(kArr.length - 1, a))] * cfg.kFactor / 100; };

  var eP = cfg.eP, eCV = cfg.eCV;
  var iEval = Math.min(cfg.i, 0.035);                 // 评估利息率（报告§4.2：同预定利息率；上限3.5%）
  var cP = plCommCI(x, T, cfg.i, qFn, qdFn, kFn);     // 定价基础（2.0%）
  var cV = plCommCI(x, T, cfg.iCV, qFn, qdFn, kFn);   // 现价基础（4.0% = 预定利率+2%）
  var cE = plCommCI(x, T, iEval, qFn, qdFn, kFn);     // 评估基础（= 预定利率）

  // ---- 给付函数（等待期90日：首年给付 = 基本保额×0.75 + 毛保费×0.25）----
  function ddOf(t, GP) {
    if (!cfg.dd.on) return 0;
    var p = cfg.dd.pct / 100;
    return (t === 1 && cfg.wait.on) ? (0.75 * SA * p + 0.25 * GP) : SA * p;
  }
  function dbOf(t, GP) {
    if (!cfg.db.on) return 0;
    var p = cfg.db.pct / 100;
    return (t === 1 && cfg.wait.on) ? (0.75 * SA * p + 0.25 * GP) : SA * p;
  }
  // 给付现值后缀和：S[t] = Σ_{k=t+1..T} (DD·C^{DD} + DB·C)
  function benSuf(c, GP) {
    var S = new Array(T + 1); S[T] = 0;
    for (var t = T - 1; t >= 0; t--) S[t] = S[t + 1] + ddOf(t + 1, GP) * c.CD[t] + dbOf(t + 1, GP) * c.C[t];
    return S;
  }
  function premDen(c, e) { var s = 0; for (var t = 1; t <= h; t++) s += c.D[t - 1] * (1 - e[t]); return s; }
  // 首年给付含 GP×0.25 → 将 GP 项移到分母，一次线性求解
  function kgpOf(c) { return 0.25 * ((cfg.dd.on ? c.CD[0] : 0) + (cfg.db.on ? c.C[0] : 0)); }

  var denP = premDen(cP, eP);
  var A0 = benSuf(cP, 0)[0];                 // 不含 GP 项的给付现值
  var denom = denP - kgpOf(cP);
  if (!(denom > 1e-12)) return { error: '定价方程无有效解：请检查费用率与责任参数（分母 ≤ 0）。' };
  var GP = A0 / denom;
  var A = A0 + GP * kgpOf(cP);               // 给付现值合计（平衡校验用）

  var denCV = premDen(cV, eCV);
  // GPCV 公式：分母直接用 Σ(1−e'_t)·D_{t-1}（不扣减首年GP调整项）
  // 分子用 benSuf(cV, GP)[0] 将定价 GP 代入 DD₁/DB₁ = 0.75·SA + 0.25·GP
  // → GPCV = benSuf(cV, GP)[0] / denCV（与手工公式完全一致）
  var denomV = denCV;
  if (!(denomV > 1e-12)) return { error: '现价基础毛保费无有效解：请检查现价费用率（分母 ≤ 0）。' };
  var GPcv = benSuf(cV, GP)[0] / denomV;      // 保单价值准备金毛保费 GP^{CV}

  // ---- 现金价值（净保费法）----
  var NPS = new Array(T + 2); NPS[h] = 0;    // 现价净保费后缀和
  for (var t = h - 1; t >= 0; t--) NPS[t] = NPS[t + 1] + GPcv * (1 - eCV[t + 1]) * cV.D[t];
  for (var t2 = h + 1; t2 <= T; t2++) NPS[t2] = 0;
  var SV = benSuf(cV, GPcv);
  var minr = Math.min(20, h), kCoef = (h === 1 ? 1 : 0.8);   // 健康险档（7号文）：期交 0.8 / 趸交 1
  var r = new Array(T + 1), CV = new Array(T + 1), PVR = new Array(T + 1);
  CV[0] = 0; PVR[0] = 0;
  for (var t3 = 1; t3 <= T; t3++) {
    r[t3] = (t3 < minr) ? (kCoef + (1 - kCoef) * t3 / minr) : 1;
    PVR[t3] = (SV[t3] - (t3 < h ? NPS[t3] : 0)) / cV.D[t3];
    CV[t3] = r[t3] * Math.max(PVR[t3], 0);
  }

  // ---- 法定未到期责任准备金（一年期完全修正法 FPT）----
  var SE = benSuf(cE, GP);
  var annDue = 0; for (var t = 1; t <= h; t++) annDue += cE.D[t - 1];
  var P_NL = SE[0] / annDue;                                   // 均衡净保费
  var DD1 = ddOf(1, GP), DB1 = dbOf(1, GP);
  var alpha = (DD1 * cE.CD[0] + DB1 * cE.C[0]) / cE.D[0];      // 首年净保费 = 首年自然净保费
  var beta = (h > 1) ? (P_NL * annDue - alpha * cE.D[0]) / (annDue - cE.D[0]) : 0;
  var DdSuf = new Array(T + 1); DdSuf[h] = 0;                  // Σ_{k=t+1..h} D[k-1]（评估基础）
  for (var t = h - 1; t >= 1; t--) DdSuf[t] = DdSuf[t + 1] + cE.D[t];
  for (var t9 = h + 1; t9 <= T; t9++) DdSuf[t9] = 0;

  var rows = [];
  for (var tt = 1; tt <= T; tt++) {
    var Vprime = (tt < h) ? (SE[tt] / cE.D[tt] - beta * DdSuf[tt] / cE.D[tt])
                          : ((tt < T) ? SE[tt] / cE.D[tt] : 0);
    var Vd = (tt < h && beta > GP) ? (beta - GP) * DdSuf[tt] / cE.D[tt] : 0;
    var Vt = Math.max(Vprime + Vd, CV[tt] || 0);
    rows.push({
      t: tt, age: x + tt,
      q: qFn(x + tt - 1), qd: qdFn(x + tt - 1), k: kFn(x + tt - 1),
      // 保费计算链（定价基础 i=2.0%）
      Dp: cP.D[tt], Cp: cP.C[tt - 1], CDp: cP.CD[tt - 1],
      eP: tt <= h ? eP[tt] : null,
      DD: ddOf(tt, GP), DB: dbOf(tt, GP),
      // 现金价值计算链（现价基础 iCV=4.0%）
      Dv: cV.D[tt], Cv: cV.C[tt - 1], CDv: cV.CD[tt - 1],
      eCV: tt <= h ? eCV[tt] : null,
      NPcv: tt <= h ? GPcv * (1 - eCV[tt]) : null,
      r: r[tt], PVR: PVR[tt], CV: CV[tt] || 0,
      // 法定准备金链（评估基础 iEval）
      De: cE.D[tt], Ce: cE.C[tt - 1], CDe: cE.CD[tt - 1],
      Vprime: Vprime, Vd: Vd, V: Vt
    });
  }

  return {
    GP: GP, GPcv: GPcv, P_NL: P_NL, alpha: alpha, beta: beta,
    T: T, rows: rows, iEval: iEval,
    benPV: A, denP: denP, denCV: denCV,
    dd1: DD1, db1: DB1
  };
}

// ---------- 页面交互 ----------
document.addEventListener('DOMContentLoaded', function () {
  // 产品形态 → 自动发生率表
  var selType = document.getElementById('pl_type');
  var selTable = document.getElementById('pl_table');
  var selVer = document.getElementById('pl_tblver');
  var tblNote = document.getElementById('pl_note_table');
  var selTerm = document.getElementById('pl_term');
  var termNote = document.getElementById('pl_note_term');
  function autoTable() {
    var m = PL_TABLE_AUTO[selType.value];
    if (m) {
      selTable.value = m.table;
      // 发生率系数联动：普通型两全自动带出 70%，其余产品重置为 100%（避免跨类型切换残留）
      document.getElementById('pl_factor').value = m.factor || 100;
      // 表版本联动：自动带出对应版本（普通型两全 → 生命表2010-2013 原表），其余产品重置为 2025（避免跨类型切换残留）
      selVer.value = m.tblVer || '2025';
      tblNote.innerHTML = '已自动选择：<b>' + m.name + '</b>（金规〔2025〕21号：按主要责任定基准表）。默认系数 ' + (m.factor || 100) + '%，可手工调整。' + (m.note ? '<br><span style="color:#8a5a2b">⚠ ' + m.note + '</span>' : '');
    }
  }
  // 保险期间：双模式（保至X岁 / 保N年），按产品类型带默认值；
  // 镜像写入隐藏域 pl_term：'age' 模式存满期年龄（数字），'years' 模式存 'dN'（沿用引擎既有解析）
  var selTermMode = document.getElementById('pl_term_mode');
  var termVal = document.getElementById('pl_term_val');
  var termUnit = document.getElementById('pl_term_unit');
  function setTermUnit() { termUnit.textContent = (selTermMode.value === 'age') ? '周岁' : '年'; }
  function syncTermMirror() {
    var d = PL_TERM_DEFAULTS[selType.value] || PL_TERM_DEFAULTS.annuity;
    if (d.fixed) { selTerm.value = String(d.age); return; }
    var val = Math.round(parseFloat(termVal.value) || 0);
    selTerm.value = (selTermMode.value === 'age') ? String(Math.max(1, val)) : ('d' + Math.max(1, val));
    updateMatAgeText();
  }
  // 年金「满期日（X岁）」文案随保险期间联动（age 模式 = 输入年龄；years 模式 = 投保年龄 + 保N年）
  function updateMatAgeText() {
    var el = document.getElementById('pl_mat_age');
    if (!el || !plIsAnn(selType.value)) return;
    var xa = Math.round(parseFloat(document.getElementById('pl_x').value) || 0);
    var va = Math.round(parseFloat(termVal.value) || 0);
    if (!va) return;
    el.textContent = String((selTermMode.value === 'age') ? va : xa + va);
  }
  function renderTerm() {
    var d = PL_TERM_DEFAULTS[selType.value] || PL_TERM_DEFAULTS.annuity;
    selTermMode.value = d.mode;
    selTermMode.disabled = !!d.fixed;
    termVal.disabled = !!d.fixed;
    termVal.value = (d.mode === 'age') ? d.age : d.years;
    setTermUnit();
    syncTermMirror();
    termNote.innerHTML = d.note;
  }
  // ---- 现金价值计算用利率：按法定规则自动带出（分红型93号 / 传统型7号）----
  var icv1Dirty = false;
  function termYears() {
    var isEndow = plIsEndow(selType.value);
    var x = Math.round(parseFloat(document.getElementById('pl_x').value) || 0);
    if (!isEndow) {
      // 年金 / 疾病保险：保险期间同样支持「保至X岁」（存满期年龄数字）与「保N年」（存 'dN'）
      var tvN = String(document.getElementById('pl_term').value);
      return (tvN.charAt(0) === 'd') ? parseInt(tvN.slice(1), 10) : (Math.round(parseFloat(tvN)) - x);
    }
    var tv = String(document.getElementById('pl_term').value);
    return (tv.charAt(0) === 'd') ? parseInt(tv.slice(1), 10) : Math.round(parseFloat(tv)) - x;
  }
  function cvRateSuggest() {
    var i = parseFloat(document.getElementById('pl_i').value) || 0;
    var isEndow = plIsEndow(selType.value), isE2 = plIsE2(selType.value), isE3 = plIsE3(selType.value);
    var bt = termYears();
    if (!isEndow) {
      return { add: 2.0, val: i + 2.0, bt: bt, single: false,
        rule: '传统型（普通型）：报备时厘定保险费所用预定利率 ' + i.toFixed(2) + '% + 2%',
        src: '银保监办发〔2020〕7号《普通型人身保险精算规定》第九条' };
    }
    if (isE3) {
      // 普通型两全：现价单口径 = 预定利率 + 2%（7号文传统型）
      return { add: 2.0, val: i + 2.0, bt: bt, single: true,
        rule: '传统型（普通型）：报备时厘定保险费所用预定利率 ' + i.toFixed(2) + '% + 2% ＝ ' + (i + 2.0).toFixed(2) + '%',
        src: '银保监办发〔2020〕7号《普通型人身保险精算规定》第九条（报告§3.1 预定利息率 4.0%）' };
    }
    var add = (bt <= 10) ? 1.0 : 1.5;
    return { add: add, val: i + add, bt: bt, single: isE2,
      rule: '分红型：保险期间 ' + bt + ' 年（' + (bt <= 10 ? '10年及以下 +1.0%' : '10年以上 +1.5%') + '）＝ 预定利率 ' + i.toFixed(2) + '% + ' + add.toFixed(1) + '%',
      src: '保监发〔2015〕93号《分红保险精算规定》第九条' };
  }
  function updateCVNote() {
    var s = cvRateSuggest();
    var isCI = plIsCI(selType.value), isE3 = plIsE3(selType.value);
    if (!icv1Dirty) document.getElementById('pl_icv1').value = plRatePlain(s.val);
    if (s.single && !icv1Dirty) document.getElementById('pl_icv2').value = s.val.toFixed(2);
    var head, tail;
    if (isCI) {
      head = '现金价值计算基础利率按法定规则自动带出：<b>' + s.rule + ' ＝ ' + plRatePlain(s.val) + '%</b>（<b>单口径</b>，疾病保险无初期/终极双口径融合，现价费用率按 7号文 健康保险档）；';
      tail = '';
    } else if (s.single) {
      head = '现金价值计算基础利率按法定规则自动带出：<b>' + s.rule + ' ＝ ' + plRatePlain(s.val) + '%</b>（<b>单口径</b>' + (isE3 ? '，普通型两全报告§3.1 无初期/终极双口径融合' : '，中短期两全报告§3.1 无初期/终极双口径融合') + '）；';
      tail = '';
    } else {
      head = '初期（保单价值准备金）口径按法定规则自动带出：<b>' + s.rule + ' ＝ ' + plRatePlain(s.val) + '%</b>；';
      tail = '终极口径取定价利率。';
    }
    var kTxt = isCI ? '期交 k=0.8（健康保险档）／趸交 k=1' : (isE3 ? '期交 k=0.85（两全档，7号文）／趸交 k=1' : '期交 k=0.9／趸交 k=1');
    document.getElementById('pl_note_icv').innerHTML = '<span style="color:#8a7a6a">本工具 CV = r(t)×max(PVR,0)，r(t) 即法定系数（' + kTxt + '），即保单年度末保单最低现金价值口径</span>' +
      (icv1Dirty ? ' <b style="color:#b53d2e">（已手工调整）</b>' : '');
  }
  document.getElementById('pl_icv1').addEventListener('input', function () { icv1Dirty = true; updateCVNote(); });
  document.getElementById('pl_i').addEventListener('input', updateCVNote);
  document.getElementById('pl_x').addEventListener('input', updateCVNote);

  // 产品类型切换：定价参数重置 + 责任区/公式区/分红卡显隐
  function applyType() {
    var isEndow = plIsEndow(selType.value), isE2 = plIsE2(selType.value), isE3 = plIsE3(selType.value), isCI = plIsCI(selType.value);
    var def = PL_TYPE_DEFAULTS[selType.value];
    document.getElementById('pl_i').value = def.i;
    document.getElementById('pl_i').max = def.iMax;
    document.getElementById('pl_note_i').innerHTML = isE3
      ? '普通型上限2.0%（2026）；本工具采用2.0%'
      : (isEndow
        ? '分红型上限1.75%（2025年9月起）；报告采用1.75%'
        : '普通型上限2.0%（2026）；报告采用2.0%');
    document.getElementById('pl_icv2').value = def.icv2;
    icv1Dirty = false;   // 切换产品类型：初期现价利率恢复为法定规则自动带出
    document.getElementById('pl_x').max = def.ageMax;
    document.getElementById('pl_x').min = def.ageMin || 0;
    document.getElementById('pl_note_age').innerHTML = isCI
      ? '投保规定：20周岁至50周岁'
      : (isE3 ? '投保规定：18周岁至75周岁'
        : (isEndow ? '报告投保规定：出生满28日至75周岁' : '报告投保规定：出生满28日至80周岁'));
    document.getElementById('pl_note_sa').innerHTML = isCI
      ? '重大疾病保险金 / 身故保险金的给付基数'
      : (isEndow ? '满期保险金的给付基数' : '关爱保险金的给付基数');
    updateBeneEnabled(selType.value);
    applyBeneDefaults(selType.value);   // 重置保险责任参数：支持的→报告口径默认；不支持的→取消勾选
    document.getElementById('pl_ci_table_card').style.display = isCI ? '' : 'none';
    document.getElementById('pl_formula_ann').style.display = (isEndow || isCI) ? 'none' : '';
    document.getElementById('pl_formula_endow').style.display = (isEndow && !isE2 && !isE3) ? '' : 'none';
    document.getElementById('pl_formula_endow2').style.display = isE2 ? '' : 'none';
    document.getElementById('pl_formula_e3').style.display = isE3 ? '' : 'none';
    document.getElementById('pl_formula_ci').style.display = isCI ? '' : 'none';
    document.getElementById('pl_div_card').style.display = (isEndow && !isE3) ? '' : 'none';
    // 单口径现价（中短期两全 / 普通型两全 / 疾病保险）：隐藏「终极」输入框
    document.getElementById('pl_icv2_wrap').style.display = (isE2 || isE3 || isCI) ? 'none' : '';
    autoTable();
    renderTerm();
    renderH();
    renderExp();
    updateCVNote();
  }
  // 每种产品类型支持的责任集合（支持 → 可勾选可调参；不支持 → 整块隐藏不出现，避免误操作）
  var PL_BENE_BY_TYPE = {
    annuity:    ['care', 'ann', 'mat', 'death'],
    annuity_immediate: ['care', 'ann', 'mat', 'death'],
    endowment:  ['edm_death', 'edm_mat'],
    endowment2: ['edm_death', 'edm_mat'],
    endowment3: ['edm_death', 'edm_mat'],
    ci:         ['ci_dd', 'ci_db', 'ci_wait']
  };
  function updateBeneEnabled(type) {
    var enabled = new Set(PL_BENE_BY_TYPE[type] || []);
    var boxes = document.querySelectorAll('.pl-ben[data-bene]');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var on = enabled.has(box.getAttribute('data-bene'));
      box.style.display = on ? '' : 'none';
      var cbs = box.querySelectorAll('input[type="checkbox"], input[type="number"]');
      for (var j = 0; j < cbs.length; j++) cbs[j].disabled = !on;
    }
  }
  // 切换产品类型时重置全部责任参数：支持的 pl-ben → 报告口径默认（勾选+参数）；不支持的 pl-ben → 取消勾选并清空参数
  // 防止跨类型切换时已勾选的责任"残留"污染初始界面
  function applyBeneDefaults(type) {
    var enabled = new Set(PL_BENE_BY_TYPE[type] || []);
    var defaults = PL_BENE_DEFAULTS_BY_TYPE[type] || {};
    Object.keys(PL_BENE_INPUT_MAP).forEach(function (key) {
      var map = PL_BENE_INPUT_MAP[key];
      var cb = document.getElementById(map.cb);
      if (!cb) return;
      var isEnabled = enabled.has(key);
      var d = defaults[key] || {};
      cb.checked = isEnabled && d.on !== false;
      Object.keys(map.fields).forEach(function (id) {
        var field = map.fields[id];
        var el = document.getElementById(id);
        if (el && d[field] !== undefined) el.value = d[field];
      });
    });
    // 重置后刷新勾选态对应的视觉透明度（与 1158 行 toggle() 行为一致）
    document.querySelectorAll('.pl-ben[data-bene]').forEach(function (box) {
      var k = box.getAttribute('data-bene');
      var cb = document.getElementById(PL_BENE_INPUT_MAP[k] && PL_BENE_INPUT_MAP[k].cb);
      if (!cb) return;
      box.style.opacity = cb.checked ? '1' : '0.45';
      box.style.pointerEvents = cb.checked ? '' : 'none';
    });
    // 4 张年金卡片 opt-box 联动（根据每个 pl-ben 的 select value 切显隐）
    if (typeof plUpdateOptBoxes === 'function') plUpdateOptBoxes();
  }
  selType.addEventListener('change', applyType);
  selTable.addEventListener('change', function () {
    tblNote.innerHTML = '已手工切换为 <b>' + selTable.options[selTable.selectedIndex].text + '</b>（表版本：' + selVer.options[selVer.selectedIndex].text + '）：请自行确认符合金规〔2025〕21号选表规则（同一产品多责任按主要责任定基准表）。';
  });
  // 表版本切换（2025 / 2010-2013）：2010 版按性别分表（男CL1/3/5、女CL2/4/6），2025 语义表号自动映射
  selVer.addEventListener('change', function () {
    var v = selVer.value;
    var lbl = (v === '2010') ? '生命表2010-2013' : '生命表2025';
    var cur = selTable.options[selTable.selectedIndex].text.replace(/生命表(2025|2010-2013)/, '').trim();
    tblNote.innerHTML = '已切换表版本为 <b>' + lbl + '</b>（当前表：' + cur + '，系数 ' + document.getElementById('pl_factor').value + '%）：2010 版按性别分表（男 CL1/CL3/CL5、女 CL2/CL4/CL6），表号已自动映射；请自行确认符合选表规则（同一产品多责任按主要责任定基准表）。';
  });
  autoTable();

  // 交费期间 → 费用率表联动（分红型现价费用率与普通型不同：93号 vs 7号）
  // 双模式：'years' N年交（pt = N）；'age' 交至N周岁（pt = N − x）；镜像写入隐藏域 pl_h（存 pt 年数）
  var selH = document.getElementById('pl_h');
  var selHMode = document.getElementById('pl_h_mode');
  var hVal = document.getElementById('pl_h_val');
  var hUnit = document.getElementById('pl_h_unit');
  var hNoteEl = document.getElementById('pl_note_h');
  var expBox = document.getElementById('pl_exp');
  function setHUnit() { hUnit.textContent = (selHMode.value === 'age') ? '周岁' : '年'; }
  function syncHMirror() {
    var x = Math.round(parseFloat(document.getElementById('pl_x').value) || 0);
    var val = Math.round(parseFloat(hVal.value) || 0);
    var hh = (selHMode.value === 'age') ? (val - x) : val;
    selH.value = String(Math.max(1, hh));
  }
  function renderHNote() {
    var x = Math.round(parseFloat(document.getElementById('pl_x').value) || 0);
    var hh = parseInt(selH.value, 10);
    if (selHMode.value === 'age') {
      var raw = Math.round(parseFloat(hVal.value) || 0) - x;
      if (raw < 1) { hNoteEl.innerHTML = '<b style="color:#b53d2e">交至年龄需大于投保年龄（当前 x = ' + x + '）</b>'; return; }
      hNoteEl.innerHTML = '当前交费期间 <b>pt = ' + hh + ' 年</b>（交至 ' + hVal.value + ' 周岁 − 投保年龄 ' + x + '）；附加费用率表随交费方式自动联动，交费方式无对应费用率表时按兜底表（第1年 5%、第2年及以后 2%）自动带出，单位 %，可修改。';
    } else {
      hNoteEl.innerHTML = '当前交费期间 <b>pt = ' + hh + ' 年</b>（' + hh + ' 年交）；附加费用率表随交费方式自动联动，交费方式无对应费用率表时按兜底表（第1年 5%、第2年及以后 2%）自动带出，单位 %，可修改。';
    }
  }
  function renderH() {
    var d = PL_H_DEFAULTS[selType.value] || PL_H_DEFAULTS.annuity;
    selHMode.value = d.mode;
    hVal.value = (d.mode === 'years') ? d.years : d.age;
    setHUnit();
    syncHMirror();
    renderHNote();
  }
  function renderExp() {
    var h = parseInt(selH.value, 10) || 1;
    var isEndow = plIsEndow(selType.value), isE3 = plIsE3(selType.value), isCI = plIsCI(selType.value);
    var html = '';
    if (isCI) {
      // 疾病保险交费期长（20–40年）：按「前5年 + 第6年及以后」6 个槽位录入（单位 %）
      var epc = PL_EXP_CI_PRICING, ecc = plExpCvCI(h);
      var heads = ['第1年', '第2年', '第3年', '第4年', '第5年', '第6年及以后'];
      html = '<table class="pl-mini"><tr><th>费用率档位（%）</th>';
      for (var k = 0; k < 6; k++) html += '<th>' + heads[k] + '</th>';
      html += '</tr><tr><td><b>定价费用率 e<sub>t</sub></b></td>';
      for (var k2 = 1; k2 <= 6; k2++) html += '<td><input type="number" step="0.01" min="0" max="90" id="pl_ep_' + k2 + '" value="' + (epc[k2] * 100).toFixed(2) + '"></td>';
      html += '</tr><tr><td><b>现价费用率 e′<sub>t</sub></b></td>';
      for (var k3 = 1; k3 <= 6; k3++) html += '<td><input type="number" step="0.01" min="0" max="90" id="pl_ec_' + k3 + '" value="' + (ecc[k3] * 100).toFixed(2) + '"></td>';
      html += '</tr></table><div class="pl-mini-note">单位 <b>%</b>。定价费用率与现价费用率均按银保监办发〔2020〕7号健康保险档上限自动带出并展开为 6 列，可逐格修改。</div>';
      expBox.innerHTML = html;
      return;
    }
    // 通用化：min(h,6) 个槽位（单位 %）展开为 h 年；有报告费用率表用表值，无对应表按兜底表（首年5%、续期2%）
    var tabs = plExpTabs(selType.value);
    var hasTab = !!tabs.eP[h] && !!tabs.eCV[h];
    var ep = hasTab ? tabs.eP[h] : PL_EXP_FALLBACK, ec = hasTab ? tabs.eCV[h] : PL_EXP_FALLBACK;
    var slots = Math.min(h, 6);
    html = '<table class="pl-mini"><tr><th>费用率档位（%）</th>';
    for (var s = 1; s <= slots; s++) html += '<th>' + (s === 6 ? '第6年及以后' : '第' + s + '年') + '</th>';
    html += '</tr><tr><td><b>定价费用率 e<sub>t</sub></b></td>';
    for (var t2 = 1; t2 <= slots; t2++) html += '<td><input type="number" step="0.01" min="0" max="90" id="pl_ep_' + t2 + '" value="' + (ep[t2] * 100).toFixed(2) + '"></td>';
    html += '</tr><tr><td><b>现价费用率 e′<sub>t</sub></b></td>';
    for (var t3 = 1; t3 <= slots; t3++) html += '<td><input type="number" step="0.01" min="0" max="90" id="pl_ec_' + t3 + '" value="' + (ec[t3] * 100).toFixed(2) + '"></td>';
    html += '</tr></table><div class="pl-mini-note">单位 <b>%</b>。' + (hasTab
      ? '定价费用率与现价费用率均按对应监管上限带出（' + (isEndow ? (isE3 ? '银保监办发〔2020〕7号传统型两全档' : '原保监发〔2015〕93号分红型档') : '银保监办发〔2020〕7号普通型档') + '），可直接修改。'
      : '当前交费期间 <b>pt=' + h + ' 无对应费用率表</b>，按兜底表自动带出：第1年 <b>5%</b>、第2年及以后 <b>2%</b>（槽位值展开至整个交费期）；可直接修改。') + '</div>';
    expBox.innerHTML = html;
  }
  // 保险期间 / 交费期间双模式联动：切换模式时数值重置为该模式默认值；镜像写入隐藏域后触发既有联动
  selTermMode.addEventListener('change', function () {
    var d = PL_TERM_DEFAULTS[selType.value] || PL_TERM_DEFAULTS.annuity;
    if (!d.fixed) termVal.value = (selTermMode.value === 'age') ? d.age : d.years;
    setTermUnit(); syncTermMirror(); updateCVNote();
  });
  termVal.addEventListener('input', function () { syncTermMirror(); updateCVNote(); });
  selHMode.addEventListener('change', function () {
    var d = PL_H_DEFAULTS[selType.value] || PL_H_DEFAULTS.annuity;
    hVal.value = (selHMode.value === 'years') ? d.years : d.age;
    setHUnit(); syncHMirror(); renderExp(); renderHNote();
  });
  hVal.addEventListener('input', function () { syncHMirror(); renderExp(); renderHNote(); });
  document.getElementById('pl_x').addEventListener('change', function () { syncHMirror(); renderExp(); renderHNote(); updateCVNote(); updateMatAgeText(); });
  renderTerm();
  renderH();
  renderExp();
  updateCVNote();

  // 保险责任开关 → 参数区显隐
  ['care', 'ann', 'mat', 'death', 'edm_death', 'edm_mat', 'ci_dd', 'ci_db'].forEach(function (k) {
    var cb = document.getElementById('pl_on_' + k);
    var box = document.getElementById('pl_box_' + k);
    if (!cb || !box) return;
    function toggle() { box.style.opacity = cb.checked ? '1' : '0.45'; box.style.pointerEvents = cb.checked ? '' : 'none'; }
    cb.addEventListener('change', toggle); toggle();
  });

  // 初始化：触发保险责任区显隐 + 参数默认值重置，确保初始界面与默认产品类型（年金）匹配
  // 必须在所有 var 定义与监听器绑定完成后调用（renderH 等依赖 selHMode/hVal 等变量）
  applyType();
  // 绑定 4 张年金卡片的 opt select 联动 + pivot 数字同步（applyType→applyBeneDefaults 内已调用一次初始化）
  if (typeof plBindOptSelects === 'function') plBindOptSelects();

  // 计算
  document.getElementById('pl_btn').addEventListener('click', function () {
    var f = function (id) { return parseFloat(document.getElementById(id).value); };
    var h = parseInt(selH.value, 10) || 1;
    var isEndow = plIsEndow(selType.value), isE3 = plIsE3(selType.value), isCI = plIsCI(selType.value);
    var eP = [0], eCV = [0];
    if (isCI) {
      // 疾病保险：6 个槽位（第1…5年、第6年及以后，单位 %）展开为 h 年
      var epv = [], ecv = [];
      for (var k = 1; k <= 6; k++) {
        var a = f('pl_ep_' + k), b = f('pl_ec_' + k);
        epv.push(isNaN(a) ? PL_EXP_CI_PRICING[k] : Math.max(0, Math.min(0.9, a / 100)));
        ecv.push(isNaN(b) ? plExpCvCI(h)[k] : Math.max(0, Math.min(0.9, b / 100)));
      }
      for (var t0 = 1; t0 <= h; t0++) { eP.push(epv[Math.min(t0, 6) - 1]); eCV.push(ecv[Math.min(t0, 6) - 1]); }
    } else {
      // 通用化：min(h,6) 个槽位（单位 %）展开为 h 年；槽位默认值 = 报告费用率表，无对应表时用兜底表
      var tabsX = plExpTabs(selType.value), dEp = tabsX.eP[h] || PL_EXP_FALLBACK, dEc = tabsX.eCV[h] || PL_EXP_FALLBACK;
      var ns = Math.min(h, 6), epv2 = [], ecv2 = [];
      for (var k2 = 1; k2 <= ns; k2++) {
        var a2 = f('pl_ep_' + k2), b2 = f('pl_ec_' + k2);
        epv2.push(isNaN(a2) ? dEp[k2] : Math.max(0, Math.min(0.9, a2 / 100)));
        ecv2.push(isNaN(b2) ? dEc[k2] : Math.max(0, Math.min(0.9, b2 / 100)));
      }
      for (var t = 1; t <= h; t++) { eP.push(epv2[Math.min(t, ns) - 1]); eCV.push(ecv2[Math.min(t, ns) - 1]); }
    }
    var cfg = {
      x: Math.round(f('pl_x')), gender: document.getElementById('pl_g').value,
      h: h, SA: f('pl_sa'), table: selTable.value, tblVer: document.getElementById('pl_tblver').value, factor: f('pl_factor') / 100,
      i: f('pl_i') / 100, iCV1: f('pl_icv1') / 100, iCV2: f('pl_icv2') / 100,
      eP: eP, eCV: eCV
    };
    if (isCI) {
      // 通用化：保险期间支持「保至X岁」（存满期年龄）与「保N年」（存 'dN'）双模式
      var tvCI = String(selTerm.value);
      cfg.termAge = (tvCI.charAt(0) === 'd') ? cfg.x + parseInt(tvCI.slice(1), 10) : Math.round(parseFloat(tvCI));
      cfg.iCV = f('pl_icv1') / 100;
      cfg.ciTable = document.getElementById('pl_ci_table').value;
      cfg.kTable = 'k2';
      cfg.ciFactor = f('pl_ci_factor') / 100;
      cfg.kFactor = f('pl_k_factor') / 100;
      cfg.dd = { on: document.getElementById('pl_on_ci_dd').checked, pct: f('pl_ci_dd_pct') };
      cfg.db = { on: document.getElementById('pl_on_ci_db').checked, pct: f('pl_ci_db_pct') };
      cfg.wait = { on: document.getElementById('pl_ci_wait').checked };
    } else if (isEndow) {
      var tv = String(document.getElementById('pl_term').value);
      cfg.termAge = (tv.charAt(0) === 'd') ? cfg.x + parseInt(tv.slice(1), 10) : Math.round(parseFloat(tv));
      cfg.single = plIsE2(selType.value);      // 中短期两全：现价单口径（无初期/终极融合）
      cfg.noRule180 = plIsE2(selType.value);   // 中短期两全：无首年180日规则
      cfg.death = { on: document.getElementById('pl_on_edm_death').checked, r1: f('pl_edm_r1') / 100, r2: f('pl_edm_r2') / 100, r3: f('pl_edm_r3') / 100 };
      cfg.mat = { on: document.getElementById('pl_on_edm_mat').checked, pct: f('pl_edm_mat_pct') };
      cfg.div = { on: document.getElementById('pl_on_div').checked, iStar: f('pl_div_istar') / 100, b: f('pl_div_b') / 100 };
    } else {
      // 年金：保险期间支持「保至X岁」（存满期年龄数字）与「保N年」（存 'dN'）双模式
      var tvA = String(document.getElementById('pl_term').value);
      cfg.termAge = (tvA.charAt(0) === 'd') ? cfg.x + parseInt(tvA.slice(1), 10) : Math.round(parseFloat(tvA));
      // 4 类年金责任统一用 opt1/opt2 双选项 + 对应参数（care/ann/mat/death）
      cfg.care = {
        on: document.getElementById('pl_on_care').checked,
        opt: document.getElementById('pl_care_opt').value,
        opt1_age: Math.round(f('pl_care_opt1_age')),
        opt1_pct: f('pl_care_opt1_pct'),
        opt2_year: Math.round(f('pl_care_opt2_year')),
        opt2_pct: f('pl_care_opt2_pct')
      };
      cfg.ann = {
        on: document.getElementById('pl_on_ann').checked,
        opt: document.getElementById('pl_ann_opt').value,
        opt1_start: Math.round(f('pl_ann_opt1_start')),
        opt1_count: Math.round(f('pl_ann_opt1_count')),
        opt1_basis1: document.getElementById('pl_ann_opt1_basis1').value,
        opt1_pct1: f('pl_ann_opt1_pct1'),
        opt1_basis2: document.getElementById('pl_ann_opt1_basis2').value,
        opt1_pct2: f('pl_ann_opt1_pct2'),
        opt2_start: Math.round(f('pl_ann_opt2_start')),
        opt2_basis: document.getElementById('pl_ann_opt2_basis').value,
        opt2_pct: f('pl_ann_opt2_pct')
      };
      cfg.mat = { on: document.getElementById('pl_on_mat').checked, pct: f('pl_mat_pct') };
      cfg.death = {
        on: document.getElementById('pl_on_death').checked,
        opt: document.getElementById('pl_death_opt').value,
        opt1_split: Math.round(f('pl_death_opt1_split')),
        opt1_before: f('pl_death_opt1_before'),
        opt1_after: f('pl_death_opt1_after')
      };
    }
    var defT = PL_TYPE_DEFAULTS[selType.value];
    var ageMax = defT.ageMax, ageMin = defT.ageMin || 0;
    if (isNaN(cfg.x) || cfg.x < ageMin || cfg.x > ageMax) { alert('投保年龄需在 ' + ageMin + '–' + ageMax + ' 岁之间（报告投保规定）'); return; }
    if (isNaN(cfg.SA) || cfg.SA <= 0) { alert('基本保险金额需为正数'); return; }

    // 即期年金（annuity_immediate）走 plSolveImmediate / renderImmediate；养老年金仍走 plSolve / renderAnnuity
    var isImm = selType.value === 'annuity_immediate';
    var res = isCI ? plSolveCI(cfg) : (isEndow ? (isE3 ? plSolvePlainEndow(cfg) : plSolveEndow(cfg)) : (isImm ? plSolveImmediate(cfg) : plSolve(cfg)));
    var out = document.getElementById('pl_result');
    if (res.error) { out.innerHTML = '<div class="note rule"><b>无法计算</b>：' + res.error + '</div>'; return; }

    out.innerHTML = isCI ? renderCI(res, cfg) : (isEndow ? (isE3 ? renderPlainEndow(res, cfg) : renderEndow(res, cfg)) : (isImm ? renderImmediate(res, cfg) : renderAnnuity(res, cfg)));
    // 保存最近一次计算结果，供「产品利益演示」节复用
    window.__plLast = { res: res, cfg: cfg, type: selType.value };
    // 快照写入本地缓存：供「产品开发需求及评估报告」「产品上线和上市」两页下篇自动联动
    if (window.PLLink && PLLink.snapshot) { try { PLLink.save(PLLink.snapshot(selType.value, cfg, res)); } catch (e) {} }
    plRenderBenDemo();
    plRenderViews();
  });
  // 完整展开/抽样开关变化：立即重渲染结果区与利益演示区（共用 __plLast 缓存）
  document.getElementById('pl_res_full').addEventListener('change', function () {
    if (!window.__plLast) return;
    var res = window.__plLast.res, cfg = window.__plLast.cfg, type = window.__plLast.type;
    var isCI = plIsCI(type), isEndow = plIsEndow(type), isE3 = plIsE3(type), isImm = (type === 'annuity_immediate');
    document.getElementById('pl_result').innerHTML = isCI ? renderCI(res, cfg) : (isEndow ? (isE3 ? renderPlainEndow(res, cfg) : renderEndow(res, cfg)) : (isImm ? renderImmediate(res, cfg) : renderAnnuity(res, cfg)));
  });

  // 现金价值计算基础（法定口径）说明文本
  function cvBasisText(res, isEndow) {
    if (!isEndow) return '';
    var add = (res.T <= 10) ? '1.0%（保险期间10年及以下）' : '1.5%（保险期间10年以上）';
    return res.single
      ? '单口径 = 预定利率 + ' + add + '（报告§3.1 预定利息率，即保单价值准备金计算基础），保监发〔2015〕93号第九条'
      : '初期 = 预定利率 + ' + add + '，保监发〔2015〕93号第九条';
  }

  // 交费模式描述：与 cfg.h 联动（h=1 趸交；h>1 年交），供 GP 卡 sub 行复用
  function plPremMode(h) {
    return h > 1 ? (h + '年交（pt=' + h + '）') : '趸交（pt=1）';
  }
  // 每 10,000 元保费对应的基本保额（BSA / GP × 10,000），结果保留 4 位小数
  // GP 按引擎全精度参与计算（不截断小数位），仅结果展示取 4 位小数
  function plPer10000Prem(SA, GP) {
    if (!SA || !GP) return 0;
    var v = SA / GP * 10000;
    return Math.round(v * 1e4) / 1e4;
  }

  // ---- 年金版结果渲染（养老年金 / 即期年金共用明细表；触发年取自 res，不再回读 cfg 旧字段）----
  function renderAnnuityTable(res, cfg) {
    var html = '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th colspan="5">基础因子（定价基础 2.0%）</th><th colspan="4">年度给付</th><th colspan="7">现金价值</th><th colspan="3">法定准备金（FPT）</th></tr><tr>' +
      '<th>保单年度 t</th><th>年末年龄</th><th>q<sub>x+t−1</sub>‰</th><th>D<sub>x+t</sub></th><th>C<sub>x+t−1</sub></th>' +
      '<th>累计已交保费</th><th>身故金 DB</th><th>生存给付 SB</th><th>满期金</th>' +
      '<th>r<sub>t</sub></th><th>PVR₁(' + (cfg.iCV1 * 100).toFixed(2) + '%)</th><th>CV₁ 初期</th><th>PVR₂(' + (cfg.iCV2 * 100).toFixed(2) + '%)</th><th>CV₂ 终极</th><th>CV 年末</th><th>CV 年中</th>' +
      '<th>tV* 修正</th><th>tV<sup>d</sup> 保费不足</th><th>tV 法定</th></tr></thead><tbody>';
    var rowsShown = plPickRows(res.rows, plResFull());
    html += '<div class="pl-row-meta">逐保单年度明细 · ' + (plResFull() ? '完整展开' : '抽样关键年度') + '（共 ' + res.T + ' 年，本次显示 ' + rowsShown.length + ' 行）</div>';
    // 高亮锚点：关爱金触发年 / 年金起始年 / 分段切换年（opt1 第 count+1 笔）/ 满期年
    var segSw = (res.annOn && res.annOpt === 'opt1') ? res.annStart + res.annCnt : -1;
    for (var i = 0; i < rowsShown.length; i++) {
      var w = rowsShown[i];
      var hl = (res.careOn && w.t === res.careYear) || (res.annOn && (w.t === res.annStart || w.t === segSw)) || w.t === res.T;
      html += '<tr' + (hl ? ' class="pl-hl"' : '') + '><td>' + w.t + '</td><td>' + w.age + '</td><td>' + (w.qx * 1000).toFixed(4) + '</td><td>' + w.D.toFixed(8) + '</td><td>' + w.C.toFixed(8) + '</td>' +
        '<td class="pl-m">' + plNum(w.cumPrem) + '</td><td class="pl-m">' + plNum(w.DB) + '</td><td class="pl-m">' + plNum(w.SB) + '</td><td class="pl-m">' + (w.mat ? plNum(w.mat) : '—') + '</td>' +
        '<td>' + w.r.toFixed(4) + '</td><td>' + plNum(w.PVR1) + '</td><td class="pl-m">' + plNum(w.CV1) + '</td><td>' + plNum(w.PVR2) + '</td><td class="pl-m">' + plNum(w.CV2) + '</td>' +
        '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td><td class="pl-m">' + plNum(w.CVmid) + '</td>' +
        '<td class="pl-m">' + plNum(w.Vstar) + '</td><td class="pl-m">' + plNum(w.Vd) + '</td><td class="pl-m pl-strong">' + plNum(w.V) + '</td></tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  // 年金公共 KPI 四卡 + 收敛行
  function renderAnnuityHub(res, cfg) {
    var premMode = plPremMode(cfg.h);
    var html = '<div class="calc-hub calc-hub-4">' +
      '<div class="calc-card"><h3>毛保费GP</h3><div class="pl-big">¥ ' + plNum(res.GP) + '</div>' +
      '<div class="sub">每 ' + plNum(cfg.SA, 0) + ' 元基本保额 · ' + premMode + ' · 共交 ¥ ' + plNum(res.GP * cfg.h) + '</div></div>' +
      '<div class="calc-card"><h3>每 10,000 元保费对应基本保额</h3><div class="pl-big">' + plPer10000Prem(cfg.SA, res.GP).toFixed(4) + ' 元</div>' +
      '<div class="sub">公式 = BSA / GP × 10,000 = ' + plNum(cfg.SA, 0) + ' / ' + plNumFull(res.GP) + ' × 10,000</div></div>' +
      '<div class="calc-card"><h3>净保费（FPT）</h3><div class="pl-big" style="font-size:20px">P<sup>NL</sup> ' + plNum(res.P_NL) + ' ｜ α ' + plNum(res.alpha) + ' ｜ β ' + plNum(res.beta) + '</div>' +
      '<div class="sub">均衡净保费 / 首年净保费 / 续年净保费（定价基础）</div></div>' +
      '<div class="calc-card"><h3>现价基础毛保费 GP′</h3><div class="pl-big" style="font-size:20px">初期(' + (cfg.iCV1 * 100).toFixed(2) + '%) ¥ ' + plNum(res.GPp1) + ' ｜ 终极(' + (cfg.iCV2 * 100).toFixed(2) + '%) ¥ ' + plNum(res.GPp2) + '</div>' +
      '<div class="sub">CV = r(t)×max(PVR,0) 即<b>保单年度末保单最低现金价值</b>口径</div></div></div>';
    html += '<div class="pl-conv">迭代收敛：' + res.iter + ' 轮（残差 ' + res.resid.toExponential(1) + '）· 给付现值 ¥ ' + plNum(res.benPV) + ' = 净保费现值 ¥ ' + plNum(res.denP * res.GP) + ' · 保险年度 ' + res.T + ' 年（' + cfg.x + '→' + (cfg.termAge || 105) + '岁）</div>';
    return html;
  }

  function renderAnnuity(res, cfg) {
    return renderAnnuityHub(res, cfg) + renderAnnuityTable(res, cfg);
  }

  // ---- 即期年金版结果渲染：KPI 四卡 + 责任结构概览 + 公共明细表 ----
  function renderImmediate(res, cfg) {
    var html = renderAnnuityHub(res, cfg);
    // 责任结构概览（按 opt 展示差异化文案；数字与定价引擎同源）
    var careC = cfg.care || {}, annC = cfg.ann || {}, dthC = cfg.death || {};
    var careTxt, annTxt, matTxt, deathTxt;
    if (!res.careOn) careTxt = '未启用';
    else if (res.careOpt === 'opt1') careTxt = '到达 ' + careC.opt1_age + ' 周岁对应周年日（第 ' + res.careYear + ' 年度）给付 <b>¥ ' + plNum(res.careAmt) + '</b>（累计已交保费 × ' + careC.opt1_pct + '%）';
    else careTxt = '第 ' + res.careYear + ' 个保单周年日给付 <b>¥ ' + plNum(res.careAmt) + '</b>（基本保额 × ' + careC.opt2_pct + '%）';
    if (!res.annOn) annTxt = '未启用';
    else if (res.annOpt === 'opt1') {
      var a1 = res.survAmt[res.annStart] || 0, a2 = res.survAmt[Math.min(res.annStart + res.annCnt, res.T)] || 0;
      annTxt = '自第 ' + res.annStart + ' 个保单周年日（含）起每年给付：前 ' + res.annCnt + ' 笔每笔 <b>¥ ' + plNum(a1) + '</b>（' +
        (annC.opt1_basis1 === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + annC.opt1_pct1 + '%），自第 ' + (res.annCnt + 1) + ' 笔起每笔 <b>¥ ' + plNum(a2) + '</b>（' +
        (annC.opt1_basis2 === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + annC.opt1_pct2 + '%）' +
        (res.annStart === 0 ? '；<b>首笔于签单当日（第 0 个保单周年日）即领</b>' : '');
    } else annTxt = '自第 ' + res.annStart + ' 个保单周年日起每年给付 <b>¥ ' + plNum(res.annAmt) + '</b>（' +
      (annC.opt2_basis === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + annC.opt2_pct + '%）';
    if (!res.matOn) matTxt = '未启用';
    else if (!(res.matAmt > 0)) matTxt = '满期给付比例 0% —— 不给付金额，合同于满期日终止';
    else matTxt = (cfg.termAge || 105) + ' 岁满期当年给付 <b>¥ ' + plNum(res.matAmt) + '</b>（累计已交保费 × ' + (cfg.mat ? cfg.mat.pct : 0) + '%），合同终止';
    if (!res.deathOn) deathTxt = '未启用';
    else if (res.deathOpt === 'opt1') deathTxt = '第 1~' + res.deathSplit + ' 保单年度内身故：累计已交保费 × ' + res.deathBefore + '%（首年 <b>¥ ' + plNum(res.deathFirstAmt) + '</b>）；自第 ' + (res.deathSplit + 1) + ' 年度起身故：累计已交保费 × ' + res.deathAfter + '%';
    else deathTxt = 'max(累计已交保费, 现金价值 CV 年中)（首年 <b>¥ ' + plNum(res.deathFirstAmt) + '</b>）';
    html += '<div class="calc-hub" style="margin-top:14px">' +
      '<div class="calc-card"><h3>关爱保险金</h3><div style="font-size:13.5px;line-height:1.9">' + careTxt + '</div></div>' +
      '<div class="calc-card"><h3>生存年金</h3><div style="font-size:13.5px;line-height:1.9">' + annTxt + '</div></div>' +
      '<div class="calc-card"><h3>满期保险金</h3><div style="font-size:13.5px;line-height:1.9">' + matTxt + '</div></div>' +
      '<div class="calc-card"><h3>身故保险金</h3><div style="font-size:13.5px;line-height:1.9">' + deathTxt + '</div></div></div>';
    html += renderAnnuityTable(res, cfg);
    return html;
  }

  // ---- 两全（分红型）结果渲染 ----
  function renderEndow(res, cfg) {
    var sgl = !!res.single;                       // 中短期两全：现价单口径、无180日规则
    var dbName = sgl ? '身故保险金' : '身故或全残金';
    var premMode = plPremMode(cfg.h);
    var html = '<div class="calc-hub calc-hub-4">' +
      '<div class="calc-card"><h3>毛保费GP</h3><div class="pl-big">¥ ' + plNum(res.GP) + '</div>' +
      '<div class="sub">每 ' + plNum(cfg.SA, 0) + ' 元基本保额 · ' + premMode + ' · 共交 ¥ ' + plNum(res.GP * cfg.h) + '</div></div>' +
      '<div class="calc-card"><h3>每 10,000 元保费对应基本保额</h3><div class="pl-big">' + plPer10000Prem(cfg.SA, res.GP).toFixed(4) + ' 元</div>' +
      '<div class="sub">公式 = BSA / GP × 10,000 = ' + plNum(cfg.SA, 0) + ' / ' + plNumFull(res.GP) + ' × 10,000</div></div>' +
      '<div class="calc-card"><h3>净保费（修正法）</h3><div class="pl-big" style="font-size:20px">P<sup>NL</sup> ' + plNum(res.P_NL) + ' ｜ α ' + plNum(res.alpha) + ' ｜ β ' + plNum(res.beta) + '</div>' +
      '<div class="sub">α = Max(DB₁·C/D, P<sup>NL</sup>−3.5%×DB₁)（评估基础 ' + (res.iEval * 100).toFixed(2) + '%）</div></div>' +
      '<div class="calc-card"><h3>现价基础毛保费 GP′</h3><div class="pl-big" style="font-size:20px">' + (sgl
        ? '单口径(' + (cfg.iCV1 * 100).toFixed(2) + '%) ¥ ' + plNum(res.GPp1)
        : '初期(' + (cfg.iCV1 * 100).toFixed(2) + '%) ¥ ' + plNum(res.GPp1) + ' ｜ 终极(' + (cfg.iCV2 * 100).toFixed(2) + '%) ¥ ' + plNum(res.GPp2)) + '</div>' +
      '<div class="sub">' + cvBasisText(res, true) + '；GP′ 分母用 e′ 费用率，现价净保费 = GP′×(1−e<sub>t</sub>)（报告F040/F042）。CV = r(t)×max(PVR,0) 即<b>保单年度末保单最低现金价值</b>口径</div></div></div>';
    if (res.divSum) {
      var iDivAccPct = (res.divSum.iDivAcc * 100).toFixed(2);
      html += '<div class="calc-hub">' +
        '<div class="calc-card"><h3>红利利益演示（利差红）</h3><div class="pl-big" style="font-size:20px">首年红利 ¥ ' + plNum(res.divSum.firstDiv) + ' → 满期当年 ¥ ' + plNum(res.divSum.lastDiv) + '</div>' +
        '<div class="sub">演示利率 ' + (res.divSum.iStar * 100).toFixed(2) + '% − 评估利率 ' + (res.iEval * 100).toFixed(2) + '% = 利差 ' + (res.divSum.dI * 100).toFixed(2) + '%，可分配比例 ' + (res.divSum.b * 100).toFixed(0) + '%</div></div>' +
        '<div class="calc-card"><h3>累计现金红利（累计生息）</h3><div class="pl-big" style="font-size:20px">满期当年 ¥ ' + plNum(res.divSum.cumCashDiv) + '</div>' +
        '<div class="sub">累计生息利率 = 定价利率 ' + iDivAccPct + '%（现金红利当年不领取，按 ' + iDivAccPct + '% 累计生息）</div></div>' +
        '<div class="calc-card"><h3>演示口径</h3><div style="font-size:14px;line-height:1.9">保证利益：满期金+' + dbName + '（不依赖红利）<br>红利利益：现金红利（利差损益演示，非保证；按 ' + iDivAccPct + '% 累计生息）</div>' +
        '<div class="sub">报告§4.1：红利只来源于利差损益，两档演示利率 3.50% / 1.75%</div></div></div>';
    }
    html += '<div class="pl-conv">迭代收敛：' + res.iter + ' 轮（残差 ' + res.resid.toExponential(1) + '）· 给付现值 ¥ ' + plNum(res.benPV) + ' = 净保费现值 ¥ ' + plNum(res.denP * res.GP) + ' · 保险年度 ' + res.T + ' 年（' + cfg.x + '→' + (cfg.x + res.T) + '岁）</div>';

    // 年度明细表（单口径：现金价值 4 列；双口径：7 列）；分红型末尾追加红利演示 2 列
    var cvHead = sgl
      ? '<th>r<sub>t</sub></th><th>PVR(' + (cfg.iCV1 * 100).toFixed(2) + '%)</th><th>CV 年末</th><th>CV 年中</th>'
      : '<th>r<sub>t</sub></th><th>PVR₁(' + (cfg.iCV1 * 100).toFixed(2) + '%)</th><th>CV₁ 初期</th><th>PVR₂(' + (cfg.iCV2 * 100).toFixed(2) + '%)</th><th>CV₂ 终极</th><th>CV 年末</th><th>CV 年中</th>';
    var divHead = res.divSum
      ? '<th colspan="2">红利利益演示（现金红利，按 ' + (res.divSum.iDivAcc * 100).toFixed(2) + '% 累计生息）</th>'
      : '';
    var divSubHead = res.divSum
      ? '<th>当年现金红利</th><th>累计现金红利</th>'
      : '';
    var divColCnt = res.divSum ? 2 : 0;
    html += '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th colspan="6">基础因子（评估基础 ' + (res.iEval * 100).toFixed(2) + '%）</th><th colspan="3">年度给付</th><th colspan="' + (sgl ? 4 : 7) + '">现金价值' + (sgl ? '（单口径）' : '') + '</th><th colspan="3">法定准备金（修正法）</th>' + divHead + '</tr><tr>' +
      '<th>保单年度 t</th><th>年末年龄</th><th>q<sub>x+t−1</sub>‰</th><th>D<sub>x+t</sub></th><th>C<sub>x+t−1</sub></th><th>系数R</th>' +
      '<th>累计已交保费</th><th>' + dbName + ' DB</th><th>满期金</th>' + cvHead +
      '<th>tV′ 修正</th><th>tV<sup>d</sup> 保费不足</th><th>tV 法定</th>' + divSubHead + '</tr></thead><tbody>';
    html += '<div class="pl-row-meta">逐保单年度明细 · ' + (plResFull() ? '完整展开' : '抽样关键年度') + '（共 ' + res.T + ' 年，本次显示 <span id="pl_res_count"></span> 行）</div>';
    var rowsShownE = plPickRows(res.rows, plResFull());
    if (typeof document !== 'undefined') { var counter = document.getElementById('pl_res_count'); if (counter) counter.textContent = rowsShownE.length; }
    for (var i = 0; i < rowsShownE.length; i++) {
      var w = rowsShownE[i];
      var hl = w.t === 1 || w.t === res.T;
      var cvCells = sgl
        ? '<td>' + w.r.toFixed(4) + '</td><td>' + plNum(w.PVR1) + '</td><td class="pl-m pl-strong">' + plNum(w.CV) + '</td><td class="pl-m">' + plNum(w.CVmid) + '</td>'
        : '<td>' + w.r.toFixed(4) + '</td><td>' + plNum(w.PVR1) + '</td><td class="pl-m">' + plNum(w.CV1) + '</td><td>' + plNum(w.PVR2) + '</td><td class="pl-m">' + plNum(w.CV2) + '</td>' +
          '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td><td class="pl-m">' + plNum(w.CVmid) + '</td>';
      var divCells = '';
      if (res.divRows) {
        var dr = res.divRows[w.t - 1] || { div: 0, cumCash: 0 };
        divCells = '<td class="pl-m">' + plNum(dr.div) + '</td><td class="pl-m pl-strong">' + plNum(dr.cumCash) + '</td>';
      }
      html += '<tr' + (hl ? ' class="pl-hl"' : '') + '><td>' + w.t + '</td><td>' + w.age + '</td><td>' + (w.qx * 1000).toFixed(4) + '</td><td>' + w.D.toFixed(8) + '</td><td>' + w.C.toFixed(8) + '</td>' +
        '<td>' + (w.R === 1 ? '—' : (w.R * 100).toFixed(0) + '%') + '</td>' +
        '<td class="pl-m">' + plNum(w.cumPrem) + '</td><td class="pl-m">' + plNum(w.DB) + '</td><td class="pl-m">' + (w.mat ? plNum(w.mat) : '—') + '</td>' + cvCells +
        '<td class="pl-m">' + plNum(w.Vprime) + '</td><td class="pl-m">' + plNum(w.Vd) + '</td><td class="pl-m pl-strong">' + plNum(w.V) + '</td>' + divCells + '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  // ---- 两全（普通型）结果渲染 ----
  // 适配 plSolvePlainEndow 返回字段：GP / GPcv / P_NL / alpha / beta / R / rows(PVR/CV/…)
  function renderPlainEndow(res, cfg) {
    var premMode = plPremMode(cfg.h);
    var html = '<div class="calc-hub calc-hub-4">' +
      '<div class="calc-card"><h3>毛保费GP</h3><div class="pl-big">¥ ' + plNum(res.GP) + '</div>' +
      '<div class="sub">每 ' + plNum(cfg.SA, 0) + ' 元基本保额 · ' + premMode + ' · 共交 ¥ ' + plNum(res.GP * cfg.h) + '</div></div>' +
      '<div class="calc-card"><h3>每 10,000 元保费对应基本保额</h3><div class="pl-big">' + plPer10000Prem(cfg.SA, res.GP).toFixed(4) + ' 元</div>' +
      '<div class="sub">公式 = BSA / GP × 10,000 = ' + plNum(cfg.SA, 0) + ' / ' + plNumFull(res.GP) + ' × 10,000</div></div>' +
      '<div class="calc-card"><h3>净保费（FPT）</h3><div class="pl-big" style="font-size:20px">P<sup>NL</sup> ' + plNum(res.P_NL) + ' ｜ α ' + plNum(res.alpha) + (cfg.h > 1 ? ' ｜ β ' + plNum(res.beta) : '') + '</div>' +
      '<div class="sub">α = DB₁·C<sup>E</sup><sub>x</sub>/D<sup>E</sup><sub>x</sub>（首年自然净保费，评估基础 ' + (res.iEval * 100).toFixed(2) + '%，发生率×100%）</div></div>' +
      '<div class="calc-card"><h3>现价基础毛保费 GP<sup>CV</sup></h3><div class="pl-big" style="font-size:20px">¥ ' + plNum(res.GPcv) + '（' + (res.iCV * 100).toFixed(2) + '%）</div>' +
      '<div class="sub">单口径 = 预定利率 + 2%（银保监办发〔2020〕7号第九条，传统型）；现价净保费 = GP<sup>CV</sup>×(1−e′<sub>t</sub>)。CV = r(t)×max(PVR,0) 即<b>保单年度末保单最低现金价值</b>口径</div></div></div>';
    html += '<div class="pl-conv">迭代收敛：' + res.iter + ' 轮（残差 ' + res.resid.toExponential(1) + '）· 给付现值 ¥ ' + plNum(res.benPV) + ' = 毛保费现值 ¥ ' + plNum(res.denP * res.GP) + ' · 保险期间 ' + res.T + ' 年（' + cfg.x + '→' + (cfg.x + res.T) + '岁）</div>';

    html += '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th colspan="5">基础因子</th><th colspan="3">年度给付</th><th colspan="7">现金价值（单口径 ' + (res.iCV * 100).toFixed(2) + '%）</th><th colspan="4">法定准备金（FPT，评估 ' + (res.iEval * 100).toFixed(2) + '%）</th></tr><tr>' +
      '<th>保单年度 t</th><th>年末年龄</th><th>q<sub>x+t−1</sub>‰（定价×70%）</th><th>q<sub>x+t−1</sub>‰（评估×100%）</th><th>系数R</th>' +
      '<th>累计已交保费</th><th>身故保险金 DB</th><th>满期金</th>' +
      '<th>r<sub>t</sub></th><th>D<sub>x+t</sub><sup>CV</sup></th><th>C<sup>CV</sup><sub>x+t−1</sub></th><th>净保费 NP<sub>t</sub><sup>CV</sup></th><th>PVR<sub>t</sub></th><th>CV 年末</th><th>CV 年中</th>' +
      '<th>D<sub>x+t</sub><sup>E</sup></th><th>tV′ 修正</th><th>tV<sup>d</sup> 保费不足</th><th>tV 法定</th></tr></thead><tbody>';
    var rowsShownE3 = plPickRows(res.rows, plResFull());
    html += '<div class="pl-row-meta">逐保单年度明细 · ' + (plResFull() ? '完整展开' : '抽样关键年度') + '（共 ' + res.T + ' 年，本次显示 ' + rowsShownE3.length + ' 行）</div>';
    for (var i = 0; i < rowsShownE3.length; i++) {
      var w = rowsShownE3[i];
      var hl = w.t === 1 || w.t === res.T;
      html += '<tr' + (hl ? ' class="pl-hl"' : '') + '><td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td>' + (w.q * 1000).toFixed(4) + '</td><td>' + (w.qe * 1000).toFixed(4) + '</td><td>' + (w.R === 1 ? '—' : (w.R * 100).toFixed(0) + '%') + '</td>' +
        '<td class="pl-m">' + plNum(res.GP * Math.min(w.t, cfg.h)) + '</td><td class="pl-m">' + plNum(w.DB) + '</td><td class="pl-m">' + (w.mat ? plNum(w.mat) : '—') + '</td>' +
        '<td>' + w.r.toFixed(4) + '</td><td>' + w.Dv.toFixed(8) + '</td><td>' + w.Cv.toFixed(8) + '</td>' +
        '<td class="pl-m">' + (w.NPcv === null ? '—' : plNum(w.NPcv)) + '</td>' +
        '<td>' + plNum(w.PVR) + '</td><td class="pl-m pl-strong">' + plNum(w.CV) + '</td><td class="pl-m">' + plNum((w.t === 1 ? 0.5 * ((w.CV || 0) + (w.NPcv || 0)) : 0.5 * ((w.CV || 0) + ((res.rows[w.t - 2] || {}).CV || 0) + (w.NPcv || 0)))) + '</td>' +
        '<td>' + w.De.toFixed(8) + '</td>' +
        '<td class="pl-m">' + plNum(w.Vprime) + '</td><td class="pl-m">' + plNum(w.Vd) + '</td><td class="pl-m pl-strong">' + plNum(w.V) + '</td></tr>';
    }
    html += '</tbody></table></div>';
    html += '<div class="sub" style="margin-top:6px">注：q 列展示定价（发生率×70%）与评估（发生率×100%）两套年度死亡率；q<sub>x+t−1</sub> 取保单年度<b>初</b>年龄（= 投保年龄 x+t−1），「到达年龄」列示年度<b>末</b>年龄（= x+t），两列相差 1 岁，勿混淆。D<sup>CV</sup>/C<sup>CV</sup> 按现价利率 ' + (res.iCV * 100).toFixed(2) + '% 递推，净保费 NP<sub>t</sub><sup>CV</sup> = GP<sup>CV</sup>×(1−e′<sub>t</sub>)（e′ 现价费用率趸交 10%），PVR 为保单价值准备金（t=bt 时为 0），CV = r<sub>t</sub>×max(PVR,0)；D<sup>E</sup> 按评估利率 ' + (res.iEval * 100).toFixed(2) + '%、发生率×100% 递推，用于 FPT 修正准备金。三条链的换算函数数值不同、不可混用。</div>';
    html += '<div class="note rule" style="margin-top:10px">' +
      '<b>180 日规则说明</b>：首保单年度身故金 = 0.5×Max(累计保费×R, 现价) + 0.5×GP（报告§2.3 定价口径，已计入毛保费方程）；产品说明书【利益演示】表按<b>全额给付</b>列示（首年 80,000 = 50,000×160%），两者口径不同，本工具定价结果忠实报告精算公式。' +
      '<br><b>发生率口径说明</b>：生命表2010-2013 非养老类业务二表 ×70%（定价/现价）与 ×100%（评估）。当前表版本：<b>' + ((cfg.tblVer === '2010') ? '生命表2010-2013 原表（保监发〔2016〕107号，' + (cfg.gender === 'f' ? '女' : '男') + ' → CL' + (cfg.gender === 'f' ? '4' : '3') + '）' : '生命表2025 ' + cfg.table.toUpperCase() + ' × 系数近似') + '</b>，表号随版本自动映射。</div>';
    return html;
  }

  // ---- 疾病保险利益演示（产品说明书口径，仅用于「五、产品利益演示」节）----
  // 说明书「【利益演示】」表列：各年度保险费、累计保险费、重大疾病保险金、身故保险金、退保金（年末现金价值）
  // 抽样与完整展开跟随「演示范围与开关」的 pl_ben_full 复选框（与年金/两全演示一致）
  function illCI(res, cfg) {
    var rows = plBenDemoRows(res, cfg, 'ci');
    var html = '<h3 style="margin:12px 0 8px">利益演示 · 逐保单年度（重大疾病保险）</h3>' +
      '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th>保单年度末</th><th>年末年龄</th><th>当年度保险费</th><th>累计保险费</th>' +
      '<th>重大疾病保险金</th><th>身故保险金</th><th>退保金（年末现金价值）</th>' +
      '</tr></thead><tbody>';
    var ddPct = cfg.dd.pct / 100;
    var dbPct = cfg.db.pct / 100;
    var SA = cfg.SA;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], w = r.w;
      var prem = r.prem, cum = r.cum;
      // 利益演示口径：重大疾病保险金 / 身故保险金 均按全额给付，不考虑等待期折算
      var demoDD = cfg.dd.on ? (w.t === 1 ? SA * ddPct : w.DD) : '—';
      var demoDB = cfg.db.on ? (w.t === 1 ? SA * dbPct : w.DB) : '—';
      html += '<tr' + (w.t === 1 || w.t === res.T ? ' class="pl-hl"' : '') + '>' +
        '<td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td class="pl-m">' + (prem ? plNum(prem) : '—') + '</td><td class="pl-m">' + plNum(cum) + '</td>' +
        '<td class="pl-m">' + demoDD + '</td>' +
        '<td class="pl-m">' + demoDB + '</td>' +
        '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    html += '<div class="pl-row-meta">利益演示 · ' + (plBenFull() ? '完整展开' : '抽样关键年度') + '（共 ' + res.T + ' 年，本次显示 ' + rows.length + ' 行）</div>';
    html += '<div class="note rule" style="margin-top:10px">' +
      '<b>演示说明</b>：本表与产品说明书【利益演示】口径一致——退保金为保单年度末现金价值；重大疾病保险金与身故保险金为<b>当年度发生保险事故时的给付金额</b>（发生即给付、合同终止），两者不可兼得（同一事故同时符合时仅承担重大疾病保险金）。' +
      '条款另约定<b>因意外伤害事故导致重大疾病按基本保险金额 150%</b> 给付，本表演示按非意外情形（100%）列示。' +
      '<br>本产品<b>无满期保险金</b>：保险期间届满合同终止，故末年现金价值为 0（与现价表一致）。数值为演示值，实际以保险合同为准。</div>';
    return html;
  }

  // ---- 疾病保险（重大疾病保险）结果渲染 ----
  function renderCI(res, cfg) {
    var premMode = plPremMode(cfg.h);
    var html = '<div class="calc-hub calc-hub-4">' +
      '<div class="calc-card"><h3>毛保费GP</h3><div class="pl-big">¥ ' + plNum(res.GP) + '</div>' +
      '<div class="sub">每 ' + plNum(cfg.SA, 0) + ' 元基本保额 · ' + premMode + ' · 共交 ¥ ' + plNum(res.GP * cfg.h) + '</div></div>' +
      '<div class="calc-card"><h3>每 10,000 元保费对应基本保额</h3><div class="pl-big">' + plPer10000Prem(cfg.SA, res.GP).toFixed(4) + ' 元</div>' +
      '<div class="sub">公式 = BSA / GP × 10,000 = ' + plNum(cfg.SA, 0) + ' / ' + plNumFull(res.GP) + ' × 10,000</div></div>' +
      '<div class="calc-card"><h3>净保费（FPT）</h3><div class="pl-big" style="font-size:20px">P<sup>NL</sup> ' + plNum(res.P_NL) + ' ｜ α ' + plNum(res.alpha) + ' ｜ β ' + plNum(res.beta) + '</div>' +
      '<div class="sub">α = (DD₁·C<sup>DD</sup><sub>x</sub> + DB₁·C<sub>x</sub>)/D<sub>x</sub>（首年自然净保费，评估基础 ' + (res.iEval * 100).toFixed(2) + '%）</div></div>' +
      '<div class="calc-card"><h3>现价基础毛保费 GP<sup>CV</sup></h3><div class="pl-big" style="font-size:20px">¥ ' + plNum(res.GPcv) + '（' + ((cfg.iCV || 0.04) * 100).toFixed(2) + '%）</div>' +
      '<div class="sub">净保费法，现价基础利率 = 预定利率 + 2%（7号文）；现价净保费 = GP<sup>CV</sup>×(1−e′<sub>t</sub>)</div></div></div>';
    html += '<div class="pl-conv">双减因模型（重疾 q<sup>DD</sup> = CI4(2020)×' + (cfg.ciFactor * 100).toFixed(0) + '% ＋ 身故 q = ' + cfg.table.toUpperCase() + '(' + ((cfg.tblVer === '2010') ? '2010' : '2025') + ')×' + (cfg.factor * 100).toFixed(0) + '% ；因重疾身故占比 k = K2×' + (cfg.kFactor * 100).toFixed(0) + '%）· 给付现值 ¥ ' + plNum(res.benPV) + ' = 净保费现值 ¥ ' + plNum(res.denP * res.GP) + ' · 保险期间 ' + res.T + ' 年（' + cfg.x + '→' + cfg.termAge + '岁）</div>';

    // 逐保单年度明细（双减因 · 中间变量按计算链分组：保费 / 现金价值 / 法定准备金）
    html += '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th colspan="5">发生率假设（共用）</th>' +
      '<th colspan="6">保费计算链（定价基础 ' + (cfg.i * 100).toFixed(2) + '%，报告§2）</th>' +
      '<th colspan="8">现金价值计算链（现价基础 ' + ((cfg.iCV || 0.04) * 100).toFixed(2) + '%，报告§3）</th>' +
      '<th colspan="6">法定准备金链（评估基础 ' + (res.iEval * 100).toFixed(2) + '%，报告§4 FPT）</th></tr><tr>' +
      '<th>保单年度 t</th><th>年末年龄</th><th>q<sub>x+t−1</sub>‰</th><th>q<sup>DD</sup>‰</th><th>k<sub>x+t−1</sub></th>' +
      '<th>D<sub>x+t</sub><sup>P</sup></th><th>C<sup>DD,P</sup><sub>x+t−1</sub></th><th>C<sup>P</sup><sub>x+t−1</sub></th><th>费用率 e<sub>t</sub></th><th>重大疾病保险金 DD</th><th>身故保险金 DB</th>' +
      '<th>D<sub>x+t</sub><sup>CV</sup></th><th>C<sup>DD,CV</sup><sub>x+t−1</sub></th><th>C<sup>CV</sup><sub>x+t−1</sub></th><th>费用率 e′<sub>t</sub></th><th>净保费 NP<sub>t</sub><sup>CV</sup></th><th>PVR<sub>t</sub></th><th>r<sub>t</sub></th><th>CV 年末</th>' +
      '<th>D<sub>x+t</sub><sup>E</sup></th><th>C<sup>DD,E</sup><sub>x+t−1</sub></th><th>C<sup>E</sup><sub>x+t−1</sub></th><th>tV′ 修正</th><th>tV<sup>d</sup> 保费不足</th><th>tV 法定</th></tr></thead><tbody>';
    var rowsShownCI = plPickRows(res.rows, plResFull());
    html += '<div class="pl-row-meta">逐保单年度明细 · ' + (plResFull() ? '完整展开' : '抽样关键年度') + '（共 ' + res.T + ' 年，本次显示 ' + rowsShownCI.length + ' 行）</div>';
    for (var i = 0; i < rowsShownCI.length; i++) {
      var w = rowsShownCI[i];
      html += '<tr' + (w.t === 1 || w.t === res.T ? ' class="pl-hl"' : '') + '>' +
        '<td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td>' + (w.q * 1000).toFixed(4) + '</td><td>' + (w.qd * 1000).toFixed(4) + '</td><td>' + (w.k * 100).toFixed(2) + '%</td>' +
        '<td>' + w.Dp.toFixed(8) + '</td><td>' + w.CDp.toFixed(8) + '</td><td>' + w.Cp.toFixed(8) + '</td>' +
        '<td>' + (w.eP === null ? '—' : (w.eP * 100).toFixed(2) + '%') + '</td>' +
        '<td class="pl-m">' + (cfg.dd.on ? plNum(w.DD) : '—') + '</td><td class="pl-m">' + (cfg.db.on ? plNum(w.DB) : '—') + '</td>' +
        '<td>' + w.Dv.toFixed(8) + '</td><td>' + w.CDv.toFixed(8) + '</td><td>' + w.Cv.toFixed(8) + '</td>' +
        '<td>' + (w.eCV === null ? '—' : (w.eCV * 100).toFixed(2) + '%') + '</td>' +
        '<td class="pl-m">' + (w.NPcv === null ? '—' : plNum(w.NPcv)) + '</td>' +
        '<td>' + plNum(w.PVR) + '</td><td>' + w.r.toFixed(4) + '</td><td class="pl-m pl-strong">' + plNum(w.CV) + '</td>' +
        '<td>' + w.De.toFixed(8) + '</td><td>' + w.CDe.toFixed(8) + '</td><td>' + w.Ce.toFixed(8) + '</td>' +
        '<td class="pl-m">' + plNum(w.Vprime) + '</td><td class="pl-m">' + plNum(w.Vd) + '</td><td class="pl-m pl-strong">' + plNum(w.V) + '</td></tr>';
    }
    html += '</tbody></table></div>';
    html += '<div class="sub" style="margin-top:6px">注（中间变量归属）：<b>保费计算链</b>——换算函数 D<sup>P</sup>/C<sup>DD,P</sup>/C<sup>P</sup> 按定价利率 ' + (cfg.i * 100).toFixed(2) + '% 递推，与逐年费用率 e<sub>t</sub>、年度给付 DD/DB 一起用于毛保费方程 GP = Σ(DD·C<sup>DD,P</sup>+DB·C<sup>P</sup>) ÷ Σ(1−e<sub>t</sub>)·D<sup>P</sup>；<b>现金价值计算链</b>——D<sup>CV</sup>/C<sup>DD,CV</sup>/C<sup>CV</sup> 按现价利率 ' + ((cfg.iCV || 0.04) * 100).toFixed(2) + '% 递推（= 预定利率 + 2%，7号文），净保费 NP<sub>t</sub><sup>CV</sup> = GP<sup>CV</sup>×(1−e′<sub>t</sub>)，PVR<sub>t</sub> 为保单价值准备金，CV = r<sub>t</sub>×max(PVR,0)；<b>法定准备金链</b>——D<sup>E</sup>/C<sup>DD,E</sup>/C<sup>E</sup> 按评估利率 ' + (res.iEval * 100).toFixed(2) + '% 递推，用于 FPT 修正准备金 tV′、保费不足准备金 tV<sup>d</sup>。三条链的换算函数数值不同、不可混用。D<sub>x+t</sub> = v·D<sub>x+t−1</sub>·(1−(1−k)·q−q<sup>DD</sup>)，C = v<sup>1/2</sup>·D·(1−k)·q，C<sup>DD</sup> = v<sup>1/2</sup>·D·q<sup>DD</sup>。</div>';

    return html;
  }

  // ================ 产品利益演示（统一节） ================
  // 不再调用任何引擎，仅从 plResult 既有数据组装"产品说明书【利益演示】"口径的表格
  // 抽样：默认每 5 年一行 + 第 1 年 + 满期前 1 年 + 满期当年；勾选"完整展开"则每保单年度一行
  // 共用锚点工具：第 1 年 + 每 5 年 + 满期当年（边界首尾去重）
  function plRowAnchors(T, full, step) {
    step = step || 5;
    var a = [];
    if (full) { for (var i = 1; i <= T; i++) a.push(i); }
    else { a.push(1); for (var i = step; i <= T; i += step) a.push(i); if (a[a.length - 1] < T) a.push(T); }
    return a;
  }
  // 完整行 vs 抽样行（用于定价结果/利益演示的明细表）
  function plPickRows(rows, full) {
    if (full) return rows;
    var T = rows.length;
    var anchors = plRowAnchors(T, false);
    var set = {}; for (var i = 0; i < anchors.length; i++) set[anchors[i]] = 1;
    var out = [];
    for (var i = 0; i < rows.length; i++) if (set[rows[i].t]) out.push(rows[i]);
    return out;
  }
  // 当前用户选择：完整展开 vs 抽样（共享 pl_res_full / pl_ben_full 两个开关）
  function plResFull() { var e = document.getElementById('pl_res_full'); return !!(e && e.checked); }
  function plBenFull() { var e = document.getElementById('pl_ben_full'); return !!(e && e.checked); }
  // ---- 客户视角收益三项：总收益率 / 年化单利 / 年化复利（IRR）----
  // 站在客户角度、以「持有至第 t 保单年度末」为观察窗口：
  //   支出：第 k 期保费于保单周年日 k−1 交付（k = 1..m，m = min(t, h)）→ 累计已交 = GP × m
  //   收入：① 观察期内各保单周年日已领取的生存类给付（关爱金 / 生存年金；即期年金第 0 周年日首笔）
  //         ② 第 t 年末退出金 = 保单年度末现金价值；若该年末同时存在满期金（t = T 且已启用）则取满期金
  //            ——退保金与满期金二者取一，不重复计
  //   总收益率 = Σ收入 ÷ 累计已交保费 − 1
  //   年化单利 = (Σ收入 − 累计已交保费) ÷ (GP × 保费存续时间之和)
  //             ——分子取「净收益」而非收入总额：本金返还部分不产生利息，分母已是保费×时间的积数
  //             存续时间之和 = Σ_{k=0..m−1}(t − k) = m × (t − (m−1)/2)
  //             （例：3 年缴、第 5 保单年度末 → 第1期存续5年 + 第2期4年 + 第3期3年 = 12）
  //   年化复利 = IRR：现金流 fl[k]（保费为负、给付为正）令 NPV = 0 的解
  // 三项收益率的客户视角口径说明（演示表共用文案；CI 表不展示这三项）
  var PL_RET_NOTE = '<br><b>收益率口径</b>：站在客户角度——年度保险费为支出，各保单年度已领取的生存类给付（关爱金 / 生存年金）与年末退出金为收入项；' +
    '年末退出金取保单年度末现金价值，第 T 年末同时存在满期金时取满期金（退保金与满期金二者取一、不重复计）；三项均按<b>保证利益</b>计算，不含红利、不含身故给付。' +
    '<b>总收益率</b> = Σ收入 ÷ 累计已交保费 − 1；<b>年化单利</b> = (Σ收入 − 累计已交保费) ÷ (年保费 × 保费存续时间之和)（分子为净收益，存续时间之和例：3 年缴到第 5 保单年度末 = 5+4+3 = 12）；<b>年化复利</b> = 现金流的内部收益率 IRR（令 NPV = 0）。';
  function plExitVal(res, cfg, type, t) {
    var w = res.rows[t - 1] || {};
    if (t === res.T && cfg.mat && cfg.mat.on && res.matAmt > 0) return res.matAmt; // 退保金与满期金同时存在 → 取满期金
    return w.CV || 0;
  }
  function plBenInflowAt(res, cfg, type, j) {
    if (j <= 0) { // 即期年金签单当日（第 0 个保单周年日）首笔生存年金
      return (j === 0 && type === 'annuity_immediate' && res.annOn && res.annStart === 0) ? (res.survAmt[0] || 0) : 0;
    }
    var w = res.rows[j - 1];
    return (w && w.SB) ? w.SB : 0; // 生存类给付合计（关爱金 + 生存年金）；两全类无此项 → 0
  }
  function plRetRow(res, cfg, type, t) {
    var GP = res.GP, m = Math.min(t, cfg.h);
    var cum = GP * m;                                   // 截至第 t 年末累计已交保费
    var start = (type === 'annuity_immediate') ? 0 : 1; // 即期年金自第 0 周年日起有给付
    var fl = [];
    for (var k = 0; k <= t; k++) fl.push(0);
    for (var k2 = 0; k2 < m; k2++) fl[k2] -= GP;        // 第 k+1 期保费于时刻 k 交付
    var inSum = 0;
    for (var j = start; j <= t; j++) {
      var inf = plBenInflowAt(res, cfg, type, j);
      if (inf) { inSum += inf; fl[j] += inf; }
    }
    var exitv = plExitVal(res, cfg, type, t);
    inSum += exitv; fl[t] += exitv;
    var W = m * (t - (m - 1) / 2);                      // 保费存续时间之和
    return {
      t: t, cum: cum, inSum: inSum, exitVal: exitv, W: W,
      ret: cum > 0 ? inSum / cum - 1 : null,
      sl: (GP > 0 && W > 0) ? (inSum - cum) / (GP * W) : null,   // 分子取净收益（Σ收入 − 累计已交）
      irr: vlIrr(fl)
    };
  }
  function plBenDemoRows(res, cfg, type) {
    var T = res.T, h = cfg.h, GP = res.GP;
    var full = plBenFull();
    var anchors = plRowAnchors(T, full);
    var rows = [];
    for (var k = 0; k < anchors.length; k++) {
      var t = anchors[k]; if (t < 1 || t > T) continue;
      var w = res.rows[t - 1]; if (!w) continue;
      var m = plRetRow(res, cfg, type, t);
      rows.push({ t: t, w: w, prem: (t <= h) ? GP : 0, cum: m.cum, inSum: m.inSum, W: m.W, ret: m.ret, sl: m.sl, irr: m.irr });
    }
    return rows;
  }

  // 年金保险利益演示（养老年金 / 即期年金共用引擎，按 type 与责任 opt 差异化）
  function plRenderBenAnnuity(res, cfg, type) {
    var isImm = (type === 'annuity_immediate');
    var rows = plBenDemoRows(res, cfg, type);
    var careC = cfg.care || {}, annC = cfg.ann || {};
    var html = '<h3 style="margin:12px 0 8px">利益演示 · 逐保单年度（年金保险' + (isImm ? ' · 即期年金' : '') + '）</h3>' +
      '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th>保单年度末</th><th>年末年龄</th><th>当年度保险费</th><th>累计保险费</th>' +
      '<th>关爱保险金</th><th>生存年金</th><th>满期保险金</th><th>身故保险金</th><th>退保金（年末CV）</th>' +
      '<th>总收益率</th><th>年化单利</th><th>年化复利</th>' +
      '</tr></thead><tbody>';
    // 即期年金第 0 行：首笔生存年金于签单当日（第 0 个保单周年日）即领，无折现无生存条件
    if (isImm && res.annOn && res.annStart === 0 && (res.survAmt[0] || 0) > 0) {
      html += '<tr class="pl-hl"><td>0<span style="font-size:11px">（签单当日）</span></td><td>' + cfg.x + '</td>' +
        '<td class="pl-m">' + plNum(res.GP) + '</td><td class="pl-m">' + plNum(res.GP) + '</td>' +
        '<td class="pl-m">—</td>' +
        '<td class="pl-m pl-strong">' + plNum(res.survAmt[0]) + '</td>' +
        '<td class="pl-m">—</td><td class="pl-m">—</td>' +
        '<td class="pl-m">' + plNum(0) + '</td>' +
        '<td class="pl-m">—</td><td class="pl-m">—</td><td class="pl-m">—</td></tr>';
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], w = r.w;
      var care = (res.careOn && res.careYear !== null && w.t === res.careYear) ? res.careAmt : null;
      var ann = (res.annOn && res.annStart !== null && w.t >= res.annStart) ? (res.survAmt[w.t] || 0) : null;
      var mat = (res.matOn && res.matAmt > 0 && w.t === res.T) ? res.matAmt : null;
      var death = res.deathOn ? w.DB : null;
      var hl = (res.careYear !== null && w.t === res.careYear) || (res.annStart !== null && w.t === res.annStart) || w.t === res.T;
      html += '<tr' + (hl ? ' class="pl-hl"' : '') + '>' +
        '<td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td class="pl-m">' + (r.prem ? plNum(r.prem) : '—') + '</td><td class="pl-m">' + plNum(r.cum) + '</td>' +
        '<td class="pl-m">' + (care !== null ? plNum(care) : '—') + '</td>' +
        '<td class="pl-m">' + (ann !== null && ann > 0 ? plNum(ann) : '—') + '</td>' +
        '<td class="pl-m">' + (mat !== null ? plNum(mat) : '—') + '</td>' +
        '<td class="pl-m">' + (death !== null ? plNum(death) : '—') + '</td>' +
        '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td>' +
        '<td class="pl-m">' + (r.ret !== null ? (r.ret * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.sl !== null ? (r.sl * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.irr !== null ? (r.irr * 100).toFixed(2) + '%' : '—') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    // 演示口径脚注：按各责任实际 opt 差异化描述
    var careTxt = !res.careOn ? '关爱金：本方案未启用'
      : (res.careOpt === 'opt1'
        ? '关爱金于被保险人到达 ' + careC.opt1_age + ' 周岁对应的保单周年日（第 ' + res.careYear + ' 个保单年度）给付，金额 = 累计已交保费 × ' + careC.opt1_pct + '%'
        : '关爱金于第 ' + res.careYear + ' 个保单周年日给付，金额 = 基本保额 × ' + (careC.opt2_pct != null ? careC.opt2_pct : careC.pct) + '%');
    var annTxt = !res.annOn ? '生存年金：本方案未启用'
      : (res.annOpt === 'opt1'
        ? '生存年金自第 ' + res.annStart + ' 个保单周年日（含）起每年给付，前 ' + res.annCnt + ' 笔 = ' + (annC.opt1_basis1 === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + annC.opt1_pct1 + '%，自第 ' + (res.annCnt + 1) + ' 笔起 = ' + (annC.opt1_basis2 === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + annC.opt1_pct2 + '%' + (res.annStart === 0 ? '（首笔于签单当日即领）' : '')
        : '生存年金自第 ' + res.annStart + ' 个保单周年日起每年给付，金额 = ' + (annC.opt2_basis === 'saPct' ? '基本保额' : '累计已交保费') + ' × ' + (annC.opt2_pct != null ? annC.opt2_pct : annC.pct) + '%');
    var matTxt = (res.matOn && res.matAmt > 0)
      ? '满期金于保险期间届满日（被保险人 ' + (cfg.termAge || 105) + ' 周岁）给付，金额 = 累计已交保费 × ' + cfg.mat.pct + '%'
      : '满期金：本方案满期比例 0%，满期日不发生金额给付、合同终止';
    var deathTxt = !res.deathOn ? '身故金：本方案未启用'
      : (res.deathOpt === 'opt1'
        ? '身故金 = 累计已交保费 × ' + res.deathBefore + '%（第 1~' + res.deathSplit + ' 保单年度内身故）/ × ' + res.deathAfter + '%（自第 ' + (res.deathSplit + 1) + ' 保单年度起身故）'
        : '身故金按 max(累计已交保费, 身故时现金价值) 给付（合同终止）');
    html += '<div class="note rule" style="margin-top:10px"><b>演示口径</b>：' + careTxt + '；' + annTxt + '；' + matTxt + '；' + deathTxt + '。现金价值为保单年度末保单最低现金价值（CV = r×max(PVR,0)）。本演示表与「定价结果」节精算过程共用同一计算引擎、数值完全一致。' + PL_RET_NOTE + '</div>';
    return html;
  }

  // 两全（分红型）利益演示：分红型默认含"保证 + 红利中档"两档（不可关）
  function plRenderBenEndow(res, cfg, sgl) {
    var type = sgl ? 'endowment2' : 'endowment';
    var rows = plBenDemoRows(res, cfg, type);
    var dbName = sgl ? '身故保险金' : '身故或全残金';
    // 分红型天然含红利（保监发〔2015〕93号利差红），无需勾选开关；当年度关掉红利演示 pl_on_div=false 时则退化为单一保证利益列
    var showDiv = cfg.div.on && !!res.divRows;
    var iDivAccPctE = res.divSum ? (res.divSum.iDivAcc * 100).toFixed(2) : '0.00';
    var h = '<h3 style="margin:12px 0 8px">利益演示 · 逐保单年度（' + (sgl ? '中短期' : '长期') + '两全·分红型' + (showDiv ? ' · 含红利中档' : '') + '）</h3>' +
      '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th>保单年度末</th><th>年末年龄</th><th>当年度保险费</th><th>累计保险费</th>' +
      '<th>' + dbName + '（保证）</th>' +
      '<th>当年现金红利（中档）</th>' +
      (showDiv ? '<th>累计现金红利（按 ' + iDivAccPctE + '% 累计生息）</th>' : '') +
      '<th>退保金（年末CV）</th>' +
      '<th>总收益率</th><th>年化单利</th><th>年化复利</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], w = r.w;
      var deathBase = cfg.death.on ? Math.max(r.cum * (w.R || 1), w.CV || 0) : null;
      var matBase = (cfg.mat.on && w.t === res.T) ? res.matAmt : null;
      var dRow = showDiv ? res.divRows[w.t - 1] : null;
      var hl = w.t === 1 || w.t === res.T;
      h += '<tr' + (hl ? ' class="pl-hl"' : '') + '>' +
        '<td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td class="pl-m">' + (r.prem ? plNum(r.prem) : '—') + '</td><td class="pl-m">' + plNum(r.cum) + '</td>' +
        '<td class="pl-m">' + (deathBase !== null ? plNum(deathBase) : '—') + '</td>' +
        '<td class="pl-m">' + (dRow ? plNum(dRow.div) : '—') + '</td>' +
        (showDiv ? '<td class="pl-m pl-strong">' + (dRow ? plNum(dRow.cumCash) : '—') + '</td>' : '') +
        '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td>' +
        '<td class="pl-m">' + (r.ret !== null ? (r.ret * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.sl !== null ? (r.sl * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.irr !== null ? (r.irr * 100).toFixed(2) + '%' : '—') + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div>';
    h += '<div class="note rule" style="margin-top:10px"><b>演示口径</b>：' + dbName + ' = max(累计已交保费×R, 当年末现金价值)，R 按到达年龄分档（18–40周岁 160%、41–60周岁 140%、61周岁及以上 120%，18周岁及以下不乘系数）；在计算系数时，到达年龄 = 投保年龄 + 保单年度 − 1' + (sgl ? '' : '，首年含 180 日规则') + '；满期金 = 基本保额×' + cfg.mat.pct + '%。' +
      (showDiv ? '<br><b>红利中档</b>：演示利率 3.50%、可分配比例 70%（保监发〔2015〕93号利差红）；当年红利 = 基本保单周年红利（按可分配比例分配利差损益）；累计现金红利按 ' + iDivAccPctE + '% 累计生息（演示口径，实际以合同条款为准；红利不保证）。' : '') + PL_RET_NOTE + '</div>';
    return h;
  }

  // 两全（普通型）利益演示
  function plRenderBenPlainEndow(res, cfg) {
    var rows = plBenDemoRows(res, cfg, 'endowment3');
    var h = '<h3 style="margin:12px 0 8px">利益演示 · 逐保单年度（普通型两全）</h3>' +
      '<div class="pl-tbl-wrap"><table class="pl-table"><thead><tr>' +
      '<th>保单年度末</th><th>年末年龄</th><th>当年度保险费</th><th>累计保险费</th>' +
      '<th>满期金</th><th>身故保险金</th><th>退保金（年末CV）</th>' +
      '<th>总收益率</th><th>年化单利</th><th>年化复利</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], w = r.w;
      var mat = (cfg.mat.on && w.t === res.T) ? res.matAmt : null;
      var death = cfg.death.on ? Math.max(r.cum * (w.R || 1), w.CV || 0) : null;
      var hl = w.t === 1 || w.t === res.T;
      h += '<tr' + (hl ? ' class="pl-hl"' : '') + '>' +
        '<td>' + w.t + '</td><td>' + w.age + '</td>' +
        '<td class="pl-m">' + (r.prem ? plNum(r.prem) : '—') + '</td><td class="pl-m">' + plNum(r.cum) + '</td>' +
        '<td class="pl-m">' + (mat !== null ? plNum(mat) : '—') + '</td>' +
        '<td class="pl-m">' + (death !== null ? plNum(death) : '—') + '</td>' +
        '<td class="pl-m pl-strong">' + plNum(w.CV) + '</td>' +
        '<td class="pl-m">' + (r.ret !== null ? (r.ret * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.sl !== null ? (r.sl * 100).toFixed(2) + '%' : '—') + '</td>' +
        '<td class="pl-m">' + (r.irr !== null ? (r.irr * 100).toFixed(2) + '%' : '—') + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div>';
    h += '<div class="note rule" style="margin-top:10px"><b>演示口径</b>：本表为产品说明书【利益演示】口径——满期金 = 基本保险金额、身故保险金 = max(累计已交保费×R, 当年末现金价值)，R 按到达年龄分档（18–40周岁 160%、41–60周岁 140%、61周岁及以上 120%）；在计算系数时，到达年龄 = 投保年龄 + 保单年度 − 1（报告§2.3 公式按保单年度末年龄 ≤41/≤61 划界，与本口径数值等价）；现金价值为保单年度末保单最低现金价值（CV = r×max(PVR,0)，单口径 ' + (res.iCV * 100).toFixed(2) + '%）。本演示表与「定价结果」节精算过程共用同一计算引擎、数值完全一致。' + PL_RET_NOTE + '</div>';
    return h;
  }

  // 入口
  function plRenderBenDemo() {
    var out = document.getElementById('pl_ben_out');
    if (!out) return;
    if (!window.__plLast) { out.innerHTML = '<div class="note rule"><b>等待计算</b>：先在第三区块完成定价，点击「开始定价计算」后此处自动生成产品说明书口径的利益演示表。</div>'; return; }
    var res = window.__plLast.res, cfg = window.__plLast.cfg, type = window.__plLast.type;
    if (type === 'ci') {
      // 疾病保险：含意外伤害 150% 档条款责任说明（演示表按非意外情形 100% 列示）
      out.innerHTML = illCI(res, cfg) + '<div class="note rule" style="margin-top:8px"><b>条款责任提示 · 意外伤害 150% 档</b>：条款约定因意外伤害事故导致重大疾病按基本保险金额 150% 给付，本演示表按非意外情形（100%）列示；如需演示意外情形，重大疾病保险金列应改按 1.5×基本保险金额（首年 0.75×1.5×基本保险金额 + 0.25×毛保费）。</div>';
    } else if (type === 'endowment' || type === 'endowment2') {
      out.innerHTML = plRenderBenEndow(res, cfg, type === 'endowment2');
    } else if (type === 'endowment3') {
      out.innerHTML = plRenderBenPlainEndow(res, cfg);
    } else {
      out.innerHTML = plRenderBenAnnuity(res, cfg, type);
    }
  }

  // ================ 六、双视角透视：同一引擎、两种语言（页内 Tab + 单页导出） ================
  // 视角一 cust ：客户与销售 · 一页纸利益亮点卡（含保险利益全景图）
  // 视角二 act  ：精算研发 · 参数溯源与敏感性测试
  // 页签三 logic：定价方法和定价逻辑（引擎代码结构图 + 定价方程 + 本次求解轨迹）
  // 数据源：window.__plLast（res/cfg/type）；除敏感性分析重跑引擎外，不重复调用定价引擎
  // 数据源：window.__plLast（res/cfg/type）；除敏感性分析重跑引擎外，不重复调用定价引擎
  var VL_CSS = [
    '.pl-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 0}',
    '.pl-tab{padding:9px 22px;border-radius:40px;border:1.5px solid #e3ddd3;background:#fff;font-size:14px;font-weight:700;cursor:pointer;color:#6a6156}',
    '.pl-tab:hover{border-color:#b53d2e;color:#b53d2e}',
    '.pl-tab.active{background:#b53d2e;border-color:#b53d2e;color:#fff}',
    '.vl{border-radius:14px;overflow:hidden;border:1px solid #e3ddd3;box-shadow:0 2px 12px rgba(60,40,20,.08);background:#fff;margin:14px 0}',
    '.vl-head{padding:13px 20px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}',
    '.vl-title{font-size:16px;font-weight:800}',
    '.vl-sub{font-size:12.5px;opacity:.9;margin-top:3px}',
    '.vl-xbtn{padding:7px 16px;border-radius:40px;border:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.16);color:#fff;font-size:13px;font-weight:700;cursor:pointer}',
    '.vl-xbtn:hover{background:rgba(255,255,255,.3)}',
    '.vl-body{padding:16px 20px 18px}',
    '.vl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin:4px 0}',
    '.vl-kpi{border:1px solid;border-radius:10px;padding:10px 13px}',
    '.vl-kpi .k{font-size:12.5px;font-weight:700;display:block}',
    '.vl-kpi .v{font-size:20px;font-weight:800;line-height:1.4;display:block}',
    '.vl-kpi .s{font-size:11.5px;color:#6a6156;display:block;margin-top:2px;line-height:1.5}',
    '.vl-sec{margin:20px 0 8px;font-size:15px;font-weight:800;border-left:4px solid;padding-left:10px}',
    '.vl-tblwrap{overflow-x:auto;margin:6px 0}',
    '.vl-tbl{border-collapse:collapse;font-size:12.5px;background:#fff;width:100%}',
    '.vl-tbl th,.vl-tbl td{border:1px solid #e3ddd3;padding:5px 9px;text-align:right;white-space:nowrap}',
    '.vl-tbl th{color:#fff;font-weight:700}',
    '.vl-tbl td:first-child,.vl-tbl th:first-child{text-align:center}',
    '.vl-bar-grid{display:grid;grid-template-columns:52px 1fr 1fr 96px;gap:5px 10px;align-items:center;font-size:12.5px;margin:8px 0}',
    '.vl-bar{height:13px;border-radius:6px;min-width:2px}',
    '.vl-bcum{background:#d8d2c6}',
    '.vl-tor{display:grid;grid-template-columns:128px 1fr 1fr 92px;gap:5px 8px;align-items:center;font-size:12.5px;margin:8px 0}',
    '.vl-tor-l{height:13px;border-radius:6px;background:#d9958c;justify-self:end}',
    '.vl-tor-r{height:13px;border-radius:6px;background:#8fbf9f;justify-self:start}',
    '.vl-q{border:1px solid;border-radius:10px;padding:10px 14px;margin:8px 0;font-size:13.5px;line-height:1.8}',
    '.vl-q .q{font-weight:800}',
    '.vl-tips{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}',
    '.vl-tip{border:1px solid;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.85}',
    '.vl-tip h5{margin:0 0 6px;font-size:13.5px}',
    '.vl-warn{border:1.5px solid #b53d2e;background:#fdf1ef;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.85;color:#8a2c20;margin:10px 0}',
    '.vl-note{font-size:12px;color:#6a6156;margin-top:10px;line-height:1.75}',
    '.vl-chart{margin:10px 0 2px;border:1px solid #e3ddd3;border-radius:10px;padding:8px 4px 4px;background:#fffefb;overflow-x:auto}',
    '.vl-legend{display:flex;flex-wrap:wrap;gap:7px 15px;font-size:12px;color:#6a6156;margin:8px 0 2px;justify-content:center}',
    '.vl-legend span{display:inline-flex;align-items:center;gap:5px}',
    '.vl-legend i{width:14px;height:11px;border-radius:3px;display:inline-block;flex:none}',
    '.vl-jump{color:inherit;text-decoration:none;border-bottom:1px dashed currentColor;font-weight:700;cursor:pointer;white-space:nowrap}',
    '.vl-jump:hover{color:#b53d2e;border-bottom-style:solid}',
    '.vl-jump span{font-size:11px;opacity:.65}',
    '.vl-ok{color:#1f7a4d;font-weight:700}',
    '.vl-ng{color:#b53d2e;font-weight:700}',
    '.vl-mid{color:#8a6a2b;font-weight:700}',
    '.vl-mgmt .vl-head{background:#2f4d8a}.vl-mgmt .vl-kpi{border-color:#c9d6ee;background:#f5f8fd}.vl-mgmt .vl-kpi .v{color:#2f4d8a}.vl-mgmt .vl-sec{border-color:#2f4d8a;color:#2f4d8a}.vl-mgmt .vl-tbl th{background:#2f4d8a}.vl-mgmt .vl-q,.vl-mgmt .vl-tip{border-color:#c9d6ee;background:#f5f8fd}',
    '.vl-sales .vl-head{background:#1f7a4d}.vl-sales .vl-kpi{border-color:#bfe0cd;background:#f3faf6}.vl-sales .vl-kpi .v{color:#1f7a4d}.vl-sales .vl-sec{border-color:#1f7a4d;color:#1f7a4d}.vl-sales .vl-tbl th{background:#1f7a4d}.vl-sales .vl-q,.vl-sales .vl-tip{border-color:#bfe0cd;background:#f3faf6}',
    '.vl-cust .vl-head{background:#9c5f16}.vl-cust .vl-kpi{border-color:#ecd3ac;background:#fdf9f0}.vl-cust .vl-kpi .v{color:#9c5f16;font-size:24px}.vl-cust .vl-sec{border-color:#9c5f16;color:#9c5f16}.vl-cust .vl-tbl th{background:#9c5f16}.vl-cust .vl-q,.vl-cust .vl-tip{border-color:#ecd3ac;background:#fdf9f0}',
    '.vl-act .vl-head{background:#5f3d96}.vl-act .vl-kpi{border-color:#d9cbee;background:#f8f5fd}.vl-act .vl-kpi .v{color:#5f3d96}.vl-act .vl-sec{border-color:#5f3d96;color:#5f3d96}.vl-act .vl-tbl th{background:#5f3d96}.vl-act .vl-q,.vl-act .vl-tip{border-color:#d9cbee;background:#f8f5fd}',
    '.vl-logic .vl-head{background:#2f6b5a}.vl-logic .vl-kpi{border-color:#c6dfd4;background:#f4faf7}.vl-logic .vl-kpi .v{color:#2f6b5a}.vl-logic .vl-sec{border-color:#2f6b5a;color:#2f6b5a}.vl-logic .vl-tbl th{background:#2f6b5a}.vl-logic .vl-q,.vl-logic .vl-tip{border-color:#c6dfd4;background:#f4faf7}',
    '.vl-chain{margin:8px 0 2px;border:1px solid #e3ddd3;border-radius:10px;padding:10px 4px 6px;background:#fffdf9;overflow-x:auto}',
    '.vl-formula{margin:8px 0}',
    '.vl-formula .formula-box{border:1px solid #e3ddd3;background:#fdfbf7;border-radius:10px;padding:12px 14px;font-size:13px;line-height:2.05;overflow-x:auto}',
    '.vl-formula .formula-box .em{font-weight:800;color:#b53d2e;margin-top:9px}',
    '.vl-formula .card{border:1px solid #e3ddd3;border-radius:10px;background:#fff;padding:12px 14px;margin-top:10px;font-size:13px;line-height:1.85}',
    '.vl-formula a{color:#b53d2e}'
  ].join('\n');
  (function () { var st = document.createElement('style'); st.textContent = VL_CSS; document.head.appendChild(st); })();

  var VL_TYPE_NAME = { annuity: '年金保险', annuity_immediate: '年金保险（即期年金）', endowment: '两全保险（分红型·长期）', endowment2: '两全保险（分红型·中短期）', endowment3: '两全保险（普通型）', ci: '重大疾病保险' };
  function vlG(cfg) { return cfg.gender === 'f' ? '女' : '男'; }
  function vlPct(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : (v * 100).toFixed(d === undefined ? 2 : d) + '%'; }
  function vlIcvOf(res, cfg) {
    if (res.iCV1 !== undefined && res.iCV1 !== null) return res.iCV1;
    if (res.iCV !== undefined && res.iCV !== null) return res.iCV;
    return cfg.iCV !== undefined ? cfg.iCV : cfg.iCV1;
  }
  function vlGPpOf(res) { return (res.GPp1 !== undefined && res.GPp1 !== null) ? res.GPp1 : res.GPcv; }
  // 评估利率：plSolveEndow/plSolvePlainEndow/plSolveCI 均输出 res.iEval；年金引擎未输出 → 预定利率
  function vlIevalOf(res, cfg) {
    if (res.iEval !== undefined && res.iEval !== null) return res.iEval;
    return cfg.i;
  }
  function vlAvgE(a, h) { var s = 0; for (var t = 1; t <= h; t++) s += a[t]; return s / h; }
  // IRR：现金流数组 fl[k] = 第 k 年末净流量（保费在年初即 time 0..h-1）
  function vlIrr(fl) {
    var n = fl.length - 1;
    function npv(r) { var s = 0; for (var k = 0; k <= n; k++) s += fl[k] / Math.pow(1 + r, k); return s; }
    var lo = -0.95, hi = 10;
    var flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var it = 0; it < 160; it++) {
      var m = (lo + hi) / 2, fm = npv(m);
      if (Math.abs(fm) < 1e-9) return m;
      if (flo * fm < 0) { hi = m; } else { lo = m; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  function vlAnchors(T, extra) {
    var a = [1], step = Math.max(1, Math.ceil(T / 12));
    for (var t = step; t <= T; t += step) a.push(t);
    if (a[a.length - 1] !== T) a.push(T);
    if (extra) { for (var i = 0; i < extra.length; i++) { if (extra[i] >= 1 && extra[i] <= T && a.indexOf(extra[i]) < 0) a.push(extra[i]); } }
    a.sort(function (p, q) { return p - q; });
    return a;
  }
  // 派生指标：累计保费 / 保证生存给付 / 返本点 / 退保收益（单利·复利IRR）/ 满期持有收益
  function vlDerived(res, cfg, type) {
    var T = res.T, h = cfg.h, GP = res.GP, rows = res.rows;
    var isCI = (type === 'ci');
    var isAnn = plIsAnn(type);
    var isImm = (type === 'annuity_immediate');
    // 累计已交保费：与引擎 cumPrem 同口径——第 t 保单周年日时点累计 min(t, h) 期
    function cum(t) { return GP * Math.min(t, h); }
    function inflow(t) {
      if (isAnn) {
        var s = 0;
        if (res.careOn && res.careYear !== null && t === res.careYear) s += res.careAmt || 0;
        if (res.annOn && res.annStart !== null && t >= res.annStart && t <= T) s += res.survAmt[t] || 0;
        if (res.matOn && res.matAmt > 0 && t === T) s += res.matAmt || 0;
        return s;
      }
      if (type === 'ci') return 0;
      return (cfg.mat && cfg.mat.on && t === T) ? (res.matAmt || 0) : 0;
    }
    var totalIn = 0;
    for (var t0 = isImm ? 0 : 1; t0 <= T; t0++) totalIn += inflow(t0);
    var payback = null;
    if (!isCI) {
      for (var t2 = 1; t2 < T; t2++) {
        var w = rows[t2 - 1];
        if (w && (w.CV || 0) >= cum(t2) - 0.005) { payback = t2; break; }
      }
    }
    // 退保收益：与客户视角三指标同源（plRetRow）——收入含观察期内已领生存给付 + 年末退出金
    function surr(t) {
      var w = rows[t - 1] || {};
      var cv = w.CV || 0, m = plRetRow(res, cfg, type, t);
      return { t: t, cum: m.cum, cv: cv, exitVal: m.exitVal, inSum: m.inSum, W: m.W, ret: m.ret, sl: m.sl, irr: m.irr };
    }
    // 持有到期：第 T 年末按 plRetRow 计算（退出金 = 满期金优先于现金价值）
    var mMat = plRetRow(res, cfg, type, T);
    var mat = {
      totalPaid: GP * h, totalIn: mMat.inSum, W: mMat.W,
      ret: mMat.ret, sl: mMat.sl, irr: mMat.irr
    };
    return { T: T, h: h, GP: GP, cum: cum, inflow: inflow, totalIn: totalIn, payback: payback, surr: surr, mat: mat, isCI: isCI };
  }
  function vlCfgClone(cfg) {
    var c = {};
    for (var k in cfg) {
      var v = cfg[k];
      if (Object.prototype.toString.call(v) === '[object Array]') c[k] = v.slice();
      else if (v && typeof v === 'object') c[k] = vlCfgClone(v);
      else c[k] = v;
    }
    return c;
  }
  function vlRunCfg(cfg, type) {
    if (type === 'ci') return plSolveCI(cfg);
    if (type === 'endowment3') return plSolvePlainEndow(cfg);
    if (plIsEndow(type)) return plSolveEndow(cfg);
    if (type === 'annuity_immediate') return plSolveImmediate(cfg);
    return plSolve(cfg);
  }
  // 敏感性：重跑引擎（i ±0.5%、发生率 ×0.9/×1.1、定价费用率 ×0.9/×1.1）
  // 每一情景均调用 vlRunCfg 完整重跑定价引擎（非线性近似），GP 为真实迭代收敛解
  function vlSensitivity(cfg, type, baseGP) {
    var runs = [];
    function run(label, note, mutate) {
      var c = vlCfgClone(cfg);
      mutate(c);
      var r = vlRunCfg(c, type);
      var gp = (r && !r.error && isFinite(r.GP)) ? r.GP : null;
      runs.push({ label: label, note: note, GP: gp, d: (gp !== null && baseGP) ? gp / baseGP - 1 : null });
    }
    // 预定利率情景：现价基础利率按「法定加点差」同步平移（93号/7号文的加点是相对预定利率的固定加点，
    // 预定利率一动、现价基础利率随之动）。引擎定价折现基础已独立为 cP = plComm(cfg.i)，改 i 直接进入定价方程；
    // 现价基础利率 iCV1/iCV2 仍按「法定加点差」同步平移（保证最低现价口径随定价利率联动）。
    function runI(label, note, delta) {
      run(label, note, function (c) {
        var g1 = (c.iCV1 != null ? c.iCV1 : c.i) - c.i;
        var g2 = (c.iCV2 != null ? c.iCV2 : c.i) - c.i;
        var ni = Math.max(0.0005, c.i + delta);
        c.i = ni;
        if (c.iCV1 != null) c.iCV1 = Math.max(0.0001, ni + g1);
        if (c.iCV2 != null) c.iCV2 = Math.max(0.0001, ni + g2);
      });
    }
    runI('预定利率 −0.5%', '定价利率下调 50bp，现价基础利率同步下调', -0.005);
    runI('预定利率 +0.5%', '假设性上探 50bp（可能超现行上限，仅作弹性测度），现价基础利率同步上调', 0.005);
    run('发生率 ×0.9', '预定发生率降 10%', function (c) { c.factor = c.factor * 0.9; });
    run('发生率 ×1.1', '预定发生率升 10%', function (c) { c.factor = c.factor * 1.1; });
    run('费用率 ×1.1', '定价费用率全部上浮 10%', function (c) { for (var t = 1; t < c.eP.length; t++) c.eP[t] = Math.min(0.9, c.eP[t] * 1.1); });
    run('费用率 ×0.9', '定价费用率全部下浮 10%', function (c) { for (var t2 = 1; t2 < c.eP.length; t2++) c.eP[t2] = c.eP[t2] * 0.9; });
    return runs;
  }

  // ---- 视角一（合并）：客户与销售 · 一页纸利益亮点卡 ----
  // 金额简写：≥1万按「万」计（图上刻度用，避免长数字挤占轴宽）
  function vlMoney(v) {
    var a = Math.abs(v);
    if (a >= 10000) return (v / 10000).toFixed(a >= 100000 ? 0 : 1) + '万';
    return Math.round(v).toLocaleString('zh-CN');
  }
  // ---- 保险利益全景图（内联 SVG，可打印 / 可导出）----
  // 上栏：每年领到多少（生存给付柱）
  // 下栏：累计已交保费（朱砂线）vs 年末现金价值（青绿线），两线之间填充 = 退保盈亏（红亏 / 绿赚）
  //       琥珀虚线 = 到手总额（历年已领 + 当年退保能拿），即「此刻收手一共拿回多少」
  function vlBenefitSVG(res, cfg, type, d) {
    var T = res.T, rows = res.rows, h = cfg.h;
    var W = 900, H = 412, padL = 72, padR = 26;
    var xa = padL, xb = W - padR, pw = xb - xa;
    var upTop = 32, upBot = 140, dnTop = 198, dnBot = 352;
    function X(t) { return xa + (T ? (t / T) * pw : 0); }
    var f0 = d.inflow(0) || 0;
    var flow = [f0], cf = [f0], cumA = [], cvA = [];
    for (var t = 1; t <= T; t++) {
      flow.push(d.inflow(t) || 0);
      cf.push(cf[t - 1] + (d.inflow(t) || 0));
      cumA.push(d.cum(t));
      cvA.push((rows[t - 1] && rows[t - 1].CV) || 0);
    }
    var isCI = d.isCI;
    var ddAmt = (isCI && cfg.dd && cfg.dd.on) ? cfg.SA * cfg.dd.pct / 100 : 0;
    var dbAmt = (isCI && cfg.db && cfg.db.on) ? cfg.SA * cfg.db.pct / 100 : 0;
    var maxUp = 0;
    for (var i = 0; i <= T; i++) maxUp = Math.max(maxUp, flow[i] || 0);
    var noFlow = maxUp <= 0;                       // 保障型：无生存给付 → 上栏改画保障额度线
    if (noFlow) maxUp = Math.max(ddAmt, dbAmt, 1);
    // 下栏量程须覆盖三条线（累计已交 / 现金价值 / 到手总额＝已领＋现价），否则到手总额线会溢出画布
    var maxDn = 0;
    for (var j = 0; j < T; j++) maxDn = Math.max(maxDn, cumA[j], cvA[j], (cf[j + 1] || 0) + cvA[j]);
    maxDn = maxDn > 0 ? maxDn * 1.1 : 1;
    function Yu(v) { return upBot - (v / maxUp) * (upBot - upTop); }
    function Yd(v) { return dnBot - (v / maxDn) * (dnBot - dnTop); }
    function cu(t) { return t >= 1 ? cumA[t - 1] : 0; }
    function cvv(t) { return t >= 1 ? cvA[t - 1] : 0; }
    function tot(t) { return (t >= 1 ? cf[t] : f0) + cvv(t); }
    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="height:auto;max-width:' + W + 'px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">');
    s.push('<rect x="' + xa + '" y="' + upTop + '" width="' + pw.toFixed(1) + '" height="' + (upBot - upTop) + '" fill="#fdfcf9" stroke="#eee8dd"/>');
    s.push('<rect x="' + xa + '" y="' + dnTop + '" width="' + pw.toFixed(1) + '" height="' + (dnBot - dnTop) + '" fill="#fdfcf9" stroke="#eee8dd"/>');
    // 网格 + 金额刻度
    var fr = [0, 0.5, 1];
    for (var g = 0; g < fr.length; g++) {
      var yu = upBot - fr[g] * (upBot - upTop), yd = dnBot - fr[g] * (dnBot - dnTop);
      s.push('<line x1="' + xa + '" y1="' + yu.toFixed(1) + '" x2="' + xb + '" y2="' + yu.toFixed(1) + '" stroke="#eee8dd"/>');
      s.push('<line x1="' + xa + '" y1="' + yd.toFixed(1) + '" x2="' + xb + '" y2="' + yd.toFixed(1) + '" stroke="#eee8dd"/>');
      s.push('<text x="' + (xa - 8) + '" y="' + (yu + 4).toFixed(1) + '" font-size="11" fill="#8a8177" text-anchor="end">' + vlMoney(maxUp * fr[g]) + '</text>');
      s.push('<text x="' + (xa - 8) + '" y="' + (yd + 4).toFixed(1) + '" font-size="11" fill="#8a8177" text-anchor="end">' + vlMoney(maxDn * fr[g]) + '</text>');
    }
    // 栏标题
    s.push('<text x="' + xa + '" y="' + (upTop - 11) + '" font-size="12.5" font-weight="700" fill="' + (noFlow ? '#7a5a9c' : '#8a6512') + '">' + (noFlow ? '保障额度（出事赔多少）' : '每年领到多少（生存给付）') + '</text>');
    s.push('<text x="' + xa + '" y="' + (dnTop - 11) + '" font-size="12.5" font-weight="700" fill="#2b2a26">交的钱 vs 退保能拿回的钱（两线之间＝退保盈亏）</text>');
    // 上栏：生存给付柱 / 保障额度线
    if (noFlow) {
      if (ddAmt > 0) {
        var ydd = Yu(ddAmt);
        s.push('<line x1="' + xa + '" y1="' + ydd.toFixed(1) + '" x2="' + xb + '" y2="' + ydd.toFixed(1) + '" stroke="#b53d2e" stroke-width="2" stroke-dasharray="7 5"/>');
        s.push('<text x="' + (xa + 8) + '" y="' + (ydd - 7).toFixed(1) + '" font-size="12" font-weight="700" fill="#b53d2e">重疾保障 ¥ ' + plNum(ddAmt, 0) + '（确诊即一次性给付）</text>');
      }
      if (dbAmt > 0) {
        var ydb = Yu(dbAmt);
        s.push('<line x1="' + xa + '" y1="' + ydb.toFixed(1) + '" x2="' + xb + '" y2="' + ydb.toFixed(1) + '" stroke="#5f3d96" stroke-width="2" stroke-dasharray="7 5"/>');
        s.push('<text x="' + (xa + 8) + '" y="' + (ydb - 7).toFixed(1) + '" font-size="12" font-weight="700" fill="#5f3d96">身故保障 ¥ ' + plNum(dbAmt, 0) + '</text>');
      }
    } else {
      var step = Math.max(1, Math.ceil(T / 22));
      var bw = Math.max(3, (pw / T) * step * 0.6);
      for (var t2 = 0; t2 <= T; t2 += step) {
        var v = flow[t2] || 0; if (v <= 0) continue;
        var yy = Yu(v), hh = Math.max(1.5, upBot - yy);
        var bxx = Math.max(xa, X(t2) - bw / 2);
        s.push('<rect x="' + bxx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="#bb8a1f" opacity=".88" rx="2"><title>第 ' + t2 + ' 年领 ¥ ' + plNum(v, 0) + '</title></rect>');
      }
    }
    // 下栏：盈亏填充（逐段四边形，跨交点处拆分以保证颜色切换点精确）
    var polys = [];
    for (var t3 = 0; t3 < T; t3++) {
      var dA = cu(t3) - cvv(t3), dB = cu(t3 + 1) - cvv(t3 + 1);
      if (dA * dB >= 0) {
        polys.push({ neg: (dA + dB) > 0, pts: [[X(t3), Yd(cu(t3))], [X(t3 + 1), Yd(cu(t3 + 1))], [X(t3 + 1), Yd(cvv(t3 + 1))], [X(t3), Yd(cvv(t3))]] });
      } else {
        var pr = dA / (dA - dB), ts = t3 + pr, midv = cu(t3) + pr * (cu(t3 + 1) - cu(t3));
        polys.push({ neg: dA > 0, pts: [[X(t3), Yd(cu(t3))], [X(ts), Yd(midv)], [X(ts), Yd(midv)], [X(t3), Yd(cvv(t3))]] });
        polys.push({ neg: dB > 0, pts: [[X(ts), Yd(midv)], [X(t3 + 1), Yd(cu(t3 + 1))], [X(t3 + 1), Yd(cvv(t3 + 1))], [X(ts), Yd(midv)]] });
      }
    }
    for (var p = 0; p < polys.length; p++) {
      var ptxt = [];
      for (var q = 0; q < polys[p].pts.length; q++) ptxt.push(polys[p].pts[q][0].toFixed(1) + ',' + polys[p].pts[q][1].toFixed(1));
      s.push('<polygon points="' + ptxt.join(' ') + '" fill="' + (polys[p].neg ? '#f0cdc7' : '#d5e9da') + '"/>');
    }
    // 下栏：三条线
    function lp(fn) { var a = []; for (var k = 0; k <= T; k++) a.push(X(k).toFixed(1) + ',' + fn(k).toFixed(1)); return a.join(' '); }
    s.push('<polyline points="' + lp(function (t) { return Yd(cu(t)); }) + '" fill="none" stroke="#b53d2e" stroke-width="2.6"/>');
    s.push('<polyline points="' + lp(function (t) { return Yd(cvv(t)); }) + '" fill="none" stroke="#2f6b5a" stroke-width="2.6"/>');
    s.push('<polyline points="' + lp(function (t) { return Yd(tot(t)); }) + '" fill="none" stroke="#bb8a1f" stroke-width="2" stroke-dasharray="6 4"/>');
    // 交费期满标记
    if (h < T && h >= 1) {
      var xh = X(h);
      s.push('<line x1="' + xh.toFixed(1) + '" y1="' + dnTop + '" x2="' + xh.toFixed(1) + '" y2="' + dnBot + '" stroke="#c9c2b4" stroke-width="1" stroke-dasharray="3 3"/>');
      s.push('<text x="' + (xh + 4).toFixed(1) + '" y="' + (dnTop + 14) + '" font-size="10.5" fill="#8a8177">交费期满</text>');
    }
    // 回本点
    if (d.payback) {
      var pbx = X(d.payback), pby = Yd(cvv(d.payback));
      var anc2 = (pbx > xb - 90) ? 'end' : 'middle';
      s.push('<circle cx="' + pbx.toFixed(1) + '" cy="' + pby.toFixed(1) + '" r="5.5" fill="#fff" stroke="#b53d2e" stroke-width="2.6"/>');
      s.push('<text x="' + pbx.toFixed(1) + '" y="' + (pby - 12).toFixed(1) + '" font-size="12" font-weight="700" fill="#b53d2e" text-anchor="' + anc2 + '">★ 第 ' + d.payback + ' 年回本</text>');
    }
    // X 轴刻度（保单年度 + 年龄）
    var anc = vlAnchors(T);
    for (var a2 = 0; a2 < anc.length; a2++) {
      var t4 = anc[a2], xx = X(t4);
      s.push('<line x1="' + xx.toFixed(1) + '" y1="' + dnBot + '" x2="' + xx.toFixed(1) + '" y2="' + (dnBot + 5) + '" stroke="#c9c2b4"/>');
      s.push('<text x="' + xx.toFixed(1) + '" y="' + (dnBot + 20) + '" font-size="11" fill="#6a6156" text-anchor="middle">第' + t4 + '年</text>');
      s.push('<text x="' + xx.toFixed(1) + '" y="' + (dnBot + 34) + '" font-size="10.5" fill="#8a8177" text-anchor="middle">' + (cfg.x + t4) + '岁</text>');
    }
    s.push('</svg>');
    return s.join('');
  }
  function vlCust(res, cfg, type) {
    var d = vlDerived(res, cfg, type);
    var T = res.T, h = cfg.h, GP = res.GP;
    var isCI = d.isCI;
    var ddAmt = (isCI && cfg.dd && cfg.dd.on) ? cfg.SA * cfg.dd.pct / 100 : 0;
    var dbAmt = (isCI && cfg.db && cfg.db.on) ? cfg.SA * cfg.db.pct / 100 : 0;
    // 一句话
    var one;
    if (plIsAnn(type)) one = (type === 'annuity_immediate')
      ? '签单当天先领一笔 ¥ ' + plNum(res.survAmt[0] || 0, 0) + '，之后每年再领，用 ' + (h === 1 ? '一笔 ' + plNum(GP, 0) + ' 元' : h + ' 年、每年 ' + plNum(GP, 0) + ' 元') + '，换一笔笔持续到 ' + (cfg.termAge || 105) + ' 岁的钱。'
      : '用 ' + (h === 1 ? '一笔 ' + plNum(GP, 0) + ' 元' : h + ' 年、每年 ' + plNum(GP, 0) + ' 元') + '，换从第 ' + (res.annStart !== null ? res.annStart : '—') + ' 年起每年 ' + plNum(res.annAmt || 0, 0) + ' 元的养老钱，一直领到 ' + (cfg.termAge || 105) + ' 岁；中途身故，已交的钱不会亏。';
    else if (type === 'ci') one = '每年交 ' + plNum(GP, 0) + ' 元、交 ' + h + ' 年，确诊重疾一次性赔 ' + plNum(ddAmt, 0) + ' 元，身故也赔——这是一份保障，不是储蓄，满期不返钱。';
    else if (type === 'endowment3') one = '一次性交 ' + plNum(GP, 0) + ' 元，' + T + ' 年后满期拿回 ' + plNum(res.matAmt || 0, 0) + ' 元；期间身故，家人按已交保费最高 160% 拿钱。';
    else one = '交 ' + (h === 1 ? '一笔 ' + plNum(GP, 0) + ' 元' : h + ' 年、每年 ' + plNum(GP, 0) + ' 元') + '，第 ' + T + ' 年满期拿回 ' + plNum(res.matAmt || 0, 0) + ' 元；期间身故，家人拿到的钱不少于已交保费；经营好还有红利（不保证）。';
    var html = '<div class="vl-q" style="font-size:15px;line-height:2"><span class="q">这份保单，一句话：</span>' + one + '</div>';
    // 我交多少 / 我能拿回多少（KPI）
    html += '<div class="vl-sec">我交多少钱？能拿回多少？</div><div class="vl-kpis">';
    if (isCI) {
      html += '<div class="vl-kpi"><span class="k">每年交</span><span class="v">¥ ' + plNum(GP, 0) + '</span><span class="s">' + (h === 1 ? '一次性交清（趸交）' : '连交 ' + h + ' 年') + '</span></div>' +
        '<div class="vl-kpi"><span class="k">一共交</span><span class="v">¥ ' + plNum(GP * h, 0) + '</span><span class="s">累计已交保费</span></div>' +
        '<div class="vl-kpi"><span class="k">首年杠杆</span><span class="v">' + (GP > 0 ? (ddAmt / GP).toFixed(1) + ' 倍' : '—') + '</span><span class="s">重疾保额 ÷ 年保费</span></div>' +
        '<div class="vl-kpi"><span class="k">全程杠杆</span><span class="v">' + ((GP * h) > 0 ? (ddAmt / (GP * h)).toFixed(1) + ' 倍' : '—') + '</span><span class="s">重疾保额 ÷ 累计保费</span></div>' +
        '<div class="vl-kpi"><span class="k">重疾给付</span><span class="v">¥ ' + plNum(ddAmt, 0) + '</span><span class="s">意外导致重疾按 150% 赔（¥ ' + plNum(ddAmt * 1.5, 0) + '）</span></div>' +
        '<div class="vl-kpi"><span class="k">身故给付</span><span class="v">¥ ' + plNum(dbAmt, 0) + '</span><span class="s">与重疾不重复给付</span></div>';
    } else {
      html += '<div class="vl-kpi"><span class="k">每年交</span><span class="v">¥ ' + plNum(GP, 0) + '</span><span class="s">' + (h === 1 ? '一次性交清（趸交）' : '连交 ' + h + ' 年') + '</span></div>' +
        '<div class="vl-kpi"><span class="k">一共交</span><span class="v">¥ ' + plNum(GP * h, 0) + '</span><span class="s">累计已交保费</span></div>' +
        '<div class="vl-kpi"><span class="k">持有到期共领（保证）</span><span class="v">¥ ' + plNum(d.mat.totalIn, 0) + '</span><span class="s">比共交的多 ' + vlPct(d.mat.ret, 1) + '</span></div>' +
        '<div class="vl-kpi"><span class="k">满期总收益率</span><span class="v">' + vlPct(d.mat.ret, 2) + '</span><span class="s">年化单利 ' + vlPct(d.mat.sl, 2) + ' ｜ 年化复利 ' + vlPct(d.mat.irr, 2) + '</span></div>';
    }
    html += '</div>';
    // 我能领到什么
    html += '<div class="vl-sec">我能领到什么？（合同保证的部分）</div>';
    if (plIsAnn(type)) {
      var li = [];
      if (res.careOn) li.push('❶ 关爱金：' + (res.careOpt === 'opt1' ? '活到 ' + cfg.care.opt1_age + ' 周岁（第 ' + res.careYear + ' 年度）领 ¥ ' + plNum(res.careAmt || 0, 0) : '第 ' + res.careYear + ' 年还活着，领 ¥ ' + plNum(res.careAmt || 0, 0)));
      if (res.annOn) li.push('❷ 养老钱：' + (type === 'annuity_immediate' && res.annStart === 0 ? '<b>签单当天先领 ¥ ' + plNum(res.survAmt[0] || 0, 0) + '</b>，之后每年领' : '第 ' + res.annStart + ' 年起每年领 ¥ ' + plNum(res.annAmt || 0, 0)) + '，领到 ' + (cfg.termAge || 105) + ' 岁');
      if (res.matOn && res.matAmt > 0) li.push('❸ 满期金：' + (cfg.termAge || 105) + ' 岁满期再领 ¥ ' + plNum(res.matAmt || 0, 0));
      if (res.deathOn) li.push('❹ 身故金：不幸身故，' + (res.deathOpt === 'opt1' ? '前 ' + res.deathSplit + ' 年按已交保费 × ' + res.deathBefore + '% 赔' : '家人领「已交保费和现金价值中较多的那个」'));
      html += '<div class="vl-q">' + li.join('<br>') + '</div>';
    } else if (isCI) {
      html += '<div class="vl-q">❶ 重疾金：等待期 90 日后确诊重疾（120 种），一次性赔 ¥ ' + plNum(ddAmt, 0) + '；意外导致的重疾赔 1.5 倍<br>❷ 身故金：身故赔 ¥ ' + plNum(dbAmt, 0) + '（与重疾不重复赔）<br>❸ 没有满期金：保障到期合同结束，不返钱——这就是「消费型」保障的含义</div>';
    } else {
      html += '<div class="vl-q">❶ 满期金：第 ' + T + ' 年到期还活着，一次性领 ¥ ' + plNum(res.matAmt || 0, 0) + '<br>❷ 身故金：不幸身故，家人领「已交保费×给付系数（最高 ' + (cfg.death ? (cfg.death.r1 * 100).toFixed(0) : '160') + '%）和现金价值中较多的那个」' + (res.divSum ? '<br>❸ 红利：公司经营好每年分一点，用于买更多保额（<b>不保证</b>）' : '') + '</div>';
    }
    // 保险利益全景图
    html += '<div class="vl-sec">我的保险利益全景图（一张图看清交多少、领多少、退保拿多少）</div>';
    html += '<div class="vl-chart">' + vlBenefitSVG(res, cfg, type, d) + '</div>';
    html += '<div class="vl-legend">' +
      (isCI ? '' : '<span><i style="background:#bb8a1f"></i>每年领到的钱</span>') +
      '<span><i style="background:#b53d2e"></i>累计已交保费</span>' +
      '<span><i style="background:#2f6b5a"></i>退保能拿回（现金价值）</span>' +
      (isCI ? '<span><i style="background:#b53d2e;opacity:.55"></i>重疾保障额度</span><span><i style="background:#5f3d96;opacity:.55"></i>身故保障额度</span>' : '<span><i style="background:#bb8a1f;opacity:.55"></i>到手总额（已领＋退保能拿）</span>') +
      '<span><i style="background:#f0cdc7"></i>退保亏损区</span>' +
      '<span><i style="background:#d5e9da"></i>退保盈利区</span>' +
      '</div>';
    // 看图结论
    var s1 = d.surr(1);
    var loss1 = s1.cum - s1.cv;
    html += '<div class="vl-sec">看图说话（三个最该记住的数字）</div><div class="vl-kpis">' +
      '<div class="vl-kpi"><span class="k">第 1 年退保</span><span class="v">¥ ' + plNum(s1.cv, 0) + '</span><span class="s">' + (loss1 > 0 ? '亏 ¥ ' + plNum(loss1, 0) + '（只拿回已交的 ' + vlPct(s1.cum > 0 ? s1.cv / s1.cum : null, 0) + '）' : '不亏') + '</span></div>' +
      '<div class="vl-kpi"><span class="k">' + (d.isCI ? '保障额度' : '回本时间') + '</span><span class="v">' + (d.isCI ? '¥ ' + plNum(ddAmt, 0) : (d.payback ? '第 ' + d.payback + ' 年' : '期内未回本')) + '</span><span class="s">' + (d.isCI ? '确诊重疾一次性给付' : (d.payback ? '这年退保能拿回 ¥ ' + plNum(d.surr(d.payback).cv, 0) + '，追平已交' : '要等到第 ' + T + ' 年满期')) + '</span></div>' +
      '<div class="vl-kpi"><span class="k">' + (d.isCI ? '身故保障' : '持有到期年化复利') + '</span><span class="v">' + (d.isCI ? '¥ ' + plNum(dbAmt, 0) : vlPct(d.mat.irr, 2)) + '</span><span class="s">' + (d.isCI ? '身故一次性给付' : '共到手 ¥ ' + plNum(d.mat.totalIn, 0) + '（总收益率 ' + vlPct(d.mat.ret, 1) + '）') + '</span></div>' +
      '</div>';
    // 什么时候回本
    html += '<div class="vl-sec">什么时候「回本」？</div>';
    html += d.isCI
      ? '<div class="vl-q">保障型产品没有「回本」一说：交的保费换的是「万一出事赔一大笔」。中途退保只能拿回现金价值，远少于已交保费（见上图）。</div>'
      : (d.payback
        ? '<div class="vl-q" style="background:#eefaf2"><b style="font-size:18px">第 ' + d.payback + ' 年</b>：这年退保能拿回 ¥ ' + plNum(d.surr(d.payback).cv, 0) + '，刚好超过已交的 ¥ ' + plNum(d.surr(d.payback).cum, 0) + '。之前退保都会亏，越早亏越多（图中红色区域就是亏的钱）。</div>'
        : '<div class="vl-q">保险期间内退保都拿不回全部已交保费；「回本」要等到第 ' + T + ' 年满期领取 ¥ ' + plNum(d.mat.totalIn, 0) + '（比共交的多 ' + vlPct(d.mat.ret, 1) + '）。</div>');
    // 优点/缺点
    var pros, cons;
    if (plIsAnn(type)) {
      if (type === 'annuity_immediate') {
        pros = ['签单当日即领首笔年金，资金回笼快', '与生命等长的现金流，活多久领多久，不怕长寿把钱花完', '关爱金＋年金＋满期金多重领取'];
        cons = ['每年领的金额固定，跑不赢高通胀', '急用钱只能退保或保单贷款，前期退保损失大（图中红色区）', (res.deathOpt === 'opt1' ? '身故保障分段递减：自第 ' + (res.deathSplit + 1) + ' 年度起身故仅按已交保费 × ' + res.deathAfter + '% 给付' : '前期退保损失大')];
      } else {
        pros = ['与生命等长的现金流，活多久领多久，不怕长寿把钱花完', '关爱金＋年金＋满期金三重领取', '身故按「已交保费与现价取大」，本金不亏'];
        cons = ['钱被锁到很晚才开始领（第 ' + res.annStart + ' 年起），前期退保损失大', '流动性差，急用钱只能退保或保单贷款', '每年领的金额固定，跑不赢高通胀'];
      }
    } else if (isCI) {
      pros = ['高杠杆：首年保费撬动 ' + (GP > 0 ? (ddAmt / GP).toFixed(1) : '—') + ' 倍保额', '确诊即一次性给付，钱怎么花自己定', '含身故责任，重疾身故都有兜底'];
      cons = ['满期不返钱，保费是「消费」掉的', '前几年退保损失非常大（首年约拿回 ' + vlPct(s1.cum > 0 ? s1.cv / s1.cum : null, 0) + '）', '90 日等待期内非意外出险不赔'];
    } else if (type === 'endowment3') {
      pros = ['满期给付写进合同，' + T + ' 年后确定拿 ' + plNum(res.matAmt || 0, 0) + ' 元', '身故保障高（最高按已交保费 160% 赔）', '没有红利的不确定性，所有数字都是保证的'];
      cons = ['一次性交 ' + plNum(GP, 0) + ' 元，资金占用大', T + ' 年内退保有损失（越早越多）', '收益是固定的，公司经营再好也不多给'];
    } else {
      pros = ['满期给付确定：第 ' + T + ' 年拿 ' + plNum(res.matAmt || 0, 0) + ' 元', '身故有兜底：家人拿到的不少于已交保费', (res.divSum ? '经营好有红利分成，分享保险公司投资成果' : '利益全部写进合同，确定性强')];
      cons = ['前 ' + (d.payback || T) + ' 年退保亏钱，越早退亏越多', (res.divSum ? '红利不保证，可能为 0' : '收益率中规中矩，长期锁仓'), '持有不满期，年化收益可能低于同期存款'];
    }
    html += '<div class="vl-sec">这份产品的优点与缺点（不吹不黑）</div><div class="vl-tips">' +
      '<div class="vl-tip"><h5>✔ 优点</h5>' + pros.map(function (p) { return '· ' + p; }).join('<br>') + '</div>' +
      '<div class="vl-tip"><h5>✘ 缺点</h5>' + cons.map(function (p) { return '· ' + p; }).join('<br>') + '</div>' +
      '</div>';
    // 客户最常问五问（标准答案）
    html += '<div class="vl-sec">客户最常问五问（标准答案）</div>';
    if (isCI) {
      html += '<div class="vl-q"><span class="q">① 确诊重疾能赔多少？</span><br>基本保额 ¥ ' + plNum(ddAmt, 0) + '（120 种重疾，等待期 90 日后、确诊即一次性给付）；意外伤害导致的重疾按 150% 赔 ¥ ' + plNum(ddAmt * 1.5, 0) + '。</div>' +
        '<div class="vl-q"><span class="q">② 没生病，钱不就白交了？</span><br>这是保障型产品：每年 ' + plNum(GP, 0) + ' 元撬动 ' + plNum(ddAmt, 0) + ' 元保额（首年杠杆 ' + (GP > 0 ? (ddAmt / GP).toFixed(1) : '—') + ' 倍），保费换取的是「确定的大钱」；储蓄不是它的功能。</div>' +
        '<div class="vl-q"><span class="q">③ 要交多久？</span><br>' + (h === 1 ? '一次性趸交' : h + ' 年交，每年 ' + plNum(GP, 0) + ' 元，共 ' + plNum(GP * h, 0) + ' 元') + '，保障到 ' + cfg.termAge + ' 周岁。</div>' +
        '<div class="vl-q"><span class="q">④ 中途退保亏多少？</span><br>前几年退保损失最大（首年退保仅拿回约 ' + vlPct(s1.cum > 0 ? s1.cv / s1.cum : null, 0) + '），买前请确认这笔钱 5–10 年内不会用到。</div>' +
        '<div class="vl-q"><span class="q">⑤ 等待期怎么算？</span><br>90 日内非意外原因确诊重疾或身故不赔、无息返保费；意外无等待期。</div>';
    } else {
      html += '<div class="vl-q"><span class="q">① 什么时候回本？</span><br>' + (d.payback ? '第 ' + d.payback + ' 个保单年度末，现金价值 ' + plNum(d.surr(d.payback).cv, 0) + ' 元首次追平累计已交保费 ' + plNum(d.surr(d.payback).cum, 0) + ' 元（全景图上的 ★ 点）。' : '保险期间内退保金始终低于已交保费，回本点在满期：第 ' + T + ' 年共领取 ' + plNum(d.mat.totalIn, 0) + ' 元（总收益率 ' + vlPct(d.mat.ret, 1) + '）。') + '</div>' +
        '<div class="vl-q"><span class="q">② 满期能拿多少？</span><br>' + (res.matAmt ? '满期金 ¥ ' + plNum(res.matAmt, 0) + (plIsAnn(type) ? '，加上历年已领关爱金/年金共 ' + plNum(d.totalIn, 0) + ' 元' : '') + '，相当于已交保费的 ' + vlPct(d.totalIn / d.mat.totalPaid, 0) + '。' : '本产品满期无给付。') + '</div>' +
        '<div class="vl-q"><span class="q">③ 中途急用钱怎么办？</span><br>两条路：退保按当年现金价值拿回（' + (d.payback ? '第 ' + d.payback + ' 年前退保有损失' : '退保均有损失') + '，具体看全景图）；或保单贷款（最高约现价 80%，保单继续有效）。</div>' +
        '<div class="vl-q"><span class="q">④ 身故怎么赔？</span><br>' + (plIsAnn(type) ? (res.deathOpt === 'opt1' ? '前 ' + res.deathSplit + ' 个保单年度内身故，按累计已交保费 × ' + res.deathBefore + '% 赔付；自第 ' + (res.deathSplit + 1) + ' 年度起身故按 × ' + res.deathAfter + '% 赔付（合同约定两段式）。' : '按「累计已交保费与现金价值取大」给付，已交的钱不会亏。') : '按「累计已交保费×给付系数 R（最高 ' + (cfg.death ? (cfg.death.r1 * 100).toFixed(0) : '160') + '%）与现金价值取大」给付，家人的钱不少于已交保费。') + '</div>' +
        '<div class="vl-q"><span class="q">⑤ 红利靠谱吗？</span><br>' + (res.divSum ? '红利非保证：演示利率 3.5%、可分配 70% 只是中档演示，实际取决于公司投资表现；低档演示=只有保证利益。' : '本产品为传统险，没有红利——所有利益都是合同保证的。') + '</div>';
    }
    // 风险提示
    html += '<div class="vl-warn"><b>买前必读：</b>① 退保按「现金价值」算，不是按已交保费算——前期退保会亏钱（全景图红色区），这笔钱短期内（至少到第 ' + (d.payback || T) + ' 年）不会用到再买；' + (res.divSum ? '② 红利是不保证的，演示≠承诺，低档演示就是只有保证部分；' : '② 本产品利益均为合同保证项；') + '③ 本页数字由定价公式演示生成，具体以保险合同条款为准；④ 身故/重疾给付与退保不可兼得。</div>';
    // 术语小词典
    html += '<div class="vl-sec">术语小词典（人话版）</div><div class="vl-tblwrap"><table class="vl-tbl"><tr><th>术语</th><th style="text-align:left">人话</th></tr>' +
      '<tr><td>现金价值</td><td style="text-align:left">现在退保，保险公司退给你的钱</td></tr>' +
      '<tr><td>累计已交保费</td><td style="text-align:left">这些年一共交了多少钱</td></tr>' +
      '<tr><td>满期金</td><td style="text-align:left">合同到期还活着，一次性领的钱</td></tr>' +
      '<tr><td>基本保额</td><td style="text-align:left">出事时按它算赔款的基数</td></tr>' +
      (res.divSum ? '<tr><td>红利</td><td style="text-align:left">保险公司赚了钱分你一份，可能多可能少，可能没有</td></tr>' : '') +
      (d.isCI ? '<tr><td>等待期</td><td style="text-align:left">刚买后的 90 天，非意外出险不赔（防带病投保）</td></tr><tr><td>杠杆</td><td style="text-align:left">小保费撬动大保额的倍数</td></tr>' : '<tr><td>年化复利</td><td style="text-align:left">把这笔投资折算成的「真」年收益率</td></tr>') +
      '</table></div>';
    html += '<div class="vl-note">数据口径（客户视角 · 保证利益，未含红利）：退保拿回 = 保单年度末现金价值（第 T 年末有满期金时取满期金）；' +
      '总收益率 = Σ(已领生存给付 + 退保拿回) ÷ 累计已交保费 − 1；年化单利 = (Σ收入 − 累计已交保费) ÷ (年保费 × 保费存续时间之和)；年化复利 = 现金流内部收益率 IRR（NPV = 0）。' +
      '以上数值为公式法定价演示，非正式报价。</div>';
    return html;
  }
  // ---- 视角二：精算研发 · 参数溯源与敏感性测试 ----
  function vlAct(res, cfg, type) {
    var T = res.T, h = cfg.h, GP = res.GP;
    var icv = vlIcvOf(res, cfg);
    var isDiv = (type === 'endowment' || type === 'endowment2');
    var isE3 = plIsE3(type), isCI = plIsCI(type);
    var capI = (plIsEndow(type) && !isE3) ? 0.0175 : 0.02;
    var addExpect = (plIsEndow(type) && !isE3) ? ((T <= 10) ? 0.01 : 0.015) : 0.02;
    var calib = {
      annuity: '年金保险：按精算报告口径复现（公式法迭代定价＋FPT 准备金＋双口径现价年度融合），迭代收敛残差 < 1e-9。',
      endowment: '长期分红两全：按精算报告口径复现（双口径现价＋年度融合＋红利演示＋修正法准备金 α 下限 3.5%）。定价折现基础与现价链利率已分离（cP/c1/c2 三链）。',
      endowment2: '中短期分红两全：官方费率表锚点（5年趸交、千元保额比）1,033.67 vs 官方 1,057.05（−2.2%，差异来自费用率口径 5% vs 2.85%）；45岁男/6年/3年交 现金价值结构逐链一致、仅存定价 GP 的等比差（约 −1.96%）。PVR 未来净保费已切换为现价费用率 eCV（2026-09-04 闭环）。',
      endowment3: '普通型两全（示例两全保险）：GP = 49,974.27 vs 说明书 50,000（−0.051%）；现金价值 5/5 年度命中（最大偏差 0.054%）；发生率按生命表2010-2013 非养老二表 ×70%（2010 版原表已内置）。',
      ci: '重大疾病保险：官方费率表 14 格全命中（男40/20年交 GP=113.38、女25/交至60 GP=46.89、男30/交至60 GP=73.30、男50/交至60 GP=206.44，偏差 0.00）；官方现金价值表最大偏差 ≤0.006 元（表内四舍五入级）。'
    }[type];
    // 三率溯源表（每行附「去调整」链接，点击滚动并高亮到上方对应输入位）
    function plJump(id, name) {
      return '<a href="javascript:void(0)" class="vl-jump" onclick="plJumpParam(\'' + id + '\')" title="跳到「' + name + '」设置处调整">' + name + ' <span>↗</span></a>';
    }
    var rows2 = [];
    rows2.push([plJump('pl_i', '预定利率 i'), (cfg.i * 100).toFixed(2) + '%', '现行上限 ' + (capI * 100).toFixed(2) + '%（' + (isDiv ? '分红型' : '普通型/健康险') + '）', cfg.i <= capI + 1e-9 ? 1 : 0]);
    rows2.push([plJump('pl_icv1', '现价基础利率'), (icv * 100).toFixed(2) + '%', '预定利率 + ' + (addExpect * 100).toFixed(1) + '% = ' + ((cfg.i + addExpect) * 100).toFixed(2) + '%（' + ((plIsEndow(type) && !isE3) ? '93号文' : '7号文') + '第九条）', Math.abs(icv - (cfg.i + addExpect)) < 0.0051 ? 1 : 0]);
    rows2.push([plJump('pl_i', '评估利率'), (vlIevalOf(res, cfg) * 100).toFixed(2) + '%', isDiv ? 'min(预定利率, 1.75%)（修正法）' : '预定利率' + (isE3 || isCI ? '（FPT）' : ''), 1]);
    rows2.push([plJump('pl_table', '发生率表'), ((cfg.tblVer === '2010') ? '生命表2010-2013 ' : '生命表2025 ') + String(cfg.table).toUpperCase(), '按主要责任选表（金规〔2025〕21号）；2010 版按性别分表（保监发〔2016〕107号）', -1]);
    rows2.push([plJump('pl_factor', '发生率系数'), (cfg.factor * 100).toFixed(0) + '%', '报告偏离度评估区间 [−30%, +30%]', -1]);
    if (isCI) rows2.push([plJump('pl_ci_table', '重疾表 / K2'), 'CI' + String(cfg.ciTable).toUpperCase().replace('CI', '') + '(2020) × ' + (cfg.ciFactor * 100).toFixed(0) + '% / K2 × ' + (cfg.kFactor * 100).toFixed(0) + '%', '重疾表2020＋因重疾身故占比二表', -1]);
    rows2.push([plJump('pl_exp', '定价费用率 e'), '平均 ' + vlPct(vlAvgE(cfg.eP, h), 2) + '（首年 ' + vlPct(cfg.eP[1], 1) + '）', (isDiv ? '保监发〔2015〕93号上限内' : '银保监办发〔2020〕7号上限内') + '；报告§2.3 口径', -1]);
    rows2.push([plJump('pl_exp', '现价费用率 e′'), '平均 ' + vlPct(vlAvgE(cfg.eCV, h), 2) + '（首年 ' + vlPct(cfg.eCV[1], 1) + '）', '现价链法定表定值（与定价费用率分表）', -1]);
    if (isDiv) rows2.push([plJump('pl_div_istar', '红利演示利率 i*'), (cfg.div.iStar * 100).toFixed(2) + '%', '≤ 3.5%（利益演示口径），可分配 ' + (cfg.div.b * 100).toFixed(0) + '%', cfg.div.iStar <= 0.035 + 1e-9 ? 1 : 0]);
    var html = '<div class="vl-sec">三率溯源：选对了吗？（点参数名可直接跳到设置处调整）</div><div class="vl-tblwrap"><table class="vl-tbl"><tr><th>参数</th><th>当前取值</th><th>监管／报告口径</th><th>判定</th></tr>';
    for (var i = 0; i < rows2.length; i++) {
      var mark = rows2[i][3] === 1 ? '<span class="vl-ok">✓</span>' : (rows2[i][3] === 0 ? '<span class="vl-ng">✗</span>' : '<span class="vl-mid">·</span>');
      html += '<tr><td>' + rows2[i][0] + '</td><td>' + rows2[i][1] + '</td><td style="text-align:left">' + rows2[i][2] + '</td><td>' + mark + '</td></tr>';
    }
    html += '</table></div>';
    // 敏感性龙卷风
    var sens = vlSensitivity(cfg, type, GP);
    var maxAbs = 0;
    for (var j = 0; j < sens.length; j++) if (sens[j].d !== null) maxAbs = Math.max(maxAbs, Math.abs(sens[j].d));
    html += '<div class="vl-sec">敏感性分析：毛保费 GP 对三率的弹性（每情景完整重跑定价引擎）</div><div class="vl-tor"><div></div><div style="text-align:right;font-size:11px;color:#6a6156">← GP 下降</div><div style="font-size:11px;color:#6a6156">GP 上升 →</div><div></div>';
    for (var k = 0; k < sens.length; k++) {
      var r = sens[k];
      var wL = 0, wR = 0;
      if (r.d !== null && maxAbs > 0) { if (r.d < 0) wL = Math.abs(r.d) / maxAbs * 100; else wR = r.d / maxAbs * 100; }
      html += '<div title="' + r.note + '">' + r.label + '</div>' +
        '<div><div class="vl-tor-l" style="width:' + wL.toFixed(1) + '%"></div></div>' +
        '<div><div class="vl-tor-r" style="width:' + wR.toFixed(1) + '%"></div></div>' +
        '<div>' + (r.d !== null ? vlPct(r.d, 2) : '不收敛') + '</div>';
    }
    html += '</div>';
    html += '<div class="vl-tblwrap" style="margin-top:10px"><table class="vl-tbl"><tr><th>情景</th><th>重跑状态</th><th>毛保费 GP</th><th>较基准</th></tr>';
    html += '<tr><td>基准（当前参数）</td><td>—</td><td>¥ ' + plNum(GP, 2) + '</td><td>—</td></tr>';
    for (var k2 = 0; k2 < sens.length; k2++) {
      html += '<tr><td>' + sens[k2].label + '<span style="color:#8a8177;font-size:11px">（' + sens[k2].note + '）</span></td>' +
        '<td>' + (sens[k2].GP !== null ? '<span class="vl-ok">✓ 已重跑</span>' : '<span class="vl-ng">不收敛</span>') + '</td>' +
        '<td>' + (sens[k2].GP !== null ? '¥ ' + plNum(sens[k2].GP, 2) : '—') + '</td><td>' + vlPct(sens[k2].d, 2) + '</td></tr>';
    }
    html += '</table></div>';
    // 校准锚点
    html += '<div class="vl-sec">本引擎官方锚点校准状态（该产品类型）</div><div class="vl-q">' + calib + '</div>';
    html += '<div class="vl-note">研发提示：① 敏感性每一情景均调用完整定价引擎重解（迭代至收敛，非一阶近似）；「预定利率 ±0.5%」中的 +0.5% 为假设性上探，可能超过现行监管上限，仅用于弹性测度；② 现价链（GP′/PVR/年中现价）统一使用现价费用率 eCV，与定价费用率分表；③ 发生率偏离区间按报告口径 [−30%, +30%]，超出须专项论证。</div>';
    return html;
  }

  // ---- 视角三：定价方法和定价逻辑 ----
  // 一、引擎代码结构图（利率 → 换算函数 → 链路）｜二、当前产品类型的定价方程与换算函数
  // 三、本次求解轨迹（活动集 + 不动点迭代、恒等式校验）
  function vlPctPlain(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var s = (v * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }
  function vlFormulaIdOf(type) {
    if (type === 'ci') return 'pl_formula_ci';
    if (type === 'endowment3') return 'pl_formula_e3';
    if (type === 'endowment2') return 'pl_formula_endow2';
    if (type === 'endowment') return 'pl_formula_endow';
    return 'pl_formula_ann';
  }
  // 公式正文取自第七区块的静态 HTML（已收进隐藏容器 pl_formula_src），此处按产品类型取用，避免两处维护
  function vlFormulaHTML(type) {
    var el = document.getElementById(vlFormulaIdOf(type));
    if (!el) return '<div class="vl-note">（公式说明区块未载入：请在定价实验室页面内打开）</div>';
    return el.innerHTML;
  }
  // 引擎代码结构图：dual = 双口径现价（cP/c1/c2）；否则单口径（cP/cV）
  function vlEngineSVG(cfg, type, dual) {
    var isCI = (type === 'ci');
    var fn = isCI ? 'plCommCI' : 'plComm';
    var iT = vlPctPlain(cfg.i);
    var i1T = vlPctPlain(cfg.iCV1 != null ? cfg.iCV1 : cfg.i);
    var i2T = vlPctPlain(cfg.iCV2 != null ? cfg.iCV2 : cfg.i);
    var iCT = vlPctPlain(cfg.iCV != null ? cfg.iCV : (cfg.iCV1 != null ? cfg.iCV1 : cfg.i));
    var defs = '<defs>' +
      '<marker id="vlEA1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#b53d2e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
      '<marker id="vlEA2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#2f4d8a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
      '<marker id="vlEA3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#2f6b5a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
      '</defs>';
    function box(x, y, w, h, c, t, s) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + c.f + '" stroke="' + c.s + '" stroke-width="0.5"/>' +
        '<text x="' + (x + w / 2) + '" y="' + (y + (s ? h / 2 - 5 : h / 2)) + '" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700" fill="' + c.t + '">' + t + '</text>' +
        (s ? '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 13) + '" text-anchor="middle" dominant-baseline="central" font-size="12" fill="' + c.u + '">' + s + '</text>' : '');
    }
    var CP = { f: '#fdf1ef', s: '#b53d2e', t: '#8a2c20', u: '#b53d2e' };
    var C1 = { f: '#f3f7fc', s: '#2f4d8a', t: '#2f4d8a', u: '#2f4d8a' };
    var C2 = { f: '#f2f7f4', s: '#2f6b5a', t: '#2f6b5a', u: '#2f6b5a' };
    var svg = '<svg viewBox="0 0 680 350" width="100%" style="min-width:620px" xmlns="http://www.w3.org/2000/svg">' + defs;
    if (dual) {
      svg += box(40, 46, 180, 56, CP, '预定利息率 i', iT + ' · 费率厘定');
      svg += box(250, 46, 180, 56, C1, '现价基础 · 初期 iCV1', i1T + ' · 最低现价');
      svg += box(460, 46, 180, 56, C2, '现价基础 · 终极 iCV2', i2T + ' · 最低现价');
      svg += '<path d="M130 102 L130 138" fill="none" stroke="#b53d2e" stroke-width="1.5" marker-end="url(#vlEA1)"/>' +
        '<path d="M340 102 L340 138" fill="none" stroke="#2f4d8a" stroke-width="1.5" marker-end="url(#vlEA2)"/>' +
        '<path d="M550 102 L550 138" fill="none" stroke="#2f6b5a" stroke-width="1.5" marker-end="url(#vlEA3)"/>';
      svg += box(40, 140, 180, 44, CP, 'cP = ' + fn + '(x,T,i)', '');
      svg += box(250, 140, 180, 44, C1, 'c1 = ' + fn + '(x,T,iCV1)', '');
      svg += box(460, 140, 180, 44, C2, 'c2 = ' + fn + '(x,T,iCV2)', '');
      svg += '<path d="M130 184 L130 230" fill="none" stroke="#b53d2e" stroke-width="1.5" marker-end="url(#vlEA1)"/>' +
        '<path d="M340 184 L340 230" fill="none" stroke="#2f4d8a" stroke-width="1.5" marker-end="url(#vlEA2)"/>' +
        '<path d="M550 184 L550 230" fill="none" stroke="#2f6b5a" stroke-width="1.5" marker-end="url(#vlEA3)"/>';
      svg += box(40, 232, 180, 56, CP, '定价方程', 'A + B·GP = GP×denP → GP');
      svg += box(250, 232, 390, 56, C1, '现价链（法定最低现金价值）', '初期 / 终极 → 年度融合 → CV');
      svg += '<path d="M445 288 V310 H130 V294" fill="none" stroke="#b53d2e" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#vlEA1)"/>';
      svg += '<text x="287" y="328" text-anchor="middle" font-size="12" fill="#8a2c20">现金价值回喂定价方程 → 不动点迭代（自适应阻尼）至 GP 与 CV 同时收敛</text>';
    } else {
      svg += box(40, 46, 290, 56, CP, '预定利息率 i', iT + ' · 费率厘定');
      svg += box(350, 46, 290, 56, C2, '现价计算基础利率 iCV', iCT + ' · 最低现价');
      svg += '<path d="M185 102 L185 138" fill="none" stroke="#b53d2e" stroke-width="1.5" marker-end="url(#vlEA1)"/>' +
        '<path d="M495 102 L495 138" fill="none" stroke="#2f6b5a" stroke-width="1.5" marker-end="url(#vlEA3)"/>';
      svg += box(40, 140, 290, 44, CP, 'cP = ' + fn + '(x,T,i)', '');
      svg += box(350, 140, 290, 44, C2, 'cV = ' + fn + '(x,T,iCV)', '');
      svg += '<path d="M185 184 L185 230" fill="none" stroke="#b53d2e" stroke-width="1.5" marker-end="url(#vlEA1)"/>' +
        '<path d="M495 184 L495 230" fill="none" stroke="#2f6b5a" stroke-width="1.5" marker-end="url(#vlEA3)"/>';
      svg += box(40, 232, 290, 56, CP, '定价方程', 'A + B·GP = GP×denP → GP');
      svg += box(350, 232, 290, 56, C2, '现价链（法定最低现金价值）', 'PVR → CV = r×Max(PVR,0)');
      svg += '<path d="M495 288 V310 H185 V294" fill="none" stroke="#b53d2e" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#vlEA1)"/>';
      svg += '<text x="340" y="328" text-anchor="middle" font-size="12" fill="#8a2c20">现金价值回喂定价方程 → 不动点迭代（自适应阻尼）至 GP 与 CV 同时收敛</text>';
    }
    svg += '</svg>';
    return svg;
  }
  function vlLogic(res, cfg, type) {
    var isCI = (type === 'ci');
    var dual = !(isCI || type === 'endowment2' || type === 'endowment3');
    var html = '';
    html += '<div class="vl-sec">一、引擎代码结构：几条利率 → 几套换算函数 → 两条链路</div>';
    html += '<div class="vl-chain">' + vlEngineSVG(cfg, type, dual) + '</div>';
    html += '<div class="vl-legend">' +
      '<span><i style="background:#b53d2e"></i>定价链 cP（按预定利息率 i）</span>' +
      (dual ? '<span><i style="background:#2f4d8a"></i>现价链 c1（初期）</span><span><i style="background:#2f6b5a"></i>现价链 c2（终极）</span>'
        : '<span><i style="background:#2f6b5a"></i>现价链 cV（单口径）</span>') +
      '<span><i style="background:#b53d2e;opacity:.45"></i>虚线：现金价值回喂定价方程</span>' +
      '</div>';
    html += '<div class="vl-q"><span class="q">为什么要分成两条链？</span>定价链 <b>cP</b> 用<b>预定利息率 i</b> 折现，回答「保费收多少」；现价链用<b>法定加点后</b>的利率（' +
      (dual ? 'iCV1 / iCV2' : 'iCV') + '），只回答「最低现金价值不能低于多少」——加点是监管给现价的下限保护，<b>只能用于现价、不能反过来用于定价</b>。' +
      (dual ? '初期与终极两套再按年度融合成一条年末 CV。' : '本类型单口径，无初期／终极融合。') +
      '两条链的换算函数（D、C）数值不同，<b>不可混用</b>。</div>';

    html += '<div class="vl-sec">二、定价方程与换算函数（' + VL_TYPE_NAME[type] + '）</div>';
    html += '<div class="vl-formula">' + vlFormulaHTML(type) + '</div>';

    // ---- 三、本次求解轨迹 ----
    var GP = res.GP, benPV = res.benPV, denP = res.denP;
    var residEq = (benPV != null && denP != null) ? Math.abs(benPV - denP * GP) : null;
    var relEq = (residEq !== null && benPV) ? residEq / benPV : null;
    var gp1 = vlGPpOf(res);
    html += '<div class="vl-sec">三、本次求解轨迹（' + (isCI ? '一次线性求解，无需迭代' : '活动集线性求解 + 不动点迭代') + '）</div>';
    html += '<div class="vl-kpis">' +
      '<div class="vl-kpi"><span class="k">毛保费 GP</span><span class="v">¥ ' + plNum(GP, 2) + '</span><span class="s">最终收敛解</span></div>' +
      '<div class="vl-kpi"><span class="k">' + (isCI ? '求解方式' : '迭代轮数') + '</span><span class="v">' + (isCI ? '一次求解' : (res.iter != null ? res.iter + ' 轮' : '—')) + '</span><span class="s">' + (isCI ? '首年给付含 GP，移项即得' : (res.resid != null ? '残差 ' + res.resid.toExponential(1) : '')) + '</span></div>' +
      '<div class="vl-kpi"><span class="k">给付现值 A + B·GP</span><span class="v">¥ ' + plNum(benPV, 2) + '</span><span class="s">等价原则左端</span></div>' +
      '<div class="vl-kpi"><span class="k">净保费现值 GP×denP</span><span class="v">¥ ' + plNum(denP * GP, 2) + '</span><span class="s">等价原则右端</span></div>' +
      '<div class="vl-kpi"><span class="k">恒等式残差</span><span class="v">' + (relEq !== null ? relEq.toExponential(1) : '—') + '</span><span class="s">' + (relEq !== null ? (relEq < 1e-8 ? '<span class="vl-ok">严格成立</span>' : '<span class="vl-ng">需核查</span>') : '') + '</span></div>' +
      '<div class="vl-kpi"><span class="k">现价基础毛保费 GP′</span><span class="v">¥ ' + plNum(gp1, 2) + '</span><span class="s">' + (dual ? '初期 ' + vlPctPlain(cfg.iCV1) + '（终极 ¥ ' + (res.GPp2 != null ? plNum(res.GPp2, 2) : '—') + '）' : vlPctPlain(cfg.iCV != null ? cfg.iCV : cfg.iCV1) + ' 单口径') + '</span></div>' +
      '</div>';
    html += '<div class="vl-q"><span class="q">四步看懂这一笔 GP 是怎么算出来的</span>' +
      '① <b>生成换算函数</b>：按上图的利率各生成一套 D/C（生存与死亡折现因子）；<br>' +
      '② <b>拆成 A + B·GP</b>：把全部给付现值拆成「与保费无关的定额项 A」＋「随保费放大的一次项 B·GP」——身故金取 Max(累计保费, 现价) 的年度集合由上一轮 GP 决定，这个集合叫<b>活动集</b>；<br>' +
      '③ <b>一次线性求解</b>：GP = A ÷ (denP − B)，denP = Σ<sub>t=1..h</sub> D<sub>t−1</sub>·(1−e<sub>t</sub>)；<br>' +
      '④ <b>回喂再迭代</b>：用新 GP 重跑现价链得到 CV → 回到 ②，直到 GP 与 CV 同时收敛（自适应阻尼，残差见上）。' +
      (isCI ? '<br><b>本险种例外</b>：首年给付 = 0.75×保额 + 0.25×GP，GP 只出现在分母侧一次，移项即可直接求解，无需迭代。' : '') +
      '</div>';
    html += '<div class="vl-note">口径提示：现价链（GP′ / PVR / 年中现价）统一使用现价费用率 eCV，与定价费用率 eP 分表；法定准备金另按评估利率（' +
      vlPctPlain(vlIevalOf(res, cfg)) + '）与评估发生率计算，是第三条独立的换算链。图中数字为本次计算实际取值，随参数联动。</div>';
    return html;
  }

  // ---- 视图装配与 Tab ----
  function plViewHTML(kind, res, cfg, type, noBtn) {
    var titles = { cust: '一页纸利益亮点卡', act: '参数溯源与敏感性测试', logic: '定价方法和定价逻辑' };
    var subs = { cust: '交多少 · 领多少 · 退保拿多少 · 保障多少', act: '三率选对了吗 · 和官方锚点差多少 · 弹性有多大', logic: '几条利率链 · 怎么迭代 · 这一笔 GP 怎么收敛' };
    var meta = VL_TYPE_NAME[type] + ' · ' + cfg.x + '岁' + vlG(cfg) + (cfg.h === 1 ? ' 趸交' : ' · ' + cfg.h + '年交') + ' · 保险期间 ' + res.T + ' 年 · 基本保额 ' + plNum(cfg.SA, 0) + ' 元';
    var frag = (kind === 'act') ? vlAct(res, cfg, type) : (kind === 'logic') ? vlLogic(res, cfg, type) : vlCust(res, cfg, type);
    return '<div class="vl vl-' + kind + '"><div class="vl-head"><div><div class="vl-title">' + titles[kind] + ' · ' + subs[kind] + '</div><div class="vl-sub">' + meta + '</div></div>' +
      (noBtn ? '' : '<button class="vl-xbtn" onclick="plExportView(\'' + kind + '\')">单页导出 / 打印</button>') +
      '</div><div class="vl-body">' + frag + '</div></div>';
  }
  var vlActive = 'cust';
  function plRenderViews() {
    var body = document.getElementById('pl_view_body');
    if (!body) return;
    if (!window.__plLast) {
      body.innerHTML = '<div class="note rule"><b>等待计算</b>：先在第三区块完成定价，点击「开始定价计算」后，此处将按当前结果生成两个视角的透视页。</div>';
      return;
    }
    var L = window.__plLast;
    try {
      body.innerHTML = plViewHTML(vlActive, L.res, L.cfg, L.type, false);
    } catch (e) {
      body.innerHTML = '<div class="note rule"><b>视图生成失败</b>：' + (e && e.message ? e.message : e) + '</div>';
    }
  }
  (function () {
    var tabs = document.getElementById('pl_view_tabs');
    if (!tabs) return;
    var bs = tabs.getElementsByTagName('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].addEventListener('click', function () {
        vlActive = this.getAttribute('data-v');
        var bs2 = document.getElementById('pl_view_tabs').getElementsByTagName('button');
        for (var j = 0; j < bs2.length; j++) bs2[j].className = 'pl-tab' + (bs2[j].getAttribute('data-v') === vlActive ? ' active' : '');
        plRenderViews();
      });
    }
  })();
  // 对外暴露：客户视角收益三项与演示层（仅供回归校核脚本复算，页面运行无副作用）
  window.plExitVal = plExitVal;
  window.plBenInflowAt = plBenInflowAt;
  window.plRetRow = plRetRow;
  window.plBenDemoRows = plBenDemoRows;
  window.plRenderBenAnnuity = plRenderBenAnnuity;
  window.plRenderBenEndow = plRenderBenEndow;
  window.plRenderBenPlainEndow = plRenderBenPlainEndow;
  window.illCI = illCI;
  window.vlDerived = vlDerived;
  window.vlLogic = vlLogic;
  window.vlEngineSVG = vlEngineSVG;
  window.vlFormulaHTML = vlFormulaHTML;
  // 参数溯源跳转：滚动到对应设置位并高亮（三率溯源表「去调整」链接用）
  window.plJumpParam = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
    var old = el.style.boxShadow, oldBg = el.style.background;
    el.style.boxShadow = '0 0 0 3px rgba(181,61,46,.5)';
    if (el.tagName === 'DIV') el.style.background = '#fdf6f4';
    setTimeout(function () { el.style.boxShadow = old; el.style.background = oldBg; }, 1800);
    try { el.focus(); } catch (e2) { }
  };
  // 单页导出：当前视角独立成页（自含样式，可打印、可转发）
  window.plExportView = function (kind) {
    if (!window.__plLast) { alert('请先完成定价计算，再导出视角页。'); return; }
    var L = window.__plLast;
    var titles = { cust: '一页纸利益亮点卡（客户与销售版）', act: '参数溯源与敏感性测试（精算研发版）', logic: '定价方法和定价逻辑（引擎结构 · 公式 · 求解轨迹）' };
    var frag = plViewHTML(kind, L.res, L.cfg, L.type, true);
    var doc = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + (titles[kind] || '双视角透视') + ' · 西红精算定价实验室</title>' +
      '<style>body{margin:0;background:#f6f3ec;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#24292f}' +
      '.vl-doc{max-width:960px;margin:0 auto;padding:26px 18px 40px}' +
      '.vl-doc-head{border-bottom:3px solid #b53d2e;padding-bottom:12px;margin-bottom:14px}' +
      '.vl-doc-head h1{margin:0;font-size:21px;color:#b53d2e}' +
      '.vl-doc-head p{margin:6px 0 0;font-size:12.5px;color:#6a6156}' +
      '.vl-doc-foot{margin-top:18px;font-size:12px;color:#8a8177;border-top:1px solid #e3ddd3;padding-top:12px;line-height:1.8}' +
      '@media print{.vl-doc{max-width:none;padding:0}body{background:#fff}}' +
      VL_CSS + '</style></head><body><div class="vl-doc">' +
      '<div class="vl-doc-head"><h1>' + (titles[kind] || '') + '</h1><p>西红精算 · 定价实验室双视角透视 · 按导出时当前计算结果生成</p></div>' +
      frag +
      '<div class="vl-doc-foot">数值口径：公式法定价演示——现金价值为保单年度末最低现金价值口径；红利为中档演示（利率不超 3.5%、可分配比例按精算报告口径）、非保证；三项收益率按客户视角的保证利益现金流测算（总收益率 / 年化单利 / 年化复利 IRR），不含红利与身故给付。本页由定价实验室自动生成，不构成保险合同条款或正式报价。<br>🍅 西红精算 · 保险产品精算AI助手（产品开发篇）</div>' +
      '</div></body></html>';
    var blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var w = window.open(url, '_blank');
    if (!w) alert('浏览器拦截了新窗口，请允许弹出窗口后重试（导出页可直接 Ctrl+P 打印或另存）。');
  };

  // 复选框联动（仅完整展开开关；分红型/疾病保险的展示选项已下沉为自动判定）
  var plBenFullEl = document.getElementById('pl_ben_full');
  if (plBenFullEl) plBenFullEl.addEventListener('change', plRenderBenDemo);
});
