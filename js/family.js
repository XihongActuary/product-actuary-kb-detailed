"use strict";
/* ============================================================
   保险大白话 · 客户投保问答 交互脚本
   1) 场景卡开关  2) 人话翻译机  3) 大白话小测验
   ============================================================ */

/* ---------- 1) 场景卡开关 ---------- */
function sceneToggle(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var isOpen = el.classList.contains("open");
  /* 一次只展开一张卡，页面更清爽 */
  var all = document.querySelectorAll(".scene");
  for (var i = 0; i < all.length; i++) all[i].classList.remove("open");
  if (!isOpen) el.classList.add("open");
}

/* ---------- 2) 人话翻译机 ---------- */
var TRANS = [
  { term: "犹豫期", alias: "无理由退货期", emoji: "🔄",
    say: "收到保单后10天内（银行买的15天）后悔了，可以全额退钱，最多扣10块钱工本费。",
    eg: "就像网购的7天无理由退货，保险给的后悔期还更长一点。" },
  { term: "等待期", alias: "刚买的「实习期」", emoji: "⏳",
    say: "保险刚生效的头30到180天，这段时间生病保险公司不赔。",
    eg: "防止有人已经查出病了才跑来买保险。熬过等待期，保障就正式上岗。" },
  { term: "免赔额", alias: "保险公司不赔的「起步价」", emoji: "🚧",
    say: "免赔额1万 = 1万块钱以内自己掏，超出的部分保险公司才报销。",
    eg: "住院花了6万：自己出1万，剩下5万按规则报销。" },
  { term: "现金价值", alias: "退保时能拿回的钱", emoji: "💰",
    say: "中途不想要这份保单了，退保拿回来的钱就叫现金价值。头几年特别少，越往后越多。",
    eg: "交了2万退保可能只拿回几千块——所以买之前想清楚，退保要三思。" },
  { term: "保额", alias: "出事赔多少", emoji: "🛡️",
    say: "买50万保额，得了大病或出了事，就赔50万。保额是「赔多少」，跟「交多少」是两码事。",
    eg: "同样买重疾险，保30万和保50万，交的钱不一样，赔的也不一样。" },
  { term: "保费", alias: "你交多少钱", emoji: "🧾",
    say: "就是买这份保险要交的钱。可以一次交清，也可以分成10年、20年慢慢交。",
    eg: "「一年保费800块」= 这份保险一年交800块。" },
  { term: "给付型", alias: "达标直接给一笔钱", emoji: "🎁",
    say: "达到条件（比如确诊大病）就直接赔一笔钱，不管你实际花了多少、这钱拿去干嘛。",
    eg: "重疾险赔的50万，治病也好、还房贷也好，钱给了你随便用。" },
  { term: "报销型", alias: "花多少报多少", emoji: "🧮",
    say: "凭发票报销，花了多少按规则报多少，报的钱不会超过实际花费和保额。",
    eg: "医疗险就是报销型——报销型买十份也只报实际花的钱，别重复买。" },
  { term: "宽限期", alias: "忘了交钱的缓冲期", emoji: "⏰",
    say: "分期交费没赶上，有60天缓冲期。这60天里保单照样有效，出事照赔，把保费补上就行。",
    eg: "手头紧晚交了一个月，别慌，60天以内补上，保障不断档。" },
  { term: "健康告知", alias: "买之前的「体检问卷」", emoji: "📋",
    say: "投保前保险公司问你身体状况，问什么答什么，如实填。隐瞒的代价是理赔时被拒赔。",
    eg: "问到「近两年是否住院过」，住过就如实写——保险公司理赔时是有权查的。" },
  { term: "除外责任", alias: "合同里的「不管」清单", emoji: "🚫",
    say: "这些情况保险公司不赔，会在条款里一条条列出来，买之前要看一眼。",
    eg: "常见的有：酒驾出事、故意自伤、违法犯罪期间出事。" },
  { term: "分红", alias: "保险公司的「年终奖」", emoji: "🎈",
    say: "分红跟着保险公司实际经营走，可多可少，也可能一分没有——分红不保证。",
    eg: "演示表里的高中低档只是「演算」，不是承诺。看分红历史，别看演示数字。" }
];

var trSel = 0;

function trPick(idx) {
  trSel = idx;
  var t = TRANS[idx];
  document.getElementById("tr-emoji").textContent = t.emoji;
  document.getElementById("tr-term").textContent = t.term;
  document.getElementById("tr-alias").textContent = "人话叫：" + t.alias;
  document.getElementById("tr-say").textContent = t.say;
  document.getElementById("tr-eg").textContent = "比方说：" + t.eg;
  var chips = document.querySelectorAll(".term-chip");
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle("on", i === idx);
  }
}

function buildTerms() {
  var grid = document.getElementById("term-grid");
  if (!grid) return;
  var html = "";
  for (var i = 0; i < TRANS.length; i++) {
    html += '<button type="button" class="term-chip' + (i === 0 ? " on" : "") +
            '" onclick="trPick(' + i + ')">' + TRANS[i].term + '</button>';
  }
  grid.innerHTML = html;
}

/* ---------- 3) 大白话小测验 ---------- */
var QUIZ = [
  { q: "刚买了保险后悔了，想全额退钱，得赶在什么时候？",
    opts: ["什么时候退都行，全额退", "收到保单后10天内（犹豫期）", "永远退不了"],
    a: 1,
    why: "这10天（银行买的15天）叫「犹豫期」，是保险的无理由退货期。过了犹豫期再退，只能拿回「现金价值」，头几年退会亏不少。" },
  { q: "百万医疗险写着「免赔额1万」，是什么意思？",
    opts: ["保险公司每次先赔1万给我", "每年要交1万块保费", "1万以内自己掏，超出的部分才报销"],
    a: 2,
    why: "免赔额是保险公司不赔的「起步价」。住院花6万：自己出1万，剩下5万按规则报。" },
  { q: "分红险演示表里的「高档分红」，能当成承诺吗？",
    opts: ["能，白纸黑字印着的", "不能，分红不保证，可能一分没有", "看销售怎么说"],
    a: 1,
    why: "演示只是演算，不是承诺。分红随实际经营浮动，可能多、可能少、也可能为零。合同里「保证」的部分才作数。" },
  { q: "填健康问卷时，五年前住过院，直接全填「否」行吗？",
    opts: ["不行，要如实填，隐瞒可能被拒赔", "没事，保险公司查不到", "说一半留一半就行"],
    a: 0,
    why: "健康告知问什么答什么。理赔时保险公司有权核实病史，隐瞒的代价可能是「一分不赔」，省事一分钟，吃亏一辈子。" },
  { q: "有人说「这款产品跟存款一样，稳赚不赔」，该怎么办？",
    opts: ["赶紧买，错过没这个价", "先交个定金占名额", "提高警惕，保险不是存款"],
    a: 2,
    why: "保险不是存款，「稳赚不赔」这种话本身就是危险信号。看合同里保证的利益，别听嘴上说的。" },
  { q: "买了保险后手头紧，这个月保费没交，保单马上作废吗？",
    opts: ["不会，有60天宽限期，期内出事照赔", "马上作废", "要重新体检重新买"],
    a: 0,
    why: "这60天叫「宽限期」——期内保单依然有效，出事照样赔，之后把保费补上就行。手头紧别慌，先撑过宽限期。" }
];

var qzIdx = 0, qzScore = 0, qzAnswered = false;

function qzTitle(score) {
  if (score === 6) return { emoji: "🏆", title: "保险明白人", desc: "全对！家里买保险的事儿，以后可以问问您了。" };
  if (score >= 4) return { emoji: "👍", title: "入门高手", desc: "关键的坑都能躲开。把上面的人话翻译机再刷一遍，就更稳了。" };
  if (score >= 2) return { emoji: "📖", title: "渐入佳境", desc: "别急，把人话翻译机再点开看一遍，回头再测一次。" };
  return { emoji: "🌱", title: "保险小白", desc: "没关系！今天看完这一页，您已经比大多数人懂保险了。" };
}

function qzRender() {
  qzAnswered = false;
  var box = document.getElementById("quiz-box");
  if (!box) return;
  var item = QUIZ[qzIdx];
  var pct = Math.round((qzIdx / QUIZ.length) * 100);
  var html = "";
  html += '<div class="qz-progress"><span class="qz-step">第 ' + (qzIdx + 1) + ' / ' + QUIZ.length + ' 题</span>' +
          '<div class="qz-bar"><div class="qz-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="qz-scoretag">已对 ' + qzScore + ' 题</span></div>';
  html += '<div class="qz-q">' + item.q + '</div><div class="qz-opts">';
  for (var i = 0; i < item.opts.length; i++) {
    html += '<button type="button" class="opt-btn" onclick="qzPick(' + i + ')">' +
            '<span class="opt-letter">' + "ABC"[i] + '</span>' + item.opts[i] + '</button>';
  }
  html += '</div><div class="qz-why-slot" id="qz-why"></div>';
  box.innerHTML = html;
}

function qzPick(i) {
  if (qzAnswered) return;
  qzAnswered = true;
  var item = QUIZ[qzIdx];
  var right = (i === item.a);
  if (right) qzScore++;
  var btns = document.querySelectorAll(".opt-btn");
  for (var k = 0; k < btns.length; k++) {
    if (k === item.a) btns[k].classList.add("right");
    else if (k === i) btns[k].classList.add("wrong");
    else btns[k].classList.add("dim");
  }
  var why = document.getElementById("qz-why");
  why.innerHTML = '<div class="qz-why">' +
    (right ? "🎉 <b>答对了！</b>" : "💡 <b>正确答案是 " + "ABC"[item.a] + "。</b>") +
    item.why + '</div>' +
    '<button type="button" class="qz-btn" onclick="qzNext()">' +
    (qzIdx === QUIZ.length - 1 ? "看成绩 →" : "下一题 →") + '</button>';
}

function qzNext() {
  qzIdx++;
  if (qzIdx < QUIZ.length) { qzRender(); return; }
  var box = document.getElementById("quiz-box");
  var t = qzTitle(qzScore);
  var stars = "";
  for (var s = 0; s < 6; s++) stars += s < qzScore ? "⭐" : "☆";
  box.innerHTML = '<div class="qz-result">' +
    '<div class="qz-emoji">' + t.emoji + '</div>' +
    '<div class="qz-score">' + qzScore + ' / 6</div>' +
    '<div class="qz-stars">' + stars + '</div>' +
    '<div class="qz-title">「' + t.title + '」</div>' +
    '<div class="qz-desc">' + t.desc + '</div>' +
    '<div class="qz-desc" style="margin-top:10px;color:var(--amber)">📄 把这页转给家里人看看，全家一起当「保险明白人」。</div>' +
    '<button type="button" class="qz-btn" onclick="qzRestart()">🔄 再来一次</button></div>';
}

function qzRestart() {
  qzIdx = 0; qzScore = 0;
  qzRender();
}

/* ---------- 启动 ---------- */
buildTerms();
qzRender();
