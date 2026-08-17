/**
 * mobile.js - 反向扫雷移动端适配
 * 功能：设备检测、强制点选、长按删除、菜单按钮迁移、触摸优化
 */
(function() {
    'use strict';

    // ========== 1. 设备检测 ==========
    function isMobileDevice() {
        const ua = navigator.userAgent.toLowerCase();
        const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
        const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const isSmallScreen = window.innerWidth <= 900;
        return isMobileUA || isCoarse || isSmallScreen;
    }

    if (!isMobileDevice()) {
        // 非移动端直接退出，不执行任何逻辑
        return;
    }

    // ========== 2. 标记移动端 & 全局样式覆盖 ==========
    document.documentElement.classList.add('is-mobile');

    // 强制点选模式（覆盖桌面端可能保存的拖拽设置）
    window._placeMode = 'click';
    try { localStorage.setItem('placeMode_v1', 'click'); } catch(e) {}

    // 隐藏桌面端悬浮的模式切换按钮
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    if (modeToggleBtn) modeToggleBtn.style.display = 'none';

    // ========== 3. 侧边栏按钮迁移到 .panel ==========
    function injectMobileMenuButtons() {
        const panel = document.querySelector('.panel');
        if (!panel) return;
        if (panel.querySelector('.mobile-menu-row')) return; // 已注入则跳过

        const row = document.createElement('div');
        row.className = 'mobile-menu-row';

        const configs = [
            { text: '📖规则', targetId: 'ruleSidebar' },
            { text: '💣信息', targetId: 'infoSidebar' },
            { text: '⚙️菜单', targetId: 'sidebar' },
            { text: '📝记录', targetId: 'achSidebar' },
        ];

        configs.forEach(function(cfg) {
            const btn = document.createElement('button');
            btn.className = 'mobile-menu-btn';
            btn.type = 'button';
            btn.textContent = cfg.text;

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const sidebar = document.getElementById(cfg.targetId);
                if (!sidebar) return;

                const wasOpen = sidebar.classList.contains('open');

                // 关闭所有侧边栏
                ['sidebar', 'infoSidebar', 'ruleSidebar', 'achSidebar'].forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('open');
                });

                if (!wasOpen) {
                    sidebar.classList.add('open');
                    if (window.AudioFX && typeof AudioFX.confirm === 'function') {
                        AudioFX.confirm();
                    }
                }
            });

            row.appendChild(btn);
        });

        panel.appendChild(row);
    }

    // ========== 4. 长按删除逻辑 ==========
    let longPressTimer = null;
    let longPressTarget = null;
    let longPressFired = false;
    const LONG_PRESS_DURATION = 600; // 毫秒
    let touchStartX = 0;
    let touchStartY = 0;

    function getCellFromTouch(touch) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!target) return null;
        return target.closest('.cell');
    }

    function cancelLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (longPressTarget) {
            longPressTarget.classList.remove('pressing');
            longPressTarget = null;
        }
        longPressFired = false;
    }

    function onTouchStart(e) {
        if (e.touches.length !== 1) {
            cancelLongPress();
            return;
        }
        const touch = e.touches[0];
        const cell = getCellFromTouch(touch);
        if (!cell) return;

        // 只有包含地雷的格子才响应长按删除
        if (!cell.classList.contains('mine-here')) return;

        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        longPressTarget = cell;
        longPressFired = false;
        cell.classList.add('pressing');

        longPressTimer = setTimeout(function() {
            longPressFired = true;
            if (longPressTarget) {
                longPressTarget.classList.remove('pressing');
            }

            // 获取坐标
            const r = parseInt(cell.dataset.r, 10);
            const c = parseInt(cell.dataset.c, 10);
            if (isNaN(r) || isNaN(c)) return;

            // 根据当前模式执行删除
            if (typeof window.teachActive !== 'undefined' && window.teachActive) {
                if (typeof window.teachRemove === 'function') {
                    window.teachRemove(r, c);
                }
            } else if (typeof window.createModeActive !== 'undefined' && window.createModeActive) {
                // 创造模式
                const key = r + ',' + c;
                if (window.createPlaced && window.createPlaced[key]) {
                    delete window.createPlaced[key];
                    if (window.AudioFX && typeof AudioFX.remove === 'function') AudioFX.remove();
                    if (typeof window.renderCreateBoard === 'function') window.renderCreateBoard();
                    if (typeof window.renderCreateMineSlot === 'function') window.renderCreateMineSlot();
                    if (typeof window.refreshCreateInfoBar === 'function') window.refreshCreateInfoBar();
                }
            } else {
                // 普通游戏模式
                if (typeof window.del === 'function') {
                    window.del(r, c);
                }
            }

            // 触觉反馈
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            longPressTarget = null;
            longPressTimer = null;
        }, LONG_PRESS_DURATION);
    }

    function onTouchMove(e) {
        if (!longPressTarget || !longPressTimer) return;
        if (e.touches.length !== 1) {
            cancelLongPress();
            return;
        }
        const touch = e.touches[0];
        // 移动距离超过阈值则取消
        const dx = Math.abs(touch.clientX - touchStartX);
        const dy = Math.abs(touch.clientY - touchStartY);
        if (dx > 10 || dy > 10) {
            cancelLongPress();
            return;
        }
        // 手指滑出当前 cell 也取消
        const cell = getCellFromTouch(touch);
        if (cell !== longPressTarget) {
            cancelLongPress();
        }
    }

    function onTouchEnd(e) {
        if (longPressFired) {
            // 长按已触发，阻止此次 touch 产生的 click
            e.preventDefault();
            blockNextClick();
        }
        cancelLongPress();
    }

    // 阻止长按后紧随的 click 事件（避免误放置）
    let blockClick = false;
    function blockNextClick() {
        blockClick = true;
        setTimeout(function() { blockClick = false; }, 120);
    }

    document.addEventListener('click', function(e) {
        if (blockClick) {
            e.stopPropagation();
            e.preventDefault();
            blockClick = false;
        }
    }, true);

    // ========== 5. 触摸全局优化 ==========
    // 禁用默认上下文菜单（防止长按弹出系统菜单）
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    }, true);

    // 阻止双击缩放（部分浏览器）
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(e) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);

    // ========== 6. 侧边栏触摸关闭 ==========
    document.addEventListener('touchstart', function(e) {
        const target = e.target;
        const sidebars = document.querySelectorAll('.sidebar, .info-sidebar, .rule-sidebar, .achievement-sidebar');
        sidebars.forEach(function(sb) {
            if (sb.classList.contains('open') && !sb.contains(target) && !target.closest('.mobile-menu-btn')) {
                sb.classList.remove('open');
            }
        });
    }, { passive: true });

    // ========== 7. 绑定长按事件（事件委托 + 动态监听） ==========
    function attachBoardLongPress(boardEl) {
        if (!boardEl || boardEl._mobileLongPressAttached) return;
        boardEl._mobileLongPressAttached = true;

        boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
        boardEl.addEventListener('touchmove', onTouchMove, { passive: true });
        boardEl.addEventListener('touchend', onTouchEnd, { passive: false });
        boardEl.addEventListener('touchcancel', cancelLongPress, { passive: true });
    }

    // 初始绑定
    attachBoardLongPress(document.getElementById('board'));
    attachBoardLongPress(document.getElementById('createBoardArea'));

    // 监听 DOM 变化，为新生成的棋盘自动绑定
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType !== 1) return;
                if (node.id === 'board' || (node.classList && node.classList.contains('board'))) {
                    attachBoardLongPress(node);
                }
                if (node.id === 'createBoardArea') {
                    attachBoardLongPress(node);
                }
                // 如果 panel 被重新渲染，需要重新注入菜单按钮
                if (node.classList && node.classList.contains('panel')) {
                    injectMobileMenuButtons();
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ========== 8. 初始化入口 ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectMobileMenuButtons);
    } else {
        injectMobileMenuButtons();
    }

})();