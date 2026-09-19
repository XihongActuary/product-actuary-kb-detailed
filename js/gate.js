/* ============================================================
   gate.js · 会员口令门（礼貌性门槛）
   ------------------------------------------------------------
   · 口令发布位置：知识星球「西红精算」置顶帖
   · 解锁入口：about.html（关于西红精算）+ 各遮挡页内置面板
   · 覆盖内容：
       - 定价实验室「四、定价结果」及其后全部区块
         （产品利益演示 / 双视角透视 / 公式与口径说明）
       - 产品开发需求及评估报告（dev-eval.html）整页
       - 产品上线和上市（launch.html）整页
   · 解锁后写入 localStorage，本机一次输入、长期有效。
   · 诚实声明：纯前端口令只能挡住"随手翻看"，挡不住懂开发者
     工具的人。定位是「礼貌性会员标识」，不是硬防线。
   · 修改口令：改下面的 PASS_HASH（djb2 算法，可用 Python 计算：
     h=5381; [h:=h*33+ord(c) for c in 口令]，取 32 位无符号结果），
     并同步更新星球置顶帖。
   ============================================================ */
(function () {
  'use strict';

  /* 口令散列（当前口令：XHJS25 —— 更换口令后需重新计算散列） */
  var PASS_HASH = 3664108585;
  var STORE_KEY = 'xhs_plab_unlocked';
  var ZSXQ_URL = 'https://t.zsxq.com/JhXu6';

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = (h * 33 + str.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }

  function unlocked() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }

  function mark(v) {
    try {
      if (v) localStorage.setItem(STORE_KEY, '1');
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { }
  }

  /* ---------- 右下角状态徽标（幂等：整页只出现一次） ---------- */
  var badgeEl = null;
  function showBadge() {
    if (badgeEl || document.getElementById('xg-badge')) return;
    var b = document.createElement('div');
    b.id = 'xg-badge';
    b.className = 'xg-badge';
    b.innerHTML = '🔓 会员内容已解锁 <span class="xg-badge-x" title="清除本机解锁状态">×</span>';
    document.body.appendChild(b);
    badgeEl = b;
    var x = b.querySelector('.xg-badge-x');
    x.addEventListener('click', function () {
      mark(false);
      try { location.reload(); } catch (e) { }
    });
  }

  /* ---------- 口令输入绑定 ---------- */
  function bindGate(scope, onOk) {
    var input = scope.querySelector('.xg-input');
    var btn = scope.querySelector('.xg-btn');
    var msg = scope.querySelector('.xg-msg');
    if (!input || !btn) return;

    function wrong(text) {
      input.classList.remove('xg-shake');
      void input.offsetWidth;
      input.classList.add('xg-shake');
      input.value = '';
      if (msg) {
        msg.textContent = text || '口令不对。口令在知识星球「西红精算」置顶帖公布。';
        msg.className = 'xg-msg xg-err';
      }
      input.focus();
    }

    function tryUnlock() {
      var v = (input.value || '').trim();
      if (!v) { input.focus(); return; }
      if (djb2(v) === PASS_HASH) {
        mark(true);
        showBadge();
        onOk();
      } else {
        wrong();
      }
    }

    btn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryUnlock();
    });
    input.addEventListener('input', function () {
      if (msg && msg.className.indexOf('xg-err') >= 0) {
        msg.className = 'xg-msg';
        msg.textContent = msg.getAttribute('data-def') || '';
      }
    });
  }

  /* ---------- 模式 A：关于页口令门（页面内静态区块） ---------- */
  function aboutMode() {
    var box = document.getElementById('xg-about');
    if (!box) return;

    function asUnlocked() {
      box.classList.add('xg-on');
      var lock = box.querySelector('.xg-lock');
      if (lock) lock.textContent = '🔓';
      var row = box.querySelector('.xg-row');
      if (row) row.style.display = 'none';
      var msg = box.querySelector('.xg-msg');
      if (msg) {
        msg.className = 'xg-msg xg-ok';
        msg.textContent = '本机已解锁：定价实验室「四、定价结果」及之后内容可直接查看。';
      }
      var h = box.querySelector('.xg-h3');
      if (h) h.textContent = '会员口令 · 已解锁';
    }

    if (unlocked()) { asUnlocked(); showBadge(); return; }
    bindGate(box, asUnlocked);
  }

  /* ---------- 模式 B：内容遮挡（通用） ----------
     支持两种面板：
       ① 静态面板：页面已含 #xg-zone-panel（整页遮挡：dev-eval / launch）
       ② 动态面板：仅 #pl_premium_zone（部分遮挡：定价实验室）
  */
  function zoneMode() {
    var zone = document.getElementById('pl_premium_zone');
    if (!zone) return;

    function open() {
      zone.classList.remove('pl-gated');
      var p = document.getElementById('xg-lab-panel') || document.getElementById('xg-zone-panel');
      if (p) p.remove();
      showBadge();
    }

    if (unlocked()) { open(); return; }

    zone.classList.add('pl-gated');
    // ① 静态面板（整页遮挡页）：HTML 已渲染，直接显示并绑定
    var sp = document.getElementById('xg-zone-panel');
    if (sp) {
      sp.style.display = '';
      bindGate(sp, open);
      return;
    }
    // ② 动态面板（定价实验室：部分遮挡）
    var panel = document.createElement('div');
    panel.id = 'xg-lab-panel';
    panel.className = 'xg xg-lab';
    panel.innerHTML =
      '<div class="xg-card">' +
        '<div class="xg-lock">🔒</div>' +
        '<h3 class="xg-h3">以下为会员内容 · 需口令解锁</h3>' +
        '<p class="xg-sub">前三步（产品形态 / 保险责任 / 定价基础）可以随便试算；从「<b>四、定价结果</b>」开始——含产品利益演示、双视角透视、公式与口径说明——需要口令才能查看。</p>' +
        '<ul class="xg-points">' +
          '<li>毛保费 GP、逐保单年度全量中间变量与法定准备金</li>' +
          '<li>产品利益演示表 + 客户视角三项收益率</li>' +
          '<li>双视角透视：一页纸利益亮点卡 / 参数溯源与敏感性测试 / 定价方法和定价逻辑</li>' +
          '<li>五套定价方程与换算函数完整公式、可导出的单页报告</li>' +
        '</ul>' +
        '<div class="xg-row">' +
          '<input type="password" class="xg-input" placeholder="输入知识星球公布的口令" autocomplete="off">' +
          '<button class="xg-btn">解锁</button>' +
        '</div>' +
        '<div class="xg-msg" data-def="口令在知识星球「西红精算」置顶帖公布 · 解锁一次，本机长期有效">口令在知识星球「西红精算」置顶帖公布 · 解锁一次，本机长期有效</div>' +
        '<div class="xg-zsxq">' +
          '<img src="assets/img/qrcode-zsxq.png" alt="西红精算知识星球二维码">' +
          '<div class="xg-zsxq-tx">' +
            '<b>还没有口令？</b>扫码加入知识星球，置顶帖里就有；新规拆解、口径答疑、演算器与测算模板源文件也都在星球里。' +
            '<div class="xg-links">' +
              '<a class="xg-cta" href="' + ZSXQ_URL + '" target="_blank" rel="noopener">加入知识星球 →</a>' +
              '<a href="about.html">去「关于西红精算」看说明 →</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="xg-note">诚实声明：口令是软性门槛，定位是「礼貌性会员标识」。纯前端校验挡住随手翻看足够，挡不住懂开发者工具的人——真正在意的是星球里能持续拿到更新与源文件。</div>' +
      '</div>';
    zone.parentNode.insertBefore(panel, zone);
    bindGate(panel, open);
  }

  function boot() {
    aboutMode();
    zoneMode();
  }

  window.XH_GATE = {
    hash: PASS_HASH,
    djb2: djb2,
    unlocked: unlocked,
    unlock: function () { mark(true); boot(); },
    relock: function () { mark(false); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
