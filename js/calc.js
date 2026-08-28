/* ============================================================
   西红精算 · 保险产品精算AI助手（产品开发篇·详细版）
   严格监管口径演算器  ——  js/calc.js
   说明：所有函数读取对应页面 input 的 id，计算后写入 out 元素。
   红线：本站不出现任何具体保险公司名称；公式口径均标注制度出处。
   ============================================================ */

/* ---------- 工具函数 ---------- */
function f(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  var v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}
function pct(x, d) {
  if (d === undefined) d = 3;
  var s = (x * 100).toFixed(d);
  s = s.replace(/\.?0+$/, '');
  return s + '%';
}
function num(x, d) {
  if (d === undefined) d = 2;
  return Number(x).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function money(x) {
  return '¥' + num(x, 2);
}

/* ============================================================
   一、核心高频口径（calculators.html 演算器中心）
   ============================================================ */

/* 1. 利差 = 投资收益率 − 预定利率 */
function calcSpread() {
  var r = f('sp_r'), i = f('sp_i');
  var s = r - i;
  var out = document.getElementById('sp_out');
  if (s < 0) {
    out.innerHTML = '利差 = ' + pct(r) + ' − ' + pct(i) + ' = <b>' + pct(s) +
      '</b><br><span class="calc-note">已出现<b>利差损</b>：投资收益率低于预定利率，存量账户需动用准备金的利息收入弥补，新增业务须下调预定利率或控制演示水平。</span>';
  } else {
    out.innerHTML = '利差 = 投资收益率 − 预定利率 = ' + pct(r) + ' − ' + pct(i) + ' = <b>' + pct(s) + '</b>';
  }
}

/* 2. 初始 CSM = 保费现值 − 赔付现值 − 费用现值 − 风险调整
       （IFRS17 / 新准则口径；为负则计为 LIC 亏损成分） */
function calcCSM() {
  var pvp = f('csm_pvp'), pvc = f('csm_pvc'), pve = f('csm_pve'), ra = f('csm_ra');
  var csm = pvp - Math.abs(pvc) - Math.abs(pve) - Math.abs(ra);
  var out = document.getElementById('csm_out');
  if (csm < 0) {
    out.innerHTML = '初始 CSM = ' + num(pvp) + ' − ' + num(pvc) + ' − ' + num(pve) + ' − ' + num(ra) +
      ' = <b>' + num(csm) + '</b><br><span class="calc-note">CSM 为负 → 计入<b>亏损成分 LIC</b>（Liability for Remaining Coverage 的减项），于亏损发生时即刻确认损益，不得递延。</span>';
  } else {
    out.innerHTML = '初始 CSM = 保费现值 − 赔付现值 − 费用现值 − 风险调整 = <b>' + num(csm) + '</b>';
  }
}

/* 3. 偿付能力充足率：核心 = 核心资本/最低资本；综合 = 实际资本/最低资本
       红线：核心 ≥ 50% ，综合 ≥ 100% （偿二代 C-ROSS II） */
function calcSolvency() {
  var cc = f('sol_cc'), tc = f('sol_tc'), mcr = f('sol_mcr');
  var core = cc / mcr, total = tc / mcr;
  var out = document.getElementById('sol_out');
  var coreFlag = core >= 0.5 ? '✅ 达标' : '⚠️ 不达标（核心 ≥ 50%）';
  var totalFlag = total >= 1.0 ? '✅ 达标' : '⚠️ 不达标（综合 ≥ 100%）';
  out.innerHTML = '核心偿付能力充足率 = 核心资本 / 最低资本 = <b>' + pct(core) + '</b> ' + coreFlag +
    '<br>综合偿付能力充足率 = 实际资本 / 最低资本 = <b>' + pct(total) + '</b> ' + totalFlag +
    '<br><span class="calc-note">口径：偿二代（C-ROSS II）二期。最低资本取寿险/重疾/意外等基础因子与压力情景之较大者。</span>';
}

/* 4. 红利上限（演示）= (V₀ + P) × 利差 × 保单持有人分配比例
       出处：银保监办发〔2020〕6号 修订《分红保险精算规定》——红利演示利差约束；
       保单持有人分配比例不低于可分配盈余的 70%（《分红保险精算规定》）。
       覆盖率 < 100% 时，演示红利须相应下调（覆盖率见 calcCov）。 */
function calcDividend() {
  var v0 = f('dv_v0'), p = f('dv_p'), r = f('dv_r'), i = f('dv_i'), ratio = f('dv_ratio');
  var spread = r - i;
  var out = document.getElementById('dv_out');
  if (spread <= 0) {
    out.innerHTML = '利差 = ' + pct(spread) + ' ≤ 0，演示红利应为 <b>0</b>（利差损情形下不得演示正红利）。';
    return;
  }
  var cap = (v0 + p) * spread * (ratio / 100);
  out.innerHTML = '演示红利上限 = (V₀ + P) × 利差 × 分配比例 = (' + num(v0) + ' + ' + num(p) + ') × ' +
    pct(spread) + ' × ' + pct(ratio / 100) + ' = <b>' + num(cap) + '</b>' +
    '<br><span class="calc-note">V₀=期初准备金，P=当期保费；利差=投资收益率−预定利率。' +
    '当责任准备金覆盖率&lt;100% 时，演示红利须按覆盖率同向下调（银保监办发〔2020〕6号）。</span>';
}

/* 5. 责任准备金覆盖率 = (资产 − 其他负债 + 费用调整项) / 责任准备金
       出处：银保监办发〔2020〕6号；覆盖率 < 1 触发分红水平核查与下调。 */
function calcCov() {
  var a = f('cov_a'), l = f('cov_l'), adj = f('cov_adj'), r = f('cov_r');
  var cov = (a - l + adj) / r;
  var out = document.getElementById('cov_out');
  var flag = cov >= 1 ? '✅ 覆盖率充足' : '⚠️ 覆盖率 &lt; 100%，分红水平须下调并核查';
  out.innerHTML = '责任准备金覆盖率 = (资产 − 其他负债 + 费用调整项) / 责任准备金 = ' +
    '(' + num(a) + ' − ' + num(l) + ' + ' + num(adj) + ') / ' + num(r) + ' = <b>' + pct(cov) + '</b> ' + flag +
    '<br><span class="calc-note">出处：银保监办发〔2020〕6号《关于强化人身保险精算监管有关事项的通知》。</span>';
}

/* 6. 分红利益演示两档利差（保证 / 红利）
       出处：银保监规〔2022〕24号——取消低/中/高三档，改为保证+红利两档；
       红利演示利差 ≤ min(0, 4.5% − 预定利率) 即分别 0 与 4.5% − 预定利率。 */
function calcDemo() {
  var i = f('dm_i');
  var g = 0;
  var hl = (0.045 - i); // 红利档演示利差上限 = 4.5% - 预定利率（银保监规〔2022〕24号）
  var out = document.getElementById('dm_out');
  out.innerHTML = '保证利益演示利差 = <b>' + pct(g) + '</b><br>' +
    '红利利益演示利差（上限） = 4.5% − 预定利率 = 4.5% − ' + pct(i) + ' = <b>' + pct(hl) + '</b>' +
    '<br><span class="calc-note">出处：银保监规〔2022〕24号。原 93 号低/中/高三档（0 / 4.5%−i / 6%−i）已被本两档口径替代。</span>';
}

/* ============================================================
   二、公式 + 计算实战（formula-*.html）
   ============================================================ */

/* 7. 定价：年净保费 P = 给付现值 / 年金现值因子；毛保费 G = P / (1 − 费用率)
       口径：净保费等价原则（均衡净保费法）。 */
function calcPricing() {
  var a = f('pr_a'), ann = f('pr_ann'), fee = f('pr_fee');
  var P = a / ann;
  var G = P / (1 - fee / 100);
  var out = document.getElementById('pr_out');
  out.innerHTML = '年净保费 P = 给付现值 / 年金现值因子 = ' + num(a) + ' / ' + num(ann) + ' = <b>' + num(P) + '</b>' +
    '<br>毛保费 G = P / (1 − 费用率) = ' + num(P) + ' / (1 − ' + pct(fee / 100) + ') = <b>' + num(G) + '</b>' +
    '<br><span class="calc-note">净保费等价原则：毛保费在扣除费用后，其现值等于未来给付现值。费用率含获取+维持费用。</span>';
}

/* 8. 现金价值最低系数（76号文附件）
       r = k% + t × (100% − k%) / min(20, n)   （t < min(20,n) 时）；否则 r = 100%
       k：期交个人两全/年金 90、个人终身 80、团体两全/年金 95、团体终身/定期 85、趸交 100。
       最低现金价值 MCV = r × 单位准备金（或 r × 毛保费累积）。 */
function calcCV() {
  var type = document.getElementById('cv_type').value;
  var kMap = { 'whole': 80, 'endow_ann': 90, 'group_whole': 85, 'group_endow_ann': 95, 'single': 100 };
  var k = kMap[type];
  var t = f('cv_t'), n = f('cv_n'), pvr = f('cv_pvr');
  var m = Math.min(20, n);
  var r;
  if (t < m) {
    r = (k + t * (100 - k) / m) / 100;
  } else {
    r = 1;
  }
  var mcv = r * pvr;
  var out = document.getElementById('cv_out');
  out.innerHTML = '最低系数 r = ' + (k) + '% + ' + t + ' × (' + (100 - k) + '%) / min(20, ' + n + ') = <b>' + pct(r) + '</b>' +
    '<br>最低现金价值 MCV = r × 准备金 = ' + pct(r) + ' × ' + num(pvr) + ' = <b>' + num(mcv) + '</b>' +
    '<br><span class="calc-note">出处：保监发〔2016〕76号《关于进一步完善人身保险精算制度有关事项的通知》附件。' +
    'k 取值：个人终身80 / 个人两全·年金90 / 团体终身·定期85 / 团体两全·年金95 / 趸交100（%）。</span>';
}

/* 9. 法定准备金（未来法·修正均衡净保费制）
       tV = 未来给付现值 − 修正净保费 × 修正净保费年金现值因子
       评估利率取定价利率与法定评估利率之孰低；修正制下首年费用超支以未来保费递补。 */
function calcReserve() {
  var fb = f('rs_fb'), prem = f('rs_prem'), annr = f('rs_annr');
  var tv = fb - prem * annr;
  var out = document.getElementById('rs_out');
  out.innerHTML = 'tV = 未来给付现值 − 修正净保费 × 修正净保费年金现值因子 = ' + num(fb) + ' − ' + num(prem) + ' × ' + num(annr) +
    ' = <b>' + num(tv) + '</b>' +
    '<br><span class="calc-note">口径：法定准备金未来法（修正均衡净保费制）。评估利率取定价利率与法定评估利率孰低；' +
    '修正制用于吸收首年获取费用超支，使初期准备金不低于法定下限。</span>';
}

/* 10. 新业务价值 NBV（简化口径）
       VNB = 首年保费 × (1 − 佣金率 − 维持费用率 − 赔付率 − 资本成本率) / (1 + 折现率)
       严格口径应折现各年自由盈余（VIF），此处为单年近似，用于快速排序。 */
function calcNBV() {
  var wp = f('nb_wp'), comm = f('nb_comm'), maint = f('nb_maint'), claim = f('nb_claim'), cap = f('nb_cap'), disc = f('nb_disc');
  var margin = 1 - comm / 100 - maint / 100 - claim / 100 - cap / 100;
  var vnb = wp * margin / (1 + disc / 100);
  var out = document.getElementById('nb_out');
  if (margin <= 0) {
    out.innerHTML = '首年利差/费差边际 = ' + pct(margin) + ' ≤ 0，<b>该业务新业务价值为负</b>，不应作为价值型业务入围。';
    return;
  }
  out.innerHTML = 'VNB = 首年保费 × (1 − 佣金率 − 维持费用率 − 赔付率 − 资本成本率) / (1 + 折现率)<br>= ' +
    num(wp) + ' × ' + pct(margin) + ' / (1 + ' + pct(disc / 100) + ') = <b>' + num(vnb) + '</b>' +
    '<br><span class="calc-note">简化近似：严格 NBV 应折现各年自由盈余（VIF）+ 调整净资产收益。用于产品价值快速排序。</span>';
}
