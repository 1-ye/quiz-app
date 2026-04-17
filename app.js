/* ============================================
   QUIZ APP - Core Application Logic
   ============================================ */

// ===== STATE MANAGEMENT =====
const STATE_KEY = 'quizAppState';
let state = loadState();

function defaultState() {
    return {
        answered: {},       // { questionId: { selected: 'A'|'AB'|..., correct: bool } }
        wrong: [],          // [questionId, ...]
        favorites: [],      // [questionId, ...]
        dailyStats: {},     // { '2025-01-01': { done: 10, correct: 8 } }
        lastPosition: 0,    // last practice index
        streak: 0,          // consecutive correct
        examHistory: []     // [{ date, score, totalScore, singleCorrect, singleTotal, multiCorrect, multiTotal, judgeCorrect, judgeTotal, usedTime, totalQuestions }, ...]
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch (e) { }
    return defaultState();
}

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ===== PRACTICE STATE =====
let practiceQuestions = [];  // current question set
let practiceIndex = 0;      // current index in set
let practiceMode = '';       // 'sequential', 'random', 'wrong', 'favorites', 'search', 'exam-review'
let selectedOptions = new Set();
let isAnswered = false;
let highlightedOptionIndex = -1;  // for arrow key navigation
let lastInteractionWasTouch = false;  // track if last interaction was touch
let lastTouchTime = 0;

// Track actual touch vs mouse interactions
// On mobile, touchstart fires BEFORE mousedown, so we need to prevent mousedown from overriding
document.addEventListener('touchstart', () => {
    lastInteractionWasTouch = true;
    lastTouchTime = Date.now();
}, { passive: true });
document.addEventListener('mousedown', () => {
    // Ignore mousedown that follows a touch event within 500ms (mobile compatibility events)
    if (Date.now() - lastTouchTime > 500) {
        lastInteractionWasTouch = false;
    }
});

// ===== EXAM STATE =====
let examQuestions = [];
let examIndex = 0;
let examAnswers = {};  // { index: Set<option> }
let examTimer = null;
let examTimeLeft = 0;
let examStartTime = 0;
let examConfig = { singleCount: 60, multiCount: 60, judgeCount: 20, time: 90 };
let examHighlightedOptionIndex = -1;  // for arrow key navigation in exam mode
let importMode = 'merge'; // 'merge' or 'replace'
let wrongStreak = 0;  // consecutive wrong answers (session only, not persisted)

// ===== MOTIVATIONAL QUOTES =====
const STREAK_MILESTONES = {
    5: [
        { emoji: '🔥', title: '5 连对！', msg: '实力，是日复一日的坚持锻造的' },
        { emoji: '🔥', title: '5 连对！', msg: '你的每一次正确，都不是偶然' },
        { emoji: '🔥', title: '5 连对！', msg: '平时多流汗，考场少流泪' },
    ],
    10: [
        { emoji: '🚀', title: '10 连对！', msg: '当别人还在犹豫时，你已经在路上了' },
        { emoji: '🚀', title: '10 连对！', msg: '你的专注力，就是你最大的武器' },
        { emoji: '🚀', title: '10 连对！', msg: '十道题的背后，是无数次的思考与沉淀' },
    ],
    20: [
        { emoji: '⚡', title: '20 连对！', msg: '真正的强者，不是没有对手，而是不断超越自己' },
        { emoji: '⚡', title: '20 连对！', msg: '这种稳定的输出能力，就是实力的证明' },
        { emoji: '⚡', title: '20 连对！', msg: '你在这里做对的每一题，都是考场上的底气' },
    ],
    50: [
        { emoji: '👑', title: '50 连对！', msg: '五十连对，这不是运气，是绝对的实力' },
        { emoji: '👑', title: '50 连对！', msg: '你已经站在了大多数人到不了的高度' },
        { emoji: '👑', title: '50 连对！', msg: '天赋决定上限，努力决定下限，你在拉高下限' },
    ],
    100: [
        { emoji: '🏆', title: '100 连对！', msg: '一百连对，你就是传说本身' },
        { emoji: '🏆', title: '100 连对！', msg: '这种境界，已经不是努力能解释的了' },
        { emoji: '🏆', title: '100 连对！', msg: '你让不可能变成了可能' },
    ],
};

const WRONG_STREAK_MILESTONES = {
    3: [
        { emoji: '💫', title: '别急', msg: '暴露问题，比掩盖问题更需要勇气' },
        { emoji: '💫', title: '别急', msg: '敢于直面弱点的人，才有资格变强' },
        { emoji: '💫', title: '别急', msg: '每一次跌倒，都是在为下一次飞跃蓄力' },
        { emoji: '💫', title: '别急', msg: '现在的每一个错误，都是考场上的免疫力' },
    ],
    5: [
        { emoji: '🌅', title: '稳住', msg: '低谷不是终点，而是反弹的起点' },
        { emoji: '🌅', title: '稳住', msg: '正因为难，才值得去征服' },
        { emoji: '🌅', title: '稳住', msg: '被打倒不丢人，站不起来才丢人' },
        { emoji: '🌅', title: '稳住', msg: '把所有的错误都留在这里，考场上就不会再犯了' },
    ],
    8: [
        { emoji: '🔥', title: '坚持', msg: '最深的夜，才能看到最亮的星' },
        { emoji: '🔥', title: '坚持', msg: '每一个高手，都曾经历过这样的至暗时刻' },
        { emoji: '🔥', title: '坚持', msg: '这些错题会成为你最终胜利的垫脚石' },
        { emoji: '🔥', title: '坚持', msg: '困难只是暂时的，放弃才是永久的' },
    ],
};

const DAILY_MILESTONES = {
    10:  [
        { emoji: '✨', title: '今日 10 题！', msg: '所有伟大的征程，都起始于第一步' },
        { emoji: '✨', title: '今日 10 题！', msg: '开始行动的人，已经超越了大多数人' },
    ],
    30:  [
        { emoji: '🔥', title: '今日 30 题！', msg: '你选择在这里拼搏的每一分钟，都在拉开与别人的距离' },
        { emoji: '🔥', title: '今日 30 题！', msg: '持续前行的人，终会到达彼岸' },
    ],
    50:  [
        { emoji: '💪', title: '今日 50 题！', msg: '半百之数，半是汗水，半是收获' },
        { emoji: '💪', title: '今日 50 题！', msg: '当你觉得坚持不下去的时候，恰恰是进步最快的时候' },
    ],
    100: [
        { emoji: '🏅', title: '今日百题！', msg: '别人在休息的时候，你在默默变强' },
        { emoji: '🏅', title: '今日百题！', msg: '一百道题的重量，只有走过的人才懂' },
    ],
    150: [
        { emoji: '⚡', title: '今日 150 题！', msg: '量变的积累，终将迎来质变的飞跃' },
        { emoji: '⚡', title: '今日 150 题！', msg: '你的坚持，正在重新定义你的极限' },
    ],
    200: [
        { emoji: '🌟', title: '今日 200 题！', msg: '能走到这里的人，已经不多了' },
        { emoji: '🌟', title: '今日 200 题！', msg: '两百题的背后，是一个不甘平庸的灵魂' },
    ],
    250: [
        { emoji: '🔥', title: '今日 250 题！', msg: '你的坚持，终将成就不凡的你' },
        { emoji: '🔥', title: '今日 250 题！', msg: '这份毅力，比知识本身更有价值' },
    ],
    300: [
        { emoji: '🚀', title: '今日 300 题！', msg: '三百题！势如破竹，无人能挡' },
        { emoji: '🚀', title: '今日 300 题！', msg: '当你回头看今天，会感谢此刻拼搏的自己' },
    ],
    350: [
        { emoji: '💎', title: '今日 350 题！', msg: '钻石般的意志力，注定不会平凡' },
        { emoji: '💎', title: '今日 350 题！', msg: '你在做的事，大多数人坚持不了' },
    ],
    400: [
        { emoji: '👑', title: '今日 400 题！', msg: '你的人生，由你自己定义' },
        { emoji: '👑', title: '今日 400 题！', msg: '四百题！只有真正热爱的人才能到达这里' },
    ],
    450: [
        { emoji: '⭐', title: '今日 450 题！', msg: '努力到无能为力，拼搏到感动自己' },
        { emoji: '⭐', title: '今日 450 题！', msg: '你已经证明了自己的决心和毅力' },
    ],
    500: [
        { emoji: '🏔️', title: '今日 500 题！', msg: '你正在攀登的高峰，终会成为脚下的平地' },
        { emoji: '🏔️', title: '今日 500 题！', msg: '半千之数，此刻的你正在书写属于自己的传奇' },
    ],
    550: [
        { emoji: '🔥', title: '今日 550 题！', msg: '你的努力终将照亮前方的路' },
        { emoji: '🔥', title: '今日 550 题！', msg: '距离巅峰只有一步之遥，不要停下' },
    ],
    600: [
        { emoji: '🏆', title: '今日 600 题！', msg: '六百题！今日之王！你的名字值得被记住' },
        { emoji: '🏆', title: '今日 600 题！', msg: '这一刻，你就是最好的自己' },
    ],
};

const DAILY_QUOTES = [
    // === 经典哲理 ===
    '当你能够意识到自己需要变强，才是变强的开始',
    '种一棵树最好的时间是十年前，其次是现在',
    '不积跬步，无以至千里',
    '日拱一卒，功不唐捐',
    '千里之行，始于足下',
    '学而不思则罔，思而不学则殆',
    '知之为知之，不知为不知，是知也',
    '三人行，必有我师焉',
    '温故而知新，可以为师矣',
    '业精于勤，荒于嬉；行成于思，毁于随',
    '书山有路勤为径，学海无涯苦作舟',
    '宝剑锋从磨砺出，梅花香自苦寒来',
    '锲而不舍，金石可镂',
    '天行健，君子以自强不息',
    '路漫漫其修远兮，吾将上下而求索',
    '合抱之木，生于毫末；九层之台，起于累土',
    '知者不惑，仁者不忧，勇者不惧',
    '工欲善其事，必先利其器',
    '玉不琢，不成器；人不学，不知道',
    '逆水行舟，不进则退',
    '少壮不努力，老大徒伤悲',
    '黑发不知勤学早，白首方悔读书迟',
    '纸上得来终觉浅，绝知此事要躬行',
    '读书百遍，其义自见',
    '学无止境',
    '绳锯木断，水滴石穿',
    '志当存高远',
    '天生我材必有用',
    '长风破浪会有时，直挂云帆济沧海',
    '故天将降大任于斯人也，必先苦其心志',
    '穷则独善其身，达则兼济天下',
    '不经一番寒彻骨，怎得梅花扑鼻香',
    '读万卷书，行万里路',
    '功崇惟志，业广惟勤',
    '博学之，审问之，慎思之，明辨之，笃行之',
    '学如逆水行舟，不进则退',

    // === 坚持与毅力 ===
    '今天的刻苦学习，是为了明天的从容不迫',
    '你所浪费的今天，是昨天逝去之人奢望的明天',
    '真正的对手只有一个，就是昨天的自己',
    '所有让你痛苦的事情，最终都会让你变强',
    '知道不等于做到，做到不等于做好',
    '你现在的努力，是在为未来的自己铺路',
    '优秀不是一种行为，而是一种习惯',
    '当你觉得为时已晚的时候，恰恰是最早的时候',
    '每一个不曾起舞的日子，都是对生命的辜负',
    '星光不负赶路人，时光不负有心人',
    '越是黑暗的地方，越需要点亮自己',
    '成功不是终点，失败也不是终结，唯有继续前行的勇气才重要',
    '没有哪条路是白走的，每一步都算数',
    '你必须非常努力，才能看起来毫不费力',
    '比你优秀的人比你还努力，你有什么资格不努力',
    '今天的坚持就是明天的收获',
    '别在最该奋斗的年纪选择了安逸',
    '最怕你一生碌碌无为，还安慰自己平凡可贵',
    '你的努力或许暂时看不到结果，但不要气馁，你不是没有成长，而是在扎根',
    '梦想不会逃跑，逃跑的永远是自己',
    '所谓天才，只不过是把别人喝咖啡的功夫用在了刻苦学习上',
    '不要等到明天，因为明天的你一定会感谢今天的自己',
    '生活不会因为你是女生就对你网开一面，也不会因为你是男生就多给你一次机会',
    '世上无难事，只要肯登攀',
    '哪有什么天生如此，只是我们天天坚持',
    '自律者自由，自信者自强',
    '成功的秘诀在于坚持自己的目标和信念',
    '只有经历过地狱般的磨炼，才能拥有创造天堂的力量',
    '不怕万人阻挡，只怕自己投降',
    '越努力，越幸运',
    '把每一天都当作新的起点',
    '你可以不成功，但你不能不成长',
    '一个人的坚持，是这个世界上最温柔的力量',
    '行动是治愈焦虑的良药',
    '不要用战术上的勤奋掩盖战略上的懒惰',
    '磨刀不误砍柴工',
    '熬过去，一切都会好起来的',
    '先做好该做的事，再做想做的事',

    // === 自我提升 ===
    '每天进步一点点，一年就是巨大的改变',
    '你不能控制天气，但你可以改变心情',
    '与其羡慕别人，不如成为更好的自己',
    '你的时间有限，不要浪费在别人的生活里',
    '做自己人生的主角，而不是别人故事的配角',
    '真正的强大是内心的强大',
    '知识改变命运，学习成就未来',
    '人生没有太晚的开始',
    '不要害怕失败，害怕的是你从未尝试',
    '你未必出类拔萃，但一定与众不同',
    '今天的汗水，是明天的勋章',
    '成长就是把不可能变成可能的过程',
    '没有人可以回到过去重新开始，但每个人都可以从现在开始创造新的结局',
    '你的潜力远比你想象的大',
    '弱者才会抱怨，强者只会行动',
    '唯有变得强大，才能保护自己想保护的人',
    '你不必很厉害才能开始，但你需要开始才能变得很厉害',
    '学习这件事不在乎有没有人教你，最重要的是你自己有没有觉悟',
    '聪明在于勤奋，天才在于积累',
    '吾生也有涯，而知也无涯',
    '人生在勤，不索何获',
    '才华是刀刃，辛苦是磨刀石',
    '成功的花，人们只惊慕她现时的明艳，然而它当初的芽儿浸透了奋斗的泪泉',
    '一分耕耘，一分收获',
    '命运给你一个比别人低的起点，是想告诉你，用你的一生去奋斗出一个绝地反击的故事',
    '失败是成功之母',
    '有志者事竟成',
    '所有的努力，都不会被辜负',
    '比昨天更好，就是最大的进步',
    '把时间花在进步上，而不是抱怨上',
    '困难就像弹簧，你强它就弱，你弱它就强',
    '世界上最可怕的不是别人比你聪明，而是别人比你聪明还比你努力',

    // === 学习与考试 ===
    '每一道题都是一次与知识的对话',
    '做题不是目的，掌握知识才是',
    '错了不要紧，下次做对就好',
    '重复是学习之母',
    '把不会的变成会的，就是最大的进步',
    '基础决定高度，细节决定成败',
    '考试不难，难的是你不开始准备',
    '学习的痛苦是暂时的，不学习的痛苦是终身的',
    '做一道题就有一道题的收获',
    '今天多做一道题，考试多拿一分',
    '熟能生巧，练习是最好的老师',
    '不怕题目难，就怕不去练',
    '错题是最好的老师，它告诉你哪里还不足',
    '每次复习都是一次加固记忆的过程',
    '把知识点连成线，把线织成网',
    '理解比记忆更重要，思考比刷题更有效',
    '刻苦学习的甜头，考试的时候就能尝到',
    '备考就像跑马拉松，拼的不是速度而是耐力',
    '方法对了，事半功倍',
    '及时复习，巩固记忆，超越遗忘曲线',
    '把厚书读薄，再把薄书读厚',
    '考试考的不仅是知识，还有心态',
    '学会归纳总结，才能举一反三',
    '先理解，再记忆，最后应用',
    '不要只做容易的题，突破舒适区才能进步',
    '学而时习之，不亦说乎',

    // === 心态与格局 ===
    '心若向阳，何惧忧伤',
    '微笑面对，乐观前行',
    '把压力变成动力，把困难变成机遇',
    '你怎么看待这个世界，世界就怎么对待你',
    '格局决定结局，态度决定高度',
    '与其担忧未来，不如珍惜当下',
    '人生没有白走的路，没有白吃的苦',
    '今天很残酷，明天更残酷，后天很美好',
    '生活就像海洋，只有意志坚强的人才能到达彼岸',
    '不抛弃，不放弃',
    '相信自己，你比想象中更强大',
    '选择大于努力，但努力决定下限',
    '人生就是一场与自己的较量',
    '你的气质里，藏着你走过的路、读过的书',
    '做最好的自己，让时间证明一切',
    '静下心来，做该做的事',
    '没有到不了的远方，只有不愿出发的自己',
    '你改变不了环境，但你可以改变态度',
    '少一些抱怨，多一些行动',
    '别为打翻的牛奶哭泣，专注于下一杯',
    '保持饥饿，保持愚蠢，保持前行',
    '任何值得做的事情，都值得把它做好',
    '把注意力放在能改变的事情上',
    '你不是没有时间，你只是没有用心',
    '专注当下，全力以赴',

    // === 名人名言 ===
    '天才是百分之一的灵感加百分之九十九的汗水',
    '知识就是力量',
    '我思故我在',
    '生命不息，奋斗不止',
    '世上没有绝望的处境，只有对处境绝望的人',
    '成功是给有准备的人的',
    '没有比脚更长的路，没有比人更高的山',
    '最好的时光在路上',
    '生命中最重要的事情不是站在什么地方，而是朝什么方向走',
    '人的一切痛苦，本质上都是对自己无能的愤怒',
    '活着就是为了改变世界',
    '简单的事情重复做，你就是专家',
    '不要因为走得太远，而忘记了为什么出发',
    '真正的勇气不是不害怕，而是害怕的时候依然坚持前行',
    '永远不要低估一颗冠军的心',
    '你可以输给任何人，但不能输给自己',
    '站在巨人的肩膀上，看得更远',
    '一万小时定律：任何领域的专家都需要一万小时的刻意练习',
    '不要小看每一天的积累，复利效应会让你惊叹',
    '昨天的太阳晒不干今天的衣裳',

    // === 激励短句 ===
    '干就完了',
    '你可以的',
    '再坚持一下',
    '永远不要放弃',
    '相信过程',
    '保持专注',
    '全力以赴',
    '无畏前行',
    '向着光，靠近光，成为光',
    '乾坤未定，你我皆是黑马',
    '既然选择了远方，便只顾风雨兼程',
    '愿你走出半生，归来仍是少年',
    '苦心人天不负',
    '慢慢来，比较快',
    '沉淀自己，厚积薄发',
    '宁可辛苦一阵子，也不辛苦一辈子',
    '让优秀成为一种习惯',
    '没有伞的孩子，必须努力奔跑',
    '你若盛开，蝴蝶自来',
    '机会是留给有准备的人的',
    '踏踏实实走好每一步',
    '只要功夫深，铁杵磨成针',
    '你走过的每一步都算数',
    '忍一时风平浪静，退一步海阔天空——但学习上，进一步才是出路',
    '稳住心态，拿下考试',
    '咬定青山不放松',
    '不鸣则已，一鸣惊人',
    '厚德载物',
    '海纳百川，有容乃大',
    '生于忧患，死于安乐',
    '满招损，谦受益',
    '敏而好学，不耻下问',
    '学然后知不足',
    '见贤思齐',
    '己所不欲，勿施于人',
    '有志者，事竟成，破釜沉舟，百二秦关终属楚',
    '苦心人，天不负，卧薪尝胆，三千越甲可吞吴',
    '凡是过往，皆为序章',
    '但行好事，莫问前程',
    '尽人事，听天命',
    '事在人为',
    '笨鸟先飞早入林',
    '勤能补拙是良训',
    '一寸光阴一寸金',
    '莫等闲，白了少年头，空悲切',
    '好记性不如烂笔头',
    '问渠那得清如许，为有源头活水来',
    '纸上谈兵终觉浅，投身实践方为真',
    '水至清则无鱼，人至察则无徒',
    '知己知彼，百战不殆',
    '今日事，今日毕',
    '明日复明日，明日何其多',
    '吃得苦中苦，方为人上人',
    '拼搏到感动自己',
    '愿你的努力配得上你的野心',
    '你的未来取决于你现在做了什么',
    '别人笑我太疯癫，我笑他人看不穿',
    '三十年河东，三十年河西，莫欺少年穷',
    '成事在人，谋事在天',
    '不经历风雨，怎能见彩虹',
    '阳光总在风雨后',
    '冬天来了，春天还会远吗',
    '黎明前的黑暗最难熬，但坚持住就是胜利',
    '你永远不知道自己有多强大，直到强大成为你唯一的选择',
    '痛苦是暂时的，荣耀是永恒的',
    '你不勇敢，没人替你坚强',
    '只有自己足够强大，才不会被别人践踏',
    '困难和挫折是通向成功的阶梯',
    '每一次选择都在塑造未来的你',
    '把有限的时间用在无限的学习上',
    '你的每一滴汗水，都会浇灌出成功的花朵',
    '所有的积累都会在某一刻爆发',
    '你就是你最大的资本，投资自己永远不亏',
];

const EXAM_COMMENTS = {
    '90': [
        '这份实力，足以征服任何考试',
        '你已经站在了金字塔的顶端',
        '所有的付出，都在这一刻得到了最好的回报',
    ],
    '80': [
        '距离完美只差一步，那一步叫做细节',
        '优秀不是终点，卓越才是目标',
        '你的实力已经毋庸置疑',
    ],
    '70': [
        '方向对了，只需要更多的打磨',
        '潜力已经展现，突破只是时间问题',
        '再往前一步，你就是优秀',
    ],
    '60': [
        '及格线上的你，离优秀并不远',
        '从这里开始发力，一切都来得及',
        '知道了差距在哪里，就知道了进步的方向',
    ],
    '40': [
        '认清差距，才是缩小差距的第一步',
        '最好的查漏补缺，就在此刻',
        '今天的失利，是明天逆袭的起点',
    ],
    '0': [
        '万丈高楼平地起，基础决定高度',
        '从零开始并不可怕，可怕的是从未开始',
        '每一个高手都曾是新手，他们只是没有放弃',
    ],
};

const WRONG_COMPLETE_MSGS = [
    { emoji: '🎉', title: '错题全部消灭！', msg: '征服了所有错题，你已经不是刚才的你了' },
    { emoji: '👏', title: '错题全部消灭！', msg: '每一道错题都被你踩在了脚下' },
    { emoji: '💪', title: '错题全部消灭！', msg: '从跌倒的地方站起来，这就是成长' },
    { emoji: '🌟', title: '错题全部消灭！', msg: '错题清零！你交上了一份完美的答卷' },
];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function showMilestoneBanner(emoji, title, msg, theme) {
    // Remove existing banner
    const existing = document.querySelector('.milestone-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = `milestone-overlay theme-${theme}`;
    overlay.innerHTML = `
        <div class="milestone-card">
            <div class="milestone-emoji">${emoji}</div>
            <div class="milestone-title">${title}</div>
            <div class="milestone-msg">${msg}</div>
        </div>
    `;

    overlay.addEventListener('click', () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
    });

    document.body.appendChild(overlay);

    setTimeout(() => {
        if (document.body.contains(overlay)) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 300);
        }
    }, 2500);
}

function checkMilestones(isCorrect, todayDone) {
    // Priority: wrong practice complete > streak > daily > wrong streak

    // 1. Wrong practice completion
    if (practiceMode === 'wrong' && practiceIndex === practiceQuestions.length - 1 && isAnswered) {
        const item = getRandomItem(WRONG_COMPLETE_MSGS);
        showMilestoneBanner(item.emoji, item.title, item.msg, 'complete');
        return true;
    }

    // 2. Streak milestones
    if (isCorrect && STREAK_MILESTONES[state.streak]) {
        const item = getRandomItem(STREAK_MILESTONES[state.streak]);
        showMilestoneBanner(item.emoji, item.title, item.msg, 'streak');
        return true;
    }

    // 3. Daily milestones
    if (DAILY_MILESTONES[todayDone]) {
        const item = getRandomItem(DAILY_MILESTONES[todayDone]);
        showMilestoneBanner(item.emoji, item.title, item.msg, 'daily');
        return true;
    }

    // 4. Wrong streak
    if (!isCorrect && WRONG_STREAK_MILESTONES[wrongStreak]) {
        const item = getRandomItem(WRONG_STREAK_MILESTONES[wrongStreak]);
        showMilestoneBanner(item.emoji, item.title, item.msg, 'encourage');
        return true;
    }

    return false;
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSearchbar();
    initResetButton();
    updateDashboard();
});

// ===== NAVIGATION =====
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            showPage(page);
        });
    });

    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    document.getElementById('sidebarClose').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageName).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (navItem) navItem.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');

    if (pageName === 'dashboard') updateDashboard();
    else if (pageName === 'practice') {
        // If no questions loaded, auto-start sequential practice
        if (practiceQuestions.length === 0) {
            practiceQuestions = [...QUESTIONS];
            practiceIndex = state.lastPosition || 0;
            practiceMode = 'sequential';
            document.getElementById('practiceType').textContent = '顺序练习';
            renderPracticeQuestion();
        }
    }
    else if (pageName === 'wrong') renderWrongList();
    else if (pageName === 'favorites') renderFavList();
    else if (pageName === 'stats') renderStats();
    else if (pageName === 'exam') resetExamView();
}

// ===== DASHBOARD =====
function updateDashboard() {
    const total = QUESTIONS.length;
    const doneCount = Object.keys(state.answered).length;
    const correctCount = Object.values(state.answered).filter(a => a.correct).length;
    const wrongCount = state.wrong.length;
    const favCount = state.favorites.length;
    const accuracy = doneCount > 0 ? Math.round((correctCount / doneCount) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statDone').textContent = `已做 ${doneCount} 题`;
    document.getElementById('statAccuracy').textContent = accuracy + '%';
    document.getElementById('statCorrectCount').textContent = `答对 ${correctCount} 题`;
    document.getElementById('statWrongCount').textContent = wrongCount;
    document.getElementById('statFavCount').textContent = favCount;

    const progress = Math.round((doneCount / total) * 100);
    document.getElementById('progressBar').style.width = progress + '%';
    document.getElementById('progressText').textContent = progress + '%';

    // Category counts
    const types = ['single', 'multi', 'judge'];
    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t);
        const typeDone = typeQs.filter(q => state.answered[q.id]).length;
        const el = document.getElementById('cat' + t.charAt(0).toUpperCase() + t.slice(1) + 'Done');
        if (el) el.textContent = typeDone;
    });

    document.getElementById('streakBadge').textContent = '🔥 ' + state.streak;

    // Daily Greeting
    const greetingEl = document.getElementById('dailyGreeting');
    if (greetingEl) {
        const hour = new Date().getHours();
        let greeting, greetIcon;
        if (hour >= 6 && hour < 12) { greeting = '早安！'; greetIcon = '☀️'; }
        else if (hour >= 12 && hour < 18) { greeting = '下午好！'; greetIcon = '🌤️'; }
        else if (hour >= 18 && hour < 24) { greeting = '晚上好！'; greetIcon = '🌙'; }
        else { greeting = '夜深了，注意休息'; greetIcon = '🌃'; }

        // Use date as seed for consistent daily quote
        const today = new Date().toISOString().slice(0, 10);
        const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
        const quote = DAILY_QUOTES[seed % DAILY_QUOTES.length];

        const todayStats = state.dailyStats[today] || { done: 0, correct: 0 };
        const todayAcc = todayStats.done > 0 ? Math.round((todayStats.correct / todayStats.done) * 100) : 0;

        greetingEl.innerHTML = `
            <div class="greeting-icon">${greetIcon}</div>
            <div class="greeting-content">
                <div class="greeting-text">${greeting}</div>
                <div class="greeting-quote">"${quote}"</div>
                <div class="greeting-stats">📊 今日已做 ${todayStats.done} 题${todayStats.done > 0 ? ` · 正确率 ${todayAcc}%` : ''}</div>
            </div>
        `;
    }
}

// ===== PRACTICE MODE =====
function startPractice(type, mode = 'sequential') {
    let qs = [...QUESTIONS];
    if (type !== 'all') {
        qs = qs.filter(q => q.type === type);
    }
    if (mode === 'random') {
        shuffleArray(qs);
    }
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = mode === 'random' ? 'random' : 'sequential';

    const typeNames = { 'all': '全部题目', 'single': '单项选择题', 'multi': '多项选择题', 'judge': '判断题' };
    document.getElementById('practiceType').textContent = (typeNames[type] || '练习') + (mode === 'random' ? ' · 随机' : '');

    showPage('practice');
    renderPracticeQuestion();
}

function continuePractice() {
    practiceQuestions = [...QUESTIONS];
    practiceIndex = state.lastPosition || 0;
    practiceMode = 'sequential';
    document.getElementById('practiceType').textContent = '继续刷题';
    showPage('practice');
    renderPracticeQuestion();
}

function startWrongPractice() {
    if (state.wrong.length === 0) {
        showPage('wrong');
        return;
    }
    const qs = state.wrong.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    shuffleArray(qs);
    // Clear previous answers so users can re-do the questions
    qs.forEach(q => {
        delete state.answered[q.id];
    });
    saveState();
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = 'wrong';
    document.getElementById('practiceType').textContent = '错题重练';
    showPage('practice');
    renderPracticeQuestion();
}

function startFavPractice() {
    if (state.favorites.length === 0) return;
    const qs = state.favorites.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    practiceQuestions = qs;
    practiceIndex = 0;
    practiceMode = 'favorites';
    document.getElementById('practiceType').textContent = '收藏练习';
    showPage('practice');
    renderPracticeQuestion();
}

function renderPracticeQuestion() {
    if (practiceQuestions.length === 0) return;
    const q = practiceQuestions[practiceIndex];
    selectedOptions = new Set();
    isAnswered = !!state.answered[q.id];
    highlightedOptionIndex = -1;

    document.getElementById('practiceProgress').textContent =
        `${practiceIndex + 1} / ${practiceQuestions.length}`;

    const typeLabels = { single: '单选题', multi: '多选题', judge: '判断题' };
    document.getElementById('qTypeBadge').textContent = typeLabels[q.type] || q.type;
    document.getElementById('qText').textContent = q.question;

    // Render options
    const optList = document.getElementById('optionsList');
    optList.innerHTML = '';
    if (q.type === 'judge') {
        // Filter out empty "/" placeholder options for judge questions
        const judgeOpts = q.options.filter(opt => opt.text && opt.text.trim() !== '/' && opt.text.trim() !== '');
        judgeOpts.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'option-item';
            div.dataset.key = opt.key;
            div.innerHTML = `
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
            `;
            div.addEventListener('click', () => selectOption(opt.key, q));
            optList.appendChild(div);
        });
    } else {
        optList.classList.remove('judge-options');
        q.options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'option-item';
            div.dataset.key = opt.key;
            div.innerHTML = `
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
            `;
            div.addEventListener('click', () => selectOption(opt.key, q));
            optList.appendChild(div);
        });
    }

    // If already answered, show result
    if (isAnswered) {
        const record = state.answered[q.id];
        selectedOptions = new Set(record.selected.split(''));
        showResult(q, record.correct);
    }

    // Result section
    document.getElementById('qResult').style.display = isAnswered ? 'block' : 'none';

    // Fav button
    updateFavButton(q.id);

    // Nav buttons
    document.getElementById('btnPrev').disabled = practiceIndex === 0;
    document.getElementById('btnSubmit').style.display = isAnswered ? 'none' : 'block';

    // Save position
    if (practiceMode === 'sequential' && practiceMode !== 'wrong') {
        state.lastPosition = practiceIndex;
        saveState();
    }

    // Update practice quote (rotates every 5 questions)
    const quoteEl = document.getElementById('practiceQuote');
    if (quoteEl) {
        const quoteIndex = Math.floor(practiceIndex / 5) % DAILY_QUOTES.length;
        quoteEl.textContent = DAILY_QUOTES[quoteIndex];
    }
}

function selectOption(key, q, fromTouch = false) {
    if (isAnswered) return;

    if (q.type === 'multi') {
        if (selectedOptions.has(key)) {
            selectedOptions.delete(key);
        } else {
            selectedOptions.add(key);
        }
    } else {
        selectedOptions.clear();
        selectedOptions.add(key);
    }

    // Update highlighted index
    const q2 = practiceQuestions[practiceIndex];
    if (q2) {
        highlightedOptionIndex = q2.options.findIndex(o => o.key === key);
    }

    // Update UI
    document.querySelectorAll('#optionsList .option-item').forEach(el => {
        el.classList.toggle('selected', selectedOptions.has(el.dataset.key));
    });
    updateHighlightUI();

    // Auto-submit for single-choice/judge on actual touch interactions only
    if (lastInteractionWasTouch && q.type !== 'multi' && selectedOptions.size > 0) {
        setTimeout(() => submitAnswer(), 150);
    }
}

function submitAnswer() {
    if (selectedOptions.size === 0 || isAnswered) return;

    const q = practiceQuestions[practiceIndex];
    const selected = Array.from(selectedOptions).sort().join('');
    const correctAnswer = q.answer.split('').sort().join('');
    const isCorrect = selected === correctAnswer;

    // Record answer
    state.answered[q.id] = { selected, correct: isCorrect };

    // Update wrong list & streaks
    if (!isCorrect) {
        if (!state.wrong.includes(q.id)) state.wrong.push(q.id);
        state.streak = 0;
        wrongStreak++;
    } else {
        state.wrong = state.wrong.filter(id => id !== q.id);
        state.streak++;
        wrongStreak = 0;
    }

    // Daily stats
    const today = new Date().toISOString().slice(0, 10);
    if (!state.dailyStats[today]) state.dailyStats[today] = { done: 0, correct: 0 };
    state.dailyStats[today].done++;
    if (isCorrect) state.dailyStats[today].correct++;

    saveState();
    isAnswered = true;

    showResult(q, isCorrect);
    document.getElementById('btnSubmit').style.display = 'none';
    document.getElementById('streakBadge').textContent = '🔥 ' + state.streak;

    // Check milestones (after a short delay so the result animation shows first)
    setTimeout(() => {
        checkMilestones(isCorrect, state.dailyStats[today].done);
    }, 500);

    // Auto-advance to next question if correct
    if (isCorrect && practiceIndex < practiceQuestions.length - 1) {
        setTimeout(() => {
            // Wait for milestone banner to dismiss before advancing
            const tryAdvance = () => {
                if (document.querySelector('.milestone-overlay')) {
                    setTimeout(tryAdvance, 500);
                    return;
                }
                if (isAnswered && practiceQuestions[practiceIndex]?.id === q.id) {
                    nextQuestion();
                }
            };
            tryAdvance();
        }, 1000);
    }
}

function showResult(q, isCorrect) {
    const resultDiv = document.getElementById('qResult');
    resultDiv.style.display = 'block';

    document.getElementById('resultIcon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('resultText').textContent = isCorrect ? '回答正确！' : '回答错误';
    document.getElementById('resultAnswer').textContent = '正确答案：' + q.answer;
    document.getElementById('resultAnalysis').textContent = q.analysis ? '解析：' + q.analysis : '';
    document.getElementById('resultAnalysis').style.display = q.analysis ? 'block' : 'none';

    // Highlight options
    const answerKeys = new Set(q.answer.split(''));
    document.querySelectorAll('#optionsList .option-item').forEach(el => {
        const key = el.dataset.key;
        el.classList.remove('selected');
        if (answerKeys.has(key)) {
            el.classList.add('correct');
        } else if (selectedOptions.has(key)) {
            el.classList.add('wrong');
        }
    });
}

function prevQuestion() {
    if (practiceIndex > 0) {
        practiceIndex--;
        renderPracticeQuestion();
    }
}

function nextQuestion() {
    if (practiceIndex < practiceQuestions.length - 1) {
        practiceIndex++;
        renderPracticeQuestion();
    }
}

// ===== ANSWER CARD =====
function showAnswerCard() {
    const grid = document.getElementById('answerCardGrid');
    grid.innerHTML = '';
    practiceQuestions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.textContent = i + 1;
        if (i === practiceIndex) div.classList.add('ac-current');
        else if (state.answered[q.id]) {
            div.classList.add(state.answered[q.id].correct ? 'ac-correct' : 'ac-wrong');
        }
        div.addEventListener('click', () => {
            practiceIndex = i;
            renderPracticeQuestion();
            closeModal('answerCardModal');
        });
        grid.appendChild(div);
    });
    document.getElementById('answerCardModal').style.display = 'flex';
}

function showExamCard() {
    const grid = document.getElementById('answerCardGrid');
    grid.innerHTML = '';
    examQuestions.forEach((q, i) => {
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.textContent = i + 1;
        if (i === examIndex) div.classList.add('ac-current');
        else if (examAnswers[i] && examAnswers[i].size > 0) div.classList.add('ac-answered');
        div.addEventListener('click', () => {
            examIndex = i;
            renderExamQuestion();
            closeModal('answerCardModal');
        });
        grid.appendChild(div);
    });
    document.getElementById('answerCardModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Click outside to close
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

// ===== FAVORITES =====
function toggleFavorite() {
    const q = practiceQuestions[practiceIndex];
    if (!q) return;
    const idx = state.favorites.indexOf(q.id);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.push(q.id);
    }
    saveState();
    updateFavButton(q.id);
}

function updateFavButton(qId) {
    const btn = document.getElementById('btnFav');
    const isFav = state.favorites.includes(qId);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('favorited', isFav);
}

// ===== WRONG LIST =====
function renderWrongList() {
    const list = document.getElementById('wrongList');
    document.getElementById('wrongCount').textContent = state.wrong.length + ' 题';

    if (state.wrong.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">暂无错题，继续保持！</div></div>';
        return;
    }

    list.innerHTML = '';
    state.wrong.forEach(id => {
        const q = QUESTIONS.find(qq => qq.id === id);
        if (!q) return;
        list.appendChild(createListItem(q, () => jumpToQuestion(q)));
    });
}

function clearWrong() {
    if (confirm('确定清空错题本？')) {
        state.wrong = [];
        saveState();
        renderWrongList();
    }
}

// ===== FAVORITES LIST =====
function renderFavList() {
    const list = document.getElementById('favList');
    document.getElementById('favCount').textContent = state.favorites.length + ' 题';

    if (state.favorites.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-text">暂无收藏题目</div></div>';
        return;
    }

    list.innerHTML = '';
    state.favorites.forEach(id => {
        const q = QUESTIONS.find(qq => qq.id === id);
        if (!q) return;
        list.appendChild(createListItem(q, () => jumpToQuestion(q)));
    });
}

function createListItem(q, onClick) {
    const div = document.createElement('div');
    div.className = 'q-list-item';
    div.innerHTML = `
        <span class="q-list-id">${q.id}</span>
        <div class="q-list-content">
            <div class="q-list-text">${q.question}</div>
            <div class="q-list-meta">
                <span class="q-list-tag ${q.type}">${q.typeName}</span>
            </div>
        </div>
    `;
    div.addEventListener('click', onClick);
    return div;
}

function jumpToQuestion(q) {
    practiceQuestions = [q];
    practiceIndex = 0;
    practiceMode = 'single-view';
    document.getElementById('practiceType').textContent = '查看题目';
    showPage('practice');
    renderPracticeQuestion();
}

// ===== SEARCH =====
function initSearchbar() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function doSearch() {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) return;

    const results = QUESTIONS.filter(q =>
        q.question.includes(keyword) ||
        q.options.some(o => o.text.includes(keyword))
    );

    document.getElementById('searchCount').textContent = results.length + ' 条结果';
    const list = document.getElementById('searchList');
    list.innerHTML = '';

    if (results.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">未找到匹配的题目</div></div>';
    } else {
        results.slice(0, 100).forEach(q => {
            list.appendChild(createListItem(q, () => {
                // Start practice with search results
                practiceQuestions = results;
                practiceIndex = results.indexOf(q);
                practiceMode = 'search';
                document.getElementById('practiceType').textContent = '搜索结果';
                showPage('practice');
                renderPracticeQuestion();
            }));
        });
    }

    showPage('search');
}

// ===== EXAM MODE =====
function resetExamView() {
    document.getElementById('examSetup').style.display = 'block';
    document.getElementById('examProgress').style.display = 'none';
    document.getElementById('examResult').style.display = 'none';
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    renderExamHistory();
}

function startExam() {
    // Fixed exam structure: 60 single + 60 multi + 20 judge
    const singlePool = QUESTIONS.filter(q => q.type === 'single');
    const multiPool = QUESTIONS.filter(q => q.type === 'multi');
    const judgePool = QUESTIONS.filter(q => q.type === 'judge');

    shuffleArray(singlePool);
    shuffleArray(multiPool);
    shuffleArray(judgePool);

    const singleQs = singlePool.slice(0, examConfig.singleCount);
    const multiQs = multiPool.slice(0, examConfig.multiCount);
    const judgeQs = judgePool.slice(0, examConfig.judgeCount);

    examQuestions = [...singleQs, ...multiQs, ...judgeQs];
    examIndex = 0;
    examAnswers = {};
    examStartTime = Date.now();

    // Timer - fixed 90 minutes
    examTimeLeft = examConfig.time * 60;
    updateTimerDisplay();
    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(() => {
        examTimeLeft--;
        updateTimerDisplay();
        if (examTimeLeft <= 0) {
            clearInterval(examTimer);
            finishExam();
        }
    }, 1000);

    // Show exam
    document.getElementById('examSetup').style.display = 'none';
    document.getElementById('examProgress').style.display = 'block';
    document.getElementById('examResult').style.display = 'none';
    renderExamQuestion();
}

function updateTimerDisplay() {
    const m = Math.floor(examTimeLeft / 60);
    const s = examTimeLeft % 60;
    const display = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    document.getElementById('examTimer').textContent = display;
    if (examTimeLeft < 60) {
        document.getElementById('examTimer').style.color = 'var(--red)';
    } else {
        document.getElementById('examTimer').style.color = 'var(--yellow)';
    }
}

function renderExamQuestion() {
    const q = examQuestions[examIndex];
    examHighlightedOptionIndex = -1;  // reset highlight on question change
    document.getElementById('examCount').textContent = `${examIndex + 1}/${examQuestions.length}`;

    const typeLabels = { single: '单选题', multi: '多选题', judge: '判断题' };
    document.getElementById('examQTypeBadge').textContent = typeLabels[q.type] || q.type;
    document.getElementById('examQText').textContent = q.question;

    const optList = document.getElementById('examOptionsList');
    optList.innerHTML = '';

    const currentAns = examAnswers[examIndex] || new Set();

    if (q.type === 'judge') {
        // Filter out empty "/" placeholder options for judge questions
        const judgeExamOpts = q.options.filter(opt => opt.text && opt.text.trim() !== '/' && opt.text.trim() !== '');
        judgeExamOpts.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'option-item' + (currentAns.has(opt.key) ? ' selected' : '');
            div.dataset.key = opt.key;
            div.innerHTML = `
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
            `;
            div.addEventListener('click', () => {
                selectExamOption(opt.key);
            });
            optList.appendChild(div);
        });
    } else {
        optList.classList.remove('judge-options');
        q.options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'option-item' + (currentAns.has(opt.key) ? ' selected' : '');
            div.dataset.key = opt.key;
            div.innerHTML = `
                <span class="option-key">${opt.key}</span>
                <span class="option-text">${opt.text}</span>
            `;
            div.addEventListener('click', () => {
                selectExamOption(opt.key);
            });
            optList.appendChild(div);
        });
    }
}

function selectExamOption(key) {
    const q = examQuestions[examIndex];
    if (!q) return;
    if (!examAnswers[examIndex]) examAnswers[examIndex] = new Set();
    if (q.type === 'multi') {
        if (examAnswers[examIndex].has(key)) {
            examAnswers[examIndex].delete(key);
        } else {
            examAnswers[examIndex].add(key);
        }
    } else {
        examAnswers[examIndex] = new Set([key]);
    }
    // Update highlighted index
    examHighlightedOptionIndex = q.options.findIndex(o => o.key === key);
    // Update UI
    const optList = document.getElementById('examOptionsList');
    optList.querySelectorAll('.option-item').forEach((el, i) => {
        el.classList.toggle('selected', examAnswers[examIndex].has(el.dataset.key));
        el.classList.toggle('highlighted', i === examHighlightedOptionIndex);
    });
}

function examPrev() {
    if (examIndex > 0) { examIndex--; renderExamQuestion(); }
}
function examNext() {
    if (examIndex < examQuestions.length - 1) { examIndex++; renderExamQuestion(); }
}

function finishExam() {
    if (!confirm('确定交卷？')) return;
    if (examTimer) { clearInterval(examTimer); examTimer = null; }

    let correct = 0, wrong = 0, skipped = 0;
    let singleCorrect = 0, singleTotal = 0;
    let multiCorrect = 0, multiTotal = 0;
    let judgeCorrect = 0, judgeTotal = 0;
    const usedTime = Math.round((Date.now() - examStartTime) / 1000);

    examQuestions.forEach((q, i) => {
        // Count by type
        if (q.type === 'single') singleTotal++;
        else if (q.type === 'multi') multiTotal++;
        else if (q.type === 'judge') judgeTotal++;

        const ans = examAnswers[i];
        if (!ans || ans.size === 0) {
            skipped++;
            return;
        }
        const selected = Array.from(ans).sort().join('');
        const correctAns = q.answer.split('').sort().join('');
        if (selected === correctAns) {
            correct++;
            if (q.type === 'single') singleCorrect++;
            else if (q.type === 'multi') multiCorrect++;
            else if (q.type === 'judge') judgeCorrect++;
            // Also record in global state
            state.answered[q.id] = { selected, correct: true };
            state.wrong = state.wrong.filter(id => id !== q.id);
        } else {
            wrong++;
            state.answered[q.id] = { selected, correct: false };
            if (!state.wrong.includes(q.id)) state.wrong.push(q.id);
        }

        // Daily stats
        const today = new Date().toISOString().slice(0, 10);
        if (!state.dailyStats[today]) state.dailyStats[today] = { done: 0, correct: 0 };
        state.dailyStats[today].done++;
        if (selected === correctAns) state.dailyStats[today].correct++;
    });

    // Calculate score: single 0.5pt, multi 1pt, judge 0.5pt
    const singleScore = singleCorrect * 0.5;
    const multiScore = multiCorrect * 1;
    const judgeScore = judgeCorrect * 0.5;
    const totalScore = singleScore + multiScore + judgeScore;
    const maxScore = 100; // 30 + 60 + 10

    // Save exam result to history (including question IDs and user answers for later review)
    const questionIds = examQuestions.map(q => q.id);
    const savedAnswers = {};
    examQuestions.forEach((q, i) => {
        const ans = examAnswers[i];
        if (ans && ans.size > 0) {
            savedAnswers[i] = Array.from(ans).sort().join('');
        }
    });

    const examRecord = {
        date: new Date().toISOString(),
        score: totalScore,
        maxScore: maxScore,
        singleCorrect, singleTotal,
        multiCorrect, multiTotal,
        judgeCorrect, judgeTotal,
        usedTime,
        totalQuestions: examQuestions.length,
        correctCount: correct,
        wrongCount: wrong,
        skippedCount: skipped,
        questionIds: questionIds,
        userAnswers: savedAnswers
    };
    if (!state.examHistory) state.examHistory = [];
    state.examHistory.unshift(examRecord); // newest first
    // Keep max 50 records
    if (state.examHistory.length > 50) state.examHistory = state.examHistory.slice(0, 50);

    saveState();

    // Show result
    const totalQ = examQuestions.length;
    const scorePercent = Math.round((totalScore / maxScore) * 100);
    document.getElementById('examProgress').style.display = 'none';
    document.getElementById('examResult').style.display = 'block';

    document.getElementById('scoreValue').textContent = totalScore;
    document.getElementById('examTotalQ').textContent = totalQ;
    document.getElementById('examCorrectQ').textContent = correct;
    document.getElementById('examWrongQ').textContent = wrong;
    document.getElementById('examSkipQ').textContent = skipped;

    // Score breakdown by type
    document.getElementById('scoreSingle').textContent = `${singleCorrect}/${singleTotal} · ${singleScore}分`;
    document.getElementById('scoreMulti').textContent = `${multiCorrect}/${multiTotal} · ${multiScore}分`;
    document.getElementById('scoreJudge').textContent = `${judgeCorrect}/${judgeTotal} · ${judgeScore}分`;

    const mins = Math.floor(usedTime / 60);
    const secs = usedTime % 60;
    document.getElementById('examUsedTime').textContent = `${mins}分${secs}秒`;

    // Exam comment based on score
    const examCommentEl = document.getElementById('examComment');
    if (examCommentEl) {
        let commentGroup;
        if (totalScore >= 90) commentGroup = EXAM_COMMENTS['90'];
        else if (totalScore >= 80) commentGroup = EXAM_COMMENTS['80'];
        else if (totalScore >= 70) commentGroup = EXAM_COMMENTS['70'];
        else if (totalScore >= 60) commentGroup = EXAM_COMMENTS['60'];
        else if (totalScore >= 40) commentGroup = EXAM_COMMENTS['40'];
        else commentGroup = EXAM_COMMENTS['0'];
        const comment = getRandomItem(commentGroup);
        examCommentEl.textContent = comment;
        examCommentEl.className = `exam-comment ${totalScore >= 60 ? 'pass' : 'fail'}`;
    }

    // Animate score circle
    const circle = document.getElementById('scoreCircle');
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (scorePercent / 100) * circumference;
    // Add gradient to SVG
    const svg = circle.closest('svg');
    if (!svg.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.id = 'scoreGradient';
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#6366f1');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#06b6d4');
        grad.appendChild(s1); grad.appendChild(s2);
        defs.appendChild(grad);
        svg.insertBefore(defs, svg.firstChild);
    }
    circle.style.stroke = 'url(#scoreGradient)';
    requestAnimationFrame(() => {
        circle.style.strokeDashoffset = offset;
    });
}

// ===== EXAM HISTORY =====
function renderExamHistory() {
    const list = document.getElementById('examHistoryList');
    if (!list) return;

    const history = state.examHistory || [];
    if (history.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">暂无考试记录</div></div>';
        return;
    }

    list.innerHTML = '';
    history.forEach((record, idx) => {
        const d = new Date(record.date);
        const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        const mins = Math.floor(record.usedTime / 60);
        const secs = record.usedTime % 60;
        const passClass = record.score >= 60 ? 'pass' : 'fail';
        const hasDetail = record.questionIds && record.questionIds.length > 0;

        const div = document.createElement('div');
        div.className = `exam-history-item ${passClass}`;
        div.innerHTML = `
            <div class="eh-header">
                <span class="eh-date">${dateStr}</span>
                <span class="eh-score ${passClass}">${record.score}分</span>
            </div>
            <div class="eh-details">
                <span>单选 ${record.singleCorrect}/${record.singleTotal}</span>
                <span>多选 ${record.multiCorrect}/${record.multiTotal}</span>
                <span>判断 ${record.judgeCorrect}/${record.judgeTotal}</span>
                <span>用时 ${mins}分${secs}秒</span>
            </div>
            ${hasDetail ? `<div class="eh-actions">
                <button class="eh-btn" onclick="viewHistoryExam(${idx}, 'all')">📖 查看全部</button>
                <button class="eh-btn eh-btn-wrong" onclick="viewHistoryExam(${idx}, 'wrong')">❌ 只看错题</button>
            </div>` : '<div class="eh-note">无详细记录</div>'}
        `;
        list.appendChild(div);
    });
}

function reviewExam() {
    // Show exam questions in practice mode with answers revealed
    practiceQuestions = [...examQuestions];
    practiceIndex = 0;
    practiceMode = 'exam-review';
    document.getElementById('practiceType').textContent = '考试回顾';
    showPage('practice');
    renderPracticeQuestion();
}

function reviewExamWrong() {
    // Show only incorrectly answered exam questions
    const wrongQs = examQuestions.filter((q, i) => {
        const ans = examAnswers[i];
        if (!ans || ans.size === 0) return true; // unanswered = wrong
        const selected = Array.from(ans).sort().join('');
        const correctAns = q.answer.split('').sort().join('');
        return selected !== correctAns;
    });
    if (wrongQs.length === 0) {
        alert('恭喜，本次考试没有错题！');
        return;
    }
    practiceQuestions = wrongQs;
    practiceIndex = 0;
    practiceMode = 'exam-review';
    document.getElementById('practiceType').textContent = `错题回顾 (${wrongQs.length}题)`;
    showPage('practice');
    renderPracticeQuestion();
}

function viewHistoryExam(historyIndex, mode) {
    const record = state.examHistory[historyIndex];
    if (!record || !record.questionIds) {
        alert('该记录无详细数据');
        return;
    }
    
    // Reconstruct questions from IDs
    const questionMap = {};
    QUESTIONS.forEach(q => questionMap[q.id] = q);
    
    const allQs = record.questionIds.map(id => questionMap[id]).filter(q => q);
    
    if (mode === 'wrong') {
        // Filter to only wrong/unanswered questions
        const wrongQs = allQs.filter((q, i) => {
            const userAns = record.userAnswers[i];
            if (!userAns) return true; // unanswered = wrong
            const correctAns = q.answer.split('').sort().join('');
            return userAns !== correctAns;
        });
        if (wrongQs.length === 0) {
            alert('该次考试没有错题！');
            return;
        }
        practiceQuestions = wrongQs;
        document.getElementById('practiceType').textContent = `历史错题 (${wrongQs.length}题)`;
    } else {
        practiceQuestions = allQs;
        const d = new Date(record.date);
        const dateStr = `${(d.getMonth()+1)}/${d.getDate()} ${record.score}分`;
        document.getElementById('practiceType').textContent = `历史回顾 ${dateStr}`;
    }
    
    practiceIndex = 0;
    practiceMode = 'exam-review';
    showPage('practice');
    renderPracticeQuestion();
}

function retakeExam() {
    resetExamView();
}

// ===== STATS =====
function renderStats() {
    renderTypeAccuracyChart();
    renderDailyChart();
    renderStatsTable();
}

function renderTypeAccuracyChart() {
    const chart = document.getElementById('typeAccuracyChart');
    chart.innerHTML = '';

    const types = [
        { key: 'single', label: '单选题', color: 'linear-gradient(180deg, #6366f1, #818cf8)' },
        { key: 'multi', label: '多选题', color: 'linear-gradient(180deg, #06b6d4, #22d3ee)' },
        { key: 'judge', label: '判断题', color: 'linear-gradient(180deg, #f59e0b, #fbbf24)' }
    ];

    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t.key);
        const answered = typeQs.filter(q => state.answered[q.id]);
        const correct = answered.filter(q => state.answered[q.id].correct);
        const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';
        wrapper.innerHTML = `
            <span class="bar-value">${accuracy}%</span>
            <div class="bar" style="height: ${Math.max(accuracy, 4)}px; background: ${t.color}"></div>
            <span class="bar-label">${t.label}</span>
        `;
        chart.appendChild(wrapper);
    });
}

function renderDailyChart() {
    const chart = document.getElementById('dailyChart');
    chart.innerHTML = '';

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }

    const maxDone = Math.max(...days.map(d => (state.dailyStats[d]?.done || 0)), 1);

    days.forEach(day => {
        const data = state.dailyStats[day] || { done: 0, correct: 0 };
        const height = Math.max((data.done / maxDone) * 120, 4);
        const label = day.slice(5); // MM-DD

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';
        wrapper.innerHTML = `
            <span class="bar-value">${data.done}</span>
            <div class="bar" style="height: ${height}px; background: linear-gradient(180deg, #6366f1, #06b6d4)"></div>
            <span class="bar-label">${label}</span>
        `;
        chart.appendChild(wrapper);
    });
}

function renderStatsTable() {
    const tbody = document.getElementById('statsTableBody');
    tbody.innerHTML = '';

    const types = [
        { key: 'single', label: '单选题' },
        { key: 'multi', label: '多选题' },
        { key: 'judge', label: '判断题' }
    ];

    let totalAll = 0, doneAll = 0, correctAll = 0;

    types.forEach(t => {
        const typeQs = QUESTIONS.filter(q => q.type === t.key);
        const answered = typeQs.filter(q => state.answered[q.id]);
        const correct = answered.filter(q => state.answered[q.id].correct);
        const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) + '%' : '-';

        totalAll += typeQs.length;
        doneAll += answered.length;
        correctAll += correct.length;

        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.label}</td><td>${typeQs.length}</td><td>${answered.length}</td><td>${correct.length}</td><td>${accuracy}</td>`;
        tbody.appendChild(tr);
    });

    const accAll = doneAll > 0 ? Math.round((correctAll / doneAll) * 100) + '%' : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>合计</strong></td><td><strong>${totalAll}</strong></td><td><strong>${doneAll}</strong></td><td><strong>${correctAll}</strong></td><td><strong>${accAll}</strong></td>`;
    tbody.appendChild(tr);
}

// ===== RESET =====
function initResetButton() {
    document.getElementById('btnResetAll').addEventListener('click', () => {
        if (confirm('确定重置所有学习数据？此操作不可恢复！')) {
            state = defaultState();
            saveState();
            // Clear practice state so it re-initializes on next visit
            practiceQuestions = [];
            practiceIndex = 0;
            updateDashboard();
            showPage('dashboard');
        }
    });
}

// ===== UTILITIES =====
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    // Ignore if typing in search input
    if (document.activeElement?.tagName === 'INPUT') return;

    if (activePage.id === 'page-practice') {
        const q = practiceQuestions[practiceIndex];
        if (!q) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevQuestion();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextQuestion();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isAnswered) {
                highlightedOptionIndex = Math.min(highlightedOptionIndex + 1, q.options.length - 1);
                // Select the highlighted option
                const opt = q.options[highlightedOptionIndex];
                if (opt) selectOptionByKey(opt.key);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isAnswered) {
                highlightedOptionIndex = Math.max(highlightedOptionIndex - 1, 0);
                // Select the highlighted option
                const opt = q.options[highlightedOptionIndex];
                if (opt) selectOptionByKey(opt.key);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!isAnswered) submitAnswer();
            else nextQuestion();
        } else if (['a', 'A', '1'].includes(e.key)) {
            selectOptionByKey('A');
        } else if (['b', 'B', '2'].includes(e.key)) {
            selectOptionByKey('B');
        } else if (['c', 'C', '3'].includes(e.key)) {
            selectOptionByKey('C');
        } else if (['d', 'D', '4'].includes(e.key)) {
            selectOptionByKey('D');
        }
    } else if (activePage.id === 'page-exam' && document.getElementById('examProgress').style.display !== 'none') {
        const eq = examQuestions[examIndex];
        if (!eq) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            examPrev();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            examNext();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            examHighlightedOptionIndex = Math.min(examHighlightedOptionIndex + 1, eq.options.length - 1);
            const opt = eq.options[examHighlightedOptionIndex];
            if (opt) selectExamOption(opt.key);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            examHighlightedOptionIndex = Math.max(examHighlightedOptionIndex - 1, 0);
            const opt = eq.options[examHighlightedOptionIndex];
            if (opt) selectExamOption(opt.key);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            examNext();
        } else if (['a', 'A', '1'].includes(e.key)) {
            if (eq.options.find(o => o.key === 'A')) selectExamOption('A');
        } else if (['b', 'B', '2'].includes(e.key)) {
            if (eq.options.find(o => o.key === 'B')) selectExamOption('B');
        } else if (['c', 'C', '3'].includes(e.key)) {
            if (eq.options.find(o => o.key === 'C')) selectExamOption('C');
        } else if (['d', 'D', '4'].includes(e.key)) {
            if (eq.options.find(o => o.key === 'D')) selectExamOption('D');
        }
    }
});

function selectOptionByKey(key) {
    if (isAnswered) return;
    const q = practiceQuestions[practiceIndex];
    if (!q) return;
    if (!q.options.find(o => o.key === key)) return;
    selectOption(key, q);
}

// Update highlight visual for arrow-key selected option
function updateHighlightUI() {
    document.querySelectorAll('#optionsList .option-item').forEach((el, i) => {
        el.classList.toggle('highlighted', i === highlightedOptionIndex);
    });
}

// ===== SWIPE GESTURE SUPPORT =====
(function initSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;
    const SWIPE_THRESHOLD = 50;  // minimum px to trigger swipe
    const SWIPE_MAX_Y = 80;     // max vertical movement allowed

    function getSwipeTarget() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return null;
        if (activePage.id === 'page-practice') return 'practice';
        if (activePage.id === 'page-exam' && document.getElementById('examProgress').style.display !== 'none') return 'exam';
        return null;
    }

    function getQuestionCard(target) {
        if (target === 'practice') return document.getElementById('questionCard');
        if (target === 'exam') return document.getElementById('examQuestionCard');
        return null;
    }

    document.addEventListener('touchstart', (e) => {
        const target = getSwipeTarget();
        if (!target) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = true;

        const card = getQuestionCard(target);
        if (card) {
            card.style.transition = 'none';
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const target = getSwipeTarget();
        if (!target) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        // Only apply visual feedback if horizontal swipe
        if (diffY < SWIPE_MAX_Y) {
            const card = getQuestionCard(target);
            if (card) {
                const translateX = Math.max(-100, Math.min(100, diffX * 0.3));
                const opacity = 1 - Math.abs(translateX) / 300;
                card.style.transform = `translateX(${translateX}px)`;
                card.style.opacity = opacity;
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;

        const target = getSwipeTarget();
        if (!target) return;

        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);

        const card = getQuestionCard(target);

        // Reset card transform with animation
        if (card) {
            card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            card.style.transform = '';
            card.style.opacity = '';
        }

        // Check if it's a valid horizontal swipe
        if (Math.abs(diffX) > SWIPE_THRESHOLD && diffY < SWIPE_MAX_Y) {
            if (diffX < 0) {
                // Swipe left → next question
                if (target === 'practice') {
                    // Add slide-out-left animation
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(-60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            nextQuestion();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        nextQuestion();
                    }
                } else if (target === 'exam') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(-60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            examNext();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        examNext();
                    }
                }
            } else {
                // Swipe right → previous question
                if (target === 'practice') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            prevQuestion();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(-60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        prevQuestion();
                    }
                } else if (target === 'exam') {
                    if (card) {
                        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                        card.style.transform = 'translateX(60px)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            examPrev();
                            card.style.transition = 'none';
                            card.style.transform = 'translateX(-60px)';
                            card.style.opacity = '0';
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                                card.style.transform = '';
                                card.style.opacity = '';
                            });
                        }, 200);
                    } else {
                        examPrev();
                    }
                }
            }
        }
    }, { passive: true });
})();

// ===== DATA SYNC =====
function exportSyncData() {
    try {
        const data = JSON.stringify(state);
        // Use base64 encoding with a prefix for identification
        const encoded = 'QUIZ_SYNC_V1:' + btoa(unescape(encodeURIComponent(data)));
        document.getElementById('exportCode').value = encoded;
        document.getElementById('exportCodeArea').style.display = 'block';
    } catch (e) {
        alert('导出失败：' + e.message);
    }
}

function copySyncCode() {
    const textarea = document.getElementById('exportCode');
    textarea.select();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textarea.value).then(() => {
            showToast('已复制到剪贴板！');
        }).catch(() => {
            document.execCommand('copy');
            showToast('已复制到剪贴板！');
        });
    } else {
        document.execCommand('copy');
        showToast('已复制到剪贴板！');
    }
}

function setImportMode(mode) {
    importMode = mode;
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.includes(mode === 'merge' ? '合并' : '覆盖'));
    });
}

function importSyncData() {
    const code = document.getElementById('importCode').value.trim();
    if (!code) {
        alert('请先粘贴同步码');
        return;
    }

    try {
        let jsonStr;
        if (code.startsWith('QUIZ_SYNC_V1:')) {
            const b64 = code.substring('QUIZ_SYNC_V1:'.length);
            jsonStr = decodeURIComponent(escape(atob(b64)));
        } else {
            // Try raw base64
            jsonStr = decodeURIComponent(escape(atob(code)));
        }

        const importedState = JSON.parse(jsonStr);

        if (importMode === 'replace') {
            if (!confirm('覆盖模式会完全替换当前数据，确定继续？')) return;
            state = { ...defaultState(), ...importedState };
        } else {
            // Merge mode
            mergeState(importedState);
        }

        saveState();
        updateDashboard();
        showToast('数据导入成功！');
        document.getElementById('importCode').value = '';
    } catch (e) {
        alert('同步码无效，请检查后重试\n错误：' + e.message);
    }
}

function exportSyncFile() {
    try {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `quiz-sync-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('同步文件已下载！');
    } catch (e) {
        alert('导出失败：' + e.message);
    }
}

function importSyncFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);

            if (importMode === 'replace') {
                if (!confirm('覆盖模式会完全替换当前数据，确定继续？')) return;
                state = { ...defaultState(), ...importedState };
            } else {
                mergeState(importedState);
            }

            saveState();
            updateDashboard();
            showToast('数据导入成功！');
        } catch (err) {
            alert('文件格式无效，请选择正确的同步文件\n错误：' + err.message);
        }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be selected again
    event.target.value = '';
}

function mergeState(imported) {
    // Merge answered: keep the one where more questions are answered, prefer correct
    if (imported.answered) {
        Object.keys(imported.answered).forEach(qid => {
            if (!state.answered[qid]) {
                state.answered[qid] = imported.answered[qid];
            }
        });
    }

    // Merge wrong: union of both
    if (imported.wrong) {
        imported.wrong.forEach(id => {
            if (!state.wrong.includes(id)) {
                state.wrong.push(id);
            }
        });
        // Remove from wrong if correctly answered in current state
        state.wrong = state.wrong.filter(id => {
            const ans = state.answered[id];
            return !ans || !ans.correct;
        });
    }

    // Merge favorites: union
    if (imported.favorites) {
        imported.favorites.forEach(id => {
            if (!state.favorites.includes(id)) {
                state.favorites.push(id);
            }
        });
    }

    // Merge dailyStats: sum up
    if (imported.dailyStats) {
        Object.keys(imported.dailyStats).forEach(date => {
            if (!state.dailyStats[date]) {
                state.dailyStats[date] = imported.dailyStats[date];
            } else {
                // Take the max values (more complete data)
                state.dailyStats[date].done = Math.max(state.dailyStats[date].done, imported.dailyStats[date].done);
                state.dailyStats[date].correct = Math.max(state.dailyStats[date].correct, imported.dailyStats[date].correct);
            }
        });
    }

    // Merge examHistory: combine, deduplicate by date, sort by date desc
    if (imported.examHistory) {
        const existingDates = new Set(state.examHistory.map(r => r.date));
        imported.examHistory.forEach(record => {
            if (!existingDates.has(record.date)) {
                state.examHistory.push(record);
            }
        });
        state.examHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        // Keep max 50
        if (state.examHistory.length > 50) state.examHistory = state.examHistory.slice(0, 50);
    }

    // Take max streak
    if (imported.streak > state.streak) {
        state.streak = imported.streak;
    }
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
