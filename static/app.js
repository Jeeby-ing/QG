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
        status: '', priority: '', taskLine: '', tracked: '', search: '', tags: [], track: 'daily', category: '',
        showArchived: false, showDeleted: false
    },
    collapsedTasks: new Set(),
    /* 批量选择模式 */
    selectionMode: false,
    selectedIds: new Set(),   // 已勾选的任务 id
    visibleIds: new Set(),    // 当前筛选下可见的任务 id（供全选用）
    collapsedCampaigns: new Set(),
    expandedCampaigns: new Set(),  // 战役子任务层级默认收起，展开过的记在这里
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
// 资源兑换：唯一允许的兑换方向为 源石 → 合成玉，比例 1 源石 = 180 合成玉（明日方舟原版）。
const EXCHANGE_RATE_STONE_TO_ORUNDUM = 180;
const GACHA_COST_ORUNDUM = 300;
// 干员寻访（抽卡）：单次 600 合成玉，十连 6000（明日方舟原版标准）。
const OPERATOR_GACHA_COST = 600;

// ── 共享资源图标 SVG（唯一真实来源，三处复用：顶部栏 / 奖励弹窗 / 主页面板）──
// 渐变 ID 用 rs 前缀（resource-shared），避免与页面其他 SVG 冲突

// 素材图标统一模板：圆角方底 + 内嵌符号
function matBadge(bg, symbol) {
    return `<svg viewBox="0 0 24 24" width="36" height="36"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="${bg}" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>${symbol}</svg>`;
}

const RESOURCE_SVGS = {
    exp: '<svg viewBox="0 0 24 24" width="36" height="36"><rect x="3.5" y="6" width="17" height="12" rx="2.4" fill="#16324F"/><rect x="3.5" y="6" width="17" height="12" rx="2.4" fill="none" stroke="#6AB0E8" stroke-width="1"/><rect x="3.5" y="6" width="4.5" height="12" rx="2.4" fill="#0E2238"/><text x="14.2" y="15.4" text-anchor="middle" font-size="8" font-weight="800" fill="#9FD0F5" font-family="sans-serif" letter-spacing="0.5">EXP</text></svg>',
    lungmen: '<svg viewBox="0 0 24 24" width="36" height="36"><defs><linearGradient id="rsLm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FA0FF"/><stop offset="1" stop-color="#154C8A"/></linearGradient></defs><rect x="4" y="11" width="15" height="8.5" rx="1.6" fill="#154C8A"/><rect x="5.5" y="7.5" width="15" height="8.5" rx="1.6" fill="#1E6BC4"/><rect x="7" y="4" width="15" height="8.5" rx="1.6" fill="url(#rsLm)"/><rect x="7" y="4" width="15" height="8.5" rx="1.6" fill="none" stroke="#7FC4FF" stroke-width="0.5" opacity="0.6"/><circle cx="17.2" cy="8" r="3" fill="none" stroke="#E8F4FF" stroke-width="0.8"/><path d="M17.2 5.6 V10.4 M15.1 8 H19.3" stroke="#E8F4FF" stroke-width="0.7"/><text x="13.8" y="13.6" text-anchor="middle" font-size="5.5" font-weight="700" fill="#E8F4FF" font-family="sans-serif">龙</text></svg>',
    source_stone: '<svg viewBox="0 0 24 24" width="36" height="36"><defs><radialGradient id="rsSs" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#FFF6C8"/><stop offset="60%" stop-color="#F6D743" stop-opacity="0.25"/><stop offset="100%" stop-color="#F6D743" stop-opacity="0"/></radialGradient></defs><polygon points="12,1 22,12 12,23 2,12" fill="url(#rsSs)"/><polygon points="12,2.5 20,12 12,21.5 4,12" fill="#C9971B"/><polygon points="12,2.5 20,12 12,12 4,12" fill="#FFD700"/><polygon points="12,12 20,12 12,21.5 4,21.5" fill="#9C7614"/><polygon points="12,2.5 16,12 12,12 8,12" fill="#FFE98A" opacity="0.7"/><polygon points="12,12 16,12 12,17.5 8,12" fill="#6E5410" opacity="0.5"/></svg>',
    orundum: '<svg viewBox="0 0 24 24" width="36" height="36"><polygon points="12,1.5 21,12 12,22.5 3,12" fill="#5C0E16"/><polygon points="12,1.5 21,12 12,12 3,12" fill="#D42027"/><polygon points="12,12 21,12 12,22.5 3,22.5" fill="#160407"/><polygon points="12,4.5 17,12 12,19.5 7,12" fill="none" stroke="#FF7A82" stroke-width="0.5" opacity="0.6"/><polygon points="12,7 15,12 12,17 9,12" fill="#FF5560" opacity="0.25"/></svg>',
    sanity: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#7FE3C8" stroke-width="1" stroke-linejoin="round"><path d="M12 3 L19 7 V15 L12 21 L5 15 V7 Z" fill="rgba(70,200,170,0.12)"/><path d="M12 3 V21 M5 7 L19 15 M19 7 L5 15" stroke="#9FF0D8" stroke-width="0.5" opacity="0.5"/><polygon points="12.6,6.5 9.5,12 12,12 11,17.5 14.5,11 12,11" fill="#CFFCEF" stroke="none"/></svg>',

    // ── 随机掉落素材图标 ──
    // 赤金系列
    MTL_GOLD1: matBadge('#6A5428', `<rect x="7.5" y="8" width="9" height="7" rx="1" fill="#E8C030"/><rect x="8.5" y="9.2" width="7" height="1.2" fill="#B8860B"/>`),
    MTL_GOLD2: matBadge('#6A5428', `<rect x="6.5" y="10" width="11" height="5.5" rx="1" fill="#E8C030"/><rect x="7" y="7" width="10" height="5" rx="1" fill="#F0D040"/><rect x="8" y="8.2" width="8" height="0.8" fill="#B8860B"/>`),
    MTL_GOLD3: matBadge('#6A5428', `<rect x="6" y="11" width="12" height="5" rx="1" fill="#E8C030"/><rect x="6.5" y="8" width="11" height="5" rx="1" fill="#F5D850"/><rect x="7.5" y="5.5" width="9" height="4.5" rx="1" fill="#FFE870"/><rect x="8.5" y="9.5" width="7" height="0.8" fill="#B8860B"/>`),
    // 技巧概要
    MTL_SKILL1: matBadge('#2F5A3A', `<rect x="6" y="5" width="12" height="14" rx="1" fill="#4CAF50"/><rect x="7" y="6" width="10" height="12" fill="none" stroke="#81C784" stroke-width="0.5"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="#E8F5E9" font-family="sans-serif" font-weight="700">技</text>`),
    MTL_SKILL2: matBadge('#1E3A5F', `<rect x="6" y="5" width="12" height="14" rx="1" fill="#42A5F5"/><rect x="7" y="6" width="10" height="12" fill="none" stroke="#90CAF9" stroke-width="0.5"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="#E3F2FD" font-family="sans-serif" font-weight="700">技</text>`),
    MTL_SKILL3: matBadge('#5A2A2A', `<rect x="6" y="5" width="12" height="14" rx="1" fill="#EF5350"/><rect x="7" y="6" width="10" height="12" fill="none" stroke="#FFCDD2" stroke-width="0.5"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="#FFEBEE" font-family="sans-serif" font-weight="700">技</text>`),
    // 作战记录
    sprite_exp_card_t1: matBadge('#3A4A5A', `<rect x="5" y="6" width="14" height="11" rx="1.5" fill="#607D8B"/><rect x="7" y="8" width="10" height="7" fill="none" stroke="#B0BEC5" stroke-width="0.5"/><text x="12" y="14.5" text-anchor="middle" font-size="5" fill="#ECEFF1" font-family="sans-serif" font-weight="700">EXP</text>`),
    sprite_exp_card_t2: matBadge('#1A3A6A', `<rect x="5" y="6" width="14" height="11" rx="1.5" fill="#1976D2"/><rect x="7" y="8" width="10" height="7" fill="none" stroke="#90CAF9" stroke-width="0.5"/><text x="12" y="14.5" text-anchor="middle" font-size="5" fill="#E3F2FD" font-family="sans-serif" font-weight="700">EXP</text>`),
    sprite_exp_card_t3: matBadge('#3A1A5A', `<rect x="5" y="6" width="14" height="11" rx="1.5" fill="#7B1FA2"/><rect x="7" y="8" width="10" height="7" fill="none" stroke="#CE93D8" stroke-width="0.5"/><text x="12" y="14.5" text-anchor="middle" font-size="5" fill="#F3E5F5" font-family="sans-serif" font-weight="700">EXP</text>`),
    sprite_exp_card_t4: matBadge('#5A4A1A', `<rect x="5" y="6" width="14" height="11" rx="1.5" fill="#F9A825"/><rect x="7" y="8" width="10" height="7" fill="none" stroke="#FFF59D" stroke-width="0.5"/><text x="12" y="14.5" text-anchor="middle" font-size="5" fill="#FFFDE7" font-family="sans-serif" font-weight="700">EXP</text>`),
    // 常规素材
    MTL_ROCK: matBadge('#4A3A2A', `<polygon points="12,5 17,9 16,17 8,17 7,9" fill="#8D6E63" stroke="#A1887F" stroke-width="0.6"/>`),
    MTL_DEVICE: matBadge('#3A3A3A', `<circle cx="12" cy="12" r="6" fill="none" stroke="#90A4AE" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="#90A4AE"/><path d="M12 3.5 v3 M12 17.5 v3 M3.5 12 h3 M17.5 12 h3" stroke="#90A4AE" stroke-width="1"/>`),
    MTL_POLYESTER: matBadge('#5A2A4A', `<path d="M12 5 L17 9 L15 17 L9 17 L7 9 Z" fill="#F06292" stroke="#F8BBD0" stroke-width="0.5"/>`),
    MTL_SUGAR: matBadge('#5A5A5A', `<rect x="7" y="8" width="10" height="9" rx="1.5" fill="#E0E0E0"/><rect x="8" y="9" width="3" height="3" fill="#BDBDBD" opacity="0.5"/><rect x="13" y="9" width="3" height="3" fill="#BDBDBD" opacity="0.5"/><rect x="10.5" y="13" width="3" height="3" fill="#BDBDBD" opacity="0.5"/>`),
    MTL_ORE: matBadge('#2A2A2A', `<path d="M8 6 L16 6 L18 12 L12 19 L6 12 Z" fill="#455A64" stroke="#78909C" stroke-width="0.6"/>`),
    MTL_GEL: matBadge('#1A3A1A', `<ellipse cx="12" cy="13" rx="6" ry="5" fill="#66BB6A" stroke="#A5D6A7" stroke-width="0.5"/><circle cx="10" cy="10" r="1.5" fill="#C8E6C9"/>`),
    MTL_CRYSTAL: matBadge('#1A3A4A', `<path d="M12 5 L17 10 L12 19 L7 10 Z" fill="#4FC3F7" stroke="#B3E5FC" stroke-width="0.5"/>`),
    MTL_CHIP: matBadge('#4A3A1A', `<rect x="5.5" y="5.5" width="13" height="13" rx="1" fill="#FFA726" stroke="#FFE0B2" stroke-width="0.5"/><rect x="7.5" y="7.5" width="9" height="9" fill="none" stroke="#FFF3E0" stroke-width="0.5"/><circle cx="12" cy="12" r="2" fill="#FFF3E0"/>`),

    // ── 第二轮扩充素材 ──
    MTL_SOURCE_ROCK: matBadge('#3A4A5A', `<polygon points="12,5 17,9 16,17 8,17 7,9" fill="#78909C" stroke="#90A4AE" stroke-width="0.6"/>`),
    MTL_IRON: matBadge('#2A2A30', `<path d="M8 6 L16 7 L17 13 L12 18 L7 13 Z" fill="#455A64" stroke="#78909C" stroke-width="0.6"/><path d="M10 9 L14 10" stroke="#B0BEC5" stroke-width="0.5"/>`),
    MTL_IRON_BLOCK: matBadge('#1E1E24', `<rect x="6.5" y="7" width="11" height="10" rx="1.2" fill="#37474F" stroke="#607D8B" stroke-width="0.6"/><rect x="8.5" y="9" width="7" height="6" rx="0.8" fill="none" stroke="#90A4AE" stroke-width="0.5"/>`),
    MTL_SUGAR_GROUP: matBadge('#5A5A5A', `<rect x="6" y="9" width="5" height="5" rx="1" fill="#E0E0E0"/><rect x="13" y="7" width="5" height="5" rx="1" fill="#ECEFF1"/><rect x="10" y="13" width="5" height="5" rx="1" fill="#CFD8DC"/>`),
    MTL_PGEL_AGG: matBadge('#1A3A1A', `<ellipse cx="10" cy="13" rx="4" ry="3.5" fill="#66BB6A" stroke="#A5D6A7" stroke-width="0.5"/><ellipse cx="14.5" cy="11" rx="3" ry="2.6" fill="#81C784" stroke="#A5D6A7" stroke-width="0.4"/>`),
    MTL_RUSH: matBadge('#5A2A4A', `<path d="M12 5 L17 9 L15 17 L9 17 L7 9 Z" fill="#F06292" stroke="#F8BBD0" stroke-width="0.5"/><circle cx="12" cy="12" r="1.6" fill="#FCE4EC"/>`),
    MTL_OC_CIRCUIT: matBadge('#1A3A4A', `<path d="M12 5 L17 10 L12 19 L7 10 Z" fill="#4FC3F7" stroke="#B3E5FC" stroke-width="0.5"/><path d="M12 8 V16 M9.5 11 H14.5" stroke="#E1F5FE" stroke-width="0.4"/>`),
    MTL_GRIND: matBadge('#4A4A4A', `<polygon points="12,6 16,9 15,15 9,15 8,9" fill="#9E9E9E" stroke="#BDBDBD" stroke-width="0.6"/><circle cx="12" cy="11" r="1.5" fill="#757575"/>`),
    MTL_MANGANESE3: matBadge('#3A2A4A', `<polygon points="12,5 17,10 13,18 8,13" fill="#9575CD" stroke="#D1C4E9" stroke-width="0.6"/>`),
    MTL_PURIFIED_ROCK: matBadge('#4A5A6A', `<polygon points="12,5 17,9 16,17 8,17 7,9" fill="#B0BEC5" stroke="#CFD8DC" stroke-width="0.6"/><path d="M10 8 L14 10" stroke="#ECEFF1" stroke-width="0.5"/>`),
    MTL_ALCOHOL_T: matBadge('#4A3A1A', `<path d="M12 6 C9 11 9 15 12 17 C15 15 15 11 12 6 Z" fill="#FFB300" stroke="#FFE082" stroke-width="0.5"/>`),
    MTL_ALCOHOL_W: matBadge('#4A4A5A', `<path d="M12 6 C9 11 9 15 12 17 C15 15 15 11 12 6 Z" fill="#ECEFF1" stroke="#FFFFFF" stroke-width="0.5"/>`),
    MTL_DEVICE_MOD: matBadge('#3A3A3A', `<circle cx="12" cy="12" r="6" fill="none" stroke="#90A4AE" stroke-width="1.5"/><circle cx="12" cy="12" r="2.2" fill="#90A4AE"/><path d="M12 4.5 v2 M12 17.5 v2 M4.5 12 h2 M17.5 12 h2" stroke="#90A4AE" stroke-width="1"/>`),
    MTL_MANGANESE1: matBadge('#4A3A5A', `<polygon points="12,5 16,10 12,18 8,10" fill="#B39DDB" stroke="#E1D5F5" stroke-width="0.6"/>`),
    MTL_DEVICE_PIECE: matBadge('#3A3A3A', `<circle cx="12" cy="12" r="6.5" fill="none" stroke="#90A4AE" stroke-width="1.4"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="#B0BEC5" stroke-width="0.8"/>`)
};

// 未知掉落类型的占位宝箱图标（仓库与奖励弹窗共用）
const DROP_CHEST_SVG = '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="4" y="10" width="16" height="10" rx="1.5" fill="#7A4B12" stroke="#E8B818" stroke-width="1"/><path d="M4 10 Q12 4 20 10" fill="#9A5C16" stroke="#E8B818" stroke-width="1"/><rect x="10.5" y="8.5" width="3" height="4" rx="0.6" fill="#E8B818"/><rect x="3.4" y="9" width="17.2" height="2.2" rx="1" fill="#E8B818"/></svg>';

window._suppressClick = false;
let rewardModalTimer = null;
let rewardModalOpenTaskId = null;

/* ===== 方舟风格加载动画控制器 ===== */
const ArkLoader = (function() {
    const el = document.getElementById('arkLoader');
    const fill = document.getElementById('arkLoaderFill');
    const pct = document.getElementById('arkLoaderPct');
    if (!el || !fill || !pct) return { progress: function(){}, hide: function(){} };
    let current = 0;
    let target = 0;
    const messages = [
        'INITIALIZING...', 'LOADING RESOURCES...', 'LOADING TASKS...',
        'LOADING ACHIEVEMENTS...', 'RENDERING UI...', 'READY.'
    ];
    let msgIdx = 0;
    const timer = setInterval(function() {
        if (current < target) {
            current = Math.min(current + Math.random() * 8 + 2, target);
            fill.style.width = current + '%';
            const mi = Math.min(msgIdx, messages.length - 1);
            pct.textContent = 'LOADING + ' + Math.floor(current) + '% ... ' + messages[mi];
            if (current > (mi + 1) * 18) msgIdx++;
        }
    }, 50);
    return {
        progress: function(p, msg) { target = p; if (msg) { pct.textContent = msg; msgIdx++; } },
        hide: function() {
            target = 100;
            setTimeout(function() {
                clearInterval(timer);
                fill.style.width = '100%';
                pct.textContent = 'LOADING + 100% ... READY.';
                setTimeout(function() { el.classList.add('fade-out'); }, 200);
                setTimeout(function() { el.style.display = 'none'; }, 900);
            }, 300);
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    ArkLoader.progress(5, 'INITIALIZING...');
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
    DOM.filterTrack = document.getElementById('filterTrack');
    DOM.filterCategory = document.getElementById('filterCategory');
    DOM.filterTracked = document.getElementById('filterTracked');
    DOM.filterSearch = document.getElementById('filterSearch');
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
    DOM.levelUpLevel = document.getElementById('levelUpLevel');
    DOM.levelUpOldLevel = document.getElementById('levelUpOldLevel');
    DOM.levelUpSparks = document.getElementById('levelUpSparks');
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
    DOM.warehouseBtn = document.getElementById('warehouseBtn');
    DOM.resStone = document.getElementById('resStone');
    DOM.resLungmen = document.getElementById('resLungmen');
    DOM.resOrundum = document.getElementById('resOrundum');
    DOM.resSanityCurrent = document.getElementById('resSanityCurrent');
    DOM.resSanityMax = document.getElementById('resSanityMax');
    DOM.resourceTimestamp = document.getElementById('resourceTimestamp');
    DOM.mobileMenuBtn = document.getElementById('mobileMenuBtn');
    DOM.dateTasksModal = document.getElementById('dateTasksModal');
    DOM.dateTasksTitle = document.getElementById('dateTasksTitle');
    DOM.dateTasksBody = document.getElementById('dateTasksBody');
    DOM.dateTasksClose = document.getElementById('dateTasksClose');
    DOM.exchangeBtn = document.getElementById('exchangeBtn');
    DOM.exchangeModal = document.getElementById('exchangeModal');
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
    DOM.operatorGachaBtn = document.getElementById('operatorGachaBtn');
    // R20：干员寻访独立成视图，不再有弹窗（这里保留字段只为兼容旧引用）
    DOM.operatorGachaModal = document.getElementById('operatorGachaModal');
    DOM.operatorGachaClose = document.getElementById('operatorGachaClose');
    DOM.shopTabBar = document.getElementById('shopTabBar');
    DOM.shopPanels = document.querySelectorAll('#view-shop .pc-panel');
    DOM.profileMedalEntry = document.getElementById('profileMedalEntry');
    DOM.profileMedalCount = document.getElementById('profileMedalCount');
    DOM.profilePackEntry = document.getElementById('profilePackEntry');
    DOM.profileSkinEntry = document.getElementById('profileSkinEntry');
    DOM.profileRealityEntry = document.getElementById('profileRealityEntry');
    DOM.profileGachaEntry = document.getElementById('profileGachaEntry');
    DOM.packBalance = document.getElementById('packBalance');
    DOM.operatorGachaSingle = document.getElementById('operatorGachaSingle');
    DOM.operatorGachaTen = document.getElementById('operatorGachaTen');
    DOM.operatorGachaOrundumBalance = document.getElementById('operatorGachaOrundumBalance');
    DOM.operatorGachaPity = document.getElementById('operatorGachaPity');
    DOM.operatorGachaResult = document.getElementById('operatorGachaResult');
    DOM.operatorGachaStage = document.getElementById('operatorGachaStage');
    DOM.operatorFeatured = document.getElementById('operatorFeatured');
    DOM.operatorTokenList = document.getElementById('operatorTokenList');
    DOM.skinShopBtn = document.getElementById('skinShopBtn');
    DOM.skinShopModal = document.getElementById('skinShopModal');
    DOM.skinShopClose = document.getElementById('skinShopClose');
    DOM.skinShopList = document.getElementById('skinShopList');
    DOM.skinShopBalance = document.getElementById('skinShopBalance');
    DOM.skinFilterRow = document.getElementById('skinFilterRow');
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
    DOM.taskFormTrack = document.getElementById('taskFormTrack');
    DOM.taskFormCategory = document.getElementById('taskFormCategory');
    DOM.taskFormPlannedStart = document.getElementById('taskFormPlannedStart');
    DOM.taskFormPlannedEnd = document.getElementById('taskFormPlannedEnd');
    DOM.taskFormDueDate = document.getElementById('taskFormDueDate');
    DOM.taskFormRepeatInterval = document.getElementById('taskFormRepeatInterval');
    DOM.taskFormRewardStone = document.getElementById('taskFormRewardStone');
    DOM.taskFormRewardOrundum = document.getElementById('taskFormRewardOrundum');
    DOM.taskFormNotes = document.getElementById('taskFormNotes');
    DOM.pomodoroSound = document.getElementById('pomodoroSound');
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
    initBatchSelection();
    // 预加载仓库素材目录（奖励弹窗与仓库都要用官方中文名/配色）
    loadWarehouseCatalog();
    DOM.settingsBtn.addEventListener('click', openSettingsModal);
    // 专注提醒设置（提示音开关，本地生成无需联网）
    if (DOM.pomodoroSound) DOM.pomodoroSound.addEventListener('change', async (e) => {
        const val = e.target.value;
        await apiPut('/settings', { pomodoro_sound: val });
        state.settings.pomodoro_sound = val;
        showToast('提示音设置已更新');
    });

    DOM.trackingHandle.addEventListener('click', () => {
        const wasExpanded = DOM.trackingPanel.classList.contains('expanded');
        // 展开与收起使用完全一致的反馈：:active 按压 + 同一段图标柔光脉冲。
        // 不再挂 transitionend（过渡被打断时一边有一边没有，导致两向反馈不一致），
        // 点击瞬间立即播放，两个方向强度相同。
        DOM.trackingHandle.classList.remove('pop-right', 'shake-icon', 'locked');
        void DOM.trackingHandle.offsetWidth;
        DOM.trackingHandle.classList.add('locked');
        DOM.trackingHandle.addEventListener('animationend', () => DOM.trackingHandle.classList.remove('locked'), { once: true });
        if (wasExpanded) {
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
    DOM.filterTrack.addEventListener('change', applyFilters);
    DOM.filterTracked.addEventListener('change', applyFilters);
    DOM.filterCategory.addEventListener('change', onCategoryFilterChange);
    DOM.filterSearch.addEventListener('input', debounce(applyFilters, 300));
    DOM.showArchived.addEventListener('change', applyFilters);
    DOM.showDeleted.addEventListener('change', applyFilters);

    // 初始化自定义下拉（替换原生 select，避免浏览器下拉闪白 + 支持动画）
    initCustomDropdowns();

    // 物理反馈：切换瞬间给滑块打上 .toggle-pop 播放"咔哒"发光脉冲，动画结束后移除
    [DOM.showArchived, DOM.showDeleted].forEach(el => {
        el.addEventListener('change', () => {
            el.classList.remove('toggle-pop');
            void el.offsetWidth;  // 强制回流，确保重复切换也能重播动画
            el.classList.add('toggle-pop');
            el.addEventListener('animationend', () => el.classList.remove('toggle-pop'), { once: true });
        });
    });

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

    DOM.exchangeBtn.addEventListener('click', () => {
        openModal('exchangeModal');
        if (DOM.exchangeAmount) DOM.exchangeAmount.value = 1;
        updateExchangeBalance(); updateExchangeCost(); updateExchangeRateText();
    });
    bindExchangeStepper();
    DOM.exchangeCancel.addEventListener('click', closeAllModals);
    DOM.exchangeClose.addEventListener('click', closeAllModals);
    DOM.exchangeConfirm.addEventListener('click', handleExchange);
    DOM.exchangeAmount.addEventListener('input', updateExchangeCost);
    // 兑换规则说明：默认收起，点 ⓘ 才展开（和寻访弹窗同一套交互）
    const exInfoBtn = document.getElementById('exchangeInfoBtn');
    const exInfoPanel = document.getElementById('exchangeInfoPanel');
    if (exInfoBtn && exInfoPanel) {
        exInfoBtn.addEventListener('click', e => {
            e.stopPropagation();
            exInfoPanel.classList.toggle('open');
            exInfoBtn.classList.toggle('active', exInfoPanel.classList.contains('open'));
        });
    }

    DOM.gachaBtn.addEventListener('click', () => { openModal('gachaModal'); updateGachaBalance(); updateGachaCostText(); });
    if (DOM.warehouseBtn) DOM.warehouseBtn.addEventListener('click', openWarehouse);

    DOM.gachaCancel.addEventListener('click', closeAllModals);
    DOM.gachaClose.addEventListener('click', closeAllModals);
    DOM.gachaConfirm.addEventListener('click', handleGacha);
    DOM.gachaCloseHint.addEventListener('click', closeAllModals);

    // 干员寻访（抽卡）
    if (DOM.operatorGachaBtn) DOM.operatorGachaBtn.addEventListener('click', openOperatorGacha);
    if (DOM.operatorGachaClose) DOM.operatorGachaClose.addEventListener('click', closeAllModals);
    DOM.operatorGachaSingle.addEventListener('click', () => handleOperatorGacha(1));
    DOM.operatorGachaTen.addEventListener('click', () => handleOperatorGacha(10));
    // 整套演出支持点击跳过
    const gachaStageEl = document.getElementById('ghStage');
    if (gachaStageEl) gachaStageEl.addEventListener('click', ghSkipShow);
    // 概率详情同样收进 ⓘ
    const ghInfoBtn = document.getElementById('operatorGachaInfoBtn');
    const ghInfoPanel = document.getElementById('operatorGachaInfoPanel');
    if (ghInfoBtn && ghInfoPanel) {
        ghInfoBtn.addEventListener('click', e => {
            e.stopPropagation();
            ghInfoPanel.classList.toggle('open');
            ghInfoBtn.classList.toggle('active', ghInfoPanel.classList.contains('open'));
        });
    }

    // 时装商店
    if (DOM.skinShopBtn) DOM.skinShopBtn.addEventListener('click', openSkinShop);
    if (DOM.skinShopClose) DOM.skinShopClose.addEventListener('click', closeAllModals);
    // 右下角的「关闭」已去掉：右上角 ✕、ESC、点空白处都能退出，不需要第三个入口
    // 定价说明收进 ⓘ 按钮：默认不显示，点开才展开
    const skinInfoBtn = document.getElementById('skinShopInfoBtn');
    const skinInfoPanel = document.getElementById('skinShopInfoPanel');
    if (skinInfoBtn && skinInfoPanel) {
        skinInfoBtn.addEventListener('click', e => {
            e.stopPropagation();
            const open = skinInfoPanel.classList.toggle('open');
            skinInfoBtn.classList.toggle('active', open);
        });
    }
    if (DOM.skinFilterRow) DOM.skinFilterRow.addEventListener('click', e => {
        const btn = e.target.closest('.skin-filter-btn');
        if (!btn) return;
        DOM.skinFilterRow.querySelectorAll('.skin-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        skinFilter = btn.dataset.rarity;
        renderSkins();
    });

    DOM.pomodoroStopBtn.addEventListener('click', stopPomodoro);

    /* R20：采购中心内部标签切换 */
    if (DOM.shopTabBar) DOM.shopTabBar.addEventListener('click', e => {
        const btn = e.target.closest('.pc-tab');
        if (!btn) return;
        switchShopTab(btn.dataset.tab);
        if (btn.dataset.tab === 'skin') loadSkins();
    });
    /* R20：主页的四个入口卡片 —— 直接跳到采购中心对应子页 / 寻访视图 */
    if (DOM.profileMedalEntry) DOM.profileMedalEntry.addEventListener('click', () => { switchView('shop'); switchShopTab('medal'); });
    if (DOM.profilePackEntry)  DOM.profilePackEntry.addEventListener('click',  () => { switchView('shop'); switchShopTab('pack'); });
    if (DOM.profileSkinEntry)  DOM.profileSkinEntry.addEventListener('click',  () => { switchView('shop'); switchShopTab('skin'); loadSkins(); });
    if (DOM.profileRealityEntry) DOM.profileRealityEntry.addEventListener('click', () => { switchView('shop'); switchShopTab('reality'); });
    if (DOM.profileGachaEntry) DOM.profileGachaEntry.addEventListener('click', () => switchView('gacha'));

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
    DOM.graphSvg.addEventListener('touchstart', startGraphDrag, { passive: false });
    document.addEventListener('mousemove', moveGraphDrag);
    document.addEventListener('touchmove', moveGraphDrag, { passive: false });
    document.addEventListener('mouseup', endGraphDrag);
    document.addEventListener('touchend', endGraphDrag);

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
                DOM.mainContent.style.marginLeft = '64px';
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

/* ===== 资源图标：本地 PNG 真图自动替换（把对应 PNG 放进 static/icons/ 即自动生效）===== */
function tryUpgradeResIcon(span, name){
    if(!span || span.dataset.resUpgraded) return;
    span.dataset.resUpgraded = '1';
    const img = new Image();
    img.alt = name;
    img.onload = () => { span.innerHTML = ''; span.appendChild(img); };
    img.onerror = () => {};
    img.src = `static/icons/${name}.png`;
}
function upgradeAllResIcons(){
    // 顶部栏（data-res-icon）
    document.querySelectorAll('[data-res-icon]').forEach(s => tryUpgradeResIcon(s, s.dataset.resIcon));
    // 主页面板（data-res-icon-profile）—— 之前漏选导致主页图标永远不升级
    document.querySelectorAll('[data-res-icon-profile]').forEach(s => tryUpgradeResIcon(s, s.dataset.resIconProfile));
}
// 用共享 RESOURCE_SVGS 填充顶部栏和主页面板的资源图标（替代原先各处内联的旧版 SVG）
function renderResourceIcons(){
    // 顶部栏资源图标（data-res-icon）
    document.querySelectorAll('.resource-icon[data-res-icon]').forEach(span => {
        const key = span.dataset.resIcon;
        if(RESOURCE_SVGS[key] && !span.dataset.resRendered){
            span.innerHTML = RESOURCE_SVGS[key];
            span.dataset.resRendered = '1';
        }
    });
    // 主页面板资源图标（data-res-icon-profile）
    document.querySelectorAll('.res-icon[data-res-icon-profile]').forEach(span => {
        const key = span.dataset.resIconProfile;
        if(RESOURCE_SVGS[key] && !span.dataset.resRendered){
            span.innerHTML = RESOURCE_SVGS[key];
            span.dataset.resRendered = '1';
        }
    });
}

/* ===== 版本号：由后端从 Git 自动生成（vYY.MM.DD.提交数），不再写死 V1.0 =====
   顶栏、启动画面两处共用同一个值。 */
async function loadAppVersion(){
    const info = await apiGet('/version');
    if (!info || !info.version) return;
    const label = document.getElementById('logoVersion');
    if (label){
        label.textContent = info.version;
        label.title = `构建 ${info.build} · ${info.commit}\n${info.date}${info.subject ? ' · ' + info.subject : ''}`;
    }
    const boot = document.getElementById('bootVersion');
    if (boot) boot.textContent = `${info.version} // LOCAL`;
    document.documentElement.dataset.appVersion = info.version;
}

async function initApp() {
    loadAppVersion();                 // 版本号不阻塞首屏
    await loadSettings();
    await loadVoiceManifest();
    ArkLoader.progress(15, 'LOADING SETTINGS...');
    applyTheme();
    applyWallpaper();
    await loadResources();
    ArkLoader.progress(30, 'LOADING RESOURCES...');
    await loadTasks();
    ArkLoader.progress(50, 'LOADING TASKS...');
    renderCategoryFilter();
    await loadAchievements();
    ArkLoader.progress(65, 'LOADING ACHIEVEMENTS...');
    await loadGiftPacks();
    await loadTransactions();
    await loadRealityRewards();
    await checkCurrentTracking();
    await loadPomodoroCurrent();
    renderCalendar();
    updateResourceDisplay();
    renderResourceIcons();
    upgradeAllResIcons();
    updateUserInfo();
    updateClaimAllButton();
    applySettingsFromState();
    updateGachaCostText();
    ArkLoader.progress(85, 'RENDERING UI...');
    setInterval(updateTrackingTimer, 1000);
    setInterval(updatePomodoroTimer, 1000);
    updateResourceTimestamp();
    setInterval(updateResourceTimestamp, 30000);
    initBackgroundParticles();
    initRemoteUrl();  // 远程地址轮询
    // R20：支持 #shop / #gacha 这类深链，打开就能直接落在对应视图
    const hashView = (location.hash || '').replace('#', '');
    if (['tasks','graph','calendar','gacha','shop','profile'].includes(hashView)) {
        state.currentView = hashView;
    }
    document.body.dataset.view = state.currentView;
    renderCurrentView();
    ArkLoader.hide();
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
    else if (view === 'gacha') { updateOperatorGachaBalance(); loadOperatorRecords(); }
    else if (view === 'shop') renderShopPanel();
    else if (view === 'profile') { updateResourceDisplay(); renderProfileBadges(); renderProfileMedalCount(); renderTransactions(); }
}

/* ===== 采购中心：内部视图切换 ===== */
let shopTab = 'medal';
function switchShopTab(tab){
    shopTab = tab;
    if (DOM.shopTabBar) DOM.shopTabBar.querySelectorAll('.pc-tab')
        .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (DOM.shopPanels) DOM.shopPanels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    renderShopPanel();
}
function renderShopPanel(){
    if (shopTab === 'medal')   { renderAchievements(); updateShopMedalNote(); }
    if (shopTab === 'reality') renderRealityRewards();
    if (shopTab === 'pack')    { renderGiftPacks(); updatePackBalance(); }
    if (shopTab === 'skin')    renderSkins();
}
function updateShopMedalNote(){
    const el = document.getElementById('shopMedalNote'); if (!el) return;
    const total = state.achievements.length || 0;
    const got = (state.unlockedAchievements || []).length;
    el.textContent = `已解锁 ${got} / ${total}`;
}
function updatePackBalance(){
    if (!DOM.packBalance) return;
    DOM.packBalance.innerHTML = resAmountHTML('source_stone', state.resources.source_stone?.current_value || 0);
}
function renderProfileMedalCount(){
    if (!DOM.profileMedalCount) return;
    const total = state.achievements.length || 0;
    const got = (state.unlockedAchievements || []).length;
    DOM.profileMedalCount.textContent = `${got} / ${total} 枚已解锁`;
}

/* ── 网络错误统一处理 ────────────────────────────────────────────
   后端没起来时，浏览器抛的是原生 "Failed to fetch"，直接 toast 会满屏英文。
   这里统一换成中文，并且同一时间只提示一次（避免十几个请求刷十几条）。 */
let _offlineToastAt = 0;
function isNetworkError(err) {
    return !!(err && (err.name === 'TypeError' || /failed to fetch|networkerror|network request failed/i.test(err.message || '')));
}
function reportApiError(err, fallback) {
    console.error(err);
    if (isNetworkError(err)) {
        const now = Date.now();
        if (now - _offlineToastAt > 15000) {
            _offlineToastAt = now;
            showToast('连不上后端服务 —— 请先运行「一键启动.bat」再刷新页面', 4200);
        }
        return;
    }
    showToast((err && err.message) || fallback || '请求失败');
}

async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { cache: 'no-store' });
        if (!res.ok) {
            let message = `API ${endpoint} failed`;
            try { const errData = await res.json(); message = errData?.message || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        return json.data ?? json;
    } catch (err) {
        reportApiError(err, '请求失败');
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

function showToast(msg, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
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
        /* R20：蚀刻章网格现在在「采购中心 · 蚀刻章」里，只在该子页可见时才重绘 */
        if (state.currentView === 'shop' && shopTab === 'medal') renderAchievements();
        renderProfileBadges();
        renderProfileMedalCount();
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
        if (state.currentView === 'shop' && shopTab === 'reality') renderRealityRewards();
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
    // 到点提醒：随机干员语音（无语音文件时回退本地提示音）+ 屏幕高亮
    playEndAlert();
    flashAlarm();
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

// ===== 专注到点提醒（本地生成提示音，无需联网） =====
let alarmAudioCtx = null;
function getAlarmAudioCtx(){
    if (!alarmAudioCtx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        alarmAudioCtx = new AC();
    }
    if (alarmAudioCtx.state === 'suspended') alarmAudioCtx.resume();
    return alarmAudioCtx;
}
// 三声「叮咚」闹钟音：高音量、双频，确保够「响」又不刺耳
function playAlarmSound(){
    if ((state.settings.pomodoro_sound || 'on') === 'off') return;
    const ctx = getAlarmAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [ {f:880, t:0}, {f:1175, t:0.45}, {f:880, t:0.9} ];
    notes.forEach(({f, t}) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.5, now + t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.42);
    });
}
// 屏幕金色高亮闪动，强化「到点了」的视觉提醒
function flashAlarm(){
    const el = document.createElement('div');
    el.className = 'alarm-flash';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1900);
}

// ===== 到点随机语音（干员日语「完成任务」语音，PRTS 下载到 static/sounds/arkanights/） =====
// manifest.json 由下载脚本生成；为空或缺失时回退到本地合成提示音。
let voiceFiles = [];
async function loadVoiceManifest(){
    try {
        const res = await fetch('static/sounds/arkanights/manifest.json', { cache: 'no-cache' });
        if (!res.ok) { voiceFiles = []; return; }
        const data = await res.json();
        voiceFiles = Array.isArray(data.files) ? data.files : [];
        console.log(`[voice] 已加载 ${voiceFiles.length} 条到点语音`);
    } catch(e) { voiceFiles = []; }
}
// 到点提醒主入口：有语音则随机放一条，否则合成「叮咚」
function playEndAlert(){
    if ((state.settings.pomodoro_sound || 'on') === 'off') return;
    if (voiceFiles.length){
        const url = voiceFiles[Math.floor(Math.random() * voiceFiles.length)];
        try {
            const a = new Audio(url);
            a.volume = 1.0;
            const p = a.play();
            if (p && p.catch) p.catch(() => playAlarmSound());
            return;
        } catch(e) { /* 落到合成音 */ }
    }
    playAlarmSound();
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
    // 记录当前筛选下可见的任务（供批量选择的「全选」使用）
    state.visibleIds = new Set(filtered.map(t => t.id));
    if (filtered.length === 0) {
        DOM.taskListEmpty.style.display = 'block';
    } else {
        DOM.taskListEmpty.style.display = 'none';
        appendTaskGroups(list, filtered);
    }
    // 长线战役独立区域：显示 track=campaign 的任务作为方向指引
    renderCampaignSection();
    updateClaimAllButton();
    enableDragSort();
    // 若处于选择模式，重渲染后同步勾选框与选中态（不重新触发进入动画）
    if (state.selectionMode) { applySelectionModeToDOM(true); updateBatchToolbar(); }
}

// 渲染长线战役（方向指引）独立区域
function renderCampaignSection() {
    const section = DOM.campaignSection;
    const list = DOM.campaignList;
    if (!section || !list) return;
    // 筛选出所有 campaign 任务（不受当前 filter.track 影响）
    const campaignTasks = state.flatTasks.filter(t =>
        (t.track || 'daily') === 'campaign' && !t.archived && !t.deleted
    );
    if (campaignTasks.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    list.innerHTML = '';

    const childrenOf = (t) => campaignTasks.filter(c => c.parent_id === t.id);

    // 生成单张战役卡片：每一层级都带展开/收起按钮，与主任务列表的父子展开行为保持一致
    const buildCard = (task, isRoot, depth) => {
        const children = childrenOf(task);
        // 展开状态：根级保持默认展开（与改动前一致），子任务层级默认收起；展开过的记在 expandedCampaigns
        const isCollapsed = state.collapsedCampaigns.has(task.id);
        const isExpanded = isCollapsed ? false : (state.expandedCampaigns.has(task.id) || depth < 1);
        const card = document.createElement('div');
        card.className = isRoot ? 'campaign-card' : 'campaign-child-card';
        card.dataset.taskId = task.id;

        // 展开/收起按钮：无子任务时保留同宽占位，保证同层级标题/星级左对齐
        const expandBtn = document.createElement('button');
        expandBtn.className = isRoot ? 'campaign-expand-btn' : 'campaign-child-expand-btn';
        if (children.length > 0) {
            expandBtn.innerHTML = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
            expandBtn.title = isExpanded ? '收起子任务' : '展开子任务';
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isExpanded) {
                    state.collapsedCampaigns.add(task.id);
                    state.expandedCampaigns.delete(task.id);
                } else {
                    state.collapsedCampaigns.delete(task.id);
                    state.expandedCampaigns.add(task.id);
                }
                renderCampaignSection();
            });
        } else {
            expandBtn.classList.add('is-empty');
            expandBtn.disabled = true;
            expandBtn.tabIndex = -1;
        }
        card.appendChild(expandBtn);

        // 星级
        const stars = document.createElement('div');
        stars.className = isRoot ? 'campaign-stars' : 'campaign-child-stars';
        stars.innerHTML = goldStars(Math.min(task.priority, 6));
        stars.title = `优先级 ${task.priority}`;
        card.appendChild(stars);

        // 标题（可点击打开详情）
        const title = document.createElement('div');
        title.className = isRoot ? 'campaign-title' : 'campaign-child-title';
        title.textContent = task.title;
        title.addEventListener('click', () => openTaskDetail(task.id));
        card.appendChild(title);

        if (isRoot) {
            // 描述
            if (task.description) {
                const desc = document.createElement('div');
                desc.className = 'campaign-desc'; desc.textContent = task.description;
                card.appendChild(desc);
            }
            // 子任务数量标签
            if (children.length > 0) {
                const badge = document.createElement('span');
                badge.className = 'campaign-child-count';
                badge.textContent = `${children.length} 个子任务`;
                card.appendChild(badge);
            }
        } else if (task.status) {
            // 子任务状态
            const cStatus = document.createElement('span');
            cStatus.className = 'campaign-child-status';
            const statusMap = {todo:'待办',in_progress:'进行中',paused:'已暂停',done:'已完成',cancelled:'已取消'};
            cStatus.textContent = statusMap[task.status] || task.status;
            card.appendChild(cStatus);
        }

        card.appendChild(buildCampaignActions(task));
        return { card, children, isExpanded };
    };

    // 递归渲染：卡片 + 其子任务容器
    const renderNode = (task, isRoot, depth, container) => {
        const { card, children, isExpanded } = buildCard(task, isRoot, depth);
        container.appendChild(card);
        if (children.length > 0 && isExpanded) {
            const childList = document.createElement('div');
            childList.className = 'campaign-children';
            children.forEach(child => renderNode(child, false, depth + 1, childList));
            container.appendChild(childList);
        }
    };

    // 只显示根级 campaign 任务
    const rootCampaigns = campaignTasks.filter(t => !t.parent_id || !campaignTasks.some(c => c.id === t.parent_id));
    rootCampaigns.forEach(task => renderNode(task, true, 0, list));
}

// 长线战役卡片的操作按钮：追踪 / 编辑 / 删除 / 归档(复用与常规任务卡片一致的处理函数)
function buildCampaignActions(task) {
    const actions = document.createElement('div');
    actions.className = 'campaign-actions';
    if (state.settings.quick_track) {
        const trackBtn = document.createElement('button');
        trackBtn.className = `action-btn track-btn ${state.trackingTaskId === task.id ? 'active' : ''}`;
        trackBtn.innerHTML = '<i class="fa-solid fa-diamond"></i>';
        trackBtn.title = '追踪';
        trackBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTrackingForTask(task.id); });
        actions.appendChild(trackBtn);
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
    return actions;
}

function toggleCollapse(id){
    if (state.collapsedTasks.has(id)) state.collapsedTasks.delete(id);
    else state.collapsedTasks.add(id);
    renderTasks();
}

function appendTaskGroups(list, filtered) {
    const filteredIds = new Set(filtered.map(t => t.id));
    const added = new Set();
    const collectDescendants = (task) => {
        let result = [task];
        if (state.collapsedTasks.has(task.id)) return result;
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
    if (state.filter.track) filtered = filtered.filter(t => (t.track || 'daily') === state.filter.track);
    if (state.filter.tracked !== '') filtered = filtered.filter(t => t.is_tracked == state.filter.tracked);
    if (state.filter.search) {
        const q = state.filter.search.toLowerCase();
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(q) ||
            (t.description && t.description.toLowerCase().includes(q)) ||
            (t.tags && t.tags.some(tag => tag.name.toLowerCase().includes(q)))
        );
    }
    if (state.filter.category) {
        filtered = filtered.filter(t => (t.tags || []).some(tag => tag.name === state.filter.category));
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
/* ===== 星级渲染（全局统一） =====
   明日方舟的稀有度只有「数量」差异，星星一律金色、单颗倾斜。
   以前按 3绿/4蓝/5紫/6金 分色，视觉上很花；现在统一成一条金色斜星。
   返回 HTML 字符串，直接拼进模板即可。 */
function goldStars(rarity, extraClass = '') {
    const n = Math.max(0, Math.min(6, parseInt(rarity, 10) || 0));
    const cls = 'g-star' + (extraClass ? ' ' + extraClass : '');
    let html = '';
    for (let i = 0; i < n; i++) html += `<i class="${cls}"></i>`;
    return `<span class="g-stars">${html}</span>`;
}

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
    card.draggable = !isBlocked(task) && task.status !== 'done' && !state.selectionMode;
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

    /* 可领取 = 已完成 + 奖励还没领 + 确实有奖励。
       这类卡片本身就是「领取按钮」：点卡片上任何非按钮区域即领奖，
       不再单独摆一个「领取奖励」按钮（它左侧还带着一颗没人看得懂的小菱形）。 */
    const claimable = task.status === 'done' && !task.reward_claimed && hasActualReward(task);

    if (claimable) {
        card.classList.add('claimable');
        const claimBadge = document.createElement('div');
        claimBadge.className = 'task-claim-badge';
        claimBadge.innerHTML = '<i class="fa-solid fa-gift"></i><span>可领取</span>';
        card.appendChild(claimBadge);
    }
    /* 已完成且奖励已领：不放任何角标。
       R19 用户明确要求去掉右上角那个绿色对勾 —— 原来的 completed 版本
       （标题删除线 + 整卡压暗，见 .task-card.status-done）就已经足够表意。 */

    // 批量选择模式：卡片左侧显示圆形勾选框
    if (state.selectionMode) {
        card.classList.add('selecting');
        if (state.selectedIds.has(task.id)) card.classList.add('selected');
        const chk = document.createElement('div');
        chk.className = 'select-checkbox' + (state.selectedIds.has(task.id) ? ' checked' : '');
        chk.innerHTML = '<i class="fa-solid fa-check"></i>';
        card.appendChild(chk);
    }

    const indent = document.createElement('div');
    indent.className = `task-indent task-indent-level-${task.level || 0}`;
    if (task.level > 0) {
        const connector = document.createElement('div');
        connector.className = 'tree-connector';
        indent.appendChild(connector);
    }
    card.appendChild(indent);

    /* 左侧分级色条 .task-colorbar 已移除（R19）：原版任务卡左边没有这条竖带，
       是我 R17 多加的。分级表达全部交给星星下面的 .star-bg.priority-N 底板。 */

    const main = document.createElement('div');
    main.className = 'task-main';
    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';
    // 星级徽章原先独占一行（36px 高 + 8px 下边距），现改为与标题同行，直接省掉一整行高度
    const stars = document.createElement('div');
    stars.className = 'task-stars';
    /* 星级底板 = 用户说的「星星下面的背景色条」：
       星星本身仍然一律金色（只靠数量表达强度），但底板按星级换色 ——
       1★~6★ 各一套渐变，规则在 style.css 的 .star-bg.priority-N。
       ⚠️ 这段类名不能丢：e71cdb7「全站金星统一」时把 priority-N 摘掉了，
       于是底板退成一块中性玻璃、色条消失（R15~R17 一直没找回来）。 */
    const starBg = document.createElement('div');
    starBg.className = `star-bg priority-${task.priority}`;
    starBg.innerHTML = goldStars(task.priority);
    stars.appendChild(starBg);
    stars.title = `优先级 ${task.priority}`;
    topRow.appendChild(stars);
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    if (task.children && task.children.length) {
        const collapsed = state.collapsedTasks.has(task.id);
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'task-collapse-btn';
        collapseBtn.innerHTML = collapsed ? '<i class="fa-solid fa-chevron-right"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
        collapseBtn.title = collapsed ? '展开子任务' : '折叠子任务';
        collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapse(task.id); });
        topRow.appendChild(collapseBtn);
    } else {
        // 子任务没有折叠箭头 —— 但必须占住同样的宽度，
        // 否则父任务标题和子任务标题会错开一格的宽度（看起来"缩进不整齐"的元凶之一）
        const spacer = document.createElement('span');
        spacer.className = 'task-collapse-spacer';
        topRow.appendChild(spacer);
    }
    topRow.appendChild(title);
    const lineTag = document.createElement('span');
    lineTag.className = `task-line-tag ${task.task_line}`;
    lineTag.textContent = task.task_line === 'main' ? '主线' : '支线';
    topRow.appendChild(lineTag);
    const trackTag = document.createElement('span');
    trackTag.className = `task-track-tag ${task.track || 'daily'}`;
    const trackIcon = document.createElement('i');
    trackIcon.className = (task.track === 'campaign') ? 'fa-solid fa-trophy' : 'fa-solid fa-list-check';
    trackTag.appendChild(trackIcon);
    trackTag.appendChild(document.createTextNode((task.track === 'campaign') ? ' 主线战役' : ' 日常'));
    topRow.appendChild(trackTag);
    // 稀有度框（优先级 → 方舟素材稀有度边框：1→r6金 / 2→r5 / 3→r4 / 4→r3 / 5→r2 / 6→r1）
    // 稀有度框已移除：星级（★）已是优先级的直观展示，圆形角标与卡片风格冲突
    main.appendChild(topRow);
    // 描述与分类标签放进独立的「元信息行」：两者固定同一行、互不换行，
    // 描述超长时省略号截断，标签恒定贴在该行右侧，避免长描述把标签挤到下一行造成凌乱。
    const metaRow = document.createElement('div');
    metaRow.className = 'task-meta-row';
    if (task.description) {
        const desc = document.createElement('div');
        desc.className = 'task-desc';
        desc.textContent = task.description;
        desc.title = task.description;
        metaRow.appendChild(desc);
    }
    if (task.tags && task.tags.length) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'task-tags';
        const cats = state.settings.categories || [];
        task.tags.forEach(tag => {
            const isCat = cats.includes(tag.name);
            const tagSpan = document.createElement('span');
            if (isCat) {
                tagSpan.className = 'task-category-badge';
                const img = document.createElement('img');
                img.className = 'task-category-icon';
                img.src = 'static/icons/' + categoryIconFile(tag.name);
                img.alt = tag.name;
                img.loading = 'lazy';
                tagSpan.appendChild(img);
                tagSpan.appendChild(document.createTextNode(tag.name));
            } else {
                tagSpan.className = 'task-tag';
                tagSpan.textContent = tag.name;
            }
            tagsDiv.appendChild(tagSpan);
        });
        metaRow.appendChild(tagsDiv);
    }
    if (metaRow.childNodes.length) main.appendChild(metaRow);
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

    // 快捷完成：常驻按钮，不必点开任务详情即可完成
    if (task.status !== 'done' && task.status !== 'cancelled') {
        const quick = document.createElement('div');
        quick.className = 'task-quick';
        const quickDoneBtn = document.createElement('button');
        quickDoneBtn.className = 'quick-complete-btn';
        quickDoneBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        quickDoneBtn.title = '快捷完成';
        quickDoneBtn.setAttribute('aria-label', '快捷完成');
        quickDoneBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window._suppressClick) return;
            completeTaskAndHandleReward(task.id);
        });
        quick.appendChild(quickDoneBtn);
        card.appendChild(quick);
    }

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
    card.addEventListener('click', () => {
        if (window._suppressClick) return;
        if (state.selectionMode) { toggleSelectTask(task); return; }
        // 可领取的卡片：点哪儿都算领奖（按钮/输入框都在上面 stopPropagation 掉了）
        if (claimable) { claimTaskFromCard(task.id, card); return; }
        if (!isBlocked(task)) openTaskDetail(task.id);
    });
    return card;
}

/* ===== 整卡领取奖励 =====
   点完成卡片的任意位置 → 直接发奖 → 把「一共领到了什么」铺成方舟风格圆形资源卡。
   父任务会连同所有已完成子任务一起结算（后端 claim-reward 默认级联，可在设置里关掉）。 */
async function claimTaskFromCard(taskId, cardEl){
    if (state.rewardModalAnimating) return;
    const task = state.flatTasks.find(t => t.id === taskId);
    if (!task || task.reward_claimed) return;
    state.rewardModalAnimating = true;
    cardEl?.classList.add('claiming');
    if (cardEl) { try { spawnParticlesGatherThenFly(cardEl); } catch (e) {} }
    let result = null;
    try { result = await apiPost(`/tasks/${taskId}/claim-reward`); } catch (e) {}
    state.rewardModalAnimating = false;
    if (!result){ showToast('领取失败，请重试'); return; }

    await loadResources(); await loadTransactions(); await loadTasks();
    if (typeof updateTrackingPanel === 'function') updateTrackingPanel();
    try { loadInventory(); } catch (e) {}

    const granted = [];
    const rw = result.rewards || {};
    ['exp', 'lungmen', 'source_stone', 'orundum'].forEach(k => {
        if ((rw[k] || 0) > 0) granted.push({ key: k, amount: rw[k] });
    });
    (result.materials || []).forEach(m => granted.push({ key: m.type, amount: m.amount }));

    if (granted.length){
        showPackRewardModal(granted);
        const titleEl = document.querySelector('#rewardModal .modal-title');
        if (titleEl) titleEl.textContent = (result.claimed_count > 1)
            ? `奖励已领取 · 含 ${result.claimed_count} 个任务`
            : '奖励已领取';
    } else {
        showToast('奖励已领取');
    }
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
    // 图谱只显示「未删除且未归档」的任务；用 == 1 兼容数字/字符串/布尔
    const nodes = state.flatTasks.filter(t => !(t.deleted == 1 || t.deleted === true) && !t.archived);
    // 清理已删除任务的残留坐标缓存，避免脏坐标遗留
    const validIds = new Set(nodes.map(n => n.id));
    Object.keys(state.graphNodePositions).forEach(id => { if (!validIds.has(Number(id))) delete state.graphNodePositions[id]; });
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
    // R20：先按父子关系算好整片森林的坐标，再画（树与树之间会留出空隙）
    _graphLayoutCache = buildGraphTreeLayout(nodes);
    // 每棵树一条极淡的背景带 + 树名 —— 让「这是两棵不同的树」一眼看得出来
    _graphLayoutBands.forEach(band => {
        const bandRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bandRect.setAttribute('x', band.x0); bandRect.setAttribute('y', band.y0);
        bandRect.setAttribute('width', Math.max(10, band.x1 - band.x0));
        bandRect.setAttribute('height', Math.max(10, band.y1 - band.y0));
        bandRect.setAttribute('rx', 12);
        bandRect.setAttribute('fill', 'rgba(255,255,255,0.018)');
        bandRect.setAttribute('stroke', 'rgba(255,255,255,0.055)');
        bandRect.setAttribute('stroke-dasharray', '7 7');
        bandRect.setAttribute('stroke-width', '1');
        g.appendChild(bandRect);
        const bandLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        bandLabel.setAttribute('x', band.x0 + 10); bandLabel.setAttribute('y', band.y0 + 17);
        bandLabel.setAttribute('fill', 'rgba(255,255,255,0.22)');
        bandLabel.setAttribute('font-size', '11');
        bandLabel.setAttribute('letter-spacing', '2');
        bandLabel.textContent = band.title;
        g.appendChild(bandLabel);
    });
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
                    path.dataset.edge = pathId.replace('edge-', '');
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
        rect.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); startNodeDrag(n.id, e); }, { passive: false });
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
        // 星级（固定在卡片上方，紧凑排列：尖角顶凹角）
        if (n.priority > 0) {
            const starCount = Math.min(n.priority, 6);
            const STAR_SPACING = 8; // 紧凑间距：★尖角几乎顶到下一颗凹角
            const starStartX = cx + W/2 - 4;
            const starY = cy - H/2 + 14; // 卡片上方固定位置
            for (let si = 0; si < starCount; si++) {
                const sx = starStartX - si * STAR_SPACING;
                const st = document.createElementNS('http://www.w3.org/2000/svg','text');
                st.setAttribute('x', sx); st.setAttribute('y', starY);
                st.setAttribute('text-anchor','end');
                st.setAttribute('fill','rgba(232,184,24,0.90)'); st.setAttribute('font-size','12');
                st.setAttribute('transform','rotate(15, ' + sx + ', ' + starY + ')');
                st.dataset.taskId = n.id;
                st.classList.add('graph-node-star');
                st.textContent = '★';
                g.appendChild(st);
            }
        }
        // 透明命中层（覆盖整块，便于拖拽/点击）
        const hit = document.createElementNS('http://www.w3.org/2000/svg','rect');
        hit.setAttribute('x', cx - W/2); hit.setAttribute('y', cy - H/2);
        hit.setAttribute('width', W); hit.setAttribute('height', H); hit.setAttribute('rx', rx);
        hit.setAttribute('fill', '#000'); hit.setAttribute('fill-opacity', '0'); hit.setAttribute('stroke', 'none');
        hit.style.pointerEvents = 'all'; hit.style.cursor = 'grab';
        hit.dataset.taskId = n.id;
        hit.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); startNodeDrag(n.id, e); });
        hit.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); startNodeDrag(n.id, e); }, { passive: false });
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

/* ===== 图谱布局：按「父子关系」把森林拆成一棵棵树 =====
   旧算法把所有同层节点塞进同一列、统一行距，不同树的节点会交错紧挨，
   看不出哪几个节点是属于同一条任务线的。
   现在改成：先按 parent_id 还原森林 → 每棵树独占一段连续的纵向带 →
   树与树之间留一段明显空隙，并给每棵树画一条极淡的背景带。 */
let _graphLayoutCache = null;   // { [taskId]: {x,y} }
let _graphLayoutBands = [];     // [{x0,x1,y0,y1,title}]
function buildGraphTreeLayout(nodes) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const children = new Map();
    nodes.forEach(n => {
        if (n.parent_id && byId.has(n.parent_id)) {
            if (!children.has(n.parent_id)) children.set(n.parent_id, []);
            children.get(n.parent_id).push(n);
        }
    });
    children.forEach(arr => arr.sort((a,b) => (a.sort_order||0) - (b.sort_order||0)));
    const roots = nodes
        .filter(n => !n.parent_id || !byId.has(n.parent_id))
        .sort((a,b) => (a.sort_order||0) - (b.sort_order||0));

    const COL = 268;      // 每深入一层的水平间距
    const ROW = 98;       // 树内行距
    const TREE_GAP = 86;  // 树与树之间的留白
    const X0 = 165;
    const layout = {};
    const bands = [];
    let cursorY = 80;

    // 一棵树占多少行 = 它的叶子数
    const measure = (node) => {
        const kids = children.get(node.id) || [];
        if (!kids.length) return 1;
        return kids.reduce((s, k) => s + measure(k), 0);
    };
    const place = (node, depth, slotStart) => {
        const kids = children.get(node.id) || [];
        if (!kids.length) {
            layout[node.id] = { x: X0 + depth * COL, y: cursorY + slotStart * ROW };
            return;
        }
        let off = slotStart;
        kids.forEach(k => { place(k, depth + 1, off); off += measure(k); });
        // 父节点垂直居中于它的孩子们之间（比顶格对齐更像"树"）
        const first = layout[kids[0].id].y;
        const last  = layout[kids[kids.length - 1].id].y;
        layout[node.id] = { x: X0 + depth * COL, y: (first + last) / 2 };
    };

    roots.forEach(root => {
        const rows = Math.max(1, measure(root));
        const y0 = cursorY;
        place(root, 0, 0);
        const y1 = cursorY + rows * ROW;
        let maxDepth = 0;
        const walk = (node, d) => { maxDepth = Math.max(maxDepth, d); (children.get(node.id)||[]).forEach(k => walk(k, d+1)); };
        walk(root, 0);
        bands.push({
            x0: X0 - 120, x1: X0 + maxDepth * COL + 130,
            y0: y0 - 34, y1: y1 - ROW + 34,
            title: root.title || '任务树'
        });
        cursorY = y1 + TREE_GAP;
    });

    // 兜底：任何漏网的节点（理论上不会）按层级堆到末尾
    nodes.forEach(n => {
        if (!layout[n.id]) { layout[n.id] = { x: X0 + (n.level||0) * COL, y: cursorY }; cursorY += ROW; }
    });
    _graphLayoutBands = bands;
    return layout;
}
function getDefaultNodePosition(n, levelMap) {
    const cached = _graphLayoutCache && _graphLayoutCache[n.id];
    if (cached) return cached;
    const lvl = n.level||0;
    const arr = levelMap[lvl] || [n];
    const index = Math.max(0, arr.indexOf(n));
    return { x: 140 + lvl * 250, y: 75 + index * 92 };
}

let dragNodeId = null;
let dragOffsetX = 0, dragOffsetY = 0;
function getLevelMap() {
    const map = {};
    state.flatTasks.filter(t => !(t.deleted == 1 || t.deleted === true) && !t.archived).forEach(n => {
        const lvl = n.level||0;
        if (!map[lvl]) map[lvl] = [];
        map[lvl].push(n);
    });
    Object.values(map).forEach(arr => arr.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
    return map;
}
function getPointer(e) {
    if (e.touches && e.touches.length > 0) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
    return e;
}
function isTouchEvent(e) { return !!(e.touches || e.changedTouches); }

let dragNodeTouchStart = null;

function startNodeDrag(id, e) {
    dragNodeId = id;
    const p = getPointer(e);
    if (isTouchEvent(e)) dragNodeTouchStart = { x: p.clientX, y: p.clientY, t: Date.now(), id };
    const svgRect = DOM.graphSvg.getBoundingClientRect();
    const viewBox = state.graphViewBox;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    const mouseX = (p.clientX - svgRect.left) * scaleX + viewBox.x;
    const mouseY = (p.clientY - svgRect.top) * scaleY + viewBox.y;
    const nodePos = state.graphNodePositions[id] || getDefaultNodePosition(state.flatTasks.find(t=>t.id===id), getLevelMap());
    dragOffsetX = mouseX - nodePos.x;
    dragOffsetY = mouseY - nodePos.y;
    if (isTouchEvent(e)) {
        document.addEventListener('touchmove', onNodeDrag, { passive: false });
        document.addEventListener('touchend', endNodeDrag);
    } else {
        document.addEventListener('mousemove', onNodeDrag);
        document.addEventListener('mouseup', endNodeDrag);
    }
}
function onNodeDrag(e) {
    if (!dragNodeId) return;
    if (isTouchEvent(e)) e.preventDefault();
    const p = getPointer(e);
    const svgRect = DOM.graphSvg.getBoundingClientRect();
    const viewBox = state.graphViewBox;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    const mouseX = (p.clientX - svgRect.left) * scaleX + viewBox.x;
    const mouseY = (p.clientY - svgRect.top) * scaleY + viewBox.y;
    const newX = mouseX - dragOffsetX;
    const newY = mouseY - dragOffsetY;
    state.graphNodePositions[dragNodeId] = { x: newX, y: newY };
    // 直接移动DOM元素（通过 data-task-id 查找），不调用renderGraph避免重算viewBox
    const W = 170, H = 60;
    const g = DOM.graphSvg.querySelector('g');
    if (g) {
        // ★★★ 拖拽时星星定位必须与 renderGraph 第1750-1766行完全一致 ★★★
        // 渲染逻辑：从卡片右边缘往左排、text-anchor=end、Y=cy-H/2+14
        g.querySelectorAll(`[data-task-id="${dragNodeId}"]`).forEach(el => {
            if (el.tagName === 'rect') {
                el.setAttribute('x', newX - W/2);
                el.setAttribute('y', newY - H/2);
            } else if (el.tagName === 'text') {
                const isLabel = el.classList.contains('graph-label');
                const isStar = el.classList.contains('graph-node-star');
                if (isStar) {
                    // 与渲染完全一致：从右侧往左、间距8、Y偏移14
                    const STAR_SPACING = 8;
                    const starStartX = newX + W/2 - 4;
                    const starY = newY - H/2 + 14;
                    // 用 DOM 顺序确定这是第几颗星（渲染时从第0颗到starCount-1）
                    // 渲染是 for(si=0; si<starCount; si++) → sx = starStartX - si*SPACING
                    // 所以第0颗在最右边，DOM顺序=渲染顺序
                    const allStars = Array.from(g.querySelectorAll(`[data-task-id="${dragNodeId}"].graph-node-star`));
                    const si = allStars.indexOf(el);
                    const sx = starStartX - si * STAR_SPACING;
                    el.setAttribute('x', sx);
                    el.setAttribute('y', starY);
                    el.setAttribute('transform', 'rotate(15, ' + sx + ', ' + starY + ')');
                } else if (isLabel) {
                    el.setAttribute('x', newX - W/2 + 14);
                    el.setAttribute('y', newY - 3);
                } else {
                    el.setAttribute('x', newX - W/2 + 14);
                    el.setAttribute('y', newY + 15);
                }
            }
        });
    }
    updateGraphEdges(dragNodeId);
}
function endNodeDrag(e) {
    if (dragNodeId && dragNodeTouchStart) {
        const p = getPointer(e);
        const dx = p.clientX - dragNodeTouchStart.x;
        const dy = p.clientY - dragNodeTouchStart.y;
        const dt = Date.now() - dragNodeTouchStart.t;
        // 轻触（位移<10px、时长<300ms）视为打开详情，因为 touchstart 已 preventDefault，
        // 浏览器不会触发 click，需要手动兜底。
        if (Math.sqrt(dx*dx + dy*dy) < 10 && dt < 300) {
            openTaskDetail(dragNodeTouchStart.id);
        }
    }
    if (dragNodeId) {
        // 拖拽结束后标记用户操作，并刷新连线（边的起点/终点坐标需要更新）
        state.graphUserPanned = true;
        renderGraph();  // 只在结束时重绘一次，更新边的位置
    }
    dragNodeId = null;
    dragNodeTouchStart = null;
    document.removeEventListener('mousemove', onNodeDrag);
    document.removeEventListener('mouseup', endNodeDrag);
    document.removeEventListener('touchmove', onNodeDrag);
    document.removeEventListener('touchend', endNodeDrag);
}
function updateGraphEdges(nodeId) {
    const g = DOM.graphSvg.querySelector('g');
    if (!g || !nodeId) return;
    const lm = getLevelMap();
    g.querySelectorAll('.graph-edge').forEach(path => {
        const edge = path.dataset.edge;
        if (!edge) return;
        const parts = edge.split('-');
        if (parts.length < 2) return;
        const pid = parts[0], cid = parts[1];
        if (pid !== String(nodeId) && cid !== String(nodeId)) return;
        const parentPos = state.graphNodePositions[pid] || getDefaultNodePosition(state.flatTasks.find(t => t.id == pid), lm);
        const childPos = state.graphNodePositions[cid] || getDefaultNodePosition(state.flatTasks.find(t => t.id == cid), lm);
        const px = parentPos.x + 75, py = parentPos.y;
        const cxp = childPos.x - 75, cyp = childPos.y;
        const d = `M ${px} ${py} C ${px+45} ${py}, ${cxp-45} ${cyp}, ${cxp} ${cyp}`;
        path.setAttribute('d', d);
    });
}
function startGraphDrag(e) {
    const p = getPointer(e);
    // 排除节点上的操作（让节点拖拽优先）
    if(e.target.closest('.graph-node')||e.target.closest('.graph-hit')||e.target.closest('text')||e.target.closest('rect')) return;
    state.isDraggingGraph=true;
    state.graphDragStart={x:p.clientX,y:p.clientY};
    e.preventDefault();
}
function moveGraphDrag(e) {
    if(!state.isDraggingGraph) return;
    if (isTouchEvent(e)) e.preventDefault();
    const p = getPointer(e);
    const dx=p.clientX-state.graphDragStart.x, dy=p.clientY-state.graphDragStart.y;
    const view = state.graphViewBox;
    const scaleFactor = view.width / DOM.graphSvg.clientWidth;
    view.x -= dx * scaleFactor;
    view.y -= dy * scaleFactor;
    state.graphDragStart={x:p.clientX,y:p.clientY};
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
    /* 周末两列用金色区分（方舟周常界面的做法） */
    ['日','一','二','三','四','五','六'].forEach((d,i)=>
        html += `<div class="calendar-day-header${(i===0||i===6)?' is-weekend':''}">${d}</div>`);
    for(let i=0;i<firstDay;i++) html += '<div class="calendar-day other-month"></div>';
    const todayStr = new Date().toLocaleDateString('sv-SE');
    for(let day=1; day<=daysInMonth; day++){
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const tasks = tasksByDate[dateStr] || [];
        html += `<div class="calendar-day ${dateStr===todayStr?'today':''} ${tasks.length?'has-tasks':''}" data-date="${dateStr}">`;
        html += `<div class="calendar-day-number">${day}</div>`;
        html += '<span class="calendar-day-add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>';
        tasks.forEach(t=>{
            const priorityColor = getPriorityColor(t.priority);
            const statusIcon = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '▶' : t.status === 'paused' ? '⏸' : '';
            /* 日历里的优先级星星也走同一套金星：金色 + 单颗倾斜，只堆数量 */
            const priorityStars = goldStars(t.priority);
            const title = escapeHtml(t.title);
            const lead = t.task_line === 'main'
                ? '<span class="calendar-task-icon"><i class="fa-solid fa-diamond"></i></span>'
                : '';
            html += `<div class="calendar-task-indicator" title="${title} (优先级${t.priority})">` +
                    lead +
                    `<span class="calendar-task-status">${statusIcon}</span>` +
                    `<span class="calendar-task-bar" style="background:${priorityColor}"></span>` +
                    `<span class="calendar-task-stars">${priorityStars}</span>` +
                    `<span class="calendar-task-title">${title}</span>` +
                '</div>';
        });
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.calendar-day[data-date]').forEach(el=>{
        el.addEventListener('click', ()=>{ const date=el.dataset.date; if(date) showTasksForDate(date); });
    });
}

/* ===== 某一天的任务面板：可查看 / 添加多个 / 删除 ===== */
let dayPanelDate = '';
function dayTasksOf(dateStr){
    return state.flatTasks.filter(t => !t.archived && !t.deleted && (
        (t.due_date && t.due_date.substring(0,10) === dateStr) ||
        (t.planned_start && t.planned_start.substring(0,10) === dateStr)
    ));
}
function renderDayPanel(){
    const body = DOM.dateTasksBody; if (!body) return;
    DOM.dateTasksTitle.textContent = `${dayPanelDate} 任务`;
    const tasks = dayTasksOf(dayPanelDate);
    const rows = tasks.map(t => {
        const st = t.status === 'done' ? '已完成' : t.status === 'in_progress' ? '进行中' : t.status === 'paused' ? '已暂停' : '待办';
        return `<div class="dt-item" data-id="${t.id}">
            <div class="dt-item-main">
                <span class="dt-item-title">${escapeHtml(t.title)}</span>
                <span class="dt-item-meta">${goldStars(t.priority)}<i>${st}</i></span>
            </div>
            <button class="dt-del" type="button" data-del="${t.id}" title="从这天移除"><i class="fa-solid fa-trash-can"></i></button>
        </div>`;
    }).join('');
    body.innerHTML =
        `<div class="dt-head"><span class="dt-count">共 ${tasks.length} 个任务</span></div>` +
        '<div class="dt-add-row">' +
            '<input type="text" class="form-input" id="dtAddInput" placeholder="给这天加一个任务…">' +
            '<button class="btn btn-primary btn-medium" id="dtAddBtn" type="button"><i class="fa-solid fa-plus"></i><span>添加</span></button>' +
        '</div>' +
        `<div class="dt-list">${rows || '<div class="dt-empty">这天还没有任务，在上面输入标题添加</div>'}</div>`;

    const input = body.querySelector('#dtAddInput');
    const add = body.querySelector('#dtAddBtn');
    if (add) add.addEventListener('click', () => addDayTask(input && input.value));
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') addDayTask(input.value); });
    body.querySelectorAll('[data-del]').forEach(b => {
        b.addEventListener('click', e => { e.stopPropagation(); removeDayTask(parseInt(b.dataset.del, 10)); });
    });
    body.querySelectorAll('.dt-item').forEach(it => {
        it.addEventListener('click', () => { closeAllModals(); openTaskDetail(parseInt(it.dataset.id, 10)); });
    });
    if (input) setTimeout(() => input.focus(), 60);
}
async function addDayTask(title){
    const name = (title || '').trim();
    if (!name) { showToast('先输入任务标题'); return; }
    const created = await apiPost('/tasks', {
        title: name,
        priority: 1, task_line: 'side', track: 'daily', status: 'todo',
        planned_start: `${dayPanelDate}T00:00`,
        due_date: `${dayPanelDate}T23:59`
    });
    if (!created) return;
    await loadTasks();
    renderCalendar();
    renderDayPanel();
    showToast('已添加到这天');
}
async function removeDayTask(id){
    const ok = await apiDelete(`/tasks/${id}`);
    if (!ok) return;
    await loadTasks();
    renderCalendar();
    renderDayPanel();
    showToast('已从这天移除');
}

function getPriorityColor(priority){ const colors={1:'#999',2:'#7a9a5a',3:'#4a90d0',4:'#a080c8',5:'#e8b818',6:'#d43028'}; return colors[priority]||'#999'; }

function showTasksForDate(dateStr){
    dayPanelDate = dateStr;
    renderDayPanel();
    openModal('dateTasksModal');
}

function renderAchievements(){
    // 防止数据未加载完时渲染导致"先亮后灭"闪烁
    if(!state.achievements.length || !state.unlockedAchievements) return;
    const grid=DOM.achievementsGrid; grid.innerHTML='';
    const unlockedIds = new Set(state.unlockedAchievements.map(u => u.achievement_id));
    state.achievements.forEach(ach=>{
        const unlocked = unlockedIds.has(ach.id);
        // 默认 locked（暗），只有确认解锁才加 unlocked 类（亮）
        const card=document.createElement('div');
        card.className='achievement-card' + (unlocked ? ' unlocked' : '');
        card.classList.add(!unlocked ? 'locked' : '');
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

/* ===== 礼包卡片 =====
   礼包有两种内容格式（后端生成时并存）：
     fixed/resources + materials : {"resources":{...},"materials":[{type,amount}]}
     fixed + random              : {"fixed":{...},"random":["mat_xxx:3", ...]}
   这里统一解析成「资源 + 素材」两组，用真实图标铺成内容条——
   只写三行文字太素，看不出包里到底有啥。 */
const GP_RES_NAME = { exp:'经验值', source_stone:'源石', lungmen:'龙门币', orundum:'合成玉', sanity:'理智' };
const GP_RES_ORDER = ['source_stone', 'orundum', 'lungmen', 'exp', 'sanity'];
let WH_NAME_MAP = null;
let WH_NAME_MAP_N = -1;

// 历史遗留的掉落 key：早期掉落池用过无 mat_ 前缀、且与现行官方目录不同名的编码，
// 直接查目录会查不到 → 仓库/奖励弹窗会退化成「未知素材 + 宝箱图标」。
// 这里做一次别名归一，把旧 key 映射到现行目录里的等价物。
const WH_LEGACY_ALIAS = {
    MTL_ALCOHOL_T:  'mat_MTL_SL_ALCOHOL1',   // 扭转醇
    MTL_DEVICE_MOD: 'mat_MTL_SL_BOSS2',      // 装置
    MTL_POLYESTER:  'mat_MTL_SL_RUSH2',      // 聚酸酯
};

// 统一的「掉落 key → 目录条目」解析：兼容带/不带 mat_ 前缀 + 旧别名。
// 全站（仓库、奖励弹窗、领取提示）都走这一个入口，避免各处各写一套判断。
function whCatalogItem(key){
    if (!key || !WAREHOUSE_CATALOG.length) return null;
    const cands = [key, key.startsWith('mat_') ? key.slice(4) : `mat_${key}`];
    if (WH_LEGACY_ALIAS[key]) cands.push(WH_LEGACY_ALIAS[key]);
    for (const k of cands){
        const it = WAREHOUSE_CATALOG.find(x => x.key === k);
        if (it) return it;
    }
    return null;
}

function matNameOf(key){
    // 目录是异步加载的：早于目录就绪调用会缓存出空表，所以按目录长度重新建表
    if (!WH_NAME_MAP || WH_NAME_MAP_N !== WAREHOUSE_CATALOG.length){
        WH_NAME_MAP = {};
        WAREHOUSE_CATALOG.forEach(x => { WH_NAME_MAP[x.key] = x.name; });
        WH_NAME_MAP_N = WAREHOUSE_CATALOG.length;
    }
    const it = whCatalogItem(key);
    return (it && it.name) || WH_NAME_MAP[key] || key;
}
function parsePackContents(pack){
    let cfg = pack.content_config;
    if (typeof cfg === 'string'){ try { cfg = JSON.parse(cfg); } catch(e){ cfg = {}; } }
    cfg = cfg || {};
    const res = Object.assign({}, cfg.resources || {}, cfg.fixed || {});
    const mats = [];
    (cfg.materials || []).forEach(m => mats.push({ key: m.type, amount: Number(m.amount) || 1 }));
    (cfg.random || []).forEach(s => {
        const parts = String(s).split(':');
        const k = parts[0], n = parseInt(parts[1], 10) || 1;
        if (!k) return;
        if (GP_RES_NAME[k]) res[k] = (res[k] || 0) + n;
        else mats.push({ key: k, amount: n });
    });
    return { res, mats };
}
function renderGiftPacks(){
    const grid = DOM.giftPacksGrid; if (!grid) return;
    grid.innerHTML = '';
    const avail = (state.giftPacks || []).filter(p => !p.purchased);
    if (!avail.length){
        grid.innerHTML = '<div class="gp-empty">补给包已全部购买，等待下一轮补给</div>';
        return;
    }
    avail.forEach(pack => {
        const { res, mats } = parsePackContents(pack);
        const chips = [];
        // 货币类：与素材类保持同一种「图标 / 数量 / 名称」三件套排布。
        // （以前货币只给图标+数字、素材给三行，两种卡片高度不齐，看着就是「排列不一致」。）
        GP_RES_ORDER.forEach(k => {
            const v = res[k];
            if (!v) return;
            const name = GP_RES_NAME[k];
            chips.push(`<span class="gp-chip is-res" title="${name}">` +
                `<img src="static/icons/${k}.png" alt="${name}" onerror="this.style.visibility='hidden'">` +
                `<b>${formatWhNum(v)}</b><i>${name}</i></span>`);
        });
        // 素材类：图标不一致，保留短名（截断 + 悬浮看全名）
        mats.forEach(m => {
            const name = matNameOf(m.key);
            chips.push(`<span class="gp-chip is-mat" title="${escapeHtml(name)}">` +
                `<img src="static/icons/${m.key}.png" alt="" onerror="this.style.visibility='hidden'">` +
                `<b>×${m.amount}</b><i>${escapeHtml(name)}</i></span>`);
        });
        const card = document.createElement('div');
        card.className = `gift-pack-card gp-r${pack.rarity || 1}`;
        /* 售价不再放卡片右上角：那里和标题抢位置，且原版方舟的价格本来就钉在
           底部那条操作带上（见 style.css 的 .gp-buy —— 与卡片等宽的通栏条）。
           R20：条上写「购买」+ 价格，和原版一致；源石不够时整条置灰。 */
        const affordable = (state.resources.source_stone?.current_value || 0) >= pack.cost_source_stone;
        card.innerHTML =
            '<span class="gp-ribbon"></span>' +
            '<div class="gp-head">' +
                `<span class="gp-name">${escapeHtml(pack.name)}</span>` +
            '</div>' +
            `<div class="gp-desc">${escapeHtml(pack.description || '')}</div>` +
            `<div class="gp-contents">${chips.join('') || '<span class="gp-chip-empty">内容物生成中</span>'}</div>` +
            `<button class="gp-buy${affordable ? '' : ' gp-buy-locked'}" type="button" ` +
                `title="${affordable ? '购买' : '源石不足'}">` +
                `<span class="gp-buy-text">购买</span>` +
                `<span class="gp-buy-sep"></span>` +
                `<span class="gp-buy-cost">${resIconHTML('source_stone')}<b>${pack.cost_source_stone}</b></span>` +
            `</button>`;
        card.addEventListener('click', () => purchaseGiftPack(pack.id));
        grid.appendChild(card);
    });
}

function renderTransactions(){ const list=DOM.transactionsList; if(!list) return; list.innerHTML='';
    const recent=state.transactions.slice(0,50);
    // 资源类型中文映射
    const resNames = {exp:'经验值',source_stone:'源石',lungmen:'龙门币',orundum:'合成玉',sanity:'理智'};
    recent.forEach(tx=>{ const div=document.createElement('div'); div.className='transaction-item';
        const reason=document.createElement('span'); reason.className='tx-reason'; reason.textContent=tx.reason;
        const meta=document.createElement('div'); meta.className='tx-meta';
        const resType=document.createElement('span'); resType.className='tx-res-type'; resType.textContent=resNames[tx.resource_type]||tx.resource_type;
        const date=document.createElement('span'); date.className='tx-date'; date.textContent=formatDate(tx.created_at);
        const amount=document.createElement('span'); amount.className='tx-amount '+(tx.amount>0?'positive':'negative');
        amount.textContent=(tx.amount>0?'+':'')+tx.amount;
        meta.appendChild(resType); meta.appendChild(date); meta.appendChild(amount);
        div.appendChild(reason); div.appendChild(meta); list.appendChild(div);
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
    const expCurrent = res.exp?.current_value || 0;
    const lp = levelProgress(expCurrent);
    if(DOM.profileLevel) DOM.profileLevel.textContent = lp.level;
    if(DOM.profileExpFill) DOM.profileExpFill.style.width = `${(lp.expForLevel ? (lp.expInLevel / lp.expForLevel) * 100 : 0)}%`;
    if(DOM.profileExpText) DOM.profileExpText.textContent = `${lp.expInLevel} / ${lp.expForLevel} EXP`;
}

function updateUserInfo() {
    const exp = state.resources.exp?.current_value || 0;
    const lp = levelProgress(exp);
    const uname = state.settings.username || '博士';
    DOM.userName.textContent = uname;
    const profileUsernameEl = document.getElementById('profileUsername');
    if (profileUsernameEl) profileUsernameEl.textContent = uname;
    DOM.userLevel.textContent = `Lv.${lp.level}`;
}

/* ===== 等级 / 经验曲线 =====
   二次曲线：need(L) = BASE + LIN*(L-1) + QUAD*(L-1)^2
   为什么换掉原来的方舟原表 ×0.05：
     原表 L4~L34 每级只 +80，乘 0.05 后每级仅 +4 经验 —— 增速几乎为 0，
     且 L21 只要 130 经验，做一两个任务就升级，完全没有成长感。
   二次曲线的单级需求随等级加速上升（取整到 5 的倍数）：
     L1=60, L2=80, L5=155, L10=320, L20=800, L30=1480, L50=3440, L100=11840
     每级增量从 ~20 一路涨到 ~100+，后期越来越难，增速肉眼可见。
   调参：BASE↑ 整体更难；LIN↑ 中期更快变难；QUAD↑ 后期更陡。
   注意：改曲线会让既有经验对应的等级重新标定（等级数会下降），属正常现象。
   参考：1800 经验 → 旧曲线 L21（每级仅 130），新曲线 L11（每级约 360）。 */
const AK_EXP_TABLE = [500,800,1240,1320,1400,1480,1560,1640,1720,1800,1880,1960,2040,2120,2200,2280,2360,2440,2520,2600,2680,2760,2840,2920,3000,3080,3160,3240,3350,3460,3570,3680,3790,3900,4200,4500,4800,5100,5400,5700,6000,6300,6600,6900,7200,7500,7800,8100,8400,8700,9000,9500,10000,10500,11000,11500,12000,12500,13000,13500,14000,14500,15000,15500,16000,17000,18000,19000,20000,21000,22000,23000,24000,25000,26000,27000,28000,29000,30000,31000,32000,33000,34000,35000,36000,37000,38000,39000,40000,41000,42000,43000,44000,45000,46000,47000,48000,49000,50000,51000,52000,54000,56000,58000,60000,62000,64000,66000,68000,70000,73000,76000,79000,82000,85000,88000,91000,94000,97000,100000];
/* 曲线说明见上方「等级 / 经验曲线」注释块。
   改动这几个常量时必须同步 main.py 的 _LEVEL_BASE/_LEVEL_LIN/_LEVEL_QUAD/_LEVEL_ROUND/_LEVEL_FLOOR，
   否则前端显示等级与后端升级检测会不一致。 */
const LEVEL_BASE = 60;
const LEVEL_LIN = 20;
const LEVEL_QUAD = 1.0;
const LEVEL_STEP = 5;
const LEVEL_FLOOR = 50;
function levelExpForLevel(level){
    const n = Math.max(0, level - 1);
    const need = LEVEL_BASE + LEVEL_LIN * n + LEVEL_QUAD * n * n;
    return Math.max(LEVEL_FLOOR, Math.round(need / LEVEL_STEP) * LEVEL_STEP);
}
function levelProgress(exp){
    let level = 1, total = 0;
    while (true) {
        const need = levelExpForLevel(level);
        if (exp < total + need) {
            return { level, expInLevel: exp - total, expForLevel: need };
        }
        total += need;
        level++;
    }
}
function calculateLevel(exp){ return levelProgress(exp).level; }

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
    if (view === 'gacha') {
        updateOperatorGachaBalance();
        if (DOM.operatorGachaResult && !DOM.operatorGachaResult.children.length && !gachaBusy)
            DOM.operatorGachaResult.innerHTML = '<div class="gh-idle-hint">点击下方「寻访」开始</div>';
        loadOperatorRecords();
    }
    if (view === 'shop') renderShopPanel();
    if (view === 'profile') {
        updateResourceDisplay();
        renderProfileBadges();
        renderProfileMedalCount();
        renderTransactions();
    }
    if (view === 'tasks') renderTasks();

    if (window.innerWidth <= 768 && DOM.navCenter) {
        DOM.navCenter.classList.remove('mobile-show');
    }
}

function openTaskModal(task=null){
    DOM.taskForm.reset(); DOM.taskFormId.value=''; DOM.taskFormTitle.value=''; DOM.taskFormDesc.value='';
    setStarRating(1); DOM.taskFormTaskLine.value='side'; DOM.taskFormTrack.value='daily'; DOM.taskFormStatus.value='todo'; DOM.taskFormParent.value='';
    DOM.taskFormTarget.value=''; DOM.taskFormCurrent.value='0'; DOM.taskFormPlannedStart.value=''; DOM.taskFormPlannedEnd.value='';
    DOM.taskFormDueDate.value=''; DOM.taskFormPrerequisite.value=''; DOM.taskFormRepeatType.value=''; DOM.taskFormRepeatInterval.value='1';
    DOM.taskFormRewardExp.value='0'; DOM.taskFormRewardLungmen.value='0'; DOM.taskFormRewardStone.value='0'; DOM.taskFormRewardOrundum.value='0';
    DOM.taskFormNotes.value=''; DOM.repeatIntervalGroup.style.display='none'; state.selectedTags=[]; renderTagList();
    renderFormCategoryOptions(); DOM.taskFormCategory.value='';
    fillParentOptions(); fillPrerequisiteOptions();
    if(task){
        DOM.taskModalTitle.textContent='编辑任务'; DOM.taskFormId.value=task.id; DOM.taskFormTitle.value=task.title||'';
        DOM.taskFormDesc.value=task.description||''; setStarRating(task.priority||1); DOM.taskFormTaskLine.value=task.task_line||'side'; DOM.taskFormTrack.value=task.track||'daily';
        DOM.taskFormStatus.value=task.status||'todo'; DOM.taskFormParent.value=task.parent_id||''; DOM.taskFormTarget.value=task.target_value||'';
        DOM.taskFormCurrent.value=task.current_value||'0'; DOM.taskFormPlannedStart.value=task.planned_start?task.planned_start.substring(0,16):'';
        DOM.taskFormPlannedEnd.value=task.planned_end?task.planned_end.substring(0,16):''; DOM.taskFormDueDate.value=task.due_date?task.due_date.substring(0,16):'';
        DOM.taskFormPrerequisite.value=task.prerequisite_id||''; DOM.taskFormRepeatType.value=task.repeat_type||''; DOM.taskFormRepeatInterval.value=task.repeat_interval||'1';
        DOM.taskFormRewardExp.value=task.reward_exp||'0'; DOM.taskFormRewardLungmen.value=task.reward_lungmen||'0';
        DOM.taskFormRewardStone.value=task.reward_source_stone||'0'; DOM.taskFormRewardOrundum.value=task.reward_orundum||'0';
        DOM.taskFormNotes.value=task.notes||''; if(task.repeat_type==='custom') DOM.repeatIntervalGroup.style.display='flex';
        state.selectedTags=(task.tags||[]).map(t=>t.name); renderTagList();
        renderFormCategoryOptions();
        const cats=state.settings.categories||[]; const taskCat=(task.tags||[]).map(t=>t.name).find(n=>cats.includes(n))||''; DOM.taskFormCategory.value=taskCat;
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
        title, description:DOM.taskFormDesc.value.trim(), priority, task_line:taskLine, track:DOM.taskFormTrack.value, status:DOM.taskFormStatus.value,
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
        notes:DOM.taskFormNotes.value.trim(),
        tags:(function(){ const c=DOM.taskFormCategory.value; const t=state.selectedTags.slice(); if(c && !t.includes(c)) t.push(c); return t; })(),
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

/* =========================================================
   批量选择模式：批量 → 点卡片勾选（父任务自动带全部子任务）
   → 底部操作栏全选/归档/删除 → 完成退出。无需改后端：
   循环调用现有单任务归档/删除接口。
   ========================================================= */
function initBatchSelection(){
    const btn = document.getElementById('batchSelectBtn');
    if (btn) btn.addEventListener('click', () => toggleSelectionMode());
}

function toggleSelectionMode(force){
    const enter = (typeof force === 'boolean') ? force : !state.selectionMode;
    if (enter === state.selectionMode && typeof force !== 'boolean') return;
    state.selectionMode = enter;
    if (!enter) state.selectedIds.clear();
    document.body.classList.toggle('selection-mode', enter);
    const btn = document.getElementById('batchSelectBtn');
    if (btn) btn.classList.toggle('active-gold', enter);
    applySelectionModeToDOM(enter);  // 不整表重渲染，子任务不动
    updateBatchToolbar();
}

/* 进入/退出选择模式时只改 DOM，不 renderTasks()，避免列表闪烁、子任务跳动 */
function applySelectionModeToDOM(enter){
    const cards = document.querySelectorAll('.task-card');
    if (!enter) {
        cards.forEach(card => {
            card.classList.remove('selecting', 'selected');
            card.draggable = true;  // 后续按任务状态重算
            const chk = card.querySelector('.select-checkbox');
            if (chk) chk.remove();
        });
        // 恢复 draggable：被阻塞/已完成的任务保持 false
        cards.forEach(card => {
            const taskId = parseInt(card.dataset.taskId, 10);
            const task = state.flatTasks.find(t => t.id === taskId);
            if (!task) return;
            card.draggable = !isBlocked(task) && task.status !== 'done';
        });
        return;
    }
    cards.forEach(card => {
        const taskId = parseInt(card.dataset.taskId, 10);
        const selected = state.selectedIds.has(taskId);
        card.classList.add('selecting');
        card.draggable = false;
        if (selected) card.classList.add('selected');
        if (card.querySelector('.select-checkbox')) return;
        const chk = document.createElement('div');
        chk.className = 'select-checkbox' + (selected ? ' checked' : '');
        chk.innerHTML = '<i class="fa-solid fa-check"></i>';
        const indent = card.querySelector('.task-indent');
        if (indent) card.insertBefore(chk, indent);
        else card.appendChild(chk);
    });
}

function ensureBatchToolbar(){
    let bar = document.getElementById('batchToolbar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'batchToolbar';
    bar.className = 'batch-toolbar';
    bar.innerHTML =
        '<button type="button" class="batch-btn" id="batchSelectAllBtn"><i class="fa-regular fa-square-check"></i><span>全选</span></button>' +
        '<div class="batch-count"><span id="batchCountNum">0</span> 项</div>' +
        '<button type="button" class="batch-btn" id="batchArchiveBtn" disabled><i class="fa-solid fa-box-archive"></i><span>归档</span></button>' +
        '<button type="button" class="batch-btn danger" id="batchDeleteBtn" disabled><i class="fa-solid fa-trash-can"></i><span>删除</span></button>' +
        '<button type="button" class="batch-btn primary" id="batchDoneBtn"><i class="fa-solid fa-check"></i><span>完成</span></button>';
    document.body.appendChild(bar);
    bar.querySelector('#batchSelectAllBtn').addEventListener('click', batchToggleSelectAll);
    bar.querySelector('#batchArchiveBtn').addEventListener('click', batchArchive);
    bar.querySelector('#batchDeleteBtn').addEventListener('click', batchDelete);
    bar.querySelector('#batchDoneBtn').addEventListener('click', () => toggleSelectionMode(false));
    return bar;
}

function updateBatchToolbar(){
    const bar = ensureBatchToolbar();
    const count = state.selectedIds.size;
    bar.classList.toggle('visible', state.selectionMode);
    bar.querySelector('#batchCountNum').textContent = count;
    const dis = count === 0;
    bar.querySelector('#batchArchiveBtn').disabled = dis;
    bar.querySelector('#batchDeleteBtn').disabled = dis;
    const visible = [...state.visibleIds];
    const allSel = state.selectionMode && visible.length > 0 && visible.every(id => state.selectedIds.has(id));
    bar.querySelector('#batchSelectAllBtn').classList.toggle('all-selected', allSel);
    bar.querySelector('#batchSelectAllBtn').querySelector('span').textContent = allSel ? '取消' : '全选';
}

/* 收集任务及其全部子孙 id：选中父任务自动勾选所有子任务 */
function collectTaskBranchIds(id){
    const ids = [id];
    const walk = (pid) => {
        state.flatTasks.forEach(t => { if (t.parent_id === pid) { ids.push(t.id); walk(t.id); } });
    };
    walk(id);
    return ids;
}

function toggleSelectTask(task){
    const ids = collectTaskBranchIds(task.id);
    const deselect = state.selectedIds.has(task.id);
    ids.forEach(i => deselect ? state.selectedIds.delete(i) : state.selectedIds.add(i));
    // 只改已渲染卡片的样式，不整列表重渲染，保证操作流畅
    ids.forEach(i => {
        const card = document.querySelector(`.task-card[data-task-id="${i}"]`);
        if (card) {
            card.classList.toggle('selected', !deselect);
            const chk = card.querySelector('.select-checkbox');
            if (chk) chk.classList.toggle('checked', !deselect);
        }
    });
    updateBatchToolbar();
}

function batchToggleSelectAll(){
    const visible = [...state.visibleIds];
    const allSel = visible.length > 0 && visible.every(id => state.selectedIds.has(id));
    if (allSel) {
        state.selectedIds.clear();
    } else {
        visible.forEach(id => collectTaskBranchIds(id).forEach(i => state.selectedIds.add(i)));
    }
    // 不整表重渲染：只同步已渲染卡片的选中态与勾选框，子任务 DOM 完全不动
    document.querySelectorAll('.task-card').forEach(card => {
        const taskId = parseInt(card.dataset.taskId, 10);
        const sel = state.selectedIds.has(taskId);
        card.classList.toggle('selected', sel);
        const chk = card.querySelector('.select-checkbox');
        if (chk) chk.classList.toggle('checked', sel);
    });
    updateBatchToolbar();
}

async function batchArchive(){
    const ids = [...state.selectedIds];
    if (!ids.length) return;
    for (const id of ids) await apiPost(`/tasks/${id}/archive`);
    showToast(`已归档 ${ids.length} 个任务`);
    state.selectedIds.clear();
    await loadTasks();
}

function batchDelete(){
    const ids = [...state.selectedIds];
    if (!ids.length) return;
    showConfirm(`确定删除选中的 ${ids.length} 个任务吗？子任务会一并删除（可在回收站恢复）。`, async () => {
        for (const id of ids) await apiDelete(`/tasks/${id}`);
        showToast(`已删除 ${ids.length} 个任务`);
        state.selectedIds.clear();
        await loadTasks();
    });
}
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

    // 并行加载减少移动端延迟；完成后恢复滚动位置，避免"跳回列表顶部"
    const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
    const prevListScroll = DOM.taskListContainer ? DOM.taskListContainer.scrollTop : 0;
    await Promise.all([loadTasks(), loadResources(), loadRealityRewards()]);
    window.scrollTo(0, prevScroll);
    if (DOM.taskListContainer) DOM.taskListContainer.scrollTop = prevListScroll;

    const updatedTask = state.flatTasks.find(t => t.id === taskId);
    if (updatedTask && updatedTask.status === 'done') {
        /* R19：快捷完成后【不再自动弹】领取奖励窗口 ——
           用户要的是自己点卡片再领。这里只给一句提示；卡片会带上 .claimable
           并在右上角挂「可领取」，点整张卡走 claimTaskFromCard()。
           （旧行为：200ms 后 openRewardModal 强弹，打断连续勾任务的节奏。） */
        if (hasActualReward(updatedTask)) {
            showToast('任务完成 · 点击卡片领取奖励');
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
    const claimable = task.status === 'done' && !task.reward_claimed && hasActualReward(task);
    card.className = `task-card status-${task.status} ${(task.children && task.children.length) ? 'parent-task' : 'child-task'}`
        + `${isBlocked(task) ? ' dependency-blocked' : ''}`
        + `${claimable ? ' claimable' : ''}`
        + `${state.selectionMode ? ' selecting' : ''}`
        + `${state.selectedIds && state.selectedIds.has(task.id) ? ' selected' : ''}`;
    card.dataset.status = task.status;
    if (claimable && !card.querySelector('.task-claim-badge')) {
        const claimBadge = document.createElement('div');
        claimBadge.className = 'task-claim-badge';
        claimBadge.innerHTML = '<i class="fa-solid fa-gift"></i><span>可领取</span>';
        card.appendChild(claimBadge);
    } else if (!claimable) {
        card.querySelector('.task-claim-badge')?.remove();
    }
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
                /* R19：与 completeTaskAndHandleReward 一致 —— 计数达标也不自动弹窗，
                   改为提示 + 卡片「可领取」，由用户点卡片自行领取。 */
                if(hasActualReward(updatedTask)){
                    showToast('任务完成 · 点击卡片领取奖励');
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
    DOM.trackingStars.innerHTML = goldStars(task.priority);
    DOM.trackingStars.title = `优先级 ${task.priority}`;
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
        DOM.mainContent.style.marginLeft='64px';
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
    // 掉落素材要靠仓库目录反查中文名/图标；目录是异步加载的，这里先确保就绪，
    // 否则用户没开过仓库就点奖励 → 随机掉落会显示成原始 key + 宝箱占位图。
    await loadWarehouseCatalog();
    const titleEl = document.querySelector('#rewardModal .modal-title');
    if(titleEl) titleEl.textContent = '任务奖励';
    const task=state.flatTasks.find(t=>t.id===taskId); if(!task) return;
    // 防御性拦截：已领取的任务不再打开弹窗
    if(task.reward_claimed){ showToast('奖励已领取'); rewardModalOpenTaskId=null; return; }
    DOM.rewardDetails.innerHTML='';
    // 使用共享 RESOURCE_SVGS（唯一真实来源）
    // 未知掉落类型的宝箱图标（定义见文件顶部模块级 DROP_CHEST_SVG）
    const rewards=[ {name:'经验值',value:task.reward_exp||0,key:'exp',svg:RESOURCE_SVGS.exp,color:'#6AB0E8'}, {name:'龙门币',value:task.reward_lungmen||0,key:'lungmen',svg:RESOURCE_SVGS.lungmen,color:'#2989D9'}, {name:'源石',value:task.reward_source_stone||0,key:'source_stone',svg:RESOURCE_SVGS.source_stone,color:'#FFD700'}, {name:'合成玉',value:task.reward_orundum||0,key:'orundum',svg:RESOURCE_SVGS.orundum,color:'#D42027'} ];
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
        iconWrap.innerHTML = r.svg; tryUpgradeResIcon(iconWrap, r.key);
        // 数量角标（右下角，游戏风格）
        const num = document.createElement('div'); num.className='reward-num-badge'; num.textContent = `${r.value}`;
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
                const ring = document.createElement('div'); ring.className='reward-ring';
                const iconWrap = document.createElement('div'); iconWrap.className='reward-icon-wrap';
                let dName='?', dVal=1, dColor='var(--highlight-gold-1)', dKey=null;
                // 基础货币/经验：固定配色
                const rb={
                    'source_stone':['源石','#FFD700','source_stone'],
                    'orundum':['合成玉','#D42027','orundum'],
                    'lungmen':['龙门币','#2989D9','lungmen'],
                    'exp':['经验值','#6AB0E8','exp']
                };
                // 仓库素材中文名与配色统一取自官方目录（配色按稀有度，与图标底板一致）
                const whRarityColor=['#9E9E9E','#8BC34A','#29B6F6','#AB47BC','#FFCA28','#FF7043'];
                const resolveDrop=(rt)=>{
                    if(rb[rt]) return rb[rt];
                    // 统一走 whCatalogItem：兼容无 mat_ 前缀的历史 key
                    const it = whCatalogItem(rt);
                    if(it) return [it.name, whRarityColor[it.r]||'#FFCA28', it.key];
                    return null;
                };
                if(typeof drop==='string'){ const parts=drop.split(':'); if(parts.length>=2){ const rt=parts[0]; dVal=parseInt(parts[1])||1; const entry=resolveDrop(rt); if(entry){ dName=entry[0]; dColor=entry[1]; dKey=entry[2]; } else dName=rt; } else dName=drop; }
                else if(drop.name&&drop.quantity){ dName=drop.name; dVal=drop.quantity; const e=resolveDrop(drop.key||drop.name); if(e){ dColor=e[1]; dKey=e[2]; } }
                ring.style.setProperty('--ring-color', dColor);
                if(dKey && dKey.startsWith('mat_')){
                    // 仓库素材直接用合成好的官方图标
                    iconWrap.innerHTML='';
                    const im=document.createElement('img');
                    im.src=`static/icons/${dKey}.png`; im.alt=dName;
                    im.style.cssText='width:100%;height:100%;object-fit:contain;';
                    im.addEventListener('error',()=>{ iconWrap.innerHTML=DROP_CHEST_SVG; });
                    iconWrap.appendChild(im);
                } else if(dKey){ iconWrap.innerHTML = RESOURCE_SVGS[dKey]; tryUpgradeResIcon(iconWrap, dKey); }
                else { iconWrap.innerHTML = DROP_CHEST_SVG; }
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

    // 底部对勾（放在窗口下方外部，可点击领取）
    const checkWrap = document.createElement('div'); checkWrap.className='reward-external-check';
    checkWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="none" stroke="var(--highlight-green-1)" stroke-width="1.5"/><path d="M7 12l3 3 7-7" fill="none" stroke="var(--highlight-green-1)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    // 点击对勾 = 领取奖励
    checkWrap.addEventListener('click', () => { if(!task.reward_claimed) claimReward(); });

    if(!hasReward&&!hasDrop){
        DOM.rewardClaimBtn.style.display='none';
        const emptyMsg=document.createElement('p'); emptyMsg.className='reward-empty-msg';
        emptyMsg.textContent='该任务没有可领取的奖励'; DOM.rewardDetails.appendChild(emptyMsg);
    } else if(task.reward_claimed){
        // 已领取：禁用按钮，对勾变已领态
        DOM.rewardClaimBtn.style.display='none';
        checkWrap.classList.add('claimed');
        const bottomArea = document.createElement('div'); bottomArea.className='reward-bottom-area';
        bottomArea.appendChild(checkWrap);
        const claimedNote=document.createElement('p'); claimedNote.className='reward-claimed-note';
        claimedNote.textContent='✦ 奖励已领取';
        bottomArea.appendChild(claimedNote);
        DOM.rewardDetails.appendChild(bottomArea);
    } else {
        DOM.rewardClaimBtn.style.display='';
        // 有奖励：底部放对勾（在窗口内作为引导）+ 领取按钮
        const bottomArea = document.createElement('div'); bottomArea.className='reward-bottom-area';
        // 窗口内的迷你对勾（仅装饰，引导用户）
        const innerCheck = document.createElement('div'); innerCheck.className='reward-inner-check';
        innerCheck.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="11" fill="none" stroke="var(--highlight-green-1)" stroke-width="1.5" opacity="0.5"/><path d="M7 12l3 3 7-7" fill="none" stroke="var(--highlight-green-1)" stroke-width="2" opacity="0.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        bottomArea.appendChild(innerCheck);
        DOM.rewardDetails.appendChild(bottomArea);
    }
    DOM.rewardClaimBtn.dataset.taskId=taskId;
    openModal('rewardModal');
    // 把外部对勾挂到窗口下方（仅未领取时显示可点击的对勾）
    if(!task.reward_claimed && hasReward){
        const oldCheck = document.querySelector('.reward-external-check'); if(oldCheck) oldCheck.remove();
        document.body.appendChild(checkWrap);
        requestAnimationFrame(() => {
            const modalEl = document.querySelector('#rewardModal .modal');
            if(modalEl){ const r = modalEl.getBoundingClientRect();
                checkWrap.style.cssText = 'position:fixed;top:'+(r.bottom+30)+'px;left:'+(r.left+r.width/2-26)+'px;z-index:100;';
            }
        });
    }
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
            loadResources(); loadTransactions(); loadTasks(); updateTrackingPanel(); loadInventory();
            // 明确提示素材已入库（带中文名），避免"领了奖励但感觉仓库没变化"
            const mats = (result && Array.isArray(result.materials)) ? result.materials : [];
            if (mats.length){
                const parts = mats.map(m => `${matNameOf(m.type)}×${Math.floor(Number(m.amount) || 0)}`);
                showToast(`仓库入库：${parts.join('、')}`);
            }
            const sorted=filterTasks(state.flatTasks); const currentIndex=sorted.findIndex(t=>t.id==taskId);
            if(currentIndex!==-1&&currentIndex+1<sorted.length){ const nextTaskId=sorted[currentIndex+1].id;
                const nextCard=document.querySelector(`.task-card[data-task-id="${nextTaskId}"]`);
                if(nextCard){ nextCard.classList.add('highlight-next'); nextCard.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>nextCard.classList.remove('highlight-next'),3000); } }
        }, 600);
    } else state.rewardModalAnimating=false;
}

function spawnParticlesGatherThenFly(sourceElement) {
    // 保留旧函数名兼容（claimReward 还在调用），内部委托给新动画
    playRewardFlyEffect(sourceElement, null);
}

/**
 * 领取反馈动画（R19 重做）
 * 旧版是「8 个随机 ✦/★/+/✧ 文字 + 15 个随机方块/圆点乱飞」—— 用户直说太丑，已整体删掉。
 * 新版只做两件克制的事，对齐方舟原版那种"一闪即收"的反馈：
 *   1) 源位置扩散两道金色光环（纯圆环，无字符、无方块碎片）
 *   2) 顶部资源栏数字/图标做一次 0.2s 的缩放回弹
 * 全程 ≤ 520ms，不挡视线、不抢后续操作。
 */
function playRewardFlyEffect(sourceElement, resultData) {
    const container = DOM.particleContainer;
    if (!container) return;

    const startRect = sourceElement
        ? sourceElement.getBoundingClientRect()
        : { left: window.innerWidth / 2 - 60, top: window.innerHeight / 2 - 60, width: 120, height: 120 };
    const cx = startRect.left + startRect.width / 2;
    const cy = startRect.top + startRect.height / 2;

    // ── 1) 金色光环扩散（两道，错开 90ms）──
    const base = Math.max(startRect.width, startRect.height, 60);
    for (let i = 0; i < 2; i++) {
        const ring = document.createElement('div');
        const r0 = base * (i === 0 ? 0.28 : 0.20);
        const r1 = base * (i === 0 ? 0.62 : 0.78);
        ring.style.cssText = `
            position:fixed; z-index:2600; pointer-events:none;
            left:${cx}px; top:${cy}px;
            width:${r0 * 2}px; height:${r0 * 2}px;
            margin-left:${-r0}px; margin-top:${-r0}px;
            border-radius:50%;
            border:1.5px solid rgba(255,214,96,${i === 0 ? 0.85 : 0.55});
            box-shadow:0 0 12px rgba(255,196,60,0.35), inset 0 0 10px rgba(255,214,96,0.18);
            opacity:0;
            transform:scale(0.85);
            transition:transform 0.5s cubic-bezier(0.16,0.84,0.44,1), opacity 0.5s ease-out;
        `;
        container.appendChild(ring);
        requestAnimationFrame(() => {
            ring.style.opacity = '0.95';
            ring.style.transform = `scale(${r1 / r0})`;
            setTimeout(() => { ring.style.opacity = '0'; }, 130);
        });
        setTimeout(() => ring.remove(), i * 90 + 620);
    }

    // ── 2) 资源栏回弹（缩放 + 一次金色描边闪）──
    setTimeout(() => {
        document.querySelectorAll('.resource-icon, .res-icon').forEach(icon => {
            icon.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), filter 0.18s ease';
            icon.style.transform = 'scale(1.18)';
            icon.style.filter = 'drop-shadow(0 0 6px rgba(255,196,60,0.55))';
            setTimeout(() => { icon.style.transform = ''; icon.style.filter = ''; }, 200);
        });
    }, 160);
}

async function handleClaimAll(){
    const result=await apiPost('/tasks/claim-all');
    if(result){
        await loadTasks(); await loadResources(); await loadTransactions(); await loadRealityRewards();
        // 只在确实领到了奖励时才播放动画
        if(result.claimed_count > 0 || result.total_reward_value > 0 || (result.claimed && result.claimed.length > 0)){
            setTimeout(() => playRewardFlyEffect(DOM.claimAllBtn, result), 300);
        }
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
            const validTracks=['daily','campaign']; if(task.track&&!validTracks.includes(task.track)) throw new Error(`任务分桶枚举不合法 (${path})`);
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

    const settingDefs=[ {key:'tracking_panel_collapsed',label:'追踪面板收起',type:'checkbox'}, {key:'focus_mode',label:'专注模式默认开启',type:'checkbox'}, {key:'quick_track',label:'快捷追踪按钮',type:'checkbox'}, {key:'claim_with_children',label:'领取父任务时一并领取子任务奖励',type:'checkbox'}, {key:'show_side_when_tracking_main',label:'追踪主线时显示支线',type:'checkbox'}, {key:'show_main_when_tracking_side',label:'追踪支线时显示主线',type:'checkbox'}, {key:'show_sanity',label:'理智显示开关',type:'checkbox'} ];
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
        // claim_with_children 后端默认开（设置里没存过 = 开），不能按 "" 当 false 显示
        input.checked = (def.key === 'claim_with_children') ? settings[def.key] !== false : !!settings[def.key];
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
    if (DOM.pomodoroSound) DOM.pomodoroSound.value = state.settings.pomodoro_sound || 'on';
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

            // 手机端看门狗：壁纸「经常不动、偶尔会动」的常见原因是——
            //   1) 自动播放被系统拒绝（省电模式/首次未交互）；
            //   2) 弱网/内网穿透下缓冲卡住；
            //   3) 首次访问触发服务端转码，媒体请求长时间无响应（readyState 一直为 0）。
            // 这里周期性补播：源没准备好就 reload，最多重试 8 次后停手省电。
            let wpRetries = 0;
            const wpWatchdog = setInterval(() => {
                if (revealed) { clearInterval(wpWatchdog); return; }
                if (document.hidden) return;                 // 后台不打扰
                if (wpRetries++ > 8) { clearInterval(wpWatchdog); return; }
                if (video.readyState === 0) video.load();    // 源没就绪 -> 重新拉取
                startPlay();
            }, 4000);
            // 切回前台时补播（手机切走再回来最常见的"不动了"）
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && video.paused) startPlay();
            });

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
    // 详情头部的星级牌同样带 priority-N —— 与列表卡片共用一套分级色条
    starPlate.className=`star-bg priority-${task.priority}`;
    starPlate.innerHTML=goldStars(task.priority);
    starPlate.title=`优先级 ${task.priority}`;
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

// 礼包领取后弹出与「领取奖励」同款的奖励结算弹窗（物品已在后端发放完毕，此处仅展示）
function showPackRewardModal(granted){
    if(!granted || !granted.length) return;
    const titleEl = document.querySelector('#rewardModal .modal-title');
    if(titleEl) titleEl.textContent = '礼包奖励';
    DOM.rewardDetails.innerHTML = '';
    DOM.randomDropSection.style.display = 'none';
    // 货币固定配色；mat_ 素材从官方目录查中文名与稀有度配色（与领取奖励弹窗一致）
    const rb = {
        'source_stone': ['源石', '#FFD700', 'source_stone'],
        'orundum': ['合成玉', '#D42027', 'orundum'],
        'lungmen': ['龙门币', '#2989D9', 'lungmen'],
        'exp': ['经验值', '#6AB0E8', 'exp'],
        'sanity': ['理智', '#60C890', 'sanity']
    };
    const whRarityColor = ['#9E9E9E','#8BC34A','#29B6F6','#AB47BC','#FFCA28','#FF7043'];
    const resolve = (rt) => {
        if(rb[rt]) return rb[rt];
        const it = whCatalogItem(rt);
        if(it) return [it.name, whRarityColor[it.r] || '#FFCA28', it.key];
        return null;
    };
    const grid = document.createElement('div'); grid.className = 'reward-grid';
    granted.forEach(g => {
        const key = g.key, val = Math.floor(Number(g.amount) || 0);
        if(val <= 0) return;
        const entry = resolve(key);
        let name = key, color = 'var(--highlight-gold-1)', ckey = null;
        if(entry){ name = entry[0]; color = entry[1]; ckey = entry[2]; }
        const card = document.createElement('div'); card.className = 'reward-circle-card';
        const circle = document.createElement('div'); circle.className = 'reward-circle';
        const ring = document.createElement('div'); ring.className = 'reward-ring';
        ring.style.setProperty('--ring-color', color);
        const iconWrap = document.createElement('div'); iconWrap.className = 'reward-icon-wrap';
        if(ckey && ckey.startsWith('mat_')){
            // 仓库素材直接用合成好的官方图标
            const im = document.createElement('img');
            im.src = `static/icons/${ckey}.png`; im.alt = name;
            im.style.cssText = 'width:100%;height:100%;object-fit:contain;';
            im.addEventListener('error', () => { iconWrap.innerHTML = DROP_CHEST_SVG; });
            iconWrap.appendChild(im);
        } else if(ckey){ iconWrap.innerHTML = RESOURCE_SVGS[ckey]; tryUpgradeResIcon(iconWrap, ckey); }
        else { iconWrap.innerHTML = DROP_CHEST_SVG; }
        const num = document.createElement('div'); num.className = 'reward-num-badge'; num.textContent = `x${val}`;
        circle.appendChild(ring); circle.appendChild(iconWrap); circle.appendChild(num);
        card.appendChild(circle);
        const label = document.createElement('div'); label.className = 'reward-label'; label.textContent = name;
        card.appendChild(label);
        grid.appendChild(card);
    });
    if(grid.childElementCount === 0) return;
    DOM.rewardDetails.appendChild(grid);
    // 已发放：隐藏领取按钮，清理可能残留的外部对勾
    DOM.rewardClaimBtn.style.display = 'none';
    const oldCheck = document.querySelector('.reward-external-check'); if(oldCheck) oldCheck.remove();
    openModal('rewardModal');
}

async function purchaseGiftPack(packId){ const result=await apiPost(`/gift-packs/${packId}/purchase`); if(result){ loadGiftPacks(); loadResources(); loadTransactions(); loadRealityRewards(); const rewards=result.rewards; if(rewards&&rewards.length){ showPackRewardModal(rewards); } else showToast('领取成功'); } }

/* 兑换窗口的主体就是「多少源石 → 多少合成玉」：
   左 N、右 N×180，两侧数字随输入实时变化。
   R19：用户要求「不要写消耗1获得180，数字即可」—— 所以两侧只渲染数字，
   「消耗 / 获得」的字样整条去掉；方向由图标 + 名称 + 中间箭头表达，不会读错。
   持有量只出现在顶部那一条 —— 绝不再塞进中间箭头两边，
   因为「2 源石 → 594 合成玉」会被直接读成折算结果（用户反馈的歧义点）。 */
function updateExchangeCost(){
    const amount = Math.max(0, parseFloat(DOM.exchangeAmount?.value) || 0);
    const gained = amount * EXCHANGE_RATE_STONE_TO_ORUNDUM;
    const from = document.getElementById('exchangeOwnFrom');
    if (from) from.innerHTML = `<b>${formatWhNum(amount)}</b>`;
    const to = document.getElementById('exchangeOwnTo');
    if (to) {
        to.classList.add('is-gain');
        to.innerHTML = `<b>${formatWhNum(gained)}</b>`;
    }
    const el = DOM.exchangeCostDisplay;
    /* 这一条原来复读「1 源石 = 180 合成玉」——上方大字已经同时给出消耗与获得，
       公式属于冗余信息，用户明确要求去掉。保留容器但不填内容（CSS 里也已隐藏）。 */
    if (el) el.innerHTML = '';
    const btn = DOM.exchangeConfirm;
    if (btn) btn.disabled = amount <= 0;
}
function updateExchangeBalance(){
    const stone = state.resources.source_stone?.current_value || 0;
    const orundum = state.resources.orundum?.current_value || 0;
    if (DOM.exchangeLungmenBalance)
        DOM.exchangeLungmenBalance.innerHTML =
            '<span class="res-own-label">当前持有</span>' +
            resAmountHTML('source_stone', stone) +
            resAmountHTML('orundum', orundum);
    const maxBtn = document.getElementById('exchangeMaxBtn');
    if (maxBtn) maxBtn.textContent = `最大 ${Math.floor(stone)}`;
    updateExchangeCost();
}
function updateExchangeRateText(){
    DOM.exchangeRateText.textContent =
        `唯一允许的兑换：源石 → 合成玉（1 源石 = ${EXCHANGE_RATE_STONE_TO_ORUNDUM} 合成玉）。龙门币与源石不可被兑换出去。`;
}
/* 兑换数量步进器：−10 / −1 / 输入 / +1 / +10 / 最大 */
function bindExchangeStepper(){
    const row = document.getElementById('exchangeStepper');
    const input = DOM.exchangeAmount;
    if (!row || !input) return;
    const stoneOwned = () => Math.floor(state.resources.source_stone?.current_value || 0);
    const setAmount = v => {
        const n = Math.max(1, Math.min(Math.max(1, stoneOwned()), Math.floor(v) || 1));
        input.value = n;
        updateExchangeCost();
    };
    row.querySelectorAll('[data-step]').forEach(b => {
        b.addEventListener('click', () => setAmount((parseFloat(input.value) || 0) + parseFloat(b.dataset.step)));
    });
    const maxBtn = document.getElementById('exchangeMaxBtn');
    if (maxBtn) maxBtn.addEventListener('click', () => setAmount(stoneOwned()));
    input.addEventListener('input', updateExchangeCost);
}
async function handleExchange(){ const amount=parseFloat(DOM.exchangeAmount.value);
    if(isNaN(amount)||amount<=0){ showToast('请输入有效数量'); return; }
    const result=await apiPost('/resources/exchange',{from_type:'source_stone',to_type:'orundum',amount}); if(result){ await loadResources(); await loadTransactions(); await loadRealityRewards(); closeAllModals(); showToast('兑换成功'); } }
function updateGachaBalance(){
    const orundum = state.resources.orundum?.current_value || 0;
    if (DOM.gachaOrundumBalance)
        DOM.gachaOrundumBalance.innerHTML = `<span class="res-own-label">当前持有</span>${resAmountHTML('orundum', orundum)}`;
}
function updateGachaCostText(){
    if (DOM.gachaCostText)
        DOM.gachaCostText.innerHTML = `消耗 ${resAmountHTML('orundum', GACHA_COST_ORUNDUM)} 进行一次抽取`;
}
async function handleGacha(){ const result=await apiPost('/achievements/draw'); if(result){ DOM.gachaResult.innerHTML='';
    if(result.name){ const div=document.createElement('div'); div.className='reward-item'; div.textContent=`获得蚀刻章：${result.name}`; DOM.gachaResult.appendChild(div); loadAchievements(); }
    else DOM.gachaResult.textContent='未获得新蚀刻章';
    await loadResources(); await loadTransactions(); await loadRealityRewards(); showToast('抽取完成'); setTimeout(()=>closeAllModals(),3000); } }

/* ===== 干员寻访（抽卡）：专门产出干员信物 ===== */
/* R20：干员寻访不再走弹窗，直接切到独立视图 */
function openOperatorGacha(){
    switchView('gacha');
}
/* 内联资源小图标：任何「有图标的东西」都优先摆图标，而不是写中文名。
   传 type（exp/lungmen/source_stone/orundum/sanity 或素材 key）。 */
const RES_ICON_FILE = { exp:'exp', lungmen:'lungmen', source_stone:'source_stone', orundum:'orundum', sanity:'sanity' };
function resIconHTML(type, cls){
    const file = RES_ICON_FILE[type] || type;
    const name = (typeof GP_RES_NAME !== 'undefined' && GP_RES_NAME[type]) || matNameOf(type) || type;
    return `<img class="res-ico${cls ? ' ' + cls : ''}" src="static/icons/${file}.png" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" onerror="this.style.display='none'">`;
}
/* 图标 + 数量。数量用等宽字体，方便和旁边的图标左对齐成列。 */
function resAmountHTML(type, value, cls){
    return `<span class="res-amt${cls ? ' ' + cls : ''}">${resIconHTML(type)}<b>${formatWhNum(value)}</b></span>`;
}

function updateOperatorGachaBalance(){
    const orundum = state.resources.orundum?.current_value || 0;
    if (DOM.operatorGachaOrundumBalance)
        DOM.operatorGachaOrundumBalance.innerHTML = `<span class="res-own-label">当前持有</span>${resAmountHTML('orundum', orundum)}`;
}
function updateOperatorGachaPity(pity){
    if (!DOM.operatorGachaPity || !pity) return;
    DOM.operatorGachaPity.innerHTML =
        `<span class="gh-pity-item">累计寻访 <b>${pity.total_pulls}</b> 次</span>` +
        `<span class="gh-pity-sep"></span>` +
        `<span class="gh-pity-item">距上次 ${goldStars(6)} 已 <b>${pity.since_last_6star}</b> 抽` +
        `<span class="gh-pity-sub">再 ${pity.guaranteed_in} 抽内必出</span></span>`;
}
let gachaBusy = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function setGachaButtons(enabled){
    [DOM.operatorGachaSingle, DOM.operatorGachaTen].forEach(b => { if (b) b.disabled = !enabled; });
}

/* ── 寻访结果卡（静态展示用，与演出共用同一套卡片外观） ── */
function opResultCardHTML(r){
    const art = r.portrait ? `/static/${r.portrait}` : '';
    const tokIcon = r.token_icon ? `/static/${r.token_icon}` : '';
    const tag = r.is_new
        ? '<span class="op-tag-new">NEW</span>'
        : `<span class="op-tag-token">${tokIcon ? `<img class="op-token-icon" src="${tokIcon}" alt="">` : ''}信物 +${r.token_gain}</span>`;
    return '<div class="op-card-inner">' +
        '<div class="op-card-face op-card-back"><i class="fa-solid fa-gem"></i></div>' +
        `<div class="op-card-face op-card-front rarity-${r.rarity}">` +
            `<div class="op-card-art"${art ? ` style="background-image:url('${art}')"` : ''}>` +
                (art ? '' : '<i class="fa-solid fa-user-astronaut"></i>') +
                `<div class="op-card-stars">${goldStars(r.rarity)}</div>` +
            '</div>' +
            '<div class="op-card-info">' +
                `<div class="op-card-name">${escapeHtml(r.name)}</div>` +
                `<div class="op-card-tag">${tag}</div>` +
            '</div>' +
        '</div>' +
    '</div>';
}

/* ============================================================
   寻访演出（对齐明日方舟原版观感）
   阶段一：PRTS 连接 + 扫描线 + 光带横扫
   阶段二：卡片逐张翻牌，5★/6★ 各自打出对应颜色的光柱
   阶段三：6★ 触发全屏金色光爆
   任意时刻点击覆盖层 = 跳过
   ============================================================ */
let ghTimers = [];
let ghSkipped = false;
function ghAfter(ms, fn){ ghTimers.push(setTimeout(fn, ms)); }
function ghClearTimers(){ ghTimers.forEach(clearTimeout); ghTimers = []; }
function ghEl(id){ return document.getElementById(id); }

function ghBuildCard(r){
    const card = document.createElement('div');
    card.className = `gh-card rar-${r.rarity}`;
    const art = r.portrait ? `/static/${r.portrait}` : '';
    const tokIcon = r.token_icon ? `/static/${r.token_icon}` : '';
    const tag = r.is_new
        ? '<span class="gh-tag new">NEW</span>'
        : `<span class="gh-tag dupe">${tokIcon ? `<img src="${tokIcon}" alt="">` : ''}+${r.token_gain}</span>`;
    card.innerHTML =
        '<span class="gh-pillar"></span>' +
        '<div class="gh-card-in">' +
            '<div class="gh-face gh-back"><span class="gh-back-mark"></span></div>' +
            '<div class="gh-face gh-front">' +
                `<div class="gh-art"${art ? ` style="background-image:url('${art}')"` : ''}></div>` +
                '<div class="gh-front-veil"></div>' +
                `<div class="gh-front-body">` +
                    `<span class="gh-front-stars">${goldStars(r.rarity)}</span>` +
                    `<span class="gh-front-name">${escapeHtml(r.name)}</span>` +
                    tag +
                '</div>' +
            '</div>' +
        '</div>' +
        `<span class="gh-burst">${goldStars(r.rarity)}</span>`;
    return card;
}

/* 阶段一：拉起舞美 + PRTS 连接。返回一个 Promise，代表连接演出走完。
   调用方可以拿它和 /gacha/operator 请求并行跑，省掉等待时间。 */
function ghStartStage(){
    const stage = ghEl('ghStage');
    const reveal = ghEl('ghReveal');
    const bootText = ghEl('ghBootText');
    const bootBar = ghEl('ghBootBar');
    ghClearTimers();
    ghSkipped = false;
    if (reveal) reveal.innerHTML = '';
    if (!stage) return sleep(1200);
    stage.className = 'gh-stage showing boot';
    stage.classList.remove('hidden');
    if (bootBar) bootBar.style.width = '0%';
    return (async () => {
        ghAfter(60, () => { if (bootBar) bootBar.style.width = '100%'; });
        const lines = ['正在建立连接…', 'PRTS 数据链路同步中…', '寻访数据解析中…'];
        for (const t of lines){
            if (ghSkipped) return;
            if (bootText) bootText.textContent = t;
            await sleep(ghPace(430));
        }
        await sleep(ghSkipped ? 0 : 210);
    })();
}
// 跳过时把剩下的等待压成 0，演出立刻收尾
function ghPace(ms){ return ghSkipped ? 0 : ms; }

async function playGachaShow(results, bootPromise){
    const stage = ghEl('ghStage');
    if (!stage){ return; }
    const reveal = ghEl('ghReveal');
    await (bootPromise || sleep(0));
    if (ghSkipped) return;
    stage.classList.remove('boot');
    stage.classList.add('reveal');

    const cards = [];
    results.forEach(r => {
        const c = ghBuildCard(r);
        reveal.appendChild(c);
        cards.push(c);
    });
    await sleep(60);
    if (ghSkipped) { cards.forEach(c => c.classList.add('shown', 'flipped')); return; }
    cards.forEach(c => c.classList.add('shown'));

    // ── 阶段二：逐张翻牌 ──
    const flipGap = results.length > 6 ? 155 : 260;
    cards.forEach((c, i) => {
        ghAfter(320 + i * flipGap, () => {
            if (ghSkipped) return;
            c.classList.add('flipped');
            const rar = parseInt(c.className.match(/rar-(\d)/)?.[1] || '3', 10);
            if (rar >= 5){
                stage.classList.add(rar >= 6 ? 'flare-six' : 'flare-five');
                ghAfter(rar >= 6 ? 760 : 380, () => stage.classList.remove('flare-five', 'flare-six'));
            }
            if (rar >= 6) c.classList.add('hit-six');
        });
    });
    const total = 320 + (cards.length - 1) * flipGap + 720;
    await sleep(total);
    if (ghSkipped) return;
    // 展示完自动收起；也可以点一下立刻收
    await sleep(1600);
    if (!ghSkipped) ghCloseShow();
}

function ghSkipShow(){
    if (ghSkipped) return;
    ghSkipped = true;
    ghClearTimers();
    const stage = ghEl('ghStage');
    if (!stage) return;
    stage.classList.remove('boot', 'flare-five', 'flare-six');
    stage.classList.add('reveal');
    stage.querySelectorAll('.gh-card').forEach(c => { c.classList.add('shown', 'flipped'); });
    setTimeout(ghCloseShow, 620);
}

function ghCloseShow(){
    ghClearTimers();
    const stage = ghEl('ghStage');
    if (!stage) return;
    stage.classList.add('closing');
    setTimeout(() => {
        stage.className = 'gh-stage hidden';
        const reveal = ghEl('ghReveal');
        if (reveal) reveal.innerHTML = '';
    }, 260);
}

/* 静态结果列表（演出结束后留在弹窗里，方便回看抽到了什么） */
async function renderOperatorGachaResults(results){
    const box = DOM.operatorGachaResult;
    box.innerHTML = '';
    results.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = `op-card rarity-${r.rarity}`;
        card.style.animationDelay = `${i * 0.05}s`;
        card.innerHTML = opResultCardHTML(r);
        box.appendChild(card);
        setTimeout(() => {
            card.classList.add('flipped');
            if (r.rarity >= 6) card.classList.add('just-got');
        }, 40 + i * 60);
    });
    await sleep(40 + results.length * 60 + 320);
}

async function handleOperatorGacha(count){
    const cost = OPERATOR_GACHA_COST * count;
    const orundum = state.resources.orundum?.current_value || 0;
    if (orundum < cost){ showToast('合成玉不足'); return; }
    if (gachaBusy) return;
    gachaBusy = true; setGachaButtons(false);
    DOM.operatorGachaResult.innerHTML = '';
    closeAllModals();                     // 演出走全屏，弹窗先让位
    // 阶段一（PRTS 连接）与后端请求并行跑，动画至少演满，但不额外增加等待
    const boot = ghStartStage();
    let result = null;
    try {
        // 注意：apiPost 已解包 json.data，这里直接用 result，不能再取 .data
        result = await apiPost('/gacha/operator', { count });
    } catch (e) { /* 下面统一处理 */ }
    try {
        if (!result || !result.results){
            await boot;
            ghCloseShow();
            showToast('寻访失败，请重试');
            return;
        }
        await playGachaShow(result.results, boot);
        await renderOperatorGachaResults(result.results);
        updateOperatorGachaBalance();
        updateOperatorGachaPity(result.pity);
        await loadResources(); await loadTransactions(); await loadRealityRewards();
        await loadOperatorRecords();
        switchView('gacha');               // 演出结束回到寻访视图看结果
        showToast(`寻访完成，消耗合成玉 ${result.cost}`);
    } finally {
        gachaBusy = false; setGachaButtons(true);
    }
}

/* ===== 时装商店（源石购买，价格档位对齐原版） ===== */
let skinFilter = 'all';
let skinCache = [];
let skinShelf = [];          // 每周轮换的货架（可能含未持有干员的时装）
let skinLoadFailed = false;  // 上一次 /skins 是否加载失败（用于区分"空货架"和"服务没起来"）
/* R20：时装商店并入「采购中心 · 时装兑换」 */
async function openSkinShop(){
    switchView('shop');
    switchShopTab('skin');
    await loadSkins();
}
async function loadSkins(){
    const data = await apiGet('/skins');
    if (!data){
        /* R20：后端没起来（或接口 500）时，apiGet 会返回 null。
           以前这里直接 return，货架保持空数组，再点一下筛选就显示
           「该筛选条件下没有时装」—— 把「服务没起来」误导成「没有这件时装」。
           现在记一个失败标记，让 renderSkins 说清楚真正的原因。 */
        skinLoadFailed = true;
        renderSkins();
        return;
    }
    skinLoadFailed = false;
    skinCache = data.skins || [];
    skinShelf = data.shop || [];
    if (DOM.skinShopBalance)
        DOM.skinShopBalance.innerHTML = `<span class="res-own-label">当前持有</span>${resAmountHTML('source_stone', data.source_stone)}`;
    renderSkins();
}
/* 单张时装的卡片。unlocked=false 表示这件皮肤的主人还没抽到 —— 只给预览不给下单。 */
function buildSkinCard(s, stone){
    const card = document.createElement('div');
    card.className = `skin-card${s.owned ? ' owned' : ''}${s.unlocked === false ? ' locked' : ''}`;
    const canBuy = s.unlocked !== false;
    const btn = s.owned
        ? '<span class="skin-owned-tag"><i class="fa-solid fa-check"></i>已拥有</span>'
        : (canBuy
            ? `<button class="game-btn skin-buy-btn" data-skin="${s.skin_id}"${stone < s.cost ? ' disabled' : ''}><span>购买</span></button>`
            : '<span class="skin-locked-tag"><i class="fa-solid fa-lock"></i>待解锁</span>');
    const img = s.image ? `/static/${s.image}` : '';
    card.innerHTML =
        `<div class="skin-art" data-skin-id="${escapeHtml(s.skin_id || '')}"${img ? ` style="background-image:url('${img}')"` : ''}>` +
            (img ? '' : '<i class="fa-solid fa-shirt"></i>') +
            (img ? '<span class="skin-zoom"><i class="fa-solid fa-magnifying-glass-plus"></i></span>' : '') +
            `<span class="skin-rarity">${goldStars(s.rarity)}</span>` +
            (s.owned ? '<span class="skin-owned-badge"><i class="fa-solid fa-check"></i></span>' : '') +
            (s.unlocked === false ? '<span class="skin-lock-badge"><i class="fa-solid fa-lock"></i></span>' : '') +
        '</div>' +
        `<div class="skin-card-body">` +
            `<div class="skin-card-top"><span class="skin-op-name">${escapeHtml(s.operator_name)}</span>` +
            (s.series ? `<span class="skin-series">${escapeHtml(s.series)}</span>` : '') + '</div>' +
            `<div class="skin-name">${escapeHtml(s.skin_name)}</div>` +
            `<div class="skin-tier">${escapeHtml(s.tier_label)}</div>` +
            `<div class="skin-card-bottom">${resAmountHTML('source_stone', s.cost, 'skin-price')}${btn}</div>` +
        '</div>';
    return card;
}
function renderSkins(){
    const list = DOM.skinShopList; if (!list) return;
    bindSkinPreview();
    const stone = state.resources.source_stone?.current_value || 0;
    const pass = s => skinFilter === 'owned'
        ? s.owned
        : (skinFilter === 'all' || String(s.rarity) === skinFilter);
    const items = skinCache.filter(pass);
    const shelf = skinShelf.filter(pass);
    list.innerHTML = '';

    const addSection = (kicker, note, arr, locked) => {
        if (!arr.length) return;
        const head = document.createElement('div');
        head.className = 'skin-section-head';
        head.innerHTML = `<span class="skin-section-kicker">${kicker}</span>` +
            (note ? `<span class="skin-section-note">${note}</span>` : '');
        list.appendChild(head);
        const grid = document.createElement('div');
        grid.className = 'skin-section-grid';
        arr.forEach(s => grid.appendChild(buildSkinCard(s, stone)));
        list.appendChild(grid);
    };

    // 没有可购买的时装时，明确告诉用户还差哪一步，但货架照样铺满（不至于白屏）
    if (!items.length && !shelf.length){
        const empty = document.createElement('div');
        empty.className = 'skin-empty';
        // 区分两种"空"：服务没起来 vs 真的没有符合筛选的时装
        empty.innerHTML = skinLoadFailed
            ? '<i class="fa-solid fa-plug-circle-xmark"></i> 时装数据没加载出来——后端服务可能没启动。'
              + '<br><span class="skin-empty-hint">先运行「一键启动.bat」，再重新打开这个窗口。</span>'
            : '该筛选条件下没有时装';
        list.appendChild(empty);
        return;
    }
    // 没有可购买的时装时，明确说清原因，别让用户以为是坏了
    if (!items.length && shelf.length){
        const hint = document.createElement('div');
        hint.className = 'skin-empty-buy';
        hint.innerHTML = '<i class="fa-solid fa-circle-info"></i>' +
            '<span>还没有可购买的时装——先去「干员寻访」抽到干员，他的时装就能下单了。下面的货架可以先看个眼缘。</span>';
        list.appendChild(hint);
    }
    addSection('可购买', items.length ? `${items.length} 件属于已持有干员` : '', items, false);
    addSection('商店货架 · 每日轮换', '未持有干员的时装只可预览，抽到干员后即可购买', shelf, true);

    list.querySelectorAll('.skin-buy-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinPurchase(b.dataset.skin));
    });
}
async function handleSkinPurchase(skinId){
    const data = await apiPost('/skins/purchase', { skin_id: skinId });
    if (!data) return;
    showToast(`已购买「${data.purchased.skin_name}」`);
    await loadResources(); await loadTransactions();
    await loadSkins();
}
/* 时装大图预览：点立绘弹出全屏大图 */
let skinLightbox = null;
/* ===== 大图预览的缩放系统：滚轮 / 双指捏合 / 拖动平移 / 双击复位 =====
   用 transform: translate(tx,ty) scale(s) 表达，范围 1x ~ 4x。
   缩放锚点算法：让指针（或两指中点）下方那一点在缩放前后停在原地——
   否则滚轮会把画面越推越偏，这也是大多数自研缩放最容易被察觉的破绽。 */
const SKIN_ZOOM_MIN = 1, SKIN_ZOOM_MAX = 4;
const skinZoom = {
    scale: 1, tx: 0, ty: 0,
    dragging: false, moved: false,
    startX: 0, startY: 0, startTx: 0, startTy: 0,
    pinchDist: 0,
};
function skinImageEl(){ return skinLightbox ? skinLightbox.querySelector('.skin-lightbox-img') : null; }
function skinApplyZoom(){
    const im = skinImageEl(); if (!im) return;
    // 回到 1:1 且无位移时清掉 transform，避免残留子像素让立绘发虚
    im.style.transform = (skinZoom.scale === 1 && skinZoom.tx === 0 && skinZoom.ty === 0)
        ? ''
        : `translate(${skinZoom.tx}px, ${skinZoom.ty}px) scale(${skinZoom.scale})`;
    if (skinLightbox) {
        skinLightbox.classList.toggle('is-zoomed', skinZoom.scale > 1.001);
        const val = skinLightbox.querySelector('.skin-lightbox-zoomval');
        if (val) val.textContent = skinZoom.scale > 1.001 ? skinZoom.scale.toFixed(1) + '×' : '';
    }
}
function skinResetZoom(){
    skinZoom.scale = 1; skinZoom.tx = 0; skinZoom.ty = 0; skinZoom.moved = false;
    skinApplyZoom();
}
function skinZoomAt(clientX, clientY, factor){
    const im = skinImageEl(); if (!im) return;
    const next = Math.min(SKIN_ZOOM_MAX, Math.max(SKIN_ZOOM_MIN, skinZoom.scale * factor));
    if (Math.abs(next - skinZoom.scale) < 1e-4) return;
    const k = next / skinZoom.scale;
    const r = im.getBoundingClientRect();
    // 未变换时的元素中心 = 当前可视中心 − 当前平移量（translate 在最外层，不受 scale 影响）
    const c0x = r.left + r.width / 2 - skinZoom.tx;
    const c0y = r.top + r.height / 2 - skinZoom.ty;
    const dx = clientX - c0x, dy = clientY - c0y;
    skinZoom.tx = dx * (1 - k) + k * skinZoom.tx;
    skinZoom.ty = dy * (1 - k) + k * skinZoom.ty;
    skinZoom.scale = next;
    if (next === SKIN_ZOOM_MIN) { skinZoom.tx = 0; skinZoom.ty = 0; }
    skinApplyZoom();
}
function skinBindZoom(box){
    const im = box.querySelector('.skin-lightbox-img');

    // 滚轮缩放（以指针所在点为锚点）
    box.addEventListener('wheel', e => {
        if (box.classList.contains('hidden')) return;
        e.preventDefault();
        skinZoomAt(e.clientX, e.clientY, Math.pow(1.0016, -e.deltaY));
    }, { passive: false });
    // 触控板/触屏的双指捏合，浏览器在部分平台会转成 ctrl+wheel 派发
    box.addEventListener('wheel', () => {}, { passive: true });

    // 双击：已放大则复位，否则以双击点为锚点放大
    im.addEventListener('dblclick', e => {
        e.preventDefault();
        if (skinZoom.scale > 1.001) skinResetZoom();
        else skinZoomAt(e.clientX, e.clientY, 2.2);
    });

    // 鼠标拖动平移（仅在放大后生效，避免和「点图即关」冲突）
    im.addEventListener('mousedown', e => {
        if (skinZoom.scale <= 1.001) return;
        e.preventDefault();
        skinZoom.dragging = true; skinZoom.moved = false;
        skinZoom.startX = e.clientX; skinZoom.startY = e.clientY;
        skinZoom.startTx = skinZoom.tx; skinZoom.startTy = skinZoom.ty;
        im.classList.add('is-dragging');
    });
    window.addEventListener('mousemove', e => {
        if (!skinZoom.dragging) return;
        const dx = e.clientX - skinZoom.startX, dy = e.clientY - skinZoom.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) skinZoom.moved = true;
        skinZoom.tx = skinZoom.startTx + dx;
        skinZoom.ty = skinZoom.startTy + dy;
        skinApplyZoom();
    });
    window.addEventListener('mouseup', () => {
        if (!skinZoom.dragging) return;
        skinZoom.dragging = false;
        im.classList.remove('is-dragging');
    });

    // 触屏：双指捏合缩放 + 放大后单指拖动
    let singleStart = null;
    im.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            singleStart = null;
            skinZoom.pinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY);
        } else if (e.touches.length === 1 && skinZoom.scale > 1.001) {
            singleStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: skinZoom.tx, ty: skinZoom.ty };
        }
    }, { passive: true });
    im.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY);
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            if (skinZoom.pinchDist > 0 && d > 0) skinZoomAt(cx, cy, d / skinZoom.pinchDist);
            skinZoom.pinchDist = d;
        } else if (e.touches.length === 1 && singleStart) {
            e.preventDefault();
            skinZoom.tx = singleStart.tx + (e.touches[0].clientX - singleStart.x);
            skinZoom.ty = singleStart.ty + (e.touches[0].clientY - singleStart.y);
            skinApplyZoom();
        }
    }, { passive: false });
    im.addEventListener('touchend', e => {
        if (e.touches.length < 2) skinZoom.pinchDist = 0;
        if (e.touches.length === 0) singleStart = null;
    });
}
function ensureSkinLightbox(){
    if (skinLightbox) return skinLightbox;
    skinLightbox = document.createElement('div');
    skinLightbox.id = 'skinLightbox';
    skinLightbox.className = 'skin-lightbox hidden';
    skinLightbox.innerHTML =
        '<div class="skin-lightbox-backdrop"></div>' +
        '<div class="skin-lightbox-stage">' +
            '<div class="skin-lightbox-hint">' +
                '<i class="fa-solid fa-magnifying-glass-plus"></i>' +
                '<span>滚轮 / 双指缩放 · 拖动平移 · 双击复位</span>' +
                '<b class="skin-lightbox-zoomval"></b>' +
            '</div>' +
            '<img class="skin-lightbox-img" alt="时装预览">' +
            '<div class="skin-lightbox-cap"></div>' +
            '<button class="icon-btn skin-lightbox-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
    document.body.appendChild(skinLightbox);
    skinLightbox.querySelector('.skin-lightbox-backdrop').addEventListener('click', closeSkinPreview);
    skinLightbox.querySelector('.skin-lightbox-close').addEventListener('click', closeSkinPreview);
    // 点画面以外的任何地方都退出：舞台留白、说明文字、背景都算「空白处」
    const stage = skinLightbox.querySelector('.skin-lightbox-stage');
    stage.addEventListener('click', e => {
        // 刚拖完画面松手（放大态下的平移）不应被当成「点了空白处」
        if (skinZoom.moved) { skinZoom.moved = false; return; }
        if (e.target.closest('.skin-lightbox-img') || e.target.closest('.skin-lightbox-close')) return;
        closeSkinPreview();
    });
    skinBindZoom(skinLightbox);
    return skinLightbox;
}
/* 预览优先用官方原图（1024×1024，从 assets-source 按需取），
   取不到再退回 512 缩略图 —— 这样放大到接近满屏也不会糊。 */
function openSkinPreview(imgUrl, opName, skinName, fallbackUrl){
    const box = ensureSkinLightbox();
    const im = box.querySelector('.skin-lightbox-img');
    im.onerror = () => { if (fallbackUrl && im.src !== fallbackUrl) im.src = fallbackUrl; im.onerror = null; };
    im.src = imgUrl || fallbackUrl || '';
    box.querySelector('.skin-lightbox-cap').textContent = `${opName} · ${skinName}`;
    skinResetZoom();          // 每次打开都从 1:1 开始，不继承上一张的缩放
    box.classList.remove('hidden');
    requestAnimationFrame(() => box.classList.add('show'));
}
function closeSkinPreview(){
    if (!skinLightbox) return;
    skinResetZoom();
    skinLightbox.classList.remove('show');
    setTimeout(() => skinLightbox.classList.add('hidden'), 200);
}
function bindSkinPreview(){
    if (!DOM.skinShopList || DOM.skinShopList.dataset.previewBound) return;
    DOM.skinShopList.dataset.previewBound = '1';
    DOM.skinShopList.addEventListener('click', (e) => {
        const art = e.target.closest('.skin-art');
        if (!art) return;
        const bg = art.style.backgroundImage;
        const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
        const thumb = m ? m[1] : '';
        if (!thumb) return;
        const card = art.closest('.skin-card');
        const op = card && card.querySelector('.skin-op-name') ? card.querySelector('.skin-op-name').textContent : '';
        const nm = card && card.querySelector('.skin-name') ? card.querySelector('.skin-name').textContent : '';
        const sid = art.dataset.skinId || '';
        const full = sid ? `/api/skin/full/${encodeURIComponent(sid)}` : thumb;
        openSkinPreview(full, op, nm, thumb);
    });
}
/* 本期精选卡池：把每日轮换的干员立绘铺出来。
   抽卡记录为空时，这里是弹窗里唯一有画面的地方 —— 所以不能省。 */
function renderOperatorFeatured(featured){
    const box = DOM.operatorFeatured;
    if (!box) return;
    box.innerHTML = '';
    if (!featured) return;
    const hero = (featured.six || [])[0];
    const five = featured.five || [];
    const four = featured.four || [];
    if (!hero && !five.length && !four.length) return;

    const head = document.createElement('div');
    head.className = 'op-featured-head';
    head.innerHTML = '<span class="op-featured-kicker">本 期 精 选</span>' +
        `<span class="op-featured-date">${escapeHtml(featured.date || '')} · 每日轮换</span>`;
    box.appendChild(head);

    if (hero){
        const art = hero.portrait ? `/static/${hero.portrait}` : '';
        const tok = hero.token_icon ? `/static/${hero.token_icon}` : '';
        const el = document.createElement('div');
        el.className = 'op-hero';
        el.innerHTML =
            `<div class="op-hero-art"${art ? ` style="background-image:url('${art}')"` : ''}></div>` +
            '<div class="op-hero-veil"></div>' +
            '<div class="op-hero-info">' +
                '<span class="op-hero-rarity">' + goldStars(hero.rarity) + '</span>' +
                `<span class="op-hero-name">${escapeHtml(hero.name)}</span>` +
                '<span class="op-hero-sub">' +
                    (tok ? `<img class="op-hero-token" src="${tok}" alt="">` : '') +
                    '<span>寻访获得后信物自动入库</span>' +
                '</span>' +
            '</div>';
        box.appendChild(el);
    }

    const chips = (title, arr, cls) => {
        if (!arr.length) return;
        const wrap = document.createElement('div');
        wrap.className = 'op-featured-row';
        const t = document.createElement('span');
        t.className = 'op-featured-row-title';
        t.textContent = title;
        wrap.appendChild(t);
        const strip = document.createElement('div');
        strip.className = 'op-featured-strip';
        arr.forEach(o => {
            const art = o.portrait ? `/static/${o.portrait}` : '';
            const c = document.createElement('div');
            c.className = `op-chip rarity-${o.rarity} ${cls}`;
            c.innerHTML =
                `<span class="op-chip-art"${art ? ` style="background-image:url('${art}')"` : ''}>` +
                    (art ? '' : '<i class="fa-solid fa-user"></i>') +
                    `<span class="op-chip-star">${goldStars(o.rarity)}</span>` +
                '</span>' +
                `<span class="op-chip-name">${escapeHtml(o.name)}</span>`;
            strip.appendChild(c);
        });
        wrap.appendChild(strip);
        box.appendChild(wrap);
    };
    chips('五星 · 概率提升', five, 'md');
    chips('四星 · 常驻', four, 'sm');
}

async function loadOperatorRecords(){
    // apiGet 同样已解包，直接用返回值
    const data = await apiGet('/gacha/operator/records');
    if (!data) return;
    const { operators, pity } = data;
    updateOperatorGachaPity(pity);
    renderOperatorFeatured(data.featured);
    const list = DOM.operatorTokenList;
    if (!list) return;
    list.innerHTML = '';
    if (!operators.length){ list.innerHTML = '<div class="wh-empty">尚未寻访到干员，去抽卡试试吧</div>'; return; }
    operators.forEach(o => {
        const row = document.createElement('div');
        row.className = `op-token-row rarity-${o.rarity}`;
        const art = o.portrait ? `/static/${o.portrait}` : '';
        const tok = o.token_icon ? `/static/${o.token_icon}` : '';
        row.innerHTML =
            `<span class="op-row-art"${art ? ` style="background-image:url('${art}')"` : ''}>` +
                (art ? '' : '<i class="fa-solid fa-user"></i>') + '</span>' +
            `<span class="op-row-main"><span class="op-name">${escapeHtml(o.name)}</span>` +
            `<span class="op-star">${goldStars(o.rarity)}</span></span>` +
            `<span class="op-count">持有 <b>${o.copies}</b></span>` +
            `<span class="op-token-badge">${tok ? `<img class="op-token-icon" src="${tok}" alt="">` : ''}<b>${o.tokens}</b></span>`;
        list.appendChild(row);
    });
}

function openModal(id){ const modal = document.getElementById(id); if(modal){ modal.classList.add('show'); modal.classList.remove('hidden'); } DOM.modalOverlay.classList.add('show'); }
function closeAllModals(){
    if (rewardModalTimer) { clearTimeout(rewardModalTimer); rewardModalTimer = null; }
    rewardModalOpenTaskId = null;
    document.querySelectorAll('.modal-container').forEach(m=>{ m.classList.remove('show'); m.classList.add('hidden'); m.style.transform=''; m.style.opacity=''; }); DOM.modalOverlay.classList.remove('show');
    // 清理外部对勾
    const extCheck = document.querySelector('.reward-external-check'); if(extCheck) extCheck.remove();
}

/* ===== ESC 全局返回/关闭 =====
   优先级从「最上层」往「最下层」走：下拉菜单 → 大图预览 → 弹窗 → 侧边栏。
   每一步只关一层，连按 ESC 就一层层往回退。 */
function handleGlobalEscape(){
    // 1) 自定义下拉菜单
    const dds = document.querySelectorAll('.custom-dropdown.open');
    if (dds.length) { closeAllCustomDropdowns(); return; }
    // 2) 时装大图预览
    if (skinLightbox && !skinLightbox.classList.contains('hidden')) { closeSkinPreview(); return; }
    // 3) 弹窗：关掉可见的最后一个（后来居上，符合「返回上一层」的直觉）
    const opens = [...document.querySelectorAll('.modal-container')]
        .filter(m => m.classList.contains('show') && !m.classList.contains('hidden'));
    if (opens.length) { closeTopModal(opens[opens.length - 1]); return; }
}
// 兜底注册：即使页面上的自定义下拉初始化没跑，ESC 也必须能关窗口
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        e.target.blur();
        return;
    }
    handleGlobalEscape();
});
function closeTopModal(m){
    m.classList.remove('show');
    m.classList.add('hidden');
    m.style.transform = '';
    m.style.opacity = '';
    // 还有别的弹窗开着就保留遮罩，否则一并撤掉
    const stillOpen = [...document.querySelectorAll('.modal-container')]
        .some(x => x.classList.contains('show') && !x.classList.contains('hidden'));
    if (!stillOpen) {
        if (DOM.modalOverlay) DOM.modalOverlay.classList.remove('show');
        if (typeof rewardModalTimer !== 'undefined' && rewardModalTimer) { clearTimeout(rewardModalTimer); rewardModalTimer = null; }
        if (typeof rewardModalOpenTaskId !== 'undefined') rewardModalOpenTaskId = null;
        const extCheck = document.querySelector('.reward-external-check'); if (extCheck) extCheck.remove();
    }
}

/* ===== 仓库（素材 + 基础货币） ===== */
// 素材图鉴：按稀有度分四档；仓库展示全部素材及已收集数量
/* =========================================================
   仓库素材目录
   由 build_warehouse.py 从官方 gamedata/excel/item_table.json 生成，
   含官方中文名 / 分类 / 稀有度(0灰 1绿 2蓝 3紫 4金 5传说)。
   等级不写文字 —— 玩家看图标背景色即可分辨。
   ========================================================= */
let WAREHOUSE_CATALOG = [];
let WAREHOUSE_CATALOG_LOADED = false;

// 分类顺序（明日方舟仓库惯例）：养成消耗在前，信物最后
const WH_CAT_ORDER = ['作战记录', '技巧概要', '芯片', '模组', '素材', '信物'];

async function loadWarehouseCatalog(){
    if (WAREHOUSE_CATALOG_LOADED) return WAREHOUSE_CATALOG;
    try {
        const r = await fetch('static/warehouse_catalog.json', { cache: 'no-cache' });
        const d = await r.json();
        WAREHOUSE_CATALOG = (d && d.items) ? d.items : [];
    } catch(e){
        console.error('[warehouse] 目录加载失败', e);
        WAREHOUSE_CATALOG = [];
    }
    WAREHOUSE_CATALOG_LOADED = true;
    return WAREHOUSE_CATALOG;
}

function formatWhNum(n){ n = Number(n) || 0; return Math.floor(n).toLocaleString('en-US'); }

async function openWarehouse(){
    try {
        await loadWarehouseCatalog();
        // 注意：apiGet 内部已经拼了 API_BASE('/api')，这里只能写 '/inventory'。
        // 之前写成 '/api/inventory' → 实际请求 /api/api/inventory → 404 → 返回 null，
        // 仓库整仓回落成空对象：龙门币/源石/合成玉全 0、素材 0/564。
        // 另外 apiGet 已 return json.data ?? json，拿到的就是 {currencies, materials}，不用再取 .data。
        const data = await apiGet('/inventory');
        renderWarehouse(data && data.currencies ? data : {currencies:{}, materials:[]});
        openModal('warehouseModal');
    } catch(e){ console.error('[warehouse]', e); if (typeof showToast === 'function') showToast('仓库加载失败'); }
}

// 领取奖励后刷新仓库数据（素材进了 inventory，仓库需同步）
async function loadInventory(){
    try {
        const d = await apiGet('/inventory');
        if (!d || !d.currencies) return;
        state.inventory = d;
        // 仓库弹窗开着时立即重绘，避免"领了奖励但仓库还是旧数字"
        const wh = document.getElementById('warehouseModal');
        if (wh && wh.classList.contains('show')) renderWarehouse(d);
    } catch(e){ /* 静默失败，不影响主流程 */ }
}

function renderWarehouse(data){
    const currencies = data.currencies || {};
    const inv = {};
    (data.materials || []).forEach(m => { inv[m.type] = m.qty; });

    // 基础货币（不写分组标题）
    const curMap = [
        ['lungmen', '龙门币'], ['source_stone', '源石'], ['orundum', '合成玉'],
    ];
    const curWrap = document.getElementById('warehouseCurrencies');
    if (curWrap){
        curWrap.innerHTML = '';
        curMap.forEach(([key, name]) => {
            const val = currencies[key] || 0;
            const card = document.createElement('div');
            card.className = 'wh-cur-card';
            const icon = document.createElement('div'); icon.className = 'wh-cur-icon'; icon.dataset.key = key;
            icon.innerHTML = RESOURCE_SVGS[key] || DROP_CHEST_SVG; tryUpgradeResIcon(icon, key);
            const info = document.createElement('div'); info.className = 'wh-cur-info';
            info.innerHTML = `<div class="wh-cur-val">${formatWhNum(val)}</div><div class="wh-cur-name">${name}</div>`;
            card.appendChild(icon); card.appendChild(info);
            curWrap.appendChild(card);
        });
    }

    // 素材：按「类别」分组，不标注等级（等级看图标背景色）
    const grid = document.getElementById('warehouseMatWrap');
    if (!grid) return;
    grid.innerHTML = '';

    if (!WAREHOUSE_CATALOG.length){
        grid.innerHTML = '<div class="wh-empty">素材目录未生成，请先运行 build_warehouse.py</div>';
        return;
    }

    let owned = 0, total = 0;

    WH_CAT_ORDER.forEach(cat => {
        const items = WAREHOUSE_CATALOG.filter(x => x.cat === cat);
        if (!items.length) return;

        const sec = document.createElement('div');
        sec.className = 'wh-cat' + (cat === '信物' ? ' wh-cat-collapsed' : '');

        const head = document.createElement('div');
        head.className = 'wh-cat-head';
        const catOwned = items.filter(x => (inv[x.key] || 0) > 0).length;
        head.innerHTML = `<span class="wh-cat-name">${cat}</span><span class="wh-cat-count">${catOwned}/${items.length}</span>`;
        // 信物数量多，默认折叠，点击展开
        if (cat === '信物'){
            head.classList.add('wh-cat-toggle');
            head.addEventListener('click', () => sec.classList.toggle('wh-cat-collapsed'));
        }
        sec.appendChild(head);

        const g = document.createElement('div');
        g.className = 'wh-mat-grid';

        items.forEach(it => {
            total++;
            const qty = Math.floor(inv[it.key] || 0);
            if (qty > 0) owned++;
            const cell = document.createElement('div');
            cell.className = 'wh-mat wh-r' + it.r + (qty > 0 ? '' : ' wh-mat-empty');
            cell.title = it.name;

            const icon = document.createElement('img');
            icon.className = 'wh-mat-icon';
            icon.src = `static/icons/${it.key}.png`;
            icon.alt = it.name;
            icon.loading = 'lazy';           // 数量多，滚动到才加载
            icon.decoding = 'async';
            icon.addEventListener('error', () => { icon.style.visibility = 'hidden'; });

            const qtyEl = document.createElement('div');
            qtyEl.className = 'wh-mat-qty';
            qtyEl.textContent = 'x' + formatWhNum(qty);

            const nm = document.createElement('div');
            nm.className = 'wh-mat-name';
            nm.textContent = it.name;

            cell.appendChild(icon); cell.appendChild(qtyEl); cell.appendChild(nm);
            g.appendChild(cell);
        });

        sec.appendChild(g);
        grid.appendChild(sec);
    });

    const prog = document.getElementById('warehouseProgress');
    if (prog) prog.textContent = `已收集 ${owned} / ${total} 种`;
}

function closeWarehouse(){ closeAllModals(); }

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

/* =========================================================
   自定义下拉组件（替换原生 select）：无浏览器闪白、带入场动画
   ========================================================= */
function initCustomDropdowns(){
    document.querySelectorAll('.custom-dropdown').forEach(dd=>{
        const targetId = dd.dataset.target;
        const sel = document.getElementById(targetId);
        const trigger = dd.querySelector('.custom-dropdown-trigger');
        const menu = dd.querySelector('.custom-dropdown-menu');
        if(!sel || !trigger || !menu) return;

        trigger.addEventListener('click', e => {
            e.stopPropagation();
            const wasOpen = dd.classList.contains('open');
            closeAllCustomDropdowns();
            if(!wasOpen) dd.classList.add('open');
        });

        menu.addEventListener('click', e => {
            const li = e.target.closest('li[data-value]');
            if(!li) return;
            const val = li.dataset.value;
            const text = li.textContent;
            sel.value = val;
            sel.dispatchEvent(new Event('change', { bubbles:true }));
            trigger.querySelector('.custom-dropdown-label').textContent = text;
            syncCustomDropdownSelection(dd, val);
            dd.classList.remove('open');
        });
    });

    // 初始化一次选中态
    document.querySelectorAll('.custom-dropdown').forEach(dd => {
        const sel = document.getElementById(dd.dataset.target);
        if(sel) syncCustomDropdownSelection(dd, sel.value);
    });

    // 点击外部关闭；ESC 统一交给全局 handleGlobalEscape（避免两处各关一层）
    document.addEventListener('click', closeAllCustomDropdowns);
}
function closeAllCustomDropdowns(){
    document.querySelectorAll('.custom-dropdown.open').forEach(dd=>dd.classList.remove('open'));
}
function syncCustomDropdownSelection(dd, value){
    const trigger = dd.querySelector('.custom-dropdown-trigger');
    const menu = dd.querySelector('.custom-dropdown-menu');
    let matched = false;
    menu.querySelectorAll('li').forEach(li=>{
        const isSelected = li.dataset.value === value;
        li.classList.toggle('selected', isSelected);
        if(isSelected){
            trigger.querySelector('.custom-dropdown-label').textContent = li.textContent;
            matched = true;
        }
    });
    if(!matched){
        const first = menu.querySelector('li');
        if(first) trigger.querySelector('.custom-dropdown-label').textContent = first.textContent;
    }
}
/* 根据隐藏 select 的 options 重建自定义下拉菜单（用于分类动态变化） */
function rebuildCustomDropdown(selectId){
    const sel = document.getElementById(selectId); if(!sel) return;
    const dd = document.querySelector('.custom-dropdown[data-target="'+selectId+'"]'); if(!dd) return;
    const menu = dd.querySelector('.custom-dropdown-menu'); if(!menu) return;
    const current = sel.value;
    menu.innerHTML = '';
    Array.from(sel.options).forEach(opt => {
        const li = document.createElement('li');
        li.setAttribute('role','option');
        li.dataset.value = opt.value;
        li.textContent = opt.textContent;
        menu.appendChild(li);
    });
    syncCustomDropdownSelection(dd, current);
}

function applyFilters(){ state.filter.status=DOM.filterStatus.value; state.filter.priority=DOM.filterPriority.value; state.filter.taskLine=DOM.filterTaskLine.value;
    state.filter.track=DOM.filterTrack.value; state.filter.category=DOM.filterCategory.value;
    state.filter.tracked=DOM.filterTracked.value; state.filter.search=DOM.filterSearch.value; state.filter.showArchived=DOM.showArchived.checked; state.filter.showDeleted=DOM.showDeleted.checked;
    renderTasks(); }

function renderCategoryFilter(){
    const sel=DOM.filterCategory; if(!sel) return;
    const current=state.filter.category;
    const cats=state.settings.categories||[];
    sel.innerHTML='<option value="">全部分类</option>';
    cats.forEach(cat=>{ const o=document.createElement('option'); o.value=cat; o.textContent=cat; sel.appendChild(o); });
    const addO=document.createElement('option'); addO.value='__new__'; addO.textContent='＋ 新建分类'; sel.appendChild(addO);
    sel.value = cats.includes(current) ? current : '';
    rebuildCustomDropdown('filterCategory');
}

function renderFormCategoryOptions(){
    const sel=DOM.taskFormCategory; if(!sel) return;
    const cats=state.settings.categories||[];
    sel.innerHTML='<option value="">无</option>';
    cats.forEach(cat=>{ const o=document.createElement('option'); o.value=cat; o.textContent=cat; sel.appendChild(o); });
}
// 受管分类 -> 方舟素材图标文件名（static/icons/ 下）；未匹配的分类回退到 cat_other.png
function categoryIconFile(name){
    const map={ '学习':'cat_study.png','健身':'cat_fitness.png','工作':'cat_work.png','生活':'cat_life.png','其他':'cat_other.png' };
    return map[name] || 'cat_other.png';
}

async function onCategoryFilterChange(){
    if(DOM.filterCategory.value === '__new__'){
        const name = window.prompt('新建分类名称：') || '';
        const trimmed = name.trim();
        if(!trimmed){ renderCategoryFilter(); return; }
        const cats = Array.isArray(state.settings.categories) ? state.settings.categories.slice() : [];
        if(!cats.includes(trimmed)) cats.push(trimmed);
        state.settings.categories = cats;
        await apiPut('/settings', { categories: cats });
        state.filter.category = trimmed;
        renderCategoryFilter();
        applyFilters();
        showToast('已新建分类：' + trimmed);
    } else {
        applyFilters();
    }
}
function updateTagFilter(){ /* 已废弃：分类改为受管下拉 filterCategory，由 renderCategoryFilter 渲染 */ }
function updateTrackingPanelIfNeeded(){ if(state.trackingTaskId) updateTrackingPanel(); }
function spawnLevelUpSparks(){
    const box = DOM.levelUpSparks; if (!box) return;
    box.innerHTML = '';
    const N = 22;
    for (let i = 0; i < N; i++){
        const s = document.createElement('div');
        s.className = 'lu-spark';
        const ang = (Math.PI * 2 * i) / N + Math.random() * 0.25;
        const dist = 110 + Math.random() * 70;
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        s.style.animationDelay = (0.12 + Math.random() * 0.2) + 's';
        box.appendChild(s);
    }
}
function checkLevelUp(){ const currentLevel=calculateLevel(state.resources.exp?.current_value||0);
    if(currentLevel>state.lastLevel&&state.lastLevel!==0){ const oldLevel=state.lastLevel; state.lastLevel=currentLevel;
        if (DOM.levelUpOldLevel) DOM.levelUpOldLevel.textContent = `Lv.${oldLevel}`;
        if (DOM.levelUpLevel) DOM.levelUpLevel.textContent = `Lv.${currentLevel}`;
        // 理智条：显示回满后的实际值，比干巴巴一句「理智已回满」更有信息量
        const sanity = state.resources.sanity?.current_value || 0;
        const sanityMax = state.resources.sanity?.max_value || state.resources.sanity?.limit_value || 0;
        DOM.levelUpText.textContent = sanityMax
            ? `理智回满　${Math.round(sanity)} / ${Math.round(sanityMax)}`
            : `理智回满　${Math.round(sanity)}`;
        spawnLevelUpSparks();
        DOM.levelUpOverlay.classList.remove('show');   // 重置动画
        void DOM.levelUpOverlay.offsetWidth;           // 强制重排，保证重复升级也能重播
        DOM.levelUpOverlay.classList.add('show');
        setTimeout(()=>DOM.levelUpOverlay.classList.remove('show'),3000); loadResources(); }
    else if(state.lastLevel===0) state.lastLevel=currentLevel; }
function checkNewUnlocks(){ const storedIds=JSON.parse(localStorage.getItem('unlockedAchievementIds')||'[]');
    const newUnlocks=state.unlockedAchievements.filter(u=>!storedIds.includes(u.achievement_id));
    newUnlocks.forEach((u,index)=>{ setTimeout(()=>{ const ach=state.achievements.find(a=>a.id===u.achievement_id);
        if(ach){ DOM.badgeNotifName.textContent=ach.name; DOM.badgeNotification.classList.add('show'); setTimeout(()=>DOM.badgeNotification.classList.remove('show'),3000); } },index*3000); });
    if(newUnlocks.length){ const updatedIds=[...storedIds,...newUnlocks.map(u=>u.achievement_id)]; localStorage.setItem('unlockedAchievementIds',JSON.stringify(updatedIds)); } }
function formatDate(dateStr){ if(!dateStr) return '无'; let d=new Date(dateStr); if(isNaN(d.getTime())) d=new Date(dateStr.replace(' ','T')+'Z'); return isNaN(d.getTime())?dateStr:d.toLocaleString(); }
function escapeHtml(str){ if(!str) return ''; const div=document.createElement('div'); div.textContent=str; return div.innerHTML; }