/* ===============================================================
 * Quest-log 音效系统（QLSfx）
 * ---------------------------------------------------------------
 * 全部声音用 Web Audio API 现场合成，不依赖任何 mp3 / wav 素材。
 *
 * 只有两个发声原语：
 *   tone()       —— 一个会滑音的音调（方波/正弦/三角/锯齿）
 *   noiseBurst() —— 一团带低通滤波的白噪声爆破（做风声、落地、沙沙）
 * 其余所有音效都是这两个原语的组合。
 *
 * 参考了 DragonSealAres/Arknights_lootbox_simulator 的音效设计思路，
 * 但那个项目的 click/pack/zipTick/six/out 都是放解包出来的 MP3，
 * 本项目没有（也不引入）那些素材，所以改成全部合成。
 *
 * 对外接口：
 *   QLSfx.click()          按钮"嗒"
 *   QLSfx.refuse()         取消/关闭"咔"
 *   QLSfx.agree()          同意"咔"
 *   QLSfx.pack()           包裹落地"咚"
 *   QLSfx.zipTick(pos)     拉链每过一齿的"沙"（pos 0~1，越小音越亮）
 *   QLSfx.six(key)         六星专属：1/2/3 爬音阶，'out' 收尾重音
 *   QLSfx.out(rarity)      开包收尾重音，按最高星级区分
 *   QLSfx.close()          收幕"唰"
 *   QLSfx.whoosh()         转场风声
 *   QLSfx.coin()           合成玉到账"叮铃"
 *   QLSfx.error()          操作失败"哔唔"
 *   QLSfx.levelUp()        升级上行琶音
 *   QLSfx.achieve()        蚀刻章解锁清脆双音
 *   QLSfx.setEnabled(bool) / QLSfx.isEnabled() / QLSfx.setVolume(0~1)
 * =============================================================== */
const QLSfx = (() => {
    const STORE_KEY = 'ql_sfx_enabled';
    const VOL_KEY = 'ql_sfx_volume';

    let ctx = null;
    let master = null;
    let enabled = true;
    let volume = 0.45;

    try {
        const s = localStorage.getItem(STORE_KEY);
        if (s !== null) enabled = s === '1';
        const v = localStorage.getItem(VOL_KEY);
        if (v !== null) volume = Math.max(0, Math.min(1, parseFloat(v) || 0));
    } catch (e) { /* localStorage 不可用时用默认值 */ }

    /* 电源总开关：懒加载，第一次发声时才创建 AudioContext。
       浏览器不允许在用户交互前发声，所以这里必须懒加载。 */
    function ensure() {
        if (!enabled) return null;
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try {
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = volume;
                master.connect(ctx.destination);
            } catch (e) { return null; }
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // 用户第一次交互时提前通电，避免第一次发声有延迟
    function prewarm() { ensure(); }
    document.addEventListener('pointerdown', prewarm, { once: true });
    document.addEventListener('keydown', prewarm, { once: true });

    /* 原语 1：一个会滑音的音调。
       包络 = 立刻最大声 → 指数衰减到无（像敲钟）。 */
    function tone({ freq = 440, end = null, dur = 0.15, vol = 0.2, type = 'sine', delay = 0 }) {
        const c = ensure(); if (!c) return;
        const t0 = c.currentTime + delay;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    /* 原语 2：一团白噪声爆破。
       filterFreq 越小越闷（落地/爆炸），越大越亮（沙沙/风声）。 */
    function noiseBurst({ dur = 0.3, vol = 0.3, filterFreq = 1000, delay = 0, sweepTo = null }) {
        const c = ensure(); if (!c) return;
        const t0 = c.currentTime + delay;
        const len = Math.ceil(c.sampleRate * dur);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(filterFreq, t0);
        if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t0 + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f).connect(g).connect(master);
        src.start(t0);
    }

    return {
        isEnabled() { return enabled; },

        setEnabled(on) {
            enabled = !!on;
            try { localStorage.setItem(STORE_KEY, enabled ? '1' : '0'); } catch (e) { /* 忽略 */ }
            if (master) master.gain.value = volume;
        },

        setVolume(v) {
            volume = Math.max(0, Math.min(1, v));
            try { localStorage.setItem(VOL_KEY, String(volume)); } catch (e) { /* 忽略 */ }
            if (master) master.gain.value = volume;
        },

        // 按钮按下："嗒"——短促、带一点下滑，干净不刺耳
        click() {
            tone({ freq: 900, end: 640, dur: 0.055, vol: 0.10, type: 'triangle' });
        },

        // 取消 / 关闭："咔"——低沉下滑方波
        refuse() {
            tone({ freq: 240, end: 165, dur: 0.16, vol: 0.11, type: 'square' });
        },

        // 同意："咔"——上滑正弦，比 refuse 明亮
        agree() {
            tone({ freq: 523, end: 784, dur: 0.14, vol: 0.12, type: 'sine' });
        },

        // 包裹落地："咚"——低频噪声 + 底下垫一层低频起伏
        pack() {
            noiseBurst({ dur: 0.26, vol: 0.24, filterFreq: 320 });
            tone({ freq: 78, end: 42, dur: 0.34, vol: 0.14, type: 'sine' });
        },

        /* 拉链齿"沙"：pos 是拉链位置（1=没拉，0=拉到底）。
           越往下拉声音越亮，模拟越拉越"开"的质感。 */
        zipTick(pos) {
            const p = Math.max(0, Math.min(1, typeof pos === 'number' ? pos : 0.5));
            noiseBurst({ dur: 0.055, vol: 0.13, filterFreq: 1800 + (1 - p) * 2600 });
        },

        /* 六星专属：
           key=1/2/3 是拉链越拉越高的三声（爬音阶 G5 → B5 → E6）
           key='out' 是完全拉开时的收尾重音（四音和弦 + 一层亮噪声） */
        six(key) {
            if (key === 'out') {
                [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                    tone({ freq: f, dur: 0.9 - i * 0.08, vol: 0.13, type: 'sine', delay: i * 0.045 });
                });
                noiseBurst({ dur: 0.5, vol: 0.10, filterFreq: 4200, sweepTo: 900 });
                return;
            }
            const scale = { 1: 783.99, 2: 987.77, 3: 1318.5 };
            const f = scale[key] || 783.99;
            tone({ freq: f, dur: 0.3, vol: 0.12, type: 'sine' });
            tone({ freq: f * 2, dur: 0.22, vol: 0.05, type: 'sine', delay: 0.02 });
        },

        /* 开包收尾重音，按本次最高星级区分：
           6★ 四音和弦 / 5★ 三音 / 4★ 与 3★ 双音 */
        out(rarity) {
            if (rarity >= 6) {
                this.six('out');
            } else if (rarity === 5) {
                [587.33, 739.99, 880].forEach((f, i) => {
                    tone({ freq: f, dur: 0.55, vol: 0.11, type: 'sine', delay: i * 0.05 });
                });
            } else {
                [523.25, 659.25].forEach((f, i) => {
                    tone({ freq: f, dur: 0.38, vol: 0.09, type: 'sine', delay: i * 0.06 });
                });
            }
        },

        // 收幕："唰"——轻轻一团小风声
        close() {
            noiseBurst({ dur: 0.16, vol: 0.09, filterFreq: 1500 });
        },

        // 转场风声："唰——"
        whoosh() {
            noiseBurst({ dur: 0.6, vol: 0.13, filterFreq: 600, sweepTo: 2200 });
            tone({ freq: 90, end: 240, dur: 0.5, vol: 0.07, type: 'sine' });
        },

        // 合成玉到账："叮铃"——两个高音先后响
        coin() {
            tone({ freq: 1568, dur: 0.12, vol: 0.14, type: 'sine' });
            tone({ freq: 2093, dur: 0.25, vol: 0.14, type: 'sine', delay: 0.08 });
        },

        // 操作失败："哔唔——"低沉下滑方波
        error() {
            tone({ freq: 220, end: 160, dur: 0.25, vol: 0.15, type: 'square' });
        },

        // 升级：上行琶音
        levelUp() {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                tone({ freq: f, dur: 0.32, vol: 0.11, type: 'triangle', delay: i * 0.09 });
            });
        },

        // 蚀刻章解锁：清脆双音
        achieve() {
            tone({ freq: 1046.5, dur: 0.18, vol: 0.11, type: 'sine' });
            tone({ freq: 1568, dur: 0.3, vol: 0.11, type: 'sine', delay: 0.1 });
        }
    };
})();
