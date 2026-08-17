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
        /* 覆盖 game.js 的默认拖拽模式 */
        window._placeMode = 'click';
        try { localStorage.setItem('placeMode_v1', 'click'); } catch (e) {}

        /* 更新 UI 按钮文字 */
        var icon = document.getElementById('modeToggleIcon');
        var label = document.getElementById('modeToggleLabel');
        if (icon) icon.textContent = '🖱️';
        if (label) label.textContent = '当前放置方式为：点选（手机端固定）';

        /* 隐藏模式切换按钮 */
        var modeBtn = document.getElementById('modeToggleBtn');
        if (modeBtn) modeBtn.style.display = 'none';

        /* 重新渲染以应用点选模式 */
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

    /* game.js 在 DOMContentLoaded 和 window.load 时都会初始化。
       我们在两个时机各延迟执行一次，确保覆盖其 initPlaceMode()。 */
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

    /* 判断该格子是否真的"有雷可删" —— 通过 DOM 判断 */
    function cellHasMine(cell) {
        return cell && cell.classList.contains('mine-here');
    }

    function doLongPressDelete(coords) {
        if (!coords) return;

        /* 教学模式的删除 */
        if (window.teachActive) {
            if (typeof window.teachRemove === 'function') {
                window.teachRemove(coords.r, coords.c);
                vibrate(30);
                showToast('已删除 🗑️');
                return;
            }
        }

        /* 普通模式：调用 game.js 暴露的 del() */
        if (typeof window._gameNS !== 'undefined' && typeof window._gameNS.del === 'function') {
            /* 先检查该格是否有雷（避免误删） */
            var cell = coords.el || document.querySelector('.cell[data-r="' + coords.r + '"][data-c="' + coords.c + '"]');
            if (cell && cellHasMine(cell)) {
                window._gameNS.del(coords.r, coords.c);
                vibrate(30);
                showToast('已删除 🗑️');
            }
            return;
        }

        /* 兜底：模拟右键事件 */
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
        /* 取消当前选中的地雷类型 */
        if (window.selectedMineType !== undefined) window.selectedMineType = null;
        if (window._teachSelectedType !== undefined) window._teachSelectedType = null;
        if (window._createSelectedType !== undefined) window._createSelectedType = null;

        safeCall(window.renderSlot);
        safeCall(window.renderTeachSlot);
        safeCall(window.renderCreateMineSlot);

        vibrate(20);
        showToast('已取消选中');
    }

    /* touchstart —— 启动长按计时器 */
    document.addEventListener('touchstart', function (e) {
        var touch = e.touches[0];
        if (!touch) return;

        touchStartPos = { x: touch.clientX, y: touch.clientY };
        longPressFired = false;

        var coords = getCellCoords(e.target);

        if (coords && cellHasMine(coords.el)) {
            /* 长按有雷的格子 → 删除 */
            longPressTimer = setTimeout(function () {
                longPressFired = true;
                doLongPressDelete(coords);
                longPressTimer = null;
            }, LONG_PRESS_DELAY);
        } else {
            /* 长按空白格子或地雷槽 item → 取消选中 */
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

    /* touchmove —— 超过阈值取消长按 */
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

    /* touchend / touchcancel —— 清除计时器 */
    document.addEventListener('touchend', function (e) {
        /* 如果没有触发长按，且是点击了有雷的格子，不做任何事
           （让 click 事件正常处理点选逻辑） */
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

        /* 读取当前棋盘尺寸 */
        var sr = window.SR || parseInt(getText('size')) || 10;
        var sc = window.SC || sr;
        var cols = Math.max(sr, sc);

        /* 可用宽度 */
        var vw = window.innerWidth;
        var sidePadding = vw <= 375 ? 12 : (vw <= 414 ? 16 : 20);
        var availableWidth = vw - sidePadding;

        /* 计算单元格大小（留 1px gap） */
        var cellSize = Math.floor((availableWidth - (cols - 1) * 1) / cols);
        cellSize = Math.max(22, Math.min(cellSize, 48));

        /* 设置 CSS 变量 */
        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
        document.documentElement.style.setProperty('--cell-font', Math.floor(cellSize * 0.42) + 'px');

        /* 直接设置棋盘 grid 模板 */
        var gridRows = 'repeat(' + sr + ', ' + cellSize + 'px)';
        var gridCols = 'repeat(' + sc + ', ' + cellSize + 'px)';
        boardEl.style.gridTemplateRows = gridRows;
        boardEl.style.gridTemplateColumns = gridCols;

        /* 同步创造模式棋盘 */
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

    /* 初始计算 & 监听尺寸变化 */
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

    /* 监听棋盘 DOM 变化后重新计算 */
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

    /* ---------- 5. 手机端专用：侧边栏快捷按钮行 ---------- */
    function buildMobileSidebarRow() {
        if (document.querySelector('.mobile-sidebar-row')) return;

        var panel = document.querySelector('.panel');
        if (!panel) return;

        var row = document.createElement('div');
        row.className = 'mobile-sidebar-row';

        var buttons = [
            { cls: 'mobile-btn-rules',  text: '📖 规则',     action: function () { clickEl('toggleRuleSidebar'); } },
            { cls: 'mobile-btn-info',   text: '💣 炸弹信息', action: function () { clickEl('toggleInfoSidebar'); } },
            { cls: 'mobile-btn-records', text: '📝 记录',     action: function () { clickEl('toggleAchSidebar'); } },
            { cls: 'mobile-btn-menu',   text: '⚙️ 菜单',     action: function () { clickEl('toggleSidebar'); } },
            { cls: 'mobile-btn-bgm',    text: '🔊 音乐',     action: function () {
                var sb = document.getElementById('sidebar');
                if (sb) {
                    sb.classList.toggle('open');
                    setTimeout(function () {
                        var slider = document.getElementById('bgmSlider');
                        if (slider) slider.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            } }
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

        panel.parentNode.insertBefore(row, panel.nextSibling);
    }

    function clickEl(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildMobileSidebarRow);
    } else {
        buildMobileSidebarRow();
    }
    window.addEventListener('load', buildMobileSidebarRow);

    /* ---------- 6. 触感反馈（Vibration API） ---------- */
    function vibrate(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms || 20); } catch (e) {}
        }
    }

    /* 为关键操作注入触感反馈 */
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
        void toast.offsetWidth; /* 强制重排 */
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

    /* ---------- 9. 防止 iOS 橡皮筋滚动 ---------- */
    document.addEventListener('touchmove', function (e) {
        var target = e.target;
        var isSidebar = target.closest && target.closest('.sidebar, .info-sidebar, .rule-sidebar, .achievement-sidebar');
        var isModal = target.closest && target.closest('.auto-modal, .brain-win-modal, .teach-complete-modal');
        var isScrollable = target.closest && target.closest('.mine-slot-box, .create-mode-panel, .achievement-popup, .sidebar, .info-sidebar, .rule-sidebar');

        if (!isSidebar && !isModal && !isScrollable) {
            e.preventDefault();
        }
    }, { passive: false });

    /* ---------- 10. 输入框特殊处理 ---------- */
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

    /* ---------- 11. 提示横幅 ---------- */
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
