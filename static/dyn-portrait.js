/* ============================================================================
 * Quest-log · 动态立绘播放器（Spine 3.8 runtime）
 *
 * 素材来自游戏本体的 arts/dynchars 动态立绘包，经 Ark-Unpacker 解出 .skel /
 * .atlas / 贴图三件套后由 build_dyn_assets.py 转成 webp 落在 static/img/dyn/。
 * 索引 static/img/dyn/_index.json 以 skinId 为键，前端按需取用。
 *
 * 设计约束（都是踩过的坑）：
 *   1) spine-webgl.js 有 400KB+，绝不放 index.html —— 只有真的要看动态立绘时
 *      才动态注入 <script>，不拖首页。
 *   2) 浏览器对同时存在的 WebGL context 有数量上限（约 16 个），所以全站只养
 *      一个 canvas + 一个 context，切换皮肤时复用，不新建。
 *   3) 1024² RGBA 贴图在 GPU 上约 4MB/张，67 套全驻留要 260MB+。这里做小容量
 *      LRU，超出的手动 dispose 掉 GLTexture，否则切换几十次就会 OOM。
 *   4) 灯箱关掉必须停 RAF，不然后台一直画，笔记本风扇会说话。
 *
 * 许可：Spine Runtimes © Esoteric Software LLC，见 static/vendor/spine/LICENSE。
 *       依其条款，任何使用本功能的人需自行持有 Spine Editor 许可。
 * ==========================================================================*/
window.DynPortrait = (function () {
    'use strict';

    /* ========================================================================
       R29 · 动态立绘（Spine）整体停用开关
       ------------------------------------------------------------------------
       用户反馈：动态立绘渲染出现「断肢 / 脸部异常线条」等骨骼错位（Spine 资源 /
       运行时层面的问题，短期内无法稳定修复）。按用户要求「移除动态资源、改用
       静态立绘」——这里统一短路成一个零操作 API：预览灯箱、卡片徽章、动态专区
       全部自动退回静态图，并且不再注入 400KB+ 的 spine-webgl runtime。
       想恢复动态立绘：把 DYN_DISABLED 改回 false 即可，下面代码原样保留。
       ====================================================================== */
    var DYN_DISABLED = true;
    if (DYN_DISABLED) {
        return {
            enabled: false,                       /* 前端据此关掉「动态」徽章等 */
            init: function () { return Promise.resolve({}); },
            has: function () { return false; },   /* 任何皮肤都不再有动态资源 */
            get: function () { return null; },
            pool: function () { return []; },     /* 动态专区随之不再出现 */
            play: function () { return Promise.resolve(false); },
            stop: function () {},
            refresh: function () {},
            debug: function () { return null; },
            get playing() { return false; },
        };
    }

    /* 用绝对路径：app.js 里的图片也是 `/static/...` 起头。
       写成相对的 `static/...` 时，一旦页面本身落在 /static/ 下（无头探针就是这样），
       会解析成 /static/static/... 而静默 404。 */
    var RUNTIME_SRC = '/static/vendor/spine/spine-webgl.js';
    var INDEX_SRC = '/static/img/dyn/_index.json';
    /* 展示清单：66 件动态立绘的卡片字段（干员名/皮肤名/系列/稀有度/缩略图），
       由 build_dyn_assets.py 在构建期拼好 —— 前端不必再拉皮肤索引自己拼。 */
    var POOL_SRC = '/static/img/dyn/_pool.json';
    /* 方舟动态立绘的待机动画基本都叫 Idle，少数立绘用别的名字，按顺序试 */
    var ANIM_CANDIDATES = ['Idle', 'idle', 'Default', 'default', 'Start', 'start'];
    var MAX_CACHE = 3;

    var idx = null, poolData = null, idxReq = null, rtReq = null;
    var ctx = null, scene = null, canvas = null, gl = null;
    var cur = null;                 /* {skeleton,state,pma,entry,bounds} */
    var cache = [];                 /* [{key,am,atlas,data,t}] */
    var rafId = 0, lastT = 0, dpr = 1;
    var B_OFF = null, B_SIZE = null, B_TMP = [];

    function noop() {}

    /* ---------- 索引 ---------- */
    function pull(url, fallback) {
        return fetch(url, { cache: 'force-cache' })
            .then(function (r) { return r.ok ? r.json() : fallback; })
            .catch(function () { return fallback; });
    }

    function init() {
        if (idxReq) return idxReq;
        idxReq = Promise.all([pull(INDEX_SRC, {}), pull(POOL_SRC, [])])
            .then(function (res) {
                idx = res[0] || {};
                poolData = res[1] || [];
                return idx;
            });
        return idxReq;
    }

    function has(skinId) { return !!(idx && skinId && idx[skinId]); }

    function get(skinId) { return (idx && idx[skinId]) || null; }

    /* 展示清单（排序好的数组）；索引没就绪时给空数组，调用方不必判空。 */
    function pool() { return poolData || []; }

    /* ---------- runtime 懒加载 ---------- */
    function ensureRuntime() {
        if (rtReq) return rtReq;
        rtReq = new Promise(function (resolve, reject) {
            if (window.spine && window.spine.webgl) { resolve(); return; }
            var s = document.createElement('script');
            s.src = RUNTIME_SRC;
            s.async = true;
            s.onload = function () {
                window.spine && window.spine.webgl
                    ? resolve()
                    : reject(new Error('spine runtime 加载后未挂到 window.spine'));
            };
            s.onerror = function () { rtReq = null; reject(new Error('spine runtime 加载失败')); };
            document.head.appendChild(s);
        });
        return rtReq;
    }

    /* ---------- 贴图缓存 ---------- */
    function freeRec(rec) {
        try {
            if (rec.atlas && rec.atlas.pages) {
                rec.atlas.pages.forEach(function (p) {
                    var t = p.rendererObject;
                    if (t && typeof t.dispose === 'function') t.dispose();
                });
            }
            if (rec.am && typeof rec.am.dispose === 'function') rec.am.dispose();
        } catch (e) { /* 释放失败不该打断播放 */ }
    }

    function takeFromCache(key) {
        for (var i = 0; i < cache.length; i++) {
            if (cache[i].key === key) {
                var rec = cache.splice(i, 1)[0];
                rec.t = Date.now();
                cache.push(rec);
                return rec;
            }
        }
        return null;
    }

    function putCache(rec) {
        rec.t = Date.now();
        cache.push(rec);
        while (cache.length > MAX_CACHE) freeRec(cache.shift());
    }

    function loadDyn(entry) {
        var key = entry.prefix;
        var hit = takeFromCache(key);
        if (hit) return Promise.resolve(hit);

        var prefix = '/static/' + entry.dir;
        var am = new spine.webgl.AssetManager(ctx, prefix);
        var atlasPath = entry.prefix + '.atlas';
        var skelPath = entry.prefix + '.skel';
        am.loadTextureAtlas(atlasPath);
        am.loadBinary(skelPath);

        return new Promise(function (resolve, reject) {
            (function poll() {
                if (am.hasErrors()) { reject(new Error('贴图/骨架加载出错')); return; }
                if (!am.isLoadingComplete()) { setTimeout(poll, 40); return; }
                try {
                    var atlas = am.get(atlasPath);
                    var loader = new spine.AtlasAttachmentLoader(atlas);
                    var bin = new spine.SkeletonBinary(loader);
                    bin.scale = 1;
                    var data = bin.readSkeletonData(am.get(skelPath));
                    var rec = { key: key, am: am, atlas: atlas, data: data, t: Date.now() };
                    putCache(rec);
                    resolve(rec);
                } catch (e) { reject(e); }
            })();
        });
    }

    /* ---------- 画布 ---------- */
    function ensureCanvas(host) {
        if (canvas && canvas.parentNode === host) return canvas;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'skin-lightbox-img skin-spine-canvas';
            canvas.setAttribute('role', 'img');
        }
        if (canvas.parentNode !== host) host.appendChild(canvas);
        if (!ctx) {
            ctx = new spine.webgl.ManagedWebGLRenderingContext(
                canvas, { alpha: true, premultipliedAlpha: false });
            gl = ctx.gl;
            scene = new spine.webgl.SceneRenderer(canvas, ctx);
        }
        return canvas;
    }

    function sizeCanvas(box) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(1, Math.round(box.clientWidth * dpr));
        var h = Math.max(1, Math.round(box.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
        }
    }

    /* ---------- 播放 ---------- */
    function pickAnim(data) {
        var names = data.animations.map(function (a) { return a.name; });
        for (var i = 0; i < ANIM_CANDIDATES.length; i++) {
            if (names.indexOf(ANIM_CANDIDATES[i]) >= 0) return ANIM_CANDIDATES[i];
        }
        return names[0] || null;
    }

    /* ---------- 装裱（这一块是「抠出来不对劲」的根因，别乱改） ----------
     * SceneRenderer 构造函数里 `camera = new OrthoCamera(canvas.width, canvas.height)`，
     * 而此刻 canvas 还是浏览器的默认 300×150（还没 sizeCanvas）。之后 resize(Fit) 是拿
     * 那个 300×150 当基准去缩放的，于是相机的世界视野被死死钉在 300×300 左右 ——
     * 无论灯箱多大，都只看得到骨架中心一小块，四周的部件落在视野外，
     * 看起来就像"被乱抠了一块"。
     * 正确做法：不要用 Fit，自己按骨架实际包围盒设 viewport / zoom / position。
     * 包围盒在装载时对 Idle 动画采样一圈取并集，避免逐帧重算导致画面呼吸抖动。 */
    function computeFit(rec, skeleton, state) {
        if (!B_OFF) { B_OFF = new spine.Vector2(); B_SIZE = new spine.Vector2(); }
        var entry = state.getCurrent(0);
        var anim = entry && entry.animation;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (anim && typeof anim.apply === 'function') {
            var N = 8, dur = anim.duration || 0;
            for (var i = 0; i <= N; i++) {
                var t = dur > 0 ? dur * i / N : 0;
                anim.apply(skeleton, t, t, false, null, 1, true, false);
                skeleton.updateWorldTransform();
                skeleton.getBounds(B_OFF, B_SIZE, B_TMP);
                if (B_SIZE.x > 0 && B_SIZE.y > 0) {
                    if (B_OFF.x < minX) minX = B_OFF.x;
                    if (B_OFF.y < minY) minY = B_OFF.y;
                    if (B_OFF.x + B_SIZE.x > maxX) maxX = B_OFF.x + B_SIZE.x;
                    if (B_OFF.y + B_SIZE.y > maxY) maxY = B_OFF.y + B_SIZE.y;
                }
            }
            /* 采样完把姿态交回 AnimationState，别把骨架停在采样点上 */
            state.apply(skeleton);
            skeleton.updateWorldTransform();
        }
        if (!isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) {
            return { x: -300, y: -300, w: 600, h: 600 };
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function fitCamera() {
        if (!scene || !canvas) return;
        var c = cur && cur.bounds;
        if (!c) return;
        var cam = scene.camera;
        var cw = canvas.width, ch = canvas.height;
        if (cw <= 0 || ch <= 0) return;
        /* ortho 投影的可见世界宽度 = zoom * viewportWidth，
           所以 viewport 直接取设备像素、zoom 取「每像素多少世界单位」。 */
        cam.viewportWidth = cw;
        cam.viewportHeight = ch;
        var pad = 1.06;                              /* 四周留一点余量，别贴边 */
        var zx = c.w * pad / cw, zy = c.h * pad / ch;
        cam.zoom = zx > zy ? zx : zy;                /* 取较大者，两个方向都装得下 */
        cam.position.set(c.x + c.w / 2, c.y + c.h / 2, 0);
    }

    function loop() {
        if (!cur) return;
        rafId = requestAnimationFrame(loop);
        var now = performance.now() / 1000;
        var dt = now - lastT;
        lastT = now;
        if (dt > 0.1) dt = 0.1;             /* 切走标签页回来别一次跳一大段 */

        cur.state.update(dt);
        cur.state.apply(cur.skeleton);
        cur.skeleton.updateWorldTransform();

        sizeCanvas(canvas);                 /* 先对齐分辨率，再让相机按新尺寸装裱 */
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        /* 借 SceneRenderer 同步一次（它会 gl.viewport 并把 canvas 尺寸拉回 CSS 尺寸），
           之后我们按 dpr 覆写分辨率、自己设相机 —— 不用它的 Fit，
           否则视野会被它的初始 300×150 基准钉死（见 fitCamera 上方注释）。 */
        scene.resize(spine.webgl.ResizeMode.Stretch);
        sizeCanvas(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);
        fitCamera();
        scene.begin();
        scene.drawSkeleton(cur.skeleton, cur.pma);
        scene.end();
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        cur = null;
    }

    /* 让某个 canvas 播放指定皮肤的动态立绘。
       返回 Promise：resolve(true) 表示已经在播，resolve(false) 表示这套皮肤没有
       动态立绘资源（调用方应当退回静态图）。 */
    function play(host, skinId) {
        stop();
        var entry = get(skinId);
        if (!entry) return Promise.resolve(false);
        return init()
            .then(function () { return ensureRuntime(); })
            .then(function () {
                var box = ensureCanvas(host);
                sizeCanvas(box);
                return loadDyn(entry).then(function (rec) {
                    var skeleton = new spine.Skeleton(rec.data);
                    var sd = new spine.AnimationStateData(rec.data);
                    sd.defaultMix = 0;
                    var state = new spine.AnimationState(sd);
                    var anim = pickAnim(rec.data);
                    if (anim) state.setAnimation(0, anim, true);
                    var pma = false;
                    try { pma = !!rec.atlas.pma; } catch (e) { }
                    cur = { skeleton: skeleton, state: state, pma: pma, entry: entry, bounds: null };
                    /* 装裱用的包围盒必须在进渲染循环之前算好，否则第一帧是错的装裱 */
                    try { cur.bounds = computeFit(rec, skeleton, state); } catch (e) { /* 兜底走默认框 */ }
                    lastT = performance.now() / 1000;
                    if (!rafId) loop();
                    return true;
                });
            })
            .catch(function (e) {
                console.warn('[DynPortrait]', e && e.message);
                stop();
                return false;
            });
    }

    /* 灯箱尺寸变了（旋屏 / 窗口缩放）时重算内部分辨率 */
    function refresh() {
        if (cur && canvas) sizeCanvas(canvas);
    }

    /* 只读诊断快照：排障和自动化验证用，不改变播放状态。
       poseHash 汇总全部骨骼的旋转，比只看根骨骼更能反映「画面是否在变」。 */
    function debug() {
        if (!cur) return null;
        var entry = cur.state.getCurrent(0);
        var bones = cur.skeleton.bones, sum = 0;
        for (var i = 0; i < bones.length; i++) sum += bones[i].rotation * (i + 1);
        return {
            anim: entry ? entry.animation.name : '',
            trackTime: entry ? entry.trackTime : -1,
            bones: bones.length,
            poseHash: Math.round(sum * 10000) / 10000,
            bounds: cur.bounds
                ? (Math.round(cur.bounds.x) + ',' + Math.round(cur.bounds.y) + ' ' +
                   Math.round(cur.bounds.w) + 'x' + Math.round(cur.bounds.h))
                : '',
            zoom: scene && scene.camera ? Math.round(scene.camera.zoom * 10000) / 10000 : -1,
        };
    }

    return {
        init: init,
        has: has,
        get: get,
        pool: pool,
        play: play,
        stop: stop,
        refresh: refresh,
        debug: debug,
        get playing() { return !!cur; },
    };
})();
