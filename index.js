import { readFile, readdir, writeFile } from 'fs/promises'
import enquirer from 'enquirer'
import chalk from 'chalk'
import fetch from 'node-fetch'

const { prompt } = enquirer

const systemLog = []
const chatLog = []

const timestamp = Date.now() - 0
const logFile = `./logs/${timestamp}.log`
const jsonLogFile = `./logs/${timestamp}.json`

const defaultModel = 'abab6.5t-chat'

const listdir = async (path, ext) => {
   const files = await readdir(path)
   return files.filter(file => file.endsWith(`.${ext}`))
}

const writeLog = async (message, level) => {
   const currentTimeSeconds = Math.round((new Date() - 0) / 1000.0)
   await writeFile(
      logFile,
      `${currentTimeSeconds} ${level ?? 'INFO'} ${message}\n`,
      { flag: 'a' }
   )
}

const postJSON = async (url, headers, payload) => fetch(url, {
   method: 'POST',
   headers: headers,
   body: JSON.stringify(payload)
}).then(resp => resp.json())

const removeLastConsoleLine = () => {
   process.stdout.moveCursor(0, -1)
   process.stdout.clearLine()
}

const applicationStart = async () => {
   // 读取 API-Key
   const apiKey = JSON.parse(await readFile('./apiKey.json', 'utf-8'))

   // 读取角色和自设信息
   const characters = await listdir('./characters', 'json')
   const selfSettings = await listdir('./self', 'json')

   if (characters.length == 0) {
      console.warn(chalk.yellowBright('没有可用的角色配置文件'))
      return
   }

   // 自设信息不是必须的
   if (selfSettings.length == 0) {
      console.warn(chalk.yellowBright('没有可用的自身配置文件'))
   }

   // 选择要对话的角色
   const characterFile = characters.length === 1 ? characters[0] : (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个角色',
      choices: characters
   })).value
   const character = JSON.parse(await readFile(`./characters/${characterFile}`, 'utf-8'))
   await writeLog(`选择了角色: ${characterFile}`, 'INFO')

   // 如果角色使用了 fine tune 过的模型则使用该模型
   const model = character.model ?? defaultModel
   if (model !== defaultModel) {
      console.info(chalk.greenBright(`提示: 角色拥有微调模型: ${model}`))
      await writeLog(`角色拥有微调模型: ${model}`, 'INFO')
   }

   // 在系统级提示中记录角色的设置
   systemLog.push({
      role: 'system',
      name: character.name,
      content: character.settings + (character.hiddenSettings ?? '')
   })

   // 如果至少有一个自设文件，则要求选择一个自设
   const selfFile = characters.length === 0 ? undefined : (await prompt({
      type: 'select',
      name: 'value',
      message: '选择一个自设',
      choices: [...selfSettings, '无']
   })).value
   const self = selfFile !== '无' ? JSON.parse(await readFile(`./self/${selfFile}`, 'utf-8')) : undefined
   if (self) {
      await writeLog(`选择了自设: ${selfFile}`, 'INFO')
      systemLog.push({
         role: 'user_system',
         name: self.name,
         content: self.settings
      })
   }
   else {
      await writeLog('没有选择自设', 'INFO')
      systemLog.push({
         role: 'user_system',
         name: '用户',
         content: ''
      })
   }
   const selfName = self ? self.name : '用户'

   // 固定添加旁白角色
   systemLog.push({
      role: 'system',
      name: '旁白',
      content: '会客观总结当前情形的旁白'
   })

   // 添加开场白到对话记录中
   chatLog.push({
      role: 'assistant',
      name: character.name,
      content: character.openingDialogue
   })
   writeLog(`${character.name} (开场白): ${character.openingDialogue}`, 'CHAT')
   console.info(chalk.bold(`${character.name} (开场白): `) + chalk.gray(character.openingDialogue))

   while (true) {
      let commentatorMode = false
      const input = await prompt({
         type: 'text',
         name: 'value',
         message: () => commentatorMode ? '旁白' : selfName,
         format: value => {
            commentatorMode = value.trim().startsWith('/')
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

      if (input.value === undefined) {
         break
      }

      const command = input.value.trim()
      if (command === 'exit' || command === 'quit') {
         break
      }

      if (command === 'log') {
         console.info(chatLog)
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
         const resp = await postJSON(
            'https://api.minimax.chat/v1/text/chatcompletion_v2',
            {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${apiKey}`
            },
            { model, messages: [ ...systemLog, ...chatLog ], n: 3 }
         )
         if (resp.base_resp.status_code !== 0) {
            console.error(chalk.redBright(chalk.bold('API 错误: ') + `(${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`))
            await writeLog(`API 错误: (${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`, 'ERROR')
            continue
         }

         const choices = resp.choices.map((choice, idx) => ({ name: choice.message.content, value: idx }))
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
         continue
      }

      if (command === '~') {
         // 什么都不做，跳过此轮用户输入
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

      const message = resp.choices[0].message.content
      console.info(chalk.bold(`${character.name}: `) + message)
      await writeLog(`${character.name}: ${message}`, 'CHAT')
      chatLog.push({ role: 'assistant', name: character.name, content: message })
   }
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
