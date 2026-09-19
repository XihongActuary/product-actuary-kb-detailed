// ===== 定价实验室 → 报告/上市两页 数据联动（pl-link.js）=====
// 定价实验室每次计算成功后，把结果快照写入 localStorage（键 plLastSnapshot）；
// 「产品开发需求及评估报告」「产品上线和上市」两页下篇加载时读取快照，
// 自动渲染「当前联动产品」的具体形态参数、定价三参数、毛保费、现价回本与利益数据。
// 无快照时回退为通用指导模式（引导先去定价实验室完成计算）。
(function () {
  'use strict';
  var KEY = 'plLastSnapshot';

  var TYPE_NAMES = {
    annuity: '年金保险（养老类业务）',
    annuity_immediate: '年金保险（即期年金）',
    endowment: '两全保险（分红型）· 长期',
    endowment2: '两全保险（分红型）· 中短期',
    endowment3: '两全保险（普通型）',
    ci: '疾病保险 · 重大疾病保险'
  };
  var TAB_NAMES = {
    cl1: 'CL1 养老类业务表', cl2: 'CL2 非养老类业务一表', cl3: 'CL3 非养老类业务二表', cl4: 'CL4 单一生命体表',
    ci4: '重疾表2020 CI4（28病种·2020版定义）', ci3: '重疾表2020 CI3（6病种·2020版定义）',
    ci2: '重疾表2020 CI2（25病种·2007版定义）', ci1: '重疾表2020 CI1（6病种·2007版定义）'
  };

  function isCI(t) { return t === 'ci'; }
  function isEndow(t) { return t === 'endowment' || t === 'endowment2' || t === 'endowment3'; }
  function isAnn(t) { return t === 'annuity' || t === 'annuity_immediate'; }
  function isDiv(t) { return t === 'endowment' || t === 'endowment2'; }

  // ---- 存取 ----
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function get() {
    var s = store(); if (!s) return null;
    try { var raw = s.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save(snap) { var s = store(); if (!s) return; try { s.setItem(KEY, JSON.stringify(snap)); } catch (e) {} }
  function clear() { var s = store(); if (!s) return; try { s.removeItem(KEY); } catch (e) {} }

  // ---- 快照构造（定价实验室计算成功后调用）----
  function snapshot(type, cfg, res) {
    var rows = [];
    for (var i = 0; i < res.rows.length; i++) {
      var w = res.rows[i];
      rows.push({
        t: w.t, age: w.age, CV: (w.CV || 0),
        cumPrem: (w.cumPrem != null ? w.cumPrem : res.GP * Math.min(w.t, cfg.h)),
        DB: (w.DB != null ? w.DB : null), DD: (w.DD != null ? w.DD : null), mat: (w.mat || 0)
      });
    }
    return {
      v: 1, at: Date.now(), type: type,
      cfg: {
        x: cfg.x, gender: cfg.gender, h: cfg.h, SA: cfg.SA,
        table: cfg.table, tblVer: cfg.tblVer, factor: cfg.factor,
        i: cfg.i, iCV: (cfg.iCV != null ? cfg.iCV : cfg.iCV1), iCV1: cfg.iCV1, iCV2: cfg.iCV2,
        eP: cfg.eP, eCV: cfg.eCV, termAge: cfg.termAge, T: res.T,
        ciTable: cfg.ciTable, ciFactor: cfg.ciFactor,
        care: cfg.care, ann: cfg.ann, mat: cfg.mat, death: cfg.death, div: cfg.div,
        dd: cfg.dd, db: cfg.db, wait: cfg.wait, single: cfg.single
      },
      res: {
        GP: res.GP, T: res.T, rows: rows, divRows: res.divRows || null,
        careAmt: res.careAmt, annAmt: res.annAmt, matAmt: res.matAmt,
        // opt 结构引擎扩展字段（渲染层不再回读 cfg.care.year / cfg.ann.start 旧字段；旧快照缺失时由 *Of 助手回退）
        careYear: res.careYear, careOn: res.careOn, careOpt: res.careOpt,
        annStart: res.annStart, annOn: res.annOn, annOpt: res.annOpt, annCnt: res.annCnt,
        survAmt0: (res.survAmt ? res.survAmt[0] : null),
        deathOpt: res.deathOpt, deathSplit: res.deathSplit, deathBefore: res.deathBefore, deathAfter: res.deathAfter, deathOn: res.deathOn,
        matOn: res.matOn,
        iEval: res.iEval, R: res.R, single: res.single
      }
    };
  }

  // ---- 年金责任参数助手（优先 res 扩展字段；旧结构快照回退 cfg 旧字段）----
  function careYearOf(snap) {
    var r = snap.res || {};
    if (r.careYear != null) return r.careYear;
    return (snap.cfg.care && snap.cfg.care.year != null) ? snap.cfg.care.year : null;
  }
  function annStartOf(snap) {
    var r = snap.res || {};
    if (r.annStart != null) return r.annStart;
    if (snap.cfg.ann && snap.cfg.ann.start != null) return snap.cfg.ann.start;
    return null;
  }
  function careTxtOf(snap) {
    // 关爱金触发与比例描述（opt1 到达年龄×累计保费 / opt2 周年×基本保额；旧结构按 opt2 语义）
    var r = snap.res || {}, c = snap.cfg.care || {};
    if (r.careOpt === 'opt1') return '到达 ' + c.opt1_age + ' 周岁对应周年日（第 ' + careYearOf(snap) + ' 年度），累计已交保费 × ' + c.opt1_pct + '%';
    var p = (c.opt2_pct != null ? c.opt2_pct : c.pct);
    return '第 ' + careYearOf(snap) + ' 个保单周年日，基本保额 × ' + p + '%';
  }
  function annTxtOf(snap) {
    // 生存年金描述：opt1 按笔数分段（即期年金默认首笔签单当日即领）/ opt2 固定比例
    var r = snap.res || {}, c = snap.cfg.ann || {};
    var st = annStartOf(snap);
    if (r.annOpt === 'opt1') {
      var b1 = (c.opt1_basis1 === 'saPct') ? '基本保额' : '累计已交保费';
      var b2 = (c.opt1_basis2 === 'saPct') ? '基本保额' : '累计已交保费';
      return '第 ' + st + ' 周年起，前 ' + r.annCnt + ' 笔 = ' + b1 + ' × ' + c.opt1_pct1 + '%，之后 = ' + b2 + ' × ' + c.opt1_pct2 + '%' + (st === 0 ? '（首笔签单当日即领）' : '');
    }
    var b = (c.opt2_basis === 'saPct') ? '基本保额' : '累计已交保费';
    var p = (c.opt2_pct != null ? c.opt2_pct : c.pct);
    return '第 ' + st + ' 周年起每年，' + b + ' × ' + p + '%';
  }
  function deathTxtOf(snap) {
    // 身故金描述：opt1 保单年度两段式 / opt2 max 取大
    var r = snap.res || {}, c = snap.cfg.death || {};
    if (r.deathOpt === 'opt1' || (r.deathOpt == null && c.opt1_split != null && c.opt === 'opt1')) {
      return '累计已交保费 × ' + (r.deathBefore != null ? r.deathBefore : c.opt1_before) + '%（第 1~' + (r.deathSplit != null ? r.deathSplit : c.opt1_split) + ' 年度）/ × ' + (r.deathAfter != null ? r.deathAfter : c.opt1_after) + '%（之后年度）';
    }
    return 'max(累计已交保费, 现金价值)';
  }

  // ---- 派生量 ----
  function paybackOf(snap) {
    var rs = snap.res.rows;
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].cumPrem > 0 && rs[i].CV >= rs[i].cumPrem) return rs[i].t;
    }
    return null;
  }
  function rowAt(snap, t) { return snap.res.rows[t - 1] || null; }
  function per1000(snap) { return snap.res.GP / snap.cfg.SA * 1000; }
  // 每 10,000 元保费对应的基本保额（BSA / GP × 10,000），与 per1000 互为倒数；结果保留 4 位小数
  // GP 按引擎全精度参与计算（不截断小数位），仅结果展示取 4 位小数
  function per10000Prem(snap) {
    var g = snap.res.GP;
    if (!g) return 0;
    return Math.round(snap.cfg.SA / g * 10000 * 1e4) / 1e4;
  }
  function totalPrem(snap) { return snap.res.GP * snap.cfg.h; }

  // ---- 格式化 ----
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    d = (d == null) ? 2 : d;
    return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(x, d) { return (x == null || isNaN(x)) ? '—' : (x * 100).toFixed(d == null ? 2 : d) + '%'; }
  function timeStr(at) {
    try { return new Date(at).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return ''; }
  }
  function sexStr(g) { return g === 'f' ? '女' : '男'; }
  function hStr(snap) { return snap.cfg.h === 1 ? '趸交（1年）' : '交 ' + snap.cfg.h + ' 年'; }
  function gpStr(snap) { return snap.cfg.h === 1 ? '趸交' : '年交'; }
  function tabStr(snap) {
    if (isCI(snap.type)) return (TAB_NAMES[snap.cfg.ciTable] || snap.cfg.ciTable || '—') + ' × ' + pct(snap.cfg.ciFactor, 0) + '｜表版本 ' + (snap.cfg.tblVer || '2025');
    return (TAB_NAMES[snap.cfg.table] || snap.cfg.table || '—') + ' × ' + pct(snap.cfg.factor, 0) + '｜表版本 ' + (snap.cfg.tblVer || '2025');
  }
  function termStr(snap) {
    return '保至 ' + snap.cfg.termAge + ' 岁（共 ' + snap.res.T + ' 个保单年度）';
  }
  function pbStr(snap) {
    var pb = paybackOf(snap), last = rowAt(snap, snap.res.T);
    if (pb) return '第 ' + pb + ' 个保单年度（现价首次 ≥ 累计已交保费）';
    if (last) return '满期年度现价 ¥ ' + fmt(last.CV, 0) + (last.CV >= totalPrem(snap) ? '（满期回本）' : '（现价全程未覆盖累计保费）');
    return '—';
  }
  function ePStr(snap) {
    var e = snap.cfg.eP || [];
    var a = e[1], b = e[Math.min(2, snap.cfg.h)] != null ? e[Math.min(2, snap.cfg.h)] : e[1];
    return '首年 ' + pct(a, 1) + ' / 次年及以后 ' + pct(b, 1);
  }

  // ---- 空状态 ----
  function emptyHTML(where) {
    return '<div class="note rule"><b>未检测到定价结果</b>：' + (where || '本篇') + '当前为通用指导模式。先到<a href="pricing-lab.html">定价实验室</a>完成一次定价计算并返回本页，此处将自动带入该产品的形态参数、定价三参数、毛保费、现价回本年度与利益演示数据，无需手工誊抄。</div>';
  }

  // ---- 产品快照卡（两页共用）----
  function cardHTML(snap) {
    var r = snap.res, c = snap.cfg;
    var first = rowAt(snap, 1), last = rowAt(snap, r.T);
    var h3s = 'font-size:16px;margin:0 0 10px;color:var(--tomato-deep)';
    var html = '<div class="card" style="border:1px solid var(--tomato);box-shadow:0 2px 10px rgba(181,61,46,.10)">' +
      '<h3 style="' + h3s + '">🧮 当前联动产品 <span class="pl-pill">定价实验室 · ' + timeStr(snap.at) + '</span></h3>' +
      '<table class="tbl">' +
      '<tr><th style="width:150px">项目</th><th>取值（来自该次定价计算）</th></tr>' +
      '<tr><td><b>产品类型</b></td><td>' + (TYPE_NAMES[snap.type] || snap.type) + '</td></tr>' +
      '<tr><td><b>投保年龄 / 性别</b></td><td>' + c.x + ' 岁 / ' + sexStr(c.gender) + '｜基本保额 ¥ ' + fmt(c.SA, 0) + '</td></tr>' +
      '<tr><td><b>保险期间</b></td><td>' + termStr(snap) + '</td></tr>' +
      '<tr><td><b>交费期间</b></td><td>' + hStr(snap) + '</td></tr>' +
      '<tr><td><b>毛保费 GP</b></td><td><b>' + gpStr(snap) + ' ¥ ' + fmt(r.GP) + '</b>｜累计 ' + (c.h === 1 ? '¥ ' + fmt(r.GP) : '¥ ' + fmt(totalPrem(snap), 0) + '（' + c.h + ' 年）') + '｜千元保额比 <b>' + fmt(per1000(snap)) + '</b> 元｜每 10,000 元保费 → 基本保额 <b>' + per10000Prem(snap).toFixed(4) + '</b> 元</td></tr>' +
      '<tr><td><b>现价回本年度</b></td><td>' + pbStr(snap) + '</td></tr>';
    // 类型化利益行
    if (isAnn(snap.type)) {
      if (c.care && c.care.on) html += '<tr><td><b>关爱金</b></td><td>¥ ' + fmt(r.careAmt) + '（' + careTxtOf(snap) + '）</td></tr>';
      if (c.ann && c.ann.on) html += '<tr><td><b>生存年金</b></td><td>' + (snap.type === 'annuity_immediate' && annStartOf(snap) === 0 && r.survAmt0 ? '首笔 ¥ ' + fmt(r.survAmt0) + '（签单当日即领）｜此后 ' : '') + '¥ ' + fmt(r.annAmt) + ' / 年（' + annTxtOf(snap) + '）</td></tr>';
      if (c.mat && c.mat.on && r.matAmt > 0) html += '<tr><td><b>满期金</b></td><td>¥ ' + fmt(r.matAmt) + '（' + c.termAge + ' 岁满期，累计已交保费 × ' + c.mat.pct + '%）</td></tr>';
      if (c.death && c.death.on && last && last.DB != null) html += '<tr><td><b>身故金</b></td><td>' + deathTxtOf(snap) + '——第 ' + r.T + ' 年度演示值 ¥ ' + fmt(last.DB, 0) + '</td></tr>';
    } else if (isEndow(snap.type)) {
      if (c.mat && c.mat.on) html += '<tr><td><b>满期金</b></td><td>¥ ' + fmt(r.matAmt) + '（基本保额 × ' + c.mat.pct + '%，为累计保费的 ' + pct(r.matAmt / totalPrem(snap), 1) + '）</td></tr>';
      if (c.death && c.death.on) {
        var R = r.R || c.death;
        html += '<tr><td><b>身故金</b></td><td>max(累计保费 × R, 现金价值)，R = ' + pct(R.r1, 0) + ' / ' + pct(R.r2, 0) + ' / ' + pct(R.r3, 0) + ' 分龄档</td></tr>';
      }
      if (isDiv(snap.type) && c.div && c.div.on) html += '<tr><td><b>红利演示</b></td><td>两档口径：保证利益 + 红利利益（演示利率 ' + pct(c.div.iStar, 2) + '、可分配比例 ' + pct(c.div.b, 0) + '）——红利不确定</td></tr>';
    } else if (isCI(snap.type)) {
      var mid = rowAt(snap, Math.min(5, r.T));
      if (c.dd && c.dd.on) html += '<tr><td><b>重疾给付</b></td><td>基本保额 × ' + c.dd.pct + '%（¥ ' + fmt(c.SA * c.dd.pct / 100, 0) + '）' + (mid && mid.DD != null ? '｜第 ' + mid.t + ' 年度演示值 ¥ ' + fmt(mid.DD, 0) : '') + '</td></tr>';
      if (c.db && c.db.on) html += '<tr><td><b>身故给付</b></td><td>基本保额 × ' + c.db.pct + '%</td></tr>';
      html += '<tr><td><b>等待期</b></td><td>' + (c.wait && c.wait.on ? '90 日（定价已折算）' : '无') + '</td></tr>';
    }
    if (first) html += '<tr><td><b>现价首 / 末年度</b></td><td>第 1 年末 ¥ ' + fmt(first.CV, 0) + ' → 第 ' + r.T + ' 年末 ¥ ' + fmt(last ? last.CV : 0, 0) + '</td></tr>';
    html += '</table>' +
      '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<a class="calc-btn" style="text-decoration:none;display:inline-block;margin-top:0" href="pricing-lab.html">回定价实验室调整参数</a>' +
      '<button class="calc-btn" style="margin-top:0;background:var(--card);color:var(--tomato-deep);border:1px solid var(--tomato)" onclick="PLLink.reset()">清除联动</button>' +
      '<span style="font-size:12.5px;color:var(--ink-soft)">调整形态或参数后需重新计算，本页数值才会刷新；清除后恢复通用指导模式</span>' +
      '</div></div>';
    return html;
  }

  // ===== dev-eval：映射表落位 + 自检核对值 =====
  function devEvalMapHTML(snap) {
    var r = snap.res, c = snap.cfg;
    var pb = paybackOf(snap), first = rowAt(snap, 1), last = rowAt(snap, r.T);
    var td = 'style="font-size:14px"';
    var html = '<h3 style="font-size:16px;margin:16px 0 10px;color:var(--tomato-deep)">本产品取数落位（自动带入）</h3>' +
      '<table class="tbl">' +
      '<tr><th style="width:210px">定价实验室输出</th><th style="width:230px">本产品取值</th><th>填入报告栏目</th></tr>' +
      '<tr><td ' + td + '><b>形态参数</b>（第一区）</td><td ' + td + '>' + (TYPE_NAMES[snap.type] || snap.type) + '<br>' + termStr(snap) + '｜' + hStr(snap) + '</td><td ' + td + '>形态描述：与条款表述逐字一致</td></tr>' +
      '<tr><td ' + td + '><b>发生率表及系数</b></td><td ' + td + '>' + tabStr(snap) + '</td><td ' + td + '>形态描述 · 定价结构</td></tr>' +
      '<tr><td ' + td + '><b>定价三参数</b></td><td ' + td + '>预定利率 ' + pct(c.i) + '｜费用率 ' + ePStr(snap) + '｜现价基础利率 ' + pct(c.iCV) + '</td><td ' + td + '>定价结构说明：逐参数写依据</td></tr>' +
      '<tr><td ' + td + '><b>毛保费 / 千元保额比</b></td><td ' + td + '><b>' + gpStr(snap) + ' ¥ ' + fmt(r.GP) + '</b>｜千元保额比 ' + fmt(per1000(snap)) + ' 元</td><td ' + td + '>市场分析 · 件均保费；产品比较</td></tr>' +
      '<tr><td ' + td + '><b>每 10,000 元保费对应基本保额</b></td><td ' + td + '><b>' + per10000Prem(snap).toFixed(4) + ' 元</b>（公式 = BSA / GP × 10,000）</td><td ' + td + '>产品比较 · 性价比直观锚点</td></tr>' +
      '<tr><td ' + td + '><b>现金价值表</b></td><td ' + td + '>首年末 ¥ ' + fmt(first ? first.CV : 0, 0) + (pb ? '｜第 ' + pb + ' 年回本' : '') + '｜满期 ¥ ' + fmt(last ? last.CV : 0, 0) + '</td><td ' + td + '>产品比较；市场分析（现价 ≥ 法定最低待勾核）</td></tr>';
    var demo = '—';
    if (isAnn(snap.type)) {
      var parts = [];
      if (c.care && c.care.on) parts.push('关爱金 ¥ ' + fmt(r.careAmt));
      if (c.ann && c.ann.on) parts.push((snap.type === 'annuity_immediate' && annStartOf(snap) === 0 && r.survAmt0 ? '首笔 ¥ ' + fmt(r.survAmt0) + '（签单当日）｜年金 ¥ ' : '年金 ¥ ') + fmt(r.annAmt) + '/年');
      if (c.mat && c.mat.on && r.matAmt > 0) parts.push('满期金 ¥ ' + fmt(r.matAmt));
      demo = parts.length ? parts.join('｜') : '未勾选生存类责任';
    } else if (isEndow(snap.type)) {
      demo = (c.mat && c.mat.on ? '满期金 ¥ ' + fmt(r.matAmt) : '无满期金') + (isDiv(snap.type) && c.div && c.div.on ? '｜红利两档（i*=' + pct(c.div.iStar, 2) + '）' : '');
    } else if (isCI(snap.type)) {
      demo = (c.dd && c.dd.on ? '重疾 ¥ ' + fmt(c.SA * c.dd.pct / 100, 0) : '') + (c.db && c.db.on ? '｜身故 ¥ ' + fmt(c.SA * c.db.pct / 100, 0) : '');
    }
    html += '<tr><td ' + td + '><b>利益演示表</b></td><td ' + td + '>' + demo + '</td><td ' + td + '>市场分析 · 产品卖点（每条卖点指到具体年度金额）</td></tr>' +
      '<tr><td ' + td + '><b>四视角（销售/客户）</b></td><td ' + td + '>件均保费 ¥ ' + fmt(r.GP) + (pb ? '｜现价回本第 ' + pb + ' 年' : '') + '</td><td ' + td + '>卖点分析（客户、业务员两视角）</td></tr>' +
      '<tr><td ' + td + '><b>四视角（管理层/精算）</b></td><td ' + td + '>评估利率 ' + pct(r.iEval != null ? r.iEval : c.i) + (r.rows ? '｜年度明细 ' + r.rows.length + ' 行已生成' : '') + '</td><td ' + td + '>重大保险风险测试；盈利性结论</td></tr>' +
      '</table>';
    return html;
  }

  function devEvalCheckHTML(snap) {
    var r = snap.res, pb = paybackOf(snap), last = rowAt(snap, r.T);
    return '<div class="note rule" style="margin-top:12px"><b>本产品核对值（提交前逐项对照）</b>：GP ' + gpStr(snap) + ' ¥ ' + fmt(r.GP) + '｜千元保额比 ' + fmt(per1000(snap)) + ' 元｜每 10,000 元保费 → 基本保额 ' + per10000Prem(snap).toFixed(4) + ' 元｜现价回本 ' + (pb ? '第 ' + pb + ' 年' : '未回本') + '｜满期年度现价 ¥ ' + fmt(last ? last.CV : 0, 0) + (r.matAmt ? '｜满期金 ¥ ' + fmt(r.matAmt) : '') + '——报告中任何数值与此不一致，先回定价实验室核对。</div>';
  }

  // ===== launch：三节取数 =====
  function launchPromoHTML(snap) {
    var r = snap.res, c = snap.cfg;
    var pb = paybackOf(snap), first = rowAt(snap, 1), last = rowAt(snap, r.T);
    var li = 'style="font-size:14.5px;margin:4px 0"';
    var html = '<h3 style="font-size:16px;margin:14px 0 10px;color:var(--tomato-deep)">本产品亮点候选（自动带入，须过合规红线后再上彩页）</h3><ul style="padding-left:20px">';
    if (isAnn(snap.type)) {
      if (c.ann && c.ann.on) html += '<li ' + li + '><b>确定现金流</b>：' + (snap.type === 'annuity_immediate' && annStartOf(snap) === 0 && r.survAmt0 ? '签单当日先领 <b>¥ ' + fmt(r.survAmt0) + '</b>，此后每年 <b>¥ ' + fmt(r.annAmt) + '</b>' : '第 ' + annStartOf(snap) + ' 个保单周年起每年领取 <b>¥ ' + fmt(r.annAmt) + '</b>') + '，写进合同、领至满期。</li>';
      if (c.care && c.care.on) html += '<li ' + li + '><b>关爱金</b>：' + careTxtOf(snap) + '，一次性给付 <b>¥ ' + fmt(r.careAmt) + '</b>。</li>';
      if (c.mat && c.mat.on && r.matAmt > 0) html += '<li ' + li + '><b>满期金</b>：' + c.termAge + ' 岁满期给付 <b>¥ ' + fmt(r.matAmt) + '</b>。</li>';
      if (c.death && c.death.on) html += '<li ' + li + '><b>身故兜底</b>：' + deathTxtOf(snap) + (r.deathOpt === 'opt1' ? '——前 ' + (r.deathSplit || c.death.opt1_split) + ' 个年度内身故不损失已交保费' : '——领取前身故不损失已交保费') + '。</li>';
    } else if (isEndow(snap.type)) {
      if (c.mat && c.mat.on) html += '<li ' + li + '><b>满期给付</b>：满期金 <b>¥ ' + fmt(r.matAmt) + '</b> = 累计保费的 <b>' + pct(r.matAmt / totalPrem(snap), 1) + '</b>。</li>';
      if (c.death && c.death.on) {
        var R = r.R || c.death;
        html += '<li ' + li + '><b>双兜底</b>：身故金 = max(累计保费 × R, 现价)，R 分龄档 ' + pct(R.r1, 0) + ' / ' + pct(R.r2, 0) + ' / ' + pct(R.r3, 0) + '。</li>';
      }
      if (isDiv(snap.type) && c.div && c.div.on) html += '<li ' + li + '><b>分红参与</b>：红利利益按两档演示（保证利益 + 红利利益，i* = ' + pct(c.div.iStar, 2) + '）——<b>红利不确定提示必须与亮点同版面出现</b>。</li>';
    } else if (isCI(snap.type)) {
      if (c.dd && c.dd.on) html += '<li ' + li + '><b>重疾给付</b>：基本保额 × ' + c.dd.pct + '%（<b>¥ ' + fmt(c.SA * c.dd.pct / 100, 0) + '</b>），等待期后非意外病因即可申请。</li>';
      if (c.db && c.db.on) html += '<li ' + li + '><b>身故给付</b>：基本保额 × ' + c.db.pct + '%（¥ ' + fmt(c.SA * c.db.pct / 100, 0) + '）。</li>';
      html += '<li ' + li + '><b>用确定的小钱换不确定的大钱</b>：' + c.x + ' 岁' + sexStr(c.gender) + gpStr(snap) + '仅 ¥ ' + fmt(r.GP) + (c.h > 1 ? ' × ' + c.h + ' 年' : '') + '。</li>';
      if (c.wait && c.wait.on) html += '<li ' + li + '><b>等待期</b>：90 日——彩页须显著提示，不得写成「即时生效」。</li>';
    }
    if (pb) html += '<li ' + li + '><b>现价走势须完整展示</b>：第 1 年末现价仅 ¥ ' + fmt(first ? first.CV : 0, 0) + '（低于已交保费），第 ' + pb + ' 年才回本——只展示高点年度、隐去前期低现价是宣传红线。</li>';
    html += '</ul>';
    return html;
  }

  function launchTrainHTML(snap) {
    var r = snap.res, c = snap.cfg;
    var pb = paybackOf(snap), first = rowAt(snap, 1), pbRow = pb ? rowAt(snap, pb) : null, last = rowAt(snap, r.T);
    var td = 'style="font-size:14px"';
    var loss = first ? (first.cumPrem - first.CV) : 0;
    var html = '<h3 style="font-size:16px;margin:14px 0 10px;color:var(--tomato-deep)">本产品培训必讲数字（自动带入，课件 / 行销辅助品 / 计划书三处同源）</h3>' +
      '<table class="tbl"><tr><th style="width:170px">必讲项</th><th>本产品数值</th></tr>' +
      '<tr><td ' + td + '><b>保费口径</b></td><td ' + td + '>' + gpStr(snap) + ' ¥ ' + fmt(r.GP) + (c.h > 1 ? ' × ' + c.h + ' 年，累计 ¥ ' + fmt(totalPrem(snap), 0) : '') + '——课件、计划书费率与此一致</td></tr>' +
      '<tr><td ' + td + '><b>每 10,000 元保费 → 基本保额</b></td><td ' + td + '><b>' + per10000Prem(snap).toFixed(4) + ' 元</b>（公式 = BSA / GP × 10,000）——课件常用「千元保额比」时，请同时讲这个值</td></tr>' +
      (first ? '<tr><td ' + td + '><b>犹豫期后退保损失</b></td><td ' + td + '>第 1 年末退保得现价 ¥ ' + fmt(first.CV, 0) + '，较累计保费少 ¥ ' + fmt(Math.max(0, loss), 0) + '——必讲项，不得放小字</td></tr>' : '') +
      '<tr><td ' + td + '><b>现价回本</b></td><td ' + td + '>' + (pb && pbRow ? '第 ' + pb + ' 年末现价 ¥ ' + fmt(pbRow.CV, 0) + ' ≥ 累计保费 ¥ ' + fmt(pbRow.cumPrem, 0) : '现价全程未覆盖累计保费（如实讲）') + '</td></tr>';
    if (isAnn(snap.type)) {
      if (c.ann && c.ann.on) html += '<tr><td ' + td + '><b>领取演示</b></td><td ' + td + '>' + (snap.type === 'annuity_immediate' && annStartOf(snap) === 0 && r.survAmt0 ? '签单当日领 ¥ ' + fmt(r.survAmt0) + '，此后每年 ¥ ' + fmt(r.annAmt) : '第 ' + annStartOf(snap) + ' 周年起每年 ¥ ' + fmt(r.annAmt)) + (c.mat && c.mat.on && r.matAmt > 0 ? '；' + c.termAge + ' 岁满期再领 ¥ ' + fmt(r.matAmt) : '') + '</td></tr>';
    } else if (isEndow(snap.type)) {
      if (c.mat && c.mat.on) html += '<tr><td ' + td + '><b>满期演示</b></td><td ' + td + '>满期金 ¥ ' + fmt(r.matAmt) + '（累计保费的 ' + pct(r.matAmt / totalPrem(snap), 1) + '）' + (isDiv(snap.type) && c.div && c.div.on ? '；红利按两档演示，红利不确定' : '') + '</td></tr>';
    } else if (isCI(snap.type)) {
      if (c.dd && c.dd.on) html += '<tr><td ' + td + '><b>保障演示</b></td><td ' + td + '>重疾 ¥ ' + fmt(c.SA * c.dd.pct / 100, 0) + (c.db && c.db.on ? '｜身故 ¥ ' + fmt(c.SA * c.db.pct / 100, 0) : '') + (c.wait && c.wait.on ? '｜等待期 90 日' : '') + '</td></tr>';
    }
    html += '<tr><td ' + td + '><b>演示口径</b></td><td ' + td + '>' + (isDiv(snap.type) && c.div && c.div.on ? '分红两档（保证 + 红利 i*=' + pct(c.div.iStar, 2) + '）' : '单一保证利益演示') + '——一律取定价实验室利益演示表，禁止另行假设</td></tr></table>';
    return html;
  }

  function launchInternalHTML(snap) {
    var r = snap.res, c = snap.cfg;
    var pb = paybackOf(snap), first = rowAt(snap, 1), last = rowAt(snap, r.T);
    var td = 'style="font-size:14px"';
    return '<h3 style="font-size:16px;margin:14px 0 10px;color:var(--tomato-deep)">本产品结构讲解锚点（讲师须讲得出数字来源）</h3>' +
      '<table class="tbl"><tr><th style="width:170px">讲解锚点</th><th>本产品数值</th></tr>' +
      '<tr><td ' + td + '><b>定价三参数</b></td><td ' + td + '>预定利率 ' + pct(c.i) + '｜发生率 ' + tabStr(snap) + '｜费用率 ' + ePStr(snap) + '</td></tr>' +
      '<tr><td ' + td + '><b>现价基础利率</b></td><td ' + td + '>' + pct(c.iCV) + '（法定口径 = 预定利率 + 加点，产品类型对应规则见定价实验室）</td></tr>' +
      (first ? '<tr><td ' + td + '><b>「为什么现价前低后高」</b></td><td ' + td + '>首年末现价 ¥ ' + fmt(first.CV, 0) + ' vs 已交保费 ' + (c.h === 1 ? '¥ ' + fmt(r.GP) : '¥ ' + fmt(r.GP)) + '——费用前置 + 现价费用率摊还，讲师用此例讲退保损失</td></tr>' : '') +
      '<tr><td ' + td + '><b>「钱怎么增值」</b></td><td ' + td + '>预定利率 ' + pct(c.i) + ' 复利累积（定价口径）；现价链按 ' + pct(c.iCV) + ' 计算——两条链分开讲，不混同</td></tr>' +
      '<tr><td ' + td + '><b>每 10,000 元保费 → 基本保额</b></td><td ' + td + '><b>' + per10000Prem(snap).toFixed(4) + ' 元</b>（= BSA / GP × 10,000）——讲师用一个具体保费反推保额，让客户秒懂「性价比」</td></tr>' +
      '<tr><td ' + td + '><b>现价走势三点</b></td><td ' + td + '>首年末 ¥ ' + fmt(first ? first.CV : 0, 0) + (pb ? ' → 第 ' + pb + ' 年回本' : '') + ' → 满期 ¥ ' + fmt(last ? last.CV : 0, 0) + '</td></tr></table>';
  }

  // ---- 挂载 ----
  function mount(page) {
    var snap = get();
    function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
    if (page === 'dev-eval') {
      set('pl_link_dev', snap ? cardHTML(snap) : emptyHTML('下篇'));
      set('pl_link_map', snap ? devEvalMapHTML(snap) : emptyHTML('映射表'));
      set('pl_link_check', snap ? devEvalCheckHTML(snap) : '');
    } else if (page === 'launch') {
      set('pl_link_launch', snap ? cardHTML(snap) : emptyHTML('下篇'));
      set('pl_link_promo', snap ? launchPromoHTML(snap) : emptyHTML('亮点提炼'));
      set('pl_link_train', snap ? launchTrainHTML(snap) : emptyHTML('培训取数'));
      set('pl_link_internal', snap ? launchInternalHTML(snap) : emptyHTML('内部培训'));
    }
  }
  function reset() {
    clear();
    if (document.getElementById('pl_link_dev')) mount('dev-eval');
    else if (document.getElementById('pl_link_launch')) mount('launch');
  }

  window.PLLink = {
    KEY: KEY, TYPE_NAMES: TYPE_NAMES,
    get: get, save: save, clear: clear, snapshot: snapshot,
    mount: mount, reset: reset,
    paybackOf: paybackOf, per1000: per1000, per10000Prem: per10000Prem
  };
})();
