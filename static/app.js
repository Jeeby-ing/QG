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
    resourceMeta: null,          // 理智上限曲线等由后端算好的元信息
    medalFilter: 'all',          // 蚀刻章筛选：all | unlocked | locked
    achievements: [],
    unlockedAchievements: [],
    settings: {},
    giftPacks: [],
    transactions: [],
    realityRewards: [],
    pomodoro: null,
    pomodoroEndAt: null,
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
    DOM.calendarSubtitle = document.getElementById('calendarSubtitle');
    DOM.calTodayBtn = document.getElementById('calTodayBtn');
    DOM.achievementsGrid = document.getElementById('achievementsGrid');
    DOM.profileLevel = document.getElementById('profileLevel');
    DOM.profileExpFill = document.getElementById('profileExpFill');
    DOM.profileExpText = document.getElementById('profileExpText');
    DOM.profileBadgesGrid = document.getElementById('profileBadgesGrid');
    DOM.profileBadgesCount = document.getElementById('profileBadgesCount');
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
    // R41：底部「领取奖励 / 附件已领取」互斥对 + 弹窗英文小标（见 setRewardFooter）
    DOM.rewardClaimedState = document.getElementById('rewardClaimedState');
    DOM.rewardEyebrow = document.getElementById('rewardEyebrow');
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
    DOM.skinBrowseToggleBtn = document.getElementById('skinBrowseToggleBtn');
    DOM.toastContainer = document.getElementById('toastContainer');
    DOM.confirmModal = document.getElementById('confirmModal');
    DOM.confirmMessage = document.getElementById('confirmMessage');
    DOM.confirmOk = document.getElementById('confirmOk');
    DOM.confirmCancel = document.getElementById('confirmCancel');
    DOM.confirmClose = document.getElementById('confirmClose');
    DOM.exchangeRateText = document.getElementById('exchangeRateText');
    DOM.gachaCostText = document.getElementById('gachaCostText');
    DOM.userInfo = document.getElementById('userInfo');
    DOM.userName = document.getElementById('userName');
    DOM.userLevel = document.getElementById('userLevel');
    DOM.bgParticles = document.getElementById('bgParticles');
    DOM.sanityDisplay = document.getElementById('sanityDisplay');
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
    /* R21：日历「今天」——跳回本月（跨月翻页后一键回来） */
    if (DOM.calTodayBtn) DOM.calTodayBtn.addEventListener('click', () => {
        const now = new Date();
        state.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        renderCalendar();
    });

    // R21：连续倍率缩放，不再一次性跳一大档
    DOM.graphZoomIn.addEventListener('click', () => setGraphZoom(1.25));
    DOM.graphZoomOut.addEventListener('click', () => setGraphZoom(1 / 1.25));
    DOM.graphReset.addEventListener('click', resetGraph);
    DOM.graphSvg.addEventListener('wheel', (e) => {
        e.preventDefault();
        // 滚轮每格 1.10 倍，并以鼠标位置为锚点 —— 缩到哪儿就盯着哪儿
        const p = graphPointFromEvent(e);
        setGraphZoom(e.deltaY > 0 ? 1 / 1.10 : 1.10, p.x, p.y);
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


    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeAllModals));
    DOM.modalOverlay.addEventListener('click', closeAllModals);

    DOM.mobileMenuBtn.addEventListener('click', toggleMobileMenu);

    DOM.dateTasksClose.addEventListener('click', closeAllModals);

    /* R21：资源兑换不再是弹窗，改成采购中心的一个子页。
       原来的「主页 → 资源兑换」按钮已删掉，统一走 pc-tab。 */
    bindExchangeStepper();
    if (DOM.exchangeConfirm) DOM.exchangeConfirm.addEventListener('click', handleExchange);
    if (DOM.exchangeAmount)  DOM.exchangeAmount.addEventListener('input', updateExchangeCost);
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
    /* R38：「浏览全部」——默认视图只显示当前/默认皮肤，全部目录按需展开。 */
    if (DOM.skinBrowseToggleBtn) DOM.skinBrowseToggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        skinBrowse = !skinBrowse;
        renderSkins();
    });
    /* R23：蚀刻章筛选（全部 / 已解锁 / 未解锁）—— 三百多枚章没有筛选没法找 */
    const medalFilterRow = document.getElementById('medalFilterRow');
    if (medalFilterRow) medalFilterRow.addEventListener('click', e => {
        const btn = e.target.closest('.skin-filter-btn');
        if (!btn) return;
        medalFilterRow.querySelectorAll('.skin-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.medalFilter = btn.dataset.medal;
        renderAchievements();
    });

    /* R20：采购中心内部标签切换 */
    if (DOM.shopTabBar) DOM.shopTabBar.addEventListener('click', e => {
        const btn = e.target.closest('.pc-tab');
        if (!btn) return;
        switchShopTab(btn.dataset.tab);
        if (btn.dataset.tab === 'skin') { skinTabLoaded = true; loadSkins(); }
    });
    /* R20：主页的四个入口卡片 —— 直接跳到采购中心对应子页 / 寻访视图 */
    if (DOM.profileMedalEntry) DOM.profileMedalEntry.addEventListener('click', () => { switchView('shop'); switchShopTab('medal'); });
    if (DOM.profilePackEntry)  DOM.profilePackEntry.addEventListener('click',  () => { switchView('shop'); switchShopTab('pack'); });
    if (DOM.profileSkinEntry)  DOM.profileSkinEntry.addEventListener('click',  () => { switchView('shop'); switchShopTab('skin'); loadSkins(); });
    if (DOM.profileRealityEntry) DOM.profileRealityEntry.addEventListener('click', () => { switchView('shop'); switchShopTab('reality'); });
    if (DOM.profileGachaEntry) DOM.profileGachaEntry.addEventListener('click', () => switchView('gacha'));
    /* R21：主页「已解锁蚀刻章」折叠开关（用户要求做成可展开收起） */
    const badgesToggle = document.getElementById('profileBadgesToggle');
    const badgesSection = document.getElementById('profileBadgesSection');
    if (badgesToggle && badgesSection) {
        badgesToggle.addEventListener('click', () => {
            const open = badgesSection.classList.toggle('collapsed');
            badgesToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        });
    }

    DOM.newRealityRewardBtn.addEventListener('click', () => openRealityRewardModal());
    DOM.realityRewardForm.addEventListener('submit', handleRealityRewardFormSubmit);
    DOM.realityRewardCancel.addEventListener('click', closeAllModals);
    DOM.realityRewardClose.addEventListener('click', closeAllModals);
    DOM.realityRewardType.addEventListener('change', () => {
        DOM.realityRewardCurrentGroup.classList.toggle('hidden-soft', DOM.realityRewardType.value !== 'custom');
    });

    let startY = 0, currentY = 0, isDragging = false;
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
    /* 动态立绘索引只有 16KB，后台悄悄拉一份，不进启动进度条。
       卡片上的「动态立绘」徽章依赖它，所以拉完如果人正停在时装页就重绘一次。 */
    if (window.DynPortrait) {
        DynPortrait.init().then(() => {
            if (state.currentView === 'shop' && shopTab === 'skin') renderSkins();
        });
    }
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
/* R21：默认子页改成「时装兑换」（用户要求第一个显示时装），顺序 时装→礼包→蚀刻章→现实奖励 */
let shopTab = 'skin';
let skinTabLoaded = false;   // 时装数据只在第一次切进来时拉一次
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
    if (shopTab === 'exchange') initExchange();
}
/* R21：资源兑换搬进采购中心后，进子页时要初始化一次（原来这是弹窗打开时做的） */
function initExchange(){
    if (DOM.exchangeAmount) DOM.exchangeAmount.value = 1;
    updateExchangeBalance(); updateExchangeCost(); updateExchangeRateText();
}
/* 切到采购中心时：时装是默认子页，数据要主动拉一次（否则第一次进来是空货架） */
function ensureShopData(){
    if (shopTab === 'skin' && !skinTabLoaded){ skinTabLoaded = true; loadSkins(); }
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
            /* FastAPI 的 HTTPException 把原因写在 detail 里，不是 message。
               以前只读 message → 界面上永远显示「API /xxx failed」这种没人看得懂的话。 */
            try { const errData = await res.json(); message = errData?.message || errData?.detail || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        /* ⚠️ 不能用 `json.data ?? json`：`data` 为 null 时 ?? 会回退成整个信封对象，
           于是「没有进行中的番茄钟」会变成「有一个 kind=undefined 的番茄钟」——
           仪表被点亮、--ak-gauge-value 变 NaN%（conic-gradient 整条失效）、is-break 误加。
           这里按「信封里是否真的存在 data 键」判断，null 就是 null。 */
        return (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data'))
            ? json.data : json;
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
            try { const errData = await res.json(); message = errData?.message || errData?.detail || message; } catch {}
            throw new Error(message);
        }
        const json = await res.json();
        /* ⚠️ 不能用 `json.data ?? json`：`data` 为 null 时 ?? 会回退成整个信封对象，
           于是「没有进行中的番茄钟」会变成「有一个 kind=undefined 的番茄钟」——
           仪表被点亮、--ak-gauge-value 变 NaN%（conic-gradient 整条失效）、is-break 误加。
           这里按「信封里是否真的存在 data 键」判断，null 就是 null。 */
        return (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data'))
            ? json.data : json;
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
        /* ⚠️ 不能用 `json.data ?? json`：`data` 为 null 时 ?? 会回退成整个信封对象，
           于是「没有进行中的番茄钟」会变成「有一个 kind=undefined 的番茄钟」——
           仪表被点亮、--ak-gauge-value 变 NaN%（conic-gradient 整条失效）、is-break 误加。
           这里按「信封里是否真的存在 data 键」判断，null 就是 null。 */
        return (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data'))
            ? json.data : json;
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
        /* ⚠️ 不能用 `json.data ?? json`：`data` 为 null 时 ?? 会回退成整个信封对象，
           于是「没有进行中的番茄钟」会变成「有一个 kind=undefined 的番茄钟」——
           仪表被点亮、--ak-gauge-value 变 NaN%（conic-gradient 整条失效）、is-break 误加。
           这里按「信封里是否真的存在 data 键」判断，null 就是 null。 */
        return (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data'))
            ? json.data : json;
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
    /* R32：以前时间一到直接 remove() —— 吐司"啪"地消失。
       现在先挂 .toast-out 走一段淡出（240ms）再摘，和弹窗的退场是一套语言。 */
    const kill = () => {
        if (toast.dataset.leaving) return;
        toast.dataset.leaving = '1';
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 240);
    };
    setTimeout(kill, duration);
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

/* R29：只刷新任务数据、不重绘列表。
   loadTasks() 末尾会走 applyFilters() → renderTasks()，也就是把整张任务列表
   的 DOM 全部重建。完成任务 / 领取奖励时用它，会把用户正在操作的列表整个刷掉
   （闪烁、丢焦点、动画中断）。局部更新场景改用本函数：只拉最新数据 + 重画
   图谱/追踪面板，卡片本身交给 refreshTaskCard() 定点更新。 */
async function reloadTaskData() {
    const tree = await apiGet('/tasks/tree?include_archived=true&include_deleted=true');
    if (tree) {
        state.tasks = tree;
        flattenTasks(state.tasks, 0);
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
    const payload = await apiGet('/resources');
    if (!payload) return;
    // 后端把理智上限曲线（meta）和资源放在同一个 data 里 ——
    // 响应中间件只透传 data 这一个键，平级的 meta 会被丢掉。
    const res = payload.resources ?? payload;
    if (Array.isArray(res)) {
        state.resources = res.reduce((acc, r) => { acc[r.resource_type] = r; return acc; }, {});
    } else {
        state.resources = res;
    }
    if (payload.meta) state.resourceMeta = payload.meta;
    updateResourceDisplay();
    updateUserInfo();
    checkLevelUp();
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

/* R41 第 7 项：任务卡上的「奖励预览条」。
   方舟任务行本来就会在标题右侧列出可获得的东西，这里照这个语义做一个紧凑版：
   只放**非零**的资源，圆形小图标 + 数值，最多 4 个（经验/龙门币/源石/合成玉），
   后面若还有随机掉落，只给一个"宝箱 × 种类数"的角标 ——
   既要填满标题行中段，又绝不允许把长标题挤变形（所以外层给了 max-width）。
   图标复用 RESOURCE_SVGS + tryUpgradeResIcon，与原版资源图标是同一套。 */
function buildTaskRewardStrip(task) {
    const defs = [
        ['exp', task.reward_exp, '经验值'],
        ['lungmen', task.reward_lungmen, '龙门币'],
        ['source_stone', task.reward_source_stone, '源石'],
        ['orundum', task.reward_orundum, '合成玉']
    ];
    const items = [];
    defs.forEach(([key, raw, name]) => {
        const n = Math.floor(Number(raw) || 0);
        if (n > 0) items.push({ key, val: n, name });
    });
    let dropKinds = 0;
    if (task.drop_config) {
        try {
            const cfg = JSON.parse(task.drop_config);
            const drops = Array.isArray(cfg) ? cfg : (cfg.random_drops || []);
            if (Array.isArray(drops)) dropKinds = drops.length;
        } catch (e) { /* drop_config 坏数据不该影响卡片渲染 */ }
    }
    if (!items.length && !dropKinds) return null;

    const wrap = document.createElement('div');
    wrap.className = 'task-rewards';
    // 数值紧凑化：4 位以上折成"万"，避免一条 exp 就把标题行撑爆
    const fmt = (n) => n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)}万` : String(n);

    items.forEach(it => {
        const chip = document.createElement('span');
        chip.className = 'task-reward-chip';
        chip.title = `${it.name} ${it.val}`;
        const icon = document.createElement('span');
        icon.className = 'task-reward-icon';
        icon.innerHTML = RESOURCE_SVGS[it.key] || '';
        try { tryUpgradeResIcon(icon, it.key); } catch (e) {}
        const val = document.createElement('b');
        val.className = 'task-reward-value';
        val.textContent = fmt(it.val);
        chip.appendChild(icon);
        chip.appendChild(val);
        wrap.appendChild(chip);
    });

    if (dropKinds) {
        const chip = document.createElement('span');
        chip.className = 'task-reward-chip is-drop';
        chip.title = `随机掉落 ${dropKinds} 种`;
        const icon = document.createElement('span');
        icon.className = 'task-reward-icon';
        icon.innerHTML = DROP_CHEST_SVG;
        const val = document.createElement('b');
        val.className = 'task-reward-value';
        val.textContent = `×${dropKinds}`;
        chip.appendChild(icon);
        chip.appendChild(val);
        wrap.appendChild(chip);
    }
    return wrap;
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

    /* R29 第九刀定下「三态由 claimStateOf() 统一给出」这条铁律（沿用至今）。
       R32：领奖入口重新放宽 —— 可领取的卡片点整卡即领取（用户要求「无需先点开详情页」），
       右侧徽章是同一动作的可视化提示；卡片进详情改为只在「没奖可领」时发生，
       详情另有操作区里的 ⓘ 按钮兜底。 */
    const claimState = claimStateOf(task);
    const claimable = claimState === 'claimable';

    if (claimable) card.classList.add('claimable');
    else if (claimState === 'claimed') card.classList.add('claimed');
    /* 已完成且奖励已领：不再放右上角的绿色对勾（R19 用户明确要去掉）。
       三态区分交给右侧徽章：可领取=金色可点 / 已领取=暗色不可点 / 未完成=无徽章。 */

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
    /* R41 第 7 项：奖励预览条 —— 填掉标题行中段那片空白。
       用户原话：「当前排版奇怪，元素集中在两侧拥挤、中间留白过多，需重新布局」。
       根因在 CSS：.task-title 是 flex:1 1 auto，会把后面「主线/日常」两个标签
       一路顶到行尾，标题与标签之间于是空出一大片没有任何内容的暗区。
       现在标题只占自身宽度，剩下的空间交给这条奖励预览（flex:1 1 auto + 右对齐）：
       左边是"身份"（星级 + 标题 + 主线/日常），右边紧挨着"回报"（奖励图标），
       中段不再留白 —— 而且这正是方舟任务行本来的样子（任务行右侧列奖励）。
       没有奖励的任务不会生成这个节点，此时标题行自然左聚拢，同样没有空白。 */
    const rewardStrip = buildTaskRewardStrip(task);
    if (rewardStrip) topRow.appendChild(rewardStrip);
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
    /* R32：详情入口 —— 可领取的卡片点整卡是「领取」，所以详情必须另给一个
       显式入口，否则想看任务信息就只剩编辑按钮。放在操作区第一位。 */
    const detailBtn = document.createElement('button');
    detailBtn.className = 'action-btn';
    detailBtn.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    detailBtn.title = '查看详情';
    detailBtn.addEventListener('click', (e) => { e.stopPropagation(); openTaskDetail(task.id); });
    actions.appendChild(detailBtn);
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
    /* R33：领奖入口从「卡片最右侧、挤在操作图标旁边的小徽章」搬到
       「任务主内容区里独占一整行、面积大得多的按钮」。
       R40 修：以前这里写的是 card.appendChild —— 挂到**整张卡**上，
       flex:1 1 100% 拿到的是卡片宽度（实测按钮右缘 1385，
       比上方描述/标签列右缘 1048 多出 300+ px），而且它是卡片最后一个子元素，
       上方紧贴 .task-actions（间距 0px）、下方紧贴卡片底边（只剩 1px 边框）。
       必须挂进 .task-main（R33 注释里本来就是这么写的）：
       main 是「可换行的横向流」(flex-direction:row + flex-wrap:wrap)，
       100% 就是**内容列**宽，右对齐即与 .task-meta-row 严格同列，
       上方拿到 main 的 4px 行距、下方拿到它的 9px 内边距。
       ⚠️ 挂载点统一走 claimRowMount()，refreshTaskCard 那边也是 —— 见下方函数。 */
    if (claimState !== 'unclaimable') {
        claimRowMount(card).appendChild(buildClaimRow(claimState, task, card));
    }
    card.addEventListener('click', () => {
        if (window._suppressClick) return;
        if (state.selectionMode) { toggleSelectTask(task); return; }
        if (isBlocked(task)) return;
        /* R32：可领取的卡片 = 直接领取（用户要求「无需先点开详情页」）。
           点卡片进详情这条路只对「没有奖可领」的卡保留，详情入口另有
           操作区里的 ⓘ 详情按钮，所以信息并没有被藏起来。
           R33：已领取的卡点下去必须有明确反馈（用户报「点了没反应」）——
           给一条 toast + 打开详情，而不是静默什么也不做。 */
        if (claimState === 'claimable') { claimTaskFromCard(task.id, card); return; }
        if (claimState === 'claimed') { onClaimedCardClick(task.id); return; }
        openTaskDetail(task.id);
    });
    return card;
}

/* 领奖行的挂载点（R40）：一律挂进 .task-main。
   createTaskCard 和 refreshTaskCard 必须用同一个函数 —— 否则两处各挂一层，
   用户点一次完成/领取触发定点刷新，按钮就换了一行位置（跳位）。
   兜底返回 cardEl：万一卡片结构变了也不至于把按钮丢了。 */
function claimRowMount(cardEl) {
    return cardEl.querySelector('.task-main') || cardEl;
}

/* 领取入口（R33 重做）：独占任务主内容区一整行。
   claimable → 金色大按钮「领取奖励」，点一下即发奖（和点整卡同一个动作）；
   claimed   → 同样位置给一个暗色「已领取」，但**不 disabled** ——
               点它仍然有明确反馈（toast + 打开详情）。旧版是个 disabled 徽章，
               点下去毫无反应，正是用户说的「点击已领取任务无任何响应」。 */
function buildClaimRow(claimState, task, cardEl) {
    const row = document.createElement('div');
    row.className = 'task-claim-row';
    row.dataset.state = claimState;        // 定点刷新据此判断要不要整块换掉
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-claim-btn' + (claimState === 'claimed' ? ' is-claimed' : '');
    btn.dataset.state = claimState;
    btn.innerHTML = claimBadgeHTML(claimState);
    if (claimState === 'claimable') {
        btn.title = '领取该任务的奖励';
        btn.setAttribute('aria-label', '领取奖励');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window._suppressClick) return;
            claimTaskFromCard(task.id, cardEl);
        });
    } else {
        btn.title = '奖励已领取，点击查看详情';
        btn.setAttribute('aria-label', '奖励已领取');
        btn.addEventListener('click', (e) => { e.stopPropagation(); onClaimedCardClick(task.id); });
    }
    row.appendChild(btn);
    return row;
}

/* 点「已领取」的卡片或按钮：先明确告诉用户状态，再把他想看的内容打开。
   以前这条路要么没反应、要么只默默开个弹窗，用户以为界面卡住了。 */
function onClaimedCardClick(taskId) {
    showToast('该任务奖励已领取');
    openTaskDetail(taskId);
}


/* ===== 整卡领取奖励 =====
   点完成卡片的任意位置 → 直接发奖 → 把「一共领到了什么」铺成方舟风格圆形资源卡。
   父任务会连同所有已完成子任务一起结算（后端 claim-reward 默认级联，可在设置里关掉）。 */
/* R24：任务奖励的合成玉 / 源石带周期上限（对齐原版渠道上限），
   被截断时必须明说，否则用户会以为是发奖坏了。
   后端在 claim 响应里带 capped=[{resource, period, limit, wanted, given}, ...]。 */
function notifyEconomyCap(capped){
    if (!Array.isArray(capped) || !capped.length) return;
    const resName = { orundum: '合成玉', source_stone: '源石' };
    const periodName = { daily: '今日', weekly: '本周' };
    const merged = {};
    capped.forEach(c => { merged[c.resource] = periodName[c.period] || '本期'; });
    const parts = Object.keys(merged).map(k => `${merged[k]}${resName[k] || k}产出已达上限`);
    showToast(`${parts.join('，')}，超出部分未发放`, 4200);
}

async function claimTaskFromCard(taskId, cardEl){
    if (state.rewardModalAnimating) return;
    const task = state.flatTasks.find(t => t.id === taskId);
    /* 只认 claimStateOf：既拦「还没完成」，也拦「已经领过」。
       以前这里查 `!task.reward_claimed`，遇到 0/1/false 混合形态会拦不住。 */
    if (!task || claimStateOf(task) !== 'claimable') return;
    state.rewardModalAnimating = true;
    cardEl?.classList.add('claiming');
    if (cardEl) { try { spawnParticlesGatherThenFly(cardEl); } catch (e) {} }
    let result = null;
    try { result = await apiPost(`/tasks/${taskId}/claim-reward`); } catch (e) {}
    state.rewardModalAnimating = false;
    if (!result){
        /* 失败也要把状态对齐一次：后端若回「奖励已领取」，说明它其实已经领过了，
           卡片必须立刻变成「已领取」，不能留在「可领取」却点不动（用户报的正是这个）。
           后端给的原因（「奖励已领取」/「任务未完成」）已经由 apiPost 弹成一条 toast，
           这里只把卡片状态拉回真实值，并针对「其实已领过」再补一句更明确的说明 ——
           这正是"显示可领取、点下去却像没反应"最常见的那条路径。 */
        cardEl?.classList.remove('claiming');
        await resyncClaimState(taskId);
        const settled = state.flatTasks.find(t => t.id === taskId);
        if (settled && claimStateOf(settled) === 'claimed') {
            showToast('该任务奖励此前已领取，无需重复领取');
        }
        return;
    }

    /* 服务端已确认发过奖 —— 先把「已领取」写回本地，再拉数据。
       这样即使随后的拉取稍慢或返回旧快照，卡片也不会退回「可领取」。 */
    const claimedIds = (Array.isArray(result.detail) ? result.detail : [])
        .map(d => d && d.id).filter(Boolean);
    markClaimedLocally(claimedIds.length ? claimedIds : [taskId]);

    await loadResources(); await loadTransactions();
    await reloadTaskData();
    if (claimedIds.length > 1) renderTasks();       // 级联领了子任务：整表重排一次
    else refreshTaskCardFor(taskId);                // 单个任务：定点刷新，不闪
    if (typeof updateTrackingPanel === 'function') updateTrackingPanel();
    try { loadInventory(); } catch (e) {}

    /* R32：领到手的一瞬间给卡片一个金色光晕收束 + 徽章弹一下 ——
       让「卡片上的可领取 → 已领取」有个视觉落点，而不是徽章无声无息地换了个字。
       注意要在 refreshTaskCardFor 之后加：它会整块重写 card.className。 */
    const cardAfter = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (cardAfter){
        cardAfter.classList.remove('claiming');
        cardAfter.classList.add('claim-just-done');
        setTimeout(()=>cardAfter.classList.remove('claim-just-done'), 950);
    }

    const granted = [];
    const rw = result.rewards || {};
    ['exp', 'lungmen', 'source_stone', 'orundum'].forEach(k => {
        if ((rw[k] || 0) > 0) granted.push({ key: k, amount: rw[k] });
    });
    (result.materials || []).forEach(m => granted.push({ key: m.type, amount: m.amount }));

    if (granted.length){
        /* R41 第 2 项：标题留在「任务奖励」，把"已经领到手了"这件事交给底部那颗
           互斥状态 #rewardClaimedState 表达。旧版这里还把标题改成「奖励已领取」，
           于是同一句话在弹窗里出现两遍（标题一次、按钮一次）。 */
        showPackRewardModal(granted, 'claimed');
    } else {
        showToast('奖励已领取');
    }
    notifyEconomyCap(result.capped);
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

/* ------------------------------------------------------------
   R29 第九刀：卡片领取状态 —— 全局唯一口径
   ------------------------------------------------------------
   用户报的两个问题都出在「状态」这件事上：
     1) 点卡片会直接领奖（他只想进详情页看信息）；
     2) 领取成功后卡片还挂着「可领取」样式，再点却什么也不发生。
   根因是「可领取」这个判断散落在 4 处（列表卡 / 定点刷新 / 一键领取按钮 /
   详情页按钮），各写各的，并且都直接读 `!task.reward_claimed`。后端返回的
   reward_claimed 可能是 0/1/true/false 混合形态，加上定点刷新只改进度条、
   不重算徽章，卡片就会长期停在「可领取」而实际已领取。

   现在统一成三态互斥的 claimStateOf()：任何渲染点都只允许调它。
     claimable   可领取：已完成 + 奖励未领 + 确实有奖励  → 金色徽章（可点）
     claimed     已领取：已完成 + 奖励已领              → 暗色徽章（不可点）
     unclaimable 不可领取：还没完成（或确实没奖励）      → 不挂徽章
   ------------------------------------------------------------ */
/* 「已领取」标记的判读 —— 后端历史上出现过 0/1/true/false/'1'/'true' 混合形态，
   所以这里一律宽松判：真值、非 0 数字、'1'/'true'/'yes'/'y' 都算已领取。
   （R33 补：原先只认 '1' 和 'true'，遇到 'True'/'yes' 会误判成"未领取"。） */
function isClaimedFlag(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'number') return v > 0;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'null' || s === 'undefined') return false;
        if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
        const n = Number(s);
        return !isNaN(n) && n > 0;
    }
    return false;
}

function claimStateOf(task) {
    if (!task) return 'unclaimable';
    if (task.status !== 'done') return 'unclaimable';
    /* 回收站里的任务领不了 —— 后端 claim-reward 只认 deleted = 0，
       以前这里不判 deleted，于是在「显示已删除」打开时，垃圾桶里的任务
       也会挂一个「可领取」，点下去必然失败，正是用户说的"显示可领取却领不了"。 */
    if (isClaimedFlag(task.deleted)) return 'unclaimable';
    if (isClaimedFlag(task.reward_claimed)) return 'claimed';
    return hasActualReward(task) ? 'claimable' : 'unclaimable';
}

/* R33：文案跟着按钮一起放大 —— 旧徽章是小角标，写「可领取」三个字刚好；
   现在它是一个居中大按钮，写「领取奖励」才是用户一眼扫到就能点的那句话。 */
function claimBadgeHTML(state) {
    if (state === 'claimable') return '<i class="fa-solid fa-gift"></i><span>领取奖励</span>';
    if (state === 'claimed') return '<i class="fa-solid fa-check"></i><span>已领取</span>';
    return '';
}

/* 把「某些任务的奖励已经领掉了」这件事立刻写回本地状态。
   服务端已经确认发过奖了，本地就必须立刻相信 —— 不能等下一次拉取，
   否则中间这段时间卡片还挂着「可领取」，用户点了却 400。 */
function markClaimedLocally(ids) {
    const set = new Set((ids || []).map(Number));
    if (!set.size) return;
    state.flatTasks.forEach(t => { if (set.has(Number(t.id))) t.reward_claimed = 1; });
    state.tasks && (function walk(nodes) {
        nodes.forEach(n => { if (set.has(Number(n.id))) n.reward_claimed = 1; walk(n.children || []); });
    })(state.tasks);
}

/* 领取请求失败后的兜底：有可能只是「后端其实已领取」（重复点 / 多标签页）。
   重新拉一次数据并把卡片刷成真实状态，卡片就不会永远停在可领取却点不动。 */
async function resyncClaimState(taskId) {
    try { await reloadTaskData(); } catch (e) {}
    if (taskId) refreshTaskCardFor(taskId); else renderTasks();
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

/* 图谱节点配色（R21）：每种状态一条自上而下渐变，顶亮底深，不用近黑底 + 外发光 */
const GRAPH_NODE_COLORS = {
    todo:       { from:'#39404f', to:'#22262f', stroke:'rgba(236,239,245,0.30)', bar:'rgba(236,239,245,0.34)', hi:'rgba(255,255,255,0.10)' },
    in_progress:{ from:'#1f4f75', to:'#132b41', stroke:'#6BA6E8',                 bar:'#3A80D0',               hi:'rgba(130,190,255,0.22)' },
    paused:     { from:'#5f4d21', to:'#372d16', stroke:'#E2BC46',                 bar:'#D4A520',               hi:'rgba(255,214,110,0.20)' },
    done:       { from:'#235440', to:'#143029', stroke:'#71CE90',                 bar:'#5FB37A',               hi:'rgba(140,240,180,0.18)' },
    cancelled:  { from:'#3d3d47', to:'#24242a', stroke:'#82828E',                 bar:'#6A6A74',               hi:'rgba(255,255,255,0.07)' },
    blocked:    { from:'#5f2b27', to:'#371917', stroke:'#E8514A',                 bar:'#D43028',               hi:'rgba(255,140,130,0.20)' },
};
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
    // 每种状态的节点渐变（替代原来的近黑纯色 + 高斯外发光）
    Object.keys(GRAPH_NODE_COLORS).forEach(k => {
        const c = GRAPH_NODE_COLORS[k];
        const lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', `gnode-${k}`);
        lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0');
        lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
        lg.innerHTML = `<stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/>`;
        defs.appendChild(lg);
    });
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
                    // R21：纯青 #00C2FF 在暗底上非常"网页味"，压成钢蓝更贴方舟 UI
                    path.setAttribute('stroke', idx === 0 ? 'rgba(150,205,235,0.42)' : 'rgba(165,215,240,0.72)');
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
        /* R21：节点不再是「纯黑卡片」。
           旧版用 rgba(28,32,44,…) 这种近黑底 + 高斯模糊外发光，
           在暗色界面上就是一坨糊掉的黑块（用户原话「还是这黑色卡片，好丑」）。
           改成每种状态一条自上而下的渐变：顶部提亮、底部收深，
           取消外发光，改描边 + 顶部高光线来表达材质。 */
        const status = isBlocked(n) ? 'blocked' : (n.status || 'todo');
        const sc = GRAPH_NODE_COLORS[status] || GRAPH_NODE_COLORS.todo;
        // 节点主体
        const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
        rect.setAttribute('x', cx - W/2); rect.setAttribute('y', cy - H/2);
        rect.setAttribute('width', W); rect.setAttribute('height', H); rect.setAttribute('rx', rx);
        rect.setAttribute('fill', `url(#gnode-${status})`);
        rect.setAttribute('stroke', sc.stroke); rect.setAttribute('stroke-width','1.4');
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
        // 顶部高光线：一条 1px 亮线取代原来的高斯外发光，材质感来自"边"不是"光"
        const hi = document.createElementNS('http://www.w3.org/2000/svg','rect');
        hi.setAttribute('x', cx - W/2 + 7); hi.setAttribute('y', cy - H/2 + 1.5);
        hi.setAttribute('width', W - 14); hi.setAttribute('height', 1);
        hi.setAttribute('fill', sc.hi);
        g.appendChild(hi);
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
        let _vx = Math.max(0, _minX - _pad);
        let _vy = Math.max(0, _minY - _pad);
        const _vw = Math.max(_maxX - _minX + _pad * 2, 640);
        const _vh = Math.max(_maxY - _minY + _pad * 2, 440);
        /* 把 viewBox 补足成容器的宽高比。
           SVG 默认 preserveAspectRatio=meet，内容很宽时会上下留大片空白、
           很高时左右留白；补足比例再居中，内容才能真的铺满画布，
           也不会在缩放时出现"看着忽大忽小"的错觉。 */
        let _bw = _vw, _bh = _vh;
        const _box = DOM.graphSvg.getBoundingClientRect();
        if (_box.width > 0 && _box.height > 0) {
            const _ar = _box.width / _box.height;
            if (_bw / _bh < _ar) { _bw = _bh * _ar; }
            else                 { _bh = _bw / _ar; }
        }
        _vx -= (_bw - _vw) / 2;
        _vy -= (_bh - _vh) / 2;
        state.graphViewBox = { x: _vx, y: _vy, width: _bw, height: _bh };
        state.graphBaseWidth = _bw;
        state.graphBaseHeight = _bh;
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

    const COL = 250;      // 每深入一层的水平间距
    const ROW = 94;       // 树内行距
    const TREE_GAP = 62;  // 同一列内，树与树之间的纵向留白
    const COL_GAP = 96;   // 列与列之间的横向留白
    const X0 = 165, Y0 = 80;
    /* 单列最多堆几行：超过就换一列往右排。
       旧版是「所有树串成一列往下堆」，任务一多就变成一条细长的纵向长条
       （用户：整体都是纵向挤开的）。现在按这个上限分栏，
       整体宽高比接近 16:9，不会再出现拉不完的竖条。 */
    const MAX_ROWS_PER_COL = 7;
    const layout = {};
    const bands = [];

    // 一棵树占多少行 = 它的叶子数
    const measure = (node) => {
        const kids = children.get(node.id) || [];
        if (!kids.length) return 1;
        return kids.reduce((s, k) => s + measure(k), 0);
    };
    const depthOf = (node) => {
        const kids = children.get(node.id) || [];
        if (!kids.length) return 0;
        return 1 + Math.max(...kids.map(depthOf));
    };
    const place = (node, depth, slotStart, originX, originY) => {
        const kids = children.get(node.id) || [];
        if (!kids.length) {
            layout[node.id] = { x: originX + depth * COL, y: originY + slotStart * ROW };
            return;
        }
        let off = slotStart;
        kids.forEach(k => { place(k, depth + 1, off, originX, originY); off += measure(k); });
        // 父节点垂直居中于它的孩子们之间（比顶格对齐更像"树"）
        const first = layout[kids[0].id].y;
        const last  = layout[kids[kids.length - 1].id].y;
        layout[node.id] = { x: originX + depth * COL, y: (first + last) / 2 };
    };

    // 1) 先量好每棵树的高度（行）与深度（层）
    const trees = roots.map(root => ({
        root, rows: Math.max(1, measure(root)), depth: depthOf(root),
    }));
    // 2) 贪心分栏：装不下就往右开一列
    const cols = [];
    trees.forEach(t => {
        let c = cols[cols.length - 1];
        if (!c || (c.rows > 0 && c.rows + t.rows > MAX_ROWS_PER_COL)) {
            c = { trees: [], rows: 0, depth: 0 };
            cols.push(c);
        }
        c.trees.push(t);
        c.rows += t.rows + 1;                 // +1 = 树间留白的一行
        c.depth = Math.max(c.depth, t.depth);
    });
    // 3) 逐列摆放
    let colX = X0;
    cols.forEach(c => {
        let cursorY = Y0;
        c.trees.forEach(t => {
            const y0 = cursorY;
            place(t.root, 0, 0, colX, cursorY);
            const y1 = cursorY + t.rows * ROW;
            bands.push({
                x0: colX - 118, x1: colX + t.depth * COL + 128,
                y0: y0 - 34, y1: y1 - ROW + 34,
                title: t.root.title || '任务树'
            });
            cursorY = y1 + TREE_GAP;
        });
        colX += (c.depth + 1) * COL + COL_GAP;
    });
    let cursorY = Y0;

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
    /* R41 第 5 项：周序改为**周一 → 周日**（用户明确要求"布局从左到右为周一到周日"）。
       旧版直接用 Date.getDay()（周日=0），所以表头是 日一二三四五六。
       把 getDay() 平移 6 位即得 Mon=0 … Sun=6：
         Mon(1)→0, Tue(2)→1, … Sat(6)→5, Sun(0)→6。
       下面所有和 firstDay 有关的补齐逻辑都只是"前导格数"，平移后天然成立。 */
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month+1, 0).getDate();

    /* R41 第 5 项：节日 / 节气 / 法定假日。
       引擎是 static/calendar-festivals.js（纯本地计算，农历 + 24 节气，1900–2100），
       整月一次算好，避免在 42 个格子里各算一遍。
       取不到引擎时退化成空表 —— 日历本身必须还能用（它只是装饰层）。 */
    const FEST = (typeof window !== 'undefined' && window.QuestFestivals) ? window.QuestFestivals : null;
    let festByDay = {};
    if (FEST) { try { festByDay = FEST.forMonth(year, month) || {}; } catch (e) { festByDay = {}; } }

    const tasksByDate = {};
    state.flatTasks.filter(t=>!t.archived&&!t.deleted).forEach(t=>{
        if(t.due_date){ const d=t.due_date.substring(0,10); if(!tasksByDate[d]) tasksByDate[d]=[]; tasksByDate[d].push(t); }
    });
    const todayStr = new Date().toLocaleDateString('sv-SE');
    /* R21：日历整体重做。
       旧版是「大格子 + 左上角一个数字 + 悬停冒出来的蓝色加号」，
       一个月里有大半格子是全空的，没有任何版面信息，观感就是"零设计"。
       新版：
         · 前后补齐相邻月份的日期（灰显），格子不再一片空洞；
         · 数字左上、完成进度右上，格子顶部有一条状态色细线；
         · 任务条最多摆 3 条，多出来的收成「+N」；
         · 今天 = 金色数字 + 金色描边；周末数字走暖金；悬停走暖金细线（不再蓝）。
       R41 第 5 项再补：表头改双语（一 MON … 日 SUN）、格子里加节日/节气/法定假日，
       并在网格下面给出本月节日图例 —— 用户说日历"无任何装饰、极度单调"。 */
    let html = '<div class="calendar-grid">';
    // 周一 → 周日 + 英文小标（与全站 OPERATION / SUB TASKS / HEADHUNT 的双语风格一致）
    [['一','MON'],['二','TUE'],['三','WED'],['四','THU'],['五','FRI'],['六','SAT'],['日','SUN']]
        .forEach(([cn, en], i) => {
            html += `<div class="calendar-day-header${i >= 5 ? ' is-weekend' : ''}">` +
                        `<span class="cal-dow-cn">${cn}</span>` +
                        `<span class="cal-dow-en">${en}</span>` +
                    '</div>';
        });
    // 上月尾巴：只显示数字、不作为可点日期
    const daysInPrev = new Date(year, month, 0).getDate();
    for(let i = firstDay - 1; i >= 0; i--)
        html += `<div class="calendar-day other-month"><span class="calendar-day-number">${daysInPrev - i}</span></div>`;

    let monthTaskTotal = 0, monthTaskDone = 0;
    const MAX_CHIPS = 2;          // 节日单独占一行后，任务条收到 2 条，格子高度才不会被撑爆
    const monthFests = [];        // 收集本月值得上榜的节日，供底部图例使用
    for(let day=1; day<=daysInMonth; day++){
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const tasks = tasksByDate[dateStr] || [];
        const dow = new Date(year, month, day).getDay();
        const isToday = dateStr === todayStr;
        const doneCount = tasks.filter(t => t.status === 'done').length;
        monthTaskTotal += tasks.length; monthTaskDone += doneCount;

        /* 当天的节日/假日。一天可能同时命中多个（例如"中秋 + 秋分 + 世界和平日"），
           格子里最多摆 2 个，多的收成 +N；图例里收"法定假日 + lv1/lv2 节日"——
           节气（term）只进格子不进图例：24 个节气每月都有一两个，全列出来会把
           图例变成流水账，反而看不出重点。 */
        const dayFests = Array.isArray(festByDay[day]) ? festByDay[day] : [];
        const isRest = dayFests.some(f => f && f.statutory);
        dayFests.forEach(f => {
            if (f && (f.statutory || (f.level || 2) <= 2) &&
                !monthFests.some(x => x.day === day && x.name === f.name))
                monthFests.push({ day, name: f.name, kind: f.kind || 'solar' });
        });

        const cls = ['calendar-day'];
        if (isToday) cls.push('today');
        if (tasks.length) cls.push('has-tasks');
        if (dow === 0 || dow === 6) cls.push('is-weekend');
        if (tasks.length && doneCount === tasks.length) cls.push('all-done');
        if (dayFests.length) cls.push('has-fest');
        if (isRest) cls.push('is-rest');
        html += `<div class="${cls.join(' ')}" data-date="${dateStr}">`;
        html += '<div class="calendar-day-top">' +
                    `<span class="calendar-day-number">${day}</span>` +
                    (tasks.length
                        ? `<span class="calendar-day-count${doneCount === tasks.length ? ' is-done' : ''}">${doneCount}/${tasks.length}</span>`
                        : '') +
                '</div>';
        if (dayFests.length){
            const chips = dayFests.slice(0, 2).map(f => {
                const name = escapeHtml(String(f.name || ''));
                const label = name.length > 4 ? name.slice(0, 4) : name;
                return `<span class="cal-fest kind-${f.kind || 'solar'} lv-${f.level || 2}" title="${name}">` +
                            label + (f.statutory ? '<i class="cal-fest-rest">休</i>' : '') +
                        '</span>';
            }).join('');
            html += `<div class="calendar-fest">${chips}` +
                        (dayFests.length > 2 ? `<span class="cal-fest-more">+${dayFests.length - 2}</span>` : '') +
                    '</div>';
        }
        html += '<span class="calendar-day-add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>';
        tasks.slice(0, MAX_CHIPS).forEach(t=>{
            const priorityColor = getPriorityColor(t.priority);
            const title = escapeHtml(t.title);
            const lead = t.task_line === 'main'
                ? '<span class="calendar-task-icon"><i class="fa-solid fa-diamond"></i></span>'
                : '<span class="calendar-task-icon is-side"></span>';
            html += `<div class="calendar-task-indicator status-${t.status || 'todo'}" ` +
                        `title="${title}（优先级 ${t.priority}）">` +
                    lead +
                    `<span class="calendar-task-bar" style="background:${priorityColor}"></span>` +
                    `<span class="calendar-task-title">${title}</span>` +
                '</div>';
        });
        if (tasks.length > MAX_CHIPS)
            html += `<span class="calendar-more">+${tasks.length - MAX_CHIPS} 个</span>`;
        html += '</div>';
    }
    // 下月开头：补齐最后一行，避免右下角缺一块
    const tail = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for(let i = 1; i <= tail; i++)
        html += `<div class="calendar-day other-month"><span class="calendar-day-number">${i}</span></div>`;
    html += '</div>';

    /* R41 第 5 项：本月节日图例。
       格子里的节日受宽度限制只能写 2~4 个字，图例把它们展开成"几日 · 什么节"，
       既是装饰（把网格下方那片空白填上），也让"自动算出来的节日"可读。
       没有任何节日时这一段不生成，不留空框。 */
    if (monthFests.length){
        /* 同名节日合并 + 日期区间：法定假期会连续好几天同名（春节假期 18/19 日），
           不合并的话图例里会连着出现两条一模一样的"春节假期"，像重复渲染。 */
        const merged = [];
        monthFests.slice().sort((a, b) => a.day - b.day).forEach(f => {
            const hit = merged.find(x => x.name === f.name);
            if (hit) { hit.last = f.day; return; }
            merged.push({ name: f.name, kind: f.kind, first: f.day, last: f.day });
        });
        const items = merged
            .map(f => {
                const when = (f.first === f.last) ? `${f.first}日` : `${f.first}\u2013${f.last}日`;
                return `<span class="cal-legend-item kind-${f.kind}">` +
                           `<b>${when}</b> <em>${escapeHtml(f.name)}</em>` +
                       '</span>';
            })
            .join('');
        html += `<div class="calendar-legend">` +
                    `<span class="cal-legend-title">本月节日 · ${month+1}月</span>` +
                    `<div class="cal-legend-list">${items}</div>` +
                '</div>';
    }

    container.innerHTML = html;

    if (DOM.calendarSubtitle)
        DOM.calendarSubtitle.textContent = `本月 ${monthTaskTotal} 个任务 · 已完成 ${monthTaskDone}`;

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

/* 解锁记录里的成就 id：后端新版本会给 achievement_id，
   老版本/缓存里只有 id —— 两个都认，避免"计数有、卡不亮"。 */
function achIdOf(u){ return (u && (u.achievement_id ?? u.id)) || null; }

/* 蚀刻章档位（后端 badge_config.tier）：决定外圈材质与底注文字 */
const ACH_TIER_LABEL = { bronze:'BRONZE', silver:'SILVER', gold:'GOLD', diamond:'DIAMOND' };
const ACH_TIER_METAL = { bronze:'#c08a54', silver:'#c9d2dd', gold:'#e8b818', diamond:'#8fd0ff' };

/* 解析 badge_config：后端给的是 JSON 串。老数据可能是 NULL —— 兜底也要给个能看的样子。 */
function achBadgeConf(ach){
    let conf = {};
    if (ach && ach.badge_config){
        if (typeof ach.badge_config === 'object') conf = ach.badge_config;
        else { try { conf = JSON.parse(ach.badge_config) || {}; } catch(e){ conf = {}; } }
    }
    const tier = conf.tier || 'bronze';
    return {
        /* R29 第八刀：art = 游戏原版蚀刻章图（static/img/medal/xxx.webp）。
           有它就整枚用原版章，没有才回退到下面那套 CSS 徽记。 */
        art: conf.art || '',
        icon: conf.icon || 'fa-award',
        color: conf.color || '#c8b78a',
        tier,
        metal: conf.metal || ACH_TIER_METAL[tier] || ACH_TIER_METAL.bronze,
        pattern: conf.pattern || 'none',
        text: conf.text || '',
        image: conf.image_path || ''
    };
}
/* 一枚蚀刻章的徽记本体。
   原版章（c.art）就是一枚完整的六边形蚀刻盘，直接贴图，不再叠 CSS 环/盘；
   老数据 / 自定义章才走「外圈材质环 + 内盘 + 纹样 + 中心图标」那套。 */
function achMedalHTML(c){
    if (c.art){
        return '<div class="badge-medal badge-medal--art">' +
            `<img class="badge-art" src="/static/img/${escapeHtml(c.art)}" alt="" loading="lazy" draggable="false">` +
        '</div>';
    }
    const core = c.image
        ? `<img class="badge-custom-img" src="${escapeHtml(c.image)}" alt="">`
        : (c.text
            ? `<span class="badge-custom-text">${escapeHtml(c.text)}</span>`
            : `<i class="fa-solid ${c.icon}"></i>`);
    return '<div class="badge-medal">' +
        '<span class="badge-ring"></span>' +
        '<span class="badge-plate"></span>' +
        `<span class="badge-icon pattern-${c.pattern}">${core}</span>` +
    '</div>';
}

function renderAchievements(){
    // 防止数据未加载完时渲染导致"先亮后灭"闪烁
    if(!state.achievements.length || !state.unlockedAchievements) return;
    const grid=DOM.achievementsGrid; if(!grid) return;
    grid.innerHTML='';
    const unlockedIds = new Set(state.unlockedAchievements.map(achIdOf).filter(Boolean));
    const filter = state.medalFilter || 'all';
    state.achievements.forEach(ach=>{
        const unlocked = unlockedIds.has(ach.id);
        if (filter === 'unlocked' && !unlocked) return;
        if (filter === 'locked' && unlocked) return;
        const c = achBadgeConf(ach);
        const card=document.createElement('div');
        card.className = 'achievement-card ' + (unlocked ? 'unlocked' : 'locked');
        card.dataset.tier = c.tier;
        card.style.setProperty('--ach-color', c.color);
        card.style.setProperty('--ach-metal', c.metal);
        card.title = `${ach.name}\n${ach.description}${unlocked ? '\n已解锁' : '\n未解锁'}`;
        card.innerHTML = achMedalHTML(c) +
            '<div class="achievement-tier">' + (ACH_TIER_LABEL[c.tier] || c.tier) + '</div>' +
            `<div class="achievement-name">${escapeHtml(ach.name)}</div>` +
            `<div class="achievement-desc">${escapeHtml(ach.description)}</div>` +
            '<div class="achievement-state">' + (unlocked ? '<i class="fa-solid fa-check"></i> 已解锁' : '<i class="fa-solid fa-lock"></i> 未解锁') + '</div>';
        grid.appendChild(card);
    });
}

/* R21：主页「已解锁蚀刻章」重做。
   旧版只渲染了一个个圆图标 + 一条竖线（用户："没有描述只有图标排列"），
   既不知道这是什么章，也不知道怎么拿到的。
   现在每个章都是一张卡：勋章 + 名称 + 描述 + 档位，和采购中心里那套完全一致。 */
function renderProfileBadges(){
    const grid = DOM.profileBadgesGrid; if(!grid) return;
    grid.innerHTML = '';
    const unlocked = state.unlockedAchievements || [];
    const total = state.achievements.length || 0;
    if (DOM.profileBadgesCount) {
        DOM.profileBadgesCount.textContent = total ? `${unlocked.length} / ${total}` : '';
    }
    if (!unlocked.length) {
        grid.innerHTML = '<div class="profile-badges-empty">还没有解锁任何蚀刻章——完成任务、坚持打卡就会陆续点亮。</div>';
        return;
    }
    unlocked.forEach(u => {
        const ach = state.achievements.find(a => a.id === achIdOf(u));
        if (!ach) return;
        const c = achBadgeConf(ach);
        const card = document.createElement('div');
        card.className = 'profile-badge-card';
        card.style.setProperty('--ach-color', c.color);
        card.style.setProperty('--ach-metal', c.metal);
        card.innerHTML =
            `<span class="pbc-medal">${achMedalHTML(c)}</span>` +
            '<span class="pbc-text">' +
                `<span class="pbc-name">${escapeHtml(ach.name)}</span>` +
                `<span class="pbc-desc">${escapeHtml(ach.description)}</span>` +
            '</span>' +
            `<span class="pbc-tier" data-tier="${escapeHtml(c.tier)}">${escapeHtml(ACH_TIER_LABEL[c.tier] || c.tier)}</span>`;
        grid.appendChild(card);
    });
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
    // R21：部分礼包额外产出 1 件限定时装（原版不能用源石兑换的那批）
    const skinDrop = Number(cfg.skin_drop) || 0;
    const mats = [];
    (cfg.materials || []).forEach(m => mats.push({ key: m.type, amount: Number(m.amount) || 1 }));
    (cfg.random || []).forEach(s => {
        const parts = String(s).split(':');
        const k = parts[0], n = parseInt(parts[1], 10) || 1;
        if (!k) return;
        if (GP_RES_NAME[k]) res[k] = (res[k] || 0) + n;
        else mats.push({ key: k, amount: n });
    });
    return { res, mats, skinDrop };
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
        const { res, mats, skinDrop } = parsePackContents(pack);
        const chips = [];
        // 限定时装：单独一枚紫色 chip，和普通素材区分开
        if (skinDrop){
            chips.push(`<span class="gp-chip is-skin" title="随机获得 1 件限定时装">` +
                `<i class="fa-solid fa-shirt"></i><b>×${skinDrop}</b><i>限定时装</i></span>`);
        }
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

/* 理智上限 = 博士等级的函数（原版曲线：1级82 / 5级90 / 35级120 / 85级130 / 120级135）。
   上限曲线只在后端算，前端拿 meta 渲染成 tooltip，避免公式两边各写一份走偏。 */
function applySanityCapHint(sanityCap){
    const m = state.resourceMeta;
    const nav = document.getElementById('navSanityDisplay');
    const item = document.getElementById('profileSanityItem');
    let tip = `理智上限 ${sanityCap}`;
    if (m && m.sanity_cap != null) {
        tip += `　·　当前 Lv.${m.level}`;
        if (m.sanity_cap_gain > 0) {
            tip += `\n升到 Lv.${m.level + 1} → 上限 ${m.sanity_cap_next}（+${m.sanity_cap_gain}）`;
        } else if (m.sanity_next_gain_level) {
            tip += `\n本级上限不增长，升到 Lv.${m.sanity_next_gain_level} 时 +${m.sanity_next_gain_amount}`;
        } else {
            tip += `\n已达等级上限，理智上限封顶 ${m.sanity_cap_max}`;
        }
        tip += `\n满级（Lv.${m.sanity_level_cap}）封顶 ${m.sanity_cap_max}`;
    }
    if (nav) nav.title = tip;
    if (item) item.title = tip;
}

function updateResourceDisplay(){
    const res=state.resources;
    if(res.lungmen?.current_value!==undefined){ DOM.resLungmen.textContent=res.lungmen.current_value; }
    if(res.orundum?.current_value!==undefined){ DOM.resOrundum.textContent=res.orundum.current_value; }
    if(res.source_stone?.current_value!==undefined){ DOM.resStone.textContent=res.source_stone.current_value; }
    // 理智上限由博士等级决定（原版曲线，见后端 sanity_cap），别再用 ||120 兜底
    const sanityCap = state.resourceMeta?.sanity_cap ?? res.sanity?.max_value ?? 120;
    if(res.sanity?.current_value!==undefined){ DOM.resSanityCurrent.textContent=res.sanity.current_value; DOM.resSanityMax.textContent=sanityCap; }
    applySanityCapHint(sanityCap);
    /* R38：这里原本还有一句写「总经验值」徽章的语句，但 DOM.profileExp 从未被赋值过
       （DOM 初始化里只有 profileExpFill / profileExpText），它一直是个空转的死代码；
       同时主页也按需求去掉了总经验值展示，一并删掉。等级本身走下面的 profileLevel。 */
    if(DOM.profileStone) DOM.profileStone.textContent = res.source_stone?.current_value || 0;
    if(DOM.profileLungmen) DOM.profileLungmen.textContent = res.lungmen?.current_value || 0;
    if(DOM.profileOrundum) DOM.profileOrundum.textContent = res.orundum?.current_value || 0;
    if(DOM.profileSanity) DOM.profileSanity.textContent = `${res.sanity?.current_value||0}/${sanityCap}`;
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
     R36 当前档：L1=60, L2=115, L5=300, L10=715, L20=1915, L30=3615, L50=8515, L100=29515
     （R35 及以前是 LIN=20 / QUAD=1.0：L1=60, L2=80, L5=155, L10=320, L20=800,
       L30=1480, L50=3440, L100=11840。用户反馈"升级太容易了"，R36 把每级需求
       整体提到约 2.4 倍：L20 800→1915、L30 1480→3615。）
     每级增量从 ~55 一路涨到 ~500+，后期越来越难，增速肉眼可见。
   调参：BASE↑ 整体更难；LIN↑ 中期更快变难；QUAD↑ 后期更陡。
   注意：改曲线会让既有经验对应的等级重新标定（等级数会下降），属正常现象。
   R37 难度平衡：曲线整体再抬高约 2.6 倍（BASE 60→160 / LIN 50→170 / QUAD 2.5→13），
   exp=22043 这道存档由 L23 重定标为 L12。 */
/* 曲线说明见上方「等级 / 经验曲线」注释块。
   改动这几个常量时必须同步 main.py 的 _LEVEL_BASE/_LEVEL_LIN/_LEVEL_QUAD/_LEVEL_ROUND/_LEVEL_FLOOR，
   否则前端显示等级与后端升级检测会不一致。 */
const LEVEL_BASE = 160;
const LEVEL_LIN = 170;
const LEVEL_QUAD = 13;
const LEVEL_STEP = 5;
const LEVEL_FLOOR = 50;
function levelExpForLevel(level){
    const n = Math.max(0, level - 1);
    const need = LEVEL_BASE + LEVEL_LIN * n + LEVEL_QUAD * n * n;
    return Math.max(LEVEL_FLOOR, Math.round(need / LEVEL_STEP) * LEVEL_STEP);
}
function levelProgress(exp){
    // exp 若是 NaN/undefined（后端字段缺失），`exp < total+need` 永远为假 → 死循环。
    // 与父链那个 bug 同一类风险，这里一并兜住。
    if (!Number.isFinite(exp)) exp = 0;
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
    if (view === 'shop') { renderShopPanel(); ensureShopData(); }
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
            collapseTrackingPanel();
            if (document.body.classList.contains('focus-mode')) await stopPomodoro();
        } else {
            showToast('追踪停止失败，请手动停止');
        }
    }

    // R29：局部更新 —— 只拉数据、不整表重绘。
    // 旧写法 loadTasks()+renderTasks() 会把整张列表 DOM 重建两遍，用户正在操作的
    // 列表瞬间被刷掉（闪烁、丢焦点）。现在拉完数据后只定点刷新受影响的卡。
    await Promise.all([reloadTaskData(), loadResources(), loadRealityRewards()]);

    const updatedTask = state.flatTasks.find(t => t.id === taskId);
    if (updatedTask && updatedTask.status === 'done') {
        /* R19：快捷完成后【不再自动弹】领取奖励窗口。
           R32：领奖入口改成「点整卡即可」+ 右侧可领取徽章，提示语跟着改。 */
        if (claimStateOf(updatedTask) === 'claimable') {
            showToast('任务完成 · 点一下这张卡片即可领取奖励');
        } else {
            showToast('任务已完成');
        }
        notifyRepeatIfNeeded(updatedTask);
    }
    updateTrackingPanel();
    refreshTaskCardFor(taskId);
    if (updatedTask && (updatedTask.track || 'daily') === 'campaign') renderCampaignSection();
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
    /* R29 第九刀：定点刷新也要重算领取徽章。
       以前这里只更新进度条，徽章状态不参与重算 —— 于是「领完奖励」的卡片
       要等到下一次整表重绘才会摘掉「可领取」，这期间点它毫无反应。
       现在徽章按 data-state 记住自己是哪一态，变了就整块换掉。 */
    const claimState = claimStateOf(task);
    /* R33：不再整体重写 className。旧写法 `card.className = ...` 只列了它记得住的
       那几个类，于是 createTaskCard 写上的 task-level-N / task-in-group-child
       会在第一次定点刷新后**凭空消失** —— 卡片缩进跳一格、分组样式掉色。
       现在只增删「与状态有关」的那几个类，其余原样保留。 */
    card.classList.remove('status-todo', 'status-in_progress', 'status-paused', 'status-done', 'status-cancelled',
                          'claimable', 'claimed', 'dependency-blocked');
    card.classList.add(`status-${task.status}`);
    if (isBlocked(task)) card.classList.add('dependency-blocked');
    /* 三态互斥：claimable / claimed 绝不会同时挂上，所以"已领取还长着可领取的样子"
       从类名这一层就不可能发生。 */
    if (claimState === 'claimable') card.classList.add('claimable');
    else if (claimState === 'claimed') card.classList.add('claimed');
    card.classList.toggle('selecting', !!state.selectionMode);
    card.classList.toggle('selected', !!(state.selectedIds && state.selectedIds.has(task.id)));
    card.dataset.status = task.status;
    /* R41 第 2 项：先把这张卡上的领奖行**一次清干净**。
       旧写法只 remove(card.querySelector('.task-claim-row')) 的第一条 ——
       万一某条路径留下了两行（例如 renderTasks 与 refreshTaskCard 交错），
       第二条就会永久挂在卡上，正是"领完奖励按钮还残留"的另一种形态。
       现在无论旧状态如何都先全清，永远至多一行。 */
    const oldRows = card.querySelectorAll('.task-claim-row');
    const oldRow = oldRows[0] || null;
    if (claimState === 'unclaimable') {
        oldRows.forEach(r => r.remove());
    } else if (!oldRow || oldRow.dataset.state !== claimState || oldRows.length > 1) {
        oldRows.forEach(r => r.remove());
        const newRow = buildClaimRow(claimState, task, card);
        // 与 createTaskCard 保持一致：挂进 .task-main，独占内容列一整行、贴右
        claimRowMount(card).appendChild(newRow);
    }
}

/* R29：定点刷新一张卡及其关联卡（父任务 + 直接子任务）。
   「完成任务」会让一张卡连带父子状态一起变（后端级联完成子任务、父任务进度
   随之变化），过去靠整表 renderTasks() 兜住，现在改为只刷这几张卡 —— 列表
   其余部分完全不动，用户不会看到闪一下。卡片不存在（被筛掉/收起）时各自 no-op。 */
function refreshTaskCardFor(taskId) {
    const task = state.flatTasks.find(t => t.id === taskId);
    refreshTaskCard(taskId);
    if (task && task.parent_id) refreshTaskCard(task.parent_id);
    state.flatTasks.forEach(t => { if (t.parent_id === taskId) refreshTaskCard(t.id); });
    // 完成/领取会解除依赖它的任务阻塞 —— 顺手把当前显示为「依赖阻塞」的卡重算一遍，
    // 否则它们会一直挂着旧样式，直到下一次整表刷新。
    document.querySelectorAll('.task-card.dependency-blocked').forEach(c => {
        const id = Number(c.dataset.taskId);
        if (id) refreshTaskCard(id);
    });
    updateClaimAllButton();
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
            await reloadTaskData();
            await loadResources();
            await loadRealityRewards();
            const updatedTask=state.flatTasks.find(t=>t.id===taskId);
            if(updatedTask && updatedTask.status==='done'){
                /* R19：与 completeTaskAndHandleReward 一致 —— 计数达标也不自动弹窗。
                   R29 第九刀：提示语指向右侧徽章（点卡片只进详情页）。 */
                if(claimStateOf(updatedTask)==='claimable'){
                    showToast('任务完成 · 点右侧「可领取」领取奖励');
                } else {
                    showToast('任务已完成');
                }
                notifyRepeatIfNeeded(updatedTask);
            }
            updateTrackingPanel();
            refreshTaskCardFor(taskId);
            if(updatedTask && (updatedTask.track||'daily')==='campaign') renderCampaignSection();
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

/* ===== R41 第 2 项：「领取奖励 / 已领取」的唯一权威开关 =====
   用户报的是「领取奖励后按钮残留」。根因是弹窗底部那颗按钮的状态被
   **三处各自为政地改**（openRewardModal 分支里写 style.display、
   showPackRewardModal 里写 style.display、claimReward 里又不写），
   外加 `dataset.taskId` 从来不清 —— 于是"上一次打开留下的显示状态 / 旧任务 id"
   会跟着下一次打开一起进场。现在收敛成这一个函数：
     · 两个状态是 DOM 里的**互斥兄弟节点**（btn / #rewardClaimedState），
       只切 hidden 类，不再靠内联 style 记忆状态；
     · 每次调用都**重写** dataset.taskId（不需要时删掉），不留可复用的旧 id；
     · 领奖时把按钮同时 disabled —— 即使因为动画/慢关闭而短暂留在屏幕上，
       它也不再是可点的「领取奖励」。
   任何打开奖励弹窗的路径都必须先调它，没有例外。 */
function setRewardFooter(mode, taskId){
    const btn = DOM.rewardClaimBtn, st = DOM.rewardClaimedState;
    if (st) st.classList.toggle('hidden', mode !== 'claimed');
    if (!btn) return;
    btn.classList.toggle('hidden', mode !== 'claim');
    btn.disabled = (mode !== 'claim');
    btn.style.display = '';                       // 清掉历史内联值，显示与否只由 .hidden 决定
    if (mode === 'claim' && taskId != null) btn.dataset.taskId = String(taskId);
    else delete btn.dataset.taskId;
}

async function openRewardModal(taskId){
    rewardModalOpenTaskId = taskId;
    // 掉落素材要靠仓库目录反查中文名/图标；目录是异步加载的，这里先确保就绪，
    // 否则用户没开过仓库就点奖励 → 随机掉落会显示成原始 key + 宝箱占位图。
    await loadWarehouseCatalog();
    const titleEl = document.querySelector('#rewardModal .modal-title');
    if(titleEl) titleEl.textContent = '任务奖励';
    const task=state.flatTasks.find(t=>t.id===taskId);
    /* R41：提前返回也必须清掉 rewardModalOpenTaskId。以前 `if(!task) return;` 直接走人，
       留下一个陈旧 id —— updateTrackingPanel 里判 `rewardModalOpenTaskId===task.id`
       就会把追踪面板的「领取奖励」按钮永久 hidden，看起来像"按钮丢了"。 */
    if(!task){ rewardModalOpenTaskId=null; return; }
    // 防御性拦截：已领取的任务不再打开弹窗
    if(isClaimedFlag(task.reward_claimed)){
        showToast('奖励已领取');
        rewardModalOpenTaskId=null;
        if(typeof updateTrackingPanel==='function') updateTrackingPanel();
        return;
    }
    DOM.rewardDetails.innerHTML='';
    /* R41 第 2 项：每次打开都先把底部两个互斥状态钉死，再往下渲染。
       顺序很重要 —— 放在渲染之前，后面任何分支都不必再操心"上一次的残留"。 */
    setRewardFooter('claim', taskId);
    if(DOM.rewardEyebrow) DOM.rewardEyebrow.textContent='MISSION REWARD';
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

    /* R41 第 1 项：这里原先会造一个**居中的绿色打勾**（.reward-external-check），
       把「三颗资源图标」和「随机掉落」切成上下两半 —— 用户点名不要这种
       「打勾图标居中、发放奖励置下」的排布，整块已删除。
       打勾的语义收敛到两处：能领时是底部那颗领取按钮，领完之后是底部那颗
       互斥的「奖励已领取」（#rewardClaimedState）。两者都由 setRewardFooter 管，
       本函数开头已经 setRewardFooter('claim', taskId) 钉过一次，这里只处理空态。 */
    if(!hasReward&&!hasDrop){
        setRewardFooter('none');
        const emptyMsg=document.createElement('p'); emptyMsg.className='reward-empty-msg';
        emptyMsg.textContent='该任务没有可领取的奖励'; DOM.rewardDetails.appendChild(emptyMsg);
    }
    openModal('rewardModal');
}

async function claimReward(){
    const taskId=DOM.rewardClaimBtn.dataset.taskId; if(!taskId||state.rewardModalAnimating) return;
    state.rewardModalAnimating=true;
    const result=await apiPost(`/tasks/${taskId}/claim-reward`);
    if(result){
        /* R41 第 2 项：**拿到成功响应的第一件事**就是把底部切成「奖励已领取」。
           后面的粒子动画 + 380ms 退场动画期间弹窗还挂在屏幕上，
           旧版这时按钮仍是可点的「领取奖励」—— 用户看到的就是"领完了按钮还在"。
           先切状态，再谈动画。 */
        setRewardFooter('claimed');
        /* 服务端已确认发奖：先把「已领取」写回本地，再走视觉收尾，
           避免动画期间卡片还挂着「可领取」被再点一次。 */
        const ids=(Array.isArray(result.detail)?result.detail:[]).map(d=>d&&d.id).filter(Boolean);
        markClaimedLocally(ids.length?ids:[Number(taskId)]);
        /* R32：视觉收尾改成「光环从弹窗扩散 → 弹窗按统一退场动画收掉」。
           这里不再手写内联 transform/opacity：CSS 动画的优先级高于内联普通声明，
           两套写法叠在同一个元素上只会互相打架（旧版就是硬等 600ms 才 close）。 */
        spawnParticlesGatherThenFly(document.querySelector('#rewardModal .modal'));
        setTimeout(()=>closeAllModals(), 380);
        setTimeout(()=>{
            state.rewardModalAnimating=false;
            // R29：领取后局部更新 —— 只拉数据 + 定点刷新该卡（含父子），不整表重绘
            loadResources(); loadTransactions();
            reloadTaskData().then(() => refreshTaskCardFor(taskId));
            updateTrackingPanel(); loadInventory();
            // 明确提示素材已入库（带中文名），避免"领了奖励但感觉仓库没变化"
            const mats = (result && Array.isArray(result.materials)) ? result.materials : [];
            if (mats.length){
                const parts = mats.map(m => `${matNameOf(m.type)}×${Math.floor(Number(m.amount) || 0)}`);
                showToast(`仓库入库：${parts.join('、')}`);
            }
            notifyEconomyCap(result.capped);
            const sorted=filterTasks(state.flatTasks); const currentIndex=sorted.findIndex(t=>t.id==taskId);
            if(currentIndex!==-1&&currentIndex+1<sorted.length){ const nextTaskId=sorted[currentIndex+1].id;
                const nextCard=document.querySelector(`.task-card[data-task-id="${nextTaskId}"]`);
                if(nextCard){ nextCard.classList.add('highlight-next'); nextCard.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(()=>nextCard.classList.remove('highlight-next'),3000); } }
        }, 760);
    } else {
        state.rewardModalAnimating=false;
        /* 领取失败（最常见的就是后端回「奖励已领取」→ 说明别的入口已经发过了）：
           关掉过期弹窗并把卡片状态拉回真实值，卡片会立刻变成「已领取」，
           不再留在「可领取」却怎么点都没反应。 */
        closeAllModals();
        resyncClaimState(Number(taskId));
    }
}

function spawnParticlesGatherThenFly(sourceElement) {
    // 保留旧函数名兼容（claimReward 还在调用），内部委托给新动画
    playRewardFlyEffect(sourceElement, null);
}

/**
 * 领取反馈动画（R19 重做）
 * 旧版是「8 个随机 ✦/★/+/✧ 文字 + 15 个随机方块/圆点乱飞」—— 用户直说太丑，已整体删掉。
 * 新版只做两件克制的事，对齐方舟原版那种"一闪即收"的反馈：
 *   1) 源位置扩散两道方舟蓝光环（纯圆环，无字符、无方块碎片）
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

    // ── 1) 方舟蓝光环扩散（两道，错开 90ms）──
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
        notifyEconomyCap(result.capped);
    }
}

function updateClaimAllButton(){
    const hasClaimable=state.flatTasks.some(t=>claimStateOf(t)==='claimable');
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

    const settingDefs=[ {key:'quick_track',label:'快捷追踪按钮',type:'checkbox'}, {key:'claim_with_children',label:'领取父任务时一并领取子任务奖励',type:'checkbox'}, {key:'show_side_when_tracking_main',label:'追踪主线时显示支线',type:'checkbox'}, {key:'show_main_when_tracking_side',label:'追踪支线时显示主线',type:'checkbox'}, {key:'show_sanity',label:'理智显示开关',type:'checkbox'} ];
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
        showTrackingPanel();
    }

    if (DOM.sanityDisplay) {
        DOM.sanityDisplay.style.display = state.settings.show_sanity === false ? 'none' : 'flex';
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

/* 连续缩放（R21）
   旧版是「scale 每次 ±0.2，宽度 = 固定 800 / scale」。
   问题在于 auto-fit 之后 viewBox 宽高早就被改成内容实际尺寸（可能 1600×1400），
   而缩放却拿死值 800 当基准 —— 于是轻轻点一下放大，视口直接从 1600 跳到 667，
   视觉上"突然变成这么大"。
   现在改成：以当前 viewBox 为基准做倍率缩放，锚点（鼠标位置 / 视口中心）保持不动，
   步长也调细（滚轮 1.10、按钮 1.25），缩放是连续的、想停哪停哪。 */
const GRAPH_ZOOM_MIN = 0.2, GRAPH_ZOOM_MAX = 6;
function setGraphZoom(factor, anchorX, anchorY){
    const view = state.graphViewBox;
    const cur = state.graphScale || 1;
    let next = cur * (factor || 1);
    next = Math.max(GRAPH_ZOOM_MIN, Math.min(GRAPH_ZOOM_MAX, next));
    if (Math.abs(next - cur) < 1e-6) return;
    const k = next / cur;                       // >1 = 放大
    const ax = (anchorX == null) ? view.x + view.width  / 2 : anchorX;
    const ay = (anchorY == null) ? view.y + view.height / 2 : anchorY;
    view.x = ax - (ax - view.x) / k;
    view.y = ay - (ay - view.y) / k;
    view.width  = view.width  / k;
    view.height = view.height / k;
    state.graphScale = next;
    state.graphUserPanned = true;               // 标记用户手动操作，阻止 auto-fit
    DOM.graphSvg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
}
/* 把屏幕坐标换算成 SVG 用户坐标，用于「以鼠标为锚点缩放」 */
function graphPointFromEvent(e){
    const svg = DOM.graphSvg;
    try {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = svg.getScreenCTM();
        if (m) return pt.matrixTransform(m.inverse());
    } catch (_) { /* 退回下面的近似换算 */ }
    const r = svg.getBoundingClientRect();
    const v = state.graphViewBox;
    return {
        x: v.x + (e.clientX - r.left) / Math.max(1, r.width)  * v.width,
        y: v.y + (e.clientY - r.top)  / Math.max(1, r.height) * v.height,
    };
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
    if(window.innerWidth<=768 && trackingPanelIsOpen()) collapseTrackingPanel();
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
        /* 把「奖励处在哪一态」明写出来，和列表卡徽章同源，
           避免「列表说可领取、详情页按钮却不见了」这种前后不一致的观感。 */
        ['奖励',{claimable:'可领取',claimed:'已领取',unclaimable:'不可领取'}[claimStateOf(task)],'fa-gift'],
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
    /* R29 第九刀：详情页的三态与列表卡完全一致（同一个 claimStateOf）。
       以前这里只判 `!task.reward_claimed` —— 已领取时按钮直接消失，用户看不出
       到底是「领过了」还是「没奖励可领」。现在已领取会留一个禁用的按钮。 */
    const detailClaimState = claimStateOf(task);
    if(task.status!=='done'){
        const completeBtn=document.createElement('button'); completeBtn.className='btn btn-primary'; completeBtn.innerHTML='<i class="fa-solid fa-check"></i> 完成任务';
        completeBtn.addEventListener('click',async()=>{ closeAllModals(); await completeTaskAndHandleReward(taskId); });
        btnContainer.appendChild(completeBtn);
    } else if(detailClaimState==='claimable'){
        const rewardBtn=document.createElement('button'); rewardBtn.className='btn btn-primary'; rewardBtn.innerHTML='<i class="fa-solid fa-gift"></i> 领取奖励';
        rewardBtn.addEventListener('click',()=>{ closeAllModals(); openRewardModal(task.id); });
        btnContainer.appendChild(rewardBtn);
    } else if(detailClaimState==='claimed'){
        const doneBtn=document.createElement('button'); doneBtn.className='btn btn-claimed'; doneBtn.disabled=true; doneBtn.innerHTML='<i class="fa-solid fa-check"></i> 奖励已领取';
        btnContainer.appendChild(doneBtn);
    }
    DOM.taskDetailBody.appendChild(btnContainer);
    openModal('taskDetailModal');
}

// 礼包 / 任务领取后弹出与「领取奖励」同款的奖励结算弹窗（物品已在后端发放完毕，此处仅展示）
// R41：新增第二参 footerMode —— 'claimed' 显示「奖励已领取」，省略则底部什么都不显示。
function showPackRewardModal(granted, footerMode){
    if(!granted || !granted.length) return;
    const titleEl = document.querySelector('#rewardModal .modal-title');
    if(titleEl) titleEl.textContent = '任务奖励';
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
        /* R21：限定时装奖励 —— 原版不能用源石兑换的那批皮肤，
           用皮肤立绘本身当奖励图标，比通用宝箱更能体现"开出了什么"。 */
        if(key === 'skin' && g.skin){
            const sk = g.skin;
            const scard = document.createElement('div'); scard.className = 'reward-circle-card';
            const scircle = document.createElement('div'); scircle.className = 'reward-circle';
            const sring = document.createElement('div'); sring.className = 'reward-ring';
            sring.style.setProperty('--ring-color', '#c07ae8');
            const sicon = document.createElement('div'); sicon.className = 'reward-icon-wrap';
            if(sk.image){
                const sim = document.createElement('img');
                sim.src = `/static/${sk.image}`; sim.alt = sk.skin_name || '限定时装';
                sim.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
                sim.addEventListener('error', () => { sicon.innerHTML = DROP_CHEST_SVG; });
                sicon.appendChild(sim);
            } else { sicon.innerHTML = DROP_CHEST_SVG; }
            const snum = document.createElement('div'); snum.className = 'reward-num-badge'; snum.textContent = 'x1';
            scircle.appendChild(sring); scircle.appendChild(sicon); scircle.appendChild(snum);
            scard.appendChild(scircle);
            const slabel = document.createElement('div'); slabel.className = 'reward-label';
            slabel.textContent = sk.skin_name || '限定时装';
            slabel.title = `${sk.operator_name || ''} · ${sk.tier_label || ''}`;
            scard.appendChild(slabel);
            grid.appendChild(scard);
            return;
        }
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
    /* R41 第 2 项：这批东西**已经发到手了**，底部绝不能留一颗还能点的「领取奖励」。
       以前这里写 style.display='none' —— 显示状态被内联 style 记着，
       下一次打开走的若是别的分支就不会复位，"按钮残留"正是这么来的。
       现在统一交给 setRewardFooter，它同时会清掉 dataset.taskId（杜绝旧 id 再提交）：
         footerMode='claimed' → 显示互斥的「奖励已领取」（任务领奖）
         footerMode 省略       → 显示「奖励已领取」也不合适，改为什么都不显示（礼包） */
    setRewardFooter(footerMode === 'claimed' ? 'claimed' : 'none');
    if(DOM.rewardEyebrow) DOM.rewardEyebrow.textContent='REWARD GRANTED';
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
    const result=await apiPost('/resources/exchange',{from_type:'source_stone',to_type:'orundum',amount});
    if(result){
        await loadResources(); await loadTransactions(); await loadRealityRewards();
        // R21：不再是弹窗，兑换完留在子页并把数量复位（原来这里是 closeAllModals）
        initExchange();
        showToast('兑换成功');
    } }
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
    /* R21：去掉「再 N 抽内必出」那行小字（用户要求）。
       保底机制本身照旧生效，只是不再把结论写在界面上。 */
    DOM.operatorGachaPity.innerHTML =
        `<span class="gh-pity-item">累计寻访 <b>${pity.total_pulls}</b> 次</span>` +
        `<span class="gh-pity-sep"></span>` +
        `<span class="gh-pity-item">距上次 ${goldStars(6)} 已 <b>${pity.since_last_6star}</b> 抽</span>`;
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
let ghBagFinish = null;      // 开袋阶段还在等用户拉链时，跳过要能把它收尾
function ghAfter(ms, fn){ ghTimers.push(setTimeout(fn, ms)); }
function ghClearTimers(){ ghTimers.forEach(clearTimeout); ghTimers = []; }
function ghEl(id){ return document.getElementById(id); }
/* 音效包装：QLSfx 没加载或浏览器不支持发声时静默跳过，绝不能因为音效拖垮演出 */
function ghSfx(name, arg){
    try {
        if (typeof QLSfx !== 'undefined' && QLSfx && typeof QLSfx[name] === 'function') QLSfx[name](arg);
    } catch (e) { /* 音效失败不影响演出 */ }
}

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

/* 6★ 出率命中时撒一把上升的光粒（对齐原版十连「彩虹光效 + 粒子」那一层）。
   容器按需建、粒子自毁，不留残留节点。 */
function ghSparkBurst(){
    const stage = ghEl('ghStage'); if (!stage) return;
    let box = stage.querySelector('.gh-sparks');
    if (!box){ box = document.createElement('div'); box.className = 'gh-sparks'; stage.appendChild(box); }
    const palette = ['#fff6d8', '#ffd76a', '#ff9c2a', '#8fd0ff', '#ffffff', '#ffb3d1'];
    for (let i = 0; i < 46; i++){
        const s = document.createElement('span');
        const size = 3 + Math.random() * 5;
        const color = palette[(Math.random() * palette.length) | 0];
        s.style.width = `${size}px`; s.style.height = `${size}px`;
        s.style.left = `${8 + Math.random() * 84}%`;
        s.style.top = `${56 + Math.random() * 30}%`;
        s.style.background = color; s.style.color = color;
        s.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 260}px`);
        s.style.setProperty('--dy', `${-(120 + Math.random() * 330)}px`);
        s.style.animationDelay = `${Math.random() * 0.22}s`;
        box.appendChild(s);
        ghAfter(1500, () => s.remove());
    }
}

/* 阶段一：拉起舞美 + PRTS 连接。返回一个 Promise，代表连接演出走完。
   调用方可以拿它和 /gacha/operator 请求并行跑，省掉等待时间。 */
function ghStartStage(){
    const stage = ghEl('ghStage');
    const reveal = ghEl('ghReveal');
    const bootText = ghEl('ghBootText');
    const bootBar = ghEl('ghBootBar');
    const auth = ghEl('ghAuth');
    const authText = ghEl('ghAuthText');
    ghClearTimers();
    ghSkipped = false;
    if (reveal) reveal.innerHTML = '';
    if (auth) auth.classList.remove('granted');
    if (!stage) return sleep(1200);
    stage.className = 'gh-stage showing boot';
    stage.classList.remove('hidden');
    if (bootBar) bootBar.style.width = '0%';
    if (authText) authText.textContent = 'PRTS 授权中';
    return (async () => {
        ghAfter(60, () => { if (bootBar) bootBar.style.width = '100%'; });
        const lines = ['PRTS 授权校验中…', '数据链路加密同步中…', '寻访协议解析中…'];
        for (const t of lines){
            if (ghSkipped) return;
            if (bootText) bootText.textContent = t;
            await sleep(ghPace(430));
        }
        if (ghSkipped) return;
        if (authText) authText.textContent = '授权通过';
        if (auth) auth.classList.add('granted');   // 触发「授权通过」印章动画
        await sleep(ghSkipped ? 0 : 720);
    })();
}
// 跳过时把剩下的等待压成 0，演出立刻收尾
function ghPace(ms){ return ghSkipped ? 0 : ms; }

/* ── 阶段一点五：补给袋 + 拉链（R24：还原原版「拉袋子」）──────────────
   插在「PRTS 建链」与「逐张翻牌」之间，对齐原版寻访演出的四拍：
     ① 补给袋从上方砸下来（落地闷响，带一次触地挤压与回弹）
     ② 落地后先响一段「星级 BGM」—— 原版只听这段就能预判出货星级
     ③ 玩家按住拉链头向右拖，缝里漏出的光随进度变强，颜色 = 本次最高稀有度
        （原版配色：火光 6★ / 金光 5★ / 紫光 4★ / 白光 3★）
     ④ 拉到底 → 袋口翻开 + 按稀有度染色的全屏光爆 → 干员资料本（卡牌）冒出
   拖动进度只写一个 CSS 变量 --p（0~1），位移/辉光/袋口张开全在 CSS 里算。
   松手若已过 78% 直接判定拉开，否则弹回起点 —— 既不让手抖的人白拉，
   也保证「拉到底」这个动作是有意义的。 */
const GH_LEAK_COLOR = { 3: '#e8f2ff', 4: '#a45cff', 5: '#ffc94a', 6: '#ff5a1f' };

function ghRunBag(bestRarity, count){
    const env = ghEl('ghEnv'), body = ghEl('ghEnvBody'), hint = ghEl('ghEnvHint');
    const code = ghEl('ghBagCode');
    if (!env || !body) return Promise.resolve();
    const rar = bestRarity || 3;
    body.style.setProperty('--p', '0');
    body.style.setProperty('--leak', GH_LEAK_COLOR[rar] || GH_LEAK_COLOR[3]);
    env.classList.remove('lit', 'ready', 'leaving', 'burst');
    /* 重放一次落地动画（读一次 offsetWidth 强制回流，否则连加同类名浏览器不会重跑） */
    body.classList.remove('dropping');
    void body.offsetWidth;
    body.classList.add('dropping');
    if (code) code.textContent = (count && count > 1) ? `SUPPLY ×${count}` : 'SUPPLY';
    if (hint) hint.textContent = '按住拉链向右拖动';
    /* ① 落地闷响（对齐原版包裹坠地那一拍） */
    ghAfter(ghSkipped ? 0 : 380, () => { if (!ghSkipped) ghSfx('bagDrop'); });
    /* ② 星级 BGM：落地稳了再响，原版就是这一小段在提示出货星级 */
    ghAfter(ghSkipped ? 0 : 740, () => { if (!ghSkipped) ghSfx('starTune', rar); });
    return new Promise(resolve => {
        const TICKS = 11;
        let p = 0, dragging = false, startX = 0, startP = 0, lastTick = -1, done = false;

        function paint(){
            body.style.setProperty('--p', p.toFixed(4));
            env.classList.toggle('lit', p > 0.05);
            env.classList.toggle('ready', p >= 1);
        }
        function setP(v, silent){
            p = Math.max(0, Math.min(1, v));
            paint();
            if (silent) return;
            const step = Math.floor(p * TICKS);
            if (step !== lastTick && step > 0 && p < 1){
                lastTick = step;
                ghSfx('zipTick', 0.28 + p * 0.5);   // 越往右越响，对齐原版拉链的爬音
            }
        }
        function unbind(){
            body.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        }
        function finish(){
            if (done) return;
            done = true; dragging = false; ghBagFinish = null;
            body.classList.remove('grabbing');
            unbind();
            setP(1, true);
            if (ghSkipped) { env.classList.add('leaving'); resolve(); return; }
            /* ④ 袋口彻底拉开：呲啦一声 + 稀有度染色的光爆 + 收尾重音 */
            env.classList.add('burst');
            ghSfx('bagOpen', rar);
            ghAfter(150, () => ghSfx('out', rar));
            ghAfter(620, () => { env.classList.add('leaving'); resolve(); });
        }
        function onDown(e){
            if (done || ghSkipped || e.button > 0) return;
            dragging = true;
            startX = e.clientX; startP = p;
            body.classList.add('grabbing');
            if (body.setPointerCapture) { try { body.setPointerCapture(e.pointerId); } catch (err) {} }
            ghSfx('click');
            e.preventDefault();
        }
        function onMove(e){
            if (!dragging) return;
            /* 轨道占袋宽的 82%（CSS 里 left/right 各 9%），拖过这一段 = 拉到底 */
            const w = body.clientWidth || 1;
            setP(startP + (e.clientX - startX) / (w * 0.82));
            if (p >= 1) finish();
        }
        function onUp(){
            if (!dragging) return;
            dragging = false;
            body.classList.remove('grabbing');
            if (p >= 0.78) finish();
            else { setP(0, true); if (!ghSkipped) ghSfx('close'); }
        }

        ghBagFinish = finish;
        paint();
        body.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        if (ghSkipped) finish();
    });
}

async function playGachaShow(results, bootPromise){
    const stage = ghEl('ghStage');
    if (!stage){ return; }
    const reveal = ghEl('ghReveal');
    await (bootPromise || sleep(0));
    if (ghSkipped) return;
    stage.classList.remove('boot');
    stage.classList.add('env');
    /* 阶段一点五：亲手拉开补给袋的拉链。跳过会在 ghSkipShow 里把它直接收尾。
       缝里透出的光色按「本次最高稀有度」染 —— 这就是原版那个看光预判出货的演出。 */
    const bestRarity = results.reduce((m, r) => Math.max(m, r.rarity || 3), 3);
    await ghRunBag(bestRarity, results.length);
    if (!ghSkipped){
        stage.classList.remove('env');
        stage.classList.add('reveal');
        ghSfx('whoosh');
    }

    const cards = [];
    let sixCued = false;
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
            /* 三档光效对齐原版：4★及以下紫 / 5★黄 / 6★彩虹 */
            if (rar === 4){
                stage.classList.add('flare-four');
                ghAfter(420, () => stage.classList.remove('flare-four'));
            } else if (rar === 5){
                stage.classList.add('flare-five');
                ghAfter(380, () => stage.classList.remove('flare-five'));
            } else if (rar >= 6){
                stage.classList.add('flare-six');
                ghAfter(760, () => stage.classList.remove('flare-six'));
            }
            /* 音效：6★ 给足排面 —— 翻牌前先爬三级音阶（对齐原版拉链越拉越高），
               翻牌瞬间打收尾重音；十连里只对第一个 6★ 爬音阶，后面的直接重音，避免听腻。 */
            if (rar >= 6){
                if (!sixCued){
                    sixCued = true;
                    ghSfx('six', 3);
                    ghAfter(190, () => ghSfx('six', 2));
                    ghAfter(380, () => ghSfx('six', 1));
                }
                ghSfx('out', 6);
                c.classList.add('hit-six'); ghSparkBurst();
            } else if (rar === 5){
                ghSfx('out', 5);
            } else if (rar === 4){
                ghSfx('out', 4);
            } else {
                ghSfx('zipTick', 0.4);
            }
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
    ghClearTimers();                 // 必须先清，再收尾 —— 否则收尾里新排的定时器会被这次清掉
    if (ghBagFinish) ghBagFinish();  // 还卡在拉链阶段就替用户拉到底，别把流程挂住
    const stage = ghEl('ghStage');
    if (!stage) return;
    stage.classList.remove('boot', 'env', 'flare-four', 'flare-five', 'flare-six');
    stage.classList.add('reveal');
    stage.querySelectorAll('.gh-card').forEach(c => { c.classList.add('shown', 'flipped'); });
    setTimeout(ghCloseShow, 620);
}

function ghCloseShow(){
    ghClearTimers();
    ghSfx('close');
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
let skinLimitedPool = [];    // R21：限定时装池（原版不能源石兑换，只从礼包随机奖励产出）
let skinLoadFailed = false;  // 上一次 /skins 是否加载失败（用于区分"空货架"和"服务没起来"）
let skinCurrent = null;      // R38：当前装备的时装条目（null = 未装备，展示默认制服）
/* R38：默认只展示「当前/默认皮肤」，全部皮肤列表收进「浏览全部」按钮里按需展开。
   为什么这么改：481 件皮肤一次性铺满界面，用户点进时装窗口就被淹没，
   想看"我现在穿的什么"反而要先滚过几百张卡。 */
/* R41 修复：默认改为 true —— 直接展示全部皮肤目录。
   旧默认（false）只渲染一张「当前皮肤」，未装备时更是退化成一张**凭空造出来的
   「博士 / 默认制服」占位卡**；用户据此报「时装全部丢失 + 多出一件空白博士时装」。
   目录本身一直是完好的（481 件），只是被默认折叠藏起来了。 */
let skinBrowse = true;       // true = 浏览全部（含筛选/分区）；false = 仅当前皮肤
let skinOwnedCount = 0;      // 已拥有时装件数（浏览按钮上显示）
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
    skinLimitedPool = data.limited_pool || [];
    skinCurrent = data.current || null;
    skinOwnedCount = data.owned_count || 0;
    if (DOM.skinShopBalance)
        DOM.skinShopBalance.innerHTML = `<span class="res-own-label">当前持有</span>${resAmountHTML('source_stone', data.source_stone)}`;
    renderSkins();
}
/* 单张时装的卡片。unlocked=false 表示这件皮肤的主人还没抽到 —— 只给预览不给下单。
   opts.equip=true 时，已拥有的时装按钮从「已拥有」标签换成「装备 / 卸下」——
   R38 的浏览模式要能"浏览并选择"，只挂个静态标签就选不了。 */
function buildSkinCard(s, stone, opts){
    const card = document.createElement('div');
    card.className = `skin-card${s.owned ? ' owned' : ''}${s.unlocked === false ? ' locked' : ''}${s.equipped ? ' equipped' : ''}`;
    const canBuy = !s.dynOnly && s.unlocked !== false && !s.limited;
    const canEquip = !!(opts && opts.equip) && s.owned && !s.dynOnly && !s.limited && s.unlocked !== false;
    let btn;
    if (canEquip) {
        btn = s.equipped
            ? '<button class="game-btn skin-unequip-btn" data-skin=""><span>卸下</span></button>'
            : `<button class="game-btn skin-equip-btn" data-skin="${escapeHtml(s.skin_id || '')}"><span>装备</span></button>`;
    } else {
        btn = s.dynOnly
            ? '<span class="skin-dyn-tag"><i class="fa-solid fa-circle-play"></i>点开预览</span>'
            : (s.owned
                ? '<span class="skin-owned-tag"><i class="fa-solid fa-check"></i>已拥有</span>'
                : (s.limited
                    ? '<span class="skin-limited-tag"><i class="fa-solid fa-gift"></i>礼包限定</span>'
                    : (canBuy
                        ? `<button class="game-btn skin-buy-btn" data-skin="${s.skin_id}"${stone < s.cost ? ' disabled' : ''}><span>购买</span></button>`
                        : '<span class="skin-locked-tag"><i class="fa-solid fa-lock"></i>待解锁</span>')));
    }
    const img = s.image ? `/static/${s.image}` : '';
    /* 21 源石及以上在原版属「动态立绘」档，但本地不一定真解到了那套 Spine 资源。
       所以分开标：手里有资源（预览里真会动）的给亮色徽章，仅档位到了的保留原样式 ——
       不把「按档位该动」说成「点了就能动」。 */
    /* R29：动态立绘（Spine）已整体停用（见 dyn-portrait.js 顶部 DYN_DISABLED）。
       DynPortrait.enabled === false 时不再打「动态」徽章、不再挂 is-dynamic，
       一律当静态立绘处理，避免"标着会动、点开却是静态"的落差。
       想恢复动态：把 dyn-portrait.js 的开关改回 false 即可。 */
    const dynEnabled = !(window.DynPortrait && DynPortrait.enabled === false);
    const dynLive = dynEnabled && (!!s.dynOnly || !!(window.DynPortrait && DynPortrait.has(s.skin_id)));
    const isDynamic = dynEnabled && (dynLive || (Number(s.cost) || 0) >= 21);
    card.innerHTML =
        `<div class="skin-art${isDynamic ? ' is-dynamic' : ''}${dynLive ? ' has-spine' : ''}"` +
            ` data-skin-id="${escapeHtml(s.skin_id || '')}"` +
            (isDynamic ? ' data-dynamic="1"' : '') +
            (dynLive ? ' data-spine="1"' : '') +
            (img ? ` style="background-image:url('${img}')"` : '') + '>' +
            (img ? '' : '<i class="fa-solid fa-shirt"></i>') +
            (img ? '<span class="skin-zoom"><i class="fa-solid fa-magnifying-glass-plus"></i></span>' : '') +
            `<span class="skin-rarity">${goldStars(s.rarity)}</span>` +
            (isDynamic ? `<span class="skin-dyn-badge${dynLive ? ' is-live' : ''}"><i class="fa-solid fa-wand-magic-sparkles"></i>${dynLive ? '动态立绘' : '动态'}</span>` : '') +
            (s.owned ? '<span class="skin-owned-badge"><i class="fa-solid fa-check"></i></span>' : '') +
            (s.unlocked === false ? '<span class="skin-lock-badge"><i class="fa-solid fa-lock"></i></span>' : '') +
        '</div>' +
        `<div class="skin-card-body">` +
            `<div class="skin-card-top"><span class="skin-op-name">${escapeHtml(s.operator_name)}</span>` +
            (s.series ? `<span class="skin-series">${escapeHtml(s.series)}</span>` : '') + '</div>' +
            `<div class="skin-name">${escapeHtml(s.skin_name)}</div>` +
            `<div class="skin-tier">${escapeHtml(s.tier_label)}</div>` +
            // 动态立绘专区的卡不在售，价格位会被渲染成「0 源石」——那是个假标价，
            // 换成一句说明，左边不至于空着、也不会误导成能买。
            `<div class="skin-card-bottom">${s.dynOnly
                ? '<span class="skin-dyn-only">仅展示 · 非在售</span>'
                : resAmountHTML('source_stone', s.cost, 'skin-price')}${btn}</div>` +
        '</div>';
    return card;
}
/* R38：默认视图 —— 只渲染"当前皮肤"这一张卡。
   没装备过就渲染「默认制服」占位卡（不拿别人的立绘冒充，诚实留白）。 */
function renderCurrentSkinView(list, stone){
    const head = document.createElement('div');
    head.className = 'skin-section-head';
    head.innerHTML = '<span class="skin-section-kicker">当前皮肤</span>' +
        '<span class="skin-section-note">穿在身上的那一件 · 想看别的点右上「浏览全部」</span>';
    list.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'skin-section-grid';
    if (skinLoadFailed){
        const empty = document.createElement('div');
        empty.className = 'skin-empty';
        empty.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> 时装数据没加载出来——后端服务可能没启动。'
          + '<br><span class="skin-empty-hint">先运行「一键启动.bat」，再重新打开这个窗口。</span>';
        grid.appendChild(empty);
    } else if (skinCurrent){
        // 直接用后端给的 current 条目，补上 equipped 让按钮变成「卸下」
        grid.appendChild(buildSkinCard(Object.assign({}, skinCurrent, { equipped: true }), stone, { equip: true }));
    } else {
        /* R41 修复：这里原本会造一张「博士 / 默认制服」的假卡（buildDefaultSkinCard）。
           那既不是真实数据、又会被当成"系统多生成了一件空白的博士时装"。
           未装备时改为一句**诚实的空态**，不再伪造任何皮肤条目。 */
        const empty = document.createElement('div');
        empty.className = 'skin-empty';
        empty.innerHTML = '<i class="fa-solid fa-shirt"></i> 你还没有装备任何时装。'
            + '<br><span class="skin-empty-hint">点右上「浏览全部」挑一件换上。</span>';
        grid.appendChild(empty);
    }
    list.appendChild(grid);

    const hint = document.createElement('div');
    hint.className = 'skin-empty-buy';
    hint.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>'
        + `已拥有 ${skinOwnedCount} 件时装`
        + (skinCurrent ? '' : '，还没装备任何一件')
        + '。点右上「浏览全部」可以翻看全部皮肤并换装。</span>';
    list.appendChild(hint);

    list.querySelectorAll('.skin-equip-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinEquip(b.dataset.skin));
    });
    list.querySelectorAll('.skin-unequip-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinEquip(''));
    });
}

/* R41：删除了 buildDefaultSkinCard()。
   它会在「未装备任何时装」时凭空造一张 operator_name='博士'、skin_name='默认制服'
   的空白卡 —— 用户把这个伪造条目报成"系统额外生成了一件空白的博士时装"。
   现在未装备时走 renderCurrentSkinView 里的诚实空态（一句提示，不伪造皮肤）。 */

function renderSkins(){
    const list = DOM.skinShopList; if (!list) return;
    bindSkinPreview();
    const stone = state.resources.source_stone?.current_value || 0;
    /* R38：把「浏览全部」按钮与筛选行的状态同步好。
       默认视图下筛选行没有意义（只有一张卡），藏起来免得用户以为没东西可筛。 */
    if (DOM.skinFilterRow) DOM.skinFilterRow.style.display = skinBrowse ? '' : 'none';
    if (DOM.skinBrowseToggleBtn) {
        DOM.skinBrowseToggleBtn.classList.toggle('active', skinBrowse);
        const _lbl = DOM.skinBrowseToggleBtn.querySelector('span');
        if (_lbl) _lbl.textContent = skinBrowse ? '收起列表' : '浏览全部';
        DOM.skinBrowseToggleBtn.title = skinBrowse ? '回到当前皮肤' : '浏览并选择全部时装';
    }
    list.innerHTML = '';

    /* ── 默认视图：只显示「当前皮肤」，没装备过就显示「默认制服」 ──
       481 件皮肤一次性铺满会把"我现在穿的什么"淹没掉（用户要求默认收起）。 */
    if (!skinBrowse){
        renderCurrentSkinView(list, stone);
        return;
    }
    const pass = s => {
        // 'dyn' 只放动态立绘专区的卡：其余三组不带 dynOnly，自然全被滤掉
        if (skinFilter === 'dyn') return !!s.dynOnly;
        if (skinFilter === 'owned') return !!s.owned;
        return skinFilter === 'all' || String(s.rarity) === skinFilter;
    };
    const items = skinCache.filter(pass);
    const shelf = skinShelf.filter(pass);
    /* R25 动态立绘专区。后端 /skins 只给「已持有干员的皮肤 + 本周货架 + 限定池」，
       本地解出来的这 66 件绝大多数不在这三个集合里 —— 不单开一个区，用户永远
       看不到它们会动。能不能买仍由原版货架决定，所以这批卡只作展示。
       ⚠️ 必须在这里（空态判断之前）算好：筛「动态立绘」时 items/shelf 都是空的，
       等到函数末尾再算，早被上面那句 return 拦掉了。 */
    /* ⚠️ 这里不能直接复用 pass：dynOnly 标记是下面 map 才补上的，
       先 filter 再 map 的话池子会被自己滤空（'dyn' 筛选项永远一片空白）。
       pool 本身就已经全是动态立绘，筛「动态立绘」时照单全收即可。 */
    const dynPool = (window.DynPortrait && DynPortrait.pool()) || [];
    const dynCards = (skinFilter === 'owned'
        ? []                                  // 「已拥有」里不该混进只能预览的卡
        : dynPool.filter(p => skinFilter === 'dyn'
            || skinFilter === 'all'
            || String(p.rarity) === skinFilter)
    ).map(p => ({
            skin_id: p.skin_id,
            skin_name: p.skin_name,
            operator_name: p.operator_name,
            series: p.series,
            rarity: p.rarity,
            image: p.image,
            cost: 0,
            tier_label: 'Spine 动态立绘',
            owned: false,
            unlocked: true,
            limited: false,
            dynOnly: true,
        }));
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
        arr.forEach(s => grid.appendChild(buildSkinCard(s, stone, { equip: true })));
        list.appendChild(grid);
    };

    // 没有可购买的时装时，明确告诉用户还差哪一步，但货架照样铺满（不至于白屏）
    if (!items.length && !shelf.length && !dynCards.length){
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
    // （筛「动态立绘」时是特意只看那批，不用弹这句）
    if (!items.length && shelf.length && skinFilter !== 'dyn'){
        const hint = document.createElement('div');
        hint.className = 'skin-empty-buy';
        hint.innerHTML = '<i class="fa-solid fa-circle-info"></i>' +
            '<span>还没有可购买的时装——先去「干员寻访」抽到干员，他的时装就能下单了。下面的货架可以先看个眼缘。</span>';
        list.appendChild(hint);
    }
    // R38：恢复「货架」展示，并改为**每日随机轮换**（后端 _day_key + _seeded_shuffle，
    //     每天 04:00 换一批）。货架只挑「未拥有的干员时装」，与下方「全部皮肤」少量重合
    //     属推荐位的固有形态。
    addSection('今日推荐 · 每日轮换',
               '每天 04:00 随机换一批 · 未持有干员的时装可先预览',
               shelf, false);
    const buyableCount = items.filter(s => s.unlocked !== false && !s.owned && !s.limited).length;
    addSection('全部皮肤',
               buyableCount ? `${buyableCount} 件可直接购买 · 其余为未持有干员预览` : '全部为预览（需先抽到对应干员）',
               items, false);
    /* R21：限定时装单独成区。原版里这批皮肤不能用源石直接兑换，
       所以这里没有购买按钮，只能靠带「限定时装」标记的礼包开出来。 */
    addSection('限定时装 · 只走礼包', '原版不可用源石兑换，仅从标注「限定时装」的礼包随机产出',
               skinLimitedPool.filter(pass), true);
    addSection('动态立绘 · Spine 实时演算',
               `${dynCards.length} 件已解包的骨骼动画，点开即播`,
               dynCards, false);

    list.querySelectorAll('.skin-buy-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinPurchase(b.dataset.skin));
    });
    // R38：浏览模式下已拥有的时装可以当场换装
    list.querySelectorAll('.skin-equip-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinEquip(b.dataset.skin));
    });
    list.querySelectorAll('.skin-unequip-btn').forEach(b => {
        b.addEventListener('click', () => handleSkinEquip(''));
    });
}
async function handleSkinEquip(skinId){
    const data = await apiPost('/skins/equip', { skin_id: skinId || '' });
    if (!data) return;
    showToast(skinId ? `已装备「${data.skin_name}」` : '已卸下时装，回到默认制服');
    await loadSkins();
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
/* 灯箱里同时挂着 <img>（静态，也是降级用图）和 <canvas>（Spine 动态立绘），
   两者共用 .skin-lightbox-img 这套几何与交互样式，同一时刻只有一个可见。
   缩放/拖动必须作用在「当前可见的那个」上，否则会去操作一个 display:none 的节点。 */
function skinImageEl(){
    if (!skinLightbox) return null;
    const all = skinLightbox.querySelectorAll('.skin-lightbox-img');
    for (const el of all) if (!el.classList.contains('hidden')) return el;
    return all[0] || null;
}
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
    /* 动态立绘的 canvas 是后插入的，这里用一个「把交互绑到某个媒体节点」的
       小函数，插入后由 bindSkinZoomTo() 再绑一次，避免两套重复逻辑。 */
    const bindOne = (im) => {
        if (!im || im.dataset.zoomBound) return;
        im.dataset.zoomBound = '1';

        // 双击：已放大则复位，否则以双击点为锚点放大
        im.addEventListener('dblclick', e => {
            e.preventDefault();
            if (skinZoom.scale > 1.001) skinResetZoom();
            else skinZoomAt(e.clientX, e.clientY, 2.2);
        });
        bindDrag(im);
    };
    const bindDrag = (im) => {
        // 鼠标拖动平移（仅在放大后生效，避免和「点图即关」冲突）
        im.addEventListener('mousedown', e => {
            if (skinZoom.scale <= 1.001) return;
            e.preventDefault();
            skinZoom.dragging = true; skinZoom.moved = false;
            skinZoom.startX = e.clientX; skinZoom.startY = e.clientY;
            skinZoom.startTx = skinZoom.tx; skinZoom.startTy = skinZoom.ty;
            im.classList.add('is-dragging');
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
    };
    box._bindZoomTo = bindOne;
    box.querySelectorAll('.skin-lightbox-img').forEach(bindOne);

    // 滚轮缩放（以指针所在点为锚点）
    box.addEventListener('wheel', e => {
        if (box.classList.contains('hidden')) return;
        e.preventDefault();
        skinZoomAt(e.clientX, e.clientY, Math.pow(1.0016, -e.deltaY));
    }, { passive: false });
    // 触控板/触屏的双指捏合，浏览器在部分平台会转成 ctrl+wheel 派发
    box.addEventListener('wheel', () => {}, { passive: true });


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
        box.querySelectorAll('.skin-lightbox-img').forEach(el => el.classList.remove('is-dragging'));
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
   取不到再退回 512 缩略图 —— 这样放大到接近满屏也不会糊。

   skinId 命中动态立绘资源（static/img/dyn/_index.json）时：先照常显示静态图，
   Spine 就绪后再切上去「活过来」。WebGL 不可用 / 没有该皮肤的资源 / 加载失败，
   都只是留在静态图上，不会比原来更差 —— 这也是双媒体节点并存的原因。 */
let skinPreviewToken = 0;
function openSkinPreview(imgUrl, opName, skinName, fallbackUrl, isDynamic, skinId){
    const box = ensureSkinLightbox();
    const token = ++skinPreviewToken;
    const stage = box.querySelector('.skin-lightbox-stage');
    /* isDynamic 是按源石档位推断出来的，只代表「这档该是动态皮」；
       真拿到 Spine 资源后会撤掉这个 CSS 呼吸位移，免得两层动效打架。 */
    if (stage) stage.classList.toggle('is-dynamic', !!isDynamic);

    /* 换皮肤时先停掉上一条动态立绘。这一步必须放在「有没有资源」判断之前 ——
       否则从一件有立绘的皮肤切到没有立绘的皮肤时，上一条会在后台继续空转。 */
    if (window.DynPortrait) DynPortrait.stop();
    const im = box.querySelector('.skin-lightbox-img:not(.skin-spine-canvas)');
    const prevCanvas = box.querySelector('.skin-spine-canvas');
    im.classList.remove('hidden');
    im.onerror = () => { if (fallbackUrl && im.src !== fallbackUrl) im.src = fallbackUrl; im.onerror = null; };
    im.src = imgUrl || fallbackUrl || '';
    if (prevCanvas) prevCanvas.classList.add('hidden');

    box.querySelector('.skin-lightbox-cap').textContent = `${opName} · ${skinName}`;
    skinResetZoom();          // 每次打开都从 1:1 开始，不继承上一张的缩放
    box.classList.remove('hidden');
    requestAnimationFrame(() => box.classList.add('show'));

    if (!skinId || !window.DynPortrait || !DynPortrait.has(skinId)) return;
    /* 加载期间用户可能已经换了张皮肤或直接关掉了，用 token 作废过期的那次。 */
    DynPortrait.play(stage, skinId).then(ok => {
        if (!ok || token !== skinPreviewToken) return;
        const cv = box.querySelector('.skin-spine-canvas');
        if (!cv) return;
        if (stage) stage.classList.remove('is-dynamic');
        if (box._bindZoomTo) box._bindZoomTo(cv);   // canvas 是后插入的，交互要补绑
        im.classList.add('hidden');
        cv.classList.remove('hidden');
        skinResetZoom();
    });
}
function closeSkinPreview(){
    if (!skinLightbox) return;
    skinPreviewToken++;                          // 作废尚未完成的动态立绘加载
    if (window.DynPortrait) DynPortrait.stop();  // 关掉就停 RAF，别在后台空转
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
        openSkinPreview(full, op, nm, thumb, art.dataset.dynamic === '1', sid);
    });
}
/* 本期精选 · 六星双 UP 卡（R21）
   整卡即立绘：星级与名字压在底部同一块底板上，卡面是一整块，不做左右分栏。 */
const OP_PROFESSION_CN = {
    PIONEER:'先锋', WARRIOR:'近卫', TANK:'重装', SNIPER:'狙击', CASTER:'术师',
    MEDIC:'医疗', SUPPORT:'辅助', SPECIAL:'特种',
};
function buildFeaturedDuoCard(o){
    const art = o.portrait ? `/static/${o.portrait}` : '';
    const tok = o.token_icon ? `/static/${o.token_icon}` : '';
    const prof = OP_PROFESSION_CN[o.profession] || o.profession || '';
    const el = document.createElement('div');
    el.className = 'op-duo-card';
    el.innerHTML =
        // 模糊底衬：把竖构图的立绘两侧填满，卡面才是一整块
        `<div class="op-duo-blur"${art ? ` style="background-image:url('${art}')"` : ''}></div>` +
        `<div class="op-duo-art is-dynamic"${art ? ` style="background-image:url('${art}')"` : ''}>` +
            (art ? '' : '<i class="fa-solid fa-user-astronaut"></i>') +
        '</div>' +
        '<div class="op-duo-scrim"></div>' +
        '<span class="op-duo-up">UP</span>' +
        '<div class="op-duo-plate">' +
            `<span class="op-duo-stars">${goldStars(o.rarity)}</span>` +
            `<span class="op-duo-name">${escapeHtml(o.name)}</span>` +
            // R21：只留「职业」一行，「信物自动入库」那截文案去掉（用户要求）
            (prof || tok
                ? '<span class="op-duo-sub">' +
                    (tok ? `<img class="op-duo-token" src="${tok}" alt="">` : '') +
                    `<span>${escapeHtml(prof)}</span>` +
                  '</span>'
                : '') +
        '</div>';
    return el;
}
/* 本期精选卡池：把每日轮换的干员立绘铺出来。
   抽卡记录为空时，这里是弹窗里唯一有画面的地方 —— 所以不能省。 */
function renderOperatorFeatured(featured){
    const box = DOM.operatorFeatured;
    if (!box) return;
    box.innerHTML = '';
    if (!featured) return;
    const six = featured.six || [];
    const five = featured.five || [];
    const four = featured.four || [];
    if (!six.length && !five.length && !four.length) return;

    const head = document.createElement('div');
    head.className = 'op-featured-head';
    head.innerHTML = '<span class="op-featured-kicker">本 期 精 选</span>' +
        `<span class="op-featured-date">${escapeHtml(featured.date || '')} · 每周轮换</span>`;
    box.appendChild(head);

    /* R21：六星改成「双 UP」两张并列。
       旧版是「左文字右立绘」的左右分栏 —— 名字和头像各占一半，中间一刀切开，
       信息被割裂；这里改成整张卡就是立绘，星级 + 名字压在立绘底部同一块底板上，
       卡面是一个整体，不再是拼贴。 */
    if (six.length){
        const duo = document.createElement('div');
        duo.className = 'op-hero-duo';
        six.slice(0, 2).forEach(o => duo.appendChild(buildFeaturedDuoCard(o)));
        box.appendChild(duo);
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

/* ===== 弹窗开合（R32：带进出场动画） =====
   旧行为：openModal 直接加 .show、closeAllModals 直接把 .show 摘掉 →
   靠 display:none 瞬间消失，观感是「啪」地出现又「啪」地不见。
   现在：进场走 akModalIn（弹性放大 + 上浮归位），退场走 .closing + akModalOut
   （缩小淡出），等退场动画跑完（或 320ms 兜底）才真正 hidden。
   退场期间若又打开新弹窗，openModal 会先把正在退场的收干净，避免两层同时可见。 */
function __finalizeModal(m){
    m.classList.remove('show', 'closing');
    m.classList.add('hidden');
    m.style.transform = '';
    m.style.opacity = '';
    m.style.transition = '';
}
function __animateModalOut(m){
    if (!m || m.classList.contains('hidden')) { if (m) __finalizeModal(m); return; }
    m.classList.add('closing');
    let settled = false;
    const done = () => {
        if (settled) return; settled = true;
        m.removeEventListener('animationend', done);
        __finalizeModal(m);
    };
    m.addEventListener('animationend', done);
    setTimeout(done, 320);          // 兜底：动画被系统关闭 / 未触发也要收干净
}
function openModal(id){
    /* 先把还在退场的弹窗立刻收起，否则会出现「旧窗渐隐 + 新窗渐显」两层叠加 */
    document.querySelectorAll('.modal-container.closing').forEach(__finalizeModal);
    const modal = document.getElementById(id);
    if(modal){
        modal.classList.remove('hidden', 'closing');
        void modal.offsetWidth;      // 强制回流，保证同一弹窗连续打开时进场动画能重放
        modal.classList.add('show');
    }
    DOM.modalOverlay.classList.add('show');
}
function closeAllModals(){
    if (rewardModalTimer) { clearTimeout(rewardModalTimer); rewardModalTimer = null; }
    rewardModalOpenTaskId = null;
    const shown = [...document.querySelectorAll('.modal-container')]
        .filter(m => m.classList.contains('show') && !m.classList.contains('hidden'));
    if (shown.length) shown.forEach(__animateModalOut);
    else document.querySelectorAll('.modal-container').forEach(__finalizeModal);  // 收掉残留
    DOM.modalOverlay.classList.remove('show');
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
    //    正在退场（.closing）的不算「可见」，否则连按 ESC 会重复命中同一个窗
    const opens = [...document.querySelectorAll('.modal-container')]
        .filter(m => m.classList.contains('show') && !m.classList.contains('hidden') && !m.classList.contains('closing'));
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
    if (!m) return;
    /* 先看「除它自己以外」还有没有别的弹窗开着 —— 决定遮罩留不留。
       注意要在加 .closing 之前判断：退了场的弹窗仍然挂着 .show。 */
    const stillOpen = [...document.querySelectorAll('.modal-container')]
        .some(x => x !== m && x.classList.contains('show') && !x.classList.contains('hidden'));
    __animateModalOut(m);
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
        // 另外 apiGet 已按信封取 data（存在 data 键才取、null 就是 null），拿到的就是 {currencies, materials}，不用再取 .data。
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
        const sanityMax = state.resourceMeta?.sanity_cap ?? (state.resources.sanity?.max_value || 0);
        const capGain = state.resourceMeta?.sanity_cap_gain ?? 0;
        DOM.levelUpText.textContent = sanityMax
            ? `理智回满　${Math.round(sanity)} / ${Math.round(sanityMax)}` + (capGain > 0 ? `　上限 +${capGain}` : '')
            : `理智回满　${Math.round(sanity)}`;
        spawnLevelUpSparks();
        DOM.levelUpOverlay.classList.remove('show');   // 重置动画
        void DOM.levelUpOverlay.offsetWidth;           // 强制重排，保证重复升级也能重播
        DOM.levelUpOverlay.classList.add('show');
        setTimeout(()=>DOM.levelUpOverlay.classList.remove('show'),3000); loadResources(); }
    else if(state.lastLevel===0) state.lastLevel=currentLevel; }
function checkNewUnlocks(){ let storedIds=[]; try{ const raw=JSON.parse(localStorage.getItem('unlockedAchievementIds')||'[]'); if(Array.isArray(raw)) storedIds=raw; }catch(e){ storedIds=[]; }
    const newUnlocks=state.unlockedAchievements.filter(u=>!storedIds.includes(achIdOf(u)));
    newUnlocks.forEach((u,index)=>{ setTimeout(()=>{ const ach=state.achievements.find(a=>a.id===achIdOf(u));
        if(ach){ DOM.badgeNotifName.textContent=ach.name; DOM.badgeNotification.classList.add('show'); setTimeout(()=>DOM.badgeNotification.classList.remove('show'),3000); } },index*3000); });
    if(newUnlocks.length){ const updatedIds=[...storedIds,...newUnlocks.map(achIdOf).filter(Boolean)]; localStorage.setItem('unlockedAchievementIds',JSON.stringify(updatedIds)); } }
function formatDate(dateStr){ if(!dateStr) return '无'; let d=new Date(dateStr); if(isNaN(d.getTime())) d=new Date(dateStr.replace(' ','T')+'Z'); return isNaN(d.getTime())?dateStr:d.toLocaleString(); }
function escapeHtml(str){ if(!str) return ''; const div=document.createElement('div'); div.textContent=str; return div.innerHTML; }