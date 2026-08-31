/* =============================================
   QUEST LOG - 完整前端逻辑 V3.0 (视觉增强版)
   符合 UI 规范 V1.0：星星统一15°倾斜，粒子动画丰富
   其他逻辑保持不变
   ============================================= */

const state = {
    currentView: 'tasks',
    tasks: [],
    flatTasks: [],
    resources: {},
    achievements: [],
    unlockedAchievements: [],
    settings: {},
    giftPacks: [],
    transactions: [],
    realityRewards: [],
    pomodoro: null,
    pomodoroEndAt: null,
    pomodoroTimer: null,
    filter: {
        status: '', priority: '', taskLine: '', tracked: '', search: '', tags: [],
        showArchived: false, showDeleted: false
    },
    trackingTaskId: null,
    trackingStartTime: null,
    graphScale: 1,
    graphViewBox: { x: 0, y: 0, width: 800, height: 500 },
    graphBaseWidth: 800,
    graphBaseHeight: 500,
    graphNodePositions: {},
    graphUserPanned: false,  // 用户手动拖拽/缩放后为true，阻止auto-fit覆盖
    calendarMonth: new Date(),
    selectedTags: [],
    trackingPanelWidth: 504,
    lastLevel: 0,
    isDraggingGraph: false,
    graphDragStart: { x: 0, y: 0 },
    reorderInProgress: false,
    reorderQueue: [],
    rewardModalAnimating: false,
    repeatNotifyShown: (() => {
        const stored = localStorage.getItem('repeatNotifyShown');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    const obj = {};
                    parsed.forEach(id => obj[id] = true);
                    return obj;
                }
                return parsed || {};
            } catch { return {}; }
        }
        return {};
    })()
};

const DOM = {};
const API_BASE = '/api';
const EXCHANGE_RATES = { source_stone: 1000, orundum: 2 };
const GACHA_COST_ORUNDUM = 300;
window._suppressClick = false;
let rewardModalTimer = null;
let rewardModalOpenTaskId = null;

document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    bindEvents();
    initApp();
});

function cacheDOM() {
    document.querySelectorAll('[id]').forEach(el => { DOM[el.id] = el; });
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    DOM.navCenter = document.getElementById('navTabs');
    DOM.views = document.querySelectorAll('.view');
    DOM.modalOverlay = document.getElementById('modalOverlay');
    DOM.taskForm = document.getElementById('taskForm');
    DOM.starSelector = document.getElementById('starSelector');
    DOM.tagInput = document.getElementById('tagInput');
    DOM.tagList = document.getElementById('tagList');
    DOM.taskFormPriority = document.getElementById('taskFormPriority');
    DOM.taskFormParent = document.getElementById('taskFormParent');
    DOM.taskFormPrerequisite = document.getElementById('taskFormPrerequisite');
    DOM.taskFormRepeatType = document.getElementById('taskFormRepeatType');
    DOM.repeatIntervalGroup = document.getElementById('repeatIntervalGroup');
    DOM.taskFormRewardExp = document.getElementById('taskFormRewardExp');
    DOM.taskFormRewardLungmen = document.getElementById('taskFormRewardLungmen');
    DOM.taskFormStatus = document.getElementById('taskFormStatus');
    DOM.taskFormTarget = document.getElementById('taskFormTarget');
    DOM.taskFormCurrent = document.getElementById('taskFormCurrent');
    DOM.trackingPanel = document.getElementById('trackingPanel');
    DOM.trackingHandle = document.getElementById('trackingHandle');
    DOM.trackingExpanded = document.getElementById('trackingExpanded');
    DOM.trackingResizeHandle = document.getElementById('trackingResizeHandle');
    DOM.mainContent = document.getElementById('mainContent');
    DOM.claimAllBtn = document.getElementById('claimAllBtn');
    DOM.taskList = document.getElementById('taskList');
    DOM.taskListEmpty = document.getElementById('taskListEmpty');
    DOM.filterStatus = document.getElementById('filterStatus');
    DOM.filterPriority = document.getElementById('filterPriority');
    DOM.filterTaskLine = document.getElementById('filterTaskLine');
    DOM.filterTracked = document.getElementById('filterTracked');
    DOM.filterSearch = document.getElementById('filterSearch');
    DOM.tagFilterContainer = document.getElementById('tagFilterContainer');
    DOM.showArchived = document.getElementById('showArchived');
    DOM.showDeleted = document.getElementById('showDeleted');
    DOM.graphSvg = document.getElementById('graphSvg');
    DOM.graphEmpty = document.getElementById('graphEmpty');
    DOM.calendarContainer = document.getElementById('calendarContainer');
    DOM.calendarTitle = document.getElementById('calendarTitle');
    DOM.achievementsGrid = document.getElementById('achievementsGrid');
    DOM.profileLevel = document.getElementById('profileLevel');
    DOM.profileExpFill = document.getElementById('profileExpFill');
    DOM.profileExpText = document.getElementById('profileExpText');
    DOM.profileBadgesGrid = document.getElementById('profileBadgesGrid');
    DOM.giftPacksGrid = document.getElementById('giftPacksGrid');
    DOM.transactionsList = document.getElementById('transactionsList');
    DOM.settingsList = document.getElementById('settingsList');
    DOM.taskDetailBody = document.getElementById('taskDetailBody');
    DOM.badgeNotification = document.getElementById('badgeNotification');
    DOM.badgeNotifName = document.getElementById('badgeNotifName');
    DOM.levelUpOverlay = document.getElementById('levelUpOverlay');
    DOM.levelUpText = document.getElementById('levelUpText');
    DOM.particleContainer = document.getElementById('particleContainer');
    DOM.rewardDetails = document.getElementById('rewardDetails');
    DOM.randomDropSection = document.getElementById('randomDropSection');
    DOM.randomDropContent = document.getElementById('randomDropContent');
    DOM.rewardClaimBtn = document.getElementById('rewardClaimBtn');
    DOM.importTextarea = document.getElementById('importTextarea');
    DOM.exportTextarea = document.getElementById('exportTextarea');
    DOM.badgeName = document.getElementById('badgeName');
    DOM.badgeDesc = document.getElementById('badgeDesc');
    DOM.badgeColor = document.getElementById('badgeColor');
    DOM.badgeImageUpload = document.getElementById('badgeImageUpload');
    DOM.badgePattern = document.getElementById('badgePattern');
    DOM.badgeCustomText = document.getElementById('badgeCustomText');
    DOM.newTaskBtn = document.getElementById('newTaskBtn');
    DOM.importBtn = document.getElementById('importBtn');
    DOM.exportBtn = document.getElementById('exportBtn');
    DOM.settingsBtn = document.getElementById('settingsBtn');
    DOM.customBadgeBtn = document.getElementById('customBadgeBtn');
    DOM.graphZoomIn = document.getElementById('graphZoomIn');
    DOM.graphZoomOut = document.getElementById('graphZoomOut');
    DOM.graphReset = document.getElementById('graphReset');
    DOM.calPrevMonth = document.getElementById('calPrevMonth');
    DOM.calNextMonth = document.getElementById('calNextMonth');
    DOM.trackingToggleBtn = document.getElementById('trackingToggleBtn');
    DOM.trackingCompleteBtn = document.getElementById('trackingCompleteBtn');
    DOM.trackingRewardBtn = document.getElementById('trackingRewardBtn');
    DOM.trackingFocusBtn = document.getElementById('trackingFocusBtn');
    DOM.trackingTimer = document.getElementById('trackingTimer');
    DOM.resStone = document.getElementById('resStone');
    DOM.resLungmen = document.getElementById('resLungmen');
    DOM.resOrundum = document.getElementById('resOrundum');
    DOM.resSanityCurrent = document.getElementById('resSanityCurrent');
    DOM.resSanityMax = document.getElementById('resSanityMax');
    DOM.mobileMenuBtn = document.getElementById('mobileMenuBtn');
    DOM.dateTasksModal = document.getElementById('dateTasksModal');
    DOM.dateTasksTitle = document.getElementById('dateTasksTitle');
    DOM.dateTasksBody = document.getElementById('dateTasksBody');
    DOM.dateTasksClose = document.getElementById('dateTasksClose');
    DOM.exchangeBtn = document.getElementById('exchangeBtn');
    DOM.exchangeModal = document.getElementById('exchangeModal');
    DOM.exchangeTarget = document.getElementById('exchangeTarget');
    DOM.exchangeAmount = document.getElementById('exchangeAmount');
    DOM.exchangeConfirm = document.getElementById('exchangeConfirm');
    DOM.exchangeCancel = document.getElementById('exchangeCancel');
    DOM.exchangeClose = document.getElementById('exchangeClose');
    DOM.exchangeCostDisplay = document.getElementById('exchangeCostDisplay');
    DOM.exchangeLungmenBalance = document.getElementById('exchangeLungmenBalance');
    DOM.gachaBtn = document.getElementById('gachaBtn');
    DOM.gachaModal = document.getElementById('gachaModal');
    DOM.gachaConfirm = document.getElementById('gachaConfirm');
    DOM.gachaCancel = document.getElementById('gachaCancel');
    DOM.gachaClose = document.getElementById('gachaClose');
    DOM.gachaResult = document.getElementById('gachaResult');
    DOM.gachaCloseHint = document.getElementById('gachaCloseHint');
    DOM.gachaOrundumBalance = document.getElementById('gachaOrundumBalance');
    DOM.dragIndicator = document.getElementById('dragIndicator');
    DOM.toastContainer = document.getElementById('toastContainer');
    DOM.confirmModal = document.getElementById('confirmModal');
    DOM.confirmMessage = document.getElementById('confirmMessage');
    DOM.confirmOk = document.getElementById('confirmOk');
    DOM.confirmCancel = document.getElementById('confirmCancel');
    DOM.confirmClose = document.getElementById('confirmClose');
    DOM.exchangeRateText = document.getElementById('exchangeRateText');
    DOM.gachaCostText = document.getElementById('gachaCostText');
    DOM.trackingHeader = document.querySelector('.tracking-header');
    DOM.userInfo = document.getElementById('userInfo');
    DOM.userName = document.getElementById('userName');
    DOM.userLevel = document.getElementById('userLevel');
    DOM.userExpFill = document.getElementById('userExpFill');
    DOM.bgParticles = document.getElementById('bgParticles');
    DOM.sanityDisplay = document.getElementById('sanityDisplay');
    DOM.trackingEmpty = document.getElementById('trackingEmpty');
    DOM.trackingContent = document.getElementById('trackingContent');
    DOM.trackingParentChain = document.getElementById('trackingParentChain');
    DOM.trackingStars = document.getElementById('trackingStars');
    DOM.trackingTaskLine = document.getElementById('trackingTaskLine');
    DOM.trackingTitle = document.getElementById('trackingTitle');
    DOM.trackingDesc = document.getElementById('trackingDesc');
    DOM.trackingSubtasks = document.getElementById('trackingSubtasks');
    DOM.trackingProgressFill = document.getElementById('trackingProgressFill');
    DOM.trackingProgressNum = document.getElementById('trackingProgressNum');
    DOM.trackingProgressThumb = document.getElementById('trackingProgressThumb');
    DOM.trackingProgressBar = document.getElementById('trackingProgressBar');
    DOM.taskModalTitle = document.getElementById('taskModalTitle');
    DOM.taskFormId = document.getElementById('taskFormId');
    DOM.taskFormTitle = document.getElementById('taskFormTitle');
    DOM.taskFormDesc = document.getElementById('taskFormDesc');
    DOM.taskFormTaskLine = document.getElementById('taskFormTaskLine');
    DOM.taskFormPlannedStart = document.getElementById('taskFormPlannedStart');
    DOM.taskFormPlannedEnd = document.getElementById('taskFormPlannedEnd');
    DOM.taskFormDueDate = document.getElementById('taskFormDueDate');
    DOM.taskFormRepeatInterval = document.getElementById('taskFormRepeatInterval');
    DOM.taskFormRewardStone = document.getElementById('taskFormRewardStone');
    DOM.taskFormRewardOrundum = document.getElementById('taskFormRewardOrundum');
    DOM.taskFormNotes = document.getElementById('taskFormNotes');
}

function bindEvents() {
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchView(tab.dataset.view);
            if (window.innerWidth <= 768 && DOM.navCenter) DOM.navCenter.classList.remove('mobile-show');
        });
    });

    DOM.newTaskBtn.addEventListener('click', () => openTaskModal());
    DOM.taskForm.addEventListener('submit', handleTaskFormSubmit);
    document.getElementById('taskFormCancel').addEventListener('click', closeAllModals);

    DOM.starSelector.addEventListener('click', (e) => {
        const star = e.target.closest('.star-select');
        if (star) setStarRating(parseInt(star.dataset.value));
    });

    DOM.tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = DOM.tagInput.value.trim();
            if (tag) addTagToForm(tag);
            DOM.tagInput.value = '';
        }
    });

    DOM.importBtn.addEventListener('click', () => openModal('importModal'));
    document.getElementById('importConfirmBtn').addEventListener('click', handleImport);
    document.getElementById('importCancelBtn').addEventListener('click', closeAllModals);
    DOM.exportBtn.addEventListener('click', handleExport);
    document.getElementById('exportCopyBtn').addEventListener('click', copyExport);
    document.getElementById('exportDownloadBtn').addEventListener('click', downloadExport);

    // 清空数据按钮
    document.getElementById('clearTasksBtn').addEventListener('click', () => clearData('tasks'));
    document.getElementById('clearResourcesBtn').addEventListener('click', () => clearData('resources'));
    document.getElementById('clearAllBtn').addEventListener('click', () => clearData('all'));

    DOM.claimAllBtn.addEventListener('click', handleClaimAll);
    DOM.settingsBtn.addEventListener('click', openSettingsModal);

    DOM.trackingHandle.addEventListener('click', () => {
        if (DOM.trackingPanel.classList.contains('expanded')) {
            collapseTrackingPanel();
        } else {
            expandTrackingPanel();
        }
    });

    DOM.trackingToggleBtn.addEventListener('click', toggleTracking);
    DOM.trackingCompleteBtn.addEventListener('click', completeCurrentTracking);
    DOM.trackingRewardBtn.addEventListener('click', () => { if (state.trackingTaskId) openRewardModal(state.trackingTaskId); });
    DOM.trackingFocusBtn.addEventListener('click', toggleFocusMode);

    DOM.filterStatus.addEventListener('change', applyFilters);
    DOM.filterPriority.addEventListener('change', applyFilters);
    DOM.filterTaskLine.addEventListener('change', applyFilters);
    DOM.filterTracked.addEventListener('change', applyFilters);
    DOM.filterSearch.addEventListener('input', debounce(applyFilters, 300));
    DOM.showArchived.addEventListener('change', applyFilters);
    DOM.showDeleted.addEventListener('change', applyFilters);

    DOM.rewardClaimBtn.addEventListener('click', claimReward);

    DOM.calPrevMonth.addEventListener('click', () => changeMonth(-1));
    DOM.calNextMonth.addEventListener('click', () => changeMonth(1));

    DOM.graphZoomIn.addEventListener('click', () => setGraphZoom(0.2));
    DOM.graphZoomOut.addEventListener('click', () => setGraphZoom(-0.2));
    DOM.graphReset.addEventListener('click', resetGraph);
    DOM.graphSvg.addEventListener('wheel', (e) => {
        e.preventDefault();
        setGraphZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }, { passive: false });

    DOM.customBadgeBtn.addEventListener('click', () => openModal('badgeModal'));
    document.getElementById('badgeConfirmBtn').addEventListener('click', createCustomBadge);
    document.getElementById('badgeCancelBtn').addEventListener('click', closeAllModals);

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    DOM.taskFormRepeatType.addEventListener('change', (e) => {
        DOM.repeatIntervalGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });

    DOM.taskFormStatus.addEventListener('change', () => {
        if (DOM.taskFormStatus.value === 'done' && DOM.taskFormTarget.value) {
            DOM.taskFormCurrent.value = DOM.taskFormTarget.value;
        }
    });

    DOM.taskFormTaskLine.addEventListener('change', updateAutoRewardPreview);
    DOM.taskFormPriority.addEventListener('change', updateAutoRewardPreview);

    DOM.trackingResizeHandle.addEventListener('mousedown', initTrackingResize);

    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeAllModals));
    DOM.modalOverlay.addEventListener('click', closeAllModals);

    DOM.mobileMenuBtn.addEventListener('click', toggleMobileMenu);

    DOM.dateTasksClose.addEventListener('click', closeAllModals);

    DOM.exchangeBtn.addEventListener('click', () => { openModal('exchangeModal'); updateExchangeCost(); updateExchangeBalance(); updateExchangeRateText(); });
    DOM.exchangeCancel.addEventListener('click', closeAllModals);
    DOM.exchangeClose.addEventListener('click', closeAllModals);
    DOM.exchangeConfirm.addEventListener('click', handleExchange);
    DOM.exchangeTarget.addEventListener('change', updateExchangeCost);
    DOM.exchangeAmount.addEventListener('input', updateExchangeCost);

    DOM.gachaBtn.addEventListener('click', () => { openModal('gachaModal'); updateGachaBalance(); updateGachaCostText(); });
    DOM.gachaCancel.addEventListener('click', closeAllModals);
    DOM.gachaClose.addEventListener('click', closeAllModals);
    DOM.gachaConfirm.addEventListener('click', handleGacha);
    DOM.gachaCloseHint.addEventListener('click', closeAllModals);

    DOM.pomodoroStopBtn.addEventListener('click', stopPomodoro);

    DOM.newRealityRewardBtn.addEventListener('click', () => openRealityRewardModal());
    DOM.realityRewardForm.addEventListener('submit', handleRealityRewardFormSubmit);
    DOM.realityRewardCancel.addEventListener('click', closeAllModals);
    DOM.realityRewardClose.addEventListener('click', closeAllModals);
    DOM.realityRewardType.addEventListener('change', () => {
        DOM.realityRewardCurrentGroup.classList.toggle('hidden-soft', DOM.realityRewardType.value !== 'custom');
    });

    let startY = 0, currentY = 0, isDragging = false;
    DOM.dragIndicator.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        DOM.trackingExpanded.style.transition = 'none';
    }, { passive: true });

    DOM.dragIndicator.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) {
            DOM.trackingExpanded.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: false });

    DOM.dragIndicator.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaY = currentY - startY;
        DOM.trackingExpanded.style.transition = 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)';
        if (deltaY > 100) {
            collapseTrackingPanel();
        } else {
            DOM.trackingExpanded.style.transform = '';
        }
        setTimeout(() => {
            DOM.trackingExpanded.style.transition = '';
        }, 300);
    });

    DOM.graphSvg.addEventListener('mousedown', startGraphDrag);
    document.addEventListener('mousemove', moveGraphDrag);
    document.addEventListener('mouseup', endGraphDrag);

    DOM.userInfo.addEventListener('click', () => {
        const newName = prompt('输入新的用户名：', state.settings.username || '博士');
        if (newName && newName.trim()) {
            apiPut('/settings', { username: newName.trim() }).then(() => {
                state.settings.username = newName.trim();
                updateUserInfo();
            });
        }
    });

    DOM.confirmOk.addEventListener('click', () => { if (window._confirmCallback) window._confirmCallback(); closeAllModals(); });
    DOM.confirmCancel.addEventListener('click', closeAllModals);
    DOM.confirmClose.addEventListener('click', closeAllModals);

    window.addEventListener('resize', debounce(() => {
        if (window.innerWidth > 768) {
            DOM.trackingExpanded.style.transform = '';
            DOM.trackingExpanded.style.transition = '';
            if (DOM.trackingPanel.classList.contains('expanded')) {
                DOM.trackingPanel.style.width = `${state.trackingPanelWidth}px`;
                DOM.mainContent.style.marginLeft = `${state.trackingPanelWidth}px`;
            } else {
                DOM.mainContent.style.marginLeft = '56px';
            }
        } else {
            DOM.trackingPanel.style.width = '';
            DOM.mainContent.style.marginLeft = '0';
            if (DOM.trackingPanel.classList.contains('expanded')) {
                DOM.trackingExpanded.style.transform = 'translateY(0)';
            } else {
                DOM.trackingExpanded.style.transform = 'translateY(100%)';
            }
        }
    }, 200));
}

function toggleMobileMenu() {
    if (window.innerWidth > 768 || !DOM.navCenter) return;
    DOM.navCenter.classList.toggle('mobile-show');
}

async function initApp() {
    await loadSettings();
    applyTheme();
    applyWallpaper();
    await loadResources();
    await loadTasks();
    await loadAchievements();
    await loadGiftPacks();
    await loadTransactions();
    await loadRealityRewards();
    await checkCurrentTracking();
    await loadPomodoroCurrent();
    renderCalendar();
    updateResourceDisplay();
    updateUserInfo();
    updateClaimAllButton();
    applySettingsFromState();
    updateGachaCostText();
    setInterval(updateTrackingTimer, 1000);
    setInterval(updatePomodoroTimer, 1000);
    updateResourceTimestamp();
    setInterval(updateResourceTimestamp, 30000);
    initBackgroundParticles();
    initRemoteUrl();  // 远程地址轮询
    document.body.dataset.view = state.currentView;
    renderCurrentView();
}

/* ===== 远程地址（cpolar 隧道） ===== */
function initRemoteUrl() {
    const btn = document.getElementById('remoteUrlBtn');
    const textEl = document.getElementById('remoteUrlText');
    const iconEl = document.getElementById('remoteUrlIcon');
    if (!btn || !textEl) return;

    let currentUrl = '';

    btn.addEventListener('click', async () => {
        if (!currentUrl) return;
        try {
            await navigator.clipboard.writeText(currentUrl);
            btn.classList.add('copied');
            const prev = textEl.textContent;
            textEl.textContent = 'COPIED!';
            setTimeout(() => { btn.classList.remove('copied'); textEl.textContent = prev; }, 1500);
        } catch { /* fallback */ }
    });

    async function poll() {
        try {
            const res = await fetch('/api/remote-url');
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    currentUrl = data.url;
                    textEl.textContent = data.url.replace('https://', '').replace('http://', '');
                    btn.title = 'Click to copy: ' + data.url;
                    btn.classList.add('connected');
                    return;
                }
            }
        } catch {}
        // No URL yet - show connecting state
        currentUrl = '';
        textEl.textContent = 'connecting...';
        btn.title = 'Waiting for tunnel...';
        btn.classList.remove('connected', 'copied');
    }
    poll();
    setInterval(poll, 3000);
}

function renderCurrentView() {
    const view = state.currentView;
    if (view === 'tasks') renderTasks();
    else if (view === 'graph') renderGraph();
    else if (view === 'calendar') renderCalendar();
    else if (view === 'achievements') renderAchievements();
    else if (view === 'rewards') renderRealityRewards();
    else if (view === 'profile') { updateResourceDisplay(); renderProfileBadges(); renderGiftPacks(); renderTransactions(); }
}

async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`);
        if (!res.ok) {
            let message = `API ${endpoint} failed`;
            try { const errData = await res.json(); message = errData?.message || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        return json.data ?? json;
    } catch (err) {
        console.error(err);
        showToast(err.message || '请求失败');
        return null;
    }
}

async function apiPost(endpoint, data = {}, isFormData = false) {
    try {
        const options = {
            method: 'POST',
            headers: isFormData ? {} : { 'Content-Type': 'application/json' },
            body: isFormData ? data : JSON.stringify(data)
        };
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            let message = `API ${endpoint} failed`;
            try { const errData = await res.json(); message = errData?.message || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        return json.data ?? json;
    } catch (err) {
        console.error(err);
        showToast(err.message || '操作失败');
        return null;
    }
}

async function apiPut(endpoint, data = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            let message = `API ${endpoint} failed`;
            try { const errData = await res.json(); message = errData?.message || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        return json.data ?? json;
    } catch (err) {
        console.error(err);
        showToast(err.message || '更新失败');
        return null;
    }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
        if (!res.ok) {
            let message = `API ${endpoint} failed`;
            try { const errData = await res.json(); message = errData?.message || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        return json.data ?? json;
    } catch (err) {
        console.error(err);
        showToast(err.message || '删除失败');
        return null;
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showConfirm(message, callback) {
    DOM.confirmMessage.textContent = message;
    window._confirmCallback = callback;
    openModal('confirmModal');
}

function initBackgroundParticles() {
    const container = DOM.bgParticles;
    const canvas = document.createElement('canvas');
    canvas.id = 'bgParticlesCanvas';
    container.innerHTML = '';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let width, height;
    function resize() { width = canvas.width = container.clientWidth; height = canvas.height = container.clientHeight; }
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * width, y: Math.random() * height,
            size: Math.random() * 2.5 + 0.5,
            speedX: (Math.random() - 0.5) * 0.25, speedY: (Math.random() - 0.5) * 0.25,
            opacity: Math.random() * 0.35 + 0.08,
            rotation: Math.random() * Math.PI * 2, rotationSpeed: (Math.random() - 0.5) * 0.015,
        });
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const isTracking = !!state.trackingTaskId;
        particles.forEach(p => {
            if (isTracking) {
                p.speedX += (Math.random() - 0.5) * 0.015;
                p.speedY += (Math.random() - 0.5) * 0.015;
                p.rotation += p.rotationSpeed;
                p.x += p.speedX; p.y += p.speedY;
                if (p.x < 0) { p.x = 0; p.speedX = Math.abs(p.speedX); }
                if (p.x > width) { p.x = width; p.speedX = -Math.abs(p.speedX); }
                if (p.y < 0) { p.y = 0; p.speedY = Math.abs(p.speedY); }
                if (p.y > height) { p.y = height; p.speedY = -Math.abs(p.speedY); }
            } else {
                p.x += p.speedX; p.y += p.speedY;
                if (p.x < 0) p.x = width; if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height; if (p.y > height) p.y = 0;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            if (isTracking) {
                ctx.rotate(p.rotation);
                ctx.fillStyle = `rgba(200,200,200,${p.opacity * 0.7})`;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 1.3);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
                ctx.fill();
            }
            ctx.restore();
        });
        requestAnimationFrame(draw);
    }
    draw();
}

async function loadTasks() {
    const tree = await apiGet('/tasks/tree?include_archived=true&include_deleted=true');
    if (tree) {
        state.tasks = tree;
        flattenTasks(state.tasks, 0);
        applyFilters();
        renderGraph();
        updateTrackingPanelIfNeeded();
    }
}

function flattenTasks(taskTree, level) {
    state.flatTasks = [];
    function walk(nodes, level) {
        nodes.forEach(node => {
            node.level = level;
            state.flatTasks.push(node);
            if (node.children && node.children.length) walk(node.children, level + 1);
        });
    }
    walk(taskTree, 0);
}

async function loadResources() {
    const res = await apiGet('/resources');
    if (res) {
        if (Array.isArray(res)) {
            state.resources = res.reduce((acc, r) => { acc[r.resource_type] = r; return acc; }, {});
        } else {
            state.resources = res;
        }
        updateResourceDisplay();
        updateUserInfo();
        checkLevelUp();
    }
}

async function loadSettings() {
    const settings = await apiGet('/settings');
    if (settings) { state.settings = settings; applySettingsFromState(); updateUserInfo(); }
}

async function loadAchievements() {
    const all = await apiGet('/achievements');
    if (all) state.achievements = all;
    const unlocked = await apiGet('/achievements/unlocked');
    if (unlocked) {
        state.unlockedAchievements = unlocked;
        renderAchievements();
        renderProfileBadges();
        checkNewUnlocks();
    }
}

async function loadGiftPacks() {
    const packs = await apiGet('/gift-packs');
    if (packs) { state.giftPacks = packs; renderGiftPacks(); }
}

async function loadTransactions() {
    const trans = await apiGet('/resources/transactions');
    if (trans) { state.transactions = trans; renderTransactions(); }
}

async function loadRealityRewards() {
    const data = await apiGet('/reality-rewards');
    if (data) {
        const firstLoad = !state._realityRewardsLoaded;
        const previousAchievedIds = new Set((state.realityRewards || []).filter(r => r.status === 'achieved').map(r => r.id));
        state.realityRewards = data;
        state._realityRewardsLoaded = true;
        if (state.currentView === 'rewards') renderRealityRewards();
        if (!firstLoad) {
            const newAchieved = data.filter(r => r.status === 'achieved' && !previousAchievedIds.has(r.id));
            newAchieved.forEach((r, index) => {
                setTimeout(() => showToast(`现实奖励达成：${r.title}`), index * 500);
            });
        }
    }
}

function renderRealityRewards() {
    const list = DOM.realityRewardsList;
    if (!list) return;
    list.innerHTML = '';
    if (!state.realityRewards.length) {
        const empty = document.createElement('div');
        empty.className = 'reality-rewards-empty';
        empty.innerHTML = '<div class="empty-icon"><i class="fa-solid fa-gift"></i></div><p>还没有现实奖励目标</p><p class="micro-text">把想得到的奖励写进来，完成任务后提醒自己兑现</p>';
        list.appendChild(empty);
        return;
    }
    const order = { 'pending': 0, 'achieved': 1, 'claimed': 2, 'archived': 3 };
    const rewards = [...state.realityRewards].sort((a, b) => (order[a.status] || 9) - (order[b.status] || 9));
    rewards.forEach(reward => {
        const card = document.createElement('div');
        card.className = `reality-reward-card status-${reward.status}`;
        const current = reward.current_value || 0;
        const target = reward.target_value || 1;
        const percent = Math.min(100, Math.round((current / target) * 100));

        const top = document.createElement('div');
        top.className = 'reality-reward-top';
        const info = document.createElement('div');
        info.className = 'reality-reward-info';
        const title = document.createElement('div');
        title.className = 'reality-reward-title';
        title.textContent = reward.title;
        const desc = document.createElement('div');
        desc.className = 'reality-reward-desc';
        desc.textContent = reward.description || '达成条件后，奖励自己一次';
        info.appendChild(title);
        info.appendChild(desc);
        const badge = document.createElement('span');
        badge.className = `reality-reward-status ${reward.status}`;
        const statusText = { pending: '进行中', achieved: '可兑换', claimed: '已兑换', archived: '已归档' };
        badge.textContent = statusText[reward.status] || reward.status;
        top.appendChild(info);
        top.appendChild(badge);
        card.appendChild(top);

        const progressWrap = document.createElement('div');
        progressWrap.className = 'reality-reward-progress-wrap';
        const bar = document.createElement('div');
        bar.className = 'progress-bar reality-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-fill' + (reward.status === 'achieved' ? ' achieved' : '');
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);
        const num = document.createElement('span');
        num.className = 'reality-reward-num';
        num.textContent = `${current} / ${target}（${percent}%）`;
        progressWrap.appendChild(bar);
        progressWrap.appendChild(num);
        card.appendChild(progressWrap);

        if (reward.reward_text) {
            const rewardLine = document.createElement('div');
            rewardLine.className = 'reality-reward-text';
            rewardLine.innerHTML = '<i class="fa-solid fa-mug-hot"></i> ' + escapeHtml(reward.reward_text);
            card.appendChild(rewardLine);
        }

        const actions = document.createElement('div');
        actions.className = 'reality-reward-actions';
        if (reward.status === 'achieved') {
            const claimBtn = document.createElement('button');
            claimBtn.className = 'btn btn-primary btn-medium';
            claimBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>已达成，去兑换</span>';
            claimBtn.addEventListener('click', () => claimRealityReward(reward.id));
            actions.appendChild(claimBtn);
        }
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-medium';
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i><span>编辑</span>';
        editBtn.addEventListener('click', () => openRealityRewardModal(reward));
        actions.appendChild(editBtn);
        if (reward.status !== 'archived') {
            const archiveBtn = document.createElement('button');
            archiveBtn.className = 'btn btn-secondary btn-medium';
            archiveBtn.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>归档</span>';
            archiveBtn.addEventListener('click', async () => {
                await apiPut(`/reality-rewards/${reward.id}`, { status: 'archived' });
                await loadRealityRewards();
            });
            actions.appendChild(archiveBtn);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-medium';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i><span>删除</span>';
        deleteBtn.addEventListener('click', () => showConfirm('确定删除这个现实奖励吗？', async () => {
            await apiDelete(`/reality-rewards/${reward.id}`);
            await loadRealityRewards();
        }));
        actions.appendChild(deleteBtn);
        card.appendChild(actions);
        list.appendChild(card);
    });
}

function openRealityRewardModal(reward = null) {
    DOM.realityRewardForm.reset();
    DOM.realityRewardId.value = '';
    DOM.realityRewardTitle.value = '';
    DOM.realityRewardDesc.value = '';
    DOM.realityRewardTarget.value = '';
    DOM.realityRewardCurrent.value = '0';
    DOM.realityRewardText.value = '';
    DOM.realityRewardType.value = 'level';
    DOM.realityRewardCurrentGroup.classList.add('hidden-soft');
    DOM.realityRewardModalTitle.textContent = '新建现实奖励';
    if (reward) {
        DOM.realityRewardModalTitle.textContent = '编辑现实奖励';
        DOM.realityRewardId.value = reward.id;
        DOM.realityRewardTitle.value = reward.title || '';
        DOM.realityRewardDesc.value = reward.description || '';
        DOM.realityRewardType.value = reward.target_type || 'level';
        DOM.realityRewardTarget.value = reward.target_value || '';
        DOM.realityRewardCurrent.value = reward.current_value || '0';
        DOM.realityRewardText.value = reward.reward_text || '';
        if (reward.target_type === 'custom') DOM.realityRewardCurrentGroup.classList.remove('hidden-soft');
    }
    openModal('realityRewardModal');
}

async function handleRealityRewardFormSubmit(e) {
    e.preventDefault();
    const id = DOM.realityRewardId.value;
    const title = DOM.realityRewardTitle.value.trim();
    if (!title) { showToast('请输入奖励名称'); return; }
    const target_type = DOM.realityRewardType.value;
    const target_value = parseFloat(DOM.realityRewardTarget.value);
    if (isNaN(target_value) || target_value <= 0) { showToast('请输入有效的目标值'); return; }
    const payload = {
        title,
        description: DOM.realityRewardDesc.value.trim(),
        target_type,
        target_value,
        reward_text: DOM.realityRewardText.value.trim(),
    };
    if (target_type === 'custom') payload.current_value = parseFloat(DOM.realityRewardCurrent.value) || 0;
    const result = id ? await apiPut(`/reality-rewards/${id}`, payload) : await apiPost('/reality-rewards', payload);
    if (result) {
        closeAllModals();
        await loadRealityRewards();
        showToast(id ? '现实奖励已更新' : '现实奖励已创建');
    }
}

async function claimRealityReward(id) {
    const result = await apiPost(`/reality-rewards/${id}/claim`);
    if (result) {
        await loadRealityRewards();
        showToast('兑换成功，记得好好奖励自己');
    }
}

async function loadPomodoroCurrent() {
    const data = await apiGet('/pomodoro/current');
    if (data) {
        state.pomodoro = data;
        const startedAt = new Date(data.started_at).getTime();
        const elapsedMs = Math.max(0, Date.now() - startedAt);
        const remainMs = Math.max(0, (data.planned_seconds * 1000) - elapsedMs);
        state.pomodoroEndAt = new Date(Date.now() + remainMs);
    } else {
        state.pomodoro = null;
        state.pomodoroEndAt = null;
    }
    updatePomodoroUI();
}

function updatePomodoroUI() {
    const statusEl = DOM.pomodoroStatus;
    if (!statusEl) return;
    if (!state.pomodoro) {
        statusEl.classList.add('hidden');
        if (DOM.pomodoroCountdown) DOM.pomodoroCountdown.textContent = `${state.settings.pomodoro_focus_minutes || 25}:00`;
        return;
    }
    statusEl.classList.remove('hidden');
    DOM.pomodoroKind.textContent = state.pomodoro.kind === 'focus' ? '专注' : '休息';
    DOM.pomodoroKind.className = 'pomodoro-kind ' + state.pomodoro.kind;
    const remainMs = Math.max(0, (state.pomodoroEndAt ? state.pomodoroEndAt.getTime() : Date.now()) - Date.now());
    const remainSec = Math.floor(remainMs / 1000);
    const total = state.pomodoro.planned_seconds || 1;
    const m = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const sec = String(remainSec % 60).padStart(2, '0');
    DOM.pomodoroCountdown.textContent = `${m}:${sec}`;
    const percent = Math.max(0, Math.min(100, ((total - remainSec) / total) * 100));
    if (DOM.pomodoroStatus) DOM.pomodoroStatus.style.setProperty('--pomodoro-progress', percent);
}

function updatePomodoroTimer() {
    if (!state.pomodoro) {
        if (DOM.pomodoroCountdown && DOM.pomodoroStatus && DOM.pomodoroStatus.classList.contains('hidden')) {
            DOM.pomodoroCountdown.textContent = `${state.settings.pomodoro_focus_minutes || 25}:00`;
        }
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
    if (finishedKind === 'focus') {
        showToast('专注结束，进入休息时间');
        const breakMinutes = parseInt(state.settings.pomodoro_break_minutes || 5);
        if (breakMinutes > 0) {
            const result = await apiPost('/pomodoro/start', { kind: 'break', planned_seconds: breakMinutes * 60 });
            if (result) {
                state.pomodoro = result;
                state.pomodoroEndAt = new Date(Date.now() + breakMinutes * 60 * 1000);
                updatePomodoroUI();
            }
        }
    } else {
        showToast('休息结束，继续出发');
        document.body.classList.remove('focus-mode');
    }
}

async function startPomodoro(kindOverride) {
    const kind = kindOverride || 'focus';
    const focusMinutes = parseInt(state.settings.pomodoro_focus_minutes) || 25;
    const breakMinutes = parseInt(state.settings.pomodoro_break_minutes) || 5;
    const planned = (kind === 'focus' ? focusMinutes : breakMinutes) * 60;
    const taskId = state.trackingTaskId || null;
    const result = await apiPost('/pomodoro/start', { kind, task_id: taskId, planned_seconds: planned });
    if (result) {
        state.pomodoro = result;
        state.pomodoroEndAt = new Date(Date.now() + planned * 1000);
        if (kind === 'focus') {
            document.body.classList.add('focus-mode');
            expandTrackingPanel();
            showToast('专注模式已开启');
        } else {
            showToast('休息时间开始');
        }
        updatePomodoroUI();
    }
}

async function stopPomodoro() {
    const hadPomodoro = !!state.pomodoro;
    if (hadPomodoro) await apiPost('/pomodoro/stop');
    state.pomodoro = null;
    state.pomodoroEndAt = null;
    document.body.classList.remove('focus-mode');
    updatePomodoroUI();
    if (hadPomodoro) showToast('已退出专注模式');
}

async function checkCurrentTracking() {
    const current = await apiGet('/tracking/current');
    if (current && current.task_id) {
        state.trackingTaskId = current.task_id;
        state.trackingStartTime = new Date(current.started_at);
        updateTrackingPanel();
        if (!state.settings.tracking_panel_collapsed) expandTrackingPanel();
        else collapseTrackingPanel();
    }
}

function renderTasks() {
    const list = DOM.taskList;
    list.innerHTML = '';
    const filtered = filterTasks(state.flatTasks);
    if (filtered.length === 0) {
        DOM.taskListEmpty.style.display = 'block';
    } else {
        DOM.taskListEmpty.style.display = 'none';
        appendTaskGroups(list, filtered);
    }
    updateClaimAllButton();
    enableDragSort();
}

function appendTaskGroups(list, filtered) {
    const filteredIds = new Set(filtered.map(t => t.id));
    const added = new Set();
    const collectDescendants = (task) => {
        let result = [task];
        const children = state.flatTasks.filter(t => t.parent_id === task.id && filteredIds.has(t.id));
        children.forEach(child => {
            result = result.concat(collectDescendants(child));
        });
        return result;
    };
    filtered.forEach(task => {
        if (added.has(task.id)) return;
        let root = task;
        while (root.parent_id) {
            const parent = state.flatTasks.find(t => t.id === root.parent_id);
            if (parent && filteredIds.has(parent.id)) root = parent;
            else break;
        }
        if (added.has(root.id)) return;
        const groupTasks = collectDescendants(root).filter(t => filteredIds.has(t.id));
        groupTasks.forEach(t => added.add(t.id));
        const group = document.createElement('div');
        group.className = 'task-group';
        groupTasks.forEach(t => {
            const card = createTaskCard(t);
            if (t.parent_id && groupTasks.some(p => p.id === t.parent_id)) {
                card.classList.add('task-in-group-child');
            }
            group.appendChild(card);
        });
        list.appendChild(group);
    });
}

function filterTasks(tasks) {
    let filtered = [...tasks];
    if (!state.filter.showArchived) filtered = filtered.filter(t => !t.archived);
    if (!state.filter.showDeleted) filtered = filtered.filter(t => !t.deleted);
    if (state.filter.status) filtered = filtered.filter(t => t.status === state.filter.status);
    if (state.filter.priority) filtered = filtered.filter(t => t.priority == state.filter.priority);
    if (state.filter.taskLine) filtered = filtered.filter(t => t.task_line === state.filter.taskLine);
    if (state.filter.tracked !== '') filtered = filtered.filter(t => t.is_tracked == state.filter.tracked);
    if (state.filter.search) {
        const q = state.filter.search.toLowerCase();
        filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }
    if (state.filter.tags.length) {
        filtered = filtered.filter(t => {
            const taskTags = (t.tags || []).map(tag => tag.name);
            return state.filter.tags.every(tag => taskTags.includes(tag));
        });
    }
    if (state.trackingTaskId) {
        const trackedTask = state.flatTasks.find(t => t.id === state.trackingTaskId);
        if (trackedTask) {
            const trackingLine = trackedTask.task_line;
            if (trackingLine === 'main' && !state.settings.show_side_when_tracking_main) filtered = filtered.filter(t => t.task_line === 'main');
            else if (trackingLine === 'side' && !state.settings.show_main_when_tracking_side) filtered = filtered.filter(t => t.task_line === 'side');
        }
    }
    filtered.sort((a, b) => {
        if (a.id === state.trackingTaskId) return -1;
        if (b.id === state.trackingTaskId) return 1;
        const aBlocked = isBlocked(a), bBlocked = isBlocked(b);
        if (aBlocked && !bBlocked) return 1;
        if (!aBlocked && bBlocked) return -1;
        if (a.task_line === 'main' && b.task_line !== 'main') return -1;
        if (a.task_line !== 'main' && b.task_line === 'main') return 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return (a.sort_order || 0) - (b.sort_order || 0);
    });
    return filtered;
}

function getBlockReason(task) {
    // 仅当「显式前置依赖」未完成时才锁定。父子是聚合关系，父任务没完成不应把子任务当门禁锁死
    if (task.prerequisite_id) {
        const pre = state.flatTasks.find(t => t.id === task.prerequisite_id);
        if (pre && pre.status !== 'done') return `前置任务「${pre.title}」未完成`;
        if (!pre) return '前置任务不存在或已删除';
    }
    return null;
}

function isBlocked(task) {
    return getBlockReason(task) !== null;
}

// ===== 创建星星元素 (统一15°倾斜) =====
function createStarElement() {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '★';
    star.style.transform = 'rotate(15deg)';
    star.style.display = 'inline-block';
    star.style.color = 'var(--highlight-gold-1)';
    star.style.textShadow = '0 2px 4px rgba(0,0,0,0.6), 0 0 6px rgba(232,184,24,0.5)';
    return star;
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card status-${task.status} ${task.children && task.children.length ? 'parent-task' : 'child-task'} task-level-${task.level || 0}`;
    card.dataset.taskId = task.id;
    card.dataset.priority = task.priority;
    card.dataset.status = task.status;
    card.draggable = !isBlocked(task) && task.status !== 'done';
    // V4 光泽扫过层（hover 时划过一道高光）
    const cardSheen = document.createElement('div');
    cardSheen.className = 'card-sheen';
    card.appendChild(cardSheen);
    if (isBlocked(task)) {
        card.classList.add('dependency-blocked');
        card.style.pointerEvents = 'none';
        card.draggable = false;
    }
    if (task.status === 'done') card.draggable = false;

    // 已完成装饰角标（低调）
    if (task.status === 'done') {
        const completedBadge = document.createElement('div');
        completedBadge.className = 'task-completed-badge';
        completedBadge.textContent = 'completed';
        card.appendChild(completedBadge);
    }

    const indent = document.createElement('div');
    indent.className = `task-indent task-indent-level-${task.level || 0}`;
    if (task.level > 0) {
        const connector = document.createElement('div');
        connector.className = 'tree-connector';
        indent.appendChild(connector);
    }
    card.appendChild(indent);

    const main = document.createElement('div');
    main.className = 'task-main';
    const stars = document.createElement('div');
    stars.className = 'task-stars';
    const starBg = document.createElement('div');
    starBg.className = `star-bg priority-${task.priority}`;
    for (let i = 0; i < task.priority; i++) {
        starBg.appendChild(createStarElement());
    }
    stars.appendChild(starBg);
    main.appendChild(stars);
    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    topRow.appendChild(title);
    const lineTag = document.createElement('span');
    lineTag.className = `task-line-tag ${task.task_line}`;
    lineTag.textContent = task.task_line === 'main' ? '主线' : '支线';
    topRow.appendChild(lineTag);
    main.appendChild(topRow);
    if (task.description) {
        const desc = document.createElement('div');
        desc.className = 'task-desc';
        desc.textContent = task.description;
        main.appendChild(desc);
    }
    if (task.tags && task.tags.length) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'task-tags';
        task.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'task-tag';
            tagSpan.textContent = tag.name;
            tagsDiv.appendChild(tagSpan);
        });
        main.appendChild(tagsDiv);
    }
    if (task.progress_mode === 'count' && task.target_value) {
        const countDiv = document.createElement('div');
        countDiv.className = 'count-controls';
        const decBtn = document.createElement('button');
        decBtn.className = 'count-btn';
        decBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
        decBtn.disabled = task.status === 'done';
        decBtn.addEventListener('click', (e) => { e.stopPropagation(); if (task.status !== 'done') updateCount(task.id, -1); });
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'count-input';
        input.value = task.current_value;
        input.min = 0;
        input.max = task.target_value;
        input.disabled = task.status === 'done';
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            if (task.status === 'done') return;
            let targetVal = parseInt(e.target.value) || 0;
            targetVal = Math.max(0, Math.min(targetVal, task.target_value));
            if (targetVal !== task.current_value) updateCount(task.id, targetVal - task.current_value);
            e.target.value = targetVal;
        });
        const targetSpan = document.createElement('span');
        targetSpan.className = 'count-target';
        targetSpan.textContent = `/ ${task.target_value}`;
        const incBtn = document.createElement('button');
        incBtn.className = 'count-btn';
        incBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        incBtn.disabled = task.status === 'done';
        incBtn.addEventListener('click', (e) => { e.stopPropagation(); if (task.status !== 'done') updateCount(task.id, 1); });
        countDiv.appendChild(decBtn);
        countDiv.appendChild(input);
        countDiv.appendChild(targetSpan);
        countDiv.appendChild(incBtn);
        main.appendChild(countDiv);
    }
    card.appendChild(main);

    const progressSection = document.createElement('div');
    progressSection.className = 'task-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = `progress-fill ${task.progress_mode === 'manual' ? 'manual' : task.progress_mode === 'count' ? 'count' : ''}`;
    let progressPercent = task.progress_mode === 'count' && task.target_value ? Math.min(100, (task.current_value / task.target_value) * 100) : (task.progress || 0);
    progressFill.style.width = `${progressPercent}%`;
    if (task.progress_mode === 'manual' && task.status !== 'done' && !task.children?.length) {
        const thumb = document.createElement('div');
        thumb.className = 'progress-thumb';
        thumb.style.left = `${progressPercent}%`;
        thumb.addEventListener('mousedown', (e) => startProgressDrag(e, task, progressBar, progressFill, thumb));
        thumb.addEventListener('touchstart', (e) => startProgressDragTouch(e, task, progressBar, progressFill, thumb), { passive: false });
        progressBar.appendChild(thumb);
    }
    progressBar.appendChild(progressFill);
    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    if (task.progress_mode === 'count' && task.target_value) progressText.textContent = `${task.current_value}/${task.target_value}`;
    else progressText.textContent = `${Math.round(progressPercent)}%`;
    progressSection.appendChild(progressBar);
    progressSection.appendChild(progressText);
    card.appendChild(progressSection);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    if (state.settings.quick_track) {
        const trackBtn = document.createElement('button');
        trackBtn.className = `action-btn track-btn ${state.trackingTaskId === task.id ? 'active' : ''}`;
        trackBtn.innerHTML = '<i class="fa-solid fa-diamond"></i>';
        trackBtn.title = '追踪';
        trackBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTrackingForTask(task.id); });
        actions.appendChild(trackBtn);
    }
    if (task.status === 'done' && !task.reward_claimed && hasActualReward(task)) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'claim-btn';
        claimBtn.innerHTML = '<i class="fa-solid fa-gift"></i> 领取奖励';
        claimBtn.title = '领取奖励';
        claimBtn.addEventListener('click', (e) => { e.stopPropagation(); openRewardModal(task.id); });
        actions.appendChild(claimBtn);
    }
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.title = '编辑';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openTaskModal(task); });
    actions.appendChild(editBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn danger';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); showConfirm('确定要删除此任务吗？', () => handleDeleteTask(task.id)); });
    actions.appendChild(deleteBtn);
    if (task.archived) {
        const unarchiveBtn = document.createElement('button');
        unarchiveBtn.className = 'action-btn';
        unarchiveBtn.innerHTML = '<i class="fa-solid fa-box-open"></i>';
        unarchiveBtn.title = '恢复归档';
        unarchiveBtn.addEventListener('click', (e) => { e.stopPropagation(); handleUnarchive(task.id); });
        actions.appendChild(unarchiveBtn);
    } else if (task.deleted) {
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'action-btn';
        restoreBtn.innerHTML = '<i class="fa-solid fa-trash-restore"></i>';
        restoreBtn.title = '恢复';
        restoreBtn.addEventListener('click', (e) => { e.stopPropagation(); handleRestoreTask(task.id); });
        actions.appendChild(restoreBtn);
    } else {
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'action-btn';
        archiveBtn.innerHTML = '<i class="fa-solid fa-box"></i>';
        archiveBtn.title = '归档';
        archiveBtn.addEventListener('click', (e) => { e.stopPropagation(); handleArchive(task.id); });
        actions.appendChild(archiveBtn);
    }
    card.appendChild(actions);
    card.addEventListener('click', () => { if (window._suppressClick) return; if (!isBlocked(task)) openTaskDetail(task.id); });
    return card;
}

function hasActualReward(task) {
    if (task.reward_exp > 0 || task.reward_lungmen > 0 || task.reward_source_stone > 0 || task.reward_orundum > 0) return true;
    if (task.drop_config) {
        try {
            const config = JSON.parse(task.drop_config);
            const drops = config.random_drops || (Array.isArray(config) ? config : []);
            if (Array.isArray(drops) && drops.length > 0) {
                return drops.some(drop => {
                    if (typeof drop === 'string') {
                        const parts = drop.split(':');
                        if (parts.length === 2) {
                            const amount = parseFloat(parts[1]);
                            return !isNaN(amount) && amount > 0;
                        }
                        const oldParts = drop.split('_');
                        if (oldParts.length === 2) {
                            const amount = parseFloat(oldParts[1]);
                            return !isNaN(amount) && amount > 0;
                        }
                    }
                    return false;
                });
            }
        } catch { return false; }
    }
    return false;
}

function enableDragSort() {
    document.querySelectorAll('.task-card[draggable="true"]').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragend', handleDragEnd);
    });
}

let draggedTaskId = null;
function handleDragStart(e) { draggedTaskId = e.target.closest('.task-card')?.dataset.taskId; e.dataTransfer.effectAllowed = 'move'; }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function handleDrop(e) {
    e.preventDefault();
    const targetCard = e.target.closest('.task-card');
    if (!targetCard || !draggedTaskId) return;
    const targetTaskId = targetCard.dataset.taskId;
    if (draggedTaskId === targetTaskId) return;
    const sourceTask = state.flatTasks.find(t => t.id == draggedTaskId);
    const targetTask = state.flatTasks.find(t => t.id == targetTaskId);
    if (!sourceTask || !targetTask || sourceTask.parent_id !== targetTask.parent_id) return;
    const siblings = state.flatTasks.filter(t => t.parent_id === sourceTask.parent_id && !t.archived && !t.deleted);
    siblings.forEach((t, idx) => { if (t.sort_order === null || t.sort_order === undefined) t.sort_order = idx; });
    const orderedIds = siblings.map(t => t.id);
    const sourceIndex = orderedIds.indexOf(sourceTask.id);
    const targetIndex = orderedIds.indexOf(targetTask.id);
    if (sourceIndex === -1 || targetIndex === -1) return;
    orderedIds.splice(sourceIndex, 1);
    orderedIds.splice(targetIndex, 0, sourceTask.id);
    state.reorderQueue.push(orderedIds);
    processReorderQueue();
}

async function processReorderQueue() {
    if (state.reorderInProgress) return;
    state.reorderInProgress = true;
    while (state.reorderQueue.length > 0) {
        const taskIds = state.reorderQueue.shift();
        const result = await apiPost('/tasks/reorder', { task_ids: taskIds });
        if (!result) { showToast('排序更新失败，请刷新'); state.reorderQueue = []; await loadTasks(); break; }
    }
    state.reorderInProgress = false;
}

function handleDragEnd() { draggedTaskId = null; }

function seededRandom(seed) { return function() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }

function renderGraph() {
    const svg = DOM.graphSvg;
    svg.innerHTML = '';
    if (state.flatTasks.length === 0) { DOM.graphEmpty.style.display = 'block'; return; }
    DOM.graphEmpty.style.display = 'none';
    const nodes = state.flatTasks.filter(t => !t.archived && !t.deleted);
    const view = state.graphViewBox;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'graphNoise');
    filter.innerHTML = `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0"/><feComposite operator="over" in2="SourceGraphic"/>`;
    defs.appendChild(filter);
    const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    glowFilter.setAttribute('id', 'graphGlow');
    glowFilter.innerHTML = `<feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/>`;
    defs.appendChild(glowFilter);
    svg.appendChild(defs);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const levelMap = {};
    nodes.forEach(n => { const lvl = n.level || 0; if (!levelMap[lvl]) levelMap[lvl] = []; levelMap[lvl].push(n); });
    const levels = Object.keys(levelMap).sort((a,b)=>a-b);
    levels.forEach(lvl => levelMap[lvl].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
    const baseWidth = state.graphBaseWidth, baseHeight = state.graphBaseHeight;
    nodes.forEach(n => {
        if (n.parent_id) {
            const parent = nodes.find(p => p.id === n.parent_id);
            if (parent) {
                const parentPos = state.graphNodePositions[parent.id] || getDefaultNodePosition(parent, levelMap);
                const childPos = state.graphNodePositions[n.id] || getDefaultNodePosition(n, levelMap);
                const pathId = `edge-${parent.id}-${n.id}`;
                const px = parentPos.x + 75, py = parentPos.y;
                const cxp = childPos.x - 75, cyp = childPos.y;
                const d = `M ${px} ${py} C ${px+45} ${py}, ${cxp-45} ${cyp}, ${cxp} ${cyp}`;
                const edgeLayers = [
                    { width: 4, opacity: 0.10, dash: '1 9', dur: '3.2s' },
                    { width: 2, opacity: 0.28, dash: '3 7', dur: '2.4s' },
                    { width: 1, opacity: 0.60, dash: '9 5', dur: '1.6s' }
                ];
                let basePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                edgeLayers.forEach((cfg, idx) => {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', d);
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke', idx === 0 ? 'rgba(0,194,255,0.55)' : 'rgba(0,194,255,0.85)');
                    path.setAttribute('stroke-width', cfg.width);
                    path.setAttribute('stroke-opacity', cfg.opacity);
                    path.setAttribute('stroke-dasharray', cfg.dash);
                    path.classList.add('graph-edge');
                    if (idx === 0) {
                        path.setAttribute('id', pathId);
                        path.classList.add('graph-edge-base');
                        basePath = path;
                    } else {
                        path.classList.add('graph-edge-stream');
                    }
                    g.appendChild(path);
                });
                const particle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                particle.setAttribute('r','3'); particle.setAttribute('fill','#fff'); particle.setAttribute('opacity','0.8');
                const animateMotion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
                animateMotion.setAttribute('dur','2s'); animateMotion.setAttribute('repeatCount','indefinite');
                const mpath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
                mpath.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',`#${pathId}`);
                animateMotion.appendChild(mpath); particle.appendChild(animateMotion); g.appendChild(particle);
                basePath.addEventListener('mouseenter', ()=>basePath.classList.add('highlight'));
                basePath.addEventListener('mouseleave', ()=>basePath.classList.remove('highlight'));
            }
        }
    });
    nodes.forEach(n => {
        const pos = state.graphNodePositions[n.id] || getDefaultNodePosition(n, levelMap);
        const cx = pos.x, cy = pos.y;
        const W = 170, H = 60, rx = 10;
        // 状态色（复用任务卡片同款色条）
        const statusColors = {
            todo:     { fill: 'rgba(28,32,44,0.94)',  stroke: 'rgba(255,255,255,0.14)', bar: 'rgba(255,255,255,0.10)' },
            in_progress: { fill: 'rgba(16,40,58,0.94)',   stroke: '#3A80D0',          bar: 'rgba(58,128,208,0.65)' },
            paused:   { fill: 'rgba(50,45,28,0.94)',   stroke: '#D4A520',          bar: 'rgba(212,165,32,0.55)' },
            done:     { fill: 'rgba(22,44,34,0.93)',   stroke: '#5FB37A',           bar: 'rgba(95,179,122,0.5)' },
            cancelled:{ fill: 'rgba(30,30,34,0.92)',   stroke: '#6A6A74',           bar: 'rgba(106,106,116,0.35)' },
            blocked:  { fill: 'rgba(46,28,28,0.95)',   stroke: '#D43028',           bar: 'rgba(212,48,40,0.5)' }
        };
        const sc = isBlocked(n) ? statusColors.blocked : (statusColors[n.status] || statusColors.todo);
        // 节点主体
        const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
        rect.setAttribute('x', cx - W/2); rect.setAttribute('y', cy - H/2);
        rect.setAttribute('width', W); rect.setAttribute('height', H); rect.setAttribute('rx', rx);
        rect.setAttribute('fill', sc.fill);
        rect.setAttribute('stroke', sc.stroke); rect.setAttribute('stroke-width','1.5');
        rect.setAttribute('filter','url(#graphGlow)');
        rect.classList.add('graph-node', `status-${n.status}`);
        rect.dataset.priority = n.priority;
        rect.dataset.taskId = n.id;  // 拖拽时用于DOM查找
        rect.style.cursor = 'grab';
        rect.addEventListener('click', () => openTaskDetail(n.id));
        rect.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); startNodeDrag(n.id, e); });
        g.appendChild(rect);
        // 左侧状态色条（同任务卡片 border-left 风格）
        const bar = document.createElementNS('http://www.w3.org/2000/svg','rect');
        bar.setAttribute('x', cx - W/2); bar.setAttribute('y', cy - H/2);
        bar.setAttribute('width', 4); bar.setAttribute('height', H); bar.setAttribute('rx', 1);
        bar.setAttribute('fill', sc.bar); bar.setAttribute('opacity','1');
        bar.dataset.taskId = n.id;
        g.appendChild(bar);
        // 标题——从色条右侧开始，不再从卡片中间开始
        const text = document.createElementNS('http://www.w3.org/2000/svg','text');
        text.setAttribute('x', cx - W/2 + 14); text.setAttribute('y', cy - 3);
        text.setAttribute('text-anchor','start');
        text.setAttribute('fill','#eeece8'); text.setAttribute('font-size','12.5'); text.setAttribute('font-weight','600');
        text.classList.add('graph-label');
        text.dataset.taskId = n.id;
        text.textContent = (n.title || '').substring(0, 16);
        g.appendChild(text);
        // 状态小字
        const sub = document.createElementNS('http://www.w3.org/2000/svg','text');
        sub.setAttribute('x', cx - W/2 + 14); sub.setAttribute('y', cy + 15);
        sub.setAttribute('text-anchor','start');
        sub.setAttribute('fill','rgba(190,200,215,0.65)'); sub.setAttribute('font-size','10');
        sub.dataset.taskId = n.id;
        sub.textContent = ({ todo:'待办', in_progress:'进行中', paused:'已暂停', done:'已完成', cancelled:'已取消' })[n.status] || n.status || '';
        g.appendChild(sub);
        // 星级小标识（右侧）
        if (n.priority > 0) {
            const starText = document.createElementNS('http://www.w3.org/2000/svg','text');
            starText.setAttribute('x', cx + W/2 - 10); starText.setAttribute('y', cy + 5);
            starText.setAttribute('text-anchor','end');
            starText.setAttribute('fill','rgba(232,184,24,0.55)'); starText.setAttribute('font-size','10');
            starText.dataset.taskId = n.id;
            starText.textContent = '★'.repeat(Math.min(n.priority, 6));
            g.appendChild(starText);
        }
        // 透明命中层（覆盖整块，便于拖拽/点击）
        const hit = document.createElementNS('http://www.w3.org/2000/svg','rect');
        hit.setAttribute('x', cx - W/2); hit.setAttribute('y', cy - H/2);
        hit.setAttribute('width', W); hit.setAttribute('height', H); hit.setAttribute('rx', rx);
        hit.setAttribute('fill', '#000'); hit.setAttribute('fill-opacity', '0'); hit.setAttribute('stroke', 'none');
        hit.style.pointerEvents = 'all'; hit.style.cursor = 'grab';
        hit.dataset.taskId = n.id;
        hit.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); startNodeDrag(n.id, e); });
        hit.addEventListener('click', (e) => { e.stopPropagation(); openTaskDetail(n.id); });
        g.appendChild(hit);
    });
    svg.appendChild(g);
    // 自动适配 viewBox：仅当用户未手动拖拽/缩放时执行，避免覆盖用户操作
    if (!state.graphUserPanned) {
        let _minX = Infinity, _minY = Infinity, _maxX = -Infinity, _maxY = -Infinity;
        nodes.forEach(n => {
            const p = state.graphNodePositions[n.id] || getDefaultNodePosition(n, levelMap);
            _minX = Math.min(_minX, p.x);
            _minY = Math.min(_minY, p.y);
            _maxX = Math.max(_maxX, p.x);
            _maxY = Math.max(_maxY, p.y);
        });
        if (!isFinite(_minX)) { _minX = 0; _minY = 0; _maxX = 640; _maxY = 440; }
        const _pad = 100;
        const _vx = Math.max(0, _minX - _pad);
        const _vy = Math.max(0, _minY - _pad);
        const _vw = Math.max(_maxX - _minX + _pad * 2, 640);
        const _vh = Math.max(_maxY - _minY + _pad * 2, 440);
        state.graphViewBox = { x: _vx, y: _vy, width: _vw, height: _vh };
        state.graphScale = 1;
    }
    // 始终用当前 viewBox 渲染（不管是 auto-fit 还是用户手动设定的）
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
}

function getDefaultNodePosition(n, levelMap) {
    const lvl = n.level||0;
    const arr = levelMap[lvl] || [n];
    const index = Math.max(0, arr.indexOf(n));
    return { x: 140 + lvl * 250, y: 75 + index * 92 };
}

let dragNodeId = null;
let dragOffsetX = 0, dragOffsetY = 0;
function getLevelMap() {
    const map = {};
    state.flatTasks.filter(t=>!t.archived&&!t.deleted).forEach(n => {
        const lvl = n.level||0;
        if (!map[lvl]) map[lvl] = [];
        map[lvl].push(n);
    });
    Object.values(map).forEach(arr => arr.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
    return map;
}
function startNodeDrag(id, e) {
    dragNodeId = id;
    const svgRect = DOM.graphSvg.getBoundingClientRect();
    const viewBox = state.graphViewBox;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    const mouseX = (e.clientX - svgRect.left) * scaleX + viewBox.x;
    const mouseY = (e.clientY - svgRect.top) * scaleY + viewBox.y;
    const nodePos = state.graphNodePositions[id] || getDefaultNodePosition(state.flatTasks.find(t=>t.id===id), getLevelMap());
    dragOffsetX = mouseX - nodePos.x;
    dragOffsetY = mouseY - nodePos.y;
    document.addEventListener('mousemove', onNodeDrag);
    document.addEventListener('mouseup', endNodeDrag);
}
function onNodeDrag(e) {
    if (!dragNodeId) return;
    const svgRect = DOM.graphSvg.getBoundingClientRect();
    const viewBox = state.graphViewBox;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    const mouseX = (e.clientX - svgRect.left) * scaleX + viewBox.x;
    const mouseY = (e.clientY - svgRect.top) * scaleY + viewBox.y;
    const newX = mouseX - dragOffsetX;
    const newY = mouseY - dragOffsetY;
    state.graphNodePositions[dragNodeId] = { x: newX, y: newY };
    // 直接移动DOM元素（通过 data-task-id 查找），不调用renderGraph避免重算viewBox
    const W = 170, H = 60;
    const g = DOM.graphSvg.querySelector('g');
    if (g) {
        g.querySelectorAll(`[data-task-id="${dragNodeId}"]`).forEach(el => {
            if (el.tagName === 'rect') {
                el.setAttribute('x', newX - W/2);
                el.setAttribute('y', newY - H/2);
            } else if (el.tagName === 'text') {
                const isLabel = el.classList.contains('graph-label');
                const isStar = el.textContent && el.textContent.startsWith('★') && !isLabel;
                el.setAttribute('x', isStar ? newX + W/2 - 10 : newX - W/2 + 14);
                el.setAttribute('y', isLabel ? newY - 3 : (isStar ? newY + 5 : newY + 15));
            }
        });
    }
}
function endNodeDrag() {
    if (dragNodeId) {
        // 拖拽结束后标记用户操作，并刷新连线（边的起点/终点坐标需要更新）
        state.graphUserPanned = true;
        renderGraph();  // 只在结束时重绘一次，更新边的位置
    }
    dragNodeId = null;
    document.removeEventListener('mousemove', onNodeDrag);
}
function startGraphDrag(e) {
    // 排除节点上的操作（让节点拖拽优先）
    if(e.target.closest('.graph-node')||e.target.closest('.graph-hit')||e.target.closest('text')||e.target.closest('rect')) return;
    state.isDraggingGraph=true;
    state.graphDragStart={x:e.clientX,y:e.clientY};
    e.preventDefault();
}
function moveGraphDrag(e) {
    if(!state.isDraggingGraph) return;
    const dx=e.clientX-state.graphDragStart.x, dy=e.clientY-state.graphDragStart.y;
    const view = state.graphViewBox;
    const scaleFactor = view.width / DOM.graphSvg.clientWidth;
    view.x -= dx * scaleFactor;
    view.y -= dy * scaleFactor;
    state.graphDragStart={x:e.clientX,y:e.clientY};
    state.graphUserPanned = true;  // 标记用户手动操作
    DOM.graphSvg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
}
function endGraphDrag(){ state.isDraggingGraph=false; }

function renderCalendar() {
    const container = DOM.calendarContainer;
    const now = state.calendarMonth;
    const year = now.getFullYear(), month = now.getMonth();
    DOM.calendarTitle.textContent = `${year}年${month+1}月`;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const tasksByDate = {};
    state.flatTasks.filter(t=>!t.archived&&!t.deleted).forEach(t=>{
        if(t.due_date){ const d=t.due_date.substring(0,10); if(!tasksByDate[d]) tasksByDate[d]=[]; tasksByDate[d].push(t); }
    });
    let html = '<div class="calendar-grid">';
    ['日','一','二','三','四','五','六'].forEach(d=> html += `<div class="calendar-day-header">${d}</div>`);
    for(let i=0;i<firstDay;i++) html += '<div class="calendar-day other-month"></div>';
    const todayStr = new Date().toLocaleDateString('sv-SE');
    for(let day=1; day<=daysInMonth; day++){
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const tasks = tasksByDate[dateStr] || [];
        html += `<div class="calendar-day ${dateStr===todayStr?'today':''} ${tasks.length?'has-tasks':''}" data-date="${dateStr}">`;
        html += `<div class="calendar-day-number">${day}</div>`;
        tasks.forEach(t=>{
            const priorityColor = getPriorityColor(t.priority);
            const statusIcon = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '▶' : t.status === 'paused' ? '⏸' : '';
            const priorityStars = '★'.repeat(t.priority);
            const title = escapeHtml(t.title);
            if(t.task_line==='main') {
                html += `<div class="calendar-task-indicator" title="${title} (优先级${t.priority})">
                    <span class="calendar-task-icon"><i class="fa-solid fa-diamond"></i></span>
                    <span class="calendar-task-status">${statusIcon}</span>
                    <span class="calendar-task-bar" style="background:${priorityColor}"></span>
                    <span class="calendar-task-stars">${priorityStars}</span>
                    <span class="calendar-task-title">${title}</span>
                </div>`;
            } else {
                html += `<div class="calendar-task-indicator" title="${title} (优先级${t.priority})">
                    <span class="calendar-task-status">${statusIcon}</span>
                    <span class="calendar-task-bar" style="background:${priorityColor}"></span>
                    <span class="calendar-task-stars">${priorityStars}</span>
                    <span class="calendar-task-title">${title}</span>
                </div>`;
            }
        });
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.calendar-day').forEach(el=>{
        el.addEventListener('click', ()=>{ const date=el.dataset.date; showTasksForDate(date); });
    });
}

function getPriorityColor(priority){ const colors={1:'#999',2:'#7a9a5a',3:'#4a90d0',4:'#a080c8',5:'#e8b818',6:'#d43028'}; return colors[priority]||'#999'; }

function showTasksForDate(dateStr){
    const tasks = state.flatTasks.filter(t=>!t.archived&&!t.deleted&&t.due_date&&t.due_date.startsWith(dateStr));
    if(tasks.length===0){ showToast('当天无任务'); return; }
    DOM.dateTasksTitle.textContent = `${dateStr} 任务`;
    DOM.dateTasksBody.innerHTML = '';
    tasks.forEach(task=>{
        const item = document.createElement('div'); item.className='tracking-subtask-item'; item.textContent=task.title;
        item.addEventListener('click', ()=>{ closeAllModals(); openTaskDetail(task.id); });
        DOM.dateTasksBody.appendChild(item);
    });
    openModal('dateTasksModal');
}

function renderAchievements(){ if(!state.achievements.length) return; const grid=DOM.achievementsGrid; grid.innerHTML='';
    state.achievements.forEach(ach=>{ const unlocked=state.unlockedAchievements.some(u=>u.achievement_id===ach.id);
        const card=document.createElement('div'); card.className=`achievement-card ${unlocked?'':'locked'}`;
        const icon=document.createElement('div'); icon.className='badge-icon'; icon.innerHTML='<i class="fa-solid fa-award"></i>';
        const name=document.createElement('div'); name.className='achievement-name'; name.textContent=ach.name;
        const desc=document.createElement('div'); desc.className='achievement-desc'; desc.textContent=ach.description;
        card.appendChild(icon); card.appendChild(name); card.appendChild(desc); grid.appendChild(card);
    });
}

function renderProfileBadges(){ const grid=DOM.profileBadgesGrid; grid.innerHTML='';
    state.unlockedAchievements.forEach(u=>{ const ach=state.achievements.find(a=>a.id===u.achievement_id); if(ach){
        const div=document.createElement('div'); div.className='badge-icon'; div.innerHTML='<i class="fa-solid fa-award"></i>'; div.title=ach.name; grid.appendChild(div);
    }});
}

function renderGiftPacks(){ const grid=DOM.giftPacksGrid; grid.innerHTML='';
    state.giftPacks.forEach(pack=>{ if(pack.purchased) return;
        const card=document.createElement('div'); card.className='gift-pack-card';
        card.innerHTML=`<div class="gift-pack-name">${escapeHtml(pack.name)}</div><div class="gift-pack-desc">${escapeHtml(pack.description)}</div><div class="gift-pack-cost">${pack.cost_source_stone} 源石</div>`;
        card.addEventListener('click',()=>purchaseGiftPack(pack.id)); grid.appendChild(card);
    });
}

function renderTransactions(){ const list=DOM.transactionsList; if(!list) return; list.innerHTML='';
    const recent=state.transactions.slice(0,50);
    recent.forEach(tx=>{ const div=document.createElement('div'); div.className='transaction-item';
        const reason=document.createElement('span'); reason.textContent=tx.reason;
        const date=document.createElement('span'); date.textContent=formatDate(tx.created_at);
        const amount=document.createElement('span'); amount.textContent=`${tx.amount>0?'+':''}${tx.amount} ${tx.resource_type}`;
        div.appendChild(reason); div.appendChild(date); div.appendChild(amount); list.appendChild(div);
    });
}

function updateResourceTimestamp(){
    const el = DOM.resourceTimestamp;
    if(!el) return;
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    el.textContent = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function updateResourceDisplay(){
    const res=state.resources;
    if(res.lungmen?.current_value!==undefined){ DOM.resLungmen.textContent=res.lungmen.current_value; }
    if(res.orundum?.current_value!==undefined){ DOM.resOrundum.textContent=res.orundum.current_value; }
    if(res.source_stone?.current_value!==undefined){ DOM.resStone.textContent=res.source_stone.current_value; }
    if(res.sanity?.current_value!==undefined){ DOM.resSanityCurrent.textContent=res.sanity.current_value; DOM.resSanityMax.textContent=res.sanity.max_value||120; }
    if(DOM.profileExp) DOM.profileExp.textContent = res.exp?.current_value || 0;
    if(DOM.profileStone) DOM.profileStone.textContent = res.source_stone?.current_value || 0;
    if(DOM.profileLungmen) DOM.profileLungmen.textContent = res.lungmen?.current_value || 0;
    if(DOM.profileOrundum) DOM.profileOrundum.textContent = res.orundum?.current_value || 0;
    if(DOM.profileSanity) DOM.profileSanity.textContent = `${res.sanity?.current_value||0}/${res.sanity?.max_value||120}`;
    if(DOM.profileLevel) DOM.profileLevel.textContent = calculateLevel(res.exp?.current_value||0);
    if(DOM.profileExpFill) DOM.profileExpFill.style.width = `${(res.exp?.current_value % 100)}%`;
    if(DOM.profileExpText) DOM.profileExpText.textContent = `${res.exp?.current_value} / 100 EXP`;
}

function updateUserInfo() {
    const exp = state.resources.exp?.current_value || 0;
    const level = calculateLevel(exp);
    const expInLevel = exp % 100;
    DOM.userName.textContent = state.settings.username || '博士';
    DOM.userLevel.textContent = `Lv.${level}`;
    DOM.userExpFill.style.width = `${expInLevel}%`;
}

function calculateLevel(exp){ return Math.floor(exp/100)+1; }

function switchView(view) {
    if (rewardModalTimer) {
        clearTimeout(rewardModalTimer);
        rewardModalTimer = null;
    }
    state.currentView = view;
    document.body.dataset.view = view;

    DOM.navTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));

    DOM.views.forEach(v => {
        v.classList.remove('active');
        v.style.display = '';
        v.style.opacity = '';
        v.style.transform = '';
        v.style.animation = '';
    });

    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'block';
    }

    if (view === 'graph') renderGraph();
    if (view === 'calendar') renderCalendar();
    if (view === 'achievements') renderAchievements();
    if (view === 'rewards') renderRealityRewards();
    if (view === 'profile') {
        updateResourceDisplay();
        renderProfileBadges();
        renderGiftPacks();
        renderTransactions();
    }
    if (view === 'tasks') renderTasks();

    if (window.innerWidth <= 768 && DOM.navCenter) {
        DOM.navCenter.classList.remove('mobile-show');
    }
}

function openTaskModal(task=null){
    DOM.taskForm.reset(); DOM.taskFormId.value=''; DOM.taskFormTitle.value=''; DOM.taskFormDesc.value='';
    setStarRating(1); DOM.taskFormTaskLine.value='side'; DOM.taskFormStatus.value='todo'; DOM.taskFormParent.value='';
    DOM.taskFormTarget.value=''; DOM.taskFormCurrent.value='0'; DOM.taskFormPlannedStart.value=''; DOM.taskFormPlannedEnd.value='';
    DOM.taskFormDueDate.value=''; DOM.taskFormPrerequisite.value=''; DOM.taskFormRepeatType.value=''; DOM.taskFormRepeatInterval.value='1';
    DOM.taskFormRewardExp.value='0'; DOM.taskFormRewardLungmen.value='0'; DOM.taskFormRewardStone.value='0'; DOM.taskFormRewardOrundum.value='0';
    DOM.taskFormNotes.value=''; DOM.repeatIntervalGroup.style.display='none'; state.selectedTags=[]; renderTagList();
    fillParentOptions(); fillPrerequisiteOptions();
    if(task){
        DOM.taskModalTitle.textContent='编辑任务'; DOM.taskFormId.value=task.id; DOM.taskFormTitle.value=task.title||'';
        DOM.taskFormDesc.value=task.description||''; setStarRating(task.priority||1); DOM.taskFormTaskLine.value=task.task_line||'side';
        DOM.taskFormStatus.value=task.status||'todo'; DOM.taskFormParent.value=task.parent_id||''; DOM.taskFormTarget.value=task.target_value||'';
        DOM.taskFormCurrent.value=task.current_value||'0'; DOM.taskFormPlannedStart.value=task.planned_start?task.planned_start.substring(0,16):'';
        DOM.taskFormPlannedEnd.value=task.planned_end?task.planned_end.substring(0,16):''; DOM.taskFormDueDate.value=task.due_date?task.due_date.substring(0,16):'';
        DOM.taskFormPrerequisite.value=task.prerequisite_id||''; DOM.taskFormRepeatType.value=task.repeat_type||''; DOM.taskFormRepeatInterval.value=task.repeat_interval||'1';
        DOM.taskFormRewardExp.value=task.reward_exp||'0'; DOM.taskFormRewardLungmen.value=task.reward_lungmen||'0';
        DOM.taskFormRewardStone.value=task.reward_source_stone||'0'; DOM.taskFormRewardOrundum.value=task.reward_orundum||'0';
        DOM.taskFormNotes.value=task.notes||''; if(task.repeat_type==='custom') DOM.repeatIntervalGroup.style.display='flex';
        state.selectedTags=(task.tags||[]).map(t=>t.name); renderTagList();
        restrictStatusOptions(task.status); DOM.taskFormStatus.disabled=false;
        updateAutoRewardPreview();
    } else {
        DOM.taskModalTitle.textContent='新建任务'; DOM.taskFormStatus.value='todo'; DOM.taskFormStatus.disabled=true;
        updateAutoRewardPreview();
    }
    openModal('taskModal');
}

function restrictStatusOptions(currentStatus){
    const select=DOM.taskFormStatus;
    const allowedTransitions={ 'todo':['todo','in_progress','paused','cancelled'], 'in_progress':['in_progress','paused','done','cancelled'], 'paused':['paused','in_progress','todo','cancelled','done'], 'done':['done'], 'cancelled':['cancelled'] };
    const allowed=allowedTransitions[currentStatus]||['todo'];
    Array.from(select.options).forEach(opt=> opt.disabled=!allowed.includes(opt.value));
}

function updateAutoRewardPreview(){
    const priority=parseInt(DOM.taskFormPriority.value); const taskLine=DOM.taskFormTaskLine.value;
    let exp=priority*20; let lungmen=priority*100;
    if(taskLine==='main') exp=Math.round(exp*1.3); else lungmen=Math.round(lungmen*1.2);
    const currentId=DOM.taskFormId.value?parseInt(DOM.taskFormId.value):null;
    if(currentId){
        const childCount=state.flatTasks.filter(t => t.parent_id === currentId && !t.deleted && !t.archived).length;
        if(childCount>0) exp+=childCount*5;
    }
    DOM.taskFormRewardExp.value=exp; DOM.taskFormRewardLungmen.value=lungmen;
}

function setStarRating(val){
    DOM.taskFormPriority.value=val;
    document.querySelectorAll('.star-select').forEach(star=>star.classList.toggle('active',parseInt(star.dataset.value)<=val));
    updateAutoRewardPreview();
}

function addTagToForm(tag){ if(!state.selectedTags.includes(tag)){ state.selectedTags.push(tag); renderTagList(); } }
function removeTagFromForm(tag){ state.selectedTags=state.selectedTags.filter(t=>t!==tag); renderTagList(); }
function renderTagList(){
    DOM.tagList.innerHTML='';
    state.selectedTags.forEach(tag=>{ const span=document.createElement('span'); span.className='tag-item'; span.textContent=tag;
        const remove=document.createElement('i'); remove.className='fa-solid fa-xmark'; remove.addEventListener('click',()=>removeTagFromForm(tag));
        span.appendChild(remove); DOM.tagList.appendChild(span);
    });
}

function fillParentOptions(){
    const select=DOM.taskFormParent; select.innerHTML='<option value="">无（顶级任务）</option>';
    const currentId=Number(DOM.taskFormId.value); const excludeIds=new Set();
    if(currentId){ excludeIds.add(currentId); function collectDescendants(id){ state.flatTasks.forEach(t=>{ if(t.parent_id===id){ excludeIds.add(t.id); collectDescendants(t.id); } }); } collectDescendants(currentId); }
    state.flatTasks.forEach(t=>{ if(!excludeIds.has(t.id)&&t.status!=='cancelled'&&!t.deleted&&!t.archived) select.innerHTML+=`<option value="${t.id}">${escapeHtml(t.title)}</option>`; });
}

function fillPrerequisiteOptions(){
    const select=DOM.taskFormPrerequisite; select.innerHTML='<option value="">无</option>';
    const currentId=Number(DOM.taskFormId.value); const excludeIds=new Set();
    if(currentId){ excludeIds.add(currentId); function collectDescendants(id){ state.flatTasks.forEach(t=>{ if(t.parent_id===id){ excludeIds.add(t.id); collectDescendants(t.id); } }); } collectDescendants(currentId); }
    state.flatTasks.forEach(t=>{ if(!excludeIds.has(t.id)&&!t.deleted&&!t.archived) select.innerHTML+=`<option value="${t.id}">${escapeHtml(t.title)}</option>`; });
}

async function handleTaskFormSubmit(e){
    e.preventDefault();
    const title=DOM.taskFormTitle.value.trim(); if(!title) return;
    if(DOM.taskFormStatus.value==='done'){
        const prerequisiteId=DOM.taskFormPrerequisite.value; const parentId=DOM.taskFormParent.value;
        if(prerequisiteId){ const pre=state.flatTasks.find(t=>t.id===parseInt(prerequisiteId)); if(pre&&pre.status!=='done'){ showToast('前置任务未完成，不能设为已完成状态'); return; } }
        // 父子为聚合关系，子任务可独立完成，不再因父未完成而拦截
    }
    const priority=parseInt(DOM.taskFormPriority.value); const taskLine=DOM.taskFormTaskLine.value;
    const currentId=DOM.taskFormId.value?parseInt(DOM.taskFormId.value):null;
    const hasTarget=!!DOM.taskFormTarget.value;
    const data={
        title, description:DOM.taskFormDesc.value.trim(), priority, task_line:taskLine, status:DOM.taskFormStatus.value,
        parent_id:DOM.taskFormParent.value?parseInt(DOM.taskFormParent.value):null,
        target_value:hasTarget?parseFloat(DOM.taskFormTarget.value):null,
        current_value:DOM.taskFormCurrent.value?parseFloat(DOM.taskFormCurrent.value):0,
        planned_start:DOM.taskFormPlannedStart.value?new Date(DOM.taskFormPlannedStart.value).toISOString():null,
        planned_end:DOM.taskFormPlannedEnd.value?new Date(DOM.taskFormPlannedEnd.value).toISOString():null,
        due_date:DOM.taskFormDueDate.value?new Date(DOM.taskFormDueDate.value).toISOString():null,
        prerequisite_id:DOM.taskFormPrerequisite.value?parseInt(DOM.taskFormPrerequisite.value):null,
        repeat_type:DOM.taskFormRepeatType.value||null,
        repeat_interval:DOM.taskFormRepeatType.value==='custom'?parseInt(DOM.taskFormRepeatInterval.value):null,
        reward_exp:parseFloat(DOM.taskFormRewardExp.value)||0,
        reward_lungmen:parseFloat(DOM.taskFormRewardLungmen.value)||0,
        reward_source_stone:parseFloat(DOM.taskFormRewardStone.value)||0,
        reward_orundum:parseFloat(DOM.taskFormRewardOrundum.value)||0,
        notes:DOM.taskFormNotes.value.trim(), tags:state.selectedTags,
    };
    const id=DOM.taskFormId.value;
    const result = id ? await apiPut(`/tasks/${id}`,data) : await apiPost('/tasks',data);
    if (result) {
        closeAllModals();
        await loadTasks();
        renderTasks();
    } else {
        showToast('保存失败，请重试');
    }
}

async function handleDeleteTask(id){ await apiDelete(`/tasks/${id}`); await loadTasks(); }
async function handleArchive(id){ await apiPost(`/tasks/${id}/archive`); await loadTasks(); }
async function handleUnarchive(id){ await apiPost(`/tasks/${id}/unarchive`); await loadTasks(); }
async function handleRestoreTask(id){ await apiPost(`/tasks/${id}/restore`); await loadTasks(); }

async function completeTaskAndHandleReward(taskId) {
    const task = state.flatTasks.find(t => t.id === taskId);
    if (!task) return;
    const blockReason = getBlockReason(task);
    if (blockReason) { showToast(`依赖未满足：${blockReason}`); return; }
    // 父子为聚合关系：子任务可独立完成；父任务完成时由后端级联完成其未完成子任务，不再互相拦截

    const result = await apiPost(`/tasks/${taskId}/complete`);
    if (!result) {
        showToast('完成任务失败，请重试');
        await loadTasks();
        return;
    }

    if (state.trackingTaskId === taskId) {
        const stopResult = await apiPost(`/tasks/${taskId}/track/stop`);
        if (stopResult) {
            state.trackingTaskId = null;
            state.trackingStartTime = null;
            if (DOM.trackingPanel.classList.contains('expanded')) collapseTrackingPanel();
            if (document.body.classList.contains('focus-mode')) await stopPomodoro();
        } else {
            showToast('追踪停止失败，请手动停止');
        }
    }

    await loadTasks();
    await loadResources();
    await loadRealityRewards();

    const updatedTask = state.flatTasks.find(t => t.id === taskId);
    if (updatedTask && updatedTask.status === 'done') {
        const hasReward = hasActualReward(updatedTask);
        if (hasReward) {
            if (rewardModalTimer) clearTimeout(rewardModalTimer);
            rewardModalTimer = setTimeout(() => {
                if (state.currentView === 'tasks' || document.getElementById('taskDetailModal').classList.contains('show')) {
                    if (!document.querySelector('.modal-container.show')) {
                        openRewardModal(taskId);
                    }
                } else {
                    showToast('任务完成，奖励可稍后在任务列表领取');
                }
                rewardModalTimer = null;
            }, 200);
        } else {
            showToast('任务已完成');
        }
        notifyRepeatIfNeeded(updatedTask);
    }
    updateTrackingPanel();
    renderTasks();
}

function markRepeatNotified(taskId) {
    if (!state.repeatNotifyShown[taskId]) {
        state.repeatNotifyShown[taskId] = true;
        const keys = Object.keys(state.repeatNotifyShown);
        if (keys.length > 100) {
            keys.slice(0, keys.length - 100).forEach(k => delete state.repeatNotifyShown[k]);
        }
        localStorage.setItem('repeatNotifyShown', JSON.stringify(state.repeatNotifyShown));
        return true;
    }
    return false;
}

function notifyRepeatIfNeeded(task) {
    if (task.repeat_type && markRepeatNotified(task.id)) {
        showToast('已生成下一周期副本');
    }
}

function updateParentProgress(task) {
    if (!task.parent_id) return;
    const parent = state.flatTasks.find(t => t.id === task.parent_id);
    if (!parent || parent.progress_mode !== 'auto') return;
    const children = state.flatTasks.filter(t => t.parent_id === parent.id && !t.deleted && !t.archived && t.status !== 'cancelled');
    if (children.length === 0) return;
    const avg = children.reduce((sum, c) => {
        let p = c.progress_mode === 'count' && c.target_value ? (c.current_value / c.target_value) * 100 : (c.progress || 0);
        return sum + p;
    }, 0) / children.length;
    parent.progress = Math.min(100, avg);
    updateParentProgress(parent);
}

function refreshTaskCard(taskId) {
    const task = state.flatTasks.find(t => t.id === taskId);
    if (!task) return;
    const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!card) return;
    const percent = task.progress_mode === 'count' && task.target_value ? Math.min(100, (task.current_value / task.target_value) * 100) : (task.progress || 0);
    const fill = card.querySelector('.progress-fill');
    if (fill) fill.style.width = `${percent}%`;
    const txt = card.querySelector('.progress-text');
    if (txt) txt.textContent = task.progress_mode === 'count' && task.target_value ? `${task.current_value}/${task.target_value}` : `${Math.round(percent)}%`;
    const input = card.querySelector('.count-input');
    if (input) input.value = task.current_value;
    const thumb = card.querySelector('.progress-thumb');
    if (thumb) thumb.style.left = `${percent}%`;
    card.className = `task-card status-${task.status} ${(task.children && task.children.length) ? 'parent-task' : 'child-task'}${isBlocked(task) ? ' dependency-blocked' : ''}`;
    card.dataset.status = task.status;
    const claim = card.querySelector('.claim-btn');
    if (claim) claim.style.display = (task.status === 'done' && !task.reward_claimed && hasActualReward(task)) ? '' : 'none';
}

async function updateCount(taskId, delta){
    const task=state.flatTasks.find(t=>t.id===taskId); if(!task||task.status==='done') return;
    const newVal=Math.max(0,Math.min(task.target_value,(task.current_value||0)+delta));
    if(newVal>=task.target_value){
        task.current_value = newVal;
        updateParentProgress(task);
        refreshTaskCard(taskId); if(task.parent_id) refreshTaskCard(task.parent_id);
        updateTrackingPanelIfNeeded();
        const result = await apiPost(`/tasks/${taskId}/count`,{ current_value: newVal });
        if(result){
            if(state.trackingTaskId===taskId){
                await apiPost(`/tasks/${taskId}/track/stop`);
                state.trackingTaskId=null;
                state.trackingStartTime=null;
                if(document.body.classList.contains('focus-mode')) await stopPomodoro();
                collapseTrackingPanel();
            }
            await loadTasks();
            await loadResources();
            await loadRealityRewards();
            const updatedTask=state.flatTasks.find(t=>t.id===taskId);
            if(updatedTask && updatedTask.status==='done'){
                if(hasActualReward(updatedTask)){
                    setTimeout(()=>{
                        if(state.currentView==='tasks'||document.getElementById('taskDetailModal').classList.contains('show')){
                            if(!document.querySelector('.modal-container.show')) openRewardModal(taskId);
                        } else {
                            showToast('任务完成，奖励可稍后在任务列表领取');
                        }
                    },200);
                } else {
                    showToast('任务已完成');
                }
                notifyRepeatIfNeeded(updatedTask);
            }
            updateTrackingPanel();
            renderTasks();
        }
    } else {
        task.current_value = newVal;
        updateParentProgress(task);
        refreshTaskCard(taskId); if(task.parent_id) refreshTaskCard(task.parent_id);
        updateTrackingPanelIfNeeded();
        await apiPost(`/tasks/${taskId}/count`,{ current_value: newVal });
    }
}

function startProgressDrag(e, task, bar, fill, thumb){
    e.preventDefault();
    const rect=bar.getBoundingClientRect();
    const onMove=(ev)=>{ const x=ev.clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100)); fill.style.width=`${percent}%`; thumb.style.left=`${percent}%`; };
    const onUp=async (ev)=>{
        document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
        const x=ev.clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100));
        if(percent>=100){
            await completeTaskAndHandleReward(task.id);
        } else {
            task.progress = percent;
            updateParentProgress(task);
            refreshTaskCard(task.id); if(task.parent_id) refreshTaskCard(task.parent_id);
            updateTrackingPanelIfNeeded();
            await apiPost(`/tasks/${task.id}/progress`,{ progress: percent });
        }
    };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
}

function startProgressDragTouch(e, task, bar, fill, thumb){
    e.preventDefault();
    const rect=bar.getBoundingClientRect();
    const onMove=(ev)=>{ const x=ev.touches[0].clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100)); fill.style.width=`${percent}%`; thumb.style.left=`${percent}%`; };
    const onEnd=async (ev)=>{
        document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onEnd);
        const x=ev.changedTouches[0].clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100));
        if(percent>=100){
            await completeTaskAndHandleReward(task.id);
        } else {
            task.progress = percent;
            updateParentProgress(task);
            refreshTaskCard(task.id); if(task.parent_id) refreshTaskCard(task.parent_id);
            updateTrackingPanelIfNeeded();
            await apiPost(`/tasks/${task.id}/progress`,{ progress: percent });
        }
    };
    document.addEventListener('touchmove',onMove); document.addEventListener('touchend',onEnd);
}

async function toggleTrackingForTask(taskId){
    if(state.trackingTaskId===taskId){
        const result = await apiPost(`/tasks/${taskId}/track/stop`);
        if (result) {
            state.trackingTaskId=null; state.trackingStartTime=null; collapseTrackingPanel();
            if (document.body.classList.contains('focus-mode')) await stopPomodoro();
        }
    } else {
        if(state.trackingTaskId) await apiPost(`/tasks/${state.trackingTaskId}/track/stop`);
        const result = await apiPost(`/tasks/${taskId}/track/start`);
        if (result) {
            state.trackingTaskId=taskId; state.trackingStartTime=new Date(); expandTrackingPanel();
        }
    }
    updateTrackingPanel(); renderTasks();
}

async function toggleTracking(){
    if(state.trackingTaskId){
        const result = await apiPost(`/tasks/${state.trackingTaskId}/track/stop`);
        if (result) {
            state.trackingTaskId=null; state.trackingStartTime=null;
            updateTrackingPanel(); renderTasks(); collapseTrackingPanel();
            if (document.body.classList.contains('focus-mode')) await stopPomodoro();
        }
    }
}

async function completeCurrentTracking(){
    if(state.trackingTaskId){
        const taskId=state.trackingTaskId;
        await completeTaskAndHandleReward(taskId);
    }
}

async function toggleFocusMode(){
    if (document.body.classList.contains('focus-mode')) {
        await stopPomodoro();
        return;
    }
    if (!state.trackingTaskId) {
        showToast('请先追踪一个任务，再进入专注模式');
        return;
    }
    await startPomodoro('focus');
}

function updateTrackingPanel(){
    if(!state.trackingTaskId){
        DOM.trackingEmpty.style.display='flex'; DOM.trackingContent.style.display='none';
        DOM.trackingTimer.textContent='00:00:00'; DOM.trackingRewardBtn.classList.add('hidden');
        return;
    }
    DOM.trackingEmpty.style.display='none'; DOM.trackingContent.classList.remove('hidden'); DOM.trackingContent.style.display='block';
    const task=state.flatTasks.find(t=>t.id===state.trackingTaskId); if(!task) return;
    let chain=[]; let current=task;
    while(current.parent_id){ const parent=state.flatTasks.find(t=>t.id===current.parent_id); if(parent) chain.unshift(parent); current=parent||current; }
    DOM.trackingParentChain.innerHTML='';
    chain.forEach((p,index)=>{ const span=document.createElement('span'); span.textContent=p.title; span.addEventListener('click',()=>openTaskDetail(p.id));
        DOM.trackingParentChain.appendChild(span); if(index<chain.length-1) DOM.trackingParentChain.appendChild(document.createTextNode(' > ')); });
    // 追踪面板星星 - 统一15°倾斜
    DOM.trackingStars.innerHTML='';
    for (let i = 0; i < task.priority; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.style.transform = 'rotate(15deg)';
        star.style.display = 'inline-block';
        star.style.color = 'var(--highlight-gold-1)';
        star.style.textShadow = '0 2px 4px rgba(0,0,0,0.6), 0 0 6px rgba(232,184,24,0.5)';
        DOM.trackingStars.appendChild(star);
    }
    DOM.trackingTaskLine.textContent=task.task_line==='main'?'主线':'支线'; DOM.trackingTaskLine.className=`task-line-badge ${task.task_line}`;
    DOM.trackingTitle.textContent=task.title; DOM.trackingDesc.textContent=task.description||'';
    DOM.trackingTitle.onclick = () => openTaskDetail(task.id);
    DOM.trackingSubtasks.innerHTML=''; const children=state.flatTasks.filter(t=>t.parent_id===task.id);
    children.forEach(child=>{
        const div=document.createElement('div');
        const isDone = child.status === 'done';
        div.className=`tracking-subtask-item${isDone ? ' completed' : ''}`;
        // 左侧状态图标 + 标题
        const icon = document.createElement('span');
        icon.className = 'subtask-status-icon';
        if (isDone) { icon.textContent = '✓'; icon.style.color = 'var(--highlight-green-1)'; }
        else { icon.textContent = '○'; icon.style.color = 'rgba(200,210,225,0.35)'; }
        const title = document.createElement('span');
        title.className = 'subtask-title';
        title.textContent = child.title;
        if (isDone) title.style.textDecoration = 'line-through';
        title.style.opacity = isDone ? '0.5' : '1';
        // 右侧状态标签
        const badge = document.createElement('span');
        badge.className = 'subtask-status-badge';
        const statusMap = { todo:'待办', in_progress:'进行中', paused:'已暂停', done:'✓ 已完成', cancelled:'已取消' };
        badge.textContent = statusMap[child.status] || child.status || '';
        div.appendChild(icon); div.appendChild(title); div.appendChild(badge);
        div.addEventListener('click',()=>openTaskDetail(child.id));
        DOM.trackingSubtasks.appendChild(div);
    });
    let progress=0;
    if(task.progress_mode==='count'&&task.target_value){ progress=Math.min(100,(task.current_value/task.target_value)*100); DOM.trackingProgressFill.className='progress-fill count'; }
    else if(task.progress_mode==='manual'){ progress=task.progress||0; DOM.trackingProgressFill.className='progress-fill manual'; }
    else { if(children.length){ const avg=children.reduce((sum,c)=>sum+(c.progress||0),0)/children.length; progress=avg; } DOM.trackingProgressFill.className='progress-fill'; }
    DOM.trackingProgressFill.style.width=`${progress}%`; DOM.trackingProgressNum.textContent=`${Math.round(progress)}%`;
    if(task.progress_mode==='manual'&&!children.length){
        DOM.trackingProgressThumb.style.display='block'; DOM.trackingProgressThumb.style.left=`${progress}%`;
        DOM.trackingProgressThumb.onmousedown=(e)=>{
            const bar=DOM.trackingProgressBar, fill=DOM.trackingProgressFill, thumb=DOM.trackingProgressThumb;
            const rect=bar.getBoundingClientRect();
            const onMove=(ev)=>{ const x=ev.clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100)); fill.style.width=`${percent}%`; thumb.style.left=`${percent}%`; DOM.trackingProgressNum.textContent=`${Math.round(percent)}%`; };
            const onUp=async (ev)=>{
                document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
                const x=ev.clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100));
                if(percent>=100){
                    await completeTaskAndHandleReward(task.id);
                } else {
                    task.progress=percent; updateParentProgress(task); renderTasks(); updateTrackingPanel();
                    await apiPost(`/tasks/${task.id}/progress`,{ progress: percent });
                }
            };
            document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
        };
        DOM.trackingProgressThumb.ontouchstart = (e) => {
            e.preventDefault();
            const bar=DOM.trackingProgressBar, fill=DOM.trackingProgressFill, thumb=DOM.trackingProgressThumb;
            const rect=bar.getBoundingClientRect();
            const onMove=(ev)=>{ const x=ev.touches[0].clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100)); fill.style.width=`${percent}%`; thumb.style.left=`${percent}%`; DOM.trackingProgressNum.textContent=`${Math.round(percent)}%`; };
            const onEnd=async (ev)=>{
                document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onEnd);
                const x=ev.changedTouches[0].clientX-rect.left; const percent=Math.max(0,Math.min(100,(x/rect.width)*100));
                if(percent>=100){
                    await completeTaskAndHandleReward(task.id);
                } else {
                    task.progress=percent; updateParentProgress(task); renderTasks(); updateTrackingPanel();
                    await apiPost(`/tasks/${task.id}/progress`,{ progress: percent });
                }
            };
            document.addEventListener('touchmove',onMove); document.addEventListener('touchend',onEnd);
        };
    } else { DOM.trackingProgressThumb.style.display='none'; }
    if (rewardModalOpenTaskId === task.id) {
        DOM.trackingRewardBtn.classList.add('hidden');
    } else if(task.status==='done'&&!task.reward_claimed){
        const hasReward=hasActualReward(task);
        if(hasReward) DOM.trackingRewardBtn.classList.remove('hidden'); else DOM.trackingRewardBtn.classList.add('hidden');
    } else {
        DOM.trackingRewardBtn.classList.add('hidden');
    }
}

function expandTrackingPanel(){
    DOM.trackingPanel.classList.add('expanded');
    DOM.mainContent.classList.add('panel-expanded');
    if(window.innerWidth > 768){
        DOM.trackingPanel.style.width=`${state.trackingPanelWidth}px`;
        DOM.mainContent.style.marginLeft=`${state.trackingPanelWidth}px`;
        DOM.trackingExpanded.style.transform = '';
    } else {
        DOM.mainContent.style.marginLeft='0';
        DOM.trackingExpanded.style.transform = 'translateY(0)';
    }
}

function collapseTrackingPanel(){
    DOM.trackingPanel.classList.remove('expanded');
    DOM.mainContent.classList.remove('panel-expanded');
    DOM.trackingPanel.style.width='';
    if(window.innerWidth > 768){
        DOM.mainContent.style.marginLeft='56px';
        DOM.trackingExpanded.style.transform = '';
    } else {
        DOM.mainContent.style.marginLeft='0';
        DOM.trackingExpanded.style.transform = 'translateY(100%)';
    }
}

function initTrackingResize(e){
    if(window.innerWidth <= 768) return;
    e.preventDefault(); const startX=e.clientX, startWidth=state.trackingPanelWidth;
    const onMove=(ev)=>{ const newWidth=Math.max(480,Math.min(640,startWidth+ev.clientX-startX)); state.trackingPanelWidth=newWidth;
        DOM.trackingPanel.style.width=`${newWidth}px`; DOM.mainContent.style.marginLeft=`${newWidth}px`; };
    const onUp=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
}

function updateTrackingTimer(){ if(state.trackingTaskId&&state.trackingStartTime){ const elapsed=Math.floor((Date.now()-state.trackingStartTime.getTime())/1000);
    const h=String(Math.floor(elapsed/3600)).padStart(2,'0'), m=String(Math.floor((elapsed%3600)/60)).padStart(2,'0'), s=String(elapsed%60).padStart(2,'0');
    DOM.trackingTimer.textContent=`${h}:${m}:${s}`; } }

async function openRewardModal(taskId){
    rewardModalOpenTaskId = taskId;
    const task=state.flatTasks.find(t=>t.id===taskId); if(!task) return;
    // 防御性拦截：已领取的任务不再打开弹窗
    if(task.reward_claimed){ showToast('奖励已领取'); rewardModalOpenTaskId=null; return; }
    DOM.rewardDetails.innerHTML='';
    const rewardSVGs = {
        exp: '<svg viewBox="0 0 24 24" width="28" height="28"><rect x="3" y="7" width="18" height="12" rx="2.5" fill="#1a3a5c" stroke="#6AB0E8" stroke-width="1.2"/><text x="12" y="16.2" text-anchor="middle" font-size="8.5" font-weight="800" fill="#6AB0E8" letter-spacing="0.5">EXP</text></svg>',
        lungmen: '<svg viewBox="0 0 24 24" width="28" height="28"><rect x="4" y="10" width="13" height="8" rx="1.2" fill="#154C8A"/><rect x="6" y="6.5" width="13" height="8" rx="1.2" fill="#1E6BC4"/><rect x="8" y="3" width="13" height="8" rx="1.2" fill="#2989D9"/><text x="14.2" y="10" text-anchor="middle" font-size="5.5" font-weight="700" fill="#E8F4FF">龙</text></svg>',
        source_stone: '<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="12,2 20,12 12,21.5 4,12" fill="#FFD700"/><polygon points="12,2 20,12 12,12 4,12" fill="#FFEC8B"/><polygon points="12,12 20,12 12,21.5 4,21.5" fill="#B8860B"/></svg>',
        orundum: '<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="12,2 20,12 12,21.5 4,12" fill="#D42027"/><polygon points="12,2 20,12 12,12 4,12" fill="#FF6B71"/><polygon points="12,12 20,12 12,21.5 4,21.5" fill="#6B0F1A"/></svg>'
    };
    const rewards=[ {name:'经验值',value:task.reward_exp||0,svg:rewardSVGs.exp,color:'#6AB0E8'}, {name:'龙门币',value:task.reward_lungmen||0,svg:rewardSVGs.lungmen,color:'#2989D9'}, {name:'源石',value:task.reward_source_stone||0,svg:rewardSVGs.source_stone,color:'#FFD700'}, {name:'合成玉',value:task.reward_orundum||0,svg:rewardSVGs.orundum,color:'#D42027'} ];
    let hasReward=false;
    // 圆形资源卡片网格
    const grid = document.createElement('div'); grid.className='reward-grid';
    rewards.forEach(r=>{ if(r.value>0){ hasReward=true;
        const card=document.createElement('div'); card.className='reward-circle-card';
        // 圆形容器（光环 + 内圈 + 数量角标 叠在一起）
        const circle = document.createElement('div'); circle.className='reward-circle';
        // 外圈光环
        const ring = document.createElement('div'); ring.className='reward-ring';
        ring.style.setProperty('--ring-color', r.color);
        // 内圈（放图标）
        const iconWrap = document.createElement('div'); iconWrap.className='reward-icon-wrap';
        iconWrap.innerHTML = r.svg;
        // 数量角标（右下角，游戏风格）
        const num = document.createElement('div'); num.className='reward-num-badge'; num.textContent = `+${r.value}`;
        circle.appendChild(ring); circle.appendChild(iconWrap); circle.appendChild(num);
        card.appendChild(circle);
        // 名称标签
        const label = document.createElement('div'); label.className='reward-label'; label.textContent = r.name;
        card.appendChild(label);
        grid.appendChild(card);
    } });
    if(hasReward) DOM.rewardDetails.appendChild(grid);

    let hasDrop=false;
    if(task.drop_config){ try{ const config=JSON.parse(task.drop_config); let drops=[];
        if(Array.isArray(config)) drops=config; else if(config.random_drops&&Array.isArray(config.random_drops)) drops=config.random_drops;
        if(drops.length){ hasDrop=true; DOM.randomDropSection.style.display='block'; DOM.randomDropContent.innerHTML='';
            const dropGrid = document.createElement('div'); dropGrid.className='reward-grid reward-grid-small';
            drops.forEach(drop=>{ const card=document.createElement('div'); card.className='reward-circle-card drop-card';
                const circle = document.createElement('div'); circle.className='reward-circle';
                const ring = document.createElement('div'); ring.className='reward-ring'; ring.style.setProperty('--ring-color', 'var(--highlight-gold-1)');
                const iconWrap = document.createElement('div'); iconWrap.className='reward-icon-wrap';
                iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="rgba(232,184,24,0.6)" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M12 7v10M7 12h10" stroke="rgba(232,184,24,0.8)" stroke-width="1.5"/></svg>';
                let dName='?', dVal=1, dColor='var(--highlight-gold-1)';
                if(typeof drop==='string'){ const parts=drop.split(':'); if(parts.length>=2){ const rt=parts[0]; dVal=parseInt(parts[1])||1;
                    const rm={'source_stone':['源石','#FFD700'],'orundum':['合成玉','#D42027'],'lungmen':['龙门币','#2989D9'],'exp':['经验值','#6AB0E8']}; const entry=rm[rt]||[rt,dColor]; dName=entry[0]; dColor=entry[1]; } else dName=drop; }
                else if(drop.name&&drop.quantity){ dName=drop.name; dVal=drop.quantity; }
                const num = document.createElement('div'); num.className='reward-num-badge'; num.textContent = `x${dVal}`;
                circle.appendChild(ring); circle.appendChild(iconWrap); circle.appendChild(num);
                card.appendChild(circle);
                const label = document.createElement('div'); label.className='reward-label'; label.textContent = dName;
                card.appendChild(label);
                dropGrid.appendChild(card);
            });
            DOM.randomDropContent.appendChild(dropGrid);
        } else DOM.randomDropSection.style.display='none';
    } catch{ DOM.randomDropSection.style.display='none'; } } else DOM.randomDropSection.style.display='none';

    // 底部装饰性对勾圆圈（不可点，仅视觉）
    const checkWrap = document.createElement('div'); checkWrap.className='reward-confirm-check';
    checkWrap.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" fill="none" stroke="var(--highlight-green-1)" stroke-width="1.5"/><path d="M7 12l3 3 7-7" fill="none" stroke="var(--highlight-green-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    if(!hasReward&&!hasDrop){
        DOM.rewardClaimBtn.style.display='none';
        const emptyMsg=document.createElement('p'); emptyMsg.className='reward-empty-msg';
        emptyMsg.textContent='该任务没有可领取的奖励'; DOM.rewardDetails.appendChild(emptyMsg);
    } else if(task.reward_claimed){
        // 已领取：禁用领取按钮，仅展示奖励 + 已领取提示
        DOM.rewardClaimBtn.style.display='none';
        const bottomArea = document.createElement('div'); bottomArea.className='reward-bottom-area';
        bottomArea.appendChild(checkWrap);
        const claimedNote=document.createElement('p'); claimedNote.className='reward-claimed-note';
        claimedNote.textContent='✦ 奖励已领取';
        bottomArea.appendChild(claimedNote);
        DOM.rewardDetails.appendChild(bottomArea);
    } else {
        DOM.rewardClaimBtn.style.display='';
        // 有奖励时，底部放对勾 + 领取按钮
        const bottomArea = document.createElement('div'); bottomArea.className='reward-bottom-area';
        bottomArea.appendChild(checkWrap);
        DOM.rewardDetails.appendChild(bottomArea);
    }
    DOM.rewardClaimBtn.dataset.taskId=taskId;
    openModal('rewardModal');
}

async function claimReward(){
    const taskId=DOM.rewardClaimBtn.dataset.taskId; if(!taskId||state.rewardModalAnimating) return;
    state.rewardModalAnimating=true;
    const result=await apiPost(`/tasks/${taskId}/claim-reward`);
    if(result){
        setTimeout(() => spawnParticlesGatherThenFly(document.querySelector('#rewardModal .modal')), 300);
        const modalContainer=document.querySelector('#rewardModal');
        if(modalContainer){ modalContainer.style.transition='transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.3s ease';
            modalContainer.style.transform='translate(-50%, -50%) scale(0.6)'; modalContainer.style.opacity='0'; }
        setTimeout(()=>{
            closeAllModals();
            if(modalContainer){ modalContainer.style.transition='none'; modalContainer.style.transform=''; modalContainer.style.opacity=''; }
            state.rewardModalAnimating=false;
            loadResources(); loadTransactions(); loadTasks(); updateTrackingPanel();
            const sorted=filterTasks(state.flatTasks); const currentIndex=sorted.findIndex(t=>t.id==taskId);
            if(currentIndex!==-1&&currentIndex+1<sorted.length){ const nextTaskId=sorted[currentIndex+1].id;
                const nextCard=document.querySelector(`.task-card[data-task-id="${nextTaskId}"]`);
                if(nextCard){ nextCard.classList.add('highlight-next'); nextCard.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>nextCard.classList.remove('highlight-next'),3000); } }
        }, 600);
    } else state.rewardModalAnimating=false;
}

function spawnParticlesGatherThenFly(sourceElement) {
    const container = DOM.particleContainer;
    const resourceBar = document.querySelector('.resource-display');
    const barRect = resourceBar ? resourceBar.getBoundingClientRect() : { left: window.innerWidth - 100, top: 0, width: 100 };
    const startRect = sourceElement ? sourceElement.getBoundingClientRect() : { left: window.innerWidth / 2 - 50, top: window.innerHeight / 2 - 50, width: 100, height: 100 };

    const colors = ['#E8B818', '#F8D840', '#6AB0E8', '#C87830', '#A080C8', '#FAE060', '#60C890'];
    const shapes = ['circle', 'diamond', 'star'];

    // 第一阶段：聚集 (30个粒子)
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        const size = 4 + Math.random() * 8;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];

        particle.style.position = 'absolute';
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.background = color;
        particle.style.boxShadow = `0 0 12px ${color}`;
        particle.style.borderRadius = shape === 'circle' ? '50%' : (shape === 'diamond' ? '2px' : '50%');
        if (shape === 'diamond') {
            particle.style.transform = 'rotate(45deg)';
        }
        if (shape === 'star') {
            particle.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
        }

        const startX = startRect.left + Math.random() * startRect.width;
        const startY = startRect.top + Math.random() * startRect.height;
        particle.style.left = startX + 'px';
        particle.style.top = startY + 'px';
        particle.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        particle.style.opacity = '1';
        particle.style.zIndex = '2500';
        container.appendChild(particle);

        requestAnimationFrame(() => {
            const cx = window.innerWidth / 2 + (Math.random() - 0.5) * 40;
            const cy = window.innerHeight / 2 + (Math.random() - 0.5) * 40;
            particle.style.transform = `translate(${cx - startX}px, ${cy - startY}px) scale(0.6)`;
            particle.style.opacity = '0.9';
        });
    }

    // 第二阶段：飞向资源栏 (50个粒子)
    setTimeout(() => {
        container.querySelectorAll('div').forEach(el => {
            if (el.style.position === 'absolute' && el.style.opacity !== '0') {
                el.remove();
            }
        });

        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            const size = 3 + Math.random() * 6;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const shape = shapes[Math.floor(Math.random() * shapes.length)];

            particle.style.position = 'absolute';
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.background = color;
            particle.style.boxShadow = `0 0 12px ${color}`;
            particle.style.borderRadius = shape === 'circle' ? '50%' : (shape === 'diamond' ? '2px' : '50%');
            if (shape === 'diamond') {
                particle.style.transform = 'rotate(45deg)';
            }
            if (shape === 'star') {
                particle.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
            }

            const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 60;
            const startY = window.innerHeight / 2 + (Math.random() - 0.5) * 60;
            particle.style.left = startX + 'px';
            particle.style.top = startY + 'px';
            particle.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            particle.style.opacity = '1';
            particle.style.zIndex = '2500';
            container.appendChild(particle);

            requestAnimationFrame(() => {
                const targetX = barRect.left + Math.random() * barRect.width;
                const targetY = barRect.top + Math.random() * 20;
                particle.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(0.3)`;
                particle.style.opacity = '0';
            });
        }

        setTimeout(() => {
            container.querySelectorAll('div').forEach(el => {
                if (el.style.position === 'absolute') {
                    el.remove();
                }
            });
        }, 800);
    }, 500);
}

async function handleClaimAll(){
    const result=await apiPost('/tasks/claim-all');
    if(result){
        await loadTasks(); await loadResources(); await loadTransactions(); await loadRealityRewards();
        setTimeout(() => spawnParticlesGatherThenFly(DOM.claimAllBtn), 300);
    }
}

function updateClaimAllButton(){
    const hasClaimable=state.flatTasks.some(t=>t.status==='done'&&!t.reward_claimed&&hasActualReward(t));
    if(hasClaimable) DOM.claimAllBtn.classList.remove('hidden-soft'); else DOM.claimAllBtn.classList.add('hidden-soft');
}

async function handleImport(){
    const jsonStr=DOM.importTextarea.value.trim(); if(!jsonStr) return;
    try{ const data=JSON.parse(jsonStr);
        if(data.version !== 1) throw new Error('导入格式错误：仅支持 version 1');
        if(!Array.isArray(data.tasks)) throw new Error('导入格式错误：缺少 tasks 数组');
        function validateTask(task,path='root'){
            if(!task.title||typeof task.title!=='string') throw new Error(`任务缺少标题或标题格式错误 (${path})`);
            if(task.priority!==undefined&&(task.priority<1||task.priority>6)) throw new Error(`优先级必须在1-6之间 (${path})`);
            const validStatus=['todo','in_progress','paused','done','cancelled']; if(task.status&&!validStatus.includes(task.status)) throw new Error(`状态枚举不合法 (${path})`);
            const validTaskLines=['main','side']; if(task.task_line&&!validTaskLines.includes(task.task_line)) throw new Error(`任务线枚举不合法 (${path})`);
            const validRepeatTypes=['daily','weekly','monthly','custom']; if(task.repeat_type&&!validRepeatTypes.includes(task.repeat_type)) throw new Error(`重复类型枚举不合法 (${path})`);
            const validProgressModes=['auto','manual','count']; if(task.progress_mode&&!validProgressModes.includes(task.progress_mode)) throw new Error(`进度模式枚举不合法 (${path})`);
            const hasTarget = task.target_value !== undefined && task.target_value !== null;
            const hasCurrent = task.current_value !== undefined && task.current_value !== null;
            if (task.progress_mode === 'count') {
                if (!hasTarget) throw new Error(`可计数任务必须提供 target_value (${path})`);
                if (task.target_value <= 0) throw new Error(`target_value 必须为正数 (${path})`);
                if (hasCurrent && task.current_value < 0) throw new Error(`current_value 不能为负数 (${path})`);
                if (task.children && task.children.length > 0) throw new Error(`可计数任务不能有子任务 (${path})`);
            } else if (task.progress_mode === 'manual') {
                if (hasTarget) throw new Error(`手动进度任务不应提供 target_value (${path})`);
                if (task.progress !== undefined && (task.progress < 0 || task.progress > 100)) throw new Error(`进度必须在0-100之间 (${path})`);
            } else if (task.progress_mode === 'auto') {
                if (hasTarget || hasCurrent) throw new Error(`自动进度任务不应提供 target_value 或 current_value (${path})`);
            } else if (!task.progress_mode) {
                if (hasTarget && !hasCurrent) {
                    if (task.target_value <= 0) throw new Error(`target_value 必须为正数 (${path})`);
                } else if (task.children && task.children.length > 0 && hasTarget) {
                    throw new Error(`有子任务的任务不应提供 target_value (${path})`);
                }
            }
            if(task.progress!==undefined&&(typeof task.progress!=='number'||task.progress<0||task.progress>100)) throw new Error(`进度必须在0-100之间 (${path})`);
            if(task.tags!==undefined){
                if(!Array.isArray(task.tags)) throw new Error(`tags 必须为数组 (${path})`);
                task.tags.forEach(tag=>{
                    if(typeof tag!=='string') throw new Error(`tags 必须为字符串数组 (${path})`);
                    if(tag.trim()==='') throw new Error(`tags 不能包含空字符串 (${path})`);
                    if(tag.length > 50) throw new Error(`标签长度不能超过50字符 (${path})`);
                });
                const uniqueTags = new Set(task.tags);
                if(uniqueTags.size !== task.tags.length) throw new Error(`tags 不能包含重复项 (${path})`);
            }
            if(task.children!==undefined){ if(!Array.isArray(task.children)) throw new Error(`children 必须为数组 (${path})`);
                task.children.forEach((child,idx)=>validateTask(child,`${path}.children[${idx}]`)); }
            if(task.due_date&&isNaN(Date.parse(task.due_date))) throw new Error(`截止时间格式不合法 (${path})`);
            if(task.planned_start&&isNaN(Date.parse(task.planned_start))) throw new Error(`计划开始时间格式不合法 (${path})`);
            if(task.planned_end&&isNaN(Date.parse(task.planned_end))) throw new Error(`计划结束时间格式不合法 (${path})`);
            if(task.target_value!==undefined&&task.target_value!==null&&(typeof task.target_value!=='number'||task.target_value<=0)) throw new Error(`目标数值必须为正数 (${path})`);
            if(task.current_value!==undefined&&task.current_value!==null&&typeof task.current_value!=='number') throw new Error(`当前值必须为数字 (${path})`);
        }
        data.tasks.forEach((task,idx)=>validateTask(task,`tasks[${idx}]`));
        const result=await apiPost('/import',data);
        if(result){ closeAllModals(); await loadTasks(); await loadResources(); await loadAchievements(); await loadRealityRewards(); showToast(`成功导入 ${data.tasks.length} 个任务`); }
    }catch(e){ showToast('导入失败：'+e.message); }
}

async function handleExport(){ const data=await apiGet('/export'); if(data){ DOM.exportTextarea.value=JSON.stringify(data,null,2); openModal('exportModal'); } }
function copyExport(){ if(navigator.clipboard){ navigator.clipboard.writeText(DOM.exportTextarea.value).then(()=>showToast('已复制到剪贴板')).catch(()=>fallbackCopy()); } else fallbackCopy(); }
function fallbackCopy(){ try{ DOM.exportTextarea.select(); const success=document.execCommand('copy'); if(success) showToast('已复制到剪贴板'); else showToast('复制失败，请手动复制'); }catch{ showToast('复制失败，请手动复制'); } }
function downloadExport(){ const text=DOM.exportTextarea.value; const blob=new Blob([text],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='quest-log-backup.json'; a.click(); URL.revokeObjectURL(url); }

const CLEAR_SCOPE_TEXT = {
    tasks: '所有任务、标签关联、追踪/专注记录与任务成就解锁',
    resources: '所有资源（经验、源石、龙门币、合成玉、理智）将重置为初始值，并清空资源流水',
    all: '全部任务、资源/经验、礼包、现实奖励与成就解锁（保留设置与成就定义）'
};
async function clearData(scope){
    showConfirm(`确定要清空「${CLEAR_SCOPE_TEXT[scope]}」吗？此操作不可恢复。建议先导出备份。`, async () => {
        // 注意：API_BASE 已是 '/api'，此处 endpoint 不能再带 /api 前缀，
        // 否则拼成 /api/api/data/clear -> 404（清空全部/任务/资源都失败的元凶）
        const res = await apiDelete(`/data/clear?scope=${scope}`);
        if(res){
            closeAllModals();
            try {
                await Promise.all([loadTasks(), loadResources(), loadTransactions(), loadAchievements(), loadRealityRewards(), loadGiftPacks()]);
            } catch(e){ console.warn('clear reload:', e); }
            showToast(res.message || '数据已清空');
            renderTasks();
        }
    });
}

async function openSettingsModal(){ const settings=state.settings; DOM.settingsList.innerHTML='';
    const themeWrap = document.createElement('div');
    themeWrap.className = 'wallpaper-setting';
    const themeLabel = document.createElement('label');
    themeLabel.className = 'form-label';
    themeLabel.textContent = '界面主题';
    const themeSelect = document.createElement('select');
    themeSelect.className = 'form-select';
    themeSelect.innerHTML = '<option value="dark">深色终端</option><option value="light">浅色纸感</option>';
    themeSelect.value = settings.theme || 'dark';
    themeSelect.addEventListener('change', async () => {
        await apiPut('/settings', { theme: themeSelect.value });
        state.settings.theme = themeSelect.value;
        applyTheme();
        showToast('主题已切换');
    });
    themeWrap.appendChild(themeLabel);
    themeWrap.appendChild(themeSelect);
    DOM.settingsList.appendChild(themeWrap);

    const wallpaperWrap = document.createElement('div');
    wallpaperWrap.className = 'wallpaper-setting';
    const wpTypeLabel = document.createElement('label');
    wpTypeLabel.className = 'form-label';
    wpTypeLabel.textContent = '动态壁纸类型';
    const wpType = document.createElement('select');
    wpType.className = 'form-select';
    wpType.id = 'wallpaperTypeSelect';
    wpType.innerHTML = '<option value="none">无壁纸</option><option value="image">图片壁纸</option><option value="video">视频动态壁纸</option>';
    wpType.value = settings.wallpaper_type || 'none';
    const wpUrlLabel = document.createElement('label');
    wpUrlLabel.className = 'form-label';
    wpUrlLabel.textContent = '壁纸 URL（图片或视频直链）';
    const wpUrl = document.createElement('input');
    wpUrl.className = 'form-input';
    wpUrl.id = 'wallpaperUrlInput';
    wpUrl.placeholder = 'https://example.com/wallpaper.mp4 或 .jpg';
    wpUrl.value = settings.wallpaper_url || '';
    const saveWallpaper = async () => {
        await apiPut('/settings', { wallpaper_type: wpType.value, wallpaper_url: wpUrl.value.trim() });
        state.settings.wallpaper_type = wpType.value;
        state.settings.wallpaper_url = wpUrl.value.trim();
        applyWallpaper();
        showToast('壁纸已更新');
    };
    wpType.addEventListener('change', saveWallpaper);
    wpUrl.addEventListener('change', saveWallpaper);
    wallpaperWrap.appendChild(wpTypeLabel);
    wallpaperWrap.appendChild(wpType);
    wallpaperWrap.appendChild(wpUrlLabel);
    wallpaperWrap.appendChild(wpUrl);
    DOM.settingsList.appendChild(wallpaperWrap);

    // ===== 本机壁纸软件接入（一键切换，无需手动放文件）=====
    const wpPanel = document.createElement('div');
    wpPanel.className = 'wallpaper-setting wallpaper-software-panel';
    const wpHeader = document.createElement('div');
    wpHeader.className = 'wp-software-header';
    const wpTitle = document.createElement('span');
    wpTitle.className = 'wp-software-title';
    wpTitle.textContent = '本机壁纸软件';
    const wpRefreshIcon = document.createElement('button');
    wpRefreshIcon.className = 'icon-btn';
    wpRefreshIcon.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    wpRefreshIcon.title = '刷新壁纸列表';
    wpHeader.appendChild(wpTitle);
    wpHeader.appendChild(wpRefreshIcon);
    wpPanel.appendChild(wpHeader);
    const wpList = document.createElement('div');
    wpList.id = 'wpSoftwareList';
    wpPanel.appendChild(wpList);
    const wpRefreshBtn = document.createElement('button');
    wpRefreshBtn.className = 'btn btn-secondary btn-medium wp-refresh-btn';
    wpRefreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i><span>重新扫描本机壁纸</span>';
    wpPanel.appendChild(wpRefreshBtn);
    DOM.settingsList.appendChild(wpPanel);

    const renderWp = async () => {
        wpList.innerHTML = '<div class="micro-text">正在检测本机壁纸软件…</div>';
        const data = await apiGet('/wallpaper-software');
        if (!data) { wpList.innerHTML = '<div class="micro-text">检测失败，请确认后端已启动</div>'; return; }
        wpList.innerHTML = '';
        const current = state.settings.wp_current_id;
        (data.software || []).forEach(sw => {
            const block = document.createElement('div');
            block.className = 'wp-software-block';
            const row = document.createElement('div');
            row.className = 'wp-software-row';
            const swName = document.createElement('span');
            swName.className = 'wp-software-name';
            swName.textContent = sw.name;
            const status = document.createElement('span');
            status.className = 'wp-software-status ' + (sw.installed ? 'detected' : 'not-detected');
            status.textContent = sw.installed ? `已安装 · ${sw.count} 款` : '未安装';
            row.appendChild(swName);
            row.appendChild(status);
            block.appendChild(row);
            if (sw.installed && sw.wallpapers && sw.wallpapers.length) {
                const grid = document.createElement('div');
                grid.className = 'wp-wallpaper-grid';
                sw.wallpapers.forEach(wp => {
                    const item = document.createElement('div');
                    item.className = 'wp-wallpaper-item' + (wp.id === current ? ' active' : '');
                    item.dataset.id = wp.id;
                    item.dataset.name = wp.name;
                    item.title = wp.name;
                    const img = document.createElement('img');
                    img.className = 'wp-wallpaper-thumb';
                    img.loading = 'lazy';
                    img.src = `/api/wallpaper-software/preview?id=${encodeURIComponent(wp.id)}`;
                    img.onerror = () => {
                        img.remove();
                        item.classList.add('no-preview');
                        const ic = document.createElement('i');
                        ic.className = 'fa-solid ' + (wp.type === 'video' ? 'fa-film' : 'fa-photo-film');
                        item.appendChild(ic);
                    };
                    const label = document.createElement('span');
                    label.className = 'wp-wallpaper-name';
                    label.textContent = wp.name;
                    item.appendChild(img);
                    item.appendChild(label);
                    item.addEventListener('click', async () => {
                        item.style.opacity = '0.6';
                        const res = await apiPost('/wallpaper-software/apply', { id: wp.id, software: sw.id });
                        item.style.opacity = '1';
                        if (res && res.success) {
                            state.settings.wp_current_id = wp.id;
                            grid.querySelectorAll('.wp-wallpaper-item').forEach(el => el.classList.remove('active'));
                            item.classList.add('active');
                            // 含真实视频文件的壁纸用 <video> 动态背景；图片型用原图(media 端点优先返回 image_file 全分辨率)
                            const isVideo = wp.has_video || wp.media === 'video';
                            if (isVideo) {
                                state.settings.wallpaper_type = 'video';
                                state.settings.wallpaper_url = `/api/wallpaper-software/media?id=${encodeURIComponent(wp.id)}`;
                            } else {
                                state.settings.wallpaper_type = 'image';
                                state.settings.wallpaper_url = `/api/wallpaper-software/media?id=${encodeURIComponent(wp.id)}`;
                            }
                            try {
                                await apiPut('/settings', { wallpaper_type: state.settings.wallpaper_type, wallpaper_url: state.settings.wallpaper_url });
                            } catch (e) {}
                            applyWallpaper();
                            showToast(res.message || '已切换壁纸');
                        } else if (res) {
                            showToast(res.message || '切换失败');
                        }
                    });
                    grid.appendChild(item);
                });
                block.appendChild(grid);
            } else if (sw.installed) {
                const note = document.createElement('div');
                note.className = 'micro-text';
                note.textContent = '已安装，但未扫描到可用壁纸';
                block.appendChild(note);
            } else {
                const note = document.createElement('div');
                note.className = 'micro-text';
                note.textContent = '未检测到，请先安装 Wallpaper Engine 或 Lively Wallpaper';
                block.appendChild(note);
            }
            wpList.appendChild(block);
        });
    };
    wpRefreshIcon.addEventListener('click', renderWp);
    wpRefreshBtn.addEventListener('click', renderWp);
    renderWp();

    const settingDefs=[ {key:'tracking_panel_collapsed',label:'追踪面板收起',type:'checkbox'}, {key:'focus_mode',label:'专注模式默认开启',type:'checkbox'}, {key:'quick_track',label:'快捷追踪按钮',type:'checkbox'}, {key:'show_side_when_tracking_main',label:'追踪主线时显示支线',type:'checkbox'}, {key:'show_main_when_tracking_side',label:'追踪支线时显示主线',type:'checkbox'}, {key:'show_sanity',label:'理智显示开关',type:'checkbox'} ];
    settingDefs.forEach(def=>{
        const container = document.createElement('div');
        container.className = 'switch-container';
        const label = document.createElement('span');
        label.className = 'switch-label';
        label.textContent = def.label;
        const switchWrapper = document.createElement('label');
        switchWrapper.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!settings[def.key];
        input.dataset.key = def.key;
        input.addEventListener('change', async (e) => {
            await apiPut('/settings', {[def.key]: e.target.checked});
            state.settings[def.key] = e.target.checked;
            applySettingsFromState();
            renderTasks();
        });
        const slider = document.createElement('span');
        slider.className = 'slider';
        switchWrapper.appendChild(input);
        switchWrapper.appendChild(slider);
        container.appendChild(label);
        container.appendChild(switchWrapper);
        DOM.settingsList.appendChild(container);
    });
    openModal('settingsModal'); }

function applyTheme() {
    const theme = state.settings.theme || 'dark';
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme === 'dark');
}

async function applyWallpaper() {
    try {
        const url = (state.settings.wallpaper_url || '').trim();
        const type = state.settings.wallpaper_type || 'none';

        // 复用/创建壁纸底层：挂在 #app 最底层(z-index:0)，位于内容之下、
        // 装饰渐变之上（渐变在壁纸激活时透明化），不会被 #app(z-index:10) 整层盖住。
        let layer = document.getElementById('wallpaperLayer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'wallpaperLayer';
            layer.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;';
            const appEl = document.getElementById('app');
            if (appEl) appEl.insertBefore(layer, appEl.firstChild);
            else document.body.prepend(layer);
        }
        // 清理旧元素
        const oldCanvas = document.getElementById('wallpaperCanvas');
        if (oldCanvas) oldCanvas.remove();
        const oldVideo = document.getElementById('wallpaperVideo');
        if (oldVideo) oldVideo.remove();
        layer.style.backgroundImage = '';
        layer.innerHTML = '';

        document.body.classList.remove('wallpaper-image', 'wallpaper-video');

        if (type === 'image' && url) {
            document.body.classList.add('wallpaper-image');
            layer.style.backgroundImage = `url("${url}")`;
            layer.style.backgroundSize = 'cover';
            layer.style.backgroundPosition = 'center';
            layer.style.backgroundAttachment = 'fixed';
            return;
        }

        if (type === 'video' && url) {
            document.body.classList.add('wallpaper-video');
            const video = document.createElement('video');
            video.id = 'wallpaperVideo';
            // iOS 关键：muted 必须在 src 之前就存在于标签上，否则自动播放被直接拒绝（静止/黑屏）
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('autoplay', '');
            video.setAttribute('loop', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.preload = 'auto';
            // 图层 CSS 背景兜底（不依赖 video.poster：iOS 在 play 被拒时会清空 poster 变黑屏）
            const previewUrl = url.replace('/media?', '/preview?');
            if (previewUrl !== url) {
                layer.style.backgroundImage = `url("${previewUrl}")`;
                layer.style.backgroundSize = 'cover';
                layer.style.backgroundPosition = 'center';
                video.poster = previewUrl;
            }
            // 手机/窄屏改用服务端转码的轻量版：原片 1080p/10Mbps 经内网穿透根本喂不动，
            // 会一直缓冲（表现就是「壁纸不会动」）。轻量版约 700kbps，实测 303MB -> 21MB。
            const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent)
                             || window.innerWidth < 820;
            // 注意：src 必须晚于 muted/autoplay/playsinline 属性（iOS 自动播放硬要求）
            video.src = (isMobile && previewUrl !== url) ? (url + '&mobile=1') : url;
            // ★ 关键设计：预览图背景「永不移除」，视频默认完全透明叠在它上面。
            //   只有确认视频真的在推进时间轴，才把视频淡入。
            //   这样即使 iOS 拒绝自动播放 / 清空 poster / 首帧尚未解码，
            //   画面也只会停在预览图，绝不会黑屏。
            video.style.cssText =
                'width:100%;height:100%;object-fit:cover;display:block;' +
                'opacity:0;background:transparent;transition:opacity .8s ease;';
            layer.appendChild(video);

            // 尝试播放：被拒时静默失败，保留图层预览图兜底（不黑屏、不删视频）
            function startPlay() {
                const p = video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }

            let revealed = false;
            function reveal() {          // 视频确实出画面 -> 淡入覆盖预览图
                if (revealed) return;
                revealed = true;
                video.style.opacity = '1';
            }
            function conceal() {         // 视频无画面 -> 透明，露出预览图
                revealed = false;
                video.style.opacity = '0';
            }

            // 唯一可信的「真的在播」信号：时间轴持续推进
            video.addEventListener('timeupdate', function() {
                if (!video.paused && !video.ended && video.currentTime > 0.05) reveal();
            });
            // 辅助判定：数据充足且非暂停态（iOS 会误发 playing 但仍无画面，故不单独信任）
            video.addEventListener('playing', function() {
                if (!video.paused && video.readyState >= 3) reveal();
            });
            // 暂停 / 缓冲中断 / 播放结束 -> 立刻透明回预览图，并尝试续播
            video.addEventListener('pause', function() {
                conceal();
                if (!video.ended) startPlay();
            });
            video.addEventListener('ended', conceal);
            video.addEventListener('stalled', conceal);
            video.addEventListener('waiting', conceal);

            video.addEventListener('loadedmetadata', startPlay);
            video.addEventListener('canplay', startPlay);

            // iOS 自动播放策略兜底：首次用户交互（滑动/点击）后立即补播
            function onFirstInteract() {
                startPlay();
                window.removeEventListener('touchstart', onFirstInteract);
                window.removeEventListener('click', onFirstInteract);
                document.removeEventListener('pointerdown', onFirstInteract);
            }
            window.addEventListener('touchstart', onFirstInteract, { passive: true });
            window.addEventListener('click', onFirstInteract);
            document.addEventListener('pointerdown', onFirstInteract);

            // 加载失败：视频保持透明，预览图背景仍在，不空白
            video.addEventListener('error', conceal);

            window._wallpaperVideo = video;
        }
    } catch (err) {
        console.error('wallpaper apply error', err);
    }
}

function applySettingsFromState() {
    if (!state.trackingTaskId) {
        document.body.classList.remove('focus-mode');
    } else {
        if (state.settings.tracking_panel_collapsed) collapseTrackingPanel();
        else expandTrackingPanel();
    }

    if (DOM.sanityDisplay) {
        DOM.sanityDisplay.style.display = state.settings.show_sanity === false ? 'none' : 'flex';
    }

    if (state.settings.focus_mode && state.trackingTaskId) {
        document.body.classList.add('focus-mode');
    } else {
        document.body.classList.remove('focus-mode');
    }
    applyTheme();
    applyWallpaper();
}

async function createCustomBadge(){ const name=DOM.badgeName.value.trim(); const desc=DOM.badgeDesc.value.trim(); const customText=DOM.badgeCustomText.value.trim(); if(!name) return;
    const color=DOM.badgeColor.value; const pattern=DOM.badgePattern.value; const imageFile=DOM.badgeImageUpload.files[0];
    if(imageFile){ if(!imageFile.type.startsWith('image/')){ showToast('请上传图片文件'); return; } if(imageFile.size>5*1024*1024){ showToast('图片大小不能超过5MB'); return; } }
    const formData=new FormData(); formData.append('name',name); formData.append('description',desc); formData.append('color',color); formData.append('pattern',pattern); formData.append('condition_type','custom'); formData.append('condition_value',1);
    if(customText) formData.append('custom_text',customText); if(imageFile) formData.append('image',imageFile);
    const result=await apiPost('/achievements/custom',formData,true); if(result){ closeAllModals(); loadAchievements(); } }

function setGraphZoom(delta){
    const newScale=Math.max(0.3,Math.min(3,state.graphScale+delta));
    if(newScale===state.graphScale) return;
    const view=state.graphViewBox;
    // 以当前视口中心为锚点缩放
    const cx=view.x+view.width/2, cy=view.y+view.height/2;
    const newWidth=state.graphBaseWidth/newScale;
    const newHeight=state.graphBaseHeight/newScale;
    view.x=cx-newWidth/2; view.y=cy-newHeight/2;
    view.width=newWidth; view.height=newHeight;
    state.graphScale=newScale;
    state.graphUserPanned = true;  // 标记用户手动操作，阻止auto-fit
    DOM.graphSvg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
}
function resetGraph(){
    state.graphScale=1;
    state.graphUserPanned=false;  // 重置标志，让下次renderGraph重新auto-fit
    // 清除缓存的位置让节点回到默认布局（可选：保留用户拖拽过的位置）
    // state.graphNodePositions = {};  // 如需完全重置节点位置可取消注释
    renderGraph();  // renderGraph会因 graphUserPanned=false 而执行auto-fit
}

function changeMonth(delta){ state.calendarMonth.setMonth(state.calendarMonth.getMonth()+delta); renderCalendar(); }

async function openTaskDetail(taskId){
    const task=state.flatTasks.find(t=>t.id===taskId); if(!task) return;
    if(window.innerWidth<=768&&DOM.trackingPanel.classList.contains('expanded')) collapseTrackingPanel();
    DOM.taskDetailTitle.textContent=task.title; DOM.taskDetailBody.innerHTML='';

    // Hero header
    const hero=document.createElement('div');
    hero.className='task-detail-hero';
    const heroStars=document.createElement('div');
    heroStars.className='task-detail-stars';
    const starPlate=document.createElement('div');
    starPlate.className=`star-bg priority-${task.priority}`;
    for(let i=0;i<task.priority;i++) starPlate.appendChild(createStarElement());
    heroStars.appendChild(starPlate);
    const heroTitle=document.createElement('div');
    heroTitle.className='task-detail-title';
    heroTitle.textContent=task.title;
    const heroMeta=document.createElement('div');
    heroMeta.className='task-detail-meta';
    const statusBadge=document.createElement('span');
    statusBadge.className=`task-detail-badge status-${task.status}`;
    const statusNames={todo:'待办',in_progress:'进行中',paused:'已暂停',done:'已完成',cancelled:'已取消'};
    statusBadge.textContent=statusNames[task.status]||task.status;
    const lineBadge=document.createElement('span');
    lineBadge.className=`task-detail-badge line-${task.task_line}`;
    lineBadge.textContent=task.task_line==='main'?'主线':'支线';
    heroMeta.appendChild(statusBadge);
    heroMeta.appendChild(lineBadge);
    hero.appendChild(heroStars);
    hero.appendChild(heroTitle);
    hero.appendChild(heroMeta);
    DOM.taskDetailBody.appendChild(hero);

    // Description
    if(task.description){
        const descCard=document.createElement('div');
        descCard.className='task-detail-section';
        const descLabel=document.createElement('div');
        descLabel.className='task-detail-label';
        descLabel.innerHTML='<i class="fa-solid fa-align-left"></i> 描述';
        const descText=document.createElement('p');
        descText.className='task-detail-desc';
        descText.textContent=task.description;
        descCard.appendChild(descLabel);
        descCard.appendChild(descText);
        DOM.taskDetailBody.appendChild(descCard);
    }

    // Meta grid
    const metaGrid=document.createElement('div');
    metaGrid.className='task-detail-grid';
    const metaItems=[
        ['优先级','★'.repeat(task.priority),'fa-star'],
        ['进度',task.progress_mode==='count'?`${task.current_value}/${task.target_value}`:`${Math.round(task.progress||0)}%`,'fa-chart-simple'],
        ['截止',task.due_date?formatDate(task.due_date):'无','fa-calendar-days'],
        ['重复',task.repeat_type||'无','fa-rotate'],
        ['创建',formatDate(task.created_at),'fa-clock'],
        ['标签',(task.tags||[]).map(t=>t.name).join(', ')||'无','fa-tags']
    ];
    metaItems.forEach(([label,value,icon])=>{
        const item=document.createElement('div');
        item.className='task-detail-meta-item';
        item.innerHTML=`<i class="fa-solid ${icon}"></i><span class="task-detail-meta-label">${label}</span><span class="task-detail-meta-value">${escapeHtml(value)}</span>`;
        metaGrid.appendChild(item);
    });
    DOM.taskDetailBody.appendChild(metaGrid);

    // Notes
    if(task.notes){
        const notes=document.createElement('div');
        notes.className='task-detail-section';
        const label=document.createElement('div');
        label.className='task-detail-label';
        label.innerHTML='<i class="fa-solid fa-note-sticky"></i> 备注';
        const text=document.createElement('p');
        text.className='task-detail-desc';
        text.textContent=task.notes;
        notes.appendChild(label);
        notes.appendChild(text);
        DOM.taskDetailBody.appendChild(notes);
    }

    // Children
    const children=state.flatTasks.filter(t=>t.parent_id===taskId);
    if(children.length){
        const childSection=document.createElement('div');
        childSection.className='task-detail-section';
        const label=document.createElement('div');
        label.className='task-detail-label';
        label.innerHTML='<i class="fa-solid fa-diagram-project"></i> 子任务';
        childSection.appendChild(label);
        children.forEach(child=>{
            const childDiv=document.createElement('div');
            childDiv.className='task-detail-child';
            childDiv.innerHTML=`<i class="fa-solid fa-diamond"></i><span>${escapeHtml(child.title)}</span><em>${Math.round(child.progress||0)}%</em>`;
            childDiv.addEventListener('click',()=>{ closeAllModals(); openTaskDetail(child.id); });
            childSection.appendChild(childDiv);
        });
        DOM.taskDetailBody.appendChild(childSection);
    }

    // Actions
    const btnContainer=document.createElement('div');
    btnContainer.className='task-detail-actions';
    if(state.trackingTaskId!==task.id){
        const trackBtn=document.createElement('button'); trackBtn.className='btn btn-diamond'; trackBtn.innerHTML='<i class="fa-solid fa-diamond"></i> 追踪';
        trackBtn.addEventListener('click',()=>{ toggleTrackingForTask(taskId); closeAllModals(); });
        btnContainer.appendChild(trackBtn);
    } else {
        const stopBtn=document.createElement('button'); stopBtn.className='btn btn-diamond'; stopBtn.innerHTML='<i class="fa-solid fa-diamond"></i> 停止追踪';
        stopBtn.addEventListener('click',()=>{ toggleTracking(); closeAllModals(); });
        btnContainer.appendChild(stopBtn);
    }
    if(task.status!=='done'){
        const completeBtn=document.createElement('button'); completeBtn.className='btn btn-primary'; completeBtn.innerHTML='<i class="fa-solid fa-check"></i> 完成任务';
        completeBtn.addEventListener('click',async()=>{ closeAllModals(); await completeTaskAndHandleReward(taskId); });
        btnContainer.appendChild(completeBtn);
    } else if(!task.reward_claimed){
        const hasReward=hasActualReward(task);
        if(hasReward){
            const rewardBtn=document.createElement('button'); rewardBtn.className='btn btn-primary'; rewardBtn.innerHTML='<i class="fa-solid fa-gift"></i> 领取奖励';
            rewardBtn.addEventListener('click',()=>{ closeAllModals(); openRewardModal(task.id); });
            btnContainer.appendChild(rewardBtn);
        }
    }
    DOM.taskDetailBody.appendChild(btnContainer);
    openModal('taskDetailModal');
}

async function purchaseGiftPack(packId){ const result=await apiPost(`/gift-packs/${packId}/purchase`); if(result){ loadGiftPacks(); loadResources(); loadTransactions(); loadRealityRewards(); showToast('购买成功'); } }

function updateExchangeCost(){ const target=DOM.exchangeTarget.value; const amount=parseFloat(DOM.exchangeAmount.value)||0; let cost=0;
    if(target==='source_stone') cost=amount*EXCHANGE_RATES.source_stone; else if(target==='orundum') cost=amount*EXCHANGE_RATES.orundum;
    DOM.exchangeCostDisplay.textContent=`所需龙门币：${cost}`; }
function updateExchangeBalance(){ const lungmen=state.resources.lungmen?.current_value||0; DOM.exchangeLungmenBalance.textContent=`当前持有龙门币：${lungmen}`; }
function updateExchangeRateText(){ DOM.exchangeRateText.textContent = `使用龙门币兑换其他资源（汇率：1源石=${EXCHANGE_RATES.source_stone}龙门币，1合成玉=${EXCHANGE_RATES.orundum}龙门币）`; }
async function handleExchange(){ const targetType=DOM.exchangeTarget.value; const amount=parseFloat(DOM.exchangeAmount.value);
    if(isNaN(amount)||amount<=0){ showToast('请输入有效数量'); return; }
    const result=await apiPost('/resources/exchange',{target_type:targetType,amount}); if(result){ await loadResources(); await loadTransactions(); await loadRealityRewards(); closeAllModals(); showToast('兑换成功'); } }
function updateGachaBalance(){ const orundum=state.resources.orundum?.current_value||0; DOM.gachaOrundumBalance.textContent=`当前持有合成玉：${orundum}`; }
function updateGachaCostText(){ DOM.gachaCostText.textContent = `消耗 ${GACHA_COST_ORUNDUM} 合成玉进行一次抽取`; }
async function handleGacha(){ const result=await apiPost('/achievements/draw'); if(result){ DOM.gachaResult.innerHTML='';
    if(result.name){ const div=document.createElement('div'); div.className='reward-item'; div.textContent=`获得蚀刻章：${result.name}`; DOM.gachaResult.appendChild(div); loadAchievements(); }
    else DOM.gachaResult.textContent='未获得新蚀刻章';
    await loadResources(); await loadTransactions(); await loadRealityRewards(); showToast('抽取完成'); setTimeout(()=>closeAllModals(),3000); } }

function openModal(id){ const modal = document.getElementById(id); if(modal){ modal.classList.add('show'); modal.classList.remove('hidden'); } DOM.modalOverlay.classList.add('show'); }
function closeAllModals(){
    if (rewardModalTimer) {
        clearTimeout(rewardModalTimer);
        rewardModalTimer = null;
    }
    rewardModalOpenTaskId = null;
    document.querySelectorAll('.modal-container').forEach(m=>{ m.classList.remove('show'); m.classList.add('hidden'); m.style.transform=''; m.style.opacity=''; }); DOM.modalOverlay.classList.remove('show');
}

let touchStartX=0, touchStartY=0, touchMoved=false, swipedCard=null, swipeTimeout=null;
function handleTouchStart(e){ touchStartX=e.touches[0].clientX; touchStartY=e.touches[0].clientY; touchMoved=false; if(swipeTimeout){ clearTimeout(swipeTimeout); swipeTimeout=null; } }
function handleTouchMove(e){ const touchCurrentX=e.touches[0].clientX, touchCurrentY=e.touches[0].clientY;
    const deltaX=touchCurrentX-touchStartX, deltaY=Math.abs(touchCurrentY-touchStartY);
    if(Math.abs(deltaX)>50&&deltaY<30){
        e.preventDefault();
        touchMoved=true; const card=e.target.closest('.task-card');
        if(card){ if(deltaX<-50){ card.classList.add('swiped'); if(swipedCard&&swipedCard!==card) swipedCard.classList.remove('swiped'); swipedCard=card;
            if(swipeTimeout) clearTimeout(swipeTimeout); swipeTimeout=setTimeout(()=>{ card.classList.remove('swiped'); swipedCard=null; },3000); }
            else if(deltaX>50){ card.classList.remove('swiped'); if(swipedCard===card) swipedCard=null; if(swipeTimeout) clearTimeout(swipeTimeout); } } } }
function handleTouchEnd(){
    if(touchMoved){
        window._suppressClick = true;
        setTimeout(() => window._suppressClick = false, 300);
    }
    touchStartX=0; touchStartY=0; touchMoved=false;
}

function debounce(fn,delay){ let timer; return function(...args){ clearTimeout(timer); timer=setTimeout(()=>fn.apply(this,args),delay); }; }
function applyFilters(){ state.filter.status=DOM.filterStatus.value; state.filter.priority=DOM.filterPriority.value; state.filter.taskLine=DOM.filterTaskLine.value;
    state.filter.tracked=DOM.filterTracked.value; state.filter.search=DOM.filterSearch.value; state.filter.showArchived=DOM.showArchived.checked; state.filter.showDeleted=DOM.showDeleted.checked;
    renderTasks(); updateTagFilter(); }
function updateTagFilter(){ const allTags=new Set(); state.flatTasks.filter(t=>!t.archived&&!t.deleted).forEach(t=>(t.tags||[]).forEach(tag=>allTags.add(tag.name)));
    DOM.tagFilterContainer.innerHTML=''; allTags.forEach(tag=>{ const chip=document.createElement('span'); chip.className='tag-chip'; chip.textContent=tag;
        chip.addEventListener('click',()=>{ chip.classList.toggle('active'); if(chip.classList.contains('active')) state.filter.tags.push(tag); else state.filter.tags=state.filter.tags.filter(t=>t!==tag); renderTasks(); });
        DOM.tagFilterContainer.appendChild(chip); }); }
function updateTrackingPanelIfNeeded(){ if(state.trackingTaskId) updateTrackingPanel(); }
function checkLevelUp(){ const currentLevel=calculateLevel(state.resources.exp?.current_value||0);
    if(currentLevel>state.lastLevel&&state.lastLevel!==0){ state.lastLevel=currentLevel; DOM.levelUpText.textContent='理智已回满'; DOM.levelUpOverlay.classList.add('show');
        setTimeout(()=>DOM.levelUpOverlay.classList.remove('show'),2000); loadResources(); }
    else if(state.lastLevel===0) state.lastLevel=currentLevel; }
function checkNewUnlocks(){ const storedIds=JSON.parse(localStorage.getItem('unlockedAchievementIds')||'[]');
    const newUnlocks=state.unlockedAchievements.filter(u=>!storedIds.includes(u.achievement_id));
    newUnlocks.forEach((u,index)=>{ setTimeout(()=>{ const ach=state.achievements.find(a=>a.id===u.achievement_id);
        if(ach){ DOM.badgeNotifName.textContent=ach.name; DOM.badgeNotification.classList.add('show'); setTimeout(()=>DOM.badgeNotification.classList.remove('show'),3000); } },index*3000); });
    if(newUnlocks.length){ const updatedIds=[...storedIds,...newUnlocks.map(u=>u.achievement_id)]; localStorage.setItem('unlockedAchievementIds',JSON.stringify(updatedIds)); } }
function formatDate(dateStr){ if(!dateStr) return '无'; let d=new Date(dateStr); if(isNaN(d.getTime())) d=new Date(dateStr.replace(' ','T')+'Z'); return isNaN(d.getTime())?dateStr:d.toLocaleString(); }
function escapeHtml(str){ if(!str) return ''; const div=document.createElement('div'); div.textContent=str; return div.innerHTML; }