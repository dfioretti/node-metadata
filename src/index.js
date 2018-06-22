import AppClient from './app-client'
import CsvParser from './csv-parser'
const _ = require('underscore')

async function walkTree(folderId, meta, client) {
  const ret = await client.folders.getItems(folderId, { fields: 'path_collection,name', offset: 0, limit: 1000 })
  ret.entries.forEach(async (e) => {
    if (e.type === 'file') {
      if(_.has(meta, e.name)) {
        const fileMap = meta[e.name]
        const updates = [
          { op: 'add', path: '/project', value: fileMap['project'] },
          { op: 'add', path: '/accountingPeriodMonth', value: fileMap['accountingPeriodMonth'] },
          { op: 'add', path: '/accountingPeriodYear', value: fileMap['accountingPeriodYear'] },
          { op: 'add', path: '/costReportType', value: fileMap['costReportType'] },
          { op: 'add', path: '/description', value: fileMap['description'] }
        ]
        try {
          await client.files.updateMetadata(e.id, 'enterprise', 'costReports', updates)
          console.log('good', e.name)
        } catch (er) {
          console.log('e', er.message, e.id, e.name)
        }
      } else {
        console.log('skip')
      }
    } else {
      await walkTree(e.id, meta, client)
    }
  })
}

const csv = new CsvParser("/Users/fioretti/Desktop/2016.csv")
const data2018 = csv.processCsv()
const meta = {}
Promise.resolve(AppClient.getClient()).then(function(client) {
    Promise.resolve(data2018).then(async function(d) {
      await d.forEach(async (m) => {
        const fn = m['fileName']
        delete m['fileName']
        meta[fn] = m
      })
      await walkTree('50515584964', meta, client)
    })
  }
)

