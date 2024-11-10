import { readFile, writeFile } from 'fs/promises'
import enquirer from 'enquirer'
import chalk from 'chalk'

import { listdir, postJSON } from './util.js'
import { compressMemory } from './compress.js'

const { prompt } = enquirer

const systemLog = []
const memoryBook = []
const compressedChatLog = []
const chatLog = []

const invertedSystemLog = []

const timestamp = Date.now() - 0
const logFile = `./logs/${timestamp}.log`
let jsonLogFile = `./logs/${timestamp}.json`

const defaultModel = 'abab6.5t-chat'

const writeLog = async (message, level) => {
   const currentTimeSeconds = Math.round((new Date() - 0) / 1000.0)
   await writeFile(
      logFile,
      `${currentTimeSeconds} ${level ?? 'INFO'} ${message}\n`,
      { flag: 'a' }
   )
}

const removeLastConsoleLine = () => {
   process.stdout.moveCursor(0, -1)
   process.stdout.clearLine()
}

const invertedChatLog = () => {
   const ret = []
   for (const log of chatLog) {
      if (log.role === 'user') {
         ret.push({
            role: 'assistant',
            name: log.name,
            content: log.content
         })
      }
      else if (log.name !== '旁白') {
         ret.push({
            role: 'user',
            name: log.name,
            content: log.content
         })
      }
      else {
         ret.push(log)
      }
   }
   return ret
}

const applicationStart = async () => {
   writeLog('应用程序已启动', 'INFO')
   console.info(chalk.greenBright(`应用程序已启动，日志文件 ${logFile}`))

   // 读取 API-Key
   const apiKey = await readFile('./apiKey.txt', 'utf-8')

   // 如果第一个参数是 --load，从指定文件中加载对话记录
   if (process.argv.length === 4 && process.argv[2] === '--load') {
      jsonLogFile = process.argv[3]
      const data = JSON.parse(await readFile(jsonLogFile, 'utf-8'))

      chatLog.push(...data.chatLog)
      if (data.compressedChatLog) {
         compressedChatLog.push(...data.compressedChatLog)
      }
      if (data.memoryBook) {
         memoryBook.push(...data.memoryBook)
      }

      const characterFile = data.characterFile
      const selfFile = data.selfFile
      const character = JSON.parse(await readFile(`./characters/${characterFile}`, 'utf-8'))
      const self = selfFile ? JSON.parse(await readFile(`./self/${selfFile}`, 'utf-8')) : undefined
      console.info(chalk.greenBright(`已加载对话记录 ${jsonLogFile}`))
      await writeLog(`已加载对话记录 ${jsonLogFile}`, 'INFO')
      console.info(chalk.bold(`对话角色: ${character.name}`))
      console.info(chalk.gray(chalk.italic(character.settings)))
      if (self) {
         console.info(chalk.bold(`自设角色: ${self.name}`))
      }
      else {
         console.info(chalk.yellowBright('没有选择自设角色'))
      }

      return await chatMain(apiKey, characterFile, selfFile, character, self)
   }

   if (process.argv.length === 4 && process.argv[2] === '--save') {
      jsonLogFile = process.argv[3]
   }

   // 读取角色和自设信息
   const characters = await listdir('./characters', 'chr')
   const selfSettings = await listdir('./self', 'chr')

   if (characters.length == 0) {
      console.warn(chalk.yellowBright('没有可用的角色配置文件'))
      return
   }

   // 自设信息不是必须的
   if (selfSettings.length == 0) {
      console.warn(chalk.yellowBright('没有可用的自身配置文件'))
   }

   // 选择要对话的角色
   const characterFile = (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个角色',
      choices: characters
   })).value
   const character = JSON.parse(await readFile(`./characters/${characterFile}`, 'utf-8'))
   console.info(chalk.gray(chalk.italic(character.settings)))

   // 如果至少有一个自设文件，则要求选择一个自设
   const selfFile = characters.length === 0 ? undefined : (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个自设',
      choices: [...selfSettings, '无']
   })).value
   const self = selfFile !== '无' ? JSON.parse(await readFile(`./self/${selfFile}`, 'utf-8')) : undefined

   await chatMain(apiKey, characterFile, selfFile, character, self)
}

const setupSystemLog = (character, self, selfName) => {
   // 在系统级提示中记录角色的设置
   systemLog.push({
      role: 'system',
      name: character.name,
      content: character.settings + (character.hiddenSettings ?? '')
   })

   // 在系统级提示中记录自设的设置
   systemLog.push({
      role: 'user_system',
      name: selfName,
      content: self ? self.settings : ''
   })

   // 添加旁白角色
   systemLog.push({
      role: 'system',
      name: '旁白',
      content: '会客观总结当前情形的旁白'
   })
}

const setupInvertedSystemLog = (character, self, selfName) => {
   // 反转系统级提示中的用户和系统角色
   invertedSystemLog.push({
      role: 'system',
      nam: selfName,
      content: self ? self.settings : ''
   })

   invertedSystemLog.push({
      role: 'user_system',
      name: character.name,
      content: character.settings + (character.hiddenSettings ?? '')
   })

   invertedSystemLog.push({
      role: 'system',
      name: '旁白',
      content: '会客观总结当前情形的旁白'
   })
}

const acceptUserInput = async (selfName, character) => {
   let commentatorMode = false
   let modifyMode = false
   const input = await prompt({
      type: 'text',
      name: 'value',
      message: () => commentatorMode ? '旁白' : (modifyMode ? '重写' : selfName),
      format: value => {
         commentatorMode = value.trim().startsWith('/')
         modifyMode = value.trim().startsWith('!')
         return value
      },
      validate: value => {
         value = value.trim()
         if (value.length === 0) {
            return '对话内容不能为空'
         }

         if (value === '?' || value.startsWith('!')) {
            if (chatLog.length === 1
                || chatLog[chatLog.length - 1].role !== 'assistant'
                || chatLog[chatLog.length - 1].name !== character.name) {
               return '不能重写开场白或者非对话角色的发言'
            }

            if (value === '!') {
               return '必须提供适当的重写文本'
            }
         }

         if (value === '/') {
            return '必须提供适当的旁白文本'
         }
         return true
      }
   })
   removeLastConsoleLine()

   if (!input.value) {
      return undefined
   }
   return input.value.trim()
}

const compressMemoryCommand = async (apiKey, command) => {
   if (chatLog.length <= 1) {
      console.warn(chalk.yellowBright('没有可以压缩的对话记录'))
      return
   }

   const parts = command.split(' ').map(part => part.trim()).filter(part => part.length > 0)
   const chatLogLength = chatLog.length
   let toBeCompressedLength
   if (parts.length === 1) {
      toBeCompressedLength = chatLogLength / 2
   }
   else if (parts.length === 2) {
      if (parts[1] === 'all') {
         toBeCompressedLength = chatLogLength
      }
      else {
         const numArg = parseFloat(parts[1])
         if (isNaN(numArg)) {
            console.warn(chalk.yellowBright(`compress: 参数 ${parts[1]} 无效`))
         }

         if (numArg > 0.0 && numArg <= 1.0) {
            toBeCompressedLength = Math.round(chatLogLength * numArg)
            if (toBeCompressedLength === 0) {
               console.warn(chalk.yellowBright('compress: 若按比例压缩，至少需要压缩一条对话记录'))
               return
            }
         }
         else if (numArg < 0) {
            toBeCompressedLength = Math.round(chatLogLength + numArg)
            if (toBeCompressedLength < 1) {
               console.warn(chalk.yellowBright(`compress: 若按数量压缩，至少需要压缩一条对话记录 (目前共有 ${chatLogLength} 条未压缩的记录)`))
               return
            }
         }
         else {
            console.warn(chalk.yellowBright(`compress: 参数 ${parts[1]} 无效`))
            return
         }
      }
   }
   else {
      console.warn(chalk.yellowBright('compress: 参数过多'))
      return
   }

   const toBeCompressedLog = chatLog.splice(0, toBeCompressedLength)
   const compressed = await compressMemory(apiKey, toBeCompressedLog)
   memoryBook.push({
      role: 'assistant',
      name: '旁白',
      content: compressed.content
   })
   compressedChatLog.push(...toBeCompressedLog)
   return
}

const regenerateCommand = async (apiKey, character, model) => {
   const resp = await postJSON(
      'https://api.minimax.chat/v1/text/chatcompletion_v2',
      {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${apiKey}`
      },
      {
         model,
         messages: [
            ...systemLog,
            ...memoryBook,
            ...chatLog.slice(0, -1)
         ],
         n: 3
      }
   )
   if (resp.base_resp.status_code !== 0) {
      console.error(chalk.redBright(chalk.bold('API 错误: ') + `(${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`))
      await writeLog(`API 错误: (${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`, 'ERROR')
      return
   }
   writeLog(`使用 token 额度: ${resp.usage.total_tokens}`, 'INFO')

   const choices = resp.choices.map((choice, idx) => {
      return { name: choice.message.content, value: `${idx}` }
   })
   const choice = (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个重写',
      choices: [
         ...choices,
         { name: '无', value: -1 }
      ],
      result() {
         return this.focused.value
      }
   })).value

   removeLastConsoleLine()
   if (choice !== -1) {
      const choiceText = choices[choice].name
      chatLog[chatLog.length - 1].content = choiceText
      removeLastConsoleLine()
      console.info(chalk.bold(`${character.name}: `) + choiceText)
      await writeLog(`已修改对话内容 ${character.name}: ${choiceText}`, 'CHAT')
   }
}

const inspirationCommand = async (apiKey, selfName, model) => {
   const resp = await postJSON(
      'https://api.minimax.chat/v1/text/chatcompletion_v2',
      {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${apiKey}`
      },
      {
         model,
         messages: [
            ...invertedSystemLog,
            ...memoryBook,
            ...invertedChatLog()
         ],
         n: 3
      }
   )
   if (resp.base_resp.status_code !== 0) {
      console.error(chalk.redBright(chalk.bold('API 错误: ') + `(${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`))
      await writeLog(`API 错误: (${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`, 'ERROR')
      return
   }
   writeLog(`使用 token 额度: ${resp.usage.total_tokens}`, 'INFO')

   const choices = resp.choices.map((choice, idx) => {
      return { name: choice.message.content, value: `${idx}` }
   })
   const choice = (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个灵感',
      choices: [
         ...choices,
         { name: '无', value: -1 }
      ],
      result() {
         return this.focused.value
      }
   })).value
   removeLastConsoleLine()

   if (choice !== -1) {
      const choiceText = choices[choice].name
      chatLog.push({ role: 'user', name: selfName, content: choiceText })
      console.info(chalk.bold(`${selfName}: `) + choiceText)
      await writeLog(`${selfName}: ${choiceText}`, 'CHAT')
      return true
   }

   return false
}

const chatMain = async (apiKey, characterFile, selfFile, character, self) => {
   // 日志记录
   await writeLog(`选择了角色: ${characterFile}`, 'INFO')
   if (self) {
      await writeLog(`选择了自设: ${selfFile}`, 'INFO')
      console.info(chalk.gray(chalk.italic(self.settings)))
   }
   else {
      await writeLog('没有选择自设', 'INFO')
   }

   // 如果角色使用了 fine tune 过的模型则使用该模型
   const model = character.model ?? defaultModel
   if (model !== defaultModel) {
      console.info(chalk.greenBright(`提示: 角色拥有微调模型: ${model}`))
      await writeLog(`角色拥有微调模型: ${model}`, 'INFO')
   }

   // 选择正确的用户名
   const selfName = self ? self.name : '用户'

   setupSystemLog(character, self, selfName)
   setupInvertedSystemLog(character, self, selfName)

   // 添加开场白到对话记录中
   if (chatLog.length === 0) {
      chatLog.push({
         role: 'assistant',
         name: character.name,
         content: character.openingDialogue
      })
   }

   if (chatLog.length === 1) {
      writeLog(`${character.name} (开场白): ${character.openingDialogue}`, 'CHAT')
      console.info(chalk.bold(`${character.name} (开场白): `) + chalk.gray(character.openingDialogue))
   }
   else {
      // show only the last 20 lines
      for (const log of chatLog.slice(-20)) {
         if (log.name !== '旁白') {
            console.info(chalk.bold(`${log.name}: `) + log.content)
         }
         else {
            console.info(chalk.italic(chalk.gray(chalk.bold('旁白: ') + log.content)))
         }
      }
   }

   while (true) {
      const command = await acceptUserInput(selfName, character)

      if (command === 'exit' || command === 'quit') {
         break
      }

      if (command === 'log') {
         console.info(chatLog)
         continue
      }

      if (command === 'memory') {
         console.info(memoryBook)
         continue
      }

      if (command.startsWith('compress')) {
         await compressMemoryCommand(apiKey, command)
         continue
      }

      if (command.startsWith('!')) {
         const rewrittenText = command.substring(1).trim()
         chatLog[chatLog.length - 1].content = rewrittenText

         removeLastConsoleLine()
         console.info(chalk.bold(`${character.name}: `) + rewrittenText)
         await writeLog(`已修改对话内容 ${character.name}: ${rewrittenText}`, 'CHAT')
         continue
      }

      if (command === '?') {
         await regenerateCommand(apiKey, character, model)
         continue
      }

      if (command === '~') {
         // 什么都不做，跳过此轮用户输入
      }
      else if (command === ':') {
         // 如果用户要求灵感
         const usingInspiration = await inspirationCommand(apiKey, selfName, model)
         // 如果用户没有采用灵感，则进入下一轮用户输入
         if (!usingInspiration) {
            continue
         }
         // 否则开始生成 AI 回复
      }
      else if (command.startsWith('/')) {
         const content = command.substring(1).trim()
         chatLog.push({ role: 'assistant', name: '旁白', content })
         await writeLog(`旁白: ${content}`, 'CHAT')
         console.info(chalk.italic(chalk.gray(chalk.bold('旁白: ') + content)))
      }
      else {
         chatLog.push({ role: 'user', name: selfName, content: command })
         await writeLog(`${selfName}: ${command}`, 'CHAT')
         console.info(chalk.bold(`${selfName}: `) + command)
      }

      const resp = await postJSON(
         'https://api.minimax.chat/v1/text/chatcompletion_v2',
         {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
         },
         { model, messages: [ ...systemLog, ...chatLog ] }
      )
      if (resp.base_resp.status_code !== 0) {
         console.error(chalk.redBright(chalk.bold('API 错误: ') + `(${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`))
         await writeLog(`API 错误: (${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`, 'ERROR')
         continue
      }
      writeLog(`使用 token 额度: ${resp.usage.total_tokens}`, 'INFO')

      // 启动记忆压缩
      if (resp.usage.total_tokens >= 7000) {
         // remove half of the chat log from the beginning
         const chatLogLength = chatLog.length
         const halfChatLog = chatLog.splice(0, chatLogLength / 2)
         const compressed = await compressMemory(apiKey, halfChatLog)
         memoryBook.push({
            role: 'assistant',
            name: '旁白',
            content: compressed.content
         })
         compressedChatLog.push(...halfChatLog)
      }

      const message = resp.choices[0].message.content
      console.info(chalk.bold(`${character.name}: `) + message)
      await writeLog(`${character.name}: ${message}`, 'CHAT')
      chatLog.push({ role: 'assistant', name: character.name, content: message })
   }

   await writeFile(jsonLogFile, JSON.stringify({
      characterFile,
      selfFile,
      memoryBook,
      compressedChatLog,
      chatLog
   }, null, 2))
}

applicationStart()
   .then(() => {
      console.info(chalk.greenBright('应用程序已退出'))
      writeLog('应用程序已退出', 'INFO').then(() => process.exit(0))
   })
   .catch(error => {
      console.error(chalk.redBright('应用程序出错'), error)
      writeLog(`应用程序出错: ${error}`, 'ERROR').then(() => process.exit(-1))
   })
