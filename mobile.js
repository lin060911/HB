/* mobile.js - 手机端兼容补丁（最小化侵入） */
/* 仅做：设备检测、强制点选、长按删除、触摸适配、侧边栏按钮化 */
(function () {
    'use strict';

    // ─── 1. 设备检测 ─────────────────────────────────────────
    var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    var isSmall = window.innerWidth < 900;
    var isMobile = isTouch && isSmall;

    document.documentElement.classList.add(isMobile ? 'is-mobile' : 'is-desktop');
    if (isMobile) document.body.classList.add('is-mobile');

    // ─── 2. 手机端强制点选模式 ─────────────────────────────
    // 等 game.js 初始化完后覆盖 _placeMode
    function forceClickMode() {
        if (!isMobile) return;
        window._placeMode = 'click';
        // 隐藏模式切换按钮
        var btn = document.getElementById('modeToggleBtn');
        if (btn) btn.style.display = 'none';
        // 关闭拖拽属性
        document.querySelectorAll('.mine-item').forEach(function (el) {
            el.draggable = false;
            el.ondragstart = null;
            el.ondragend = null;
        });
        document.querySelectorAll('.cell').forEach(function (el) {
            el.draggable = false;
            el.ondragstart = null;
            el.ondragend = null;
            el.ondragover = null;
            el.ondragleave = null;
            el.ondrop = null;
        });
    }

    // ─── 3. 长按删除地雷（手机端替代右键） ────────────────
    var longPressTimer = null;
    var longPressFired = false;
    var LONG_PRESS_MS = 550;

    function getCellFromEvent(e) {
        var t = e.target;
        if (!t) return null;
        var cell = t.closest ? t.closest('.cell') : null;
        return cell;
    }

    function tryLongPressDelete(e) {
        var cell = getCellFromEvent(e);
        if (!cell) return;
        var r = +cell.dataset.r, c = +cell.dataset.c;
        var k = r + ',' + c;
        // 检查该格是否有地雷（访问 game 的 G.placed）
        if (window._gameNS && window._gameNS.del) {
            // 先确认确实有雷
            // G 是 IIFE 内部变量，无法直接访问；用 DOM 判断
            if (cell.classList.contains('mine-here')) {
                longPressFired = true;
                if (navigator.vibrate) navigator.vibrate(30);
                window._gameNS.del(r, c);
            }
        }
    }

    function clearLongPress() {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }

    if (isMobile) {
        document.addEventListener('touchstart', function (e) {
            longPressFired = false;
            clearLongPress();
            var cell = getCellFromEvent(e);
            if (!cell) return;
            longPressTimer = setTimeout(function () {
                tryLongPressDelete(e);
            }, LONG_PRESS_MS);
        }, { passive: true });

        document.addEventListener('touchmove', function () {
            clearLongPress();
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            clearLongPress();
            // 防止长按后的 click 触发放置
            if (longPressFired) {
                e.preventDefault();
                // 阻止后续 click
                setTimeout(function () { longPressFired = false; }, 50);
            }
        }, { passive: false });

        document.addEventListener('touchcancel', clearLongPress);

        // 阻止双击缩放
        document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    }

    // ─── 4. 手机端：侧边栏 → panel 内按钮 ────────────────
    // 在 .panel div 里追加快捷按钮（规则/信息/菜单/记录）
    function buildMobileBar() {
        if (!isMobile) return;
        var panel = document.querySelector('.panel');
        if (!panel) return;

        // 防止重复添加
        if (document.getElementById('mbToggleRule')) return;

        function makeBtn(id, text, onClick) {
            var b = document.createElement('button');
            b.id = id;
            b.className = 'mb-quick-btn';
            b.textContent = text;
            b.addEventListener('click', onClick);
            return b;
        }

        panel.appendChild(makeBtn('mbToggleRule', '📖规则', function () {
            var sb = document.getElementById('ruleSidebar');
            if (sb) { sb.classList.toggle('open'); }
        }));
        panel.appendChild(makeBtn('mbToggleInfo', '💣信息', function () {
            var sb = document.getElementById('infoSidebar');
            if (sb) { sb.classList.toggle('open'); }
        }));
        panel.appendChild(makeBtn('mbToggleMenu', '⚙️菜单', function () {
            var sb = document.getElementById('sidebar');
            if (sb) { sb.classList.toggle('open'); }
        }));
        panel.appendChild(makeBtn('mbToggleAch', '📝记录', function () {
            var sb = document.getElementById('achSidebar');
            if (sb) { sb.classList.toggle('open'); renderAch(); }
        }));

        // 隐藏桌面端左侧竖排 toggle 按钮
        ['toggleRuleSidebar', 'toggleInfoSidebar', 'toggleSidebar', 'toggleAchSidebar'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // 点外部关闭侧边栏
        document.addEventListener('touchstart', function (e) {
            var t = e.target;
            [['ruleSidebar', 'mbToggleRule'],
             ['infoSidebar', 'mbToggleInfo'],
             ['sidebar', 'mbToggleMenu'],
             ['achSidebar', 'mbToggleAch']].forEach(function (pair) {
                var sb = document.getElementById(pair[0]);
                var trigger = document.getElementById(pair[1]);
                if (sb && sb.classList.contains('open') &&
                    !sb.contains(t) && t !== trigger && !trigger.contains(t)) {
                    sb.classList.remove('open');
                }
            });
        }, { passive: true });
    }

    function renderAch() {
        if (window.Achievements && window.Achievements.renderAchievements) {
            window.Achievements.renderAchievements();
        }
        if (window.Achievements && window.Achievements.renderRecords) {
            window.Achievements.renderRecords();
        }
    }

    // ─── 5. 棋盘尺寸自适应 ──────────────────────────────────
    function fitBoard() {
        if (!isMobile) return;
        var board = document.getElementById('board');
        if (!board) return;
        var rows = window.SR || 10, cols = window.SC || 10;
        var maxW = window.innerWidth - 20;
        var cellSize = Math.floor(maxW / cols);
        cellSize = Math.max(22, Math.min(cellSize, 42));
        board.style.gridTemplateRows = 'repeat(' + rows + ',' + cellSize + 'px)';
        board.style.gridTemplateColumns = 'repeat(' + cols + ',' + cellSize + 'px)';
        board.querySelectorAll('.cell').forEach(function (c) {
            c.style.width = cellSize + 'px';
            c.style.height = cellSize + 'px';
            c.style.fontSize = Math.max(10, Math.floor(cellSize * 0.4)) + 'px';
        });
    }

    // ─── 6. 初始化 & 监听 ──────────────────────────────────
    function init() {
        forceClickMode();
        buildMobileBar();
        fitBoard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 100); // 等 game.js 先跑
        });
    } else {
        setTimeout(init, 100);
    }

    window.addEventListener('resize', fitBoard);
    window.addEventListener('orientationchange', function () {
        setTimeout(fitBoard, 200);
    });

    // 暴露供调试
    window._mobile = { isMobile: isMobile, forceClickMode: forceClickMode, fitBoard: fitBoard };
})();
