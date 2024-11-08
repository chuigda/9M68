import { readFile, writeFile } from 'fs/promises'
import chalk from 'chalk'
import { compressMemory } from './compress.js'

const applicationStart = async () => {
   if (process.argv.length < 3) {
      console.error(chalk.redBright('Usage: node manualCompress.js json-file'))
      process.exit(1)
   }

   const apiKey = JSON.parse(await readFile('apikey.json', 'utf-8'))
   const chatLog = JSON.parse(await readFile(process.argv[2], 'utf-8')).chatLog

   await compressMemory(apiKey, chatLog)
}

applicationStart()
   .then(() => console.info(chalk.greenBright('记忆已压缩完成')))
   .catch(err => console.error(err))
