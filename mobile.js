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

    /* 4c. 动态调整单元格大小以适应屏幕 */
    function calcCellSize() {
        var boardEl = document.getElementById('board');
        if (!boardEl) return;

        var sr = window.SR || parseInt(getText('size')) || 10;
        var sc = window.SC || sr;
        var cols = Math.max(sr, sc);

        var vw = window.innerWidth;
        var sidePadding = vw <= 375 ? 12 : (vw <= 414 ? 16 : 20);
        var availableWidth = vw - sidePadding;

        var cellSize = Math.floor((availableWidth - (cols - 1) * 1) / cols);
        cellSize = Math.max(22, Math.min(cellSize, 48));

        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
        document.documentElement.style.setProperty('--cell-font', Math.floor(cellSize * 0.42) + 'px');

        var gridRows = 'repeat(' + sr + ', ' + cellSize + 'px)';
        var gridCols = 'repeat(' + sc + ', ' + cellSize + 'px)';
        boardEl.style.gridTemplateRows = gridRows;
        boardEl.style.gridTemplateColumns = gridCols;

        var createArea = document.getElementById('createBoardArea');
        if (createArea) {
            var createBoard = createArea.querySelector('.board');
            if (createBoard) {
                createBoard.style.gridTemplateRows = gridRows;
                createBoard.style.gridTemplateColumns = gridCols;
            }
        }
    }

    function getText(id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', calcCellSize);
    } else {
        calcCellSize();
    }
    window.addEventListener('load', calcCellSize);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(calcCellSize, 100);
    });
    window.addEventListener('orientationchange', function () {
        setTimeout(calcCellSize, 200);
        setTimeout(calcCellSize, 500);
    });

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
            if (shouldRecalc) calcCellSize();
        });
        observer.observe(boardEl, { childList: true, subtree: true });
    }

    /* ---------- 5. 手机端专用：两行四列按钮组 ---------- */
    function buildMobileButtonGrid() {
        if (document.querySelector('.mobile-btn-grid')) return;

        var panel = document.querySelector('.panel');
        if (!panel) return;

        var grid = document.createElement('div');
        grid.className = 'mobile-btn-grid';

        var buttons = [
            { cls: 'mbg-reset',     text: '🆕 新游戏',  action: function () { clickEl('reset'); } },
            { cls: 'mbg-clear',     text: '🧹 清空放置', action: function () { clickEl('clear'); } },
            { cls: 'mbg-create',    text: '✍️ 创造',    action: function () { clickEl('createBtn'); } },
            { cls: 'mbg-tutorial',  text: '🧐 教学',    action: function () { clickEl('tutorialBtn'); } },
            { cls: 'mbg-rules',     text: '📖 规则',     action: function () { clickEl('toggleRuleSidebar'); } },
            { cls: 'mbg-info',      text: '💣 炸弹信息', action: function () { clickEl('toggleInfoSidebar'); } },
            { cls: 'mbg-records',   text: '📝 记录',     action: function () { clickEl('toggleAchSidebar'); } },
            { cls: 'mbg-menu',      text: '⚙️ 菜单',     action: function () { clickEl('toggleSidebar'); } }
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
            grid.appendChild(btn);
        }

        panel.parentNode.insertBefore(grid, panel.nextSibling);
    }

    function clickEl(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildMobileButtonGrid);
    } else {
        buildMobileButtonGrid();
    }
    window.addEventListener('load', buildMobileButtonGrid);

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
    var puzzleInput = document.getElementById('puzzleCodeInput');
    if (puzzleInput) {
        puzzleInput.addEventListener('focus', function () {
            var meta = document.querySelector('meta[name=viewport]');
            if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
        });
    }

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
