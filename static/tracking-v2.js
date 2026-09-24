/* ============================================================
   QUEST LOG — 作战终端 / 追踪面板 + 专注模式（R43 从零重写）
   说明：本文件是追踪面板与专注模式的唯一实现，旧实现已从
   app.js / index.html / style.css 彻底删除。本模块通过复用
   app.js 暴露的全局（state / apiGet / apiPost / renderTasks /
   openRewardModal / claimStateOf / goldStars / openTaskDetail /
   completeTaskAndHandleReward / reloadTaskData）工作，自身只负责
   作战卡渲染、四种面板形态切换、番茄钟与全屏专注。
   对外接口（app.js 仍按这些名字调用）：
     checkCurrentTracking / loadPomodoroCurrent / updateTrackingTimer /
     updatePomodoroTimer / stopPomodoro / toggleTrackingForTask /
     toggleTracking / completeCurrentTracking / toggleFocusMode /
     updateTrackingPanel / expandTrackingPanel / collapseTrackingPanel /
     trackingPanelIsOpen / showTrackingPanel
   ============================================================ */

(function () {
    'use strict';

    function el(id) { return document.getElementById(id); }
    function getTaskById(id) { return (state.flatTasks || []).find(t => t.id === id); }
    function childrenOf(task) {
        if (task && task.children && task.children.length) return task.children;
        return (state.flatTasks || []).filter(t => task && t.parent_id === task.id);
    }

    // ===== 形态与开关状态 =====
    window.__tpOpen = false;
    window.__tpVariant = (function () {
        try { return localStorage.getItem('tp_variant') || 'drawer-right'; }
        catch (e) { return 'drawer-right'; }
    })();

    function trackingPanelIsOpen() { return !!window.__tpOpen; }

    function showTrackingPanel() {
        window.__tpOpen = true;
        const p = el('tpPanel'); if (p) { p.classList.add('open'); p.setAttribute('aria-hidden', 'false'); }
    }
    function hideTrackingPanel() {
        window.__tpOpen = false;
        const p = el('tpPanel'); if (p) { p.classList.remove('open'); p.setAttribute('aria-hidden', 'true'); }
    }
    function expandTrackingPanel() { showTrackingPanel(); }
    function collapseTrackingPanel() { hideTrackingPanel(); }

    function setPanelVariant(v) {
        window.__tpVariant = v;
        const p = el('tpPanel'); if (p) p.dataset.variant = v;
        try { localStorage.setItem('tp_variant', v); } catch (e) {}
        document.querySelectorAll('#tpSwitch .tp-variant').forEach(b => {
            b.classList.toggle('active', b.dataset.variant === v);
        });
    }

    // ===== 时间格式 =====
    function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        const h = String(Math.floor(sec / 3600)).padStart(2, '0');
        const m = String(Math.floor(sec % 3600 / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    function fmtMMSS(sec) {
        sec = Math.max(0, Math.floor(sec));
        return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }

    // ===== 进度计算（tree 金 / count 绿 / manual 蓝） =====
    function childProgress(c) {
        if (!c) return 0;
        if (c.status === 'done') return 100;
        if (c.target_value && Number(c.target_value) > 0) return Math.min(100, (Number(c.current_value || 0) / Number(c.target_value)) * 100);
        return Number(c.progress || 0);
    }
    function computeProgress(task) {
        const kids = childrenOf(task);
        if (kids.length && task.progress_mode !== 'manual') {
            const avg = kids.reduce((a, c) => a + childProgress(c), 0) / kids.length;
            return { progress: avg, mode: 'tree' };
        }
        if (task.target_value && Number(task.target_value) > 0 && task.progress_mode !== 'manual') {
            return { progress: Math.min(100, (Number(task.current_value || 0) / Number(task.target_value)) * 100), mode: 'count' };
        }
        if (task.progress_mode === 'manual') {
            return { progress: Number(task.progress || 0), mode: 'manual' };
        }
        return { progress: Number(task.progress || 0), mode: 'tree' };
    }

    // ===== 父链 / 子任务渲染 =====
    function buildParentChain(container, task) {
        container.innerHTML = '';
        const chain = [];
        let cur = task; const seen = new Set();
        while (cur && cur.parent_id && !seen.has(cur.parent_id)) {
            seen.add(cur.parent_id);
            const p = getTaskById(cur.parent_id);
            if (!p) break;
            chain.unshift(p); cur = p;
        }
        chain.forEach((p, i) => {
            const chip = document.createElement('span');
            chip.className = 'ak-tag ak-tag--neutral tracking-chain-chip';
            chip.textContent = p.title;
            container.appendChild(chip);
            if (i < chain.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'tracking-chain-sep';
                sep.textContent = '›';
                container.appendChild(sep);
            }
        });
    }

    function buildSubtasks(container, kids) {
        container.innerHTML = '';
        kids.forEach(child => {
            const row = document.createElement('label');
            row.className = 'ak-choice tracking-subtask' +
                (child.status === 'done' ? ' is-done' : '') +
                (child.status === 'cancelled' ? ' is-cancelled' : '');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = child.status === 'done';
            const lab = document.createElement('span');
            lab.className = 'ak-choice__label tracking-subtask-label';
            lab.textContent = child.title;
            row.appendChild(input); row.appendChild(lab);
            input.addEventListener('change', async () => {
                await apiPost(`/tasks/${child.id}/complete`);
                await reloadTaskData();
                updateTrackingPanel();
                if (typeof renderTasks === 'function') renderTasks();
            });
            container.appendChild(row);
        });
    }

    // ===== 作战卡骨架（一次性构建，之后只填字段） =====
    const CARD_SKELETON = `
        <div class="tp-card-head">
            <div class="ak-status tracking-status tp-status">
                <span class="ak-status__signal"></span>
                <span class="ak-status__label">TRACKING</span>
                <span class="ak-status__detail tp-status-detail">待命</span>
            </div>
            <div class="ak-tag-group tracking-parent-chain tp-parent-chain"></div>
        </div>
        <div class="ak-divider tracking-divider"><span>OPERATION</span></div>
        <h2 class="ak-card__title tracking-title tp-title"></h2>
        <p class="ak-card__description tracking-desc tp-desc"></p>
        <div class="tp-title-row">
            <div class="star-display tp-stars"></div>
            <span class="ak-tag ak-tag--advanced tp-taskline"></span>
        </div>
        <div class="ak-divider tracking-divider tracking-divider--sub"><span>SUB TASKS</span></div>
        <div class="tracking-subtasks tp-subtasks"></div>
        <div class="ak-progress tracking-progress tp-progress">
            <div class="ak-progress__header">
                <span class="ak-progress__caption">PROGRESS</span>
                <span class="ak-progress__value tp-progress-num">0%</span>
            </div>
            <div class="ak-progress__track tp-progress-bar"><span class="ak-progress__fill tp-progress-fill"></span></div>
            <input type="range" class="ak-slider tracking-progress-slider tp-progress-slider hidden" min="0" max="100" step="1" value="0" aria-label="手动进度">
        </div>
        <div class="tracking-actions">
            <button class="ak-button ak-button--outline tracking-act tp-act-stop" type="button"><span class="ak-button__icon"><i class="fa-solid fa-stop"></i></span><span class="ak-button__label">停止追踪</span></button>
            <button class="ak-button ak-button--action tracking-act tp-act-complete" type="button"><span class="ak-button__icon"><i class="fa-solid fa-check"></i></span><span class="ak-button__label">完成任务</span></button>
            <button class="ak-button ak-button--advanced tracking-act tp-act-reward hidden" type="button"><span class="ak-button__icon"><i class="fa-solid fa-gift"></i></span><span class="ak-button__label">领取奖励</span></button>
        </div>`;

    const FOCUS_SKELETON = `
        <div class="tp-focus-top">
            <div class="tp-focus-gauge">
                <span class="ak-face__line--tl" aria-hidden="true"></span>
                <span class="ak-face__line--tr" aria-hidden="true"></span>
                <span class="ak-face__line--bl" aria-hidden="true"></span>
                <span class="ak-face__line--br" aria-hidden="true"></span>
                <div class="ak-gauge tp-gauge fx-gauge hidden" id="fxPomo">
                    <div class="ak-gauge__content">
                        <span class="ak-gauge__label" id="fxPomoKind">FOCUS</span>
                        <span class="ak-gauge__value" id="fxPomoCount">25:00</span>
                        <span class="ak-gauge__unit" id="fxPomoUnit">专注</span>
                    </div>
                </div>
            </div>
            <div class="ak-counter ak-counter--compact tp-focus-timer">
                <span class="ak-counter__prefix"><i class="fa-solid fa-clock"></i></span>
                <span class="ak-counter__content" id="fxTimer">00:00:00</span>
            </div>
        </div>
        <div class="tp-focus-card">
            <div class="ak-status tracking-status tp-status">
                <span class="ak-status__signal"></span>
                <span class="ak-status__label">TRACKING</span>
                <span class="ak-status__detail tp-status-detail">待命</span>
            </div>
            <div class="ak-tag-group tracking-parent-chain tp-parent-chain"></div>
            <div class="ak-divider tracking-divider"><span>OPERATION</span></div>
            <h2 class="ak-card__title tracking-title tp-title"></h2>
            <div class="tp-title-row">
                <div class="star-display tp-stars"></div>
                <span class="ak-tag ak-tag--advanced tp-taskline"></span>
            </div>
            <p class="ak-card__description tracking-desc tp-desc"></p>
            <div class="ak-divider tracking-divider tracking-divider--sub"><span>SUB TASKS</span></div>
            <div class="tracking-subtasks tp-subtasks"></div>
            <div class="ak-progress tracking-progress tp-progress">
                <div class="ak-progress__header">
                    <span class="ak-progress__caption">PROGRESS</span>
                    <span class="ak-progress__value tp-progress-num">0%</span>
                </div>
                <div class="ak-progress__track tp-progress-bar"><span class="ak-progress__fill tp-progress-fill"></span></div>
                <input type="range" class="ak-slider tracking-progress-slider tp-progress-slider hidden" min="0" max="100" step="1" value="0" aria-label="手动进度">
            </div>
            <div class="tracking-actions">
                <button class="ak-button ak-button--outline tracking-act tp-act-stop" type="button"><span class="ak-button__icon"><i class="fa-solid fa-stop"></i></span><span class="ak-button__label">停止追踪</span></button>
                <button class="ak-button ak-button--action tracking-act tp-act-complete" type="button"><span class="ak-button__icon"><i class="fa-solid fa-check"></i></span><span class="ak-button__label">完成任务</span></button>
                <button class="ak-button ak-button--advanced tracking-act tp-act-reward hidden" type="button"><span class="ak-button__icon"><i class="fa-solid fa-gift"></i></span><span class="ak-button__label">领取奖励</span></button>
            </div>
        </div>`;

    function buildRefs(root) {
        return {
            card: root,
            empty: el('tpEmpty'),
            statusDetail: root.querySelector('.tp-status-detail'),
            parentChain: root.querySelector('.tp-parent-chain'),
            stars: root.querySelector('.tp-stars'),
            taskLine: root.querySelector('.tp-taskline'),
            title: root.querySelector('.tp-title'),
            desc: root.querySelector('.tp-desc'),
            subtasks: root.querySelector('.tp-subtasks'),
            progress: root.querySelector('.tp-progress'),
            progressNum: root.querySelector('.tp-progress-num'),
            progressFill: root.querySelector('.tp-progress-fill'),
            progressBar: root.querySelector('.tp-progress-bar'),
            progressSlider: root.querySelector('.tp-progress-slider'),
            stopBtn: root.querySelector('.tp-act-stop'),
            completeBtn: root.querySelector('.tp-act-complete'),
            rewardBtn: root.querySelector('.tp-act-reward'),
        };
    }

    let PANEL = null, FOCUS = null;

    // ===== 渲染作战卡到某个 ref 集合 =====
    function renderOperation(R, task) {
        if (!R) return;
        if (!task) {
            if (R.empty) R.empty.classList.remove('hidden');
            if (R.card) R.card.classList.add('hidden');
            return;
        }
        if (R.empty) R.empty.classList.add('hidden');
        if (R.card) R.card.classList.remove('hidden');

        const kids = childrenOf(task);
        R.statusDetail.textContent = task.status === 'done' ? '已完成'
            : (kids.length ? `${kids.length} 个子任务` : '追踪中');
        buildParentChain(R.parentChain, task);
        R.stars.innerHTML = (typeof goldStars === 'function') ? goldStars(task.priority) : '';
        R.stars.title = `优先级 ${task.priority}`;
        R.taskLine.textContent = task.task_line === 'main' ? '主线' : '支线';
        R.taskLine.className = 'ak-tag ' + (task.task_line === 'main' ? 'ak-tag--advanced' : 'ak-tag--neutral') + ' tp-taskline';
        R.title.textContent = task.title;
        R.title.onclick = () => { if (typeof openTaskDetail === 'function') openTaskDetail(task.id); };
        R.desc.textContent = task.description || '';
        buildSubtasks(R.subtasks, kids);

        const { progress, mode } = computeProgress(task);
        R.progress.className = `ak-progress tracking-progress tp-progress ${mode}`;
        R.progressFill.style.setProperty('--ak-progress-value', `${progress}%`);
        R.progressNum.textContent = `${Math.round(progress)}%`;
        const isManual = mode === 'manual';
        R.progressBar.classList.toggle('hidden', isManual);
        R.progressSlider.classList.toggle('hidden', !isManual);
        if (isManual) R.progressSlider.value = String(Math.round(progress));

        const cs = (typeof claimStateOf === 'function') ? claimStateOf(task) : 'none';
        R.rewardBtn.classList.toggle('hidden', cs !== 'claimable');
    }

    // ===== 番茄钟 UI =====
    function updatePomodoroUI() {
        const g = el('tpPomo');
        if (!g) return;
        if (!state.pomodoro) {
            g.classList.add('hidden');
            g.style.setProperty('--ak-gauge-value', '0%');
            if (el('tpPomoCount')) el('tpPomoCount').textContent = fmtMMSS((parseInt(state.settings.pomodoro_focus_minutes || 25)) * 60);
            if (el('tpPomoCtrl')) el('tpPomoCtrl').classList.add('hidden');
        } else {
            g.classList.remove('hidden');
            if (el('tpPomoCtrl')) el('tpPomoCtrl').classList.remove('hidden');
            const isFocus = state.pomodoro.kind === 'focus';
            el('tpPomoKind').textContent = isFocus ? 'FOCUS' : 'BREAK';
            el('tpPomoKind').className = 'ak-gauge__label ' + (isFocus ? 'focus' : 'break');
            el('tpPomoUnit').textContent = isFocus ? '专注' : '休息';
            g.classList.toggle('ak-gauge--warning', isFocus);
            g.classList.toggle('is-break', !isFocus);
            const endMs = state.pomodoroEndAt instanceof Date ? state.pomodoroEndAt.getTime() : NaN;
            const remainMs = Math.max(0, (Number.isFinite(endMs) ? endMs : Date.now()) - Date.now());
            const remainSec = remainMs / 1000;
            const total = Number(state.pomodoro.planned_seconds) || 1;
            el('tpPomoCount').textContent = fmtMMSS(remainSec);
            const pct = Math.max(0, Math.min(100, ((total - remainSec) / total) * 100));
            g.style.setProperty('--ak-gauge-value', pct.toFixed(2) + '%');
        }
        // 同步专注层的大仪表
        const fg = el('fxPomo');
        if (fg) {
            if (!state.pomodoro) {
                fg.classList.add('hidden');
                if (el('fxPomoCount')) el('fxPomoCount').textContent = fmtMMSS((parseInt(state.settings.pomodoro_focus_minutes || 25)) * 60);
            } else {
                fg.classList.remove('hidden');
                const isFocus = state.pomodoro.kind === 'focus';
                el('fxPomoKind').textContent = isFocus ? 'FOCUS' : 'BREAK';
                el('fxPomoKind').className = 'ak-gauge__label ' + (isFocus ? 'focus' : 'break');
                el('fxPomoUnit').textContent = isFocus ? '专注' : '休息';
                fg.classList.toggle('ak-gauge--warning', isFocus);
                fg.classList.toggle('is-break', !isFocus);
                const endMs = state.pomodoroEndAt instanceof Date ? state.pomodoroEndAt.getTime() : NaN;
                const remainMs = Math.max(0, (Number.isFinite(endMs) ? endMs : Date.now()) - Date.now());
                el('fxPomoCount').textContent = fmtMMSS(remainMs / 1000);
                const total = Number(state.pomodoro.planned_seconds) || 1;
                const pct = Math.max(0, Math.min(100, ((total - (remainMs / 1000)) / total) * 100));
                fg.style.setProperty('--ak-gauge-value', pct.toFixed(2) + '%');
            }
        }
    }

    function updatePomodoroTimer() {
        if (!state.pomodoro) {
            if (el('tpPomo') && el('tpPomo').classList.contains('hidden') && el('tpPomoCount'))
                el('tpPomoCount').textContent = fmtMMSS((parseInt(state.settings.pomodoro_focus_minutes || 25)) * 60);
            return;
        }
        if (state.pomodoroEndAt && state.pomodoroEndAt.getTime() <= Date.now()) {
            handlePomodoroFinished();
            return;
        }
        updatePomodoroUI();
    }

    async function handlePomodoroFinished() {
        if (!state.pomodoro) return;
        const finishedKind = state.pomodoro.kind;
        await apiPost('/pomodoro/stop');
        state.pomodoro = null;
        state.pomodoroEndAt = null;
        updatePomodoroUI();
        playEndAlert();
        flashAlarm();
        if (finishedKind === 'focus') {
            showToast('专注结束，进入休息时间');
            const bm = parseInt(state.settings.pomodoro_break_minutes || 5);
            if (bm > 0) {
                const r = await apiPost('/pomodoro/start', { kind: 'break', planned_seconds: bm * 60 });
                if (r) {
                    state.pomodoro = r;
                    state.pomodoroEndAt = new Date(Date.now() + bm * 60 * 1000);
                    updatePomodoroUI();
                }
            }
        } else {
            showToast('休息结束，继续出发');
            document.body.classList.remove('focus-mode');
            hideFocusMode();
        }
    }

    // ===== 专注模式 =====
    function showFocusMode() {
        const f = el('tpFocus');
        if (f) { f.classList.add('open'); f.setAttribute('aria-hidden', 'false'); }
        updatePomodoroUI();
    }
    function hideFocusMode() {
        const f = el('tpFocus');
        if (f) { f.classList.remove('open'); f.setAttribute('aria-hidden', 'true'); }
    }

    // ===== 提示音（本地合成，无需联网） =====
    let alarmCtx = null;
    function getAlarmCtx() {
        if (!alarmCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            alarmCtx = new AC();
        }
        if (alarmCtx.state === 'suspended') alarmCtx.resume();
        return alarmCtx;
    }
    function playAlarmSound() {
        if ((state.settings.pomodoro_sound || 'on') === 'off') return;
        const ctx = getAlarmCtx(); if (!ctx) return;
        const now = ctx.currentTime;
        [{ f: 880, t: 0 }, { f: 1175, t: 0.45 }, { f: 880, t: 0.9 }].forEach(({ f, t }) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + t);
            gain.gain.setValueAtTime(0.0001, now + t);
            gain.gain.exponentialRampToValueAtTime(0.5, now + t + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + t); osc.stop(now + t + 0.42);
        });
    }
    function playEndAlert() {
        if ((state.settings.pomodoro_sound || 'on') === 'off') return;
        playAlarmSound();
    }
    function flashAlarm() {
        const d = document.createElement('div');
        d.className = 'alarm-flash';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 1900);
    }

    // ===== 对外接口 =====
    async function checkCurrentTracking() {
        const cur = await apiGet('/tracking/current');
        if (cur && cur.task_id) {
            state.trackingTaskId = cur.task_id;
            state.trackingStartTime = new Date(cur.started_at);
            updateTrackingPanel();
            showTrackingPanel();
        } else {
            state.trackingTaskId = null;
            state.trackingStartTime = null;
            updateTrackingPanel();
        }
    }

    async function loadPomodoroCurrent() {
        const data = await apiGet('/pomodoro/current');
        if (data) {
            state.pomodoro = data;
            const startedAt = new Date(data.started_at).getTime();
            const elapsed = Math.max(0, Date.now() - startedAt);
            const remain = Math.max(0, data.planned_seconds * 1000 - elapsed);
            state.pomodoroEndAt = new Date(Date.now() + remain);
            if (data.kind === 'focus') document.body.classList.add('focus-mode');
        } else {
            state.pomodoro = null;
            state.pomodoroEndAt = null;
            document.body.classList.remove('focus-mode');
        }
        updatePomodoroUI();
    }

    async function startPomodoro(kindOverride) {
        const kind = kindOverride || 'focus';
        const fm = parseInt(state.settings.pomodoro_focus_minutes) || 25;
        const bm = parseInt(state.settings.pomodoro_break_minutes) || 5;
        const planned = (kind === 'focus' ? fm : bm) * 60;
        const taskId = state.trackingTaskId || null;
        const r = await apiPost('/pomodoro/start', { kind, task_id: taskId, planned_seconds: planned });
        if (r) {
            state.pomodoro = r;
            state.pomodoroEndAt = new Date(Date.now() + planned * 1000);
            if (kind === 'focus') {
                document.body.classList.add('focus-mode');
                showTrackingPanel();
                showFocusMode();
                showToast('专注模式已开启');
            } else {
                showToast('休息时间开始');
            }
            updatePomodoroUI();
        }
    }

    async function stopPomodoro() {
        const had = !!state.pomodoro;
        if (had) await apiPost('/pomodoro/stop');
        state.pomodoro = null;
        state.pomodoroEndAt = null;
        document.body.classList.remove('focus-mode');
        hideFocusMode();
        updatePomodoroUI();
        if (had) showToast('已退出专注模式');
    }

    function updateTrackingTimer() {
        const t = el('tpTimer');
        if (state.trackingTaskId && state.trackingStartTime) {
            const e = Math.floor((Date.now() - state.trackingStartTime.getTime()) / 1000);
            if (t) t.textContent = fmtTime(e);
            const ft = el('fxTimer'); if (ft) ft.textContent = fmtTime(e);
        } else {
            if (t) t.textContent = '00:00:00';
            const ft = el('fxTimer'); if (ft) ft.textContent = '00:00:00';
        }
    }

    async function toggleTrackingForTask(taskId) {
        if (state.trackingTaskId === taskId) {
            if (state.trackingTaskId) await apiPost(`/tasks/${state.trackingTaskId}/track/stop`);
            state.trackingTaskId = null;
            state.trackingStartTime = null;
            if (document.body.classList.contains('focus-mode')) await stopPomodoro();
            updateTrackingPanel();
            if (typeof renderTasks === 'function') renderTasks();
            hideTrackingPanel();
            return;
        }
        if (state.trackingTaskId) await apiPost(`/tasks/${state.trackingTaskId}/track/stop`);
        const r = await apiPost(`/tasks/${taskId}/track/start`);
        if (r) {
            state.trackingTaskId = taskId;
            state.trackingStartTime = new Date();
            updateTrackingPanel();
            if (typeof renderTasks === 'function') renderTasks();
            showTrackingPanel();
        } else {
            showToast('追踪启动失败');
        }
    }

    async function toggleTracking() {
        if (state.trackingTaskId) {
            const r = await apiPost(`/tasks/${state.trackingTaskId}/track/stop`);
            if (r) {
                state.trackingTaskId = null;
                state.trackingStartTime = null;
                updateTrackingPanel();
                if (typeof renderTasks === 'function') renderTasks();
                if (document.body.classList.contains('focus-mode')) await stopPomodoro();
                hideTrackingPanel();
            }
        }
    }

    async function completeCurrentTracking() {
        if (state.trackingTaskId) {
            const id = state.trackingTaskId;
            if (typeof completeTaskAndHandleReward === 'function') await completeTaskAndHandleReward(id);
        }
    }

    async function toggleFocusMode() {
        if (document.body.classList.contains('focus-mode')) {
            await stopPomodoro();
            return;
        }
        if (!state.trackingTaskId) {
            showToast('请先追踪一个任务再进入专注模式');
            return;
        }
        await startPomodoro('focus');
    }

    function setTrackingStatus(detail, tone) {
        const d = el('tpStatusDetail'); if (d) d.textContent = detail || '';
    }

    function updateTrackingPanel() {
        const task = state.trackingTaskId ? getTaskById(state.trackingTaskId) : null;
        if (PANEL) renderOperation(PANEL, task);
        if (FOCUS) renderOperation(FOCUS, task);
        updateTrackingTimer();
    }

    // ===== 手动进度滑块 =====
    function onSliderInput(e) {
        const v = Number(e.target.value);
        [PANEL, FOCUS].forEach(R => {
            if (R && R.progressFill && !R.progressSlider.hidden) {
                R.progressFill.style.setProperty('--ak-progress-value', `${v}%`);
                R.progressNum.textContent = `${Math.round(v)}%`;
            }
        });
    }
    async function onSliderChange(e) {
        const v = Number(e.target.value);
        if (!state.trackingTaskId) return;
        await apiPost(`/tasks/${state.trackingTaskId}/progress`, { progress: v });
        await reloadTaskData();
        updateTrackingPanel();
        if (typeof renderTasks === 'function') renderTasks();
    }

    // 暴露给全局（app.js 调用）
    window.checkCurrentTracking = checkCurrentTracking;
    window.loadPomodoroCurrent = loadPomodoroCurrent;
    window.updateTrackingTimer = updateTrackingTimer;
    window.updatePomodoroTimer = updatePomodoroTimer;
    window.stopPomodoro = stopPomodoro;
    window.toggleTrackingForTask = toggleTrackingForTask;
    window.toggleTracking = toggleTracking;
    window.completeCurrentTracking = completeCurrentTracking;
    window.toggleFocusMode = toggleFocusMode;
    window.updateTrackingPanel = updateTrackingPanel;
    window.expandTrackingPanel = expandTrackingPanel;
    window.collapseTrackingPanel = collapseTrackingPanel;
    window.trackingPanelIsOpen = trackingPanelIsOpen;
    window.showTrackingPanel = showTrackingPanel;
    window.startPomodoro = startPomodoro;

    // ===== 初始化：构建骨架并绑定事件 =====
    function bindTrackingFeature() {
        const card = el('tpCard');
        if (card) { card.innerHTML = CARD_SKELETON; PANEL = buildRefs(card); }
        const finner = el('tpFocusInner');
        if (finner) { finner.innerHTML = FOCUS_SKELETON; FOCUS = buildRefs(finner); FOCUS.empty = null; }

        // 形态切换器
        document.querySelectorAll('#tpSwitch .tp-variant').forEach(btn => {
            btn.addEventListener('click', () => setPanelVariant(btn.dataset.variant));
        });
        setPanelVariant(window.__tpVariant);

        // 面板头部按钮
        const fb = el('tpFocusBtn'); if (fb) fb.addEventListener('click', toggleFocusMode);
        const cb = el('tpCollapseBtn'); if (cb) cb.addEventListener('click', collapseTrackingPanel);
        const ps = el('tpPomoStop'); if (ps) ps.addEventListener('click', stopPomodoro);
        const fe = el('tpFocusExit'); if (fe) fe.addEventListener('click', stopPomodoro);

        // 作战卡操作按钮（面板 + 专注层各一套）
        [PANEL, FOCUS].forEach(R => {
            if (!R) return;
            if (R.stopBtn) R.stopBtn.addEventListener('click', toggleTracking);
            if (R.completeBtn) R.completeBtn.addEventListener('click', completeCurrentTracking);
            if (R.rewardBtn) R.rewardBtn.addEventListener('click', () => {
                if (state.trackingTaskId && typeof openRewardModal === 'function') openRewardModal(state.trackingTaskId);
            });
            if (R.progressSlider) {
                R.progressSlider.addEventListener('input', onSliderInput);
                R.progressSlider.addEventListener('change', onSliderChange);
            }
        });

        // 初始渲染
        updateTrackingPanel();
        updatePomodoroUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindTrackingFeature);
    } else {
        bindTrackingFeature();
    }
})();
