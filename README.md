# 9М68

一个类似于[星野](https://www.xingyeai.com)的对话型人工智能 TUI，基于 [MiniMax](https://www.minimaxi.com) 公司的 `abab6.5t-chat` 模型。

## 开始游玩

- 克隆仓库
- `npm install`
- 注册一个 [MiniMax](https://www.minimaxi.com) 账号，然后充一点余额
  - 新用户应该会送你十五块的代金券，够你挥霍一阵子了
- 生成一个 API key，然后在项目目录下新建一个 `apiKey.txt`，将 API key 写入其中
- `node index.js`
- 选择你要对话的角色和你的自设角色
- 开始和 AI 相爱相杀
- 要结束聊天，可以输入 `exit` 或者 `quit`，或者发送一个 `EOF` 信号（Unix 终端是 `Ctrl + D`，Windows CMD 是 `Ctrl + Z` 然后回车）

## 功能细节

> 星野用户应该已经比较熟悉这部分内容了

### 括号

在对话中，AI 和你可以使用括号来描述角色的外貌、内心活动、行动以及一切不属于“角色发言”的内容。比如这样：

```
张三：（带了一大堆人在学校门口堵你）你小子最近挺狂啊？
```

而你可以

```
用户 >>（一拳一个把他们挨个放倒）带这么几个人就来吓唬我，你当我是吓大的？（一把抓住张三的衣领）
```

> 因为你几乎可以用括号执行任何行动，所以这也被星野玩家戏称为“括号之力”，嗯

### 旁白

在对话中，你可以用旁白来“客观地”总结当前的状况。在终端中，使用 `/` 来切换到旁白模式：

```
旁白 >> /张三刚想动手，就被一股巨大的力量按在地上，动弹不得。重压使他的骨头发出响声，仿佛随时都会被压断。
```

> 当然，反正旁白是你写的，因此你也可以用旁白来让事件朝你预期的方向发展。因此这也被星野玩家戏称为“旁白大法”

### 重新生成

如果人工智能的上一句发言不符合人设、忘记上文内容或者出现其他问题，你可以用 `?` <del>表示它的发言让你感到疑惑并</del>让它重新生成三个备选发言，然后你可以选择其中一个，或者也可以不选择

你不能对自己的发言、旁白的发言和 AI 的开场白使用 `?`。

### 重写

如果重新生成也不能满足你的需求，你可以使用 `!` 切换到重写模式来重写 AI 的发言。重写模式下，你可以随意编辑 AI 的发言，然后按下回车键来确认你的修改：

```
秦琼：我在唐朝你在汉，咱俩打仗为哪般？
关公：你管那么多作甚，我就是要打你！
重写 >> !叫你打来你就打，你要不打（指着那老头）他不管饭！
```

### 记忆压缩

众所不周知，对话性 AI 的记忆其实就是每次都把整个聊天上下文都喂给模型。显然模型能接受的输入长度是有限的，如果太长的话就把模型给撑爆了。因此每当上下文中存在<i><span title="7000 个 token">较多</span></i>对话时，这个程序会自动把前半部分的记忆压缩成一个摘要。压缩是使用另一个模型 `abab6.5s-chat` 进行的。这个模型定价很便宜，产生的费用相比于你聊天调用 `abab6.5t-chat` 的费用可以忽略不计。

你也可以手动调用命令来进行压缩：

- 无参数的 `compress` 默认将前半部分对话进行压缩
- `compress all` 会将整个对话进行压缩
- `compress ratio`，其中 `ratio` 是 `0.0 ~ 1.0` 之间的实数，会按照比例进行压缩
- `compress keep`，其中 `keep` 是负值，表示保留最近的 `-keep` 条对话，并将其余对话进行压缩

使用 `memory` 命令可以查看已被压缩的对话内容

## 角色设定

### 人设卡

人设卡被储存在 `characters` 目录下的 `.chr` 文件中（其实就是 JSON 文件，作者 DDLC 玩魔怔了）。人设卡有这么几个字段：

```javascript
{
  // 角色的名字
  "name": "张晓丽",
  // 角色的设定
  "settings": "你的同班同学，青梅竹马",
  // 可选，角色的隐藏设定
  "hiddenSettings": "暗恋你，喜欢你喜欢的不得了，但是不敢表白",
  // 开场对话
  "openingDialogue": "（从你身边经过）（装作不小心碰到你）啊……对不起！我……我不是故意的"
}
```

> 事实上我考虑这个隐藏设定直接明文写在 JSON 里也太不“隐藏”了，我考虑之后至少弄个 base64

> 什么？你跟我说没有立绘？立绘岂是如此不便之物！

### 自设卡

自设卡被储存在 `self` 目录下的 `.chr` 文件中。自设卡只需要 `name` 和 `settings` 两个字段。

## 存档和读档

每次你结束聊天之后，`logs` 文件夹下会生成一个记录了你和 AI 对话的 `.json` 文件。使用 `--load` 参数即可加载：

```bash
node index.js --load logs/1731167805514.json
```

要改变存档文件名，可以在第一次运行程序时使用 `--save` 参数：

```bash
node index.js --save logs/my-chat-with-lily.json
```

## 技术细节

> 自己看 `index.js` 吧，懒得写了，反正也很简单
