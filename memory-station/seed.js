// seed.js — 写入示例数据并生成占位老宅照片
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');

// 生成怀旧风格 SVG 占位照片
function makePhoto(filename, caption, tone) {
  const tones = {
    sepia:  ['#e8dcc4', '#c9b48a', '#8a6f4d', '#5d4a33'],
    gray:   ['#e3e0da', '#b8b3a8', '#7d786c', '#4f4b43'],
    brown:  ['#ead9c2', '#c8a97e', '#96714b', '#6b4f33']
  };
  const t = tones[tone] || tones.sepia;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t[0]}"/><stop offset="1" stop-color="${t[1]}"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0"/>
      <feComposite operator="over" in2="SourceGraphic"/></filter>
  </defs>
  <rect width="800" height="560" fill="url(#sky)"/>
  <!-- 远山 -->
  <path d="M0 300 Q150 220 320 290 T800 270 V560 H0 Z" fill="${t[2]}" opacity="0.35"/>
  <path d="M0 340 Q200 280 420 330 T800 320 V560 H0 Z" fill="${t[2]}" opacity="0.5"/>
  <!-- 老宅：坡屋顶正房 + 厢房 -->
  <g fill="${t[3]}">
    <rect x="270" y="330" width="260" height="150"/>
    <polygon points="250,330 400,250 550,330"/>
    <rect x="120" y="380" width="130" height="100"/>
    <polygon points="105,380 185,325 265,380"/>
    <rect x="560" y="380" width="120" height="100"/>
    <polygon points="545,380 620,330 695,380"/>
  </g>
  <rect x="375" y="400" width="50" height="80" fill="${t[1]}"/>
  <rect x="300" y="360" width="36" height="36" fill="${t[1]}"/>
  <rect x="465" y="360" width="36" height="36" fill="${t[1]}"/>
  <!-- 院墙与门楼 -->
  <rect x="60" y="470" width="680" height="14" fill="${t[3]}" opacity="0.8"/>
  <rect x="380" y="440" width="40" height="44" fill="${t[3]}"/>
  <!-- 树 -->
  <circle cx="700" cy="300" r="46" fill="${t[2]}" opacity="0.7"/>
  <rect x="694" y="330" width="12" height="140" fill="${t[3]}"/>
  <!-- 地面 -->
  <rect y="480" width="800" height="80" fill="${t[2]}" opacity="0.55"/>
  <!-- 文字 -->
  <text x="400" y="530" text-anchor="middle" font-family="serif" font-size="30" fill="${t[0]}" opacity="0.95">${caption}</text>
  <rect width="800" height="560" filter="url(#grain)" opacity="0.12" fill="#000"/>
  <rect x="14" y="14" width="772" height="532" fill="none" stroke="${t[0]}" stroke-width="10" opacity="0.7"/>
</svg>`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), svg);
}

(async () => {
  await db.init();
  if (db.get('SELECT id FROM families LIMIT 1')) {
    console.log('已有数据，跳过种子写入。如需重置请删除 data/memory.db');
    return;
  }

  // ===== 家庭 =====
  const chen = db.insert(`INSERT INTO families (name,surname,origin_village,summary) VALUES (?,?,?,?)`,
    ['陈氏家族', '陈', '山东省登州府蓬莱县陈家疃',
     '陈氏一族世居胶东半岛蓬莱海边，以渔耕为生。民国十六年（1927年），家乡连年灾荒，曾祖父陈守业携家眷渡海闯关东，先落脚大连码头做苦力，后辗转至哈尔滨定居，至今已历五代。']);
  const li = db.insert(`INSERT INTO families (name,surname,origin_village,summary) VALUES (?,?,?,?)`,
    ['李氏家族', '李', '山西省太原府祁县李家堡',
     '李家祖上在祁县经营小杂货铺。民国四年（1915年）晋北遭灾，高祖李满仓随同乡走西口，到包头萨拉齐一带垦荒谋生，后开设米面铺，家族由此在塞外扎根。']);
  const wang = db.insert(`INSERT INTO families (name,surname,origin_village,summary) VALUES (?,?,?,?)`,
    ['王氏家族', '王', '河南省洛阳县王家庄',
     '王家世代在洛阳城郊务农。民国三十一年（1942年）河南大旱，蝗虫蔽日，曾祖母带着两个孩子沿陇海线一路西逃要饭，终在西安落下脚。1958年祖父响应号召支援大西北，举家迁往兰州。']);

  // ===== 迁徙路线 =====
  // 陈家：蓬莱(37.81,120.76) → 大连(38.91,121.61) → 哈尔滨(45.80,126.53)
  db.insert(`INSERT INTO routes (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [chen, '山东蓬莱陈家疃', '辽宁大连', 37.81, 120.76, 38.91, 121.61, 1927, '家乡连年旱灾，渡海谋生', '木帆船',
     '从蓬莱阁下的渔港出发，乘木帆船横渡渤海海峡，海上走了两天一夜，在大连港上岸。', 1]);
  db.insert(`INSERT INTO routes (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [chen, '辽宁大连', '黑龙江哈尔滨', 38.91, 121.61, 45.80, 126.53, 1938, '码头工潮失业，投奔在哈尔滨的远房表亲', '火车',
     '全家挤上南满铁路的闷罐车，经沈阳、长春北上，历时三天抵达哈尔滨，落脚道外区。', 2]);
  // 李家：祁县(37.36,112.33) → 包头(40.66,109.84)
  db.insert(`INSERT INTO routes (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [li, '山西祁县李家堡', '内蒙古包头', 37.36, 112.33, 40.66, 109.84, 1915, '晋北连年大旱，走西口垦荒', '步行、牛车',
     '与同乡结伴出杀虎口，一路风餐露宿走了四十余天，到萨拉齐厅（今包头土默特右旗）落脚垦荒。', 1]);
  // 王家：洛阳(34.62,112.45) → 西安(34.34,108.94) → 兰州(36.06,103.83)
  db.insert(`INSERT INTO routes (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [wang, '河南洛阳王家庄', '陕西西安', 34.62, 112.45, 34.34, 108.94, 1942, '河南大旱蝗灾，逃荒求生', '步行、扒火车',
     '曾祖母带着祖父兄妹二人，沿陇海铁路一路向西乞讨，历时月余到西安，在难民收容所落下脚。', 1]);
  db.insert(`INSERT INTO routes (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [wang, '陕西西安', '甘肃兰州', 34.34, 108.94, 36.06, 103.83, 1958, '响应国家号召支援大西北建设', '火车',
     '祖父所在工厂整体内迁兰州，全家乘火车西行，从此在黄河之滨扎下根来。', 2]);

  // ===== 人物故事 =====
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,contributor) VALUES (?,?,?,?,?,?,0,?)`,
    [chen, '曾祖父 陈守业', '一副担子过渤海',
     `民国十六年春天，胶东大旱，地里颗粒无收。曾祖父陈守业把家里仅有的两床棉被、一口铁锅和祖宗牌位捆进一副担子，一头挑着行李，一头挑着年仅三岁的祖父，带着曾祖母从蓬莱渔港上了去大连的木帆船。\n\n海上风大，船小人多。曾祖母晕船吐得厉害，仍死死抱着装祖宗牌位的包袱不撒手。两天后船到大连港，曾祖父上岸第一件事，就是把担子放下，朝着山东老家的方向磕了三个头。\n\n在大连，曾祖父白天在码头扛包，夜里睡在货栈的屋檐下。他常对祖父说："咱山东人走到哪，根都在哪。牌位在，家就在。"`,
     '民国年间', 1927, '陈建国（长孙）整理']);
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,access_code,contributor) VALUES (?,?,?,?,?,?,1,?,?)`,
    [chen, '曾祖母 陈氏', '奶奶的金戒指',
     `这是家里长辈才知道的一段往事。1938年全家从大连逃难去哈尔滨时，曾祖母把出嫁时的金戒指缝进了棉袄夹层。路上遇到关卡盘查，她硬是把戒指含在嘴里咽下了半口唾沫才没被发现。\n\n到哈尔滨后最艰难的那个冬天，她本可以拿戒指换粮食，却宁可去被服厂做工到深夜。她说："这是你太姥姥留给我的念想，饿死了也不能当。"\n\n这枚戒指如今传到了我母亲手里，成了陈家媳妇的传家宝。家里规矩：这个故事只在陈家人内部讲，不外传。`,
     '民国年间', 1938, 'chen1938', '陈秀兰（孙女）口述']);
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,contributor) VALUES (?,?,?,?,?,?,0,?)`,
    [li, '高祖 李满仓', '走西口的四十三天',
     `民国四年，晋北大旱，高粱杆子都旱得点了火。高祖李满仓十九岁，跟着村里七个后生，推一辆独轮车出杀虎口走西口。\n\n出了口外，前不着村后不着店，夜里就睡在车轮子底下挡风。走到归化城（今呼和浩特）时，干粮断了，靠给沿途大户打短工换炒面充饥。第四十三天，一行人终于望见黄河，到了萨拉齐。\n\n高祖先给垦务局扛活，后来用攒下的工钱在包头老城西脑包租了半间门脸，支起米面铺。铺子开张那天，他在门框上贴了副对联："背井离乡谋活路，落地生根即故乡。"`,
     '民国年间', 1915, '李卫东（曾孙）整理']);
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,access_code,contributor) VALUES (?,?,?,?,?,?,1,?,?)`,
    [li, '高祖母 李王氏', '一张当票',
     `高祖母的陪嫁里有一对银镯子。民国十八年口外遭灾，米面铺眼看要断粮，她瞒着高祖把镯子当了，换回来三斗糜子，全家才熬过了那个冬天。\n\n后来日子好转，高祖拿着当票去赎，当铺却说镯子早已死当出手。高祖为此懊恼了一辈子。那张当票，高祖母一直夹在陪嫁的木匣底层，直到她去世后才被发现。\n\n当票背面有她请人代笔写的一行小字："物是死的，人是活的。人在，家就在。"`,
     '民国年间', 1929, 'li1929', '李桂芳（孙女）口述']);
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,contributor) VALUES (?,?,?,?,?,?,0,?)`,
    [wang, '曾祖母 王赵氏', '1942，逃荒路上',
     `民国三十一年，河南大旱之后又是蝗灾，蝗虫飞过来遮天蔽日，地里的庄稼眨眼就剩光杆。村里人开始逃荒。\n\n曾祖母王赵氏那年二十八岁，带着八岁的祖父和五岁的姑祖母，把最后半袋麸皮面背在身上，跟着逃荒的人流往西走。白天沿着陇海铁路走，夜里睡在破庙和桥洞底下。遇到火车就扒上去，被赶下来就接着走。\n\n走到潼关时，姑祖母饿得走不动了，曾祖母把她背在背上，咬着牙翻过了函谷关。一个多月后到西安，母子三人在难民收容所喝上了第一碗热粥。曾祖母后来说："那碗粥的滋味，我记了一辈子。"`,
     '民国年间', 1942, '王建军（曾孙）整理']);
  db.insert(`INSERT INTO stories (family_id,person_name,title,content,era,event_year,is_private,contributor) VALUES (?,?,?,?,?,?,0,?)`,
    [wang, '祖父 王长顺', '坐着火车去支边',
     `1958年秋天，祖父所在的西安机械厂接到命令，整体迁往兰州支援大西北建设。消息传来，祖母哭了一场——她舍不得西安城，更舍不得刚盖好的两间瓦房。\n\n祖父劝她："国家让咱去哪，咱就去哪。当年逃荒是没办法，如今支边是光荣。"\n\n搬家那天，全厂几百户人家一起上的火车，车厢里堆满了行李和机器零件。火车过了天水，窗外的绿越来越少，黄土越来越多。祖母一路没说话。车到兰州，接站的锣鼓敲得震天响，站台上挂着大红横幅："欢迎支援大西北的建设者们！"祖母后来说，看到那条横幅，她心里一下子就踏实了。`,
     '建国初期', 1958, '王建军（曾孙）整理']);

  // ===== 年代说明 =====
  const eras = [
    ['清末民初', 1900, 1911, '清末政局动荡，灾荒频发，北方多地农民开始"闯关东""走西口"谋求生路。', 1],
    ['民国年间', 1912, 1949, '军阀混战、抗日战争与解放战争接连不断，加之1942年河南大饥荒等天灾，民众流离迁徙极为普遍。闯关东、走西口、逃荒西迁都发生在这一时期。', 2],
    ['建国初期', 1949, 1957, '新中国成立，社会秩序恢复。土地改革使农民分得田地，大规模工业化建设拉开序幕。', 3],
    ['三年困难时期', 1959, 1961, '全国范围严重经济困难，粮食短缺，部分地区出现人口流动。', 4],
    ['支边与三线建设', 1958, 1978, '国家组织工厂、学校、知识青年支援边疆和内地三线建设，数以百万计家庭因此西迁、北迁。', 5],
    ['改革开放', 1978, 2000, '农村实行家庭联产承包责任制，大量农民进城务工，形成新的迁徙浪潮。', 6],
  ];
  for (const e of eras) {
    db.insert('INSERT INTO eras (title,year_start,year_end,description,sort) VALUES (?,?,?,?,?)', e);
  }

  // ===== 老宅照片（SVG 占位图） =====
  const photos = [
    [chen, 'chen_old_house.svg', '山东蓬莱陈家疃老宅（约1920年代）', '1920年代', 'sepia', '陈家祖宅，三间正房带东西厢房，院中有口老井。1927年举家闯关东后托给本家照看。'],
    [chen, 'chen_dalian.svg', '大连码头工棚旧址（1927-1938）', '1930年代', 'gray', '曾祖父在大连码头扛包时住的工棚区，靠海，冬天海风刺骨。'],
    [li, 'li_old_house.svg', '山西祁县李家堡祖宅（清末）', '清末', 'sepia', '李家祖宅，典型的晋中四合院，门楼上原有"耕读传家"砖雕。'],
    [li, 'li_baotou.svg', '包头西脑包米面铺旧址（约1920年代）', '1920年代', 'brown', '高祖在包头开设的米面铺，前店后坊，全家住在铺子后头。'],
    [wang, 'wang_old_house.svg', '河南洛阳王家庄老宅（约1930年代）', '1930年代', 'sepia', '王家老宅，土坯墙、茅草顶。1942年逃荒时锁了门，再回来时屋顶已塌了半边。'],
    [wang, 'wang_lanzhou.svg', '兰州厂区家属院（1960年代）', '1960年代', 'gray', '支边后全家住的苏式家属楼，一梯四户，公用厨房水房。'],
  ];
  for (const [fam, file, caption, year, tone, desc] of photos) {
    makePhoto(file, caption, tone);
    db.insert('INSERT INTO photos (family_id,filename,caption,year_taken,is_private) VALUES (?,?,?,?,0)',
      [fam, file, caption + '。' + desc, year]);
  }

  // 一条待审核的亲属提交示例
  db.insert(`INSERT INTO submissions (family_id,type,person_name,title,content,submitter_name,contact) VALUES (?,?,?,?,?,?,?)`,
    [chen, 'story', '祖父 陈德海', '补充：祖父在哈尔滨道外摆摊修鞋的事',
     '听父亲讲，祖父到哈尔滨后先在道外北三道街摆摊修鞋，后来攒了钱才租下门脸开了"陈记鞋铺"。铺子一直开到1956年公私合营。',
     '陈小军（重孙）', '138****0000']);

  console.log('种子数据写入完成：3个家族、5段迁徙路线、6则故事（含2则私密）、6张老宅照片、6条年代说明、1条待审核提交');
})();
