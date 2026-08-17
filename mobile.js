/* ============================================================
   mobile.js
   设备检测 · 强制点选 · 长按删除 · 触摸适配
   全部逻辑仅在手机/触屏设备上激活；桌面端零开销。
   ============================================================ */

(function () {
    'use strict';

    /* ---------- 1. 设备检测 ---------- */
    function detectMobile() {
        var ua = navigator.userAgent || '';
        var isTouchDevice = (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0
        );
        var isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var isSmallScreen = window.innerWidth <= 900;
        var isUaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

        return (isTouchDevice && isCoarsePointer) || (isUaMobile && isSmallScreen);
    }

    var isMobile = detectMobile();

    if (isMobile) {
        document.documentElement.classList.add('is-mobile');
    }

    /* 非手机设备：不绑定任何手机逻辑，直接退出 */
    if (!isMobile) return;

    console.log('[mobile.js] 手机端模式已启用');

    /* ---------- 2. 强制点选模式 ---------- */
    function forceClickMode() {
        window._placeMode = 'click';
        try { localStorage.setItem('placeMode_v1', 'click'); } catch (e) {}

        var icon = document.getElementById('modeToggleIcon');
        var label = document.getElementById('modeToggleLabel');
        if (icon) icon.textContent = '🖱️';
        if (label) label.textContent = '当前放置方式为：点选（手机端固定）';

        var modeBtn = document.getElementById('modeToggleBtn');
        if (modeBtn) modeBtn.style.display = 'none';

        safeCall(window.render);
        safeCall(window.renderSlot);
        safeCall(window.renderTeachBoard);
        safeCall(window.renderTeachSlot);
        safeCall(window.renderCreateBoard);
        safeCall(window.renderCreateMineSlot);
    }

    function safeCall(fn) {
        if (typeof fn === 'function') {
            try { fn(); } catch (e) {}
        }
    }

    function scheduleForce() {
        setTimeout(forceClickMode, 0);
        setTimeout(forceClickMode, 100);
        setTimeout(forceClickMode, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleForce);
    } else {
        scheduleForce();
    }
    window.addEventListener('load', scheduleForce);

    /* ---------- 3. 长按删除 ---------- */
    var longPressTimer = null;
    var longPressFired = false;
    var touchStartPos = null;
    var LONG_PRESS_DELAY = 500;
    var MOVE_THRESHOLD = 10;

    function clearLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressFired = false;
        touchStartPos = null;
    }

    function findAncestor(el, className) {
        while (el && !el.classList.contains(className)) {
            el = el.parentElement;
        }
        return el;
    }

    function getCellCoords(el) {
        var cell = findAncestor(el, 'cell');
        if (!cell) return null;
        var r = parseInt(cell.dataset.r, 10);
        var c = parseInt(cell.dataset.c, 10);
        if (isNaN(r) || isNaN(c)) return null;
        return { r: r, c: c, el: cell };
    }

    function cellHasMine(cell) {
        return cell && cell.classList.contains('mine-here');
    }

    function doLongPressDelete(coords) {
        if (!coords) return;

        if (window.teachActive) {
            if (typeof window.teachRemove === 'function') {
                window.teachRemove(coords.r, coords.c);
                vibrate(30);
                showToast('已删除 🗑️');
                return;
            }
        }

        if (typeof window._gameNS !== 'undefined' && typeof window._gameNS.del === 'function') {
            var cell = coords.el || document.querySelector('.cell[data-r="' + coords.r + '"][data-c="' + coords.c + '"]');
            if (cell && cellHasMine(cell)) {
                window._gameNS.del(coords.r, coords.c);
                vibrate(30);
                showToast('已删除 🗑️');
            }
            return;
        }

        var target = coords.el;
        if (target) {
            try {
                var evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
                target.dispatchEvent(evt);
                vibrate(20);
                showToast('已删除 🗑️');
            } catch (e) {}
        }
    }

    function doLongPressDeselect() {
        if (window.selectedMineType !== undefined) window.selectedMineType = null;
        if (window._teachSelectedType !== undefined) window._teachSelectedType = null;
        if (window._createSelectedType !== undefined) window._createSelectedType = null;

        safeCall(window.renderSlot);
        safeCall(window.renderTeachSlot);
        safeCall(window.renderCreateMineSlot);

        vibrate(20);
        showToast('已取消选中');
    }

    document.addEventListener('touchstart', function (e) {
        var touch = e.touches[0];
        if (!touch) return;

        touchStartPos = { x: touch.clientX, y: touch.clientY };
        longPressFired = false;

        var coords = getCellCoords(e.target);

        if (coords && cellHasMine(coords.el)) {
            longPressTimer = setTimeout(function () {
                longPressFired = true;
                doLongPressDelete(coords);
                longPressTimer = null;
            }, LONG_PRESS_DELAY);
        } else {
            var mineItem = findAncestor(e.target, 'mine-item');
            if (mineItem && mineItem.classList.contains('selected')) {
                longPressTimer = setTimeout(function () {
                    longPressFired = true;
                    doLongPressDeselect();
                    longPressTimer = null;
                }, LONG_PRESS_DELAY);
            }
        }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!touchStartPos || !longPressTimer) return;
        var touch = e.touches[0];
        if (!touch) return;
        var dx = Math.abs(touch.clientX - touchStartPos.x);
        var dy = Math.abs(touch.clientY - touchStartPos.y);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
            clearLongPress();
        }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        clearLongPress();
    });
    document.addEventListener('touchcancel', clearLongPress);

    /* ---------- 4. 触摸适配增强 ---------- */

    /* 4a. 禁用双击缩放 */
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    /* 4b. 阻止棋盘区域的手势缩放 */
    var board = document.getElementById('board');
    if (board) {
        board.addEventListener('gesturestart', function (e) { e.preventDefault(); });
        board.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    }

    /* 4c. 棋盘极缩放：用 transform: scale()，不改变 grid 逻辑结构 */
    function wrapBoard() {
        var boardEl = document.getElementById('board');
        if (!boardEl || boardEl.parentElement.classList.contains('board-wrapper')) return;
        var wrapper = document.createElement('div');
        wrapper.className = 'board-wrapper';
        wrapper.id = 'boardWrapper';
        boardEl.parentNode.insertBefore(wrapper, boardEl);
        wrapper.appendChild(boardEl);
    }

    function getText(id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    function calcBoardScale() {
        var boardEl = document.getElementById('board');
        if (!boardEl) return;

        var sr = window.SR || parseInt(getText('size'), 10) || 10;
        var sc = window.SC || sr;
        var cols = Math.max(sr, sc);

        /* 测量格子实际渲染尺寸（桌面端基础值） */
        var sampleCell = boardEl.querySelector('.cell');
        var baseCell = 40; /* 桌面端 CSS 基础尺寸 */
        if (sampleCell) {
            var rect = sampleCell.getBoundingClientRect();
            if (rect.width > 0) baseCell = rect.width;
        }

        var vw = window.innerWidth;
        var sidePadding = vw <= 375 ? 16 : (vw <= 414 ? 20 : 24);
        var availableWidth = vw - sidePadding;
        /* 格子间距约 2px */
        var boardWidth = cols * baseCell + (cols - 1) * 2 + 8; /* +8 为 board padding */
        var scale = availableWidth / boardWidth;
        scale = Math.max(0.45, Math.min(scale, 1.0));

        boardEl.style.transform = 'scale(' + scale + ')';
        boardEl.style.transformOrigin = 'top center';
        /* 用 wrapper 控制占位高度，避免 scale 后塌陷 */
        var wrapper = document.getElementById('boardWrapper');
        if (wrapper) {
            wrapper.style.height = (boardEl.offsetHeight * scale) + 'px';
        }

        /* 同步创造模式棋盘 */
        var createArea = document.getElementById('createBoardArea');
        if (createArea) {
            var createBoard = createArea.querySelector('.board');
            if (createBoard) {
                createBoard.style.transform = 'scale(' + scale + ')';
                createBoard.style.transformOrigin = 'top center';
            }
        }
    }

    function initBoard() {
        wrapBoard();
        calcBoardScale();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBoard);
    } else {
        initBoard();
    }
    window.addEventListener('load', initBoard);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(calcBoardScale, 100);
    });
    window.addEventListener('orientationchange', function () {
        setTimeout(calcBoardScale, 200);
        setTimeout(calcBoardScale, 500);
    });

    /* 棋盘 DOM 变化后重新计算 */
    var boardEl = document.getElementById('board');
    if (boardEl && typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function (mutations) {
            var shouldRecalc = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'childList' && mutations[i].addedNodes.length > 0) {
                    shouldRecalc = true;
                    break;
                }
            }
            if (shouldRecalc) calcBoardScale();
        });
        observer.observe(boardEl, { childList: true, subtree: true });
    }

    /* ---------- 5. 第二行按钮：仅侧边栏切换（4个） ---------- */
    /* 不重复 .panel 里已有的 新游戏/清空/创造/教学 按钮 */
    function buildSidebarButtonRow() {
        if (document.querySelector('.panel-sidebar-row')) return;

        var panel = document.querySelector('.panel');
        if (!panel) return;

        var row = document.createElement('div');
        row.className = 'panel-sidebar-row';

        var buttons = [
            { cls: 'psb-rules',   text: '📖 规则',   action: function () { clickEl('toggleRuleSidebar'); } },
            { cls: 'psb-info',    text: '💣 炸弹信息', action: function () { clickEl('toggleInfoSidebar'); } },
            { cls: 'psb-records', text: '📝 记录',   action: function () { clickEl('toggleAchSidebar'); } },
            { cls: 'psb-menu',    text: '⚙️ 菜单',   action: function () { clickEl('toggleSidebar'); } }
        ];

        for (var b = 0; b < buttons.length; b++) {
            var btn = document.createElement('button');
            btn.className = buttons[b].cls;
            btn.textContent = buttons[b].text;
            btn.addEventListener('click', buttons[b].action);
            btn.addEventListener('touchend', (function (action) {
                return function (e) {
                    e.preventDefault();
                    action();
                };
            })(buttons[b].action), { passive: false });
            row.appendChild(btn);
        }

        /* 插入到 .panel 之后，作为第二行 */
        panel.parentNode.insertBefore(row, panel.nextSibling);
    }

    function clickEl(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildSidebarButtonRow);
    } else {
        buildSidebarButtonRow();
    }
    window.addEventListener('load', buildSidebarButtonRow);

    /* ---------- 6. 触感反馈（Vibration API） ---------- */
    function vibrate(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms || 20); } catch (e) {}
        }
    }

    if (window.AudioFX) {
        var origPlace = window.AudioFX.place;
        if (origPlace) {
            window.AudioFX.place = function () {
                vibrate(15);
                origPlace.apply(this, arguments);
            };
        }
        var origRemove = window.AudioFX.remove;
        if (origRemove) {
            window.AudioFX.remove = function () {
                vibrate(25);
                origRemove.apply(this, arguments);
            };
        }
        var origConfirm = window.AudioFX.confirm;
        if (origConfirm) {
            window.AudioFX.confirm = function () {
                vibrate(10);
                origConfirm.apply(this, arguments);
            };
        }
        var origWin = window.AudioFX.win;
        if (origWin) {
            window.AudioFX.win = function () {
                vibrate([20, 50, 20]);
                origWin.apply(this, arguments);
            };
        }
    }

    /* ---------- 7. 轻量 Toast 提示 ---------- */
    function showToast(msg) {
        var toast = document.getElementById('mobileToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'mobileToast';
            toast.style.cssText = [
                'position: fixed',
                'bottom: 80px',
                'left: 50%',
                'transform: translateX(-50%) translateY(20px)',
                'background: rgba(0,0,0,0.75)',
                'color: #fff',
                'padding: 8px 18px',
                'border-radius: 20px',
                'font-size: 13px',
                'z-index: 9999',
                'pointer-events: none',
                'opacity: 0',
                'transition: opacity 0.3s, transform 0.3s',
                'white-space: nowrap'
            ].join(';');
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        void toast.offsetWidth;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 1500);
    }

    /* ---------- 8. 点击空白关闭侧边栏 ---------- */
    document.addEventListener('touchstart', function (e) {
        var sidebars = [
            { el: document.getElementById('sidebar'),     btn: document.getElementById('toggleSidebar') },
            { el: document.getElementById('infoSidebar'), btn: document.getElementById('toggleInfoSidebar') },
            { el: document.getElementById('ruleSidebar'), btn: document.getElementById('toggleRuleSidebar') },
            { el: document.getElementById('achSidebar'),  btn: document.getElementById('toggleAchSidebar') }
        ];
        for (var i = 0; i < sidebars.length; i++) {
            var sb = sidebars[i];
            if (!sb.el || !sb.btn) continue;
            if (!sb.el.classList.contains('open')) continue;
            if (sb.el.contains(e.target) || sb.btn.contains(e.target)) continue;
            sb.el.classList.remove('open');
        }
    }, { passive: true });

    /* ---------- 9. 输入框特殊处理 ---------- */
    ['createSize', 'createSize2'].forEach(function (id) {
        var inp = document.getElementById(id);
        if (inp) {
            inp.addEventListener('focus', function () { this.style.fontSize = '16px'; });
            inp.addEventListener('blur', function () { this.style.fontSize = ''; });
        }
    });

    /* ---------- 10. 提示横幅 ---------- */
    function showLongPressHint() {
        if (document.querySelector('.long-press-hint')) return;
        var hint = document.createElement('div');
        hint.className = 'long-press-hint';
        hint.textContent = '💡 长按地雷可删除';
        document.body.appendChild(hint);
        setTimeout(function () {
            hint.style.transition = 'opacity 1s';
            hint.style.opacity = '0';
            setTimeout(function () { hint.remove(); }, 1200);
        }, 5000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showLongPressHint);
    } else {
        showLongPressHint();
    }

    console.log('[mobile.js] 手机端适配初始化完成');

})();
