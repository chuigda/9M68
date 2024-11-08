import { readdir } from 'fs/promises'
import fetch from 'node-fetch'

export const listdir = async (path, ext) => {
   const files = await readdir(path)
   return files.filter(file => file.endsWith(`.${ext}`))
}

export const postJSON = async (url, headers, payload) => fetch(url, {
   method: 'POST',
   headers: headers,
   body: JSON.stringify(payload)
}).then(resp => resp.json())
