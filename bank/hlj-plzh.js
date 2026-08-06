/* 黑龙江省考·数量关系 排列组合 真题汇编（回忆版）
 * 来源：黑龙江公务员考试网(hljgwy.org) / 中公黑龙江(hlj.offcn.com) 公开解析页（逐字转录）。
 * 排列组合为纯计算题型，题干与选项均为文本，可完整录入。
 */
window.registerBankPaper({
  id: 'bk-hlj-plzh',
  name: '黑龙江省考·排列组合真题汇编（回忆版）',
  questions: [
    {
      q: '有赤、橙、黄、绿、青、蓝、紫七盏彩灯，按一定的顺序排成一行，如果要求绿灯必须放在首位或者末尾，问这七盏彩灯符合要求的排序共有多少种？',
      options: ['360', '720', '1440', '2880'],
      answer: 2,
      explain: '绿灯位置有特殊要求（首位或末尾），用优限法优先处理绿灯：有2种放法；剩余6盏无特殊要求全排列有6!=720种；分步乘法：2×720=1440种。故选C。',
      year: '2025', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'http://www.hljgwy.org/2025/1011/73880.html'
    },
    {
      q: '甲、乙、丙、丁四人排队，要求甲、乙相邻，丙、丁相邻，问有多少种不同的排法？',
      options: ['7', '8', '9', '10'],
      answer: 1,
      explain: '要求相邻用捆绑法：甲乙捆绑为一整体，丙丁捆绑为一整体，两个整体排队有2种；内部甲乙2种、丙丁2种；分步乘法：2×2×2=8种。故选B。',
      year: '2025', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'http://www.hljgwy.org/2025/1011/73880.html'
    },
    {
      q: '一个工作小组，由3名女性和4名男性组成，现将他们排成一排合影留念，问合影时3名女性互不相邻的站法共有多少种？',
      options: ['360', '720', '1440', '2880'],
      answer: 2,
      explain: '插空法：先排4名男性有4!=24种，形成5个空位；将3名女性插入其中3个空有A(5,3)=60种；分步乘法24×60=1440种。故选C。',
      year: '2025', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'http://www.hljgwy.org/2025/1011/73880.html'
    },
    {
      q: '某单位安排五位工作人员在星期一至星期五值班，每人一天且不重复。若甲、乙两人都不能安排星期五值班，则不同的安排法有（ ）种。',
      options: ['6', '36', '72', '120'],
      answer: 2,
      explain: '优限法：星期五不能排甲、乙，从其余3人中选1人值周五，有3种；剩余4天4人全排列4!=24种；分步乘法3×24=72种。故选C。',
      year: '2022', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'https://hlj.offcn.com/html/2022/06/205924.html'
    },
    {
      q: '现有2本艺术类、3本教育类和4本医药类书籍需要并排放到同一层书架上，要求同类书籍必须放在一起。问共有多少种可能的放置方式？',
      options: ['24', '288', '1728', '6912'],
      answer: 2,
      explain: '捆绑法：三类书各自捆绑为整体并排序有3!=6种；内部排列：艺术类2!=2，教育类3!=6，医药类4!=24；共6×2×6×24=1728种。故选C。',
      year: '2022', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'https://hlj.offcn.com/html/2022/06/205924.html'
    },
    {
      q: '某学习平台的学习内容由观看视频、阅读文章、收藏分享、论坛交流、考试答题五个部分组成。某学员要先后学完这五个部分，若观看视频和阅读文章不能连续进行，则该学员学习顺序的选择有：',
      options: ['24种', '72种', '96种', '120种'],
      answer: 1,
      explain: '插空法：先排收藏分享、论坛交流、考试答题3部分有3!=6种，形成4个空；将观看视频和阅读文章插入4空中的2个有A(4,2)=12种；分步乘法6×12=72种。故选B。',
      year: '2022', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'https://hlj.offcn.com/html/2022/06/205924.html'
    },
    {
      q: '某单位今年新进3个工作人员，可以分配到3个部门，但是每个部门至多只能接收2个人，问共有几种不同的分配方案？',
      options: ['12', '16', '24', '以上都不对'],
      answer: 2,
      explain: '间接法：3人分到3部门无限制共3^3=27种；反面"3人同部门"有3种；所求27-3=24种。故选C。',
      year: '2022', exam_type: 'hlj', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'https://hlj.offcn.com/html/2022/06/205924.html'
    }
  ]
});
