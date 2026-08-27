/* ============================================================
   产品开发导航仪 · 交互引擎
   三级下拉组合 → 合法性校验 → 8大指导面板
   依据体系：监管制度优先，新制度覆盖旧制度
   ============================================================ */
"use strict";

/* ---------------- 基础字典 ---------------- */
var PRODUCTS = {
  term:       { name: "定期寿险",       tag: "寿险" },
  whole:      { name: "终身寿险",       tag: "寿险" },
  endowment:  { name: "两全保险",       tag: "寿险" },
  annuity:    { name: "年金保险",       tag: "年金" },
  disease:    { name: "疾病保险",       tag: "健康险" },
  medical:    { name: "医疗保险",       tag: "健康险" },
  disability: { name: "失能收入损失保险", tag: "健康险" },
  care:       { name: "护理保险",       tag: "健康险" },
  accident:   { name: "意外伤害保险",   tag: "意外险" }
};
var TERMS = {
  short: { name: "短期险", note: "保险期间一年及以内，且不含保证续保条款" },
  long:  { name: "长期险", note: "保险期间一年以上（或含保证续保安排）" }
};
var FORMS = {
  traditional: { name: "传统型", note: "保单利益在投保时确定" },
  dividend:    { name: "分红型", note: "保单利益由保证利益与非保证红利构成" },
  universal:   { name: "万能型", note: "保费进入保单账户，结算利率不低于最低保证利率" }
};

/* ---------------- 产品元数据（选表/示范条款/特有红线/风险点） ---------------- */
var PMETA = {
  term: {
    table: "非养老类业务一表（死亡责任，金规〔2025〕21号选表规则）",
    clauseRef: "《定期寿险示范条款》（中保协发〔2023〕28号）",
    shapeLines: [
      "个人定期寿险死亡保险金额与累计已交保费之比 ≥ <b>160%</b>（保监发〔2016〕76号）",
      "可附加豁免保费、全残责任；免责宜聚焦投保人对被保险人的故意行为、犯罪、两年内自杀等"
    ],
    risks: [
      "逆选择风险：健康告知与核保宽松度直接决定经验死亡率偏差，费率厘定需预留安全边际",
      "加费/拒保体人群的定向产品需明确核保规则与再保安排",
      "保额弹性：定期寿险多为高保额低保费，需评估巨灾/事件性死亡的赔付集中度"
    ],
    extra: "一年期定寿虽存在，但个人业务中市场占比极低，主流形态为保障期20/30年或至60/70周岁的长期定寿。"
  },
  whole: {
    table: "非养老类业务一表（死亡责任为主，金规〔2025〕21号选表规则）",
    clauseRef: "《终身寿险示范条款》（中保协发〔2023〕28号）",
    shapeLines: [
      "个人终身寿险死亡保险金额与累计已交保费或账户价值之比 ≥ <b>140%</b>（保监发〔2016〕76号）",
      "分红型个人终身寿险保单签发时（或等待期结束时）死亡保额 ≥ 已交保费的 <b>120%</b>（保监发〔2015〕93号）"
    ],
    risks: [
      "利率风险：长期负债久期长，预定利率与投资收益率倒挂风险最大，需资产端匹配方案前置",
      "高现价化倾向会被认定为变相理财，警惕现金价值过早超过已交保费（负面清单高频问题）",
      "万能型终身寿需符合万能新规（金规〔2025〕14号）账户管理、资产负债匹配等从严要求"
    ],
    extra: ""
  },
  endowment: {
    table: "生存责任为主选养老类业务表；死亡给付显著高于生存给付的，死亡责任部分选非养老类业务一表（金规〔2025〕21号）",
    clauseRef: "暂无统一示范条款，参照定期/终身寿险示范条款结构 + 人身保险公司保险条款和保险费率管理办法（2011年第3号令）要素要求",
    shapeLines: [
      "个人两全保险死亡保险金额与累计已交保费或账户价值之比 ≥ <b>120%</b>（保监发〔2016〕76号）",
      "首次生存保险金给付须在保单生效<b>满5年</b>之后，且每年给付/部分领取比例 ≤ 已交保费的 <b>20%</b>（保监人身险〔2017〕134号）",
      "保险期间5年以下的两全产品：期限不得短于<b>3年</b>、销售期间综合偿付能力充足率 ≥ <b>120%</b>、年度规模保费受资本与总保费占比 ≤ <b>20%</b> 双重限制，且需董事会决议等专项备案材料（银保监办发〔2019〕228号）"
    ],
    risks: [
      "资产负债匹配：满期给付集中度高，需做好到期现金流预测与再投资安排",
      "利率风险与再投资风险并重；短险化两全是监管重点打击方向",
      "5年以下两全需按月报送经营情况，管理成本高"
    ],
    extra: "两全是「储蓄+保障」复合形态，134号文后满期给付节奏被严格管制，新产品设计应优先做长周期（10年+）版本。"
  },
  annuity: {
    table: "养老类业务表（生存责任，金规〔2025〕21号）；生存年金领取期长的产品对长寿风险更敏感",
    clauseRef: "暂无统一示范条款；商保年金口径参照金办发〔2024〕110号与金寿险函〔2025〕1号",
    shapeLines: [
      "首次生存保险金给付须在保单生效<b>满5年</b>之后，且每年给付/部分领取比例 ≤ 已交保费的 <b>20%</b>（保监人身险〔2017〕134号）",
      "商保年金口径：保险期限5年及以上、积累期资产配置均衡稳健或领取期提供养老金领取服务的年金/两全；生存给付主要用于教育婚嫁等且于60周岁前全部终止的<b>除外</b>（金办发〔2024〕110号、金寿险函〔2025〕1号）",
      "不得以附加险形式设计万能型/投连型产品（保监人身险〔2017〕134号）"
    ],
    risks: [
      "长寿风险：领取期年金对死亡率改善敏感，建议做选择权（确定领取/终身领取）与再保安排",
      "利率风险：即期年金负债久期极长，预定利率须与投资端长期收益率假设一致",
      "个人养老金业务另有专门规则（人社部发〔2022〕70号、银保监规〔2022〕17号）"
    ],
    extra: "养老年金设计需区分积累期/领取期，关注领取转换时的精算等价性与退保约束。"
  },
  disease: {
    table: "重大疾病：重疾表2020（CI系列发生率表、K系列因重疾死亡比例表，银保监发〔2020〕51号）；身故责任选非养老类业务一表",
    clauseRef: "《重大疾病保险的疾病定义使用规范（2020年修订版）》（中保协发〔2020〕73号）：28种重度疾病+3种轻度疾病定义全国统一，各公司不得自行修改",
    shapeLines: [
      "疾病保险等待期不得超过 <b>180天</b>（健康保险管理办法，2019年第3号令）",
      "使用统一疾病定义：命名含「重大疾病保险」的产品，28种重疾必须全部包含且不得拆分（中保协发〔2020〕73号）",
      "轻症/中症分层设计时，疾病定义与给付比例须在条款中逐一明确"
    ],
    risks: [
      "疾病谱演变：发生率表发布至今逐年恶化（医疗检出率上升），定价需加安全边际并做趋势调整",
      "轻症定义、理赔实操与销售口径不一致是投诉高发区",
      "2025年34号文已预告：疾病定义将修订、重疾发生率表实时更新——新开发产品要预留定义切换影响"
    ],
    extra: "分红型长期健康险自2025年起对监管评级良好的公司开闸（金发〔2025〕34号），属新方向。"
  },
  medical: {
    table: "无统一监管发生率表：以公司经验数据为主，参考行业数据与再保数据；死亡责任选非养老类业务一表（金规〔2025〕21号）",
    clauseRef: "《一般商业医疗保险示范条款——基础型（草案征求意见稿）》（中保协函〔2026〕186号，征求意见中，可参考结构）",
    shapeLines: [
      "短期个人健康保险产品<b>不得</b>进行费率浮动（2019年第3号令）；长期医疗可费率调整（银保监办发〔2020〕27号）",
      "医疗保险等待期不得超过 <b>180天</b>（2019年第3号令）",
      "长期医疗保险费率调整：需在条款中明确调整触发条件、调整程序与信息披露，且不得因个体健康状况差异区别调价（银保监办发〔2020〕27号）",
      "健康管理服务分摊成本不得超过净保险费的 <b>20%</b>（2019年第3号令）"
    ],
    risks: [
      "医疗通胀：理赔额随医疗费用增长，定价需内嵌医疗通胀假设并定期回溯",
      "续保设计：短期医疗不得保证续保；「自动续保」「承诺续保」类表述是负面清单高频雷区（银保监办发〔2021〕7号）",
      "免赔额/给付比例设计直接影响经验赔付率与逆选择程度"
    ],
    extra: "百万医疗类产品：关注免赔额设置、增值服务（健康管理）成本列支、以及金办便函〔2025〕745号对城市商业医疗险的精准定价与精算回溯要求。"
  },
  disability: {
    table: "失能发生率：以公司/行业经验数据为基础；身故责任选非养老类业务一表（金规〔2025〕21号）",
    clauseRef: "暂无统一示范条款；条款结构按2011年第3号令要素+健康保险管理办法要求",
    shapeLines: [
      "失能收入损失保险属健康保险，适用健康保险管理办法（2019年第3号令）全部约束：等待期 ≤ <b>180天</b>、短期个人业务费率不浮动等",
      "失能定义（失能标准、给付期间、免责）是条款核心，须可核验（常见采用ADLs活动能力标准）",
      "给付期间与等待期的组合设计决定发生率曲线上截取的区段"
    ],
    risks: [
      "道德风险高：失能认定存在主观性，需强化核保（财务核保+职业核保）与理赔调查",
      "经验数据稀缺：国内失能发生率数据积累不足，建议再保合作并保守定价",
      "与意外险的责任边界（疾病导致失能 vs 意外导致失能）必须在条款中切割清楚"
    ],
    extra: "失能险在国内仍属小众险种，监管鼓励方向见金发〔2025〕34号（与人寿保险责任转换等协同）。"
  },
  care: {
    table: "护理状态发生率：以经验数据为基础；身故责任选非养老类业务一表（金规〔2025〕21号）",
    clauseRef: "暂无统一示范条款；长期护理业务规则参照银保监办发〔2021〕65号（参与制度试点服务）与金发〔2025〕34号",
    shapeLines: [
      "长期护理保险保险期间<b>不得低于5年</b>（健康保险管理办法，2019年第3号令）——护理险不存在短期形态",
      "护理状态认定标准（ADLs/认知障碍等）须在条款中客观化",
      "人寿保险与长期护理保险责任转换业务已放开试点（银保监办发〔2023〕33号），可作为产品创新方向"
    ],
    risks: [
      "发生率数据严重不足：护理状态发生率远比重疾/身故数据稀缺，必须再保支持+高安全边际",
      "长寿与护理状态持续时间双重不确定性：给付期假设需做敏感性测试",
      "与医保长期护理保险试点的边界：商保护理险要明确与社保的衔接与不重复给付"
    ],
    extra: "护理险是政策明确鼓励的保障型产品方向（新国十条、金发〔2025〕34号），开发时优先研究政策性长护试点数据。"
  },
  accident: {
    table: "意外伤害发生率表（2021）（中精协发〔2021〕14号）：按性别/年龄/地域的意外身故与伤残发生率",
    clauseRef: "暂无统一示范条款；伤残给付比例表必须符合《人身保险伤残评定标准及代码》（GB/T 44893—2024，原保监发〔2014〕6号行业标准）",
    shapeLines: [
      "伤残给付：按伤残等级对应给付比例（10级，100%—10%），行业统一标准不得自创（GB/T 44893—2024）",
      "职业分类与费率：按职业风险等级差异化定价，费率浮动须符合银保监办发〔2021〕106号",
      "意外险定义四要素「外来的、突发的、非本意的、非疾病的」须在条款中完整表述并释义"
    ],
    risks: [
      "职业错配：核保职业类别与实际职业不符是理赔纠纷与回溯偏差的头号来源",
      "借款人意外险等特定场景业务有专项自查清理要求（人身险部函〔2019〕231号）",
      "短期意外险需按106号文做定价回溯报告，赔付率异常将被监管问询"
    ],
    extra: "意外险改革方向（银保监办发〔2020〕4号）：纯风险保障、费率市场化、信息披露标准化——产品设计不要试图捆绑储蓄功能。"
  }
};

/* ---------------- 合法性校验引擎 ---------------- */
function evaluate(p, t, f) {
  var blocks = [], warns = [];
  var isHealth = ["disease", "medical", "disability", "care"].indexOf(p) >= 0;

  /* 期限维度的硬约束 */
  if (t === "short") {
    if (p === "whole") {
      blocks.push({
        r: "终身寿险以被保险人终身为保险期间，属于长期业务，不存在短期形态。",
        b: "人身保险公司保险条款和保险费率管理办法（2011年第3号令）；银保监办发〔2020〕7号"
      });
    }
    if (p === "endowment") {
      blocks.push({
        r: "两全保险含生存与死亡双重责任，即使特批的短期两全也不得短于3年，无一年期及以内形态。",
        b: "银保监办发〔2019〕228号：保险期间5年以下的两全产品不得短于3年"
      });
    }
    if (p === "annuity") {
      blocks.push({
        r: "年金保险以生存年金给付为核心责任，给付期间跨越数十年，属于长期业务，不存在短期形态。",
        b: "人身保险公司保险条款和保险费率管理办法（2011年第3号令）"
      });
    }
    if (p === "care") {
      blocks.push({
        r: "长期护理保险保险期间不得低于5年，不存在短期护理保险。",
        b: "健康保险管理办法（2019年第3号令）"
      });
    }
    if (p === "term") {
      warns.push("一年期定期寿险在制度上存在，但个人业务中市场占比极低（多见于团体业务或附加险形态）；若做一年期定寿，注意不得含保证续保安排，且费率随年龄自然增长须充分披露。");
    }
    if (p === "disease") {
      warns.push("一年期重疾属短期健康险，受银保监办发〔2021〕7号约束：不得保证续保、续保须重新核保披露、产品名称含「一年期」；经验数据波动大，需每年重定价。");
    }
    if (p === "disability") {
      warns.push("短期失能多作为附加险存在；独立的一年期失能收入损失保险市场极少，且失能认定成本高，短期业务难以摊薄。");
    }
    if (f === "dividend") {
      blocks.push({
        r: "分红型仅适用于长期人身保险业务：分红来源于三差损益的长期积累，短期业务不适用分红精算规定。",
        b: "保监发〔2015〕93号（分红保险精算规定适用于长期分红业务）"
      });
    }
    if (f === "universal") {
      blocks.push({
        r: "万能型仅适用于长期人身保险业务：保单账户价值需要长期积累，短期业务无账户运作基础。",
        b: "保监发〔2015〕19号（万能型精算规定适用于长期万能业务）"
      });
    }
  }

  if (t === "long" && p === "accident") {
    warns.push("长期意外伤害保险可行（如保至60/70周岁），但需注意：费率结构应反映长期伤残发生率；中途退保的现金价值处理；主流意外险仍为一年期及以下，长期形态需论证渠道与客户需求匹配度。");
  }

  /* 形态维度的约束 */
  if (f === "universal") {
    if (["accident", "medical", "disease"].indexOf(p) >= 0) {
      blocks.push({
        r: "万能型仅适用于人寿保险结构（终身寿险、两全保险、年金保险等以账户价值运作为基础的长期寿险业务），意外险与健康险不得设计为万能型。",
        b: "保监发〔2015〕19号（万能型精算规定的适用范围）；保监人身险〔2017〕134号（产品开发设计导向）"
      });
    }
    if (p === "care" || p === "disability") {
      warns.push("历史上曾有万能型护理/失能产品，但保监人身险〔2017〕134号禁止以附加险形式设计万能型产品，且金规〔2025〕14号对万能险的产品、账户、资产负债匹配、销售实施全面从严监管——当前开发万能型护理/失能产品阻力极大，建议采用传统型。");
    }
    if (p === "term") {
      warns.push("万能结构以长期账户价值积累为基础，与「定期、消费型」的产品逻辑冲突，监管实践与市场均不接受万能型定期寿险。建议改做万能型终身寿险，或用传统型定寿。");
    }
  }

  if (f === "dividend") {
    if (p === "accident") {
      blocks.push({
        r: "意外伤害保险为保障型业务，不得设计为分红型：分红机制仅适用于长期人身保险业务，意外险没有可供分配的长期差益基础。",
        b: "保监发〔2015〕93号（分红精算规定适用范围）；银保监办发〔2021〕106号（意外险业务监管办法：回归保障）；人身保险产品负面清单（2026版）对意外险形态创新的管制"
      });
    }
    if (isHealth) {
      warns.push("健康保险原则上不得设计为分红型（健康保险管理办法，2019年第3号令）。但金发〔2025〕34号明确「支持监管评级良好的保险公司开展分红型长期健康保险业务」——若公司监管评级良好且产品为长期形态，可作为创新方向个案论证，报备前建议与监管沟通。");
    }
    if (p === "term") {
      warns.push("分红型定期寿险在制度上可行但市场极少：需满足93号文全部分红监管要求（红利演示、分红账户管理、信息披露），而定寿客户对价格高度敏感，分红结构通常得不偿失。建议优先传统型定寿。");
    }
  }

  /* 汇总 */
  var status = "ok";
  if (blocks.length) status = "block";
  else if (warns.length) status = "warn";
  return { status: status, blocks: blocks, warns: warns };
}

/* ---------------- 替代思路 ---------------- */
function alternatives(p, t, f) {
  var alts = [];
  var P = PRODUCTS[p].name;
  if (f === "dividend" || f === "universal") {
    alts.push("改为「传统型 " + P + "」——绝大多数 " + P + " 的主流形态，监管路径清晰");
    if (["whole", "endowment", "annuity"].indexOf(p) >= 0) {
      alts.push("若希望客户分享盈余，考虑「长期分红型两全/终身寿/年金 + " + P + "（传统型）附加险」的产品组合；组合销售须明确告知为「保险产品组合」（保监人身险〔2017〕134号）");
    }
  }
  if (t === "short" && ["whole", "endowment", "annuity", "care"].indexOf(p) >= 0) {
    alts.push("改为「长期 " + P + "」；若顾虑缴费压力，可设计为长期险种下的短期缴费（如趸交/3年交）而非短期险种");
  }
  if (p === "accident" && f === "dividend") {
    alts.push("意外险回归纯保障（银保监办发〔2021〕106号导向）：做好职业分类定价与伤残给付比例表即可，勿叠加投资属性");
  }
  if (isHealthBlocked(p, f)) {
    alts.push("健康险分红化的替代路径：金发〔2025〕34号开闸方向为「分红型长期健康保险」，前提是公司监管评级良好+长期形态；否则保持传统型");
  }
  if (!alts.length) alts.push("参考下方「该险种可行组合」重新选择形态或期限");
  return alts;
}
function isHealthBlocked(p, f) {
  return (["disease", "medical", "disability", "care"].indexOf(p) >= 0) && f === "dividend";
}

/* ---------------- 该险种全部组合矩阵（供被拦截时参考） ---------------- */
function comboMatrix(p) {
  var rows = [];
  ["traditional", "dividend", "universal"].forEach(function (f) {
    ["short", "long"].forEach(function (t) {
      var ev = evaluate(p, t, f);
      rows.push({ t: t, f: f, status: ev.status });
    });
  });
  return rows;
}

/* ============================================================
   8 大指导面板内容引擎
   ============================================================ */
function esc(s) { return s; }

function panelFormShape(p, t, f) {
  var m = PMETA[p];
  var html = "<h4>✅ 可行性结论</h4><ul>";
  html += "<li>本组合（" + PRODUCTS[p].name + " × " + TERMS[t].name + " × " + FORMS[f].name + "）<b>可以开发</b>，属监管认可的产品形态。</li>";
  html += "<li>" + TERMS[t].note + "；" + FORMS[f].note + "。</li>";
  if (m.extra) html += "<li>" + m.extra + "</li>";
  html += "</ul>";
  html += "<h4>📐 形态设定要点（产品命名与结构）</h4><ul>";
  html += "<li>产品定名规则：「保险公司名称 + 吉祥词或说明性文字 + 险种类型」，险种类型须与实际责任一致（2011年第3号令）；产品名称、说明书及宣传材料中<b>不得</b>包含「理财」「投资计划」等表述（保监人身险〔2017〕134号）。</li>";
  html += "<li>报送路径：预定利率/最低保证利率不超过监管上限的<b>备案</b>，超过上限的<b>审批</b>（金发〔2024〕18号）。</li>";
  m.shapeLines.forEach(function (l) { html += "<li>" + l + "</li>"; });
  html += "</ul>";
  html += "<h4>⚠️ 风险识别与形态层面应对</h4><ul>";
  m.risks.forEach(function (r) { html += "<li>" + r + "</li>"; });
  if (f === "dividend") {
    html += "<li>分红结构特有风险：红利实现率不达演示预期引发的销售纠纷——演示利率必须严格遵守红利上限公式（见面板6/7）。</li>";
    html += "<li>分红水平监管意见（金寿险函〔2025〕374号）：不得偏离账户资产负债和投资收益实际随意抬高分红水平；红利用于「内卷式」竞争将被约谈、责令整改。</li>";
  }
  if (f === "universal") {
    html += "<li>万能新规（金规〔2025〕14号）：加强产品管理、账户管理、资产负债管理、销售行为管理——包括最低保证利率约束、结算利率与投资收益的联动、单独账户管理等全链条要求。</li>";
  }
  if (t === "short") {
    html += "<li>短期业务特有：不得保证续保（如为健康险须严格执行银保监办发〔2021〕7号）；费率一年一议，需建立经验赔付率监测与年度重定价机制。</li>";
  }
  html += "</ul>";
  html += "<p class='cite'>主要依据：2011年第3号令、保监人身险〔2017〕134号、银保监办发〔2019〕228号、金发〔2024〕18号、金规〔2025〕14号、金寿险函〔2025〕374号</p>";
  return html;
}

function panelClause(p, t, f) {
  var m = PMETA[p];
  var html = "<h4>📋 条款设计依据</h4><ul>";
  html += "<li>示范条款依据：" + m.clauseRef + "</li>";
  html += "<li>条款要素清单（2011年第3号令）：保险责任、责任免除、保险期间、犹豫期、宽限期、保费交纳与效力中止/恢复、现金价值表、如实告知与解除合同、索赔与理赔时效、争议处理。</li>";
  html += "</ul>";
  html += "<h4>🚫 免责条款写法</h4><ul>";
  html += "<li>免责事项须「明确、具体、可理解」，不得笼统表述（如「其他情形」）；重大免责事项应在投保单和说明书突出提示。</li>";
  if (p === "disease") {
    html += "<li>重大疾病保险：疾病定义全部采用中保协发〔2020〕73号统一规范（28种重度+3种轻度），不得增删修改；可在此基础上增加规范外病种，但定义须自拟且无歧义。</li>";
  }
  if (p === "accident") {
    html += "<li>意外险：意外伤害四要素（外来的、突发的、非本意的、非疾病的）缺一不可；高风险运动、职业变更等免责要与职业费率分类逻辑一致，不得「收费按一类职业、免责按五类职业」。</li>";
  }
  if (isHealthType(p)) {
    html += "<li>健康险：既往症、遗传性疾病、先天性畸形等免责表述要与核保问卷的询问事项一一对应，避免「未询问却免责」的无效条款（负面清单高频问题）。</li>";
  }
  html += "</ul>";
  html += "<h4>📖 注释（释义）写法</h4><ul>";
  html += "<li>所有专业术语（如「意外伤害」「医院」「酒精浓度」「专科医生」「护理状态」等）在条款「释义」部分逐一定义，定义应客观、可核验。</li>";
  html += "<li>释义与保险责任、免责的措辞必须闭环：责任怎么写、释义就怎么定义，不得在释义中变相扩大免责范围。</li>";
  html += "</ul>";
  html += "<h4>🔍 上线前自查</h4><ul>";
  html += "<li>对照《人身保险产品负面清单（2026版）》（金寿险函〔2026〕72号）逐条自查——条款表述类问题占负面清单相当大比重，是产品被退回的最常见原因。</li>";
  html += "<li>条款编码、条款登载按监管要求执行（中保协发〔2013〕337号实施细则体系）。</li>";
  html += "</ul>";
  html += "<p class='cite'>主要依据：2011年第3号令、中保协发〔2020〕73号、GB/T 44893—2024、金寿险函〔2026〕72号</p>";
  return html;
}
function isHealthType(p) { return ["disease", "medical", "disability", "care"].indexOf(p) >= 0; }

function panelPricing(p, t, f) {
  var m = PMETA[p];
  var html = "<h4>① 预定利率</h4><ul>";
  if (t === "short") {
    html += "<li>短期险一般不涉及预定利率（无长期资金占用），费用假设与赔付假设是核心；若含满期给付性质需按短期精算规则处理。</li>";
  } else {
    html += "<li>制度基准（金发〔2024〕18号，2024-09-01起）：普通型上限 <b>2.5%</b>、分红型上限 <b>2.0%</b>、万能型最低保证利率上限 <b>1.5%</b>。</li>";
    html += "<li>动态调整机制：预定利率与市场利率挂钩（参考5年期以上LPR、5年定期存款基准利率、10年期国债到期收益率），保险业协会每季度发布<b>预定利率研究值</b>（金寿险函〔2025〕10号）。</li>";
    html += "<li>现行上限（2025-09-01起执行）：普通型 <b>2.0%</b>、分红型 <b>1.75%</b>、万能型最低保证利率 <b>1.0%</b>——系2025-07-25研究值1.99%触发动态调整机制后各公司公告执行（无单一新文号），证据链详见本站「预定利率专页」。</li>";
    if (f === "traditional") html += "<li>超过上限须报审批；新产品定价利率取值须与研究值、公司投资能力匹配，防止利差损。</li>";
    if (f === "dividend") html += "<li>分红型定价利率越低、浮动占比越高：需与演示利率上限统筹考虑（见面板6）。</li>";
    if (f === "universal") html += "<li>万能型：最低保证利率由公司审慎确定（保监发〔2015〕19号），但不得突破监管上限；结算利率须与账户实际投资收益挂钩（金规〔2025〕14号）。</li>";
  }
  html += "</ul>";
  html += "<h4>② 预定发生率（选表）</h4><ul>";
  html += "<li>本险种：" + m.table + "</li>";
  html += "<li>生命表2025（金规〔2025〕21号，2026-01-01起实施）：四类表——养老类业务表 / 非养老类业务一表 / 非养老类业务二表 / 单一生命体表；存量产品切换须保证对投保人公平。</li>";
  if (p === "disease") html += "<li>重疾发生率：定价用重疾表2020，评估下限按银保监发〔2020〕51号执行；考虑发生率恶化趋势，建议在表基础上加安全边际。</li>";
  if (p === "accident") html += "<li>意外险：按中精协发〔2021〕14号意外表2020定价，结合职业类别调整系数；短期意外险费率浮动须符合银保监办发〔2021〕106号。</li>";
  if (p === "medical") html += "<li>医疗险：经验发生率 + 医疗通胀趋势 + 免赔额/给付比例的结构性调整；新公司/新产品无经验数据时优先再保联合定价。</li>";
  html += "</ul>";
  html += "<h4 id='panel-fee'>③ 预定附加费用率（报行合一）</h4><ul>";
  html += "<li>上限约束：附加费用率不得超过银保监办发〔2020〕7号附表规定的上限；佣金不得超过附加费用率（保监发〔2013〕62号确立原则）。</li>";
  if (f === "dividend") {
    html += "<li>分红型上限另按保监发〔2015〕93号《分红保险精算规定》：个人期交两全/年金 <b>16%</b>、终身寿险 <b>30%</b>；个人趸交 <b>8% / 18%</b>；团体期交 <b>10% / 15%</b>、趸交 <b>5% / 8%</b>——整体低于普通型同档，费用假设还须经受红利分配（70% 下限）的可支撑性检验。</li>";
  }
  html += "<li><b>报行合一</b>：附加费用率 = 可用总费用水平（银保渠道：金办便函〔2024〕66号）；佣金率上限、银保专员薪酬、培训及客户服务费、分摊的固定费用须逐项列明，严禁出单费、信息费等账外支付。</li>";
  html += "<li>最新加码：金寿险函〔2026〕65号要求董事会每年至少听取一次银保渠道费用管理报告，总经理负总责、总精算师对产品设计环节负专责。</li>";
  html += "<li>费用分摊方法论参照《人身保险产品费用分摊指引》（中精协发〔2025〕86号）。</li>";
  html += "<li>官方上限数据（普通型 + 分红型对照）、现价计算分年度费用率表、k 值表：<a href='baoxing.html#fees'>报行合一费用管理全解 · 第三节</a>（双向入口）。</li>";
  html += "</ul>";
  html += "<p class='cite'>主要依据：银保监办发〔2020〕7号、保监发〔2015〕93号、金发〔2024〕18号、金寿险函〔2025〕10号、金办便函〔2024〕66号、金寿险函〔2026〕65号、中精协发〔2025〕86号</p>";
  return html;
}

function panelProfit(p, t, f) {
  var html = "<h4>利润测试六假设设计要点</h4>";
  html += "<table class='tbl kv'><tr><th>假设</th><th>设计要点</th></tr>";
  html += "<tr><td><b>发生率</b></td><td>以监管发生率表/公司经验数据为基础，加入安全边际；对恶化趋势（重疾检出率上升、医疗通胀下的利用率上升）做趋势调整；逆选择程度按核保强度分档设定</td></tr>";
  html += "<tr><td><b>净投资收益率</b></td><td>与资产端投资策略和现行利率环境一致（参考10年期国债收益率等长期利率），不得用牛市假设做长期测算；分红/万能需按账户实际配置测算</td></tr>";
  html += "<tr><td><b>贴现率</b></td><td>与定价利率逻辑自洽；新业务价值评估口径按公司内含价值评估标准执行</td></tr>";
  html += "<tr><td><b>总费用率</b></td><td>与定价附加费用率、报行合一后的费用预算<b>三者一致</b>——费用假设虚低是利润测试失真的头号原因</td></tr>";
  html += "<tr><td><b>通货膨胀率</b></td><td>对给付额随物价调整/医疗费用敏感的产品（医疗险、失能收入补偿）必须内嵌通胀假设并做敏感性</td></tr>";
  html += "<tr><td><b>脱退率</b></td><td>分缴费期内/外设定；高分保单的脱退率恶化直接冲击资产负债匹配，对高现价倾向的产品尤其敏感</td></tr>";
  html += "</table>";
  html += "<h4>硬性门槛与监管要求</h4><ul>";
  html += "<li>利润测试结果显示<b>新业务价值为负</b>的新产品，监管不接受其审批与备案（保监发〔2016〕76号）。</li>";
  html += "<li>敏感性测试：至少对发生率、投资收益率、脱退率做±偏移测试，识别利润的关键驱动因子并在精算报告中披露。</li>";
  html += "<li>偿付能力影响：分红/万能产品及对公司现金流影响重大的产品，报备时需提交偿付能力影响报告。</li>";
  html += "<li>精算假设管理（金办便函〔2026〕616号）：假设设定、验证、回溯的全流程管理要求——利润测试假设须纳入公司假设管理体系，定期与实际经验对比修正。</li>";
  html += "</ul>";
  html += "<p class='cite'>主要依据：保监发〔2016〕76号、金办便函〔2026〕616号、人身险部函〔2020〕27号（产品报告体系）</p>";
  return html;
}

function panelReserve(p, t, f) {
  var m = PMETA[p];
  var html = "<h4>现金价值</h4><ul>";
  if (t === "short") {
    html += "<li>短期险通常无现金价值或现金价值极低（未满期净保费口径）；若含满期给付/返还性质，须按未满期责任处理并做现金流匹配。</li>";
  } else {
    html += "<li>现金价值按银保监办发〔2020〕7号计算：以定价预定发生率、预定利率为基础，扣除费用假设后确定；" + (f === "universal" ? "万能型为账户价值（保单账户扣除退保费用）口径。" : "保证现金价值表须随条款报备并在犹豫期内提供给客户。") + "</li>";
    html += "<li>现金价值走势是产品「储蓄化」程度的直接信号：过早接近或超过已交保费将触发高现价/中短存续期监管逻辑（历史教训见保监发〔2016〕22号/76号体系）。</li>";
  }
  html += "</ul>";
  html += "<h4>法定未到期责任准备金 / 未到期责任准备金</h4><ul>";
  if (t === "short") {
    html += "<li>短期业务：未到期责任准备金按非寿险口径处理（1/365法或1/24法等），并做充足性测试；已发生未报案未决赔款准备金（IBNR）按精算方法计提。</li>";
  } else {
    html += "<li>长期传统/分红业务：法定未到期责任准备金按银保监办发〔2020〕7号（未来法），评估利率上限——普通型为年复利3.5%与定价利率的较小者；分红型为3.0%与定价利率的较小者（银保监办发〔2019〕182号）；万能型评估利率上限年复利3%（保监发〔2016〕76号调整）。</li>";
    html += "<li>评估死亡率：自2026-01-01起采用生命表2025（金规〔2025〕21号），选表规则与定价一致（" + m.table + "）。</li>";
    html += "<li>准备金应不低于现金价值（充足性底线），并做现金流匹配检验。</li>";
  }
  if (f === "universal") {
    html += "<li>万能型责任准备金三部分：<b>账户准备金 + 最低保证利率准备金 + 其他保单利益准备金</b>（保监发〔2015〕19号）；单独账户管理，同一账户统一结算利率。</li>";
  }
  if (f === "dividend") {
    html += "<li>分红特有：红利风险/分红保险特别储备（保监发〔2015〕93号），用于平滑年度间红利分配，分配比例受监管约束（见面板7）。</li>";
  }
  html += "</ul>";
  html += "<h4>口径提示</h4><ul><li>法定准备金（监管口径）与新保险合同准则（财会〔2020〕20号，IFRS17/CAS25）下的履约现金流量是<b>两套并行口径</b>，产品开发阶段以法定口径评估偿付能力影响，同时评估新准则下对利润释放节奏的影响。</li></ul>";
  html += "<p class='cite'>主要依据：银保监办发〔2020〕7号、保监发〔2015〕19号/93号、银保监办发〔2019〕182号、保监发〔2016〕76号、金规〔2025〕21号</p>";
  return html;
}

function panelIllustration(p, t, f) {
  var html = "<h4>披露制度框架</h4><ul>";
  html += "<li>《人身保险产品信息披露管理办法》（2022年第8号令）+ 《一年期以上人身保险产品信息披露规则》（银保监规〔2022〕24号）：说明书、投保提示、利益演示的法定要求体系。</li>";
  html += "<li>说明书要素：产品概览（条款摘要）、保险责任与责任免除摘要、犹豫期及退保、利益演示、风险提示——面向普通客户可读，不得使用「理财」等表述。</li>";
  html += "</ul>";
  if (t === "short") {
    html += "<h4>演示要求</h4><ul><li>短期险无利益演示要求（无长期利益假设），重点在投保提示与费率披露；含满期给付的短期产品除外（按监管个案要求）。</li></ul>";
  } else if (f === "traditional") {
    html += "<h4>演示要求（传统型）</h4><ul><li>保证利益演示：现金价值、满期给付、身故给付按条款确定值列示，不得做非保证利益演示。</li></ul>";
  } else if (f === "dividend") {
    html += "<h4>演示要求（分红型）——本站重点</h4><ul>";
    html += "<li><b>两档演示</b>（<a href=\"regulations.html#reg-24hao\">银保监规〔2022〕24号</a>，取消原93号文低/中/高三档）：采用 <b>保证利益演示</b>（利差水平 = 0）和 <b>红利利益演示</b>（利差水平 ≤ <b>4.5%−产品预定利率</b>）两档演示产品未来利益给付；一年期以上产品须逐年演示（&gt;10年演示前10年），醒目标明假设性与红利不确定性，不得披露演示用投资回报率。</li>";
    html += "<li>红利演示上限公式（<a href=\"regulations.html#reg-6hao\">银保监办发〔2020〕6号</a>，<b>覆盖93号文实践口径</b>）：<br><b>红利上限 = (V₀ + P) × 利差水平 × 70%</b><br>其中 V₀ 为期初现金价值（含已产生红利），P 为当期保费；红利分配比例统一为可分配盈余的70%。低档为零。</li>";
    html += "<li><span class='badge b-amber'>口径提醒</span> 制度冲突裁决：93号文的贡献法（利差/死差/费差分别演示）已被2020-6号实质约束，本站一律采用 (V₀+P)×利差×70% 公式，并同步标注两文关系。</li>";
    html += "</ul>";
  } else {
    html += "<h4>演示要求（万能型）</h4><ul>";
    html += "<li>低、高两档演示：低档按<b>最低保证利率</b>演示；高档利率按银保监规〔2022〕24号规则确定（与公司实际结算水平挂钩，不得虚高）。</li>";
    html += "<li>演示须含初始费用、退保费用等费用扣除过程，让客户看得到「进入账户的钱」。</li>";
    html += "<li>结算利率披露：定期公布实际结算利率，且须与账户投资收益一致（金规〔2025〕14号）。</li>";
    html += "</ul>";
  }
  html += "<h4>演示用投资收益率的选择纪律</h4><ul>";
  html += "<li>演示利率上限 ≠ 推荐取值：应以资产端长期可实现的收益率支撑，防止「演示高、实现低」引发的实现率与投诉风险。</li>";
  html += "<li>分红产品演示用投资收益率与公布分红实现率所用口径须一致（详见面板7）。</li></ul>";
  html += "<p class='cite'>主要依据：2022年第8号令、<a href=\"regulations.html#reg-24hao\">银保监规〔2022〕24号</a>、保监发〔2015〕93号、<a href=\"regulations.html#reg-6hao\">银保监办发〔2020〕6号</a></p>";
  return html;
}

function panelDividendRate(p, t, f) {
  if (f !== "dividend") {
    return "<div class='note'><b>本面板仅适用于分红型产品。</b>当前组合为" + FORMS[f].name + "。若您关注分红监管体系，请将「分类三」切换为分红型查看：93号精算规定 → 2020-6号强化监管 → 2022-24号信息披露 → 2025-374号分红水平监管意见的完整链条。</div>";
  }
  var html = "<h4>分红实现率计算（银保监规〔2022〕24号）</h4><ul>";
  html += "<li>现金红利实现率 = 实际分配的现金红利 ÷ 演示的现金红利（红利计算基础使用演示红利）</li>";
  html += "<li>增额红利实现率 = 实际红利增额产生的保单利益 ÷ 演示增额红利产生的保单利益</li>";
  html += "<li>披露要求：每年在官网披露上一年度分红型产品的红利实现率（按银保监规〔2022〕24号规定的时限，一般于上半年完成上年度披露）。</li>";
  html += "</ul>";
  html += "<h4>红利的来源与分配</h4><ul>";
  html += "<li>可分配盈余的<b>70%</b>分配给保单持有人（银保监办发〔2020〕6号：红利分配比例统一为可分配盈余的70%）。</li>";
  html += "<li>盈余来源：利差为主、死差/费差为辅；分红账户单独管理，费用分摊按《人身保险产品费用分摊指引》（中精协发〔2025〕86号）执行。</li>";
  html += "<li>平滑机制：分红特别储备用于平滑年度波动，但不得借平滑之名长期掩盖账户真实收益。</li>";
  html += "</ul>";
  html += "<h4>实现率偏高/偏低的归因分析框架</h4><ul>";
  html += "<li>投资端：账户实际投资收益率 vs 演示用投资收益率的偏差（主因）</li>";
  html += "<li>负债端：发生率经验偏离（死差）、费用经验偏离（费差）</li>";
  html += "<li>管理端：特别储备的跨期调节、新产品演示基数选择</li>";
  html += "</ul>";
  html += "<h4>监管红线</h4><ul>";
  html += "<li>金寿险函〔2025〕374号：不得偏离账户的资产负债和投资收益实际情况，随意抬高分红水平搞「内卷式」竞争；违反者将被约谈、责令整改、评级扣分。</li>";
  html += "<li>红利分配应当满足：可分配盈余为正才可分配、红利体现账户真实盈余、演示红利符合2020-6号上限公式。</li>";
  html += "</ul>";
  html += "<p class='cite'>主要依据：银保监规〔2022〕24号、<a href=\"regulations.html#reg-6hao\">银保监办发〔2020〕6号</a>、金寿险函〔2025〕374号、中精协发〔2025〕86号</p>";
  return html;
}

function panelBackend(p, t, f) {
  var html = "<h4>回溯与监测机制</h4><ul>";
  html += "<li>产品回溯：建立产品回溯机制，每年编写回溯报告经董事会审议后报送（保监寿险〔2016〕199号）。</li>";
  if (p === "accident" && t === "short") html += "<li>意外险定价回溯：按银保监办发〔2021〕106号执行定价回溯，赔付率/发生率偏离须说明原因。</li>";
  if (t === "short" && isHealthType(p)) html += "<li>短期健康险：定期开展损益核算与精算回溯，合理调整保险责任和费率（金办便函〔2025〕745号对城市商业医疗险的要求可作通用范式）。</li>";
  html += "<li>互联网渠道：试运行定价回溯机制（银保监办便函〔2021〕1275号）。</li>";
  html += "<li>精算假设回溯：纳入公司精算假设管理体系（金办便函〔2026〕616号）。</li>";
  html += "</ul>";
  html += "<h4>赔付率与业务品质管理</h4><ul>";
  html += "<li>按险种/版本/渠道建立赔付率监测看板：经验发生率 vs 定价假设的偏差率是核心指标。</li>";
  html += "<li>品质指标：退保率、投诉率、理赔时效、拒赔原因分布——「产品后端管理」发现问题应反哺下一代产品条款与核保规则。</li>";
  html += "</ul>";
  html += "<h4>价值计量与偏差风险</h4><ul>";
  html += "<li>按<b>缴费期别、被保险人人群、险种搭配结构</b>分别监控新业务价值率与经验偏差：同一定价的产品在不同缴费期/人群下的利润结构差异巨大。</li>";
  html += "<li>组合销售结构（主险+附加险搭配占比）变化会改变整体死差/费差结构，价值评估须按组合口径复核。</li>";
  html += "</ul>";
  html += "<h4>报送义务清单（产品条线）</h4><ul>";
  html += "<li>年度产品总结报告（保监寿险〔2010〕360号体系，报送事项已按金办便函〔2024〕1585号清简合并）。</li>";
  html += "<li>停售/复售等重大产品事项按监管要求报送（产品智能检核系统，银保监办便函〔2022〕346号体系）。</li>";
  html += "<li>定期对照负面清单自查（现行版本：金寿险函〔2026〕72号）。</li>";
  html += "</ul>";
  html += "<p class='cite'>主要依据：保监寿险〔2016〕199号、保监寿险〔2010〕360号、金办便函〔2026〕616号、金办便函〔2024〕1585号、金寿险函〔2026〕72号</p>";
  return html;
}

function buildPanels(p, t, f) {
  return [
    { id: "p1", icon: "🧭", title: "产品形态设定", body: panelFormShape(p, t, f) },
    { id: "p2", icon: "📜", title: "条款设计", body: panelClause(p, t, f) },
    { id: "p3", icon: "⚙️", title: "定价三参数（预定利率 / 预定发生率 / 附加费用率）", body: panelPricing(p, t, f) },
    { id: "p4", icon: "📈", title: "利润测算", body: panelProfit(p, t, f) },
    { id: "p5", icon: "🏦", title: "准备金计量", body: panelReserve(p, t, f) },
    { id: "p6", icon: "📖", title: "说明书与利益演示", body: panelIllustration(p, t, f) },
    { id: "p7", icon: "🍅", title: "分红实现率（分红型专属）", body: panelDividendRate(p, t, f) },
    { id: "p8", icon: "🔧", title: "产品后端管理", body: panelBackend(p, t, f) }
  ];
}

/* ============================================================
   DOM 渲染
   ============================================================ */
function $(id) { return document.getElementById(id); }

function renderBanner(ev, p, t, f) {
  var box = $("verdict");
  var html = "";
  if (ev.status === "block") {
    html += "<div class='banner block'><h3>⛔ 此组合不可行（" + ev.blocks.length + " 项硬性障碍）</h3><ul>";
    ev.blocks.forEach(function (b) {
      html += "<li><b>" + b.r + "</b><br><span class='cite'>依据：" + b.b + "</span></li>";
    });
    html += "</ul>";
    var alts = alternatives(p, t, f);
    html += "<h3 style='margin-top:14px'>🔄 替代思路</h3><ul>";
    alts.forEach(function (a) { html += "<li>" + a + "</li>"; });
    html += "</ul></div>";
    /* 可行组合矩阵 */
    html += "<div class='card'><h3 style='margin-top:0'>📌 " + PRODUCTS[p].name + " 的全部组合矩阵（红=不可行，黄=需谨慎，绿=可行）</h3>";
    html += "<table class='tbl'><tr><th>形态 \\ 期限</th><th>短期险</th><th>长期险</th></tr>";
    ["traditional", "dividend", "universal"].forEach(function (fm) {
      html += "<tr><td><b>" + FORMS[fm].name + "</b></td>";
      ["short", "long"].forEach(function (tm) {
        var st = evaluate(p, tm, fm).status;
        var lab = st === "ok" ? "✅ 可行" : (st === "warn" ? "⚠️ 谨慎" : "⛔ 不可行");
        var cls = st === "ok" ? "b-green" : (st === "warn" ? "b-amber" : "b-red");
        html += "<td><span class='badge " + cls + "'>" + lab + "</span></td>";
      });
      html += "</tr>";
    });
    html += "</table></div>";
  } else if (ev.status === "warn") {
    html += "<div class='banner warn'><h3>⚠️ 可以做，但有 " + ev.warns.length + " 项风险提示</h3><ul>";
    ev.warns.forEach(function (w) { html += "<li>" + w + "</li>"; });
    html += "</ul><p style='margin-top:8px;font-size:13.5px;color:#8a6d0b'>建议：与公司产品委员会和监管沟通确认后再立项，并把上述提示写入立项报告的风险章节。</p></div>";
  } else {
    html += "<div class='banner ok'><h3>✅ 此组合可行</h3><ul><li>" + PRODUCTS[p].name + " × " + TERMS[t].name + " × " + FORMS[f].name + " 属监管认可形态，可进入立项与条款设计阶段。</li><li>下方 8 大指导面板给出从形态到后端管理的全流程要点，每项均标注制度依据。</li></ul></div>";
  }
  box.innerHTML = html;
}

function renderPanels(p, t, f) {
  var panels = buildPanels(p, t, f);
  var host = $("panels");
  var html = "<h2 class='section-title' style='margin-top:26px'>八大指导面板</h2>";
  html += "<p style='color:var(--ink-soft);font-size:14px;margin-bottom:12px'>点击展开/收起。面板内容按当前组合动态生成。</p>";
  html += "<div class='panel-list'>";
  panels.forEach(function (pn, i) {
    html += "<div class='panel" + (i === 0 ? " open" : "") + "' id='" + pn.id + "'>";
    html += "<div class='panel-head' onclick=\"this.parentNode.classList.toggle('open')\">";
    html += "<div class='num'>" + (i + 1) + "</div>";
    html += "<div class='p-title'>" + pn.icon + " " + pn.title + "</div>";
    html += "<div class='arrow'>▶</div></div>";
    html += "<div class='panel-body'>" + pn.body + "</div></div>";
  });
  html += "</div>";
  host.innerHTML = html;
}

function runNavigator() {
  var p = $("sel-product").value;
  var t = $("sel-term").value;
  var f = $("sel-form").value;
  $("combo-text").innerHTML = "当前组合：<b>" + PRODUCTS[p].name + " × " + TERMS[t].name + " × " + FORMS[f].name + "</b>（" + TERMS[t].note + "；" + FORMS[f].note + "）";
  var ev = evaluate(p, t, f);
  renderBanner(ev, p, t, f);
  if (ev.status === "block") {
    $("panels").innerHTML = "";
  } else {
    renderPanels(p, t, f);
  }
  $("result-area").style.display = "block";
  $("result-area").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- 全景矩阵视图 ---------------- */
function buildMatrix() {
  var host = $("matrix-view");
  if (!host) return;
  var cols = [
    { t: "short", f: "traditional", label: "短期·传统" },
    { t: "short", f: "dividend",    label: "短期·分红" },
    { t: "short", f: "universal",   label: "短期·万能" },
    { t: "long",  f: "traditional", label: "长期·传统" },
    { t: "long",  f: "dividend",    label: "长期·分红" },
    { t: "long",  f: "universal",   label: "长期·万能" }
  ];
  var html = "<table class='matrix'><tr><th>险种 \\ 组合</th>";
  cols.forEach(function (c) { html += "<th>" + c.label + "</th>"; });
  html += "</tr>";
  Object.keys(PRODUCTS).forEach(function (p) {
    html += "<tr><td class='rowh'>" + PRODUCTS[p].name + "</td>";
    cols.forEach(function (c) {
      var ev = evaluate(p, c.t, c.f);
      var cls = ev.status === "ok" ? "ok" : (ev.status === "warn" ? "warn" : "block");
      var lab = ev.status === "ok" ? "可行" : (ev.status === "warn" ? "谨慎" : "不可行");
      var why = ev.status === "block"
        ? (ev.blocks[0] ? ev.blocks[0].r : "不可行")
        : (ev.status === "warn" ? (ev.warns[0] || "需谨慎") : "可行");
      var tip = (PRODUCTS[p].name + " × " + TERMS[c.t].name + " × " + FORMS[c.f].name + "：" + why)
        .replace(/"/g, "&quot;").replace(/'/g, "");
      html += "<td><span class='cell " + cls + "' title=\"" + tip + "\" onclick=\"matrixPick('" + p + "','" + c.t + "','" + c.f + "')\">" + lab + "</span></td>";
    });
    html += "</tr>";
  });
  html += "</table>";
  host.innerHTML = html;
}

function matrixPick(p, t, f) {
  $("sel-product").value = p;
  $("sel-term").value = t;
  $("sel-form").value = f;
  showView("combo");
  runNavigator();
}

var VIEWS = ["combo", "matrix", "wizard", "checklist"];

function showView(which) {
  VIEWS.forEach(function (v) {
    var el = $("view-" + v), tab = $("tab-" + v);
    if (el) el.style.display = (which === v) ? "block" : "none";
    if (tab) tab.classList.toggle("active", which === v);
  });
  if (which === "combo") window.scrollTo({ top: 0, behavior: "smooth" });
  if (which === "wizard") renderWizard();
  if (which === "checklist") renderChecklist();
}

/* ============================================================
   流程向导：渠道 → 保障意图 → 期限 → 形态 → 结果
   与组合查询/全景矩阵共用同一合法性引擎（evaluate）
   ============================================================ */
var WIZ = { step: 1, ch: null, intent: null, term: null, form: null };

var WIZ_CHANNELS = {
  agent: {
    name: "个险渠道", icon: "👥", desc: "个人营销员 / 个险队伍销售",
    notes: [
      "组合销售：主险 + 附加险搭配须在投保时明确告知为「保险产品组合」，不得捆绑强制搭售（保监人身险〔2017〕134号）。",
      "佣金与手续费合计不得超过产品报备的附加费用率——报行合一正从银保渠道向全渠道推开，费用假设虚高将在回溯中被问责。",
      "销售管理：犹豫期回访、可回溯管理按现行销售监管要求执行；分红、万能产品销售人员需具备相应资质并完成专项培训。"
    ]
  },
  banc: {
    name: "银保渠道", icon: "🏦", desc: "商业银行代理销售（报行合一首发渠道）",
    notes: [
      "报行合一首发渠道（金办便函〔2024〕66号）：附加费用率 = 可用总费用水平；佣金率上限、银保专员薪酬、培训及客户服务费、分摊固定费用须逐项列明。",
      "严禁账外支付：出单费、信息费等任何形式的账外利益输送是监管检查与处罚重点。",
      "最新加码（金寿险函〔2026〕65号，附问答一）：董事会每年至少听取一次银保渠道费用管理报告；总经理负总责，总精算师对产品设计环节负专责。",
      "产品端提示：银保客户对储蓄类产品接受度高，但费用空间受严格管制——定价附加费用率必须按渠道真实费用设定，不得为渠道「留费用」。"
    ]
  },
  internet: {
    name: "互联网渠道", icon: "💻", desc: "自营网络平台 / 互联网人身险业务",
    notes: [
      "产品范围仅五类（银保监办发〔2021〕108号）：意外险、健康险（护理险除外）、定期寿险、普通型终身寿险、普通型两全保险——<b>分红型 / 万能型 / 年金保险 / 护理险不得网销</b>。此约束已自动应用于本向导的筛选结果。",
      "定价回溯：互联网人身险业务试运行定价回溯机制（银保监办便函〔2021〕1275号），定价费用假设须与实际线上费用一致。",
      "信息披露：产品详情页须完整展示条款、费率表、风险提示与备案信息，投保流程须支持投保人自主操作、自主决策。",
      "以上口径以现行有效文件及监管沟通结论为准。"
    ]
  },
  broker: {
    name: "经代渠道", icon: "🤝", desc: "专业中介 / 保险经纪与代理",
    notes: [
      "报行合一同步覆盖中介渠道：通过专业中介销售的产品，佣金须真实、全额入账，且与报送监管的费用假设一致。",
      "虚列中介费用、套取费用是历年检查重点；费用分摊方法论参照《人身保险产品费用分摊指引》（中精协发〔2025〕86号）。",
      "产品设计阶段即应锁定合作中介的佣金结构与考核方案，防止「报行分离」——先报低费用、再以账外方式补足。"
    ]
  },
  group: {
    name: "团体渠道", icon: "🏢", desc: "团体投保（单位统保等）",
    notes: [
      "本导航仪按<b>个人人身险</b>规则校验；团体保险适用另行规则（投保单位资格、最低参保人数等），费率浮动与经验定价空间与个险不同，需单独论证。",
      "团体业务以短期险和补充医疗保障为主，长期险种团险化需评估逆选择控制与人员流动处理。",
      "借款人意外险等特定场景业务有专项自查清理要求（人身险部函〔2019〕231号）。"
    ]
  }
};

var WIZ_INTENTS = {
  death:       { name: "身故保障与传承", icon: "🛡️", desc: "家庭责任期身故杠杆 / 终身确定性传承", products: ["term", "whole"] },
  savings:     { name: "储蓄与养老规划", icon: "🏖️", desc: "满期给付 / 长期生存现金流",           products: ["endowment", "annuity"] },
  health:      { name: "疾病与医疗保障", icon: "🏥", desc: "重疾一次性给付 / 医疗费用报销",       products: ["disease", "medical"] },
  incapacity:  { name: "失能与长期护理", icon: "🧑‍🦽", desc: "收入中断补偿 / 长期照护状态给付",   products: ["disability", "care"] },
  accident:    { name: "意外保障",       icon: "⚡", desc: "意外身故/伤残，短期高杠杆",            products: ["accident"] }
};

var WIZ_STEPS = [
  { key: "ch",     label: "选渠道" },
  { key: "intent", label: "保障意图" },
  { key: "term",   label: "期限" },
  { key: "form",   label: "形态" },
  { key: "result", label: "结果" }
];

/* 渠道级约束（目前仅互联网渠道触发组合级排除） */
function wizChannelBlock(p, t, f) {
  if (WIZ.ch === "internet") {
    if (f === "dividend" || f === "universal")
      return { r: "分红型/万能型不在互联网人身险产品范围内", b: "银保监办发〔2021〕108号" };
    if (p === "care")
      return { r: "护理保险不得通过互联网渠道销售", b: "银保监办发〔2021〕108号" };
    if (p === "annuity")
      return { r: "年金保险不在互联网人身险产品范围内", b: "银保监办发〔2021〕108号" };
  }
  return null;
}

/* 各阶段候选集：stage 0=全部54，1=+渠道，2=+意图，3=+期限，4=+形态 */
function wizStage(stage) {
  var list = [];
  Object.keys(PRODUCTS).forEach(function (p) {
    ["short", "long"].forEach(function (t) {
      ["traditional", "dividend", "universal"].forEach(function (f) {
        var c = { p: p, t: t, f: f };
        if (stage >= 1 && wizChannelBlock(p, t, f)) return;
        if (stage >= 2 && WIZ.intent && WIZ.intent !== "any" && WIZ_INTENTS[WIZ.intent].products.indexOf(p) < 0) return;
        if (stage >= 3 && WIZ.term && WIZ.term !== "any" && t !== WIZ.term) return;
        if (stage >= 4 && WIZ.form && WIZ.form !== "any" && f !== WIZ.form) return;
        list.push(c);
      });
    });
  });
  return list;
}

/* 第 s 步（1..4）回答后被排除的组合及原因 */
function wizCutList(s) {
  if (s === 3 && WIZ.term === "any") return []; /* 不限：不做期限收窄 */
  if (s === 4 && WIZ.form === "any") return []; /* 不限：不做形态收窄 */
  var before = wizStage(s - 1), after = wizStage(s), cuts = [];
  var afterKey = {};
  after.forEach(function (c) { afterKey[c.p + "|" + c.t + "|" + c.f] = true; });
  var reason = null;
  if (s === 1) {
    if (WIZ.ch !== "internet") return cuts; /* 其他渠道无组合级约束 */
  } else if (s === 2) {
    reason = "需求定位收窄：不属于「" + WIZ_INTENTS[WIZ.intent].name + "」方向（本步为需求收窄，非监管排除）";
  } else if (s === 3) {
    reason = "期限定位收窄：与「" + TERMS[WIZ.term].name + "」不符（本步为需求收窄，非监管排除）";
  } else if (s === 4) {
    reason = "形态定位收窄：与「" + FORMS[WIZ.form].name + "」不符（本步为需求收窄，非监管排除）";
  }
  before.forEach(function (c) {
    if (afterKey[c.p + "|" + c.t + "|" + c.f]) return;
    var r = reason, b = "";
    if (s === 1) {
      var cb = wizChannelBlock(c.p, c.t, c.f);
      if (!cb) return;
      r = cb.r; b = cb.b;
    }
    cuts.push({ c: c, r: r, b: b });
  });
  return cuts;
}

function wizCutAnswerLabel(s) {
  if (s === 1) return WIZ_CHANNELS[WIZ.ch].name;
  if (s === 2) return WIZ_INTENTS[WIZ.intent].name;
  if (s === 3) return (WIZ.term === "any") ? "不限 · 对比两种期限" : TERMS[WIZ.term].name;
  if (s === 4) return (WIZ.form === "any") ? "不限 · 对比三种形态" : FORMS[WIZ.form].name;
  return "";
}

function wizComboName(c) {
  return PRODUCTS[c.p].name + " × " + TERMS[c.t].name + " × " + FORMS[c.f].name;
}

function wizFunnelHtml(uptoStage) {
  var labels = ["全部组合", "渠道约束后", "保障意图后", "期限定位后", "形态定位后"];
  var html = "<div class='wiz-funnel'>";
  for (var s = 0; s <= uptoStage; s++) {
    if (s > 0) html += "<span class='f-arrow'>→</span>";
    var n = wizStage(s).length;
    var dim = (s === 0 && uptoStage > 0) ? " dim" : "";
    html += "<span class='f-stage" + dim + "'>" + labels[s] + " <span class='f-n'>" + n + "</span></span>";
  }
  html += "</div>";
  return html;
}

function wizCutHtml(s) {
  var cuts = wizCutList(s);
  if (!cuts.length) return "";
  var ans = wizCutAnswerLabel(s);
  var html = "<details class='wiz-cut'><summary class='wc-head'>⛔ 刚才的选择（" + ans + "）排除了 " + cuts.length + " 个组合 · 点击展开原因</summary><ul>";
  cuts.forEach(function (x) {
    html += "<li>" + wizComboName(x.c) + "——" + x.r + (x.b ? "（" + x.b + "）" : "") + "</li>";
  });
  html += "</ul></details>";
  return html;
}

function wizOptCard(sel, val, icon, title, desc, fn) {
  return "<div class='opt-card" + (sel ? " sel" : "") + "' onclick=\"" + fn + "('" + val + "')\">" +
    "<div class='oc-ico'>" + icon + "</div><div><div class='oc-t'>" + title + "</div><div class='oc-d'>" + desc + "</div></div></div>";
}

function wizSetCh(v)     { wizSet("ch", v); }
function wizSetIntent(v) { wizSet("intent", v); }
function wizSetTerm(v)   { wizSet("term", v); }
function wizSetForm(v)   { wizSet("form", v); }

function wizSet(key, val) {
  WIZ[key] = val;
  var idx = 0;
  for (var i = 0; i < WIZ_STEPS.length; i++) if (WIZ_STEPS[i].key === key) idx = i;
  WIZ.step = idx + 2;
  renderWizard();
  $("view-wizard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function wizGoto(n) {
  WIZ.step = n;
  renderWizard();
}

function wizReset() {
  WIZ = { step: 1, ch: null, intent: null, term: null, form: null };
  renderWizard();
}

function renderWizard() {
  var stepsHost = $("wiz-steps"), bodyHost = $("wiz-body");
  if (!stepsHost) return;

  /* 步骤条 */
  var html = "";
  WIZ_STEPS.forEach(function (st, i) {
    var n = i + 1;
    var cls = n < WIZ.step ? " done" : (n === WIZ.step ? " cur" : "");
    var click = n < WIZ.step ? " onclick=\"wizGoto(" + n + ")\"" : "";
    html += "<div class='wiz-step" + cls + "'" + click + " title=\"" + st.label + "\"><span class='ws-num'>" + n + "</span>" + st.label + "</div>";
  });
  stepsHost.innerHTML = html;

  /* 各步骤正文 */
  var bh = "";
  if (WIZ.step === 1) {
    bh += "<div class='wiz-q'>第一步 · 这款产品主要通过什么渠道销售？</div>";
    bh += "<div class='wiz-qsub'>渠道决定费用空间与监管约束——选择互联网渠道将触发产品范围硬约束（108号文）。</div>";
    bh += "<div class='opt-grid'>";
    Object.keys(WIZ_CHANNELS).forEach(function (k) {
      var ch = WIZ_CHANNELS[k];
      bh += wizOptCard(WIZ.ch === k, k, ch.icon, ch.name, ch.desc, "wizSetCh");
    });
    bh += "</div>";
  } else if (WIZ.step === 2) {
    bh += wizCutHtml(1);
    bh += "<div class='wiz-q'>第二步 · 这次开发想解决客户的什么核心需求？</div>";
    bh += "<div class='wiz-qsub'>先定保障意图，再倒推产品类型——「以消费者需求为中心、以风险保障功能为基础」正是134号文确立的产品开发导向。</div>";
    bh += "<div class='opt-grid'>";
    Object.keys(WIZ_INTENTS).forEach(function (k) {
      var it = WIZ_INTENTS[k];
      var prods = it.products.map(function (p) { return PRODUCTS[p].name; }).join("、");
      bh += wizOptCard(WIZ.intent === k, k, it.icon, it.name, it.desc + "｜对应险种：" + prods, "wizSetIntent");
    });
    bh += "</div>";
    bh += wizFunnelHtml(2);
  } else if (WIZ.step === 3) {
    bh += wizCutHtml(2);
    bh += "<div class='wiz-q'>第三步 · 保障期限怎么定位？</div>";
    bh += "<div class='wiz-qsub'>期限不只是产品参数——它决定了适用哪套精算规定、能否做分红/万能、以及准备金评估口径。</div>";
    bh += "<div class='opt-grid'>";
    bh += wizOptCard(WIZ.term === "short", "short", "⏱️", "短期险", TERMS.short.note, "wizSetTerm");
    bh += wizOptCard(WIZ.term === "long", "long", "📅", "长期险", TERMS.long.note, "wizSetTerm");
    bh += wizOptCard(WIZ.term === "any", "any", "🔍", "不限 · 两种都看看", "保持两种期限，在结果中对比可行性", "wizSetTerm");
    bh += "</div>";
    bh += wizFunnelHtml(3);
  } else if (WIZ.step === 4) {
    bh += wizCutHtml(3);
    bh += "<div class='wiz-q'>第四步 · 利益形态有偏好吗？</div>";
    bh += "<div class='wiz-qsub'>传统型利益确定；分红型让客户分享盈余（红利演示受上限公式管制）；万能型账户运作（最低保证利率+结算利率）。</div>";
    bh += "<div class='opt-grid'>";
    bh += wizOptCard(WIZ.form === "traditional", "traditional", "🔒", "传统型", FORMS.traditional.note, "wizSetForm");
    bh += wizOptCard(WIZ.form === "dividend", "dividend", "🍅", "分红型", FORMS.dividend.note, "wizSetForm");
    bh += wizOptCard(WIZ.form === "universal", "universal", "📊", "万能型", FORMS.universal.note, "wizSetForm");
    bh += wizOptCard(WIZ.form === "any", "any", "🔍", "不限 · 帮我比较", "保持三种形态，在结果中对比可行性", "wizSetForm");
    bh += "</div>";
    bh += wizFunnelHtml(4);
  } else {
    bh += renderWizResult();
  }

  /* 底部导航按钮 */
  if (WIZ.step > 1 && WIZ.step <= 4) {
    bh += "<div class='wiz-nav'><button class='wiz-btn' onclick=\"wizGoto(" + (WIZ.step - 1) + ")\">← 上一步</button>";
    bh += "<button class='wiz-btn' onclick=\"wizReset()\">重新开始</button></div>";
  }
  bodyHost.innerHTML = bh;
}

function renderWizResult() {
  var final = wizStage(4);
  var good = [], warn = [], blocked = [];
  final.forEach(function (c) {
    var ev = evaluate(c.p, c.t, c.f);
    if (ev.status === "ok") good.push({ c: c, ev: ev });
    else if (ev.status === "warn") warn.push({ c: c, ev: ev });
    else blocked.push({ c: c, ev: ev });
  });

  var ch = WIZ_CHANNELS[WIZ.ch];
  var html = "<div class='wiz-q'>🧭 向导结果 · " + ch.icon + " " + ch.name + "方向的产品建议</div>";
  html += "<div class='wiz-qsub'>以下结果由组合合法性引擎实时判定（与组合查询、全景矩阵共用同一套规则与制度依据）。</div>";
  html += wizFunnelHtml(4);
  html += "<div class='wiz-funnel' style='margin-top:8px'><span class='f-stage'>其中 <span class='f-n' style='color:var(--green)'>" + good.length + "</span> 个可行</span><span class='f-stage'><span class='f-n' style='color:var(--amber)'>" + warn.length + "</span> 个需谨慎</span><span class='f-stage'><span class='f-n' style='color:var(--tomato)'>" + blocked.length + "</span> 个被监管排除</span></div>";
  html += wizCutHtml(4);

  /* 推荐组合 */
  if (good.length) {
    html += "<h3 style='margin-top:22px'>✅ 推荐可行组合（" + good.length + "）</h3>";
    html += "<p style='font-size:13.5px;color:var(--ink-soft)'>点击任意组合，跳转查看该组合的 8 大指导面板（形态/条款/定价/利润/准备金/演示/分红实现率/后端管理）。</p>";
    good.forEach(function (g) {
      html += "<div class='wiz-result-combo good' onclick=\"wizPickCombo('" + g.c.p + "','" + g.c.t + "','" + g.c.f + "')\">" +
        "<div class='rc-name'>" + wizComboName(g.c) + "</div>" +
        "<div class='rc-why'>监管认可形态，可进入立项</div>" +
        "<div class='rc-go'>查看 8 大面板 →</div></div>";
    });
  }

  /* 谨慎组合 */
  if (warn.length) {
    html += "<h3 style='margin-top:22px'>⚠️ 可行但需谨慎（" + warn.length + "）</h3>";
    warn.forEach(function (w) {
      var first = w.ev.warns[0] || "";
      if (first.length > 80) first = first.slice(0, 80) + "……";
      html += "<div class='wiz-result-combo warn' onclick=\"wizPickCombo('" + w.c.p + "','" + w.c.t + "','" + w.c.f + "')\">" +
        "<div class='rc-name'>" + wizComboName(w.c) + "</div>" +
        "<div class='rc-why'>" + first + "</div>" +
        "<div class='rc-go'>查看详情 →</div></div>";
    });
  }

  /* 被监管排除 */
  if (blocked.length) {
    html += "<details class='wiz-cut' style='margin-top:18px'><summary class='wc-head'>⛔ 在你的条件下被监管排除的组合（" + blocked.length + "）· 点击展开依据</summary><ul>";
    blocked.forEach(function (b) {
      b.ev.blocks.forEach(function (bl) {
        html += "<li><b>" + wizComboName(b.c) + "</b>——" + bl.r + "（" + bl.b + "）</li>";
      });
    });
    html += "</ul></details>";
  }

  if (!good.length && !warn.length) {
    html += "<div class='banner block' style='margin-top:16px'><h3>⛔ 当前条件下没有可行组合</h3><ul><li>全部候选组合均被监管规则排除，展开上方清单查看逐项依据。</li><li>建议：返回调整期限或形态定位（如改选「不限」做对比），或参考排除依据中的替代思路重新立项。</li></ul></div>";
  }

  /* 渠道合规要点 */
  html += "<h3 style='margin-top:24px'>" + ch.icon + " " + ch.name + " · 合规要点</h3><div class='card'><ul style='padding-left:20px;font-size:14.5px'>";
  ch.notes.forEach(function (n) { html += "<li style='margin-bottom:6px'>" + n + "</li>"; });
  html += "</ul></div>";

  html += "<div class='wiz-nav'><button class='wiz-btn' onclick=\"wizGoto(4)\">← 调整形态</button>" +
    "<button class='wiz-btn' onclick=\"showView('matrix')\">切换全景矩阵看全貌</button>" +
    "<button class='wiz-btn primary' onclick=\"wizReset()\">重新开始</button></div>";
  return html;
}

function wizPickCombo(p, t, f) {
  $("sel-product").value = p;
  $("sel-term").value = t;
  $("sel-form").value = f;
  showView("combo");
  runNavigator();
}

/* ============================================================
   里程碑检查清单（开发自查表）：7 里程碑 · 可勾选 · 本机保存 · 可导出
   依据口径与全站一致：监管制度 > 工作手册、新制度 > 旧制度
   ============================================================ */
var MILESTONES = [
  {
    id: "m1", icon: "🎯", title: "里程碑一 · 立项与可行性论证",
    items: [
      { t: "组合合法性校验：险种 × 期限 × 形态经本导航仪校验为「可行」；「谨慎」组合（如健康险 × 分红）立项前先与监管沟通", b: "2019年第3号令；金发〔2025〕34号（分红型长期健康险开闸条件）", pit: "短期 × 分红/万能、护理 × 短期等非法组合直接不予备案，勿抱侥幸" },
      { t: "死亡保险金额比例达标：投保年龄≤40岁≥160%、41~60岁≥140%、61岁及以上≥120%", b: "保监发〔2016〕76号", pit: "增额终身寿/两全设计压缩身故杠杆，被要求重新设计保障责任" },
      { t: "预定利率不超现行上限，并持续跟踪研究值与市场利率走向（LPR、5年定存、10年期国债）", b: "金发〔2024〕18号（上限+动态调整机制）", pit: "研究值触发下调后仍按旧上限报备，监管沟通返工" },
      { t: "渠道费用空间初判：报行合一框架下，定价附加费用率 = 渠道真实可用费用水平", b: "金办便函〔2024〕66号；金寿险函〔2026〕65号", pit: "为渠道「留费用」虚高费用假设，回溯与检查重点" },
      { t: "网销适用性判断（如计划网销）：仅五类产品可网销——意外险、健康险（护理险除外）、定期寿险、普通型终身寿险、普通型两全", b: "银保监办发〔2021〕108号", pit: "分红/万能/年金/护理险挂网销售，直接违反产品范围规定" }
    ]
  },
  {
    id: "m2", icon: "📜", title: "里程碑二 · 条款设计与命名",
    items: [
      { t: "产品命名规范：含险种类别与设计类型（分红型/万能型）字样，与实际形态一致", b: "2011年第3号令（人身保险公司保险条款和保险费率管理办法）", pit: "命名与形态不符或漏「分红型/万能型」标识" },
      { t: "按示范条款体系起草，逐项做与示范条款的差异说明", b: "示范条款体系；重疾定义按中保协发〔2020〕73号（2020修订版）", pit: "擅改核心责任表述且未作差异说明，被要求补正" },
      { t: "责任免除逐项列明并作足以引起注意的显著提示（黑体等）", b: "2011年第3号令", pit: "免责条款提示不足，既有驳回风险也有后续理赔纠纷风险" },
      { t: "健康险专项：等待期、犹豫期、续保表述明确；短期健康险不得含保证续保或变相暗示", b: "2019年第3号令（健康保险管理办法）；银保监办发〔2021〕7号", pit: "续保条款表述含糊，被认定变相保证续保" },
      { t: "分红/万能条款专项：红利不确定性声明、最低保证利率与结算利率公告方式、初始费用/退保费用表完整列示", b: "保监发〔2015〕93号、19号；2022年第8号令", pit: "条款与说明书、演示表三套材料口径不一致" },
      { t: "年金生存金给付设计：起领不早于保单生效后5年，每期给付不超过已交保费的20%", b: "保监人身险〔2017〕134号", pit: "快返型年金设计触碰134号红线" }
    ]
  },
  {
    id: "m3", icon: "⚙️", title: "里程碑三 · 定价三参数",
    items: [
      { t: "预定发生率选表：寿险业务按生命表（2025）四类表选表——养老类业务用养老类表，非养老业务区分表一/表二；2026-01-01起适用", b: "金规〔2025〕21号；中精协发〔2025〕80号", pit: "养老与非养老业务选表错配，评估口径被质疑" },
      { t: "意外险发生率采用意外伤害保险发生率表（2021），按年龄/职业分类适用", b: "中精协发〔2021〕14号", pit: "自定发生率无行业表或经验数据支持" },
      { t: "重疾发生率与《重大疾病保险的疾病定义使用规范（2020修订版）》衔接，定价发生率落入合理区间", b: "中保协发〔2020〕73号；银保监发〔2020〕51号", pit: "疾病定义口径与发生率口径不一致（28种重疾内外差异）" },
      { t: "预定利率执行现行上限（普通型/分红型/万能型分别核定，普通2.0%/分红1.75%/万能1.0%，动态调整机制下以最新公布为准），报备路径确认：不超上限备案、超上限审批", b: "金发〔2024〕18号 + 动态调整机制（2025-01通知，金寿险函〔2025〕10号口径）", pit: "报备路径选错；或按已废止的旧上限口径定价" },
      { t: "预定附加费用率按渠道真实费用设定，与其余报备材料口径一致（银保渠道逐项列明佣金率上限等）", b: "金办便函〔2024〕66号；金寿险函〔2026〕65号", pit: "定价费用率与报备费用表「两套数」" },
      { t: "定价假设文档化：假设来源、公司经验分析、与利润测试假设的一致性说明留痕", b: "银保监办发〔2020〕7号；金办便函〔2026〕616号（精算假设管理）", pit: "假设取值无记录无出处，回溯时无法解释" }
    ]
  },
  {
    id: "m4", icon: "📈", title: "里程碑四 · 利润测算与敏感性",
    items: [
      { t: "利润测试六大假设齐备：预定发生率、净投资收益率、贴现率、总费用率、通胀率、脱退率（退保率）", b: "银保监办发〔2020〕7号（利润测试要求）", pit: "假设表缺项（尤其通胀率与脱退率），精算报告被打回补充" },
      { t: "利润指标多口径呈现：新业务利润率、ROP（现金流回本年期）等，避免单一指标选择性呈现", b: "银保监办发〔2020〕7号", pit: "只报好指标、隐去不利指标，总精算师审签风险" },
      { t: "不利情景敏感性测试：发生率上调、投资收益率下调、退保率上升至少各一档", b: "银保监办发〔2020〕7号", pit: "只测基准情景，不利情景失守无预案" },
      { t: "分红产品红利演示上限公式：红利上限 = (V₀ + P) × 利差 × 70%；演示档数自银保监规〔2022〕24号起为两档（保证利益演示利差=0、红利利益演示利差≤4.5%−产品预定利率），原93号文低/中/高三档（含6%−预定利率高档）已取消", b: "银保监办发〔2020〕6号（红利上限公式）+ 银保监规〔2022〕24号（两档演示口径）", pit: "沿用93号贡献法三档旧口径做演示，与现行两档披露口径打架" },
      { t: "万能产品演示：低档按最低保证利率、高档与实际结算水平挂钩不得虚高，演示含初始费用等扣除过程", b: "保监发〔2015〕19号；银保监规〔2022〕24号", pit: "高档演示利率虚高，上市后结算利率追不上演示引发投诉" }
    ]
  },
  {
    id: "m5", icon: "🏛️", title: "里程碑五 · 准备金与现金价值",
    items: [
      { t: "现金价值计算：扣除首日费用后按净保费与预定利率计算，首年退保金不为负、与条款退保描述一致", b: "银保监办发〔2020〕7号（现金价值相关规定）", pit: "现价表首年为负或与条款退保金表述对不上" },
      { t: "未到期责任准备金评估利率不超过规定上限（区分普通型与分红/万能口径），与定价利率口径分开管理", b: "银保监办发〔2019〕182号及后续调整", pit: "用定价利率直接当评估利率，准备金口径错误" },
      { t: "重疾险评估发生率不得低于重疾表规定的下限（K1~K3对应口径）", b: "银保监发〔2020〕51号", pit: "评估发生率低于下限，准备金计提不足" },
      { t: "万能准备金三部分齐备：账户准备金 + 最低保证利率准备金 + 其他保单利益准备金；单独账户管理、同一账户统一结算利率", b: "保监发〔2015〕19号；金规〔2025〕14号（万能新规）", pit: "漏提最低保证利率准备金；多账户混同运作" },
      { t: "分红特别储备平滑机制：可分配盈余为正方可分配，特别储备不低于0、逐年滚存", b: "保监发〔2015〕93号", pit: "特别储备为负仍分红，分红实现率披露口径出问题" }
    ]
  },
  {
    id: "m6", icon: "📦", title: "里程碑六 · 报备材料与负面清单自查",
    items: [
      { t: "报备材料齐全：条款、费率表、现金价值表、精算报告、总精算师声明书等要素完整", b: "2011年第3号令", pit: "缺精算报告或声明书要素不全，形式审查即退回" },
      { t: "负面清单逐条自查（最新版），条款表述、产品命名、利益设计逐项排查", b: "金寿险函〔2026〕72号（人身保险产品「负面清单」2026版）", pit: "触碰负面清单雷区（如变相理财表述、免责扩大化、炒作停售）" },
      { t: "说明书、投保提示书、利益演示与条款四套材料数字一致", b: "2022年第8号令；银保监规〔2022〕24号", pit: "三套材料数字对不上，形式审查退回补正" },
      { t: "费用率表与精算报告、利润测试假设同源一致（报行合一口径）", b: "金办便函〔2024〕66号；中精协发〔2025〕86号（费用分摊指引）", pit: "报备材料之间互相打架，费用口径被追问" },
      { t: "网销产品信息披露页完整（如适用）：条款、费率表、风险提示、备案信息全展示", b: "银保监办发〔2021〕108号；银保监办便函〔2021〕1275号", pit: "网销信息披露缺项或投保流程非自主操作" }
    ]
  },
  {
    id: "m7", icon: "🔄", title: "里程碑七 · 上市后管理与回溯",
    items: [
      { t: "分红实现率年度披露：按规则时限在官网披露上一年度分红型产品的红利实现率（现金红利/增额红利分别计算）", b: "银保监规〔2022〕24号", pit: "漏披露、迟披露或计算口径错误（演示红利基数用错）" },
      { t: "万能结算利率定期公告且与单独账户实际投资收益挂钩", b: "保监发〔2015〕19号；金规〔2025〕14号", pit: "结算利率与账户收益脱钩、长期高于可实现收益" },
      { t: "定价回溯：实际发生率/费用/退保与定价假设的偏差分析，必要时启动产品修订", b: "金发〔2024〕18号；银保监办发〔2020〕7号", pit: "回溯流于形式，偏差大不整改，检查问责" },
      { t: "精算假设全流程管理：假设变更审批留痕、定期复核机制", b: "金办便函〔2026〕616号（精算假设管理）", pit: "假设随意调整无审批记录" },
      { t: "产品总结报告按期报送，数据质量经复核", b: "保监寿险〔2010〕360号", pit: "逾期报送或数据口径错误" },
      { t: "停售管理：停售信息及时披露，存量保单服务不断档", b: "2022年第8号令（信息披露管理）", pit: "突然停售、炒作停售引发集中退保与投诉" }
    ]
  }
];

var CL_KEY = "xh_pakb_checklist_v1";
var CL_STATE = { name: "", checks: {}, collapsed: {} };

function clLoad() {
  try {
    var raw = localStorage.getItem(CL_KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === "object") {
        CL_STATE.name = o.name || "";
        CL_STATE.checks = o.checks || {};
        CL_STATE.collapsed = o.collapsed || {};
      }
    }
  } catch (e) { /* localStorage 不可用时静默降级为会话内存 */ }
}

function clSave() {
  try { localStorage.setItem(CL_KEY, JSON.stringify(CL_STATE)); } catch (e) {}
}

function clItemTotal() {
  var n = 0;
  MILESTONES.forEach(function (m) { n += m.items.length; });
  return n;
}

function clDoneCount() {
  var n = 0;
  Object.keys(CL_STATE.checks).forEach(function (k) { if (CL_STATE.checks[k]) n++; });
  return n;
}

function renderChecklist() {
  var host = $("cl-list");
  if (!host) return;
  var nameEl = $("cl-name");
  if (nameEl && !nameEl._bound) {
    nameEl.value = CL_STATE.name;
    nameEl.addEventListener("input", function () {
      CL_STATE.name = nameEl.value;
      clSave();
    });
    nameEl._bound = true;
  }
  var html = "";
  MILESTONES.forEach(function (m, mi) {
    var done = 0;
    var itemsHtml = "";
    m.items.forEach(function (it, ii) {
      var id = m.id + "-" + (ii + 1);
      var checked = !!CL_STATE.checks[id];
      if (checked) done++;
      itemsHtml +=
        "<div class='cl-item" + (checked ? " checked" : "") + "'>" +
          "<input type='checkbox' id='ck-" + id + "'" + (checked ? " checked" : "") + " onchange=\"clToggle('" + id + "')\">" +
          "<div class='cl-itext'>" +
            "<div class='cl-it' onclick=\"clToggle('" + id + "')\">" + it.t + "</div>" +
            "<div class='cl-ib'>制度依据：<span class='cl-doc'>" + it.b + "</span></div>" +
            "<div class='cl-pit'>" + it.pit + "</div>" +
          "</div>" +
        "</div>";
    });
    var allDone = done === m.items.length;
    var collapsed = !!CL_STATE.collapsed[m.id];
    html +=
      "<div class='cl-ms" + (allDone ? " done" : "") + "'>" +
        "<div class='cl-ms-head' onclick=\"clToggleMs('" + m.id + "')\">" +
          "<span style='font-size:19px'>" + m.icon + "</span>" +
          "<span class='cl-ms-title'>" + m.title + "</span>" +
          "<span class='cl-ms-count'><b>" + done + "</b> / " + m.items.length + " 项" + (collapsed ? " ▸" : " ▾") + "</span>" +
        "</div>" +
        "<div class='cl-ms-body" + (collapsed ? " hidden" : "") + "'>" + itemsHtml + "</div>" +
      "</div>";
  });
  host.innerHTML = html;
  clProgressUpdate();
}

function clProgressUpdate() {
  var total = clItemTotal(), done = clDoneCount();
  var pct = total ? Math.round(done * 100 / total) : 0;
  var p = $("cl-pct"), bar = $("cl-bar"), sum = $("cl-summary");
  if (p) p.textContent = pct + "%";
  if (bar) bar.style.width = pct + "%";
  if (sum) {
    var txt = "已完成 " + done + " / " + total + " 项 · 勾选状态自动保存在本机浏览器";
    if (done === total && total > 0) txt = "🎉 全部 " + total + " 项完成 · " + txt;
    sum.textContent = txt;
  }
}

function clToggle(id) {
  CL_STATE.checks[id] = !CL_STATE.checks[id];
  clSave();
  renderChecklist();
}

function clToggleMs(mid) {
  CL_STATE.collapsed[mid] = !CL_STATE.collapsed[mid];
  clSave();
  renderChecklist();
}

function clReset() {
  if (typeof confirm === "function" && !confirm("确定清空全部勾选与项目名称？此操作不可撤销。")) return;
  CL_STATE = { name: "", checks: {}, collapsed: {} };
  clSave();
  renderChecklist();
}

/* 导出独立 HTML 自查表（可归档、可传阅、可打印） */
function clExport() {
  var total = clItemTotal(), done = clDoneCount();
  var pct = total ? Math.round(done * 100 / total) : 0;
  var dateStr = new Date().toLocaleDateString("zh-CN");
  var name = CL_STATE.name || "（未填写项目名）";

  var rows = "";
  MILESTONES.forEach(function (m) {
    var mDone = 0;
    var trs = "";
    m.items.forEach(function (it, ii) {
      var id = m.id + "-" + (ii + 1);
      var checked = !!CL_STATE.checks[id];
      if (checked) mDone++;
      trs +=
        "<tr>" +
          "<td class='ck'>" + (checked ? "☑" : "☐") + "</td>" +
          "<td>" + it.t + "</td>" +
          "<td class='b'>" + it.b + "</td>" +
          "<td class='pit'>" + it.pit + "</td>" +
        "</tr>";
    });
    rows +=
      "<h2>" + m.icon + " " + m.title + " <span class='cnt'>(" + mDone + "/" + m.items.length + ")</span></h2>" +
      "<table><tr><th class='ck'>✔</th><th>检查项</th><th>制度依据</th><th>驳回高发点</th></tr>" + trs + "</table>";
  });

  var html =
    "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>" +
    "<title>产品开发自查表 · " + name + "</title><style>" +
    "body{font-family:'Microsoft YaHei',system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 18px;color:#2d2a25;line-height:1.6}" +
    "header{border-bottom:3px solid #c0392b;padding-bottom:10px;margin-bottom:16px}" +
    "header h1{font-size:21px;margin:0 0 4px}header .meta{font-size:13px;color:#7a7365}" +
    ".bar{background:#efe9dc;border-radius:6px;padding:10px 14px;font-size:14px;margin-bottom:18px}" +
    "h2{font-size:15.5px;margin:22px 0 8px;color:#96281b}.cnt{font-weight:400;font-size:12.5px;color:#8d8578}" +
    "table{border-collapse:collapse;width:100%;font-size:13px}" +
    "th,td{border:1px solid #ddd5c4;padding:7px 9px;text-align:left;vertical-align:top}" +
    "th{background:#f6f1e9}td.ck{text-align:center;font-size:15px;width:34px}" +
    "td.b{color:#8a6d3b;width:26%}td.pit{color:#a93226;width:26%}" +
    "footer{margin-top:22px;padding-top:10px;border-top:1px dashed #d8d0c0;font-size:12px;color:#8d8578}" +
    "@media print{body{margin:0}}" +
    "</style></head><body>" +
    "<header><h1>🍅 产品开发自查表 · 西红精算</h1>" +
    "<div class='meta'>项目：" + name + " ｜ 导出日期：" + dateStr + " ｜ 总体完成度：" + pct + "%（" + done + "/" + total + " 项）</div></header>" +
    "<div class='bar'>口径说明：本表按「监管制度 > 工作手册、新制度 > 旧制度」编写；内容为精算实务交流整理，报备以监管现行有效文件及沟通结论为准。</div>" +
    rows +
    "<footer>🍅 西红精算 · 保险产品精算AI助手（第一阶段：产品开发篇）生成</footer>" +
    "</body></html>";

  var blob = new Blob([html], { type: "text/html;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.download = "产品开发自查表-" + stamp + ".html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

document.addEventListener("DOMContentLoaded", function () {
  ["sel-product", "sel-term", "sel-form"].forEach(function (id) {
    $(id).addEventListener("change", runNavigator);
  });
  $("btn-run").addEventListener("click", runNavigator);
  buildMatrix();
  renderWizard();
  clLoad();
  // 反向锚点：报行合一专页等页面链接 navigator.html#panel3 时，自动运行并定位到面板③
  if (location.hash === "#panel3" || location.hash === "#panel-fee") {
    runNavigator();
    setTimeout(function () {
      var el = document.getElementById("panel-fee");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }
});
