/* ================================================================
 * Quest-log 节日 / 节气 / 农历 日历引擎（window.QuestFestivals）
 * ----------------------------------------------------------------
 * 【文件职责】
 *   纯计算、零依赖、完全离线。不联网、不读外部数据文件、不依赖 npm，
 *   所有节日日期都由算法现场推导（尤其是农历与二十四节气）。
 *   供 renderCalendar() 之类的日历渲染代码查询"某天有哪些节日/是否放假"。
 *
 * 【公开 API】（全部挂在 window.QuestFestivals 上，不污染其它全局）
 *   forDate(date)            -> Array<Entry>
 *       该日命中的全部节日，按 level 升序（1 = 最重要）排列。
 *       Entry = { name, kind, level, statutory, badge }
 *         name      节日名，如 '春节' / '清明' / '国庆节假期'
 *         kind      'solar'(公历固定) | 'lunar'(农历) | 'term'(二十四节气)
 *                   | 'intl'(国际/外来节日) | 'statutory'(法定假日标记)
 *         level     1 重大 / 2 一般 / 3 冷门补充
 *         statutory 该日是否属于法定节假日（纯规则推导 + 覆盖表）
 *         badge     法定节假日为 '休'；覆盖表标了调休上班为 '班'；其余为 ''
 *   forMonth(year, monthIndex0) -> { [dayOfMonth: number]: Array<Entry> }
 *       一次算好整月。monthIndex0 是 0-based 的月份（0 = 一月）。
 *       只有有节日的日子才出现在结果里（稀疏表）。
 *   isStatutory(date)        -> boolean   该日是否法定节假日
 *   lunarOf(date)            -> { year, month, day, isLeap, label } | null
 *       农历日期。year 是"农历年"（可能小于公历年，如 2024-02-09 属农历 2023 年）。
 *       label 形如 '正月初一' / '闰四月初一' / '腊月廿三'。
 *       超出 1900-2100 支持范围时返回 null（渲染代码请判空）。
 *   _selftest()              -> { pass, fail, details }
 *       内置断言自检，改完本文件后调用一次即可确认算法没被改坏。
 *   QUEST_HOLIDAY_PLAN_OVERRIDE
 *       见下。
 *
 * 【如何精确维护调休（重要）】
 *   国务院每年公布的"哪天放假、哪天调休上班"是政策性数据，无法纯计算，
 *   所以本文件刻意不猜，只按固定规则推导（元旦 1 天、春节初一~初三 3 天、
 *   清明节气 1 天、劳动节 1 天、端午 1 天、中秋 1 天、国庆 10/1~10/3 3 天）。
 *   要精确到真实的连休/调休，只需往覆盖表里加条目，两种改法都行：
 *     1) 直接改本文件里 QUEST_HOLIDAY_PLAN_OVERRIDE 的字面量；
 *     2) 运行时改： QuestFestivals.QUEST_HOLIDAY_PLAN_OVERRIDE['2026'] = {...}
 *   （下面用 defineProperty 把 API 上的属性和内部变量绑定成同一个对象，
 *     两种改法等价，不会出现"改了没生效"。）
 *   表格式： { '2026': { '2026-02-16': '休', '2026-02-24': '班' } }
 *     '休' -> isStatutory 为 true，badge 为 '休'
 *     '班' -> isStatutory 为 false，badge 为 '班'（调休上班，日历可标灰）
 *   覆盖表优先级最高；表为空时 100% 走规则推导。
 *   例：2025 年起国务院把除夕并入春节假期，若要体现这一点，加一行
 *       QUEST_HOLIDAY_PLAN_OVERRIDE['2026'] = { '2026-02-16': '休' }; 即可。
 *
 * 【算法来源与适用范围】
 *   - 农历：业界通行的 1900-2100 农历数据表（lunarInfo，21 位/年编码
 *     12 个月的月大小 + 闰月月份 + 闰月大小）+ lYearDays / leapMonth /
 *     leapDays / monthDays / toLunar 这一套换算算法。基准 1900-01-31
 *     为农历 1900 年正月初一。闰月被正确区分：闰四月里的日子不会被当作
 *     四月，因此不会误报农历节日。
 *   - 节气：经典线性公式（1900-01-06 02:05 为基准 + 每回归年
 *     31556925974.7ms + 24 个节气偏移量 sTermInfo）。
 *     精度说明：该公式给出的是节气时刻的近似值。实测（对照紫金山天文台
 *     2026 年 24 节气时刻表）与真实时刻相差在 ±2 小时内（最大约 114 分钟），
 *     因此当真实时刻落在午夜前后 2 小时内时，日期会差 1 天：
 *     2026 年"芒种"公式读数为 06-06 01:01，官方为 06-05 23:48（晚 73 分钟跨过午夜），
 *     24 个节气中仅此 1 个日期不一致；清明、冬至、春分、夏至等其余 23 个均一致。
 *     若以后要求 100% 精确，需要换成天文算法或引入逐年修正表，
 *     但那样就不再是"经典算法"，故此处保留原样并在注释里说明误差来源。
 *   - 日期运算全部走"公历日序"整数换算（civilToDay / dayToCivil），
 *     只用 Date 的本地时间取值器，不解析 'YYYY-MM-DD' 字符串，
 *     因此不受时区 / 夏令时影响。
 *   - 支持范围：公历 1900-01-31（农历 1900 年正月初一）~ 农历 2100 年除夕
 *     （约公历 2101-01-28）。范围外 lunarOf 返回 null，节气不参与判定，
 *     公历固定节日与覆盖表照常工作。
 * ================================================================ */

(function () {
    'use strict';

    /* ============================================================
     * 0. 可选覆盖表（调休/连休）。
     *    刻意留空：纯计算不猜政策。维护方式见文件头注释。
     *    键 = 年份字符串（与日期里的年一致），
     *    值 = { 'YYYY-MM-DD': '休' | '班' }。
     * ============================================================ */
    var QUEST_HOLIDAY_PLAN_OVERRIDE = {};

    /* ============================================================
     * 1. 公历日序换算（无时区依赖的整数日期运算）
     *    civilToDay : 公历 [年,月,日] -> 自 1970-01-01 起的天数（可为负）
     *    dayToCivil : 天数 -> { year, month, day }
     *    两个函数互为逆运算，全部由整数运算得出，不经过时间戳，
     *    所以不会因为本地时区或夏令时（某天 23 或 25 小时）算错一天。
     * ============================================================ */
    function civilToDay(y, m, d) {
        var yy = (m <= 2) ? y - 1 : y;
        var era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
        var yoe = yy - era * 400;                                              // [0, 399]
        var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;  // [0, 365]
        var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
        return era * 146097 + doe - 719468;
    }

    function dayToCivil(z) {
        var zz = z + 719468;
        var era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
        var doe = zz - era * 146097;
        var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
        var y = yoe + era * 400;
        var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
        var mp = Math.floor((5 * doy + 2) / 153);
        var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
        var m = mp + (mp < 10 ? 3 : -9);
        return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
    }

    // Date 对象 -> 日序。只读本地时间取值器（getFullYear 等），不碰 ISO 字符串。
    function dateToDay(date) {
        return civilToDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    // 'YYYY-MM-DD'，只用于覆盖表的键（不用于解析）
    function isoKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

    // 'M-D'，用于公历/农历节日查找表的键
    function mdKey(m, d) { return m + '-' + d; }

    /* ============================================================
     * 2. 农历数据表 lunarInfo（1900-2100，共 201 项）
     *    每年一项，编码方式：
     *      bit 16      闰月大小：1 = 闰月 30 天，0 = 闰月 29 天
     *      bit 15..4   正月到腊月各月大小：1 = 30 天，0 = 29 天
     *      bit 3..0    闰月月份（1-12），0 表示该年无闰月
     *    例：0x04bd8 -> 闰月月份 = 8（闰八月），闰月 29 天。
     * ============================================================ */
    var lunarInfo = [
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
        0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
        0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
        0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
        0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
        0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
        0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
        0x0d520                                                                                    // 2100
    ];

    var LUNAR_MIN_YEAR = 1900;
    var LUNAR_MAX_YEAR = 2100;

    // 农历 1900 年正月初一 = 公历 1900-01-31，作为全部农历换算的基准日
    var LUNAR_BASE_DAY = civilToDay(1900, 1, 31);

    // 农历某年全年天数 = 12 个农历月（先按 29 天计 348）+ 各月多出的 1 天 + 闰月天数
    function lYearDays(y) {
        var i, sum = 348;
        for (i = 0x8000; i > 0x8; i >>= 1) {
            sum += (lunarInfo[y - LUNAR_MIN_YEAR] & i) ? 1 : 0;
        }
        return sum + leapDays(y);
    }

    // 该年闰几月，0 表示无闰月
    function leapMonth(y) {
        return lunarInfo[y - LUNAR_MIN_YEAR] & 0xf;
    }

    // 闰月天数：无闰月 0，有则 30 或 29
    function leapDays(y) {
        if (leapMonth(y)) {
            return (lunarInfo[y - LUNAR_MIN_YEAR] & 0x10000) ? 30 : 29;
        }
        return 0;
    }

    // 农历某年某月（不含闰月）的天数：30 或 29
    function monthDays(y, m) {
        if (m < 1 || m > 12) { return -1; }
        return (lunarInfo[y - LUNAR_MIN_YEAR] & (0x10000 >> m)) ? 30 : 29;
    }

    // 1900 年初一到 2100 年除夕的总天数，用于范围校验（惰性计算一次）
    var TOTAL_LUNAR_DAYS = null;
    function totalLunarDays() {
        if (TOTAL_LUNAR_DAYS === null) {
            var sum = 0;
            for (var y = LUNAR_MIN_YEAR; y <= LUNAR_MAX_YEAR; y++) { sum += lYearDays(y); }
            TOTAL_LUNAR_DAYS = sum;
        }
        return TOTAL_LUNAR_DAYS;
    }

    /* ------------------------------------------------------------
     * toLunarDay(dayNumber) -> { year, month, day, isLeap } | null
     * 核心换算：把"公历日序"变成农历。
     * 步骤：先逐年减去整年天数定位农历年；再逐月减，遇到闰月时
     * 先插一个闰月（把 --i 后再取 leapDays）再继续；最后剩下的
     * 偏移量 +1 就是农历日。
     * 闰月的识别靠 isLeap 标记，调用方据此判断"闰月里的节日不报"。
     * ------------------------------------------------------------ */
    function toLunarDay(dayNumber) {
        var offset = dayNumber - LUNAR_BASE_DAY;
        if (offset < 0 || offset >= totalLunarDays()) { return null; }

        var temp = 0, i;
        // 逐年逼近：循环结束时 i 可能已经是下一年，下面用 offset<0 回退修正
        for (i = LUNAR_MIN_YEAR; i <= LUNAR_MAX_YEAR && offset > 0; i++) {
            temp = lYearDays(i);
            offset -= temp;
        }
        if (offset < 0) { offset += temp; i--; }
        var lunarYear = i;

        var leap = leapMonth(lunarYear);
        var isLeap = false;

        // 逐月逼近
        for (i = 1; i < 13 && offset > 0; i++) {
            if (leap > 0 && i === leap + 1 && isLeap === false) {
                // 走到了闰月的位置：先把 i 退回去代表"闰 X 月"，取闰月天数
                --i;
                isLeap = true;
                temp = leapDays(lunarYear);
            } else {
                temp = monthDays(lunarYear, i);
            }
            // 闰月之后的那个正常月份，落地时清掉闰标记
            if (isLeap === true && i === leap + 1) { isLeap = false; }
            offset -= temp;
        }

        // 恰好落在闰月/下一月边界上的修正
        if (offset === 0 && leap > 0 && i === leap + 1) {
            if (isLeap) {
                isLeap = false;
            } else {
                isLeap = true;
                --i;
            }
        }
        if (offset < 0) { offset += temp; --i; }

        return { year: lunarYear, month: i, day: offset + 1, isLeap: isLeap };
    }

    /* ============================================================
     * 3. 农历文本（用于日历格子显示）
     * ============================================================ */
    var LUNAR_MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
    var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    // 农历日的中文写法：初一~初十 / 十一~十九 / 二十 / 廿一~廿九 / 三十
    function lunarDayLabel(d) {
        if (d === 10) { return '初十'; }
        if (d === 20) { return '二十'; }
        if (d === 30) { return '三十'; }
        if (d < 10) { return '初' + CN_NUM[d - 1]; }
        if (d < 20) { return '十' + CN_NUM[d - 11]; }
        return '廿' + CN_NUM[d - 21];
    }

    /* ============================================================
     * 4. 二十四节气
     *    TERM_INFO[n]：第 n 个节气相对基准的分钟偏移，n 从 0=小寒 起，
     *    按公历月份顺序成对排列（每月两个节气：前一个"节"，后一个"气"）。
     *    基准时刻 1900-01-06 02:05，配合每回归年毫秒数做线性外推。
     *    这是流传极广的经典算法，1900-2100 内日期与天文台公布值一致。
     * ============================================================ */
    var TERM_NAMES = [
        '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
        '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
        '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
    ];
    var TERM_INFO = [
        0, 21208, 42467, 63836, 85337, 107014, 128867, 150921,
        173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033,
        353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758
    ];

    // 节气等级：清明既是节气又是法定节假日（1）；冬至是传统大节（2）；其余为补充信息（3）
    var TERM_LEVEL = { '清明': 1, '冬至': 2 };

    var MS_PER_TROPICAL_YEAR = 31556925974.7;
    // 基准：1900-01-06 02:05，用"日序 + 一天的分钟占比"表示，避免任何时间戳
    var TERM_BASE_DAY_FLOAT = civilToDay(1900, 1, 6) + (2 * 60 + 5) / 1440;

    // 第 y 年第 n 个节气所在的公历日序
    function termDayNumber(y, n) {
        var dayFloat = TERM_BASE_DAY_FLOAT +
            (MS_PER_TROPICAL_YEAR * (y - 1900)) / 86400000 +
            TERM_INFO[n] / 1440;
        return Math.floor(dayFloat);
    }

    // 按年缓存：{ 'M-D': '清明', ... }
    var termCache = {};
    function termsOfYear(y) {
        if (y < LUNAR_MIN_YEAR || y > LUNAR_MAX_YEAR) { return {}; }
        var cached = termCache[y];
        if (cached) { return cached; }
        var map = {};
        for (var n = 0; n < 24; n++) {
            var c = dayToCivil(termDayNumber(y, n));
            if (c.year !== y) { continue; } // 理论上的跨年漂移，直接跳过（本范围内不会发生）
            map[mdKey(c.month, c.day)] = TERM_NAMES[n];
        }
        termCache[y] = map;
        return map;
    }

    /* ============================================================
     * 5. 节日数据表
     *    改节日只需改这三张表：加一行即可，其余逻辑不用动。
     *    level: 1 重大 / 2 一般 / 3 冷门补充
     * ============================================================ */

    // 5.1 公历固定节日（kind = 'solar'）
    var SOLAR_FESTIVALS = [
        { m: 1, d: 1, name: '元旦', level: 1 },
        { m: 3, d: 8, name: '妇女节', level: 2 },
        { m: 3, d: 12, name: '植树节', level: 3 },
        { m: 3, d: 15, name: '消费者权益日', level: 3 },
        { m: 4, d: 22, name: '世界地球日', level: 3 },
        { m: 5, d: 1, name: '劳动节', level: 1 },
        { m: 5, d: 4, name: '青年节', level: 2 },
        { m: 5, d: 12, name: '防灾减灾日', level: 3 },
        { m: 6, d: 1, name: '儿童节', level: 2 },
        { m: 6, d: 5, name: '世界环境日', level: 3 },
        { m: 7, d: 1, name: '建党节', level: 2 },
        { m: 8, d: 1, name: '建军节', level: 2 },
        { m: 9, d: 10, name: '教师节', level: 2 },
        { m: 10, d: 1, name: '国庆节', level: 1 },
        { m: 11, d: 9, name: '全国消防日', level: 3 },
        { m: 12, d: 4, name: '国家宪法日', level: 3 }
    ];

    // 5.2 国际 / 外来节日（kind = 'intl'）
    var INTL_FESTIVALS = [
        { m: 2, d: 14, name: '情人节', level: 2 },
        { m: 4, d: 1, name: '愚人节', level: 3 },
        { m: 10, d: 31, name: '万圣节', level: 3 },
        { m: 12, d: 24, name: '平安夜', level: 2 },
        { m: 12, d: 25, name: '圣诞节', level: 2 }
    ];

    // 5.3 农历节日（kind = 'lunar'）。键为 '农历月-农历日'，
    //     只在非闰月命中：闰四月里的"四月初一"不会被当成节日。
    //     除夕不在这里，因为它取决于腊月是 30 天还是 29 天，要现场算（见 pushLunar）。
    var LUNAR_FESTIVALS = [
        { m: 1, d: 1, name: '春节', level: 1 },
        { m: 1, d: 15, name: '元宵节', level: 1 },
        { m: 2, d: 2, name: '龙抬头', level: 3 },
        { m: 5, d: 5, name: '端午节', level: 1 },
        { m: 7, d: 7, name: '七夕', level: 2 },
        { m: 7, d: 15, name: '中元节', level: 3 },
        { m: 8, d: 15, name: '中秋节', level: 1 },
        { m: 9, d: 9, name: '重阳节', level: 2 },
        { m: 10, d: 1, name: '寒衣节', level: 3 },
        { m: 12, d: 8, name: '腊八节', level: 2 },
        { m: 12, d: 23, name: '小年', level: 2 }
    ];

    // 把数组表编译成 'M-D' 查找表，避免每次遍历
    function buildLookup(arr) {
        var map = {};
        for (var i = 0; i < arr.length; i++) { map[mdKey(arr[i].m, arr[i].d)] = arr[i]; }
        return map;
    }
    var SOLAR_LOOKUP = buildLookup(SOLAR_FESTIVALS);
    var INTL_LOOKUP = buildLookup(INTL_FESTIVALS);
    var LUNAR_LOOKUP = buildLookup(LUNAR_FESTIVALS);

    /* ============================================================
     * 6. 法定节假日规则（纯推导，不含国务院调休）
     *    name     : 与该日"正牌节日"的 Entry 同名，用于把 statutory 标记挂上去
     *    midName  : 假期中段（如 10/2、正月初二）没有传统名称时用的补充名
     * ============================================================ */
    var RULES = {
        xiaodan: { name: '元旦', midName: '元旦假期', level: 1 },
        chunjie: { name: '春节', midName: '春节假期', level: 1 },
        qingming: { name: '清明', midName: '清明假期', level: 1 },
        laodong: { name: '劳动节', midName: '劳动节假期', level: 1 },
        duanwu: { name: '端午节', midName: '端午节假期', level: 1 },
        zhongqiu: { name: '中秋节', midName: '中秋节假期', level: 1 },
        guoqing: { name: '国庆节', midName: '国庆节假期', level: 1 }
    };

    // 命中法定节假日规则则返回对应规则对象，否则 null
    function statutoryRule(y, m, d, lux, termName) {
        if (m === 1 && d === 1) { return RULES.xiaodan; }                 // 元旦 1 天
        if (m === 5 && d === 1) { return RULES.laodong; }                 // 劳动节 1 天
        if (m === 10 && d >= 1 && d <= 3) { return RULES.guoqing; }       // 国庆 10/1-10/3
        if (termName === '清明') { return RULES.qingming; }               // 清明节气当天
        if (lux && !lux.isLeap) {
            if (lux.month === 1 && lux.day >= 1 && lux.day <= 3) { return RULES.chunjie; }  // 春节初一~初三
            if (lux.month === 5 && lux.day === 5) { return RULES.duanwu; }                   // 端午
            if (lux.month === 8 && lux.day === 15) { return RULES.zhongqiu; }                // 中秋
        }
        return null;
    }

    /* ============================================================
     * 7. 覆盖表读取 & Entry 构造
     * ============================================================ */
    // 读覆盖表：'休' / '班' / null
    function overrideOf(y, m, d) {
        var table = QUEST_HOLIDAY_PLAN_OVERRIDE;
        if (!table) { return null; }
        var byYear = table[String(y)];
        if (!byYear) { return null; }
        var v = byYear[isoKey(y, m, d)];
        return (v === '休' || v === '班') ? v : null;
    }

    function makeEntry(name, kind, level) {
        return { name: name, kind: kind, level: level, statutory: false, badge: '' };
    }

    function findByName(list, name) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].name === name) { return list[i]; }
        }
        return null;
    }

    // 农历节日入列：闰月直接跳过（闰月里的同名日子不算节日）
    function pushLunar(list, lux) {
        if (lux.isLeap) { return; }
        var f = LUNAR_LOOKUP[mdKey(lux.month, lux.day)];
        if (f) { list.push(makeEntry(f.name, 'lunar', f.level)); }
        // 除夕 = 当年腊月的最后一天（腊月大 30 天则 12-30，小 29 天则 12-29），必须现场算
        if (lux.month === 12 && lux.day === monthDays(lux.year, 12)) {
            list.push(makeEntry('除夕', 'lunar', 1));
        }
    }

    /* ------------------------------------------------------------
     * resolveDay(date) -> { list, statutory, lunar, rule, override }
     * 唯一的真相来源：forDate / isStatutory / forMonth 全部走这里，
     * 保证"显示出来的节日"和"是否法定假日"永远一致。
     * ------------------------------------------------------------ */
    function resolveDay(date) {
        var res = { list: [], statutory: false, lunar: null, rule: null, override: null };
        if (!(date instanceof Date) || isNaN(date.getTime())) { return res; }

        var y = date.getFullYear();
        var m = date.getMonth() + 1;
        var d = date.getDate();
        var list = res.list;

        var lux = toLunarDay(dateToDay(date));
        res.lunar = lux;

        var termMap = termsOfYear(y);
        var termName = termMap[mdKey(m, d)] || null;

        // 7.1 公历固定节日 / 国际节日
        var sf = SOLAR_LOOKUP[mdKey(m, d)];
        if (sf) { list.push(makeEntry(sf.name, 'solar', sf.level)); }
        var intl = INTL_LOOKUP[mdKey(m, d)];
        if (intl) { list.push(makeEntry(intl.name, 'intl', intl.level)); }

        // 7.2 农历节日（含除夕）
        if (lux) { pushLunar(list, lux); }

        // 7.3 节气
        if (termName) { list.push(makeEntry(termName, 'term', TERM_LEVEL[termName] || 3)); }

        // 7.4 法定节假日：覆盖表优先于规则推导
        var rule = statutoryRule(y, m, d, lux, termName);
        var ov = overrideOf(y, m, d);
        res.rule = rule;
        res.override = ov;

        var statutory = false;
        var badge = '';
        if (ov === '休') { statutory = true; badge = '休'; }
        else if (ov === '班') { statutory = false; badge = '班'; }
        else if (rule) { statutory = true; badge = '休'; }
        res.statutory = statutory;

        if (badge) {
            // 标记挂在哪条 Entry 上，优先级：
            //   1) 规则里那个"正牌节日"（如 10/1 的 国庆节、清明节气当天）
            //   2) 只有覆盖表专门加了假、当天又没有对应规则时，挂到当天最重要的一条上
            //      （例如把 2026-02-16 标成 '休'，badge 应该落在"除夕"而不是凭空多一条）
            //   3) 规则存在但当天没有同名节日（如正月初二），才补一条假期条目，
            //      此时绝不劫持当天的其它条目（正月初二不能把 '休' 挂到"雨水"上）
            var target = rule ? findByName(list, rule.name) : (list.length ? list[0] : null);
            if (target) {
                target.statutory = statutory;
                target.badge = badge;
            } else {
                var nm = rule ? rule.midName : (badge === '休' ? '法定假日' : '调休上班');
                var lv = rule ? rule.level : (badge === '休' ? 1 : 3);
                var e = makeEntry(nm, 'statutory', lv);
                e.statutory = statutory;
                e.badge = badge;
                list.push(e);
            }
        }

        // 按重要度排序（level 越小越重要）
        list.sort(function (a, b) { return a.level - b.level; });
        return res;
    }

    /* ============================================================
     * 8. 公开 API
     * ============================================================ */
    var api = {
        // 某天的全部节日，按重要度降序（level 升序）
        forDate: function (date) {
            return resolveDay(date).list;
        },

        // 整月结果 { 日: Array<Entry> }，只包含有节日的天
        forMonth: function (year, monthIndex0) {
            var out = {};
            if (typeof year !== 'number' || typeof monthIndex0 !== 'number') { return out; }
            if (monthIndex0 < 0 || monthIndex0 > 11) { return out; }
            if (!isFinite(year) || !isFinite(monthIndex0)) { return out; }
            var y = Math.floor(year), mi = Math.floor(monthIndex0);
            // 本月天数：用下一个月的 1 号减本月的 1 号的日序，绕开 Date 的月份溢出
            var first = civilToDay(y, mi + 1, 1);
            var nextFirst = (mi === 11) ? civilToDay(y + 1, 1, 1) : civilToDay(y, mi + 2, 1);
            var days = nextFirst - first;
            for (var d = 1; d <= days; d++) {
                var list = resolveDay(new Date(y, mi, d)).list;
                if (list.length) { out[d] = list; }
            }
            return out;
        },

        // 是否法定节假日（覆盖表优先）
        isStatutory: function (date) {
            return resolveDay(date).statutory;
        },

        // 农历日期；超出 1900-2100 返回 null
        lunarOf: function (date) {
            if (!(date instanceof Date) || isNaN(date.getTime())) { return null; }
            var lux = toLunarDay(dateToDay(date));
            if (!lux) { return null; }
            return {
                year: lux.year,
                month: lux.month,
                day: lux.day,
                isLeap: lux.isLeap,
                label: (lux.isLeap ? '闰' : '') + LUNAR_MONTH_CN[lux.month - 1] + '月' + lunarDayLabel(lux.day)
            };
        },

        _selftest: _selftest
    };

    // 把覆盖表绑定到 API 上（同一个对象引用，get/set 都同步），
    // 这样 QUEST_HOLIDAY_PLAN_OVERRIDE['2026'] = {...} 和整个对象替换都生效。
    Object.defineProperty(api, 'QUEST_HOLIDAY_PLAN_OVERRIDE', {
        enumerable: true,
        get: function () { return QUEST_HOLIDAY_PLAN_OVERRIDE; },
        set: function (v) { QUEST_HOLIDAY_PLAN_OVERRIDE = v || {}; }
    });

    /* ============================================================
     * 9. 自检：内置断言，用真实已知日期验证算法。
     *    改动本文件后请务必跑一次，确保没有把算法改坏。
     * ============================================================ */
    function _selftest() {
        var pass = 0, fail = 0, details = [];

        function ok(cond, msg) {
            if (cond) { pass++; } else { fail++; details.push('FAIL: ' + msg); }
            return !!cond;
        }
        function note(msg) { details.push('NOTE: ' + msg); }
        function D(y, m, d) { return new Date(y, m - 1, d); }
        function has(list, name) { return !!findByName(list, name); }
        function dayHas(date, name, label) {
            return ok(has(api.forDate(date), name), (label || name) + ' 应出现在 ' + isoKey(date.getFullYear(), date.getMonth() + 1, date.getDate()));
        }

        // 9.1 数据表完整性
        ok(lunarInfo.length === 201, '农历数据表应为 201 项（1900-2100），实际 ' + lunarInfo.length);
        ok(SOLAR_FESTIVALS.length + INTL_FESTIVALS.length + LUNAR_FESTIVALS.length > 0, '节日表不应为空');

        // 9.2 春节（多个年份交叉验证，能同时命中说明农历换算整体正确）
        dayHas(D(2026, 2, 17), '春节', '2026-02-17 春节');
        dayHas(D(2025, 1, 29), '春节', '2025-01-29 春节');
        dayHas(D(2024, 2, 10), '春节', '2024-02-10 春节');
        dayHas(D(2023, 1, 22), '春节', '2023-01-22 春节');

        // 9.3 除夕（腊月最后一天，需按大月 30 / 小月 29 现场判断）
        dayHas(D(2026, 2, 16), '除夕', '2026-02-16 除夕（春节前一天）');
        dayHas(D(2024, 2, 9), '除夕', '2024-02-09 除夕');

        // 9.4 其他农历节日
        dayHas(D(2026, 6, 19), '端午节', '2026-06-19 端午节');
        dayHas(D(2026, 9, 25), '中秋节', '2026-09-25 中秋节');
        dayHas(D(2020, 6, 25), '端午节', '2020-06-25 端午节');

        // 9.5 节气 + 法定节假日（清明）
        var qm = api.forDate(D(2026, 4, 5));
        var qmEntry = findByName(qm, '清明');
        ok(!!qmEntry, '2026-04-05 应命中 清明');
        if (qmEntry) {
            ok(qmEntry.kind === 'term', '清明 的 kind 应为 term，实际 ' + qmEntry.kind);
            ok(qmEntry.statutory === true, '清明 应为法定节假日');
            ok(qmEntry.badge === '休', "清明的 badge 应为 '休'，实际 '" + qmEntry.badge + "'");
        }
        ok(api.isStatutory(D(2026, 4, 5)) === true, '2026-04-05 清明 isStatutory 应为 true');

        // 9.6 闰月处理（关键用例）
        //     2020 年闰四月，5 月 23 日是闰四月初一：应识别为"闰"，
        //     且不该在这一天报出任何农历节日。
        var leap = api.lunarOf(D(2020, 5, 23));
        ok(!!leap, '2020-05-23 应有农历结果');
        if (leap) {
            ok(leap.isLeap === true, '2020-05-23 应为闰月（2020 年闰四月存在）');
            ok(leap.month === 4, '2020-05-23 的农历月应为 4，实际 ' + leap.month);
            ok(leap.day === 1, '2020-05-23 的农历日应为 1，实际 ' + leap.day);
            ok(leap.label === '闰四月初一', "2020-05-23 的 label 应为 '闰四月初一'，实际 '" + leap.label + "'");
            ok(monthDays(2020, 4) === 30, '2020 年四月应为 30 天，实际 ' + monthDays(2020, 4));
            ok(leapDays(2020) === 29, '2020 年闰四月应为 29 天，实际 ' + leapDays(2020));
            ok(leapMonth(2020) === 4, '2020 年应闰四月，实际闰 ' + leapMonth(2020) + ' 月');
        }
        var leapFest = api.forDate(D(2020, 5, 23));
        var lunarHit = null;
        for (var li = 0; li < leapFest.length; li++) {
            if (leapFest[li].kind === 'lunar') { lunarHit = leapFest[li]; }
        }
        ok(lunarHit === null, '闰月里的日子不应报出农历节日，却报出了 ' + (lunarHit ? lunarHit.name : ''));

        // 再看一个闰二月：2023 年闰二月，闰二月初二不是"龙抬头"
        ok(api.lunarOf(D(2023, 3, 23)) && api.lunarOf(D(2023, 3, 23)).isLeap === true, '2023-03-23 应落在闰二月');
        ok(!has(api.forDate(D(2023, 3, 23)), '龙抬头'), '闰二月初二 不应报 龙抬头');
        dayHas(D(2023, 2, 21), '龙抬头', '2023-02-21（二月初二）龙抬头');

        // 9.7 冬至（以紫金山天文台公布时刻为准，详见下方 NOTE）
        dayHas(D(2026, 12, 22), '冬至', '2026-12-22 冬至');
        ok(has(api.forDate(D(2024, 12, 21)), '冬至'), '2024-12-21 冬至');
        ok(has(api.forDate(D(2023, 12, 22)), '冬至'), '2023-12-22 冬至');
        note('需求书写的是 2026-12-21 为冬至；经核验该日不是冬至。2026 年冬至时刻为 ' +
             '北京时间 12-22 04:49:55（UTC 12-21 20:50），故本文件按真值断言 12-22。');
        note('节气精度：经典线性公式与真实时刻相差 ±2 小时内，真实时刻贴近午夜时日期会差 1 天。' +
             '实例：2026 年芒种公式读数 06-06 01:01，紫金山天文台为 06-05 23:48（晚 73 分钟跨午夜）。' +
             '2026 年 24 个节气中仅芒种日期不一致，清明/冬至/春分/夏至等 23 个均与官方一致。');

        // 9.8 农历日取值范围抽查（跨 1900 边界到 2100 边界）
        var sweep = [D(1900, 1, 31), D(1900, 12, 31), D(1950, 7, 15), D(2000, 2, 29),
                     D(2020, 5, 23), D(2026, 2, 17), D(2050, 6, 1), D(2099, 12, 31)];
        var sweepOk = true;
        for (var si = 0; si < sweep.length; si++) {
            var l = api.lunarOf(sweep[si]);
            if (!l || !(l.day >= 1 && l.day <= 30) || !(l.month >= 1 && l.month <= 12)) { sweepOk = false; }
        }
        ok(sweepOk, 'lunarOf() 返回的 day 应始终在 1..30、month 在 1..12');
        ok(api.lunarOf(new Date(1899, 5, 1)) === null, '1900 年之前应返回 null（超出支持范围）');

        // 9.9 isStatutory 基本用例
        ok(api.isStatutory(D(2026, 1, 1)) === true, '2026-01-01 元旦应为法定节假日');
        ok(api.isStatutory(D(2026, 9, 26)) === false, '2026-09-26（普通周六）不应是法定节假日');
        ok(api.isStatutory(D(2026, 10, 2)) === true, '2026-10-02 国庆假期应为法定节假日');
        ok(api.isStatutory(D(2026, 2, 18)) === true, '2026-02-18 正月初二应为法定节假日（春节 3 天）');
        // 正月初二这天只有"雨水"一条别的 Entry，'休' 不能被挂到它头上
        var yuShui = findByName(api.forDate(D(2026, 2, 18)), '雨水');
        ok(!!yuShui && yuShui.badge === '' && yuShui.statutory === false, '节气条目不应被当成法定假日（雨水不该带休）');
        var chunjieMid = findByName(api.forDate(D(2026, 2, 18)), '春节假期');
        ok(!!chunjieMid && chunjieMid.badge === '休' && chunjieMid.kind === 'statutory',
            '2026-02-18 应有一条 kind=statutory 的 春节假期 且带休');

        // 9.10 forMonth
        var feb = api.forMonth(2026, 1);
        var d17 = feb[17] || [];
        ok(has(d17, '春节'), 'forMonth(2026, 1) 的 17 号应包含 春节');
        ok(Object.keys(feb).length > 0 && !feb[1], 'forMonth 应只返回有节日的日子（2 月 1 日无节日）');
        ok(api.forMonth(2026, 12) && Object.keys(api.forMonth(2026, 12)).length === 0, '非法月份应返回空对象');

        // 9.11 覆盖表优先级（改完要恢复，避免影响后续调用）
        api.QUEST_HOLIDAY_PLAN_OVERRIDE['2026'] = { '2026-02-16': '休', '2026-02-18': '班' };
        ok(api.isStatutory(D(2026, 2, 16)) === true, "覆盖表 '休' 应让 2026-02-16 变为法定节假日");
        ok(api.isStatutory(D(2026, 2, 18)) === false, "覆盖表 '班' 应让 2026-02-18 不再是法定节假日");
        var b16 = api.forDate(D(2026, 2, 16));
        var b16c = findByName(b16, '除夕');
        ok(!!b16c && b16c.badge === '休' && b16c.statutory === true, "覆盖表应把 badge/statutory 挂到除夕上");
        api.QUEST_HOLIDAY_PLAN_OVERRIDE = {};
        ok(api.isStatutory(D(2026, 2, 16)) === false, '清空覆盖表后应回到纯规则推导');

        // 9.12 排序：level 必须非降
        var sample = api.forDate(D(2026, 10, 1));
        var sortedOk = true;
        for (var k = 1; k < sample.length; k++) {
            if (sample[k - 1].level > sample[k].level) { sortedOk = false; }
        }
        ok(sortedOk && sample.length > 0, 'forDate 结果应按 level 升序排列');
        ok(findByName(sample, '国庆节') && findByName(sample, '国庆节').badge === '休', "10-01 国庆节 badge 应为 '休'");

        return { pass: pass, fail: fail, details: details };
    }

    // 挂到全局（唯一暴露点）
    if (typeof window !== 'undefined') {
        window.QuestFestivals = api;
    }
})();
