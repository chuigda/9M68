import { readFile, readdir, writeFile } from 'fs/promises'
import chalk from 'chalk'
import { time } from 'console'

const applicationStart = async () => {
   const timestamp = Date.now() - 0
   const logFile = `./logs/${timestamp}.log`
}

applicationStart()
   .then(() => {
      console.info(chalk.greenBright('应用程序已退出'))
      process.exit(0)
   })