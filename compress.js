import chalk from 'chalk'
import { postJSON } from './util.js'

export const compressMemory = async (apiKey, chatLog) => {
   let chatLogText = ''
   for (const log of chatLog) {
      chatLogText += `${log.name}: ${log.content}\n`
   }

   console.info(chalk.blueBright('正在压缩记忆，这可能会花费一些时间'))
   const resp = await postJSON(
      'https://api.minimax.chat/v1/text/chatcompletion_v2',
      {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${apiKey}`
      },
      {
         // 便宜量大管饱的模型，并且支持巨大的上下文，缺点是不能用于角色扮演
         model: 'abab6.5s-chat',
         messages: [
            {
               role: 'system',
               name: '记忆压缩',
               content: '用户输入一段对话记录，对其进行归纳，生成 300 字左右的片段，将其输出在一行中'
            },
            {
               role: 'user',
               name: '用户',
               content: chatLogText
            }
         ]
      }
   )

   if (resp.base_resp.status_code !== 0) {
      console.error(chalk.redBright(chalk.bold('记忆压缩失败, API 错误: ') + `(${resp.base_resp.status_code}) ${resp.base_resp.status_msg}`))
      return undefined
   }

   return resp.choices[0].message
}
